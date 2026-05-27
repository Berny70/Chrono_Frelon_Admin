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
      `Supprimer ${name} et tous ses utilisateurs rattachés ? Cette action est irréversible.`,
      'Supprimer',
      async () => {
        await dbProfileDelete(id);
        showToast(`${name} supprimé.`);
        await _refresh();
      }
    );
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

      if (blockBtn)   block(blockBtn.dataset.pilotId, blockBtn.dataset.pilotName);
      if (unblockBtn) unblock(unblockBtn.dataset.pilotId, unblockBtn.dataset.pilotName);
      if (deleteBtn)  remove(deleteBtn.dataset.pilotId, deleteBtn.dataset.pilotName);
    });
  }

  return { init, block, unblock, resetPin, remove };

})();
