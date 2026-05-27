// ── app.js — Point d'entrée de ChassNid ──────────────────────
// Dépend de : tous les autres modules
// Chargé en dernier dans index.html

document.addEventListener('DOMContentLoaded', async () => {

  // ── INITIALISATION DES MODULES ─────────────────────────────
  Login.init();
  Dashboard.init();
  Admins.init();
  Pilots.init();
  Signals.init();

  // ── VÉRIFICATION DE SESSION AU DÉMARRAGE ──────────────────
  const profile = await Auth.verify();

  if (profile) {
    _enterDashboard(profile);
  } else {
    showScreen('login');
  }

  // ── ÉVÉNEMENT LOGIN ────────────────────────────────────────
  window.addEventListener('chassnid:login', async e => {
    _enterDashboard(e.detail);
  });

});

// ── ENTRÉE DANS LE DASHBOARD ───────────────────────────────────

async function _enterDashboard(profile) {
  // Topbar
  updateTopbar(profile);
  document.getElementById('topbar-sub').textContent =
    (profile.secteur || profile.canton || '—') +
    ' · ' + (profile.departement || '—');

  // Version dans la topbar
  const vEl = document.querySelector('.topbar-info .topbar-sub');

  // Afficher le dashboard
  showScreen('dashboard');

  // Appliquer les droits selon le rôle
  applyRoleUI(profile.role);

  // Aller sur l'onglet carte par défaut
  switchTab('map');

  // Charger les données
  await Dashboard.load();
}
