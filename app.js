// ── MODULE PIN ────────────────────────────────────────────────
const Pin = (() => {
  const state = { login: '', reg: ['',''], new: ['',''], prof: ['',''] };

  function _dots(ctx, slot) {
    const idMap = {
      login: ['pin-login-display'],
      reg:   ['pin-reg1-display',  'pin-reg2-display'],
      new:   ['pin-new1-display',  'pin-new2-display'],
      prof:  ['pin-prof1-display', 'pin-prof2-display'],
    };
    return document.getElementById(idMap[ctx][slot]).querySelectorAll('.pin-dot');
  }

  function _render(ctx) {
    if (ctx === 'login') {
      const val = state.login;
      _dots('login', 0).forEach((d, i) => d.classList.toggle('filled', i < val.length));
    } else {
      const pair = state[ctx];
      const active = pair[0].length < 6 ? 0 : 1;
      [0, 1].forEach(s => {
        const val = pair[s];
        _dots(ctx, s).forEach((d, i) => d.classList.toggle('filled', i < val.length));
      });
      [0, 1].forEach(s => {
        const el = _dots(ctx, s)[0].parentElement;
        el.style.opacity = (s === active) ? '1' : '0.4';
      });
    }
  }

  function press(ctx, digit) {
    if (ctx === 'login') {
      if (state.login.length < 6) state.login += digit;
    } else {
      const pair = state[ctx];
      const active = pair[0].length < 6 ? 0 : 1;
      if (pair[active].length < 6) pair[active] += digit;
    }
    _render(ctx);
  }

  function del(ctx) {
    if (ctx === 'login') {
      state.login = state.login.slice(0, -1);
    } else {
      const pair = state[ctx];
      const active = pair[1].length > 0 ? 1 : 0;
      pair[active] = pair[active].slice(0, -1);
    }
    _render(ctx);
  }

  function get(ctx) {
    if (ctx === 'login') return state.login;
    return state[ctx];
  }

  function reset(ctx) {
    if (ctx === 'login') state.login = '';
    else state[ctx] = ['', ''];
    _render(ctx);
  }

  function setError(ctx) {
    const ctxs = ctx === 'login' ? [['login',0]] : [[ctx,0],[ctx,1]];
    ctxs.forEach(([c, s]) => _dots(c, s).forEach(d => {
      d.classList.add('error');
      setTimeout(() => { d.classList.remove('error'); d.classList.remove('filled'); }, 500);
    }));
    setTimeout(() => reset(ctx), 500);
  }

  return { press, del, get, reset, setError };
})();

const App = (() => {

  let currentUser    = null;
  let currentRadius  = 50;
  let currentProfile = null;
  let allSignals     = [];
  let allUsers       = [];
  let allPilots      = [];
  let allAdmins      = [];
  let pilotUsers     = [];
  let blockedPhones  = new Set();

  // ── INIT ────────────────────────────────────────────────────

  async function init() {
    setLang(lang);
    document.getElementById('topbar-version').textContent = 'v' + CONFIG.APP_VERSION;
    document.getElementById('auth-version').textContent   = 'v' + CONFIG.APP_VERSION;
    initRadiusSelector();

    // Récupération de session au démarrage
    const { data: { session: existingSession } } = await sb.auth.getSession();
    if (existingSession?.user) {
      currentUser = existingSession.user;
      await _checkPendingProfile(existingSession.user.id, existingSession.user.email);
      currentProfile = await profileGet(existingSession.user.id);
      if (currentProfile && currentProfile.role !== 'pending' && currentProfile.role !== 'blocked') {
        _applyRoleUI(currentProfile.role);
        document.getElementById('topbar-canton').textContent =
          (currentProfile.secteur || currentProfile.canton || '—') +
          ' · ' + (currentProfile.departement || '—');
        showScreen('dashboard');
        await _loadAll();
        return;
      }
    }

    authOnChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        showScreen('auth');
        document.getElementById('form-login').style.display        = 'none';
        document.getElementById('form-reset').style.display        = 'none';
        document.getElementById('form-register').style.display     = 'none';
        document.getElementById('form-new-password').style.display = 'block';
        return;
      }
      if (session?.user) {
        currentUser = session.user;
        await _checkPendingProfile(session.user.id, session.user.email);
        currentProfile = await profileGet(session.user.id);
        if (!currentProfile || currentProfile.role === 'pending') {
          showScreen('pending');
        } else if (currentProfile.role === 'blocked') {
          await authSignOut();
          showScreen('auth');
        } else {
          _applyRoleUI(currentProfile.role);
          document.getElementById('topbar-canton').textContent =
            (currentProfile.secteur || currentProfile.canton || '—') +
            ' · ' + (currentProfile.departement || '—');
          showScreen('dashboard');
          await _loadAll();
        }
      } else {
        showScreen('auth');
      }
    });
  }

  // ── GESTION DE L'UI SELON LE RÔLE ───────────────────────────

  function _applyRoleUI(role) {
    const tabAdmins = document.getElementById('tab-btn-admins');
    if (tabAdmins) {
      tabAdmins.style.display = role === 'superadmin' ? 'block' : 'none';
    }
    const tabPilots = document.getElementById('tab-btn-pilots');
    if (tabPilots) {
      tabPilots.style.display = ['superadmin', 'admin_dept'].includes(role) ? 'block' : 'none';
    }
    const tabPending = document.getElementById('tab-btn-pending');
    if (tabPending) {
      tabPending.style.display = ['superadmin', 'admin_dept'].includes(role) ? 'block' : 'none';
    }
    const btnQr = document.getElementById('btn-qrcode');
    if (btnQr) {
      btnQr.style.display = ['superadmin', 'admin_dept', 'pilot'].includes(role) ? 'inline-flex' : 'none';
    }
  }

  // ── CHARGEMENT DES DONNÉES ───────────────────────────────────

  async function _loadAll() {
    setLoading('signals-list');
    setLoading('users-list');

    const role = currentProfile.role;

    if (role === 'superadmin') {
      allSignals    = await signalsGetAll();
      blockedPhones = await blockedGetAll();
      allAdmins     = await adminsGetAll();
      allPilots     = await pilotsGetByDept(currentProfile.id);
      await _loadPending();
    } else if (role === 'pilot') {
      allSignals    = await signalsGetAll(currentProfile.lat, currentProfile.lon, currentRadius);
      pilotUsers    = await pilotUsersGet(currentProfile.id);
      blockedPhones = new Set(pilotUsers.filter(u => u.blocked).map(u => u.phone_id));
    } else {
      // admin_dept
      allSignals    = await signalsGetAll(currentProfile.lat, currentProfile.lon, currentRadius);
      blockedPhones = await blockedGetAll();
      allPilots     = await pilotsGetByDept(currentProfile.id);
      await _loadPending();
    }

    _buildUsers();
    _refresh();
  }

  async function _loadPending() {
    const pending = await pendingGetAll();
    renderPending(pending);
  }

  function _buildUsers() {
    const role = currentProfile?.role;
    if (role === 'pilot') {
      allUsers = pilotUsers.map(u => ({
        phone_id: u.phone_id,
        count:    u.nb_observations || 0,
        last:     u.derniere_observation || u.rattachement_date,
        blocked:  u.blocked,
      }));
    } else {
      const phones = [...new Set(allSignals.map(s => s.phone_id).filter(Boolean))];
      allUsers = phones.map(phone => ({
        phone_id: phone,
        count:    allSignals.filter(s => s.phone_id === phone).length,
        last:     allSignals.find(s => s.phone_id === phone)?.created_at,
        blocked:  blockedPhones.has(phone),
      }));
    }
  }

  function _refresh() {
    renderSignals(allSignals, allUsers);
    renderUsers(allUsers);
    updateStats(allSignals, allUsers);
    mapInit(allSignals, blockedPhones);
    if (currentProfile?.role === 'superadmin') {
      renderAdmins(allAdmins);
    }
    if (['superadmin', 'admin_dept'].includes(currentProfile?.role)) {
      renderPilots(allPilots);
    }
  }

  // ── PROFIL EN ATTENTE ────────────────────────────────────────

  async function _checkPendingProfile(userId, email) {
    const raw = localStorage.getItem('pending_profile');
    if (!raw) return;
    const p = JSON.parse(raw);
    if (p.email !== email) return;
    await profileCreate(userId, p);
    localStorage.removeItem('pending_profile');
  }

  // ── AUTH ─────────────────────────────────────────────────────

  async function signInWithPassword() {
    const email = document.getElementById('login-email').value.trim();
    const pin   = Pin.get('login');
    if (!email || pin.length < 6) {
      showAuthMsg('login-msg', 'error', "Saisir l'email et le code PIN complet.");
      return;
    }
    const btn = document.getElementById('btn-login');
    btn.disabled = true;
    const { error } = await authSignInWithPassword(email, pin);
    btn.disabled = false;
    if (error) { Pin.setError('login'); showAuthMsg('login-msg', 'error', error.message); }
    else Pin.reset('login');
  }

  function showResetForm() {
    document.getElementById('form-login').style.display    = 'none';
    document.getElementById('form-reset').style.display    = 'block';
    document.getElementById('form-register').style.display = 'none';
  }

  function showLoginForm() {
    document.getElementById('form-login').style.display    = 'block';
    document.getElementById('form-reset').style.display    = 'none';
    document.getElementById('form-register').style.display = 'none';
  }

  async function sendPasswordReset() {
    const email = document.getElementById('reset-email').value.trim();
    if (!email) return;
    const btn = document.getElementById('btn-reset');
    btn.disabled = true;
    const { error } = await authResetPassword(email);
    btn.disabled = false;
    showAuthMsg('reset-msg', error ? 'error' : 'success',
      error ? error.message : 'Email de reset envoyé !');
  }

  async function registerAdmin() {
    const prenom = document.getElementById('reg-prenom').value.trim();
    const nom    = document.getElementById('reg-nom').value.trim();
    const email  = document.getElementById('reg-email').value.trim();
    const dept   = document.getElementById('reg-dept').value.trim();
    const canton = document.getElementById('reg-canton').value.trim();
    const [pin1, pin2] = Pin.get('reg');

    if (!prenom || !nom || !email || !dept || !canton) {
      showAuthMsg('register-msg', 'error', t('msg_fill')); return;
    }
    if (pin1.length < 6) {
      showAuthMsg('register-msg', 'error', 'Saisir un code PIN à 6 chiffres.'); return;
    }
    if (pin1 !== pin2) {
      Pin.setError('reg');
      showAuthMsg('register-msg', 'error', 'Les codes PIN ne correspondent pas.'); return;
    }

    const btn = document.getElementById('btn-register');
    btn.disabled = true;
    const { error } = await authSignUp(email, pin1);
    btn.disabled = false;
    if (error) { showAuthMsg('register-msg', 'error', error.message); return; }
    Pin.reset('reg');
    localStorage.setItem('pending_profile', JSON.stringify({
      prenom, nom, email, departement: dept, canton
    }));
    showAuthMsg('register-msg', 'success', t('msg_registered'));
  }

  function showProfilePanel() {
    const p = currentProfile;
    document.getElementById('profile-info').textContent =
      (p?.prenom ? p.prenom + ' ' + p.nom + ' — ' : '') +
      (p?.email || currentUser?.email || '') +
      (p?.role ? ' · ' + _roleLabel(p.role) : '');
    Pin.reset('prof');
    document.getElementById('profile-msg').textContent = '';
    document.getElementById('profile-msg').className   = 'auth-message';
    document.getElementById('profile-panel').classList.add('active');
  }

  function hideProfilePanel() {
    document.getElementById('profile-panel').classList.remove('active');
  }

  async function savePassword() {
    const [p1, p2] = Pin.get('prof');
    if (p1.length < 6) {
      showAuthMsg('profile-msg', 'error', 'Saisir un code PIN à 6 chiffres.'); return;
    }
    if (p1 !== p2) {
      Pin.setError('prof');
      showAuthMsg('profile-msg', 'error', 'Les codes PIN ne correspondent pas.'); return;
    }
    const btn = document.getElementById('btn-profile-save');
    btn.disabled = true;
    const { error } = await authUpdatePassword(p1);
    btn.disabled = false;
    if (error) {
      showAuthMsg('profile-msg', 'error', error.message);
    } else {
      Pin.reset('prof');
      showAuthMsg('profile-msg', 'success', 'Code PIN mis à jour !');
      setTimeout(() => hideProfilePanel(), 1500);
    }
  }

  async function updatePassword() {
    const [p1, p2] = Pin.get('new');
    if (p1.length < 6) {
      showAuthMsg('new-password-msg', 'error', 'Saisir un code PIN à 6 chiffres.'); return;
    }
    if (p1 !== p2) {
      Pin.setError('new');
      showAuthMsg('new-password-msg', 'error', 'Les codes PIN ne correspondent pas.'); return;
    }
    const btn = document.getElementById('btn-new-password');
    btn.disabled = true;
    const { error } = await authUpdatePassword(p1);
    btn.disabled = false;
    if (error) {
      showAuthMsg('new-password-msg', 'error', error.message);
    } else {
      Pin.reset('new');
      showAuthMsg('new-password-msg', 'success', 'Code PIN mis à jour !');
      setTimeout(() => {
        document.getElementById('form-new-password').style.display = 'none';
        document.getElementById('form-login').style.display = 'block';
      }, 2000);
    }
  }

  async function signOut() {
    await authSignOut();
    currentUser = currentProfile = null;
    allSignals = []; allUsers = []; allPilots = []; allAdmins = []; pilotUsers = [];
    showScreen('auth');
  }

  // ── ACTIONS SIGNALEMENTS ────────────────────────────────────

  function confirmDelete(id) {
    showModal(t('modal_delete_title'), t('modal_delete_text'), t('btn_delete'), async () => {
      await signalDelete(id);
      showToast(t('msg_deleted'));
      allSignals = allSignals.filter(s => s.id !== id);
      _buildUsers();
      _refresh();
    });
  }

  // ── ACTIONS UTILISATEURS ────────────────────────────────────

  function confirmBlock(phone_id) {
    showModal(t('modal_block_title'), t('modal_block_text'), t('btn_block'), async () => {
      const role = currentProfile.role;
      if (role === 'pilot') {
        await pilotUserBlock(phone_id, currentProfile.id);
        pilotUsers = pilotUsers.map(u =>
          u.phone_id === phone_id ? { ...u, blocked: true } : u
        );
      } else {
        await blockedAdd(phone_id, currentUser.id);
        blockedPhones.add(phone_id);
      }
      showToast(t('msg_blocked'));
      _buildUsers();
      _refresh();
    });
  }

  function confirmUnblock(phone_id) {
    showModal(t('modal_unblock_title'), t('modal_unblock_text'), t('btn_unblock'), async () => {
      const role = currentProfile.role;
      if (role === 'pilot') {
        await pilotUserUnblock(phone_id, currentProfile.id);
        pilotUsers = pilotUsers.map(u =>
          u.phone_id === phone_id ? { ...u, blocked: false } : u
        );
      } else {
        await blockedRemove(phone_id);
        blockedPhones.delete(phone_id);
      }
      showToast(t('msg_unblocked'));
      _buildUsers();
      _refresh();
    });
  }

  // ── ACTIONS ADMINS (superadmin) ─────────────────────────────

  function showCreateAdminPanel() {
    document.getElementById('create-admin-panel').classList.add('active');
  }

  function hideCreateAdminPanel() {
    document.getElementById('create-admin-panel').classList.remove('active');
    document.getElementById('create-admin-msg').textContent = '';
  }

  async function createAdmin() {
    const prenom  = document.getElementById('admin-prenom').value.trim();
    const nom     = document.getElementById('admin-nom').value.trim();
    const email   = document.getElementById('admin-email').value.trim();
    const dept    = document.getElementById('admin-departement').value.trim();
    const secteur = document.getElementById('admin-secteur').value.trim();

    if (!prenom || !nom || !email || !dept) {
      showAuthMsg('create-admin-msg', 'error', 'Tous les champs sont requis.'); return;
    }

    const btn = document.getElementById('btn-create-admin');
    btn.disabled = true;
    const { error } = await adminCreate(currentProfile.id, {
      email, nom, prenom, secteur, departement: dept,
    });
    btn.disabled = false;

    if (error) {
      showAuthMsg('create-admin-msg', 'error', error.message);
    } else {
      showToast(`Admin ${prenom} ${nom} créé — PIN provisoire : ${CONFIG.PILOT_DEFAULT_PIN}`);
      hideCreateAdminPanel();
      allAdmins = await adminsGetAll();
      renderAdmins(allAdmins);
    }
  }

  function confirmDeleteAdmin(id, name) {
    showModal(
      'Supprimer cet administrateur',
      `Supprimer ${name} et tous ses pilotes rattachés ?`,
      'Supprimer',
      async () => {
        await adminDelete(id);
        showToast(`${name} supprimé.`);
        allAdmins = allAdmins.filter(a => a.id !== id);
        renderAdmins(allAdmins);
      }
    );
  }

  function confirmBlockAdmin(id, name) {
    showModal(
      'Bloquer cet administrateur',
      `Bloquer l'accès de ${name} ?`,
      'Bloquer',
      async () => {
        await pilotUpdateRole(id, 'blocked');
        showToast(`${name} bloqué.`);
        allAdmins = await adminsGetAll();
        renderAdmins(allAdmins);
      }
    );
  }

  function confirmUnblockAdmin(id, name) {
    showModal(
      'Débloquer cet administrateur',
      `Rétablir l'accès de ${name} ?`,
      'Débloquer',
      async () => {
        await pilotUpdateRole(id, 'admin_dept');
        showToast(`${name} débloqué.`);
        allAdmins = await adminsGetAll();
        renderAdmins(allAdmins);
      }
    );
  }

  async function loadAdminsTab() {
    setLoading('admins-list');
    allAdmins = await adminsGetAll();
    renderAdmins(allAdmins);
  }

  // ── ACTIONS PILOTES (admin_dept) ────────────────────────────

  function showCreatePilotPanel() {
    document.getElementById('create-pilot-panel').classList.add('active');
  }

  function hideCreatePilotPanel() {
    document.getElementById('create-pilot-panel').classList.remove('active');
    document.getElementById('create-pilot-msg').textContent = '';
  }

  async function createPilot() {
    const prenom  = document.getElementById('pilot-prenom').value.trim();
    const nom     = document.getElementById('pilot-nom').value.trim();
    const email   = document.getElementById('pilot-email').value.trim();
    const secteur = document.getElementById('pilot-secteur').value.trim();

    if (!prenom || !nom || !email || !secteur) {
      showAuthMsg('create-pilot-msg', 'error', 'Tous les champs sont requis.'); return;
    }

    const btn = document.getElementById('btn-create-pilot');
    btn.disabled = true;
    const { error } = await pilotCreate(currentProfile.id, {
      email, nom, prenom, secteur,
      departement: currentProfile.departement,
    });
    btn.disabled = false;

    if (error) {
      showAuthMsg('create-pilot-msg', 'error', error.message);
    } else {
      showToast(`Pilote ${prenom} ${nom} créé — PIN provisoire : ${CONFIG.PILOT_DEFAULT_PIN}`);
      hideCreatePilotPanel();
      allPilots = await pilotsGetByDept(currentProfile.id);
      renderPilots(allPilots);
    }
  }

  function confirmDeletePilot(id, name) {
    showModal(
      'Supprimer ce pilote',
      `Supprimer ${name} et tous ses utilisateurs rattachés ?`,
      'Supprimer',
      async () => {
        await pilotDelete(id);
        showToast(`${name} supprimé.`);
        allPilots = allPilots.filter(p => p.id !== id);
        renderPilots(allPilots);
      }
    );
  }

  function confirmBlockPilot(id, name) {
    showModal(
      'Bloquer ce pilote',
      `Bloquer l'accès de ${name} ?`,
      'Bloquer',
      async () => {
        await pilotUpdateRole(id, 'blocked');
        showToast(`${name} bloqué.`);
        allPilots = await pilotsGetByDept(currentProfile.id);
        renderPilots(allPilots);
      }
    );
  }

  function confirmUnblockPilot(id, name) {
    showModal(
      'Débloquer ce pilote',
      `Rétablir l'accès de ${name} ?`,
      'Débloquer',
      async () => {
        await pilotUpdateRole(id, 'pilot');
        showToast(`${name} débloqué.`);
        allPilots = await pilotsGetByDept(currentProfile.id);
        renderPilots(allPilots);
      }
    );
  }

  async function loadPilotsTab() {
    setLoading('pilots-list');
    allPilots = await pilotsGetByDept(currentProfile.id);
    renderPilots(allPilots);
  }

  // ── QR CODE ──────────────────────────────────────────────────

  function showQrCode() {
    const url = qrCodeBuildUrl(currentProfile.id);
    const panel     = document.getElementById('qrcode-panel');
    const container = document.getElementById('qrcode-container');
    const urlEl     = document.getElementById('qrcode-url');
    container.innerHTML = '';
    new QRCode(container, {
      text:         url,
      width:        220,
      height:       220,
      colorDark:    '#1a2e1a',
      colorLight:   '#ffffff',
      correctLevel: QRCode.CorrectLevel.H,
    });
    if (urlEl) urlEl.textContent = url;
    panel.classList.add('active');
  }

  function hideQrCode() {
    document.getElementById('qrcode-panel').classList.remove('active');
  }

  // ── AIDE ─────────────────────────────────────────────────────

  function showAide() {
    document.getElementById('aide-panel').classList.add('active');
  }

  function hideAide() {
    document.getElementById('aide-panel').classList.remove('active');
  }

  // ── FILTRES ─────────────────────────────────────────────────

  function filterSignals() {
    const q = document.getElementById('search-signals').value.toLowerCase();
    renderSignals(
      allSignals.filter(s => (s.phone_id || '').toLowerCase().includes(q)),
      allUsers
    );
  }

  function filterUsers() {
    const q = document.getElementById('search-users').value.toLowerCase();
    renderUsers(allUsers.filter(u => u.phone_id.toLowerCase().includes(q)));
  }

  // ── VALIDATION ADMINS EN ATTENTE ────────────────────────────

  function confirmValidate(id, name) {
    showModal(
      'Valider cet administrateur',
      `Accorder l'accès à ${name} ?`,
      'Valider',
      async () => {
        await pendingValidate(id);
        showToast(`${name} est maintenant administrateur.`);
        await _loadPending();
      }
    );
  }

  function confirmReject(id, name) {
    showModal(
      'Refuser cette demande',
      `Supprimer la demande de ${name} ?`,
      'Refuser',
      async () => {
        await pendingReject(id);
        showToast(`Demande de ${name} supprimée.`);
        await _loadPending();
      }
    );
  }

  // ── RAYON ───────────────────────────────────────────────────

  async function onRadiusChange(km) {
    currentRadius = km;
    setRadiusDisplay(km);
    setLoading('signals-list');
    setLoading('users-list');
    if (currentProfile.role === 'superadmin') {
      allSignals = await signalsGetAll();
    } else {
      allSignals = await signalsGetAll(currentProfile.lat, currentProfile.lon, currentRadius);
    }
    blockedPhones = await blockedGetAll();
    _buildUsers();
    _refresh();
  }

  // ── UTILITAIRES ──────────────────────────────────────────────

  function _roleLabel(role) {
    const labels = {
      superadmin: 'Super Admin',
      admin_dept: 'Admin Départemental',
      pilot:      'Pilote',
      pending:    'En attente',
      blocked:    'Bloqué',
    };
    return labels[role] || role;
  }

  // ── API PUBLIQUE ─────────────────────────────────────────────

  return {
    init,
    signInWithPassword,
    showResetForm,
    showLoginForm,
    sendPasswordReset,
    registerAdmin,
    signOut,
    confirmDelete,
    confirmBlock,
    confirmUnblock,
    filterSignals,
    filterUsers,
    onRadiusChange,
    confirmValidate,
    confirmReject,
    updatePassword,
    showProfilePanel,
    hideProfilePanel,
    savePassword,
    showCreateAdminPanel,
    hideCreateAdminPanel,
    createAdmin,
    confirmDeleteAdmin,
    confirmBlockAdmin,
    confirmUnblockAdmin,
    loadAdminsTab,
    showCreatePilotPanel,
    hideCreatePilotPanel,
    createPilot,
    confirmDeletePilot,
    confirmBlockPilot,
    confirmUnblockPilot,
    loadPilotsTab,
    showQrCode,
    hideQrCode,
    showAide,
    hideAide,
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
