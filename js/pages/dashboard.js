// ── pages/dashboard.js — Écran principal ─────────────────────
// Dépend de : config.js, db.js, auth.js, ui.js, map.js

const Dashboard = (() => {

  let _signals       = [];
  let _users         = [];
  let _admins        = [];
  let _pilots        = [];
  let _pilotUsers    = [];
  let _blockedPhones = new Set();
  let _radius        = CONFIG.DEFAULT_RADIUS_KM;
  let _dateFilterDays = 'all';
  let _allSentinels  = [];   // [{ phone_id, pseudo, pilote_nom }]
  let _sentinelMap   = {};   // phone_id → { pseudo, pilote }
  let _groupedSentinels = []; // [{ pilot, users }] — pour admin_dept, chargé une seule fois
  let _nests = [];
  let _phoneToPilotId = {};   // phone_id → pilot_id réel (superadmin/admin_dept)
  let _searchOrigin = null;   // { lat, lon } — remplace la position enregistrée si défini

  // ── CONSTRUCTION DU MAP phone_id → {pseudo, pilote} ──────

  function _buildSentinelMap() {
    const map = {};

    _allSentinels.forEach(u => {
      map[u.phone_id] = {
        pseudo: u.pseudo || null,
        pilote: u.pilote_nom || null,
      };
    });

    // Ajouter les pilotes/admins qui ont enregistré leur phone_id
    [...(_pilots || []), ...(_admins || [])].forEach(p => {
      if (p.phone_id) {
        const sentinel = _allSentinels.find(s => s.phone_id === p.phone_id);
        map[p.phone_id] = { pseudo: sentinel?.pseudo || null, pilote: null };
      }
    });

    // Profil courant
    const me = Auth.getProfile();
    if (me?.phone_id) {
      const sentinel = _allSentinels.find(s => s.phone_id === me.phone_id);
      map[me.phone_id] = { pseudo: sentinel?.pseudo || null, pilote: null };
    }

    return map;
  }

  // ── CHARGEMENT PRINCIPAL ───────────────────────────────────

  async function load() {
    const profile = Auth.getProfile();
    const role    = profile.role;

    setLoading('signals-list');
    setLoading('users-list');

    if (role === 'superadmin') {
      let allRaw;
      [_signals, _blockedPhones, _admins, _pilots, _nests, allRaw] = await Promise.all([
        dbSignalsGetAll(),
        dbBlockedGetAll(),
        dbAdminsGetAll(),
        dbPilotsGetByParent(),
        dbNestsGetAll(),
        dbAllSentinelsGet(),
      ]);
      _pilotUsers = allRaw; // conserve pilot_id pour chaque sentinelle
      _phoneToPilotId = {};
      allRaw.forEach(u => { _phoneToPilotId[u.phone_id] = u.pilot_id; });
      await _loadPending();

    } else if (role === 'pilot') {
      const [sigs, pilotUsers, allNests] = await Promise.all([
        dbSignalsGetAll(profile.lat, profile.lon, _radius),
        dbPilotUsersGet(profile.id),
        dbNestsGetAll(),
      ]);
      _signals = sigs;
      _pilotUsers = pilotUsers;
      // Filtrer les nids par rayon dès le chargement initial
      if (profile.lat && profile.lon) {
        const R = 6371;
        _nests = allNests.filter(n => {
          if (!n.lat || !n.lon) return false;
          const dLat = (n.lat - profile.lat) * Math.PI / 180;
          const dLon = (n.lon - profile.lon) * Math.PI / 180;
          const a = Math.sin(dLat/2)**2 + Math.cos(profile.lat*Math.PI/180) * Math.cos(n.lat*Math.PI/180) * Math.sin(dLon/2)**2;
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) <= _radius;
        });
      } else {
        _nests = allNests;
      }
      _blockedPhones = new Set(_pilotUsers.filter(u => u.blocked).map(u => u.phone_id));

    } else {
      // admin_dept — 1 seul appel pour les sentinelles groupées
      [_signals, _blockedPhones, _pilots, _pilotUsers, _groupedSentinels, _nests] = await Promise.all([
        dbSignalsGetAll(profile.lat, profile.lon, _radius),
        dbBlockedGetAll(),
        dbPilotsGetByParent(),
        dbPilotUsersGet(profile.id),
        dbPilotUsersGetByAdmin(),   // RPC SQL unique — plus de N requêtes
        dbNestsGetAll(),
      ]);
      _phoneToPilotId = {};
      _pilotUsers.forEach(u => { _phoneToPilotId[u.phone_id] = profile.id; }); // sentinelles directes
      _groupedSentinels.forEach(g => {
        g.users.forEach(u => { _phoneToPilotId[u.phone_id] = g.pilot.id; });
      });
      await _loadPending();
    }

    _buildUsers();
    await _refresh();
  }

  async function _loadPending() {
    const pending = await dbPendingGetAll();
    renderPending(pending);
  }

  // ── CONSTRUCTION DES UTILISATEURS ─────────────────────────

  function _buildUsers() {
    const role = Auth.getProfile()?.role;

    if (role === 'pilot') {
      _users = _pilotUsers.map(u => ({
        phone_id: u.phone_id,
        count:    u.nb_observations || 0,
        last:     u.derniere_observation || u.rattachement_date,
        blocked:  u.blocked,
      }));
    } else {
      const phones = [...new Set(_signals.map(s => s.phone_id).filter(Boolean))];
      _users = phones.map(phone => ({
        phone_id: phone,
        count:    _signals.filter(s => s.phone_id === phone).length,
        last:     _signals.find(s => s.phone_id === phone)?.created_at,
        blocked:  _blockedPhones.has(phone),
        pilot_id: _phoneToPilotId[phone] || null,
      }));
    }
  }

  // ── FILTRE DATE ────────────────────────────────────────────

  function _applyDateFilter(signals) {
    if (_dateFilterDays === 'all') return signals;
    const cutoff = Date.now() - (_dateFilterDays * 24 * 60 * 60 * 1000);
    return signals.filter(s => new Date(s.created_at).getTime() >= cutoff);
  }

  // ── RAFRAÎCHISSEMENT ──────────────────────────────────────
  // Plus d'appels async ici — toutes les données sont déjà chargées dans load().
  // _refresh() ne fait plus d'appel réseau : toutes les données
  // (dont dbAllSentinelsGet pour superadmin) sont chargées une seule
  // fois dans load() et tenues à jour localement par les actions.

  async function _refresh() {
    const role    = Auth.getProfile()?.role;
    const profile = Auth.getProfile();
    const filteredSignals = _applyDateFilter(_signals);

    // Construire _allSentinels selon le rôle
    if (role === 'pilot') {
      _allSentinels = _pilotUsers.map(u => ({
        phone_id:   u.phone_id,
        pseudo:     u.pseudo,
        pilote_nom: null,
      }));

    } else if (role === 'superadmin') {
      const allRaw = _pilotUsers; // déjà chargé/tenu à jour, pas de nouvel appel réseau
      const pilotIndex = {};
      (_pilots || []).forEach(p => { pilotIndex[p.id] = p.prenom + ' ' + p.nom; });
      (_admins || []).forEach(a => { pilotIndex[a.id] = a.prenom + ' ' + a.nom; });
      _allSentinels = allRaw.map(u => ({
        phone_id:   u.phone_id,
        pseudo:     u.pseudo,
        pilote_nom: pilotIndex[u.pilot_id] || null,
      }));

    } else if (role === 'admin_dept') {
      // Mes sentinelles directes
      const directes = _pilotUsers.map(u => ({
        phone_id:   u.phone_id,
        pseudo:     u.pseudo,
        pilote_nom: profile.prenom + ' ' + profile.nom + ' (direct)',
      }));
      // Sentinelles des pilotes — déjà chargées dans load(), pas de nouvel appel
      const desPilotes = _groupedSentinels.flatMap(g =>
        g.users.map(u => ({
          phone_id:   u.phone_id,
          pseudo:     u.pseudo,
          pilote_nom: g.pilot.prenom + ' ' + g.pilot.nom,
        }))
      );
      _allSentinels = [...directes, ...desPilotes];
    }

    _sentinelMap = _buildSentinelMap();

    renderSignals(filteredSignals, _blockedPhones, _sentinelMap);
    updateStats(filteredSignals, _users);
    const canAddNest = ['pilot', 'admin_dept', 'superadmin'].includes(role);
    mapInit(filteredSignals, _blockedPhones, _sentinelMap, _nests, canAddNest);

    if (role === 'admin_dept') {
      document.getElementById('pilot-sentinels-section').style.display  = 'none';
      document.getElementById('my-sentinels-section').style.display     = '';
      document.getElementById('pilots-sentinels-section').style.display = '';

      const pilotIndex = {};
      (_pilots || []).forEach(p => { pilotIndex[p.id] = p.prenom + ' ' + p.nom; });
      renderUsersList(_pilotUsers, 'my-sentinels-list', pilotIndex);
      renderSentinelsByPilot(_groupedSentinels);  // données déjà en mémoire

    } else {
      document.getElementById('pilot-sentinels-section').style.display  = '';
      document.getElementById('my-sentinels-section').style.display     = 'none';
      document.getElementById('pilots-sentinels-section').style.display = 'none';
      renderUsers(_users, _sentinelMap);
      // "Voir mes sentinelles supprimées" : réservé au pilote lui-même
      // (le superadmin a déjà cet accès via l'onglet Pilotes, par pilote)
      document.getElementById('link-view-my-deleted').style.display = (role === 'pilot') ? '' : 'none';
    }

    if (role === 'superadmin') renderAdmins(_admins);
    if (['superadmin', 'admin_dept'].includes(role)) renderPilots(_pilots);

    // Bouton suppression en masse réservé aux admins
    if (['superadmin', 'admin_dept'].includes(role)) {
      const btn = document.getElementById('btn-bulk-delete');
      if (btn) btn.style.display = 'block';
    }

    renderNests(_nests);
  }

  // ── CHANGEMENT DE RAYON ────────────────────────────────────

  async function onRadiusChange(km) {
    _radius = km;
    await _refetchByRadius();
  }

  // Point de départ effectif : la position personnalisée (carte) si
  // définie, sinon la position enregistrée du profil.
  function _effectiveOrigin() {
    if (_searchOrigin) return _searchOrigin;
    const profile = Auth.getProfile();
    return (profile.lat && profile.lon) ? { lat: profile.lat, lon: profile.lon } : null;
  }

  async function _refetchByRadius() {
    const profile = Auth.getProfile();
    const origin = _effectiveOrigin();
    setLoading('signals-list');
    setLoading('users-list');

    if (profile.role === 'superadmin') {
      _signals = await dbSignalsGetAll();
    } else if (origin) {
      _signals = await dbSignalsGetAll(origin.lat, origin.lon, _radius);
    } else {
      _signals = await dbSignalsGetAll(profile.lat, profile.lon, _radius);
    }

    // Filtrer aussi les nids par rayon (distance haversine)
    if (origin) {
      const allNests = await dbNestsGetAll();
      const R = 6371;
      _nests = allNests.filter(n => {
        if (!n.lat || !n.lon) return false;
        const dLat = (n.lat - origin.lat) * Math.PI / 180;
        const dLon = (n.lon - origin.lon) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(origin.lat*Math.PI/180) * Math.cos(n.lat*Math.PI/180) * Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) <= _radius;
      });
    }

    _blockedPhones = await dbBlockedGetAll();
    _buildUsers();
    await _refresh();
  }

  // Utilise le centre actuel de la carte comme nouveau point de départ
  async function searchHere() {
    const center = mapGetCenter();
    if (!center) { showToast('Carte non disponible.'); return; }
    _searchOrigin = { lat: center.lat, lon: center.lng };
    document.getElementById('btn-search-reset').style.display = '';
    showToast(`Recherche centrée ici (${_radius} km).`);
    await _refetchByRadius();
  }

  // Revient à la position enregistrée du profil
  async function resetSearchOrigin() {
    _searchOrigin = null;
    document.getElementById('btn-search-reset').style.display = 'none';
    showToast('Retour à votre position enregistrée.');
    await _refetchByRadius();
  }

  function onDateFilterChange(value) {
    _dateFilterDays = value;
    _refresh();
  }

  // ── ACTIONS SIGNALEMENTS ──────────────────────────────────

  async function deleteSignal(id) {
    showModal(
      'Supprimer ce signalement',
      'Cette action est irréversible.',
      'Supprimer',
      async () => {
        const { error } = await dbSignalDelete(id);
        if (error) {
          showToast('Erreur : ' + (error.message || error));
          return;
        }
        showToast('Signalement supprimé.');
        _signals = _signals.filter(s => s.id !== id);
        _buildUsers();
        await _refresh();
      }
    );
  }

  // ── ACTIONS UTILISATEURS ──────────────────────────────────

  async function deleteSentinel(phone_id, ownerPilotId) {
    showModal(
      'Supprimer cette sentinelle',
      'Cette sentinelle sera définitivement retirée de votre liste.',
      'Supprimer',
      async () => {
        const profile = Auth.getProfile();
        // Utilise le vrai propriétaire de la sentinelle (transmis par le
        // bouton) — indispensable quand un superadmin/admin_dept supprime
        // depuis la vue globale, où la sentinelle appartient à un AUTRE
        // pilote que la personne connectée.
        const pilotId = ownerPilotId || profile.id;
        const { error } = await dbSentinelDelete(phone_id, pilotId);
        if (error) { showToast('Erreur : ' + (error.message || error), 'error'); return; }
        _pilotUsers = _pilotUsers.filter(u => u.phone_id !== phone_id);
        // La RPC supprime aussi les signalements de cette sentinelle côté
        // base — on doit faire pareil en mémoire, sinon _buildUsers() la
        // fait réapparaître (elle reconstruit la liste à partir des
        // phone_id distincts trouvés dans _signals).
        _signals = _signals.filter(s => s.phone_id !== phone_id);
        delete _phoneToPilotId[phone_id];
        _buildUsers();
        await _refresh();
        showToast('Sentinelle supprimée.');
      }
    );
  }

  // ── SENTINELLES SUPPRIMÉES — auto-service (pilote OU admin_dept
  // pour ses sentinelles directes) ────────────────────────────

  async function _toggleMyDeletedSentinels(linkId, listId, onRestored) {
    const profile = Auth.getProfile();
    const listEl = document.getElementById(listId);
    const link = document.getElementById(linkId);

    // Toggle : si déjà ouvert, on referme
    if (listEl.style.display === 'flex') {
      listEl.style.display = 'none';
      link.textContent = '🗑️ Voir mes sentinelles supprimées';
      return;
    }

    link.textContent = 'Chargement…';
    const { error, sentinels } = await dbDeletedSentinelsGet(profile.id);
    if (error) {
      showToast('Erreur : ' + (error.message || error));
      link.textContent = '🗑️ Voir mes sentinelles supprimées';
      return;
    }

    link.textContent = `🗑️ Masquer mes sentinelles supprimées (${sentinels.length})`;
    listEl.style.display = 'flex';

    if (sentinels.length === 0) {
      listEl.innerHTML = '<p class="form-hint">Aucune sentinelle supprimée.</p>';
      return;
    }

    listEl.innerHTML = sentinels.map(s => `
      <div class="list-item" style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);opacity:0.7">
        <div style="flex:1;min-width:0;font-size:13px">
          ${s.pseudo || s.phone_id.substring(0,8) + '…'}
          <div style="font-size:11px;color:var(--text-muted)">Supprimée le ${new Date(s.created_at).toLocaleDateString('fr-FR')}</div>
        </div>
        <button class="btn-restore-my-sentinel" data-phone="${s.phone_id}" data-pseudo="${s.pseudo || s.phone_id.substring(0,8)}"
          style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;">↩️ Réintégrer</button>
      </div>`).join('');

    listEl.querySelectorAll('.btn-restore-my-sentinel').forEach(btn => {
      btn.addEventListener('click', () => {
        showModal(
          'Réintégrer cette sentinelle',
          `Réintégrer "${btn.dataset.pseudo}" ? Elle pourra à nouveau se rattacher et envoyer des signalements.`,
          'Réintégrer',
          async () => {
            const { error } = await dbSentinelRestore(btn.dataset.phone, profile.id);
            if (error) { showToast('Erreur : ' + (error.message || error)); return; }
            showToast('Sentinelle réintégrée.');
            _toggleMyDeletedSentinels(linkId, listId); // referme
            await onRestored();
          }
        );
      });
    });
  }

  async function viewMyDeletedSentinels() {
    await _toggleMyDeletedSentinels('link-view-my-deleted', 'my-deleted-list', async () => {
      // _pilotUsers avait été chargée une fois, déjà filtrée sans les
      // supprimées — il faut la recharger pour que la sentinelle
      // réintégrée réapparaisse dans la liste principale.
      const profile = Auth.getProfile();
      _pilotUsers = await dbPilotUsersGet(profile.id);
      _buildUsers();
      await _refresh();
    });
  }

  async function viewMyDeletedSentinelsAdmin() {
    await _toggleMyDeletedSentinels('link-view-my-deleted-admin', 'my-deleted-list-admin', async () => {
      // Même chose côté admin_dept : _pilotUsers (ses sentinelles directes)
      // doit être rechargée pour faire réapparaître la sentinelle réintégrée.
      const profile = Auth.getProfile();
      _pilotUsers = await dbPilotUsersGet(profile.id);
      _buildUsers();
      await _refresh();
    });
  }

  async function blockUser(phone_id) {
    showModal(
      'Bloquer cette sentinelle',
      'Cette sentinelle ne pourra plus soumettre de signalements.',
      'Bloquer',
      async () => {
        const profile = Auth.getProfile();
        if (profile.role === 'pilot') {
          const { error } = await dbPilotUserBlock(phone_id, profile.id);
          if (error) { showToast('Erreur : ' + (error.message || error), 'error'); return; }
          _pilotUsers = _pilotUsers.map(u =>
            u.phone_id === phone_id ? { ...u, blocked: true } : u
          );
        } else {
          const { error } = await dbBlockedAdd(phone_id);
          if (error) { showToast('Erreur : ' + (error.message || error), 'error'); return; }
          _blockedPhones.add(phone_id);
        }
        showToast('Sentinelle bloquée.');
        _buildUsers();
        await _refresh();
      }
    );
  }

  async function unblockUser(phone_id) {
    showModal(
      'Débloquer cette sentinelle',
      'Cette sentinelle pourra à nouveau soumettre des signalements.',
      'Débloquer',
      async () => {
        const profile = Auth.getProfile();
        if (profile.role === 'pilot') {
          const { error } = await dbPilotUserUnblock(phone_id, profile.id);
          if (error) { showToast('Erreur : ' + (error.message || error), 'error'); return; }
          _pilotUsers = _pilotUsers.map(u =>
            u.phone_id === phone_id ? { ...u, blocked: false } : u
          );
        } else {
          const { error } = await dbBlockedRemove(phone_id);
          if (error) { showToast('Erreur : ' + (error.message || error), 'error'); return; }
          _blockedPhones.delete(phone_id);
        }
        showToast('Sentinelle débloquée.');
        _buildUsers();
        await _refresh();
      }
    );
  }

  // ── ACTIONS EN ATTENTE ────────────────────────────────────

  async function validatePending(id, name) {
    showModal(
      'Valider cette demande',
      `Accorder l'accès à ${name} ?`,
      'Valider',
      async () => {
        await dbPendingValidate(id, 'admin_dept');
        showToast(`${name} est maintenant administrateur.`);
        await _loadPending();
      }
    );
  }

  async function rejectPending(id, name) {
    showModal(
      'Refuser cette demande',
      `Supprimer la demande de ${name} ?`,
      'Refuser',
      async () => {
        await dbPendingReject(id);
        showToast(`Demande de ${name} supprimée.`);
        await _loadPending();
      }
    );
  }

  // ── PROFIL / PIN ──────────────────────────────────────────

  let _profPin = ['', ''];

  async function showProfile() {
    const p = Auth.getProfile();

    // Affichage immédiat en attente du fetch
    // Charger le code_sentinelle
    const { data: apData } = await db.from('admin_profiles')
      .select('code_sentinelle')
      .eq('id', p.id)
      .maybeSingle();
    const codeSentinelle = apData?.code_sentinelle || '—';

    document.getElementById('profile-info').innerHTML =
      `<strong>${p.prenom} ${p.nom}</strong><br>` +
      `${p.email}<br>` +
      `${roleLabel(p.role)}<br>` +
      `${p.secteur || p.canton || '—'} · ${p.departement || '—'}<br>` +
      `<div style="margin-top:10px;padding:10px;background:#f0f8f0;border-radius:8px;text-align:center;">` +
      `<div style="font-size:11px;color:#666;margin-bottom:4px;">🔑 Code sentinelle permanent</div>` +
      `<div style="font-size:32px;font-weight:900;letter-spacing:8px;color:#2d5a27;font-family:monospace;">${codeSentinelle}</div>` +
      `</div>`;

    _profPin = ['', ''];
    _updateProfDots();
    clearAuthMsg('profile-msg');
    showOverlay('overlay-profile');

    // Relire le pseudo directement par phone_id dans pilot_user_stats
    let pseudo = null;
    if (p.phone_id) {
      const { data } = await db
        .from('pilot_user_stats')
        .select('pseudo')
        .eq('phone_id', p.phone_id)
        .limit(1)
        .maybeSingle();
      pseudo = data?.pseudo || null;
    }

    const infoBase =
      `<strong>${p.prenom} ${p.nom}</strong><br>` +
      `${p.email}<br>` +
      `${roleLabel(p.role)}<br>` +
      `${p.secteur || p.canton || '—'} · ${p.departement || '—'}<br>`;

    const pseudoHtml = p.phone_id
      ? `<div style="margin-top:6px;display:flex;align-items:center;gap:6px">` +
        `<span style="font-size:13px">🏷️</span>` +
        `<input type="text" id="profile-pseudo-input"` +
        ` value="${(pseudo || '').replace(/"/g, '&quot;')}"` +
        ` placeholder="Définir un pseudo…"` +
        ` style="flex:1;border:1px solid var(--border);border-radius:6px;` +
        `padding:4px 8px;font-size:13px;font-family:inherit">` +
        `<button id="btn-pseudo-save" style="padding:4px 10px;border-radius:6px;` +
        `background:var(--accent);color:#fff;border:none;font-size:12px;cursor:pointer">` +
        `💾</button></div>`
      : '';

    const codeHtml =
      `<div style="margin-top:10px;padding:10px;background:#f0f8f0;border-radius:8px;text-align:center;">` +
      `<div style="font-size:11px;color:#666;margin-bottom:4px;">🔑 Code sentinelle permanent</div>` +
      `<div style="font-size:32px;font-weight:900;letter-spacing:8px;color:#2d5a27;font-family:monospace;">${codeSentinelle}</div>` +
      `</div>`;

    document.getElementById('profile-info').innerHTML = infoBase + pseudoHtml + codeHtml;

    // Sauvegarder le pseudo au clic sur 💾
    document.getElementById('btn-pseudo-save')?.addEventListener('click', async () => {
      const val = document.getElementById('profile-pseudo-input').value.trim();
      if (!val) return;
      const { error } = await db.rpc('chassnid_sentinel_set_pseudo', {
        p_phone_id: p.phone_id,
        p_pilot_id: p.id,
        p_pseudo:   val,
      });
      if (error) showToast('Erreur : ' + error.message);
      else       showToast('Pseudo mis à jour !');
    });
  }

  function _updateProfDots() {
    ['pin-prof1-display', 'pin-prof2-display'].forEach((id, slot) => {
      document.querySelectorAll(`#${id} .pin-dot`).forEach((d, i) => {
        d.classList.toggle('filled', i < _profPin[slot].length);
      });
    });
    const active = _profPin[0].length < CONFIG.PIN_LENGTH ? 0 : 1;
    document.getElementById('pin-prof1-display').style.opacity = active === 0 ? '1' : '0.4';
    document.getElementById('pin-prof2-display').style.opacity = active === 1 ? '1' : '0.4';
  }

  function profPinPress(digit) {
    const active = _profPin[0].length < CONFIG.PIN_LENGTH ? 0 : 1;
    if (_profPin[active].length < CONFIG.PIN_LENGTH) {
      _profPin[active] += digit;
      _updateProfDots();
    }
  }

  function profPinDel() {
    const active = _profPin[1].length > 0 ? 1 : 0;
    _profPin[active] = _profPin[active].slice(0, -1);
    _updateProfDots();
  }

  async function savePin() {
    const [p1, p2] = _profPin;
    if (p1.length < CONFIG.PIN_LENGTH) {
      showAuthMsg('profile-msg', 'error', `Saisissez un PIN à ${CONFIG.PIN_LENGTH} chiffres.`);
      return;
    }
    if (p1 !== p2) {
      showAuthMsg('profile-msg', 'error', 'Les deux PIN ne correspondent pas.');
      _profPin = ['', ''];
      _updateProfDots();
      return;
    }
    const btn = document.getElementById('btn-save-pin');
    btn.disabled = true;
    const { ok, error } = await Auth.setPin(p1);
    btn.disabled = false;
    if (error) {
      showAuthMsg('profile-msg', 'error', error);
    } else {
      showAuthMsg('profile-msg', 'success', 'PIN mis à jour !');
      _profPin = ['', ''];
      _updateProfDots();
      setTimeout(() => hideOverlay('overlay-profile'), 1500);
    }
  }

  // ── QR CODE ───────────────────────────────────────────────

  function showQrCodePM() {
    const profile = Auth.getProfile();
    const urlPM = `${CONFIG.CHRONO_FRELON_URL}?pilot=${profile.id}`;

    const cPM = document.getElementById('qrcode-container-pm');
    cPM.innerHTML = '';
    new QRCode(cPM, { text: urlPM, width: 180, height: 180, colorDark: '#1b2d3e', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H });
    document.getElementById('qrcode-url-pm').textContent = urlPM;

    showOverlay('overlay-qrcode-pm');
  }

  async function showQrCodeVN() {
    const profile = Auth.getProfile();

    // Charger le code permanent
    const { data: ap } = await db.from('admin_profiles')
      .select('code_sentinelle')
      .eq('id', profile.id)
      .maybeSingle();
    const code = ap?.code_sentinelle || '';

    const urlVN = code
      ? `https://berny70.github.io/NidTraque/attach.html?pilot=${profile.id}&code=${code}`
      : `https://berny70.github.io/NidTraque/attach.html?pilot=${profile.id}`;

    const cVN = document.getElementById('qrcode-container-vn');
    cVN.innerHTML = '';
    new QRCode(cVN, { text: urlVN, width: 180, height: 180, colorDark: '#2d5a27', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H });
    document.getElementById('qrcode-url-vn').textContent = urlVN;

    // Afficher le code dans la section dédiée
    if (code) {
      document.getElementById('code-vn-value').textContent = code;
      document.getElementById('code-vn-display').style.display = 'block';
      document.getElementById('btn-gen-code-vn').textContent = '🔑 Mon code permanent';
      document.getElementById('btn-share-code-vn').style.display = 'inline-block';
      document.getElementById('btn-share-code-vn').dataset.code = code;
    }

    showOverlay('overlay-qrcode-vn');
  }

  // ── GETTERS / SETTERS ─────────────────────────────────────

  function filterNestsByRadius(allNests) {
    const profile = Auth.getProfile();
    if (!profile?.lat || !profile?.lon) return allNests;
    const R = 6371;
    return allNests.filter(n => {
      if (!n.lat || !n.lon) return false;
      const dLat = (n.lat - profile.lat) * Math.PI / 180;
      const dLon = (n.lon - profile.lon) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(profile.lat*Math.PI/180) * Math.cos(n.lat*Math.PI/180) * Math.sin(dLon/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) <= _radius;
    });
  }

  async function generateCodeVN() {
    const profile = Auth.getProfile();
    if (!profile) return;

    // Récupérer le code permanent du pilote
    const { data: ap, error } = await db.from('admin_profiles')
      .select('code_sentinelle')
      .eq('id', profile.id)
      .maybeSingle();

    if (error || !ap?.code_sentinelle) {
      showToast('Code sentinelle non trouvé', 'error');
      return;
    }

    const code = ap.code_sentinelle;

    // Afficher le code
    document.getElementById('code-vn-value').textContent = code;
    document.getElementById('code-vn-display').style.display = 'block';
    document.getElementById('btn-gen-code-vn').textContent = '🔑 Mon code permanent';
    document.getElementById('btn-share-code-vn').style.display = 'inline-block';
    document.getElementById('btn-share-code-vn').dataset.code = code;

    // Régénérer le QR code avec le code inclus dans l'URL
    const newUrlVN = `https://berny70.github.io/NidTraque/attach.html?pilot=${profile.id}&code=${code}`;
    const cVN = document.getElementById('qrcode-container-vn');
    cVN.innerHTML = '';
    new QRCode(cVN, { text: newUrlVN, width: 180, height: 180, colorDark: '#2d5a27', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H });
    document.getElementById('qrcode-url-vn').textContent = newUrlVN;
  }

  function shareCodeVN() {
    const code = document.getElementById('btn-share-code-vn').dataset.code;
    const profile = Auth.getProfile();
    const pilotName = profile ? (profile.prenom + ' ' + profile.nom) : 'votre pilote';
    const msg = encodeURIComponent(
      'Bonjour ! Pour vous rattacher à VigieNid (secteur ' + pilotName + '), ' +
      'ouvrez VigieNid et entrez ce code : *' + code + '* (code permanent)'
    );
    window.open('https://wa.me/?text=' + msg, '_blank');
  }

  function getSignals() { return _signals; }
  function getAdmins()  { return _admins; }
  function getPilots()  { return _pilots; }

  function setAdmins(admins) {
    _admins = admins;
    renderAdmins(_admins);
  }

  function setPilots(pilots) {
    _pilots = pilots;
    renderPilots(_pilots);
  }

  // ── RENDU LISTE NIDS ──────────────────────────────────────

  function _populateYearFilter(nests) {
    const sel = document.getElementById('year-filter-nests');
    if (!sel) return;
    const years = [...new Set(nests.map(n => {
      if (n.annee) return parseInt(n.annee);
      if (n.found_at) return new Date(n.found_at).getFullYear();
      return null;
    }).filter(Boolean))].sort((a, b) => b - a);
    sel.innerHTML = '<option value="all">Toutes années</option>' +
      years.map(y => `<option value="${y}">${y}</option>`).join('');
    // Défaut : année en cours si présente
    const currentYear = new Date().getFullYear().toString();
    if (years.map(String).includes(currentYear)) sel.value = currentYear;
  }

  function _applyNestFilters() {
    const yearVal   = document.getElementById('year-filter-nests')?.value || 'all';
    const searchVal = (document.getElementById('search-nests')?.value || '').toLowerCase().trim();
    return _nests.filter(n => {
      // Utiliser annee si renseigné, sinon extraire l'année de found_at
      const nestYear = n.annee
        ? String(n.annee)
        : (n.found_at ? new Date(n.found_at).getFullYear().toString() : null);
      const matchYear   = yearVal === 'all' || nestYear === yearVal;
      const pilote      = (n.pilot_nom || '').toLowerCase();
      const matchSearch = !searchVal || pilote.includes(searchVal);
      return matchYear && matchSearch;
    });
  }

  function renderNests(nests) {
    if (nests !== undefined) {
      _nests = nests;
      _populateYearFilter(_nests); // seulement au chargement initial
    }

    const list = document.getElementById('nests-list');
    if (!list) return;

    const filtered = _applyNestFilters();

    if (!_nests || _nests.length === 0) {
      list.innerHTML = '<p class="form-hint" style="padding:20px">Aucun nid enregistré.</p>';
      return;
    }

    if (filtered.length === 0) {
      list.innerHTML = '<p class="form-hint" style="padding:20px">Aucun nid pour ces critères.</p>';
      return;
    }

    list.innerHTML = filtered.map(n => {
      const date   = n.found_at
        ? new Date(n.found_at).toLocaleDateString('fr-FR')
        : '—';
      const pilote = n.pilot_nom || n.declarant || '—';
      const declarantExtra = (n.declarant && n.pilot_nom && n.declarant !== n.pilot_nom)
        ? ` <span style="font-size:11px;color:#aaa">(${n.declarant})</span>` : '';
      const lat    = n.lat ? n.lat.toFixed(5) : '—';
      const lon    = n.lon ? n.lon.toFixed(5) : '—';
      const gps    = `${lat}, ${lon}`;
      const mapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;
      const annee  = n.annee ? ` · ${n.annee}` : '';

      return `
        <div class="list-item" style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:28px;line-height:1;flex-shrink:0">🪺</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:14px;margin-bottom:2px">📅 ${date}${annee}</div>
            <div style="font-size:13px;color:var(--text-muted);margin-bottom:2px">👤 ${pilote}${declarantExtra}</div>
            <a href="${mapsUrl}" target="_blank"
               style="font-size:12px;font-family:monospace;color:var(--accent);text-decoration:none">
              📍 ${gps}
            </a>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
            <button class="btn-locate-nest" data-nest-id="${n.id}" title="Voir sur la carte"
              style="padding:6px 10px;border-radius:6px;background:none;border:1px solid var(--border);font-size:12px;cursor:pointer">
              📍
            </button>
          ${Auth.getProfile()?.id === n.pilot_id || Auth.getProfile()?.role === 'superadmin' ? `
          <button class="btn-delete-nest" data-nest-id="${n.id}"
            style="padding:6px 10px;border-radius:6px;background:#c0392b;color:#fff;border:none;font-size:12px;cursor:pointer">
            🗑
          </button>` : ''}
          </div>
        </div>`;
    }).join('');

    // Délégation suppression au niveau de la liste (évite la perte des listeners après renderNests)
    list.addEventListener('click', e => {
      const locateBtn = e.target.closest('.btn-locate-nest[data-nest-id]');
      if (locateBtn) {
        switchTab('map');
        mapFocusNest(locateBtn.dataset.nestId);
        return;
      }
      const btn = e.target.closest('.btn-delete-nest[data-nest-id]');
      if (!btn) return;
      const nestId = btn.dataset.nestId;
      showModal(
        'Supprimer ce nid',
        'Cette action est irréversible.',
        'Supprimer',
        async () => {
          console.log('Suppression nid:', nestId);
          const res = await dbNestDelete(nestId);
          console.log('Résultat suppression:', JSON.stringify(res));
          if (res?.error) {
            showToast('Erreur suppression : ' + (res.error.message || 'inconnue'), 'error');
            return;
          }
          _nests = _nests.filter(n => n.id !== nestId);
          Dashboard.setNests(_nests);
          renderNests();
          mapInit(_applyDateFilter(_signals), _blockedPhones, _sentinelMap, _nests, true);
          showToast('Nid supprimé.');
        }
      );
    });
  }

  // ── INIT ──────────────────────────────────────────────────

  function init() {
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    initRadiusSelector(onRadiusChange);
    initDateFilterSelectors(onDateFilterChange);

    document.getElementById('btn-profile')?.addEventListener('click', showProfile);
    document.getElementById('btn-save-pin')?.addEventListener('click', savePin);

    document.querySelectorAll('.pin-key[data-ctx="prof"]').forEach(btn => {
      if (btn.dataset.digit !== undefined) {
        btn.addEventListener('click', () => profPinPress(btn.dataset.digit));
      } else {
        btn.addEventListener('click', profPinDel);
      }
    });

    document.getElementById('btn-qrcode-pm')?.addEventListener('click', showQrCodePM);
    document.getElementById('btn-qrcode-vn')?.addEventListener('click', showQrCodeVN);
    document.getElementById('link-view-my-deleted')?.addEventListener('click', e => {
      e.preventDefault();
      viewMyDeletedSentinels();
    });
    document.getElementById('link-view-my-deleted-admin')?.addEventListener('click', e => {
      e.preventDefault();
      viewMyDeletedSentinelsAdmin();
    });
    document.getElementById('btn-search-here')?.addEventListener('click', searchHere);
    document.getElementById('btn-search-reset')?.addEventListener('click', resetSearchOrigin);
    document.getElementById('btn-share-whatsapp-pm')?.addEventListener('click', () => {
      const url = document.getElementById('qrcode-url-pm').textContent;
      window.open(`https://wa.me/?text=${encodeURIComponent('Rejoignez Pot à Mèche : ' + url)}`, '_blank');
    });
    document.getElementById('btn-share-whatsapp-vn')?.addEventListener('click', () => {
      const url = document.getElementById('qrcode-url-vn').textContent;
      window.open(
        'https://wa.me/?text=' + encodeURIComponent(
          `Installez ChassNid pour rejoindre le réseau Piste-Frelon :\n${url}`
        ), '_blank'
      );
    });
    document.getElementById('btn-copy-qr-pm')?.addEventListener('click', () => {
      const url = document.getElementById('qrcode-url-pm').textContent;
      navigator.clipboard.writeText(url)
        .then(() => showToast('Lien copié !'))
        .catch(() => showToast('Copiez manuellement le lien'));
    });
    document.getElementById('btn-copy-qr-vn')?.addEventListener('click', () => {
      const url = document.getElementById('qrcode-url-vn').textContent;
      navigator.clipboard.writeText(url)
        .then(() => showToast('Lien copié !'))
        .catch(() => showToast('Copiez manuellement le lien'));
    });

    document.getElementById('btn-aide')?.addEventListener('click', () => showOverlay('overlay-aide'));

    document.getElementById('btn-logout')?.addEventListener('click', async () => {
      await Auth.logout();
      showScreen('login');
    });

    document.getElementById('search-signals')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      const filtered = _applyDateFilter(_signals).filter(s => {
        const sentinel = _sentinelMap[s.phone_id];
        return (s.phone_id || '').toLowerCase().includes(q)
          || (sentinel?.pseudo || '').toLowerCase().includes(q)
          || (sentinel?.pilote || '').toLowerCase().includes(q);
      });
      renderSignals(filtered, _blockedPhones, _sentinelMap);
    });

    document.getElementById('btn-export-csv')?.addEventListener('click', () => {
      const profile  = Auth.getProfile();
      const filtered = _applyDateFilter(_signals);
      if (!filtered || filtered.length === 0) {
        showToast('Aucun signalement à exporter.');
        return;
      }

      const headers = ['Date', 'Heure', 'Latitude', 'Longitude', 'Direction (°)', 'Distance (m)', 'Destination', 'Fréquentation', 'Pseudo sentinelle', 'Pilote'];
      const rows = filtered.map(s => {
        const sentinel  = _sentinelMap[s.phone_id];
        const pseudo    = sentinel?.pseudo || s.pseudo || '';
        const pilote    = sentinel?.pilote || '';
        const dt        = new Date(s.created_at);
        const date      = dt.toLocaleDateString('fr-FR');
        const heure     = dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        return [
          date, heure,
          s.lat?.toFixed(6) || '',
          s.lon?.toFixed(6) || '',
          s.direction ?? '',
          s.distance ?? '',
          s.destination || '',
          s.frequentation || '',
          pseudo,
          pilote
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';');
      });

      const csv     = '\uFEFF' + headers.join(';') + '\n' + rows.join('\n');
      const blob    = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url     = URL.createObjectURL(blob);
      const a       = document.createElement('a');
      const nom     = profile?.prenom ? `${profile.prenom}_${profile.nom}` : 'signalements';
      const today   = new Date().toISOString().slice(0, 10);
      a.href        = url;
      a.download    = `signalements_${nom}_${today}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`${filtered.length} signalements exportés.`);
    });

    // ── SUPPRESSION EN MASSE ──────────────────────────────────
    let _bulkMatches = []; // IDs des signalements correspondant aux filtres

    document.getElementById('btn-bulk-delete')?.addEventListener('click', () => {
      // Réinitialiser le panneau
      document.getElementById('bulk-pseudo').value = '';
      document.getElementById('bulk-date').value = '';
      document.getElementById('bulk-radius').value = '';
      document.getElementById('bulk-preview').textContent = '';
      document.getElementById('btn-bulk-confirm').disabled = true;
      _bulkMatches = [];
      document.getElementById('overlay-bulk-delete').classList.add('active');
    });

    document.getElementById('btn-bulk-cancel')?.addEventListener('click', () => {
      document.getElementById('overlay-bulk-delete').classList.remove('active');
    });

    document.getElementById('btn-bulk-preview')?.addEventListener('click', () => {
      const pseudo  = document.getElementById('bulk-pseudo').value.trim().toLowerCase();
      const dateStr = document.getElementById('bulk-date').value;
      const radius  = parseFloat(document.getElementById('bulk-radius').value);

      // Récupérer le centre actuel de la carte
      const mapCenter = mapGetCenter?.() || null;

      _bulkMatches = _signals.filter(s => {
        const sentinel = _sentinelMap[s.phone_id];
        const sPseudo  = (sentinel?.pseudo || s.pseudo || '').toLowerCase();

        // Filtre pseudo
        if (pseudo && !sPseudo.includes(pseudo)) return false;

        // Filtre date (avant la date donnée)
        if (dateStr && new Date(s.created_at) >= new Date(dateStr)) return false;

        // Filtre zone (rayon autour du centre de la carte)
        if (radius && mapCenter) {
          const R    = 6371;
          const dLat = (s.lat - mapCenter.lat) * Math.PI / 180;
          const dLon = (s.lon - mapCenter.lng) * Math.PI / 180;
          const a    = Math.sin(dLat/2)**2 +
                       Math.cos(mapCenter.lat * Math.PI/180) *
                       Math.cos(s.lat * Math.PI/180) *
                       Math.sin(dLon/2)**2;
          const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          if (dist > radius) return false;
        }

        return true;
      });

      const preview = document.getElementById('bulk-preview');
      const confirm = document.getElementById('btn-bulk-confirm');

      if (!pseudo && !dateStr && !radius) {
        preview.innerHTML = '<span style="color:#c0392b">⚠️ Au moins un filtre est requis.</span>';
        confirm.disabled = true;
        _bulkMatches = [];
        return;
      }

      if (_bulkMatches.length === 0) {
        preview.innerHTML = 'Aucun signalement ne correspond à ces critères.';
        confirm.disabled = true;
        return;
      }

      preview.innerHTML = `<strong style="color:#c0392b">${_bulkMatches.length} signalement(s)</strong> seront supprimés définitivement.`;
      confirm.disabled = false;
    });

    document.getElementById('btn-bulk-confirm')?.addEventListener('click', async () => {
      if (_bulkMatches.length === 0) return;
      const count = _bulkMatches.length;

      document.getElementById('overlay-bulk-delete').classList.remove('active');

      showModal(
        `Supprimer ${count} signalement(s)`,
        `Cette action est irréversible. ${count} signalement(s) vont être supprimés définitivement.`,
        'Supprimer définitivement',
        async () => {
          let deleted = 0;
          let failed = 0;
          const okIds = [];
          for (const s of _bulkMatches) {
            const { error } = await dbSignalDelete(s.id);
            if (error) { failed++; } else { deleted++; okIds.push(s.id); }
          }
          _signals = _signals.filter(s => !okIds.includes(s.id));
          _bulkMatches = [];
          _buildUsers();
          await _refresh();
          showToast(failed
            ? `${deleted} supprimé(s), ${failed} échec(s).`
            : `${deleted} signalement(s) supprimés.`);
        }
      );
    });

    document.getElementById('year-filter-nests')?.addEventListener('change', () => {
      renderNests();
      mapFilterNests(_applyNestFilters());
    });
    document.getElementById('search-nests')?.addEventListener('input', () => {
      renderNests();
      mapFilterNests(_applyNestFilters());
    });

    document.getElementById('search-users')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      const role = Auth.getProfile()?.role;

      let filtered;
      if (role === 'pilot') {
        const filteredPilotUsers = _pilotUsers.filter(u =>
          (u.phone_id || '').toLowerCase().includes(q)
          || (u.pseudo || '').toLowerCase().includes(q)
        );
        filtered = filteredPilotUsers.map(u => ({
          phone_id: u.phone_id,
          count:    u.nb_observations || 0,
          last:     u.derniere_observation || u.rattachement_date,
          blocked:  u.blocked,
        }));
      } else {
        filtered = _users.filter(u => {
          const sentinel = _sentinelMap[u.phone_id];
          return (u.phone_id || '').toLowerCase().includes(q)
            || (sentinel?.pseudo || '').toLowerCase().includes(q)
            || (sentinel?.pilote || '').toLowerCase().includes(q);
        });
      }
      renderUsers(filtered, _sentinelMap);
    });

    document.getElementById('signals-list')?.addEventListener('click', e => {
      const locateBtn = e.target.closest('.btn-locate[data-signal-id]');
      const deleteBtn = e.target.closest('.btn-delete[data-signal-id]');
      if (locateBtn) {
        switchTab('map');
        mapFocusSignal(parseInt(locateBtn.dataset.signalId));
      }
      if (deleteBtn) deleteSignal(parseInt(deleteBtn.dataset.signalId));
    });

    document.getElementById('users-list')?.addEventListener('click', e => {
      const blockBtn   = e.target.closest('.btn-block[data-phone]');
      const unblockBtn = e.target.closest('.btn-unblock[data-phone]');
      const deleteBtn  = e.target.closest('.btn-delete-sentinel[data-phone]');
      if (blockBtn)   blockUser(blockBtn.dataset.phone, blockBtn.dataset.pilot);
      if (unblockBtn) unblockUser(unblockBtn.dataset.phone, unblockBtn.dataset.pilot);
      if (deleteBtn)  deleteSentinel(deleteBtn.dataset.phone, deleteBtn.dataset.pilot);
    });

    document.getElementById('pending-list')?.addEventListener('click', e => {
      const validateBtn = e.target.closest('[data-pending-id].btn-unblock');
      const rejectBtn   = e.target.closest('[data-pending-id].btn-block');
      if (validateBtn) validatePending(validateBtn.dataset.pendingId, validateBtn.dataset.pendingName);
      if (rejectBtn)   rejectPending(rejectBtn.dataset.pendingId, rejectBtn.dataset.pendingName);
    });
  }

  return {
    init,
    load,
    getSignals,
    getAdmins,
    getPilots,
    setAdmins,
    setPilots,
    validatePending,
    rejectPending,
    renderNests,
    generateCodeVN,
    shareCodeVN,
    filterNestsByRadius,
    getRadius: () => _radius,
    setNests: (nests) => { _nests = nests; },
  };

})();
