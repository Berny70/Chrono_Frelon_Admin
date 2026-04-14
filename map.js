let leafletMap = null;

function mapInit(signals, blockedPhones) {
  const pts = signals.filter(s => s.lat && s.lon);
  if (!pts.length) return;

  if (!leafletMap) {
    leafletMap = L.map('map').setView([pts[0].lat, pts[0].lon], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>'
    }).addTo(leafletMap);
  } else {
    leafletMap.eachLayer(l => {
      if (l instanceof L.CircleMarker) leafletMap.removeLayer(l);
    });
  }

  const loc = lang === 'fr' ? 'fr-FR' : 'de-DE';

  pts.forEach(s => {
    const isBlocked = blockedPhones.has(s.phone_id);
    const date = new Date(s.created_at).toLocaleString(loc);

    const marker = L.circleMarker([s.lat, s.lon], {
      radius:      7,
      fillColor:   isBlocked ? '#c0392b' : '#2d4a2d',
      color:       '#fff',
      weight:      1.5,
      fillOpacity: 0.85,
    });

    marker.bindTooltip(date, {
      permanent: false,
      direction: 'top',
      offset:    [0, -8],
      sticky:    true
    });

    marker.bindPopup(`
      <div style="min-width:180px">
        <div style="font-weight:600;margin-bottom:6px">${date}</div>
        <div style="font-size:12px;color:#666;margin-bottom:4px">${s.distance||0}m · ${s.direction||0}°</div>
        <div style="font-size:11px;font-family:monospace;color:#888;margin-bottom:10px">${s.phone_id||'—'}</div>
        ${isBlocked ? `<div style="color:#c0392b;font-size:12px;margin-bottom:8px">⛔ ${t('badge_blocked')}</div>` : ''}
        <button onclick="App.confirmDelete(${s.id})" style="
          width:100%;padding:7px;border:none;border-radius:6px;
          background:#c0392b;color:#fff;font-size:13px;font-weight:500;
          cursor:pointer;font-family:'DM Sans',sans-serif
        ">🗑 Supprimer</button>
      </div>
    `, { maxWidth: 220 });

    marker.on('click', () => mapHighlightSignal(s.id));
    marker.addTo(leafletMap);
  });

  leafletMap.fitBounds(
    L.latLngBounds(pts.map(s => [s.lat, s.lon])),
    { padding: [20, 20] }
  );
}

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