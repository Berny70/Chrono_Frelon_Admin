// ── pages/bilan.js — Bilan d'efficacité VigieNid ──────────────
// Confronte les directions de vol signalées et les nids trouvés :
// indice par année, note 0–100 par carré de 1 km, réglages.
// Les calculs sont dans bilan_calc.js ; les données sont celles déjà
// chargées par le tableau de bord (même rayon que la carte).

const Bilan = (() => {

  const CLE_PARAMS = 'bilan_params';
  let _annee = null;      // année affichée dans la liste des carrés
  let _derniere = null;   // dernière évaluation (pour le bouton « Voir »)

  function params() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem(CLE_PARAMS) || '{}') || {}; } catch { p = {}; }
    return Object.assign({}, BilanCalc.DEFAUTS, p);
  }

  function _enregistrer(p) {
    try { localStorage.setItem(CLE_PARAMS, JSON.stringify(p)); } catch { /* sans importance */ }
  }

  function _evaluer() {
    const d = Dashboard.getBilanData();
    return BilanCalc.evaluer(d.signals, d.nests, params(), {
      bloques: d.bloques,
      longueurDefaut: d.longueurDefaut,
    });
  }

  function _fmt(v, suffixe = ' %') { return v == null ? '—' : v + suffixe; }

  function _pastille(note) {
    return `<span class="bl-note" style="background:${BilanCalc.couleurNote(note)}">${note == null ? '–' : note}</span>`;
  }

  // ── RENDU ──────────────────────────────────────────────────

  function render() {
    const zone = document.getElementById('bilan-contenu');
    if (!zone) return;
    const ev = _evaluer();
    _derniere = ev;
    const ans = BilanCalc.annees(ev);

    if (!ans.length) {
      zone.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div>
        <p>Pas encore de signalement ni de nid dans le rayon affiché.</p></div>`;
      return;
    }

    if (_annee == null || !ans.some(a => a.annee === _annee)) _annee = ans[0].annee;
    const sel = document.getElementById('bilan-annee');
    sel.innerHTML = ans.map(a => `<option value="${a.annee}"${a.annee === _annee ? ' selected' : ''}>${a.annee}</option>`).join('');

    const a = ans.find(x => x.annee === _annee);
    const p = ev.params;
    const zs = BilanCalc.zones(ev, { annee: _annee });
    const notees = zs.filter(z => z.note != null);
    const autres = zs.filter(z => z.note == null && (z.justes + z.faux + z.attente + z.nids) > 0);

    zone.innerHTML = `
      <div class="bl-cartes">
        <div class="bl-carte bl-carte--indice">
          <div class="bl-chiffre">${_fmt(a.indice, '')}<small>/100</small></div>
          <div class="bl-libelle">Indice ${a.annee}</div>
        </div>
        <div class="bl-carte">
          <div class="bl-chiffre">${_fmt(a.precision)}</div>
          <div class="bl-libelle">Précision<br><small>${a.justes} signalement${a.justes > 1 ? 's' : ''} juste${a.justes > 1 ? 's' : ''} sur ${a.justes + a.faux}</small></div>
        </div>
        <div class="bl-carte">
          <div class="bl-chiffre">${_fmt(a.detection)}</div>
          <div class="bl-libelle">Détection<br><small>${a.nidsSignales} nid${a.nidsSignales > 1 ? 's' : ''} signalé${a.nidsSignales > 1 ? 's' : ''} sur ${a.nids}</small></div>
        </div>
        <div class="bl-carte">
          <div class="bl-chiffre">${a.zonesNotees}</div>
          <div class="bl-libelle">Carrés notés<br><small>note moyenne ${_fmt(a.noteMoyenne, '')}</small></div>
        </div>
      </div>
      ${a.attente ? `<p class="bl-aide">⏳ ${a.attente} signalement${a.attente > 1 ? 's' : ''} de moins de ${p.delaiJours} jours sans nid trouvé pour l'instant : en attente, ils ne comptent pas encore.</p>` : ''}

      <h3 class="bl-titre">Comparaison des années</h3>
      <div class="bl-tableau-boite">
        <table class="bl-tableau">
          <thead><tr>
            <th>Année</th><th>Indice</th><th>Précision</th><th>Détection</th>
            <th>Signalements</th><th>Nids</th><th>Carrés notés</th>
          </tr></thead>
          <tbody>${ans.map(r => `
            <tr${r.annee === _annee ? ' class="bl-ligne-active"' : ''} data-annee="${r.annee}">
              <td><strong>${r.annee}</strong></td>
              <td>${_pastille(r.indice)}</td>
              <td>${_fmt(r.precision)}</td>
              <td>${_fmt(r.detection)}</td>
              <td>${r.signaux}<small> (${r.justes} ✓ · ${r.faux} ✗${r.attente ? ' · ' + r.attente + ' ⏳' : ''})</small></td>
              <td>${r.nids}<small> (${r.nidsSignales} signalés)</small></td>
              <td>${r.zonesNotees}${r.noteMoyenne != null ? '<small> · moy. ' + r.noteMoyenne + '</small>' : ''}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <h3 class="bl-titre">Carrés de 1 km notés en ${_annee}
        <button class="vc-btn bl-voir-tout" id="bilan-voir-carte">🗺 Voir sur la carte</button></h3>
      ${notees.length ? notees.map(_ligneZone).join('') :
        `<p class="bl-aide">Aucun carré n'a encore ${p.minSignaux} signalements jugés (justes ou faux).</p>`}
      ${autres.length ? `<details class="bl-autres"><summary>${autres.length} carré${autres.length > 1 ? 's' : ''} sans note (moins de ${p.minSignaux} signalements jugés)</summary>
        ${autres.map(_ligneZone).join('')}</details>` : ''}

      <details class="bl-autres bl-explication"><summary>Comment sont calculés ces chiffres ?</summary>
        <ul>
          <li>Un signalement est <strong>juste</strong> si un nid a été trouvé à moins de ${p.tolDeg}° de sa direction,
              pas plus loin que ${String(p.facteurDist).replace('.', ',')} fois la distance annoncée
              (ou la longueur de trait du pilote), et dans les ${p.delaiJours} jours qui suivent.</li>
          <li>Il est <strong>faux</strong> si aucun nid ne répond et que ce délai est passé ; sinon il est <strong>en attente</strong>.</li>
          <li><strong>Précision</strong> = signalements justes ÷ (justes + faux).
              <strong>Détection</strong> = nids trouvés qui avaient été signalés ÷ nids trouvés.
              <strong>Indice</strong> = moyenne des deux.</li>
          <li>Chaque signalement est rangé dans le carré de 1 km où il <em>pointe</em> (point présumé du nid) ;
              un nid dans le carré où il a été trouvé. <strong>Note du carré</strong> : 0 = aucun signalement
              n'a mené à un nid, 100 = tous ont mené à un nid.</li>
          <li>Les sentinelles bloquées ne comptent pas. Les données sont celles du rayon choisi sur la carte.</li>
        </ul>
      </details>`;

    zone.querySelectorAll('tr[data-annee]').forEach(tr =>
      tr.addEventListener('click', () => { _annee = parseInt(tr.dataset.annee, 10); render(); }));
    zone.querySelectorAll('[data-zone]').forEach(b =>
      b.addEventListener('click', () => _voir(b.dataset.zone)));
    document.getElementById('bilan-voir-carte')?.addEventListener('click', () => _voir(null));
  }

  function _ligneZone(z) {
    const juges = z.justes + z.faux;
    return `
      <div class="bl-zone">
        ${_pastille(z.note)}
        <div class="bl-zone-texte">
          <div class="bl-zone-nom">Carré ${z.centre[0].toFixed(3)} N, ${z.centre[1].toFixed(3)} E</div>
          <div class="bl-zone-ligne">${juges ? `${z.justes} juste${z.justes > 1 ? 's' : ''} sur ${juges}` : 'aucun signalement jugé'}${z.attente ? ` · ${z.attente} en attente` : ''}
            · ${z.nids ? `${z.nids} nid${z.nids > 1 ? 's' : ''} trouvé${z.nids > 1 ? 's' : ''} (${z.nidsSignales} signalé${z.nidsSignales > 1 ? 's' : ''})` : 'aucun nid trouvé'}</div>
        </div>
        <button class="vc-btn" data-zone="${z.id}" title="Voir ce carré sur la carte">🗺</button>
      </div>`;
  }

  function _voir(zoneId) {
    switchTab('map');
    if (typeof mapShowBilan === 'function') mapShowBilan(zoneId, _annee);
  }

  // ── RÉGLAGES ───────────────────────────────────────────────

  function _initReglages() {
    const p = params();
    const champs = { 'bilan-tol': 'tolDeg', 'bilan-facteur': 'facteurDist', 'bilan-delai': 'delaiJours', 'bilan-min': 'minSignaux' };
    Object.entries(champs).forEach(([id, cle]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = p[cle];
      el.addEventListener('change', () => {
        const v = parseFloat(String(el.value).replace(',', '.'));
        const q = params();
        if (Number.isFinite(v) && v > 0) q[cle] = v; else el.value = q[cle];
        _enregistrer(q);
        render();
        if (typeof mapRefreshBilan === 'function') mapRefreshBilan();
      });
    });
    document.getElementById('bilan-defauts')?.addEventListener('click', () => {
      _enregistrer({});
      Object.entries(champs).forEach(([id, cle]) => {
        const el = document.getElementById(id); if (el) el.value = BilanCalc.DEFAUTS[cle];
      });
      render();
      if (typeof mapRefreshBilan === 'function') mapRefreshBilan();
    });
  }

  function init() {
    _initReglages();
    document.querySelector('.nav-tab[data-tab="bilan"]')?.addEventListener('click', () => render());
    document.getElementById('bilan-annee')?.addEventListener('change', e => {
      _annee = parseInt(e.target.value, 10);
      render();
    });
  }

  return { init, render, params };
})();
