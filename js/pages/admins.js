// ── pages/admins.js — Gestion des admins départementaux ──────
// Dépend de : config.js, db.js, auth.js, ui.js, dashboard.js

const Admins = (() => {

  // ── CRÉER UN ADMIN ─────────────────────────────────────────

  async function create() {
    const prenom  = document.getElementById('admin-prenom').value.trim();
    const nom     = document.getElementById('admin-nom').value.trim();
    const email   = document.getElementById('admin-email').value.trim();
    const dept    = document.getElementById('admin-dept').value.trim();
    const secteur = document.getElementById('admin-secteur').value.trim();

    if (!prenom || !nom || !email || !dept) {
      showAuthMsg('new-admin-msg', 'error', 'Tous les champs sont requis sauf Territoire.');
      return;
    }

    const btn = document.getElementById('btn-create-admin');
    btn.disabled = true;

    // 1. Créer le profil en base
    const newId = crypto.randomUUID();
    const { error } = await dbProfileCreate({
      id:          newId,
      email, nom, prenom,
      role:        'admin_dept',
      departement: dept,
      secteur,
      parent_id:   Auth.getProfile().id,
    });

    if (error) {
      btn.disabled = false;
      showAuthMsg('new-admin-msg', 'error', error.message || 'Erreur lors de la création.');
      return;
    }

  btn.disabled = false;


    // 3. Fermer le panneau et rafraîchir
    hideOverlay('overlay-new-admin');
    _clearForm();

    const admins = await dbAdminsGetAll();
    Dashboard.setAdmins(admins);

    // 4. Afficher le message à envoyer
    showCreationMessage(prenom, nom, email);
  }

  function _clearForm() {
    ['admin-prenom', 'admin-nom', 'admin-email', 'admin-dept', 'admin-secteur']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    clearAuthMsg('new-admin-msg');
  }

  // ── BLOQUER UN ADMIN ───────────────────────────────────────

  async function block(id, name) {
    showModal(
      'Bloquer cet administrateur',
      `Bloquer l'accès de ${name} à ChassNid ?`,
      'Bloquer',
      async () => {
        await dbProfileUpdateRole(id, 'blocked');
        showToast(`${name} bloqué.`);
        const admins = await dbAdminsGetAll();
        Dashboard.setAdmins(admins);
      }
    );
  }

  // ── DÉBLOQUER UN ADMIN ─────────────────────────────────────

  async function unblock(id, name) {
    showModal(
      'Débloquer cet administrateur',
      `Rétablir l'accès de ${name} à ChassNid ?`,
      'Débloquer',
      async () => {
        await dbProfileUpdateRole(id, 'admin_dept');
        showToast(`${name} débloqué.`);
        const admins = await dbAdminsGetAll();
        Dashboard.setAdmins(admins);
      }
    );
  }

  // ── RÉINITIALISER LE PIN D'UN ADMIN ───────────────────────

  async function resetPin(email, name) {
    showModal(
      'Réinitialiser le PIN',
      `Remettre le PIN de ${name} à 000000 ?`,
      'Réinitialiser',
      async () => {
        const { ok, error } = await Auth.resetPin(email);
        if (error) {
          showToast('Erreur : ' + error);
        } else {
          showToast(`PIN de ${name} remis à 000000.`);
        }
      }
    );
  }

  // ── MIGRER UN ADMIN ────────────────────────────────────────

  async function migrate(oldId, oldName) {
    document.getElementById('migrate-title').textContent = `Migrer ${oldName}`;
    document.getElementById('migrate-desc').textContent =
      `Tous les pilotes rattachés à ${oldName} seront réattribués au remplaçant. ${oldName} sera ensuite supprimé.`;
    document.getElementById('migrate-msg').className   = 'auth-message';
    document.getElementById('migrate-msg').textContent = '';

    const all = Dashboard.getAdmins().filter(a => a.id !== oldId);
    const sel = document.getElementById('migrate-select');
    sel.innerHTML = '<option value="">— Sélectionner —</option>' +
      all.map(a => `<option value="${a.id}">${a.prenom} ${a.nom} (${a.secteur || a.departement || '—'})</option>`).join('');

    document.getElementById('migrate-dept-group').style.display = '';
    ['migrate-prenom','migrate-nom','migrate-email','migrate-dept','migrate-secteur']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    _migrateSetMode('existing');

    const btn = document.getElementById('btn-migrate-confirm');
    btn.dataset.oldId   = oldId;
    btn.dataset.oldName = oldName;
    btn.dataset.context = 'admin';

    showOverlay('overlay-migrate');
  }

  // ── SUPPRIMER UN ADMIN ─────────────────────────────────────

  async function remove(id, name) {
    showModal(
      'Supprimer cet administrateur',
      `Supprimer ${name} et tous ses pilotes rattachés ? Cette action est irréversible.`,
      'Supprimer',
      async () => {
        await dbProfileDelete(id);
        showToast(`${name} supprimé.`);
        const admins = await dbAdminsGetAll();
        Dashboard.setAdmins(admins);
      }
    );
  }

  // ── INIT ───────────────────────────────────────────────────

  function init() {
    // Ouvrir le panneau création
    document.getElementById('btn-new-admin')?.addEventListener('click', () => {
      _clearForm();
      showOverlay('overlay-new-admin');
    });

    // Créer
    document.getElementById('btn-create-admin')?.addEventListener('click', create);

    // Filtre par territoire
    document.getElementById('search-admins')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      const filtered = Dashboard.getAdmins().filter(a =>
        (a.secteur || '').toLowerCase().includes(q) ||
        (a.departement || '').toLowerCase().includes(q) ||
        (a.nom || '').toLowerCase().includes(q) ||
        (a.prenom || '').toLowerCase().includes(q)
      );
      renderAdmins(filtered);
    });

    // Délégation événements sur la liste
    document.getElementById('admins-list')?.addEventListener('click', e => {
      const blockBtn   = e.target.closest('.btn-block[data-admin-id]');
      const unblockBtn = e.target.closest('.btn-unblock[data-admin-id]');
      const deleteBtn  = e.target.closest('.btn-delete[data-admin-id]');
      const migrateBtn = e.target.closest('.btn-migrate[data-admin-id]');

      if (blockBtn)   block(blockBtn.dataset.adminId, blockBtn.dataset.adminName);
      if (unblockBtn) unblock(unblockBtn.dataset.adminId, unblockBtn.dataset.adminName);
      if (deleteBtn)  remove(deleteBtn.dataset.adminId, deleteBtn.dataset.adminName);
      if (migrateBtn) migrate(migrateBtn.dataset.adminId, migrateBtn.dataset.adminName);
    });
  }

  return { init, block, unblock, resetPin, remove, migrate };

})();
