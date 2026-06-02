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
  _initMigrateOverlay();

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
  updateTopbar(profile);
  document.getElementById('topbar-sub').textContent =
    (profile.secteur || profile.canton || '—') +
    ' · ' + (profile.departement || '—');

  showScreen('dashboard');
  applyRoleUI(profile.role);
  switchTab('map');
  await Dashboard.load();
}

// ── OVERLAY MIGRATION ─────────────────────────────────────────

function _migrateSetMode(mode) {
  const isExisting = mode === 'existing';
  const secEx  = document.getElementById('migrate-section-existing');
  const secNew = document.getElementById('migrate-section-new');
  const btnEx  = document.getElementById('migrate-mode-existing');
  const btnNew = document.getElementById('migrate-mode-new');
  const btnOk  = document.getElementById('btn-migrate-confirm');
  if (secEx)  secEx.style.display  = isExisting ? '' : 'none';
  if (secNew) secNew.style.display = isExisting ? 'none' : '';
  if (btnEx)  btnEx.style.opacity  = isExisting ? '1' : '0.5';
  if (btnNew) btnNew.style.opacity = isExisting ? '0.5' : '1';
  if (btnOk)  btnOk.dataset.mode   = mode;
}

function _initMigrateOverlay() {
  document.getElementById('migrate-mode-existing')?.addEventListener('click', () => _migrateSetMode('existing'));
  document.getElementById('migrate-mode-new')?.addEventListener('click',      () => _migrateSetMode('new'));

  document.getElementById('btn-migrate-confirm')?.addEventListener('click', async () => {
    const btn     = document.getElementById('btn-migrate-confirm');
    const oldId   = btn.dataset.oldId;
    const oldName = btn.dataset.oldName;
    const context = btn.dataset.context;
    const mode    = btn.dataset.mode || 'existing';

    document.getElementById('migrate-msg').className   = 'auth-message';
    document.getElementById('migrate-msg').textContent = '';
    btn.disabled = true;

    let newId = null;

    if (mode === 'existing') {
      newId = document.getElementById('migrate-select').value;
      if (!newId) {
        showAuthMsg('migrate-msg', 'error', 'Veuillez sélectionner un remplaçant.');
        btn.disabled = false;
        return;
      }
    }

    if (mode === 'new') {
      const prenom  = document.getElementById('migrate-prenom').value.trim();
      const nom     = document.getElementById('migrate-nom').value.trim();
      const email   = document.getElementById('migrate-email').value.trim();
      const secteur = document.getElementById('migrate-secteur').value.trim();
      const dept    = document.getElementById('migrate-dept').value.trim();

      if (!prenom || !nom || !email || !secteur) {
        showAuthMsg('migrate-msg', 'error', 'Tous les champs sont requis sauf Département.');
        btn.disabled = false;
        return;
      }

      const profile = Auth.getProfile();
      newId = crypto.randomUUID();
      const role = context === 'admin' ? 'admin_dept' : 'pilot';

      const { error } = await dbProfileCreate({
        id: newId, email, nom, prenom, role,
        departement: dept || profile.departement || '—',
        canton:      secteur,
        secteur,
        parent_id: profile.id,
      });

      if (error) {
        showAuthMsg('migrate-msg', 'error', error.message || 'Erreur lors de la création du compte.');
        btn.disabled = false;
        return;
      }
    }

    const { error } = await dbProfileMigrate(oldId, newId);
    btn.disabled = false;

    if (error) {
      showAuthMsg('migrate-msg', 'error', error.message || 'Erreur lors de la migration.');
      return;
    }

    hideOverlay('overlay-migrate');
    showToast(`${oldName} migré avec succès.`);

    if (context === 'admin') {
      const admins = await dbAdminsGetAll();
      Dashboard.setAdmins(admins);
    } else {
      const pilots = await dbPilotsGetByParent();
      Dashboard.setPilots(pilots);
    }
  });
}

