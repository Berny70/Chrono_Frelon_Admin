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
let _nestsVisible = true;
let _canAddNestPermission = false;
let _measureActive  = false;
let _measurePoints   = [];   // [L.LatLng, ...] — points déjà posés
let _measureLayers   = [];   // marqueurs + segments affichés
let _measureTooltip  = null; // affichage flottant de la distance en cours
let _guessActive = false;
let _guessMarker = null;

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
          ${(sentinelMap && sentinelMap[s.phone_id]?.pseudo) ? '🏷️ ' + sentinelMap[s.phone_id].pseudo : s.phone_id?.substring(0,8) + '…'}
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

function _drawNests(nests) {
  nests.forEach(n => {
    const icon   = _getNestIcon(n.annee, n.type);
    const marker = L.marker([n.lat, n.lon], { icon });
    if (_nestsVisible) marker.addTo(_map);
    const date     = n.found_at ? new Date(n.found_at).toLocaleDateString('fr-FR') : '—';
    const pilote = n.pilot_nom || n.declarant || '—';
    const declarantExtra = (n.declarant && n.pilot_nom && n.declarant !== n.pilot_nom)
      ? ` <span style="font-size:11px;color:#888">(déclaré par : ${n.declarant})</span>` : '';
    const c = _getQueenColor(n.annee);
    const anneeStr = n.annee ? ` ${n.annee} <span style="display:inline-block;width:10px;height:10px;background:${c.bg};border:2px solid ${c.border};border-radius:50%;vertical-align:middle"></span>` : ' 2026 <span style="display:inline-block;width:10px;height:10px;background:#f5f5f5;border:2px solid #9e9e9e;border-radius:50%;vertical-align:middle"></span>';
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

  const { lat, lng } = e.latlng;
  const today = new Date().toISOString().split('T')[0];

  showModal(
    '🪺 Marquer un nid trouvé',
    `Position : ${lat.toFixed(5)}, ${lng.toFixed(5)}<br><br>` +
    `Date : <input type="date" id="nest-date-input" value="${today}" ` +
    `style="border:1px solid #ccc;border-radius:6px;padding:4px 8px;font-size:14px"><br><br>` +
    `Type : <label style="margin-right:12px"><input type="radio" name="nest-type" value="secondaire" checked> 🔴 Secondaire</label>` +
    `<label><input type="radio" name="nest-type" value="primaire"> 🟠 Primaire</label>`,
    'Confirmer',
    async () => {
      const foundAt = document.getElementById('nest-date-input')?.value || today;
      const nestType = document.querySelector('input[name="nest-type"]:checked')?.value || 'secondaire';
      const { ok, error } = await dbNestAdd(lat, lng, foundAt, nestType);
      if (error) {
        showToast('Erreur : ' + (error.message || error));
      } else {
        showToast('Nid enregistré !');
        // Recharger les nids avec filtre rayon
        const allNests = await dbNestsGetAll();
        const profile = Auth.getProfile();
        let filtered = allNests;
        if (profile?.lat && profile?.lon) {
          const R = 6371, radius = (typeof Dashboard !== 'undefined' && Dashboard.getRadius) ? Dashboard.getRadius() : 10;
          filtered = allNests.filter(n => {
            if (!n.lat || !n.lon) return false;
            const dLat = (n.lat - profile.lat) * Math.PI / 180;
            const dLon = (n.lon - profile.lon) * Math.PI / 180;
            const a = Math.sin(dLat/2)**2 + Math.cos(profile.lat*Math.PI/180) * Math.cos(n.lat*Math.PI/180) * Math.sin(dLon/2)**2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) <= radius;
          });
        }
        _clearNestLayers();
        _nests = filtered;
        _drawNests(filtered);
        Dashboard.setNests(filtered);   // sync dashboard._nests
        Dashboard.renderNests(filtered);
        _setupNestClick(_canAddNestPermission);
      }
    }
  );
}

function _setupNestClick(canAdd) {
  _canAddNestPermission = canAdd;
  _map.off('click', _onMapClickAddNest);
  if (canAdd) {
    _map.on('click', _onMapClickAddNest);
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
      _clearNestLayers();
      _drawNests(_nests);
      _setupNestClick(_canAddNestPermission);
      Dashboard.renderNests(_nests);   // sync liste après suppression depuis la carte
      Dashboard.setNests(_nests);      // sync _nests dashboard pour éviter retour du fantôme
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
    if (_canAddNestPermission) _map.on('click', _onMapClickAddNest);
  }
}

function _onGuessClick(e) {
  const { lat, lng } = e.latlng;
  const latStr = lat.toFixed(5);
  const lngStr = lng.toFixed(5);
  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latStr},${lngStr}`;

  if (_guessMarker) _map.removeLayer(_guessMarker);

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
      <a href="${gmapsUrl}" target="_blank" rel="noopener"
         style="display:inline-block;margin-top:6px;padding:6px 10px;background:#1e88e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
        🧭 Ouvrir dans Google Maps
      </a>
    </div>
  `, { maxWidth: 220 }).openPopup();
}
