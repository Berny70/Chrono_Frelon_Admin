// ── pages/vigiechrono.js — Bornes VigieChrono ────────────────
// Dépend de : config.js, db.js, auth.js, ui.js, vc_calc.js
//
// Étape 1 du module VigieChrono dans ChassNid :
//   - « Relever une borne » : lecture de resultats.csv (clé USB de la
//     borne, choisi dans le sélecteur de fichiers du téléphone), choix ou
//     création du lieu, envoi dans Supabase ;
//   - liste des lieux (tous les pilotes, comme les signalements VigieNid) ;
//   - fonction « Chrono » : temps d'absence de chaque frelon marqué et
//     distance probable du nid.

const VigieChrono = (() => {

  const PARAMS_KEY = 'vc_chrono_params';
  const DEFAUTS = { vitesse: 3.5, tNid: 50, ecartPct: 30 };
  const COULEURS = { rouge: '#c0392b', vert: '#2e7d32', bleu: '#1565c0' };
  const NOMS_EVT = {
    arrivee: ['arrivée', 'arrivées'], depart: ['départ', 'départs'], retour: ['retour', 'retours'],
    abandon: ['abandon', 'abandons'], nuit: ['nuit', 'nuits'], jour: ['jour', 'jours'],
    position: ['position', 'positions'], bilan: ['bilan', 'bilans'],
  };
  const pl = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

  let _sites = [];
  let _charge = false;
  let _lecture = null;        // CSV lu, en attente d'import
  let _siteOuvert = null;     // lieu affiché dans la vue Chrono
  let _events = [];

  // ── OUTILS ─────────────────────────────────────────────────

  const esc = s => String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function dateFr(iso, avecHeure = false) {
    if (!iso) return '—';
    const d = new Date(iso);
    return avecHeure
      ? d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('fr-FR');
  }

  function minSec(s) {
    if (s == null) return '—';
    const m = Math.floor(s / 60), r = Math.round(s % 60);
    return `${m} min ${String(r).padStart(2, '0')}`;
  }

  // distance en mètres entre deux points GPS
  function distanceM(a, b) {
    const R = 6371000, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function lireParams() {
    try { return { ...DEFAUTS, ...JSON.parse(localStorage.getItem(PARAMS_KEY) || '{}') }; }
    catch { return { ...DEFAUTS }; }
  }

  function ecrireParams(p) {
    try { localStorage.setItem(PARAMS_KEY, JSON.stringify(p)); } catch { /* sans importance */ }
  }

  // ── CHARGEMENT ET LISTE DES LIEUX ──────────────────────────

  async function load(force = false) {
    if (_charge && !force) return;
    const list = document.getElementById('vc-sites-list');
    list.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const r = await dbVcSites();
    if (r.error) {
      list.innerHTML = `<p class="form-hint" style="padding:20px">Impossible de charger les bornes : ${esc(r.error.message)}</p>`;
      return;
    }
    _sites = r.sites;
    _charge = true;
    renderSites();
  }

  function renderSites() {
    const list = document.getElementById('vc-sites-list');
    const annee = document.getElementById('vc-year-filter').value;
    const sites = _sites.filter(s => annee === 'all' || String(s.annee) === annee);
    _remplirAnnees();
    if (!sites.length) {
      list.innerHTML = `<p class="form-hint" style="padding:20px">Aucune borne relevée${annee === 'all' ? '' : ' en ' + esc(annee)}. Branchez votre téléphone sur une borne, puis « Relever une borne ».</p>`;
      return;
    }
    list.innerHTML = sites.map(s => `
      <div class="list-item vc-site">
        <div class="vc-site-icon">⏱</div>
        <div style="flex:1;min-width:0">
          <div class="vc-site-nom">${esc(s.nom || 'Lieu sans nom')} <span class="vc-chip">${esc(s.annee)}</span></div>
          <div class="vc-site-ligne">Borne ${esc(s.borne)} · 👤 ${esc(s.pilot_nom || '—')}</div>
          <div class="vc-site-ligne">${s.dernier_releve
            ? `${pl(s.nb_retours, 'retour chronométré', 'retours chronométrés')} · ${pl(s.nb_arrivees, 'arrivée', 'arrivées')} de frelon · relevé le ${dateFr(s.dernier_releve)}`
            : 'Pas encore relevée'}</div>
        </div>
        <div class="vc-site-actions">
          <button class="vc-btn" data-vc-open="${esc(s.id)}">Chrono</button>
          ${s.editable ? `<button class="vc-btn vc-btn--danger" data-vc-delete="${esc(s.id)}" title="Supprimer ce lieu et ses relevés">🗑</button>` : ''}
        </div>
      </div>`).join('');
  }

  function _remplirAnnees() {
    const sel = document.getElementById('vc-year-filter');
    const courant = sel.value;
    const annees = [...new Set(_sites.map(s => s.annee))].sort((a, b) => b - a);
    sel.innerHTML = '<option value="all">Toutes années</option>' +
      annees.map(a => `<option value="${a}">${a}</option>`).join('');
    sel.value = [...sel.options].some(o => o.value === courant) ? courant : 'all';
  }

  async function _supprimer(id) {
    const s = _sites.find(x => x.id === id);
    showModal('Supprimer ce lieu ?',
      `<strong>${esc(s?.nom || 'Lieu sans nom')}</strong> (borne ${esc(s?.borne)}, ${esc(s?.annee)}) et tous ses relevés seront supprimés.`,
      'Supprimer', async () => {
        const r = await dbVcSiteDelete(id);
        if (r.error) { showToast('Erreur : ' + r.error.message); return; }
        showToast('Lieu supprimé.');
        await load(true);
      });
  }

  // ── RELEVER UNE BORNE ──────────────────────────────────────

  async function _fichierChoisi(e) {
    const f = e.target.files?.[0];
    e.target.value = '';                    // pour pouvoir rechoisir le même fichier
    if (!f) return;
    const contenu = await f.text();
    const lu = VcCalc.parseCsv(contenu);
    if (lu.erreur) { showToast(lu.erreur, 6000); return; }
    if (!lu.rows.length) { showToast('Le fichier ne contient aucune ligne de résultats.', 5000); return; }
    _lecture = lu;
    if (!_charge) await load();
    _ouvrirImport(f.name);
  }

  function _ouvrirImport(nomFichier) {
    const r = _lecture.resume;
    const pos = r.position;
    const evts = Object.entries(r.parEvenement)
      .map(([k, n]) => esc(pl(n, ...(NOMS_EVT[k] || [k, k])))).join(' · ');
    document.getElementById('vc-import-resume').innerHTML = `
      <div class="vc-resume">
        <div><strong>${esc(nomFichier)}</strong> : ${r.nbLignes} lignes</div>
        <div>${evts}</div>
        <div>Du ${dateFr(r.debut, true)} au ${dateFr(r.fin, true)}</div>
        ${pos ? `<div>Position de la borne : ${pos.lat.toFixed(5)}, ${pos.lon.toFixed(5)}${pos.nom ? ' — ' + esc(pos.nom) : ''}</div>`
              : '<div class="vc-alerte">Pas de position dans le fichier (POSITION.txt absent) : indiquez-la ci-dessous.</div>'}
        ${r.sansHeure ? `<div class="vc-alerte">${pl(r.sansHeure, 'ligne', 'lignes')} sans heure (borne pas encore mise à l'heure) : ${r.sansHeure > 1 ? 'importées' : 'importée'} sans date.</div>` : ''}
        ${_lecture.rejetees.length ? `<div class="vc-alerte">${_lecture.rejetees.length} ligne${_lecture.rejetees.length > 1 ? 's' : ''} illisible${_lecture.rejetees.length > 1 ? 's' : ''} ignorée${_lecture.rejetees.length > 1 ? 's' : ''}.</div>` : ''}
      </div>`;

    // Lieux où ce pilote peut importer ; le plus proche de la position du CSV d'abord
    const annee = r.fin ? new Date(r.fin).getFullYear() : new Date().getFullYear();
    const candidats = _sites.filter(s => s.editable)
      .map(s => ({ ...s, ecart: pos && s.lat != null ? distanceM(pos, s) : null }))
      .sort((a, b) => (a.ecart ?? 1e12) - (b.ecart ?? 1e12));
    const proche = candidats.find(s => s.annee === annee && s.ecart != null && s.ecart < 200);

    const sel = document.getElementById('vc-import-site');
    sel.innerHTML = '<option value="new">➕ Nouveau lieu</option>' + candidats.map(s =>
      `<option value="${esc(s.id)}">${esc(s.nom || 'Lieu sans nom')} · borne ${esc(s.borne)} · ${s.annee}${s.ecart != null ? ' · à ' + (s.ecart < 1000 ? Math.round(s.ecart) + ' m' : (s.ecart / 1000).toFixed(1) + ' km') : ''}</option>`
    ).join('');
    sel.value = proche ? proche.id : 'new';

    document.getElementById('vc-new-nom').value = pos?.nom || '';
    document.getElementById('vc-new-borne').value = '';
    document.getElementById('vc-new-lat').value = pos ? pos.lat.toFixed(6) : '';
    document.getElementById('vc-new-lon').value = pos ? pos.lon.toFixed(6) : '';
    document.getElementById('vc-new-annee').value = annee;
    document.getElementById('vc-import-msg').className = 'auth-message';
    document.getElementById('vc-import-msg').textContent = '';
    _majNouveauLieu();
    showOverlay('overlay-vc-import');
  }

  function _majNouveauLieu() {
    const nouveau = document.getElementById('vc-import-site').value === 'new';
    document.getElementById('vc-new-site').style.display = nouveau ? '' : 'none';
  }

  function _positionTelephone() {
    if (!navigator.geolocation) { showToast('Position du téléphone indisponible.'); return; }
    navigator.geolocation.getCurrentPosition(p => {
      document.getElementById('vc-new-lat').value = p.coords.latitude.toFixed(6);
      document.getElementById('vc-new-lon').value = p.coords.longitude.toFixed(6);
    }, () => showToast('Position du téléphone refusée ou indisponible.'),
    { enableHighAccuracy: true, timeout: 15000 });
  }

  async function _importer() {
    const btn = document.getElementById('btn-vc-import');
    const msg = t => showAuthMsg('vc-import-msg', 'error', t);
    let siteId = document.getElementById('vc-import-site').value;
    btn.disabled = true;
    try {
      if (siteId === 'new') {
        const borne = document.getElementById('vc-new-borne').value.trim();
        const nom   = document.getElementById('vc-new-nom').value.trim();
        const lat   = parseFloat(document.getElementById('vc-new-lat').value.replace(',', '.'));
        const lon   = parseFloat(document.getElementById('vc-new-lon').value.replace(',', '.'));
        const annee = parseInt(document.getElementById('vc-new-annee').value, 10);
        if (!borne) return msg('Indiquez le numéro de la borne (étiquette sur la borne).');
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
          return msg('Position invalide : latitude et longitude en degrés décimaux.');
        if (!(annee > 2020 && annee < 2100)) return msg('Année invalide.');
        const r = await dbVcSiteCreate({ borne, nom, lat, lon, annee });
        if (r.error) return msg(r.error.message);
        siteId = r.id;
      }
      const r = await dbVcImport(siteId, _lecture.rows);
      if (r.error) return msg(r.error.message);
      hideOverlay('overlay-vc-import');
      const deja = r.recues - r.ajoutees;
      showToast(`${r.ajoutees} ligne${r.ajoutees > 1 ? 's' : ''} ajoutée${r.ajoutees > 1 ? 's' : ''}` +
                (deja ? ` (${deja} déjà relevée${deja > 1 ? 's' : ''})` : '') + '.', 5000);
      _lecture = null;
      await load(true);
    } finally {
      btn.disabled = false;
    }
  }

  // ── VUE CHRONO ─────────────────────────────────────────────

  async function _ouvrirChrono(id) {
    _siteOuvert = _sites.find(s => s.id === id);
    if (!_siteOuvert) return;
    document.getElementById('vc-liste').style.display = 'none';
    const vue = document.getElementById('vc-chrono');
    vue.style.display = '';
    document.getElementById('vc-chrono-titre').textContent =
      `${_siteOuvert.nom || 'Lieu sans nom'} · ${_siteOuvert.annee}`;
    document.getElementById('vc-chrono-sous-titre').textContent =
      `Borne ${_siteOuvert.borne} · ${_siteOuvert.pilot_nom || ''}`;
    const p = lireParams();
    document.getElementById('vc-p-vitesse').value = p.vitesse;
    document.getElementById('vc-p-tnid').value = p.tNid;
    document.getElementById('vc-p-ecart').value = p.ecartPct;
    const zone = document.getElementById('vc-chrono-resultats');
    zone.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const r = await dbVcEvents(id);
    if (r.error) { zone.innerHTML = `<p class="form-hint">Erreur : ${esc(r.error.message)}</p>`; return; }
    _events = r.events;
    renderChrono();
  }

  function _fermerChrono() {
    _siteOuvert = null;
    document.getElementById('vc-chrono').style.display = 'none';
    document.getElementById('vc-liste').style.display = '';
  }

  function _paramsSaisis() {
    const lire = (id, def) => {
      const v = parseFloat(document.getElementById(id).value.replace(',', '.'));
      return Number.isFinite(v) && v >= 0 ? v : def;
    };
    const p = {
      vitesse:  lire('vc-p-vitesse', DEFAUTS.vitesse) || DEFAUTS.vitesse,
      tNid:     lire('vc-p-tnid', DEFAUTS.tNid),
      ecartPct: lire('vc-p-ecart', DEFAUTS.ecartPct),
    };
    ecrireParams(p);
    return p;
  }

  function renderChrono() {
    const zone = document.getElementById('vc-chrono-resultats');
    const p = _paramsSaisis();
    const res = VcCalc.chrono(_events, p);
    if (!res.length) {
      zone.innerHTML = '<p class="form-hint" style="padding:12px 0">Aucun aller-retour chronométré pour ce lieu : il faut des frelons marqués d\'une pastille revenus au pot.</p>';
      return;
    }
    zone.innerHTML = res.map(c => `
      <div class="vc-carte">
        <div class="vc-carte-entete">
          <span class="vc-pastille" style="background:${COULEURS[c.couleur] || '#888'}"></span>
          <strong>Frelon ${esc(c.couleur)}</strong>
          <span class="vc-carte-n">${c.nbGardees} mesure${c.nbGardees > 1 ? 's' : ''} gardée${c.nbGardees > 1 ? 's' : ''} sur ${c.nbTotal}</span>
        </div>
        <div class="vc-distance">${c.distance != null
          ? `Nid probable à <strong>${c.distance} m</strong> ± ${c.marge} m`
          : esc(c.alerte || 'Pas assez de mesures')}</div>
        <div class="vc-carte-detail">Aller-retour retenu : ${minSec(c.T)} (médiane)</div>
        ${_graphe(c, p)}
      </div>`).join('') + `
      <p class="form-hint vc-note">Distance = vitesse × (temps d'absence − temps au nid) ÷ 2. La marge vient de la fourchette donnée par la borne (elle ne photographie pas en continu). Chaque barre est un aller-retour, le trait noir sa fourchette ; la bande colorée et le pointillé montrent la médiane ± ${p.ecartPct} %. Les barres orange pâle sont écartées du calcul.</p>`;
  }

  // Bargraphe : une barre par aller-retour (de absence_min à absence_max), dans l'ordre des retours
  function _graphe(c, p) {
    const W = 640, H = 210, g = 44, d = 12, h0 = 14, b = 36;
    const n = c.mesures.length;
    const yMax = Math.max(...c.mesures.map(m => m.max), c.mediane * (1 + p.ecartPct / 100)) * 1.08;
    const pasMin = yMax / 60 > 40 ? 20 : yMax / 60 > 16 ? 10 : yMax / 60 > 8 ? 5 : yMax / 60 > 4 ? 2 : 1;
    const Y = s => H - b - (s / yMax) * (H - b - h0);
    const slot = (W - g - d) / n, larg = Math.max(3, Math.min(26, slot * 0.6));
    const X = i => g + slot * (i + 0.5);
    const coul = COULEURS[c.couleur] || '#888';
    const graduations = [];
    for (let m = 0; m * 60 <= yMax; m += pasMin) graduations.push(m);
    const etiquettes = c.mesures.map((m, i) => ({ m, i }))
      .filter(({ i }) => n <= 8 || i % Math.ceil(n / 8) === 0 || i === n - 1);
    const bas = c.mediane * (1 - p.ecartPct / 100), haut = c.mediane * (1 + p.ecartPct / 100);
    return `
      <svg class="vc-graphe" viewBox="0 0 ${W} ${H}" role="img" aria-label="Temps d'absence du frelon ${esc(c.couleur)}, en minutes">
        <rect x="${g}" y="${Y(haut)}" width="${W - g - d}" height="${Math.max(0, Y(bas) - Y(haut))}" fill="${coul}" fill-opacity="0.08"/>
        ${graduations.map(m => `
          <line x1="${g}" x2="${W - d}" y1="${Y(m * 60)}" y2="${Y(m * 60)}" stroke="rgba(15,31,15,0.08)"/>
          <text x="${g - 6}" y="${Y(m * 60) + 4}" text-anchor="end" font-size="11" fill="#6b6b55">${m}</text>`).join('')}
        <text x="${g - 6}" y="${h0 - 2}" text-anchor="end" font-size="11" fill="#6b6b55">min</text>
        <line x1="${g}" x2="${W - d}" y1="${Y(c.mediane)}" y2="${Y(c.mediane)}" stroke="${coul}" stroke-dasharray="5 4"/>
        ${c.mesures.map((m, i) => `
          <g>
            <title>${esc(m.heure ? dateFr(m.heure, true) : m.heure_brute)} : entre ${minSec(m.min)} et ${minSec(m.max)}${m.garde ? '' : ' (écartée)'}</title>
            <rect x="${X(i) - larg / 2}" y="${Y(m.milieu)}" width="${larg}" height="${Math.max(1, Y(0) - Y(m.milieu))}" rx="2"
              fill="${m.garde ? coul : '#e8a33a'}" fill-opacity="${m.garde ? 0.8 : 0.45}"/>
            <path d="M${X(i)} ${Y(m.max)}V${Y(m.min)}M${X(i) - larg / 4} ${Y(m.max)}h${larg / 2}M${X(i) - larg / 4} ${Y(m.min)}h${larg / 2}"
              stroke="#1a1a14" stroke-width="1.2" fill="none"/>
          </g>`).join('')}
        ${etiquettes.map(({ m, i }) => `
          <text x="${X(i)}" y="${H - b + 16}" text-anchor="middle" font-size="10.5" fill="#6b6b55">${esc(m.heure ? dateFr(m.heure, true) : '#' + (i + 1))}</text>`).join('')}
      </svg>`;
  }

  // ── INITIALISATION ─────────────────────────────────────────

  function init() {
    document.getElementById('btn-vc-releve')?.addEventListener('click', () =>
      document.getElementById('vc-file').click());
    document.getElementById('vc-file')?.addEventListener('change', _fichierChoisi);
    document.getElementById('vc-year-filter')?.addEventListener('change', renderSites);
    document.getElementById('vc-import-site')?.addEventListener('change', _majNouveauLieu);
    document.getElementById('btn-vc-gps')?.addEventListener('click', _positionTelephone);
    document.getElementById('btn-vc-import')?.addEventListener('click', _importer);
    document.getElementById('btn-vc-retour')?.addEventListener('click', _fermerChrono);
    ['vc-p-vitesse', 'vc-p-tnid', 'vc-p-ecart'].forEach(id =>
      document.getElementById(id)?.addEventListener('input', () => { if (_siteOuvert) renderChrono(); }));
    document.getElementById('btn-vc-defauts')?.addEventListener('click', () => {
      document.getElementById('vc-p-vitesse').value = DEFAUTS.vitesse;
      document.getElementById('vc-p-tnid').value = DEFAUTS.tNid;
      document.getElementById('vc-p-ecart').value = DEFAUTS.ecartPct;
      if (_siteOuvert) renderChrono();
    });
    document.getElementById('vc-sites-list')?.addEventListener('click', e => {
      const o = e.target.closest('[data-vc-open]');
      if (o) { _ouvrirChrono(o.dataset.vcOpen); return; }
      const d = e.target.closest('[data-vc-delete]');
      if (d) _supprimer(d.dataset.vcDelete);
    });
    // chargement au premier affichage de l'onglet
    document.querySelector('.nav-tab[data-tab="vigiechrono"]')?.addEventListener('click', () => load());
  }

  return { init, load };
})();
