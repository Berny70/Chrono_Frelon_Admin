// ── pages/pilots.js — Gestion des pilotes ────────────────────
// Dépend de : config.js, db.js, auth.js, ui.js, dashboard.js

const Pilots = (() => {

  // ── CRÉER UN PILOTE ────────────────────────────────────────

  async function create() {
    const prenom  = document.getElementById('pilot-prenom').value.trim();
    const nom     = document.getElementById('pilot-nom').value.trim();
    const email   = document.getElementById('pilot-email').value.trim();
    const secteur = document.getElementById('pilot-secteur').value.trim();

    if (!prenom || !nom || !email || !secteur) {
      showAuthMsg('new-pilot-msg', 'error', 'Tous les champs sont requis.');
      return;
    }

    const profile = Auth.getProfile();
    const btn = document.getElementById('btn-create-pilot');
    btn.disabled = true;

    // 1. Créer le profil en base
    const newId = crypto.randomUUID();
    const { error } = await dbProfileCreate({
      id:          newId,
      email, nom, prenom,
      role:        'pilot',
      departement: profile.departement || '—',
      secteur,
      parent_id:   profile.id,
    });

    if (error) {
      btn.disabled = false;
      showAuthMsg('new-pilot-msg', 'error', error.message || 'Erreur lors de la création.');
      return;
    }

  btn.disabled = false;
    // 3. Fermer le panneau et rafraîchir
    hideOverlay('overlay-new-pilot');
    _clearForm();

    const pilots = await dbPilotsGetByParent(profile.id);
    Dashboard.setPilots(pilots);

    // 4. Afficher le message à envoyer
    showCreationMessage(prenom, nom, email);
  }

  function _clearForm() {
    ['pilot-prenom', 'pilot-nom', 'pilot-email', 'pilot-secteur']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    clearAuthMsg('new-pilot-msg');
  }

  // ── BLOQUER UN PILOTE ──────────────────────────────────────

  async function block(id, name) {
    showModal(
      'Bloquer ce pilote',
      `Bloquer l'accès de ${name} à ChassNid ?`,
      'Bloquer',
      async () => {
        await dbProfileUpdateRole(id, 'blocked');
        showToast(`${name} bloqué.`);
        await _refresh();
      }
    );
  }

  // ── DÉBLOQUER UN PILOTE ────────────────────────────────────

  async function unblock(id, name) {
    showModal(
      'Débloquer ce pilote',
      `Rétablir l'accès de ${name} à ChassNid ?`,
      'Débloquer',
      async () => {
        await dbProfileUpdateRole(id, 'pilot');
        showToast(`${name} débloqué.`);
        await _refresh();
      }
    );
  }

  // ── RÉINITIALISER LE PIN D'UN PILOTE ──────────────────────

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

  // ── SUPPRIMER UN PILOTE ────────────────────────────────────

  async function remove(id, name) {
    showModal(
      'Supprimer ce pilote',
      `Supprimer ${name} et toutes ses sentinelles rattachées ? Cette action est irréversible.`,
      'Supprimer',
      async () => {
        await dbProfileDelete(id);
        showToast(`${name} supprimé.`);
        await _refresh();
      }
    );
  }

  // ── VOIR LES UTILISATEURS D'UN PILOTE ─────────────────────

  async function view(pilotId, pilotName) {
    document.getElementById('view-title').textContent = `Sentinelles de ${pilotName}`;
    const list = document.getElementById('view-list');
    list.innerHTML = '<p class="form-hint">Chargement…</p>';
    showOverlay('overlay-view');

    const users = await dbPilotUsersGet(pilotId);
    if (users.length === 0) {
      list.innerHTML = '<p class="form-hint">Aucune sentinelle rattachée.</p>';
    } else {
      list.innerHTML = users.map(u => `
        <div class="list-item" style="display:flex;align-items:center;gap:10px">
          <div class="avatar" style="width:36px;height:36px;font-size:13px">👤</div>
          <div>
            <div style="font-weight:600;font-size:14px">${u.phone_id}</div>
            <div style="font-size:12px;color:var(--text-muted)">${u.signal_count ?? 0} signalement(s) · ${u.blocked ? '🔴 Bloqué' : '🟢 Actif'}</div>
          </div>
        </div>`).join('');
    }
  }

  // ── MIGRER UN PILOTE ───────────────────────────────────────

  async function migrate(oldId, oldName) {
    document.getElementById('migrate-title').textContent = `Migrer ${oldName}`;
    document.getElementById('migrate-desc').textContent =
      `Toutes les sentinelles rattachées à ${oldName} seront réattribuées au remplaçant. ${oldName} sera ensuite supprimé.`;
    document.getElementById('migrate-msg').className   = 'auth-message';
    document.getElementById('migrate-msg').textContent = '';

    const all = Dashboard.getPilots().filter(p => p.id !== oldId);
    const sel = document.getElementById('migrate-select');
    sel.innerHTML = '<option value="">— Sélectionner —</option>' +
      all.map(p => `<option value="${p.id}">${p.prenom} ${p.nom} (${p.secteur || '—'})</option>`).join('');

    document.getElementById('migrate-dept-group').style.display = 'none';
    ['migrate-prenom','migrate-nom','migrate-email','migrate-secteur']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    _migrateSetMode('existing');

    const btn = document.getElementById('btn-migrate-confirm');
    btn.dataset.oldId   = oldId;
    btn.dataset.oldName = oldName;
    btn.dataset.context = 'pilot';

    showOverlay('overlay-migrate');
  }

  // ── RAFRAÎCHIR LA LISTE ────────────────────────────────────

  async function _refresh() {
    const profile = Auth.getProfile();
    const pilots  = await dbPilotsGetByParent(profile.id);
    Dashboard.setPilots(pilots);
  }

  // ── INIT ───────────────────────────────────────────────────

  function init() {
    // Ouvrir le panneau création
    document.getElementById('btn-new-pilot')?.addEventListener('click', () => {
      _clearForm();
      showOverlay('overlay-new-pilot');
    });

    // Créer
    document.getElementById('btn-create-pilot')?.addEventListener('click', create);

    // Filtre par territoire
    document.getElementById('search-pilots')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      const filtered = Dashboard.getPilots().filter(p =>
        (p.secteur || '').toLowerCase().includes(q) ||
        (p.departement || '').toLowerCase().includes(q) ||
        (p.nom || '').toLowerCase().includes(q) ||
        (p.prenom || '').toLowerCase().includes(q)
      );
      renderPilots(filtered);
    });

    // Délégation événements sur la liste
    document.getElementById('pilots-list')?.addEventListener('click', e => {
      const blockBtn   = e.target.closest('.btn-block[data-pilot-id]');
      const unblockBtn = e.target.closest('.btn-unblock[data-pilot-id]');
      const deleteBtn  = e.target.closest('.btn-delete[data-pilot-id]');
      const migrateBtn = e.target.closest('.btn-migrate[data-pilot-id]');
      const viewBtn    = e.target.closest('.btn-view[data-pilot-id]');

      if (blockBtn)   block(blockBtn.dataset.pilotId, blockBtn.dataset.pilotName);
      if (unblockBtn) unblock(unblockBtn.dataset.pilotId, unblockBtn.dataset.pilotName);
      if (deleteBtn)  remove(deleteBtn.dataset.pilotId, deleteBtn.dataset.pilotName);
      if (migrateBtn) migrate(migrateBtn.dataset.pilotId, migrateBtn.dataset.pilotName);
      if (viewBtn)    view(viewBtn.dataset.pilotId, viewBtn.dataset.pilotName);
    });
  }

  return { init, block, unblock, resetPin, remove, migrate, view };

})();
