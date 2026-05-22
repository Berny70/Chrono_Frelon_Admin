let leafletMap  = null;
let traitLayers = [];   // polylines des traits
let convLayer   = null; // cercle de convergence

// ── CALCUL POINT D'EXTRÉMITÉ D'UN TRAIT ──────────────────────
// Depuis (lat, lon), avance de `distM` mètres dans la direction `bearingDeg`
function _destPoint(lat, lon, bearingDeg, distM) {
  const R  = 6371000;
  const d  = distM / R;
  const b  = bearingDeg * Math.PI / 180;
  const φ1 = lat * Math.PI / 180;
  const λ1 = lon * Math.PI / 180;
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(d) +
    Math.cos(φ1) * Math.sin(d) * Math.cos(b)
  );
  const λ2 = λ1 + Math.atan2(
    Math.sin(b) * Math.sin(d) * Math.cos(φ1),
    Math.cos(d) - Math.sin(φ1) * Math.sin(φ2)
  );
  return [φ2 * 180 / Math.PI, λ2 * 180 / Math.PI];
}

// ── CALCUL DE CONVERGENCE ─────────────────────────────────────
// Retourne le barycentre des intersections entre les droites de visée
// et le rayon moyen d'incertitude
function _computeConvergence(signals) {
  if (signals.length < 2) return null;
  const R = 6371000;  // ← ajouter ici

  // Chaque signal définit une droite : origine + direction
  // On cherche le point minimisant la somme des distances aux droites
  // Méthode : barycentre des intersections par paires

  const intersections = [];

  for (let i = 0; i < signals.length; i++) {
    for (let j = i + 1; j < signals.length; j++) {
      const a = signals[i];
      const b = signals[j];

      // Convertit les deux droites en coordonnées cartésiennes locales (mètres)
      // Origine = premier signal comme référence
      const φ0 = a.lat * Math.PI / 180;
      const λ0 = a.lon * Math.PI / 180;

      // Position de b en mètres depuis a
      const dx = (b.lon - a.lon) * Math.PI / 180 * R * Math.cos(φ0);
      const dy = (b.lat - a.lat) * Math.PI / 180 * R;

      // Vecteurs directeurs des deux droites
      const ba = a.direction * Math.PI / 180;
      const bb = b.direction * Math.PI / 180;
      const ux = Math.sin(ba), uy = Math.cos(ba);
      const vx = Math.sin(bb), vy = Math.cos(bb);

      // Intersection : résolution du système linéaire
      const denom = ux * vy - uy * vx;
      if (Math.abs(denom) < 0.001) continue; // droites parallèles

      const t = (dx * vy - dy * vx) / denom;
      const ix = t * ux;        // en mètres depuis a
      const iy = t * uy;

      // Reconvertit en lat/lon
      const iLat = a.lat + (iy / R) * 180 / Math.PI;
      const iLon = a.lon + (ix / (R * Math.cos(φ0))) * 180 / Math.PI;

      // Filtre les intersections aberrantes (> 5 km du signal)
      const dist = Math.sqrt(ix * ix + iy * iy);
      if (dist < 5000) intersections.push([iLat, iLon]);
    }
  }

  if (!intersections.length) return null;

  // Barycentre
  const cLat = intersections.reduce((s, p) => s + p[0], 0) / intersections.length;
  const cLon = intersections.reduce((s, p) => s + p[1], 0) / intersections.length;

  // Rayon = distance moyenne des intersections au barycentre (en mètres)
  const radius = intersections.reduce((s, p) => {
    const dlat = (p[0] - cLat) * Math.PI / 180 * R;
    const dlon = (p[1] - cLon) * Math.PI / 180 * R * Math.cos(cLat * Math.PI / 180);
    return s + Math.sqrt(dlat * dlat + dlon * dlon);
  }, 0) / intersections.length;

  return { lat: cLat, lon: cLon, radius: Math.max(radius, 30) };
}

// ── INIT CARTE ────────────────────────────────────────────────
function mapInit(signals, blockedPhones) {
  const pts = signals.filter(s => s.lat && s.lon && s.direction != null);
  if (!pts.length) return;

  if (!leafletMap) {
    leafletMap = L.map('map').setView([pts[0].lat, pts[0].lon], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>'
    }).addTo(leafletMap);
  } else {
    // Nettoie les couches précédentes
    traitLayers.forEach(l => leafletMap.removeLayer(l));
    traitLayers = [];
    if (convLayer) { leafletMap.removeLayer(convLayer); convLayer = null; }
  }

  const traitLen = CONFIG.TRAIT_LENGTH_M || 1000; // longueur des traits en mètres
  const loc = lang === 'fr' ? 'fr-FR' : 'de-DE';

  pts.forEach(s => {
    const isBlocked = blockedPhones.has(s.phone_id);
    const end = _destPoint(s.lat, s.lon, s.direction, traitLen);

    // Point d'origine (position de l'observateur)
    const dot = L.circleMarker([s.lat, s.lon], {
      radius:      5,
      fillColor:   isBlocked ? '#c0392b' : '#2d6a4f',
      color:       '#fff',
      weight:      1.5,
      fillOpacity: 0.9,
    });

    // Trait directionnel
    const trait = L.polyline([[s.lat, s.lon], end], {
      color:     isBlocked ? '#c0392b' : '#52b788',
      weight:    2,
      opacity:   0.75,
    });

    // Flèche à l'extrémité
    const arrow = L.circleMarker(end, {
      radius:      3,
      fillColor:   isBlocked ? '#c0392b' : '#1b4332',
      color:       isBlocked ? '#c0392b' : '#1b4332',
      weight:      1,
      fillOpacity: 1,
    });

    const date = new Date(s.created_at).toLocaleString(loc);
    const popup = `
      <div style="min-width:190px">
        <div style="font-weight:600;margin-bottom:6px">${date}</div>
        <div style="font-size:12px;color:#666;margin-bottom:4px">
          Direction : ${s.direction}° · Distance estimée : ${s.distance || '—'}m
        </div>
        <div style="font-size:11px;font-family:monospace;color:#888;margin-bottom:10px">
          ${s.phone_id || '—'}
        </div>
        ${isBlocked
          ? `<div style="color:#c0392b;font-size:12px;margin-bottom:8px">⛔ ${t('badge_blocked')}</div>`
          : ''}
        <button onclick="App.confirmDelete(${s.id})" style="
          width:100%;padding:7px;border:none;border-radius:6px;
          background:#c0392b;color:#fff;font-size:13px;font-weight:500;
          cursor:pointer;font-family:'DM Sans',sans-serif
        ">🗑 Supprimer</button>
      </div>`;

    dot.bindPopup(popup, { maxWidth: 220 });
    trait.bindTooltip(`${s.direction}° · ${date}`, {
      permanent: false, direction: 'top', sticky: true
    });
    trait.on('click', () => dot.openPopup());

    dot.addTo(leafletMap);
    trait.addTo(leafletMap);
    arrow.addTo(leafletMap);

    traitLayers.push(dot, trait, arrow);
  });

  // ── CERCLE DE CONVERGENCE ────────────────────────────────────
  const conv = _computeConvergence(pts);
  if (conv) {
    // Cercle d'incertitude
    convLayer = L.circle([conv.lat, conv.lon], {
      radius:      conv.radius,
      color:       '#d4820a',
      weight:      2,
      fillColor:   '#f0a832',
      fillOpacity: 0.15,
      dashArray:   '6 4',
    });
    convLayer.bindTooltip(
      `Zone probable du nid · rayon ~${Math.round(conv.radius)}m`,
      { permanent: true, direction: 'center', className: 'convergence-label' }
    );
    convLayer.addTo(leafletMap);

    // Marqueur central
    const center = L.circleMarker([conv.lat, conv.lon], {
      radius:      8,
      fillColor:   '#d4820a',
      color:       '#fff',
      weight:      2,
      fillOpacity: 0.95,
    });
    center.bindTooltip('🎯 Centre de convergence', { direction: 'top' });
    center.addTo(leafletMap);
    traitLayers.push(center);
  }

  // Ajuste la vue sur l'ensemble des traits
  const allPts = pts.flatMap(s => [
    [s.lat, s.lon],
    _destPoint(s.lat, s.lon, s.direction, traitLen)
  ]);
  leafletMap.fitBounds(L.latLngBounds(allPts), { padding: [30, 30] });
}

// ── HIGHLIGHT DEPUIS LISTE ────────────────────────────────────
function mapHighlightSignal(id) {
  const signalsTab = document.querySelectorAll('.nav-tab')[1];
  if (signalsTab) switchTab('signals', signalsTab);
  setTimeout(() => {
    document.querySelectorAll('.signal-card').forEach(card => {
      card.classList.remove('highlighted');
      const btn = card.querySelector('.btn-delete');
      if (btn && btn.getAttribute('onclick') === `App.confirmDelete(${id})`) {
        card.classList.add('highlighted');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }, 150);
}

function mapInvalidate() {
  if (leafletMap) setTimeout(() => leafletMap.invalidateSize(), 50);
}

// ── NETTOYAGE CONVERGENCE (après destruction d'un nid) ────────
function mapClearConvergence() {
  if (convLayer) {
    leafletMap.removeLayer(convLayer);
    convLayer = null;
  }
}
