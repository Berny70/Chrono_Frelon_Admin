// ── bilan_calc.js — Bilan d'efficacité : directions de vol ↔ nids trouvés ──
// Aucune dépendance (utilisable aussi dans Node pour les tests).
//
// Principe
//  • Un signalement est JUSTE si un nid a été trouvé
//      - dans sa direction (écart d'angle ≤ tolérance),
//      - pas plus loin que « facteur × distance annoncée »,
//      - après le signalement et au plus « délai » jours après.
//  • Il est FAUX si aucun nid ne répond et que le délai est écoulé.
//  • Il est EN ATTENTE si le délai n'est pas encore écoulé (le nid peut
//    encore être trouvé) : il ne compte ni pour ni contre.
//  • Un nid est SIGNALÉ si au moins un signalement est juste pour lui.
//
// Zones : carrés fixes de 1 km (grille identique d'une année à l'autre).
// Un signalement appartient au carré où il « pointe » (point présumé du
// nid = départ + direction × distance) ; un nid au carré où il a été trouvé.
// Note d'un carré (0 à 100) = part des signalements jugés qui sont justes.

const BilanCalc = (() => {

  const DEFAUTS = { tolDeg: 10, facteurDist: 1.5, delaiJours: 60, minSignaux: 3 };
  const JOUR = 86400000;
  const R = 6371000;

  // Grille de 1 km : pas fixes, calés sur la latitude 46° (centre de la
  // France). Carrés de ~1 km de côté (± 5 % aux bords du pays), toujours
  // les mêmes, ce qui permet de comparer un carré d'une année à l'autre.
  const PAS_LAT = 1 / 111.32;
  const PAS_LON = 1 / (111.32 * Math.cos(46 * Math.PI / 180));

  function carreDe(lat, lon) {
    const iy = Math.floor(lat / PAS_LAT), ix = Math.floor(lon / PAS_LON);
    return { id: iy + '_' + ix, iy, ix };
  }
  function limitesCarre(iy, ix) {
    return [[iy * PAS_LAT, ix * PAS_LON], [(iy + 1) * PAS_LAT, (ix + 1) * PAS_LON]];
  }

  function distM(lat1, lon1, lat2, lon2) {
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function capDeg(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }
  function ecartAngle(a, b) {
    const d = Math.abs(((a - b) % 360 + 360) % 360);
    return d > 180 ? 360 - d : d;
  }
  function pointDest(lat, lon, cap, d) {
    const δ = d / R, θ = cap * Math.PI / 180;
    const φ1 = lat * Math.PI / 180, λ1 = lon * Math.PI / 180;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
    return [φ2 * 180 / Math.PI, λ2 * 180 / Math.PI];
  }

  // Date de découverte d'un nid (found_at est souvent un simple jour :
  // on prend la FIN de ce jour, un signalement du matin compte donc).
  function finJourNid(n) {
    if (!n.found_at) return null;
    const t = new Date(n.found_at).getTime();
    if (!Number.isFinite(t)) return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(String(n.found_at).trim()) ? t + JOUR - 1 : t;
  }
  function anneeNid(n) {
    if (n.found_at) { const y = new Date(n.found_at).getFullYear(); if (Number.isFinite(y)) return y; }
    if (n.annee) return parseInt(n.annee, 10);
    return null;
  }

  // ── ÉVALUATION ─────────────────────────────────────────────
  // signals : lignes chrono_frelon_geo { id, lat, lon, direction, distance,
  //           trait_length_m, created_at, phone_id }
  // nests   : lignes nests { id, lat, lon, found_at, type }
  // opts    : { bloques: Set(phone_id), longueurDefaut: m, maintenant: ms }
  function evaluer(signals, nests, params, opts = {}) {
    const p = Object.assign({}, DEFAUTS, params || {});
    const bloques = opts.bloques || new Set();
    const longueurDefaut = opts.longueurDefaut || 1000;
    const maintenant = opts.maintenant || Date.now();
    const delaiMs = p.delaiJours * JOUR;

    const nids = (nests || [])
      .filter(n => Number.isFinite(n.lat) && Number.isFinite(n.lon))
      .map(n => ({ n, t: finJourNid(n), annee: anneeNid(n), signale: false, parSignaux: [] }));

    const sigs = [];
    (signals || []).forEach(s => {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon) || !s.created_at) return;
      if (bloques.has(s.phone_id)) return;
      const t = new Date(s.created_at).getTime();
      if (!Number.isFinite(t)) return;
      const dir = Number(s.direction) || 0;
      const D = Number(s.distance) || Number(s.trait_length_m) || longueurDefaut;
      const pointe = pointDest(s.lat, s.lon, dir, D);
      const portee = p.facteurDist * D;

      const nidsJustes = [];
      nids.forEach(x => {
        if (x.t == null || x.t < t || x.t > t + delaiMs) return;
        const d = distM(s.lat, s.lon, x.n.lat, x.n.lon);
        if (d > portee) return;
        // tout près du point de départ, l'angle ne veut plus rien dire
        if (d > 50 && ecartAngle(capDeg(s.lat, s.lon, x.n.lat, x.n.lon), dir) > p.tolDeg) return;
        nidsJustes.push(x);
      });

      let etat;
      if (nidsJustes.length) etat = 'juste';
      else if (t + delaiMs > maintenant) etat = 'attente';
      else etat = 'faux';
      nidsJustes.forEach(x => { x.signale = true; x.parSignaux.push(s.id); });

      sigs.push({
        s, t, annee: new Date(t).getFullYear(), etat,
        nids: nidsJustes.map(x => x.n.id),
        pointe, carre: carreDe(pointe[0], pointe[1]),
      });
    });

    nids.forEach(x => { x.carre = carreDe(x.n.lat, x.n.lon); });
    return { params: p, signaux: sigs, nids };
  }

  const CLE = { juste: 'justes', faux: 'faux', attente: 'attente' };
  function pct(a, b) { return b > 0 ? Math.round(100 * a / b) : null; }

  // ── NOTES PAR CARRÉ ────────────────────────────────────────
  // filtre : { annee } facultatif (sinon tout)
  function zones(ev, filtre = {}) {
    const z = {};
    const prendre = id => {
      if (!z[id]) {
        const [iy, ix] = id.split('_').map(Number);
        z[id] = { id, iy, ix, limites: limitesCarre(iy, ix),
                  justes: 0, faux: 0, attente: 0, nids: 0, nidsSignales: 0 };
      }
      return z[id];
    };
    ev.signaux.forEach(x => {
      if (filtre.annee && x.annee !== filtre.annee) return;
      prendre(x.carre.id)[CLE[x.etat]]++;
    });
    ev.nids.forEach(x => {
      if (filtre.annee && x.annee !== filtre.annee) return;
      const c = prendre(x.carre.id);
      c.nids++;
      if (x.signale) c.nidsSignales++;
    });
    return Object.values(z).map(c => {
      const juges = c.justes + c.faux;
      c.note = juges >= ev.params.minSignaux ? pct(c.justes, juges) : null;
      c.centre = [(c.limites[0][0] + c.limites[1][0]) / 2, (c.limites[0][1] + c.limites[1][1]) / 2];
      return c;
    }).sort((a, b) => (b.note ?? -1) - (a.note ?? -1) || (b.justes + b.faux) - (a.justes + a.faux));
  }

  // ── COMPARAISON DES ANNÉES ─────────────────────────────────
  // Précision : part des signalements jugés qui ont mené à un nid.
  // Détection : part des nids trouvés qui avaient été signalés.
  // Indice    : moyenne des deux (0 à 100).
  function annees(ev) {
    const a = {};
    const prendre = y => (a[y] = a[y] || { annee: y, signaux: 0, justes: 0, faux: 0, attente: 0, nids: 0, nidsSignales: 0 });
    ev.signaux.forEach(x => { const r = prendre(x.annee); r.signaux++; r[CLE[x.etat]]++; });
    ev.nids.forEach(x => { if (x.annee == null) return; const r = prendre(x.annee); r.nids++; if (x.signale) r.nidsSignales++; });
    return Object.values(a).map(r => {
      r.precision = pct(r.justes, r.justes + r.faux);
      r.detection = pct(r.nidsSignales, r.nids);
      r.indice = r.precision != null && r.detection != null ? Math.round((r.precision + r.detection) / 2)
               : (r.precision ?? r.detection);
      const zs = zones(ev, { annee: r.annee }).filter(z => z.note != null);
      r.zonesNotees = zs.length;
      r.noteMoyenne = zs.length ? Math.round(zs.reduce((s, z) => s + z.note, 0) / zs.length) : null;
      return r;
    }).sort((x, y) => y.annee - x.annee);
  }

  // Couleur d'une note : rouge (0) → orange (50) → vert (100) ; gris sans note
  function couleurNote(note) {
    if (note == null) return '#9e9e9e';
    const h = Math.round(1.2 * Math.max(0, Math.min(100, note)));  // 0° rouge → 120° vert
    return `hsl(${h}, 70%, 42%)`;
  }

  return { DEFAUTS, evaluer, zones, annees, couleurNote, carreDe, limitesCarre,
           distM, capDeg, ecartAngle, pointDest };
})();

if (typeof module !== 'undefined') module.exports = BilanCalc;
