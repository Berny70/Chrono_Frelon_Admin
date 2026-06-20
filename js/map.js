// ── map.js — Carte Leaflet + traits directionnels + convergence
// Dépend de : config.js, Leaflet CDN

let _map         = null;
let _layers      = [];
let _convergence = null;
let _currentBasemap = null;

// ── FONDS DE CARTE ────────────────────────────────────────────

const BASEMAPS = {
  osm:       { label: '🗺 Standard',  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                                                                        opts: { attribution: '© OpenStreetMap', maxZoom: 19 } },
  topo:      { label: '🏔 Topo',      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',                                                                          opts: { attribution: '© OpenTopoMap',   maxZoom: 17 } },
  relief:    { label: '🌄 Relief',    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',                        opts: { attribution: '© Esri',          maxZoom: 13 } },
  satellite: { label: '🛰 Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',                              opts: { attribution: '© Esri',          maxZoom: 19 } },
};

function _applyBasemap(key) {
  const bm = BASEMAPS[key] || BASEMAPS.osm;
  if (_currentBasemap) _map.removeLayer(_currentBasemap);
  _currentBasemap = L.tileLayer(bm.url, bm.opts).addTo(_map);
  localStorage.setItem('chassnid_basemap', key);
  document.querySelectorAll('.basemap-btn').forEach(btn => {
    btn.classList.toggle('basemap-btn--active', btn.dataset.basemap === key);
  });
}

function _addBasemapControl() {
  const ctrl = L.control({ position: 'bottomright' });
  ctrl.onAdd = () => {
    const div = L.DomUtil.create('div', 'basemap-control');
    div.innerHTML = Object.entries(BASEMAPS).map(([key, bm]) =>
      `<button class="basemap-btn${key === (localStorage.getItem('chassnid_basemap') || 'osm') ? ' basemap-btn--active' : ''}" data-basemap="${key}">${bm.label}</button>`
    ).join('');
    L.DomEvent.disableClickPropagation(div);
    div.addEventListener('click', e => {
      const btn = e.target.closest('.basemap-btn');
      if (btn) _applyBasemap(btn.dataset.basemap);
    });
    return div;
  };
  ctrl.addTo(_map);
}

// ── INITIALISATION ────────────────────────────────────────────

function mapInit(signals, blockedPhones) {
  const isFirstInit = !_map;

  if (!_map) {
    _map = L.map('map', {
      center: [46.8, 2.3],
      zoom:   6,
      zoomControl: true,
    });

    const saved = localStorage.getItem('chassnid_basemap') || 'osm';
    _applyBasemap(saved);
    _addBasemapControl();
  }

  _clearLayers();
  _drawSignals(signals, blockedPhones);

  // Ne recentrer que lors de la première initialisation
  if (isFirstInit) {
    _fitBounds(signals);
  }
}

function mapInvalidate() {
  if (_map) setTimeout(() => _map.invalidateSize(), 50);
}

// ── NETTOYAGE ─────────────────────────────────────────────────

function _clearLayers() {
  _layers.forEach(l => _map.removeLayer(l));
  _layers = [];
  if (_convergence) {
    _map.removeLayer(_convergence);
    _convergence = null;
  }
}

// ── DESSIN DES SIGNAUX ────────────────────────────────────────

function _drawSignals(signals, blockedPhones) {
  if (!signals.length) return;

  const activeSignals = [];

  signals.forEach(s => {
    if (!s.lat || !s.lon) return;

    const isBlocked  = blockedPhones && blockedPhones.has(s.phone_id);
    const color      = isBlocked ? '#c0392b' : '#2d6a4f';
    const colorLight = isBlocked ? '#e74c3c' : '#52b788';

    // Point origine avec popup
    const dot = L.circleMarker([s.lat, s.lon], {
      radius:      5,
      fillColor:   color,
      color:       '#fff',
      weight:      1.5,
      fillOpacity: 1,
    }).addTo(_map);

    // Popup avec bouton supprimer
    const popupContent = `
      <div style="font-family:'DM Sans',sans-serif;font-size:12px;min-width:160px">
        <div style="font-weight:600;color:#1a2e1a;margin-bottom:4px">
          ${new Date(s.created_at).toLocaleString('fr-FR')}
        </div>
        <div style="color:#888;margin-bottom:2px;font-family:monospace;font-size:11px">
          ${(s.lat||0).toFixed(5)}, ${(s.lon||0).toFixed(5)}
        </div>
        <div style="color:#888;margin-bottom:2px;font-family:monospace;font-size:11px">
          ${s.distance||0}m · ${s.direction||0}°
        </div>
        <div style="color:#888;margin-bottom:8px;font-family:monospace;font-size:11px">
          ${s.phone_id || '—'}
        </div>
        <button onclick="mapDeleteSignal(${s.id})" style="
          width:100%;padding:6px;
          background:#c0392b;color:#fff;
          border:none;border-radius:6px;
          font-family:'DM Sans',sans-serif;font-size:12px;
          font-weight:600;cursor:pointer">
          🗑 Supprimer
        </button>
      </div>`;

    dot.bindPopup(popupContent, { maxWidth: 220 });
    dot._signalId = s.id;
    _layers.push(dot);

    if (isBlocked) return;

    // Fuseau directionnel (secteur angulaire ±5° autour de la direction)
    const fuseauLength = (s.trait_length_m || CONFIG.DEFAULT_TRAIT_LENGTH_M);
    const fuseauPoints = _buildFuseau(s.lat, s.lon, s.direction || 0, fuseauLength, 5);

    const fuseau = L.polygon(fuseauPoints, {
      color:       colorLight,
      weight:      1.5,
      opacity:     0.8,
      fillColor:   colorLight,
      fillOpacity: 0.22,
    }).addTo(_map);
    fuseau.bindPopup(popupContent, { maxWidth: 220 });
    fuseau._signalId = s.id;

    _layers.push(fuseau);
    activeSignals.push(s);
  });

  // Calcul de convergence sur les signaux actifs
  if (activeSignals.length >= 2) {
    const conv = _computeConvergence(activeSignals);
    if (conv) _drawConvergence(conv);
  }
}

// ── SUPPRESSION DEPUIS LA CARTE ───────────────────────────────

function mapDeleteSignal(id) {
  _map.closePopup();

  showModal(
    'Supprimer ce signalement',
    'Cette action est irréversible.',
    'Supprimer',
    async () => {
      // 1. Supprimer en base d'abord
      await dbSignalDelete(id);
      // 2. Puis rafraîchir la carte (les données sont à jour)
      await Dashboard.load();
      showToast('Signalement supprimé.');
    }
  );
}

// ── POINT DE DESTINATION ──────────────────────────────────────

function _destPoint(lat, lon, bearing, distanceM) {
  const R    = 6371000;
  const d    = distanceM / R;
  const b    = bearing * Math.PI / 180;
  const lat1 = lat * Math.PI / 180;
  const lon1 = lon * Math.PI / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
    Math.cos(lat1) * Math.sin(d) * Math.cos(b)
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(b) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
  );

  return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI];
}

// ── CONSTRUCTION DU FUSEAU (secteur angulaire ±N°) ──────────────

function _buildFuseau(lat, lon, bearing, lengthM, halfAngleDeg) {
  const steps  = 8; // segments d'arc pour un rendu lisse
  const points = [[lat, lon]];

  for (let i = 0; i <= steps; i++) {
    const a = bearing - halfAngleDeg + (2 * halfAngleDeg * i / steps);
    points.push(_destPoint(lat, lon, a, lengthM));
  }

  points.push([lat, lon]);
  return points;
}

// ── CALCUL DE CONVERGENCE ─────────────────────────────────────

function _computeConvergence(signals) {
  if (signals.length < 2) return null;
  const R = 6371000;

  const centerLat = signals.reduce((s, p) => s + p.lat, 0) / signals.length;
  const centerLon = signals.reduce((s, p) => s + p.lon, 0) / signals.length;

  const local = signals.filter(s => {
    const dlat = (s.lat - centerLat) * Math.PI / 180 * R;
    const dlon = (s.lon - centerLon) * Math.PI / 180 * R * Math.cos(centerLat * Math.PI / 180);
    return Math.sqrt(dlat * dlat + dlon * dlon) < 5000;
  });

  if (local.length < 2) return null;

  const intersections = [];

  for (let i = 0; i < local.length; i++) {
    for (let j = i + 1; j < local.length; j++) {
      const a  = local[i];
      const b  = local[j];
      const φ0 = a.lat * Math.PI / 180;
      const dx = (b.lon - a.lon) * Math.PI / 180 * R * Math.cos(φ0);
      const dy = (b.lat - a.lat) * Math.PI / 180 * R;

      const ba = a.direction * Math.PI / 180;
      const bb = b.direction * Math.PI / 180;
      const ux = Math.sin(ba), uy = Math.cos(ba);
      const vx = Math.sin(bb), vy = Math.cos(bb);

      const denom = ux * vy - uy * vx;
      if (Math.abs(denom) < 0.001) continue;

      const t  = (dx * vy - dy * vx) / denom;
      const ix = t * ux;
      const iy = t * uy;

      const iLat = a.lat + (iy / R) * 180 / Math.PI;
      const iLon = a.lon + (ix / (R * Math.cos(φ0))) * 180 / Math.PI;

      const dist = Math.sqrt(ix * ix + iy * iy);
      if (dist > 0 && dist < 2000) intersections.push([iLat, iLon]);
    }
  }

  if (!intersections.length) return null;

  const cLat = intersections.reduce((s, p) => s + p[0], 0) / intersections.length;
  const cLon = intersections.reduce((s, p) => s + p[1], 0) / intersections.length;

  const radius = intersections.reduce((s, p) => {
    const dlat = (p[0] - cLat) * Math.PI / 180 * R;
    const dlon = (p[1] - cLon) * Math.PI / 180 * R * Math.cos(cLat * Math.PI / 180);
    return s + Math.sqrt(dlat * dlat + dlon * dlon);
  }, 0) / intersections.length;

  return {
    lat:    cLat,
    lon:    cLon,
    radius: Math.min(Math.max(radius, 30), 500),
  };
}

// ── DESSIN DE LA CONVERGENCE ──────────────────────────────────

function _drawConvergence(conv) {
  const circle = L.circle([conv.lat, conv.lon], {
    radius:      conv.radius,
    color:       '#d4820a',
    weight:      2,
    fillColor:   '#f0a832',
    fillOpacity: 0.18,
    dashArray:   '6 4',
  }).addTo(_map);

  circle.bindTooltip(
    `Zone probable du nid · rayon ~${Math.round(conv.radius)} m`,
    { className: 'convergence-label', permanent: true, direction: 'top' }
  );

  _convergence = circle;
  _layers.push(circle);
}

// ── CENTRAGE ──────────────────────────────────────────────────

function _fitBounds(signals) {
  const valid = signals.filter(s => s.lat && s.lon);
  if (!valid.length) return;

  if (valid.length === 1) {
    _map.setView([valid[0].lat, valid[0].lon], 14);
    return;
  }

  const bounds = L.latLngBounds(valid.map(s => [s.lat, s.lon]));
  _map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
}
