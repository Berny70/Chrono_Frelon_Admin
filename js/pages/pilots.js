// ── pages/pilots.js — Gestion des pilotes ────────────────────
// Dépend de : config.js, db.js, auth.js, ui.js, dashboard.js

const Pilots = (() => {

  // ── CRÉER UN PILOTE ────────────────────────────────────────

  function geolocatePilot(pilotId, secteur) {
    // Ouvrir l'overlay avec les champs pré-remplis
    document.getElementById('geo-pilot-id').value = pilotId;
    document.getElementById('geo-commune').value = secteur || '';
    document.getElementById('geo-departement').value = '';
    document.getElementById('geo-msg').textContent = '';
    showOverlay('overlay-geolocate-pilot');
  }

  async function geolocatePilotManuel() {
    const pilotId = document.getElementById('geo-pilot-id').value;
    const commune = document.getElementById('geo-commune').value.trim();
    const dept    = document.getElementById('geo-departement').value.trim();
    const msg     = document.getElementById('geo-msg');

    if (!commune) { msg.textContent = 'Entrez une commune.'; msg.style.color = '#e53935'; return; }

    msg.textContent = 'Recherche en cours…';
    msg.style.color = 'var(--text-muted)';

    const query = dept ? `${commune}, ${dept}, France` : `${commune}, France`;
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'fr' } });
      const data = await res.json();
      if (!data.length) { msg.textContent = 'Commune non trouvée — essayez autrement.'; msg.style.color = '#e53935'; return; }
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      const { error: rpcError } = await db.rpc('chassnid_update_pilot_location', {
        p_token:       localStorage.getItem(CONFIG.SESSION_KEY),
        p_pilot_id:    pilotId,
        p_lat:         lat,
        p_lon:         lon,
        p_secteur:     commune,
        p_departement: dept || '',
      });
      if (rpcError) throw new Error(rpcError.message);
      msg.textContent = `✅ GPS mis à jour : ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      msg.style.color = '#2d6a4f';
      setTimeout(() => {
        hideOverlay('overlay-geolocate-pilot');
        dbPilotsGetByParent().then(pilots => { Dashboard.setPilots(pilots); renderPilots(pilots); });
      }, 1500);
    } catch(e) {
      msg.textContent = 'Erreur : ' + e.message;
      msg.style.color = '#e53935';
    }
  }

  async function create() {
    const prenom  = document.getElementById('pilot-prenom').value.trim();
    const nom     = document.getElementById('pilot-nom').value.trim();
    const email   = document.getElementById('pilot-email').value.trim();
    const secteur = document.getElementById('pilot-secteur').value.trim();
    const pseudo  = document.getElementById('pilot-pseudo')?.value.trim() || '';

    if (!prenom || !nom || !email || !secteur) {
      showAuthMsg('new-pilot-msg', 'error', 'Tous les champs sont requis.');
      return;
    }

    const profile = Auth.getProfile();
    const btn = document.getElementById('btn-create-pilot');
    btn.disabled = true;

    // 1. Créer le profil en base
    const newId = crypto.randomUUID();
    // Géocoder le secteur via Nominatim
    let pilotLat = null, pilotLon = null;
    try {
      const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(secteur + ', France')}&format=json&limit=1`;
      const geoRes = await fetch(geoUrl, { headers: { 'Accept-Language': 'fr' } });
      const geoData = await geoRes.json();
      if (geoData.length > 0) {
        pilotLat = parseFloat(geoData[0].lat);
        pilotLon = parseFloat(geoData[0].lon);
      }
    } catch(e) {
      console.warn('Géocodage secteur échoué:', e);
    }
    // Fallback sur les coordonnées du parent
    if (!pilotLat) { pilotLat = profile.lat || null; pilotLon = profile.lon || null; }

    const { error } = await dbProfileCreate({
      id:          newId,
      email, nom, prenom,
      role:        'pilot',
      departement: profile.departement || '—',
      secteur,
      parent_id:   profile.id,
      lat:         pilotLat,
      lon:         pilotLon,
    });

    if (error) {
      btn.disabled = false;
      showAuthMsg('new-pilot-msg', 'error', error.message || 'Erreur lors de la création.');
      return;
    }

    // 2. Enregistrer le pseudo si renseigné
    if (pseudo) {
      await dbUpdatePseudo(newId, newId, pseudo);
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
    ['pilot-prenom', 'pilot-nom', 'pilot-email', 'pilot-secteur', 'pilot-pseudo']
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
        const { error } = await dbProfileDelete(id);
        if (error) { showToast('Erreur : ' + (error.message || error)); return; }
        showToast(`${name} supprimé.`);
        await _refresh();
      }
    );
  }

  // ── VOIR LES UTILISATEURS D'UN PILOTE ─────────────────────

  let _currentViewPilotId = null;

  async function view(pilotId, pilotName) {
    _currentViewPilotId = pilotId;
    document.getElementById('view-title').textContent = `Sentinelles de ${pilotName}`;
    const list = document.getElementById('view-list');
    list.innerHTML = '<p class="form-hint">Chargement…</p>';
    // Réinitialise le bloc "sentinelles supprimées" (fermé par défaut à chaque ouverture)
    const deletedList = document.getElementById('deleted-list');
    deletedList.style.display = 'none';
    deletedList.innerHTML = '';
    document.getElementById('link-view-deleted').textContent = '🗑️ Voir les sentinelles supprimées';
    showOverlay('overlay-view');

    const users = await dbPilotUsersGet(pilotId);
    if (users.length === 0) {
      list.innerHTML = '<p class="form-hint">Aucune sentinelle rattachée.</p>';
    } else {
      list.innerHTML = users.map(u => `
        <div class="list-item" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div class="avatar" style="width:36px;height:36px;font-size:13px;flex-shrink:0">👤</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">${u.phone_id.substring(0,8)}…</div>
            <input type="text"
              class="pseudo-input"
              data-phone="${u.phone_id}"
              data-pilot="${pilotId}"
              value="${u.pseudo || ''}"
              placeholder="Donner un pseudo…"
              style="width:100%;border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:13px;font-family:inherit">
            <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${u.nb_observations ?? 0} signalement(s) · ${u.blocked ? '🔴 Bloqué' : '🟢 Actif'}</div>
          </div>
          <button class="btn-delete-sentinel"
            data-phone="${u.phone_id}"
            data-pilot="${pilotId}"
            data-pseudo="${u.pseudo || u.phone_id.substring(0,8)}"
            style="background:none;border:none;font-size:18px;cursor:pointer;padding:4px;flex-shrink:0;"
            title="Supprimer cette sentinelle">🗑</button>
        </div>`).join('');

      // Sauvegarder le pseudo au blur
      list.querySelectorAll('.pseudo-input').forEach(input => {
        input.addEventListener('blur', async () => {
          const { error } = await dbUpdatePseudo(input.dataset.phone, input.dataset.pilot, input.value);
          if (error) showToast('Erreur : ' + (error.message || error));
          else showToast('Pseudo enregistré.');
        });
      });

      // Supprimer une sentinelle
      list.querySelectorAll('.btn-delete-sentinel').forEach(btn => {
        btn.addEventListener('click', () => {
          showModal(
            'Supprimer cette sentinelle',
            `Supprimer la sentinelle "${btn.dataset.pseudo}" ? Ses signalements seront définitivement effacés. Elle pourra être réintégrée plus tard depuis "Sentinelles supprimées" si besoin.`,
            'Supprimer',
            async () => {
              const { error } = await dbSentinelDelete(btn.dataset.phone, btn.dataset.pilot);
              if (error) showToast('Erreur : ' + (error.message || error));
              else {
                showToast('Sentinelle supprimée.');
                view(btn.dataset.pilot, document.getElementById('view-title').textContent.replace('Sentinelles de ', ''));
              }
            }
          );
        });
      });
    }
  }

  // ── SENTINELLES SUPPRIMÉES (consultation + réintégration) ───

  async function viewDeleted() {
    const pilotId = _currentViewPilotId;
    if (!pilotId) return;
    const deletedList = document.getElementById('deleted-list');
    const link = document.getElementById('link-view-deleted');

    // Toggle : si déjà ouvert, on referme
    if (deletedList.style.display === 'flex') {
      deletedList.style.display = 'none';
      link.textContent = '🗑️ Voir les sentinelles supprimées';
      return;
    }

    link.textContent = 'Chargement…';
    const { error, sentinels } = await dbDeletedSentinelsGet(pilotId);
    if (error) {
      showToast('Erreur : ' + (error.message || error));
      link.textContent = '🗑️ Voir les sentinelles supprimées';
      return;
    }

    link.textContent = `🗑️ Masquer les sentinelles supprimées (${sentinels.length})`;
    deletedList.style.display = 'flex';

    if (sentinels.length === 0) {
      deletedList.innerHTML = '<p class="form-hint">Aucune sentinelle supprimée.</p>';
      return;
    }

    deletedList.innerHTML = sentinels.map(s => `
      <div class="list-item" style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);opacity:0.7">
        <div style="flex:1;min-width:0;font-size:13px">
          ${s.pseudo || s.phone_id.substring(0,8) + '…'}
          <div style="font-size:11px;color:var(--text-muted)">Supprimée le ${new Date(s.created_at).toLocaleDateString('fr-FR')}</div>
        </div>
        <button class="btn-restore-sentinel" data-phone="${s.phone_id}" data-pilot="${pilotId}" data-pseudo="${s.pseudo || s.phone_id.substring(0,8)}"
          style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;">↩️ Réintégrer</button>
      </div>`).join('');

    deletedList.querySelectorAll('.btn-restore-sentinel').forEach(btn => {
      btn.addEventListener('click', () => {
        showModal(
          'Réintégrer cette sentinelle',
          `Réintégrer "${btn.dataset.pseudo}" ? Elle pourra à nouveau se rattacher et envoyer des signalements.`,
          'Réintégrer',
          async () => {
            const { error } = await dbSentinelRestore(btn.dataset.phone, btn.dataset.pilot);
            if (error) showToast('Erreur : ' + (error.message || error));
            else {
              showToast('Sentinelle réintégrée.');
              viewDeleted(); // referme
              view(btn.dataset.pilot, document.getElementById('view-title').textContent.replace('Sentinelles de ', ''));
            }
          }
        );
      });
    });
  }

  // ── PARAMÈTRES D'UN PILOTE ────────────────────────────────

  function params(pilotId, pilotName, traitM, validityDays) {
    document.getElementById('params-title').textContent = `Paramètres — ${pilotName}`;
    document.getElementById('params-msg').className   = 'auth-message';
    document.getElementById('params-msg').textContent = '';

    const traitSlider    = document.getElementById('params-trait');
    const validitySlider = document.getElementById('params-validity');
    const traitVal       = document.getElementById('params-trait-val');
    const validityVal    = document.getElementById('params-validity-val');

    traitSlider.value    = traitM;
    validitySlider.value = validityDays;
    traitVal.textContent    = `${traitM} m`;
    validityVal.textContent = `${validityDays} jour${validityDays > 1 ? 's' : ''}`;

    traitSlider.oninput    = () => traitVal.textContent    = `${traitSlider.value} m`;
    validitySlider.oninput = () => validityVal.textContent = `${validitySlider.value} jour${validitySlider.value > 1 ? 's' : ''}`;

    document.getElementById('btn-params-save').dataset.pilotId = pilotId;
    showOverlay('overlay-params');
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

    // Sentinelles supprimées (dans le panneau "Sentinelles de ...")
    document.getElementById('link-view-deleted')?.addEventListener('click', e => {
      e.preventDefault();
      viewDeleted();
    });

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
      const geoBtn     = e.target.closest('.btn-geolocate[data-pilot-id]');
      if (geoBtn) { geolocatePilot(geoBtn.dataset.pilotId, geoBtn.dataset.pilotSecteur); return; }
      const blockBtn   = e.target.closest('.btn-block[data-pilot-id]');
      const unblockBtn = e.target.closest('.btn-unblock[data-pilot-id]');
      const deleteBtn  = e.target.closest('.btn-delete[data-pilot-id]');
      const paramsBtn  = e.target.closest('.btn-params[data-pilot-id]');
      const resetBtn   = e.target.closest('.btn-reset-pin[data-pilot-id]');
      const migrateBtn = e.target.closest('.btn-migrate[data-pilot-id]');
      const viewBtn    = e.target.closest('.btn-view[data-pilot-id]');
      const messageBtn = e.target.closest('.btn-message[data-pilot-id]');

      if (blockBtn)   block(blockBtn.dataset.pilotId, blockBtn.dataset.pilotName);
      if (unblockBtn) unblock(unblockBtn.dataset.pilotId, unblockBtn.dataset.pilotName);
      if (deleteBtn)  remove(deleteBtn.dataset.pilotId, deleteBtn.dataset.pilotName);
      if (paramsBtn)  params(paramsBtn.dataset.pilotId, paramsBtn.dataset.pilotName, parseInt(paramsBtn.dataset.trait), parseInt(paramsBtn.dataset.validity));
      if (resetBtn)   resetPin(resetBtn.dataset.pilotEmail, resetBtn.dataset.pilotName);
      if (migrateBtn) migrate(migrateBtn.dataset.pilotId, migrateBtn.dataset.pilotName);
      if (viewBtn)    view(viewBtn.dataset.pilotId, viewBtn.dataset.pilotName);
      if (messageBtn) showCreationMessage(messageBtn.dataset.pilotPrenom, messageBtn.dataset.pilotNom, messageBtn.dataset.pilotEmail);
    });

    // Sauvegarder les paramètres
    document.getElementById('btn-params-save')?.addEventListener('click', async () => {
      const btn      = document.getElementById('btn-params-save');
      const pilotId  = btn.dataset.pilotId;
      const traitM   = parseInt(document.getElementById('params-trait').value);
      const validity = parseInt(document.getElementById('params-validity').value);

      btn.disabled = true;
      const { error } = await dbProfileUpdateParams(pilotId, {
        trait_length_m: traitM,
        validity_days:  validity,
      });
      btn.disabled = false;

      if (error) {
        showAuthMsg('params-msg', 'error', error.message || 'Erreur lors de la sauvegarde.');
        return;
      }

      hideOverlay('overlay-params');
      showToast('Paramètres enregistrés.');
      const pilots = await dbPilotsGetByParent();
      Dashboard.setPilots(pilots);
    });
  }

  return { init, block, unblock, resetPin, remove, migrate, view, geolocatePilotManuel };

})();
