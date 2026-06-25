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
      [_signals, _blockedPhones, _admins, _pilots] = await Promise.all([
        dbSignalsGetAll(),
        dbBlockedGetAll(),
        dbAdminsGetAll(),
        dbPilotsGetByParent(),
      ]);
      await _loadPending();

    } else if (role === 'pilot') {
      [_signals, _pilotUsers] = await Promise.all([
        dbSignalsGetAll(profile.lat, profile.lon, _radius),
        dbPilotUsersGet(profile.id),
      ]);
      _blockedPhones = new Set(_pilotUsers.filter(u => u.blocked).map(u => u.phone_id));

    } else {
      // admin_dept — 1 seul appel pour les sentinelles groupées
      [_signals, _blockedPhones, _pilots, _pilotUsers, _groupedSentinels] = await Promise.all([
        dbSignalsGetAll(profile.lat, profile.lon, _radius),
        dbBlockedGetAll(),
        dbPilotsGetByParent(),
        dbPilotUsersGet(profile.id),
        dbPilotUsersGetByAdmin(),   // RPC SQL unique — plus de N requêtes
      ]);
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
  // _refresh() est désormais synchrone sauf pour superadmin (dbAllSentinelsGet).

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
      const allRaw = await dbAllSentinelsGet();
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
    mapInit(filteredSignals, _blockedPhones);

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
    }

    if (role === 'superadmin') renderAdmins(_admins);
    if (['superadmin', 'admin_dept'].includes(role)) renderPilots(_pilots);
  }

  // ── CHANGEMENT DE RAYON ────────────────────────────────────

  async function onRadiusChange(km) {
    const profile = Auth.getProfile();
    _radius = km;
    setLoading('signals-list');
    setLoading('users-list');

    if (profile.role === 'superadmin') {
      _signals = await dbSignalsGetAll();
    } else {
      _signals = await dbSignalsGetAll(profile.lat, profile.lon, _radius);
    }

    _blockedPhones = await dbBlockedGetAll();
    _buildUsers();
    await _refresh();
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
        await dbSignalDelete(id);
        showToast('Signalement supprimé.');
        _signals = _signals.filter(s => s.id !== id);
        _buildUsers();
        await _refresh();
      }
    );
  }

  // ── ACTIONS UTILISATEURS ──────────────────────────────────

  async function blockUser(phone_id) {
    showModal(
      'Bloquer cette sentinelle',
      'Cette sentinelle ne pourra plus soumettre de signalements.',
      'Bloquer',
      async () => {
        const profile = Auth.getProfile();
        if (profile.role === 'pilot') {
          await dbPilotUserBlock(phone_id, profile.id);
          _pilotUsers = _pilotUsers.map(u =>
            u.phone_id === phone_id ? { ...u, blocked: true } : u
          );
        } else {
          await dbBlockedAdd(phone_id, profile.id);
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
          await dbPilotUserUnblock(phone_id, profile.id);
          _pilotUsers = _pilotUsers.map(u =>
            u.phone_id === phone_id ? { ...u, blocked: false } : u
          );
        } else {
          await dbBlockedRemove(phone_id);
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

  function showProfile() {
    const p = Auth.getProfile();
    const pseudo = p.phone_id ? (_sentinelMap[p.phone_id]?.pseudo || null) : null;
    const pseudoLine = pseudo
      ? `<span style="color:var(--accent)">🏷️ ${pseudo}</span><br>`
      : (p.phone_id ? `<span style="opacity:0.5;font-size:12px">🏷️ Aucun pseudo Chrono_Frelon</span><br>` : '');

    document.getElementById('profile-info').innerHTML =
      `<strong>${p.prenom} ${p.nom}</strong><br>` +
      `${p.email}<br>` +
      `${roleLabel(p.role)}<br>` +
      `${p.secteur || p.canton || '—'} · ${p.departement || '—'}<br>` +
      pseudoLine;

    _profPin = ['', ''];
    _updateProfDots();
    clearAuthMsg('profile-msg');
    showOverlay('overlay-profile');
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

  function showQrCode() {
    const profile = Auth.getProfile();
    const url     = dbQrCodeBuildUrl(profile.id);
    const container = document.getElementById('qrcode-container');
    container.innerHTML = '';
    new QRCode(container, {
      text:         url,
      width:        200,
      height:       200,
      colorDark:    '#0f1f0f',
      colorLight:   '#ffffff',
      correctLevel: QRCode.CorrectLevel.H,
    });
    document.getElementById('qrcode-url').textContent = url;
    showOverlay('overlay-qrcode');
  }

  // ── GETTERS / SETTERS ─────────────────────────────────────

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

    document.getElementById('btn-qrcode')?.addEventListener('click', showQrCode);
    document.getElementById('btn-share-whatsapp')?.addEventListener('click', () => {
      const url = document.getElementById('qrcode-url').textContent;
      window.open(
        'https://wa.me/?text=' + encodeURIComponent(
          `Installez ChassNid pour rejoindre le réseau Piste-Frelon :\n${url}`
        ), '_blank'
      );
    });
    document.getElementById('btn-copy-qr')?.addEventListener('click', () => {
      const url = document.getElementById('qrcode-url').textContent;
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
      const btn = e.target.closest('[data-signal-id]');
      if (btn) deleteSignal(parseInt(btn.dataset.signalId));
    });

    document.getElementById('users-list')?.addEventListener('click', e => {
      const blockBtn   = e.target.closest('.btn-block[data-phone]');
      const unblockBtn = e.target.closest('.btn-unblock[data-phone]');
      if (blockBtn)   blockUser(blockBtn.dataset.phone);
      if (unblockBtn) unblockUser(unblockBtn.dataset.phone);
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
  };

})();
