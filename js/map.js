// ── map.js — Carte Leaflet + traits directionnels + convergence
// Dépend de : config.js, Leaflet CDN

// CSS override pour les icônes nids
(function() {
  const style = document.createElement('style');
  style.textContent = '.nest-div-icon { background: none !important; border: none !important; }' +
    // Pendant Mesurer / Point supposé : les cônes et points de signalement
    // ne doivent plus intercepter le clic (sinon impossible de cliquer
    // pile à leur intersection, qui est justement l'endroit recherché).
    '.leaflet-container.tool-active .leaflet-interactive { pointer-events: none !important; }' +
    '.leaflet-container.tool-active .leaflet-marker-icon.guess-marker,' +
    '.leaflet-container.tool-active .leaflet-marker-icon.guess-marker * { pointer-events: auto !important; }';
  document.head.appendChild(style);
})();

let _map         = null;
let _layers      = [];
let _convergence = null;
let _currentBasemap = null;
let _nests       = [];
let _nestLayers  = [];
let _nestsVisible = false;
let _canAddNestPermission = false;
let _measureActive  = false;
let _measurePoints   = [];   // [L.LatLng, ...] — points déjà posés
let _measureLayers   = [];   // marqueurs + segments affichés
let _measureTooltip  = null; // affichage flottant de la distance en cours
let _guessActive = false;
let _guessMarker = null;
let _ignRouteLayer = null;
let _lastSignals = [];
let _suggestLayers = [];

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
    div.innerHTML =
      `<button id="btn-toggle-nests" style="
        width:100%;margin-bottom:6px;padding:6px 10px;
        background:#7b3f00;color:#fff;
        border:1px solid var(--border);border-radius:8px;
        font-family:'DM Sans',sans-serif;font-size:13px;
        font-weight:600;cursor:pointer;text-align:left">
        🪺 Nids ${_nestsVisible ? 'visibles' : 'masqués'}
      </button>` +
      `<button id="btn-toggle-measure" style="
        width:100%;margin-bottom:6px;padding:6px 10px;
        background:#fff;color:#333;
        border:1px solid var(--border);border-radius:8px;
        font-family:'DM Sans',sans-serif;font-size:13px;
        font-weight:600;cursor:pointer;text-align:left">
        📏 Mesurer
      </button>` +
      `<button id="btn-toggle-guess" style="
        width:100%;margin-bottom:6px;padding:6px 10px;
        background:#fff;color:#333;
        border:1px solid var(--border);border-radius:8px;
        font-family:'DM Sans',sans-serif;font-size:13px;
        font-weight:600;cursor:pointer;text-align:left">
        📍 Point supposé
      </button>` +
      `<button id="btn-toggle-addnest" style="
        width:100%;margin-bottom:6px;padding:6px 10px;
        background:#fff;color:#333;
        border:1px solid var(--border);border-radius:8px;
        font-family:'DM Sans',sans-serif;font-size:13px;
        font-weight:600;cursor:pointer;text-align:left">
        ➕ Ajouter un nid
      </button>` +
      Object.entries(BASEMAPS).map(([key, bm]) =>
        `<button class="basemap-btn${key === (localStorage.getItem('chassnid_basemap') || 'osm') ? ' basemap-btn--active' : ''}" data-basemap="${key}">${bm.label}</button>`
      ).join('');
    L.DomEvent.disableClickPropagation(div);
    div.addEventListener('click', e => {
      const bm = e.target.closest('.basemap-btn');
      if (bm) _applyBasemap(bm.dataset.basemap);
      if (e.target.closest('#btn-toggle-nests')) _toggleNests();
      if (e.target.closest('#btn-toggle-measure')) _toggleMeasure();
      if (e.target.closest('#btn-toggle-guess')) _toggleGuess();
      if (e.target.closest('#btn-toggle-addnest')) _toggleAddNest();
    });
    return div;
  };
  ctrl.addTo(_map);
}

// ── INITIALISATION ────────────────────────────────────────────

function mapInit(signals, blockedPhones, sentinelMap, nests, canAddNest) {
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
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(_map);
    window._leafletMap = _map; // exposé pour leaflet-image
  }

  _lastSignals = signals || [];
  _clearLayers();
  _clearNestLayers();
  _drawSignals(signals, blockedPhones, sentinelMap);
  _nests = nests || [];
  _drawNests(_nests);
  _setupNestClick(canAddNest);

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
  if (typeof _clearSuggest === 'function' && _map) _clearSuggest();
  _layers.forEach(l => _map.removeLayer(l));
  _layers = [];
  if (_convergence) {
    _map.removeLayer(_convergence);
    _convergence = null;
  }
}

// ── DESSIN DES SIGNAUX ────────────────────────────────────────

function _drawSignals(signals, blockedPhones, sentinelMap) {
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
        <div style="color:#888;margin-bottom:8px;font-size:11px">
          ${(() => {
            // Priorité au pseudo renvoyé directement par le signal (signals_within_radius
            // le fournit déjà pour TOUTE sentinelle dans le rayon, peu importe son pilote) ;
            // sentinelMap (limité aux sentinelles du pilote courant) sert de complément.
            const pseudo = s.pseudo || (sentinelMap && sentinelMap[s.phone_id]?.pseudo);
            return pseudo ? '🏷️ ' + pseudo : s.phone_id?.substring(0,8) + '…';
          })()}
        </div>
        <button onclick="mapDeleteSignal(${s.id})" style="
          width:100%;padding:6px;margin-bottom:4px;
          background:#c0392b;color:#fff;
          border:none;border-radius:6px;
          font-family:'DM Sans',sans-serif;font-size:12px;
          font-weight:600;cursor:pointer">
          🗑 Supprimer
        </button>
        <button onclick="mapSuggestSecond(${s.id})" style="
          width:100%;padding:6px;margin-bottom:4px;
          background:#1565c0;color:#fff;
          border:none;border-radius:6px;
          font-family:'DM Sans',sans-serif;font-size:12px;
          font-weight:600;cursor:pointer">
          🎯 Suggérer le 2e relevé
        </button>
        <button onclick="mapCreateNestAt(${s.lat}, ${s.lon})" style="
          width:100%;padding:6px;
          background:#7b3f00;color:#fff;
          border:none;border-radius:6px;
          font-family:'DM Sans',sans-serif;font-size:12px;
          font-weight:600;cursor:pointer">
          🪺 Créer un nid ici
        </button>
      </div>`;

    dot.bindPopup(popupContent, { maxWidth: 220 });
    dot._signalId = s.id;
    _layers.push(dot);

    if (isBlocked) return;

    // Fuseau directionnel (secteur angulaire ±5° autour de la direction)
    // Priorité à la distance propre du signalement (mesurée par la
    // sentinelle, ex. via Chrono Frelon) sur le réglage par défaut du pilote.
    const fuseauLength = s.distance || s.trait_length_m || CONFIG.DEFAULT_TRAIT_LENGTH_M;
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
      const { error } = await dbSignalDelete(id);
      if (error) {
        showToast('Erreur : ' + (error.message || error));
        return;
      }
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
// Désactivé : calcul de zone probabiliste erroné pour l'instant

function _drawConvergence(conv) {
  // Cercle de probabilité désactivé temporairement
  // _convergence reste null, rien n'est dessiné
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

// ── NIDS TROUVÉS ──────────────────────────────────────────────

// Couleurs des reines d'abeilles par année — code international
// 1/6=Blanc, 2/7=Jaune, 3/8=Rouge, 4/9=Vert, 5/0=Bleu
function _getQueenColor(annee) {
  const y = parseInt(annee) || new Date().getFullYear();
  const digit = y % 10;
  if (digit === 1 || digit === 6) return { bg: '#f5f5f5', border: '#9e9e9e', label: 'Blanc' };
  if (digit === 2 || digit === 7) return { bg: '#FFD700', border: '#b8a000', label: 'Jaune' };
  if (digit === 3 || digit === 8) return { bg: '#e53935', border: '#8b0000', label: 'Rouge' };
  if (digit === 4 || digit === 9) return { bg: '#43a047', border: '#1b5e20', label: 'Vert'  };
  return { bg: '#1e88e5', border: '#0d47a1', label: 'Bleu'  }; // 5 ou 0
}

function _getNestIcon(annee, type) {
  const c = _getQueenColor(annee);
  const isPrimaire = type === 'primaire';
  const imgSrc = isPrimaire ? './img/nid_primaire.png' : './img/nid_secondaire.png';
  const borderColor = isPrimaire ? '#e07b00' : c.border;
  const bgColor = isPrimaire ? '#fff3e0' : c.bg;
  return L.divIcon({
    html: `<div style="
      width:24px;height:24px;
      border:2px solid ${borderColor};
      border-radius:50%;
      background:${bgColor} url('${imgSrc}') center/20px no-repeat;
      box-shadow:0 2px 5px rgba(0,0,0,0.4);
    "></div>`,
    className: 'nest-div-icon',
    iconSize:   [24, 24],
    iconAnchor: [12, 12],
    popupAnchor:[0, -14],
  });
}

function _clearNestLayers() {
  _nestLayers.forEach(l => _map.removeLayer(l));
  _nestLayers = [];
  _map.off('click', _onMapClickAddNest);
}

// Filtre les nids affichés sur la carte (appelé depuis dashboard.js)
function mapFilterNests(filteredNests) {
  if (!_map) return;
  _clearNestLayers();
  _drawNests(filteredNests);
}

// Retourne le centre actuel de la carte (lat/lng)
function mapGetCenter() {
  if (!_map) return null;
  return _map.getCenter();
}

// Centre la carte sur un signalement précis et ouvre son popup
// (utilisé depuis la liste des signalements — bouton 📍)
function mapFocusSignal(signalId) {
  if (!_map) return;
  const layer = _layers.find(l => l._signalId === signalId);
  if (!layer) { showToast?.("Signalement introuvable sur la carte (hors filtre actuel ?)."); return; }
  const latlng = layer.getLatLng ? layer.getLatLng() : layer.getBounds().getCenter();
  _map.setView(latlng, Math.max(_map.getZoom(), 16));
  setTimeout(() => layer.openPopup(), 300); // laisse le temps au recentrage
}

// Centre la carte sur un nid précis et ouvre son popup
// (utilisé depuis la liste des nids — bouton 📍)
function mapFocusNest(nestId) {
  if (!_map) return;
  const marker = _nestLayers.find(l => l._nestId === nestId);
  if (!marker) { showToast?.("Nid introuvable sur la carte (hors filtre actuel ?)."); return; }
  if (!_nestsVisible) _toggleNests(); // s'assure que le nid est visible
  _map.setView(marker.getLatLng(), Math.max(_map.getZoom(), 16));
  setTimeout(() => marker.openPopup(), 300);
}

// Année réelle du nid : found_at (fiable) > annee (rarement renseigné) > année en cours
function _getNestYear(n) {
  if (n.found_at) return new Date(n.found_at).getFullYear();
  if (n.annee) return parseInt(n.annee, 10);
  return new Date().getFullYear();
}

function _drawNests(nests) {
  nests.forEach(n => {
    const year   = _getNestYear(n);
    const icon   = _getNestIcon(year, n.type);
    const marker = L.marker([n.lat, n.lon], { icon });
    marker._nestId = n.id;
    if (_nestsVisible) marker.addTo(_map);
    const date     = n.found_at ? new Date(n.found_at).toLocaleDateString('fr-FR') : '—';
    const pilote = n.pilot_nom || n.declarant || '—';
    const declarantExtra = (n.declarant && n.pilot_nom && n.declarant !== n.pilot_nom)
      ? ` <span style="font-size:11px;color:#888">(déclaré par : ${n.declarant})</span>` : '';
    const c = _getQueenColor(year);
    const anneeStr = ` ${year} <span style="display:inline-block;width:10px;height:10px;background:${c.bg};border:2px solid ${c.border};border-radius:50%;vertical-align:middle" title="${c.label}"></span>`;
    const taille   = n.taille ? `<div style="color:#555;margin-bottom:2px">📏 ${n.taille}</div>` : '';

    const lat     = n.lat.toFixed(5);
    const lon     = n.lon.toFixed(5);
    const mapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;

    const profile = Auth.getProfile();
    const canDelete = !n.annee && (profile?.id === n.pilot_id || profile?.role === 'superadmin');
    const deleteBtn = canDelete ? `
        <button onclick="mapDeleteNest('${n.id}')" style="
          width:100%;padding:6px;
          background:#c0392b;color:#fff;
          border:none;border-radius:6px;
          font-family:'DM Sans',sans-serif;font-size:12px;
          font-weight:600;cursor:pointer">
          🗑 Supprimer
        </button>` : '';

    marker.bindPopup(`
      <div style="font-family:'DM Sans',sans-serif;font-size:13px;min-width:180px">
        <div style="font-weight:700;color:#7b3f00;margin-bottom:4px">🪺 Nid trouvé${anneeStr}</div>
        <div style="color:#555;margin-bottom:2px">📅 ${date}</div>
        <div style="color:#555;margin-bottom:2px">👤 ${pilote}</div>
        ${taille}
        <a href="${mapsUrl}" target="_blank"
           style="display:block;font-family:monospace;font-size:11px;color:#2563eb;margin-bottom:8px;text-decoration:none">
          📍 ${lat}, ${lon}
        </a>
        ${deleteBtn}
      </div>`, { maxWidth: 240 });

    _nestLayers.push(marker);
  });
}

// Clic sur la carte pour ajouter un nid
function _onMapClickAddNest(e) {
  if (!_nestsVisible) {
    showToast('Passez en mode "🪺 Nids visibles" pour ajouter un nid (afin de voir les nids déjà déclarés à cet endroit).');
    return;
  }
  _openNestCreateModal(e.latlng.lat, e.latlng.lng);
}

// Ouvre le formulaire de création de nid à une position donnée.
// Utilisé à la fois par le clic direct sur la carte et par le bouton
// "Créer un nid ici" dans le popup d'un signalement (les cônes de
// signalement interceptent le clic normal, donc ce 2e chemin est
// indispensable pour créer un nid pile à l'emplacement d'un signalement).
function _nearbyReadings(lat, lng) {
  const cutoff = Date.now() - 30 * 86400000;
  return (_lastSignals || [])
    .filter(s => s.lat && s.lon && new Date(s.created_at).getTime() >= cutoff)
    .map(s => ({ s, d: _distM(lat, lng, s.lat, s.lon) }))
    .filter(x => x.d <= 3000)
    .sort((a, b) => a.d - b.d)
    .slice(0, 10);
}

function _openNestCreateModal(lat, lng) {
  const today = new Date().toISOString().split('T')[0];
  const near = _nearbyReadings(lat, lng);
  const readingsHtml = near.length
    ? `<br><br><div style="font-size:13px;font-weight:600;margin-bottom:4px">Relevés qui ont mené à ce nid (optionnel)</div>` +
      `<div style="max-height:150px;overflow:auto;font-size:12px;border:1px solid #ddd;border-radius:6px;padding:6px">` +
      near.map(x => `<label style="display:block;margin-bottom:3px"><input type="checkbox" class="nest-reading" value="${x.s.id}"> ` +
        `${new Date(x.s.created_at).toLocaleDateString('fr-FR')} · ${x.s.pseudo || (x.s.phone_id || '').substring(0, 8)} · ` +
        `${x.s.direction || 0}° · à ${(x.d / 1000).toFixed(1)} km</label>`).join('') +
      `</div>`
    : '';

  showModal(
    '🪺 Marquer un nid trouvé',
    `Position : ${lat.toFixed(5)}, ${lng.toFixed(5)}<br><br>` +
    `Date : <input type="date" id="nest-date-input" value="${today}" ` +
    `style="border:1px solid #ccc;border-radius:6px;padding:4px 8px;font-size:14px"><br><br>` +
    `Type : <label style="margin-right:12px"><input type="radio" name="nest-type" value="secondaire" checked> 🔴 Secondaire</label>` +
    `<label><input type="radio" name="nest-type" value="primaire"> 🟠 Primaire</label>` + readingsHtml,
    'Confirmer',
    async () => {
      const foundAt = document.getElementById('nest-date-input')?.value || today;
      const nestType = document.querySelector('input[name="nest-type"]:checked')?.value || 'secondaire';
      // à lire AVANT l'appel : la modale est déjà fermée mais le DOM reste en place
      const linkedIds = Array.from(document.querySelectorAll('.nest-reading:checked')).map(c => parseInt(c.value, 10));
      const { ok, id, error } = await dbNestAdd(lat, lng, foundAt, nestType);
      if (error) {
        showToast('Erreur : ' + (error.message || error));
      } else {
        showToast('Nid enregistré !');
        if (linkedIds.length) {
          const r = await dbNestLinkSignals(id, linkedIds);
          if (r.error) showToast('Nid enregistré, mais liaison des relevés impossible : ' + r.error.message);
        }
        // Ajoute directement le nid tout juste créé, sans repasser par un
        // refetch+filtre par rayon : ce filtre se base sur la position
        // ENREGISTRÉE du profil, pas sur l'endroit où l'on vient de
        // cliquer (ex: après un "🔍 Ici" recentré ailleurs) — le nid
        // pouvait donc être exclu à tort et ne jamais s'afficher tant
        // qu'on ne rechargeait pas la page.
        const profile = Auth.getProfile();
        const newNest = {
          id, lat, lon: lng, found_at: foundAt, type: nestType,
          pilot_id: profile?.id, pilot_nom: profile ? `${profile.prenom} ${profile.nom}` : '',
        };
        _nests = [..._nests, newNest];
        _drawNests([newNest]);
        Dashboard.setNests(_nests);
        Dashboard.renderNests(_nests);
      }
    }
  );
}

// Point d'entrée global appelé depuis le bouton du popup de signalement
function mapCreateNestAt(lat, lng) {
  _map.closePopup();
  if (!_nestsVisible) {
    showToast('Passez en mode "🪺 Nids visibles" pour ajouter un nid (afin de voir les nids déjà déclarés à cet endroit).');
    return;
  }
  if (!_canAddNestPermission) {
    showToast('Vous n\'avez pas le droit de créer un nid.');
    return;
  }
  _openNestCreateModal(lat, lng);
}

// Mémorise la permission (n'attache plus le clic automatiquement —
// c'est désormais le bouton bascule "➕ Ajouter un nid" qui gère ça,
// voir _toggleAddNest ci-dessous).
function _setupNestClick(canAdd) {
  _canAddNestPermission = canAdd;
}

// ── AJOUTER UN NID (bouton bascule) ────────────────────────────
// Même principe que Mesurer / Point supposé : le temps que ce mode est
// actif, les cônes/points de signalement ne bloquent plus le clic
// (classe tool-active), ce qui permet de créer un nid pile à
// l'intersection de plusieurs signalements — l'endroit le plus utile.

let _addNestActive = false;

function _toggleAddNest() {
  if (!_canAddNestPermission) {
    showToast('Vous n\'avez pas le droit de créer un nid.');
    return;
  }
  _addNestActive = !_addNestActive;
  const btn = document.getElementById('btn-toggle-addnest');

  if (_addNestActive) {
    if (_measureActive) _toggleMeasure(); // modes exclusifs
    if (_guessActive) _toggleGuess();
    if (!_nestsVisible) {
      showToast('Passez en mode "🪺 Nids visibles" pour ajouter un nid (afin de voir les nids déjà déclarés à cet endroit).');
      _addNestActive = false;
      return;
    }
    if (btn) { btn.style.background = '#7b3f00'; btn.style.color = '#fff'; }
    _map.on('click', _onMapClickAddNest);
    _map.getContainer().style.cursor = 'crosshair';
    _map.getContainer().classList.add('tool-active');
  } else {
    if (btn) { btn.style.background = '#fff'; btn.style.color = '#333'; }
    _map.off('click', _onMapClickAddNest);
    _map.getContainer().style.cursor = '';
    _map.getContainer().classList.remove('tool-active');
  }
}

function mapDeleteNest(id) {
  _map.closePopup();
  showModal(
    'Supprimer ce nid',
    'Cette action est irréversible.',
    'Supprimer',
    async () => {
      const res = await dbNestDelete(id);
      if (res?.error) {
        showToast('Erreur : suppression échouée (' + (res.error.message || 'inconnue') + ')', 'error');
        return;
      }
      _nests = _nests.filter(n => n.id !== id);
      Dashboard.setNests(_nests);      // sync AVANT applyNestFilters (sinon filtre sur donnée périmée)
      _clearNestLayers();
      _drawNests((typeof Dashboard !== 'undefined' && Dashboard.applyNestFilters) ? Dashboard.applyNestFilters() : _nests);
      _setupNestClick(_canAddNestPermission);
      Dashboard.renderNests(_nests);   // sync liste après suppression depuis la carte
      showToast('Nid supprimé.');
    }
  );
}

// ── TOGGLE NIDS ───────────────────────────────────────────────

function _toggleNests() {
  _nestsVisible = !_nestsVisible;

  // Mettre à jour le bouton
  const btn = document.getElementById('btn-toggle-nests');
  if (btn) {
    btn.textContent = `🪺 Nids ${_nestsVisible ? 'visibles' : 'masqués'}`;
  }

  // Afficher ou masquer les marqueurs nids
  _nestLayers.forEach(l => {
    if (_nestsVisible) l.addTo(_map);
    else _map.removeLayer(l);
  });

  // Si on masque les nids pendant que "Ajouter un nid" est actif, on
  // désactive proprement ce mode (sinon le bouton reste en surbrillance
  // sans effet, le clic ne faisant plus qu'afficher un avertissement).
  if (!_nestsVisible && _addNestActive) _toggleAddNest();
}

// ── OUTIL DE MESURE DE DISTANCE ────────────────────────────────
// Clic = pose un point ; déplacement de la souris = distance en direct
// depuis le dernier point posé ; nouveau clic = fixe le segment et
// permet d'enchaîner (mesure cumulée sur plusieurs segments).

function _toggleMeasure() {
  _measureActive = !_measureActive;
  const btn = document.getElementById('btn-toggle-measure');

  if (_measureActive) {
    if (_guessActive) _toggleGuess(); // modes exclusifs
    if (btn) { btn.style.background = '#1e88e5'; btn.style.color = '#fff'; }
    // Le clic de mesure prend le pas sur l'ajout de nid tant qu'actif
    _map.off('click', _onMapClickAddNest);
    _map.on('click', _onMeasureClick);
    _map.on('mousemove', _onMeasureMouseMove);
    _map.getContainer().style.cursor = 'crosshair';
    _map.getContainer().classList.add('tool-active');
  } else {
    if (btn) { btn.style.background = '#fff'; btn.style.color = '#333'; }
    _map.off('click', _onMeasureClick);
    _map.off('mousemove', _onMeasureMouseMove);
    _map.getContainer().style.cursor = '';
    _map.getContainer().classList.remove('tool-active');
    _clearMeasure();
    // Restaure le clic d'ajout de nid s'il était autorisé
    if (_canAddNestPermission) _map.on('click', _onMapClickAddNest);
  }
}

function _clearMeasure() {
  _measurePoints = [];
  _measureLayers.forEach(l => _map.removeLayer(l));
  _measureLayers = [];
  if (_measureTooltip) { _map.removeLayer(_measureTooltip); _measureTooltip = null; }
}

function _formatDistance(meters) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(2)} km`;
}

function _onMeasureClick(e) {
  // Double-clic ou clic sur le dernier point : termine la mesure en cours
  if (_measurePoints.length > 0) {
    const marker = L.circleMarker(e.latlng, { radius: 5, color: '#1e88e5', fillColor: '#1e88e5', fillOpacity: 1 }).addTo(_map);
    const line   = L.polyline([_measurePoints[_measurePoints.length - 1], e.latlng], { color: '#1e88e5', weight: 3, dashArray: '6 4' }).addTo(_map);
    _measureLayers.push(marker, line);
  } else {
    const marker = L.circleMarker(e.latlng, { radius: 5, color: '#1e88e5', fillColor: '#1e88e5', fillOpacity: 1 }).addTo(_map);
    _measureLayers.push(marker);
  }
  _measurePoints.push(e.latlng);
}

function _onMeasureMouseMove(e) {
  if (_measurePoints.length === 0) return;

  const last  = _measurePoints[_measurePoints.length - 1];
  const total = _measurePoints.reduce((sum, p, i) =>
    i === 0 ? 0 : sum + _map.distance(_measurePoints[i - 1], p), 0
  ) + _map.distance(last, e.latlng);

  if (!_measureTooltip) {
    _measureTooltip = L.tooltip({ permanent: true, direction: 'right', offset: [10, 0], className: 'measure-tooltip' })
      .setLatLng(e.latlng)
      .setContent(_formatDistance(total))
      .addTo(_map);
  } else {
    _measureTooltip.setLatLng(e.latlng).setContent(_formatDistance(total));
  }
}

// ── POINT SUPPOSÉ (nid non confirmé) ───────────────────────────
// Outil ponctuel, rien n'est enregistré en base : place un repère,
// affiche ses coordonnées et un lien direct vers Google Maps pour s'y
// rendre sur le terrain.

function _toggleGuess() {
  _guessActive = !_guessActive;
  const btn = document.getElementById('btn-toggle-guess');

  if (_guessActive) {
    if (_measureActive) _toggleMeasure(); // modes exclusifs
    if (btn) { btn.style.background = '#e53935'; btn.style.color = '#fff'; }
    _map.off('click', _onMapClickAddNest);
    _map.on('click', _onGuessClick);
    _map.getContainer().style.cursor = 'crosshair';
    _map.getContainer().classList.add('tool-active');
  } else {
    if (btn) { btn.style.background = '#fff'; btn.style.color = '#333'; }
    _map.off('click', _onGuessClick);
    _map.getContainer().style.cursor = '';
    _map.getContainer().classList.remove('tool-active');
    if (_guessMarker) { _map.removeLayer(_guessMarker); _guessMarker = null; }
    if (_ignRouteLayer) { _map.removeLayer(_ignRouteLayer); _ignRouteLayer = null; }
    if (_canAddNestPermission) _map.on('click', _onMapClickAddNest);
  }
}

function _onGuessClick(e) {
  const { lat, lng } = e.latlng;
  const latStr = lat.toFixed(5);
  const lngStr = lng.toFixed(5);
  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latStr},${lngStr}`;
  // Géoportail IGN : cartes officielles françaises, bien plus précises
  // que Google Maps en zone rurale/forestière (parcelles, relief, sentiers).
  const ignUrl = `https://www.geoportail.gouv.fr/carte?c=${lngStr},${latStr}&z=19&l0=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2::GEOPORTAIL:OGC:WMTS(1)&permalink=yes`;

  if (_guessMarker) _map.removeLayer(_guessMarker);
  if (_ignRouteLayer) { _map.removeLayer(_ignRouteLayer); _ignRouteLayer = null; }

  _guessMarker = L.marker(e.latlng, {
    icon: L.divIcon({
      className: 'guess-marker',
      html: '<div style="font-size:28px;line-height:1;transform:translate(-50%,-100%)">📍</div>',
      iconSize: [0, 0],
    })
  }).addTo(_map);

  _guessMarker.bindPopup(`
    <div style="font-size:13px;line-height:1.6">
      <b>📍 Point supposé</b><br>
      ${latStr}, ${lngStr}<br>
      <a href="${ignUrl}" target="_blank" rel="noopener"
         style="display:inline-block;margin-top:6px;padding:6px 10px;background:#2d6a2d;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
        🗺️ Ouvrir sur Géoportail (IGN)
      </a><br>
      <a href="${gmapsUrl}" target="_blank" rel="noopener"
         style="display:inline-block;margin-top:6px;padding:6px 10px;background:#1e88e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
        🧭 Ouvrir dans Google Maps
      </a><br>
      <button class="ign-route-btn" data-lat="${latStr}" data-lng="${lngStr}"
         style="display:block;width:100%;margin-top:6px;padding:6px 10px;background:#e65100;color:#fff;border:none;border-radius:6px;font-weight:600;font-family:inherit;font-size:13px;cursor:pointer">
        🚗 Itinéraire IGN depuis ma position
      </button>
      <div class="ign-route-result" style="font-size:12px;color:#555;margin-top:4px"></div>
    </div>
  `, { maxWidth: 240 }).openPopup();
}

// ── ITINÉRAIRE IGN (Géoplateforme) depuis la position actuelle ──
// Calcule un itinéraire routier via l'API publique data.geopf.fr et le
// dessine directement sur la carte (aucun lien externe à ouvrir).
function _fetchIgnRoute(destLat, destLng, cb) {
  if (!navigator.geolocation) { cb(null, "Géolocalisation indisponible sur cet appareil"); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const startLat = pos.coords.latitude;
      const startLng = pos.coords.longitude;
      const url = `https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&start=${startLng},${startLat}&end=${destLng},${destLat}&profile=pedestrian&optimization=fastest&geometryFormat=geojson`;
      fetch(url)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(data => cb(data, null))
        .catch(() => cb(null, "Service d'itinéraire IGN indisponible pour le moment"));
    },
    () => cb(null, "Position actuelle indisponible (GPS refusé ou hors de portée)"),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
}

document.addEventListener('click', function(e) {
  const btn = e.target.closest('.ign-route-btn');
  if (!btn) return;
  const destLat = parseFloat(btn.dataset.lat);
  const destLng = parseFloat(btn.dataset.lng);
  const resultEl = btn.parentElement ? btn.parentElement.querySelector('.ign-route-result') : null;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Calcul en cours…';
  _fetchIgnRoute(destLat, destLng, (data, err) => {
    btn.disabled = false;
    btn.textContent = originalText;
    if (err || !data || !data.geometry || !data.geometry.coordinates) {
      if (resultEl) resultEl.textContent = '⚠️ ' + (err || "Itinéraire indisponible");
      return;
    }
    if (_ignRouteLayer) _map.removeLayer(_ignRouteLayer);
    const latlngs = data.geometry.coordinates.map(c => [c[1], c[0]]);
    _ignRouteLayer = L.polyline(latlngs, { color: '#e65100', weight: 5, opacity: 0.85 }).addTo(_map);
    _map.fitBounds(_ignRouteLayer.getBounds(), { padding: [30, 30] });
    const distKm = (data.distance / 1000).toFixed(1);
    const durMin = Math.round(data.duration / 60);
    if (resultEl) resultEl.textContent = `✅ ${distKm} km · ~${durMin} min à pied`;
  });
});


// ── SUGGÉRER LE 2e RELEVÉ (déterministe, sans IA) ──────────────
// À partir d'un 1er relevé : secteur LARGE (±25°, la direction d'un seul
// relevé est approximative) et deux postes conseillés de part et d'autre
// du rayon, choisis pour que le 2e relevé coupe le 1er à ~90°.
// Distance du trait = simple préréglage côté VigieNid : on ne s'y fie que
// pour dimensionner le dessin.

function _distM(lat1, lon1, lat2, lon2) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function _clearSuggest() {
  _suggestLayers.forEach(l => _map.removeLayer(l));
  _suggestLayers = [];
}

function _fetchWalk(fromLat, fromLng, toLat, toLng) {
  const url = `https://data.geopf.fr/navigation/itineraire?resource=bdtopo-osrm&start=${fromLng},${fromLat}&end=${toLng},${toLat}&profile=pedestrian&optimization=fastest&geometryFormat=geojson&distanceUnit=meter&timeUnit=second`;
  return fetch(url)
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(d => ({ m: d.distance, sec: d.duration }))
    .catch(() => null);
}

function mapSuggestSecond(signalId) {
  const s = _lastSignals.find(x => x.id === signalId);
  if (!s || !_map) return;
  _map.closePopup();
  _clearSuggest();

  const bearing = s.direction || 0;
  const D = Math.min(Math.max(s.distance || s.trait_length_m || CONFIG.DEFAULT_TRAIT_LENGTH_M, 400), 3000);
  const target = _destPoint(s.lat, s.lon, bearing, 0.6 * D);
  const off = Math.min(Math.max(0.5 * D, 250), 800);
  const cands = [
    { label: 'A (gauche)', pt: _destPoint(target[0], target[1], bearing - 90, off) },
    { label: 'B (droite)', pt: _destPoint(target[0], target[1], bearing + 90, off) },
  ];

  const sector = L.polygon(_buildFuseau(s.lat, s.lon, bearing, D, 25), {
    color: '#1565c0', weight: 1.5, dashArray: '6 4', fillColor: '#1565c0', fillOpacity: 0.10,
  }).addTo(_map);
  _suggestLayers.push(sector);

  cands.forEach(c => {
    const m = L.marker(c.pt, {
      icon: L.divIcon({
        className: '', iconSize: [26, 26], iconAnchor: [13, 13],
        html: `<div style="width:26px;height:26px;border-radius:50%;background:#1565c0;color:#fff;border:2px solid #fff;` +
              `box-shadow:0 1px 4px rgba(0,0,0,.4);font:700 13px 'DM Sans',sans-serif;display:flex;align-items:center;justify-content:center">${c.label[0]}</div>`,
      }),
    }).addTo(_map);
    c.marker = m;
    _suggestLayers.push(m);
    const body = (txt) => `<div style="font-family:'DM Sans',sans-serif;font-size:12px;min-width:170px">` +
      `<b>Poste ${c.label}</b><br>Viser vers le secteur bleu : le 2e relevé coupera le 1er à ~90°.<br>` +
      `<span style="color:#555">${txt}</span><br>` +
      `<span style="color:#999;font-size:11px">Suggestion indicative (1 seul relevé : direction ±25°).</span></div>`;
    m.bindPopup(body('⏳ Calcul du temps de marche…'), { maxWidth: 240 });
    _fetchWalk(s.lat, s.lon, c.pt[0], c.pt[1]).then(w => {
      m.setPopupContent(body(w
        ? `🚶 ${(w.m / 1000).toFixed(1)} km · ~${Math.round(w.sec / 60)} min à pied depuis le 1er relevé`
        : 'Temps de marche indisponible'));
    });
  });

  _map.fitBounds(sector.getBounds().extend(cands[0].pt).extend(cands[1].pt), { padding: [40, 40] });
  showToast('Postes A et B suggérés — touchez un poste pour le temps de marche.');
}
