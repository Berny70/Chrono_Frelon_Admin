// ── vc_calc.js — VigieChrono : lecture du CSV de la borne et calculs ──
// Aucune dépendance (utilisable aussi dans Node pour les tests).

const VcCalc = (() => {

  // ── LECTURE DE resultats.csv ────────────────────────────────
  // Format de la borne (sketch version 1) :
  //   numero;heure;evenement;couleur;absence_min_s;absence_max_s;detail;lat;lon
  // La version 0 n'a pas les colonnes lat;lon : elles sont alors vides.

  const RE_HEURE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

  // Heure du CSV (heure locale de la borne) → ISO, ou null si la borne
  // n'était pas à l'heure (« J2 14:05:31 ») ou si la case est vide.
  function heureIso(txt) {
    const m = RE_HEURE.exec((txt || '').trim());
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return isNaN(d) ? null : d.toISOString();
  }

  function nombre(txt) {
    const t = (txt ?? '').trim().replace(',', '.');
    if (t === '' || t === '-') return null;
    const v = Number(t);
    return Number.isFinite(v) ? v : null;
  }

  function texte(txt) {
    const t = (txt ?? '').trim();
    return t === '' || t === '-' ? null : t;
  }

  function parseCsv(contenu) {
    const lignes = String(contenu || '').replace(/^﻿/, '').split(/\r?\n/);
    const iEntete = lignes.findIndex(l => l.trim().toLowerCase().startsWith('numero;'));
    if (iEntete < 0) {
      return { erreur: "Ce fichier n'est pas un resultats.csv de borne VigieChrono (en-tête « numero;heure;evenement… » introuvable)." };
    }
    const cols = lignes[iEntete].trim().toLowerCase().split(';');
    const idx = n => cols.indexOf(n);
    const avecPosition = idx('lat') >= 0 && idx('lon') >= 0;
    const nbCols = cols.length;

    const rows = [], rejetees = [];
    for (let i = iEntete + 1; i < lignes.length; i++) {
      const brut = lignes[i].trim();
      if (!brut) continue;
      if (brut.toLowerCase().startsWith('numero;')) continue;     // en-tête répété
      let f = brut.split(';');
      if (f.length < 6) { rejetees.push(i + 1); continue; }
      // un point-virgule égaré dans le détail : on le recolle
      if (f.length > nbCols && idx('detail') >= 0) {
        const d = idx('detail'), surplus = f.length - nbCols;
        f = [...f.slice(0, d), f.slice(d, d + surplus + 1).join(','), ...f.slice(d + surplus + 1)];
      }
      const get = n => (idx(n) >= 0 ? f[idx(n)] : '');
      const evenement = texte(get('evenement'));
      if (!evenement) { rejetees.push(i + 1); continue; }
      rows.push({
        numero:        nombre(get('numero')),
        heure:         heureIso(get('heure')),
        heure_brute:   (get('heure') || '').trim(),
        evenement:     evenement.toLowerCase(),
        couleur:       texte(get('couleur')),
        absence_min_s: nombre(get('absence_min_s')),
        absence_max_s: nombre(get('absence_max_s')),
        detail:        texte(get('detail')),
        lat:           avecPosition ? nombre(get('lat')) : null,
        lon:           avecPosition ? nombre(get('lon')) : null,
      });
    }
    return { rows, rejetees, avecPosition, resume: resumer(rows) };
  }

  // Chiffres affichés avant l'import
  function resumer(rows) {
    const parEvenement = {};
    rows.forEach(r => { parEvenement[r.evenement] = (parEvenement[r.evenement] || 0) + 1; });
    const heures = rows.map(r => r.heure).filter(Boolean).sort();
    const sansHeure = rows.filter(r => !r.heure).length;
    // position : la dernière ligne « position », sinon la dernière ligne qui en porte une
    const pos = [...rows].reverse().find(r => r.evenement === 'position' && r.lat != null)
             || [...rows].reverse().find(r => r.lat != null && r.lon != null);
    const couleurs = [...new Set(rows.filter(r => r.evenement === 'retour' && r.couleur).map(r => r.couleur))];
    return {
      nbLignes: rows.length,
      parEvenement,
      debut: heures[0] || null,
      fin: heures[heures.length - 1] || null,
      sansHeure,
      position: pos ? { lat: pos.lat, lon: pos.lon, nom: pos.evenement === 'position' ? pos.detail : null } : null,
      couleurs,
    };
  }

  // ── CHRONO : distance probable du nid ───────────────────────
  //   d = v × (T − t_nid) / 2
  // T = médiane des temps d'absence gardés (milieu de la fourchette
  // absence_min_s – absence_max_s donnée par la borne).
  // Une mesure est écartée si elle s'éloigne de plus de X % de la
  // médiane de toutes les mesures du frelon.

  function mediane(vals) {
    const v = vals.filter(x => Number.isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }

  function arrondir(v, pas) { return Math.round(v / pas) * pas; }

  // events : lignes de la base ou du CSV ; params : { vitesse (m/s), tNid (s), ecartPct (%) }
  function chrono(events, params) {
    const v = params.vitesse, tNid = params.tNid, x = params.ecartPct / 100;
    const parCouleur = {};
    events
      .filter(e => e.evenement === 'retour' && e.couleur
                && Number.isFinite(e.absence_min_s) && Number.isFinite(e.absence_max_s))
      .forEach(e => (parCouleur[e.couleur] = parCouleur[e.couleur] || []).push(e));

    return Object.entries(parCouleur).map(([couleur, liste]) => {
      liste.sort((a, b) => String(a.heure || a.heure_brute).localeCompare(String(b.heure || b.heure_brute))
                        || (a.numero || 0) - (b.numero || 0));
      const mesures = liste.map(e => ({
        heure: e.heure, heure_brute: e.heure_brute,
        min: e.absence_min_s, max: e.absence_max_s,
        milieu: (e.absence_min_s + e.absence_max_s) / 2,
      }));
      const medTout = mediane(mesures.map(m => m.milieu));
      mesures.forEach(m => { m.garde = Math.abs(m.milieu - medTout) <= x * medTout; });
      const gardees = mesures.filter(m => m.garde);

      const T    = mediane(gardees.map(m => m.milieu));
      const Tmin = mediane(gardees.map(m => m.min));
      const Tmax = mediane(gardees.map(m => m.max));
      let distance = null, marge = null, alerte = null;
      if (T != null) {
        const d   = v * (T - tNid) / 2;
        const dLo = v * (Tmin - tNid) / 2;
        const dHi = v * (Tmax - tNid) / 2;
        if (d <= 0) {
          alerte = "Absence plus courte que le temps au nid : vérifier les réglages.";
        } else {
          distance = arrondir(d, 5);
          marge = Math.max(5, arrondir(Math.max(d - dLo, dHi - d), 5));
        }
      }
      return {
        couleur, mesures, mediane: medTout, T,
        nbGardees: gardees.length, nbTotal: mesures.length,
        distance, marge, alerte,
      };
    }).sort((a, b) => a.couleur.localeCompare(b.couleur));
  }

  return { parseCsv, resumer, chrono, mediane, heureIso };
})();

if (typeof module !== 'undefined') module.exports = VcCalc;
