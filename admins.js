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
    const pseudo  = document.getElementById('admin-pseudo')?.value.trim() || '';

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

    // 2. Enregistrer le pseudo si renseigné
    if (pseudo) {
      await dbUpdatePseudo(newId, newId, pseudo);
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
    ['admin-prenom', 'admin-nom', 'admin-email', 'admin-dept', 'admin-secteur', 'admin-pseudo']
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

  // ── PARAMÈTRES D'UN ADMIN ────────────────────────────────

  function paramsAdmin(adminId, adminName, traitM, validityDays) {
    document.getElementById('params-title').textContent = `Paramètres — ${adminName}`;
    document.getElementById('params-msg').className   = 'auth-message';
    document.getElementById('params-msg').textContent = '';

    const traitSlider    = document.getElementById('params-trait');
    const validitySlider = document.getElementById('params-validity');
    const traitVal       = document.getElementById('params-trait-val');
    const validityVal    = document.getElementById('params-validity-val');

    traitSlider.value    = traitM || 500;
    validitySlider.value = validityDays || 30;
    traitVal.textContent    = `${traitSlider.value} m`;
    validityVal.textContent = `${validitySlider.value} jour${validitySlider.value > 1 ? 's' : ''}`;

    traitSlider.oninput    = () => traitVal.textContent    = `${traitSlider.value} m`;
    validitySlider.oninput = () => validityVal.textContent = `${validitySlider.value} jour${validitySlider.value > 1 ? 's' : ''}`;

    document.getElementById('btn-params-save').dataset.pilotId  = adminId;
    document.getElementById('btn-params-save').dataset.context  = 'admin';
    showOverlay('overlay-params');
  }

  // ── VOIR LES SENTINELLES DIRECTES D'UN ADMIN ──────────────

  async function viewSentinelles(adminId, adminName) {
    document.getElementById('view-title').textContent = `Sentinelles de ${adminName}`;
    const list = document.getElementById('view-list');
    list.innerHTML = '<p class="form-hint">Chargement…</p>';
    showOverlay('overlay-view');

    const users = await dbPilotUsersGet(adminId);
    if (users.length === 0) {
      list.innerHTML = '<p class="form-hint">Aucune sentinelle directe.</p>';
    } else {
      list.innerHTML = users.map(u => `
        <div class="list-item" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div class="avatar" style="width:36px;height:36px;font-size:13px;flex-shrink:0">👤</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">${u.phone_id.substring(0,8)}…</div>
            <input type="text"
              class="pseudo-input"
              data-phone="${u.phone_id}"
              data-pilot="${adminId}"
              value="${u.pseudo || ''}"
              placeholder="Donner un pseudo…"
              style="width:100%;border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:13px;font-family:inherit">
            <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${u.nb_observations ?? 0} signalement(s) · ${u.blocked ? '🔴 Bloqué' : '🟢 Actif'}</div>
          </div>
        </div>`).join('');

      list.querySelectorAll('.pseudo-input').forEach(input => {
        input.addEventListener('blur', async () => {
          const { error } = await dbUpdatePseudo(input.dataset.phone, input.dataset.pilot, input.value);
          if (error) showToast('Erreur : ' + (error.message || error));
          else showToast('Pseudo enregistré.');
        });
      });
    }
  }

  // ── VOIR LES PILOTES D'UN ADMIN ────────────────────────────

  function view(adminId, adminName) {
    const pilots = Dashboard.getPilots().filter(p => p.parent_id === adminId);
    document.getElementById('view-title').textContent = `Pilotes de ${adminName}`;
    const list = document.getElementById('view-list');
    if (pilots.length === 0) {
      list.innerHTML = '<p class="form-hint">Aucun pilote rattaché.</p>';
    } else {
      list.innerHTML = pilots.map(p => `
        <div class="list-item" style="display:flex;align-items:center;gap:10px">
          <div class="avatar" style="width:36px;height:36px;font-size:13px">${p.prenom[0]}${p.nom[0]}</div>
          <div>
            <div style="font-weight:600;font-size:14px">${p.prenom} ${p.nom}</div>
            <div style="font-size:12px;color:var(--text-muted)">${p.secteur || '—'}</div>
          </div>
        </div>`).join('');
    }
    showOverlay('overlay-view');
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
      const blockBtn    = e.target.closest('.btn-block[data-admin-id]');
      const unblockBtn  = e.target.closest('.btn-unblock[data-admin-id]');
      const deleteBtn   = e.target.closest('.btn-delete[data-admin-id]');
      const resetBtn    = e.target.closest('.btn-reset-pin[data-admin-id]');
      const migrateBtn  = e.target.closest('.btn-migrate[data-admin-id]');
      const viewBtn     = e.target.closest('.btn-view[data-admin-id]');
      const viewSentBtn = e.target.closest('.btn-view-sent[data-admin-id]');
      const messageBtn  = e.target.closest('.btn-message[data-admin-id]');
      const paramsBtn   = e.target.closest('.btn-params[data-admin-id]');

      if (blockBtn)    block(blockBtn.dataset.adminId, blockBtn.dataset.adminName);
      if (unblockBtn)  unblock(unblockBtn.dataset.adminId, unblockBtn.dataset.adminName);
      if (deleteBtn)   remove(deleteBtn.dataset.adminId, deleteBtn.dataset.adminName);
      if (resetBtn)    resetPin(resetBtn.dataset.adminEmail, resetBtn.dataset.adminName);
      if (migrateBtn)  migrate(migrateBtn.dataset.adminId, migrateBtn.dataset.adminName);
      if (viewBtn)     view(viewBtn.dataset.adminId, viewBtn.dataset.adminName);
      if (viewSentBtn) viewSentinelles(viewSentBtn.dataset.adminId, viewSentBtn.dataset.adminName);
      if (messageBtn)  showCreationMessage(messageBtn.dataset.adminPrenom, messageBtn.dataset.adminNom, messageBtn.dataset.adminEmail);
      if (paramsBtn)   paramsAdmin(paramsBtn.dataset.adminId, paramsBtn.dataset.adminName, parseInt(paramsBtn.dataset.trait), parseInt(paramsBtn.dataset.validity));
    });
  }

  return { init, block, unblock, resetPin, remove, migrate, view, viewSentinelles, paramsAdmin };

})();
