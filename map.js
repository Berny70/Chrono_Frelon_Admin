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

  pts.forEach(s => {
    const isBlocked = blockedPhones.has(s.phone_id);
    const date = new Date(s.created_at).toLocaleString(lang === 'fr' ? 'fr-FR' : 'de-DE');
    L.circleMarker([s.lat, s.lon], {
      radius:      6,
      fillColor:   isBlocked ? '#c0392b' : '#2d4a2d',
      color:       '#fff',
      weight:      1.5,
      fillOpacity: 0.85,
    })
    .bindPopup(`
      <b>${date}</b><br>
      ${s.distance || 0}m · ${s.direction || 0}°<br>
      <small style="font-family:monospace">${s.phone_id || '—'}</small>
      ${isBlocked ? `<br><span style="color:#c0392b;font-weight:500">${t('badge_blocked')}</span>` : ''}
    `)
    .addTo(leafletMap);
  });

  leafletMap.fitBounds(
    L.latLngBounds(pts.map(s => [s.lat, s.lon])),
    { padding: [20, 20] }
  );
}

function mapInvalidate() {
  if (leafletMap) setTimeout(() => leafletMap.invalidateSize(), 50);
}
