const App = (() => {

  let currentUser    = null;
  let currentRadius  = 50; // km par défaut
  let currentProfile = null;
  let allSignals     = [];
  let allUsers       = [];
  let blockedPhones  = new Set();

  // ── INIT ────────────────────────────────────────────────────

  async function init() {
    setLang(lang);
    document.getElementById('topbar-version').textContent = 'v' + CONFIG.APP_VERSION;
    initRadiusSelector();

    authOnChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        showScreen('auth');
        document.getElementById('form-login').style.display       = 'none';
        document.getElementById('form-reset').style.display       = 'none';
        document.getElementById('form-register').style.display    = 'none';
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
          document.getElementById('topbar-canton').textContent =
            currentProfile.canton + ' · ' + currentProfile.departement;
          showScreen('dashboard');
          await _loadAll();
        }
      } else {
        showScreen('auth');
      }
    });
  }

  // ── CHARGEMENT DES DONNÉES ───────────────────────────────────

  async function _loadAll() {
    setLoading('signals-list');
    setLoading('users-list');
    allSignals    = await signalsGetAll();
    blockedPhones = await blockedGetAll();
    _buildUsers();
    _refresh();
  }

  async function _loadPending() {
    const pending = await pendingGetAll();
    renderPending(pending);
  }

  function _buildUsers() {
    const phones = [...new Set(allSignals.map(s => s.phone_id).filter(Boolean))];
    allUsers = phones.map(phone => ({
      phone_id: phone,
      count:    allSignals.filter(s => s.phone_id === phone).length,
      last:     allSignals.find(s => s.phone_id === phone)?.created_at,
      blocked:  blockedPhones.has(phone),
    }));
  }

  function _refresh() {
    renderSignals(allSignals, allUsers);
    renderUsers(allUsers);
    updateStats(allSignals, allUsers);
    mapInit(allSignals, blockedPhones);
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
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) return;
    const btn = document.getElementById('btn-login');
    btn.disabled = true;
    const { error } = await authSignInWithPassword(email, password);
    btn.disabled = false;
    if (error) showAuthMsg('login-msg', 'error', error.message);
  }

  function showResetForm() {
    document.getElementById('form-login').style.display  = 'none';
    document.getElementById('form-reset').style.display  = 'block';
    document.getElementById('form-register').style.display = 'none';
  }

  function showLoginForm() {
    document.getElementById('form-login').style.display  = 'block';
    document.getElementById('form-reset').style.display  = 'none';
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
    const prenom   = document.getElementById('reg-prenom').value.trim();
    const nom      = document.getElementById('reg-nom').value.trim();
    const email    = document.getElementById('reg-email').value.trim();
    const dept     = document.getElementById('reg-dept').value.trim();
    const canton   = document.getElementById('reg-canton').value.trim();
    const password = document.getElementById('reg-password').value;
    const password2= document.getElementById('reg-password2').value;

    if (!prenom || !nom || !email || !dept || !canton || !password) {
      showAuthMsg('register-msg', 'error', t('msg_fill'));
      return;
    }
    if (password !== password2) {
      showAuthMsg('register-msg', 'error', 'Les mots de passe ne correspondent pas.');
      return;
    }
    if (password.length < 8) {
      showAuthMsg('register-msg', 'error', 'Le mot de passe doit faire au moins 8 caractères.');
      return;
    }

    const btn = document.getElementById('btn-register');
    btn.disabled = true;
    const { error } = await authSignUp(email, password);
    btn.disabled = false;
    if (error) { showAuthMsg('register-msg', 'error', error.message); return; }
    localStorage.setItem('pending_profile', JSON.stringify({
      prenom, nom, email, departement: dept, canton
    }));
    showAuthMsg('register-msg', 'success', t('msg_registered'));
  }

  function showProfilePanel() {
    const p = currentProfile;
    document.getElementById('profile-info').textContent =
      (p?.prenom ? p.prenom + ' ' + p.nom + ' — ' : '') + (p?.email || currentUser?.email || '');
    document.getElementById('profile-password').value  = '';
    document.getElementById('profile-password2').value = '';
    document.getElementById('profile-msg').textContent = '';
    document.getElementById('profile-msg').className   = 'auth-message';
    document.getElementById('profile-panel').classList.add('active');
  }

  function hideProfilePanel() {
    document.getElementById('profile-panel').classList.remove('active');
  }

  async function savePassword() {
    const p1 = document.getElementById('profile-password').value;
    const p2 = document.getElementById('profile-password2').value;
    if (!p1) { showAuthMsg('profile-msg', 'error', 'Saisir un mot de passe.'); return; }
    if (p1 !== p2) { showAuthMsg('profile-msg', 'error', 'Les mots de passe ne correspondent pas.'); return; }
    if (p1.length < 8) { showAuthMsg('profile-msg', 'error', 'Minimum 8 caractères.'); return; }
    const btn = document.getElementById('btn-profile-save');
    btn.disabled = true;
    const { error } = await authUpdatePassword(p1);
    btn.disabled = false;
    if (error) {
      showAuthMsg('profile-msg', 'error', error.message);
    } else {
      showAuthMsg('profile-msg', 'success', 'Mot de passe mis à jour !');
      setTimeout(() => hideProfilePanel(), 1500);
    }
  }

  async function updatePassword() {
    const p1 = document.getElementById('new-password').value;
    const p2 = document.getElementById('new-password2').value;
    if (p1 !== p2) {
      showAuthMsg('new-password-msg', 'error', 'Les mots de passe ne correspondent pas.');
      return;
    }
    if (p1.length < 8) {
      showAuthMsg('new-password-msg', 'error', 'Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    const btn = document.getElementById('btn-new-password');
    btn.disabled = true;
    const { error } = await authUpdatePassword(p1);
    btn.disabled = false;
    if (error) {
      showAuthMsg('new-password-msg', 'error', error.message);
    } else {
      showAuthMsg('new-password-msg', 'success', 'Mot de passe mis à jour !');
      setTimeout(() => {
        document.getElementById('form-new-password').style.display = 'none';
        document.getElementById('form-login').style.display = 'block';
      }, 2000);
    }
  }

  async function signOut() {
    await authSignOut();
    currentUser = currentProfile = null;
    allSignals = []; allUsers = [];
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
      await blockedAdd(phone_id, currentUser.id);
      showToast(t('msg_blocked'));
      blockedPhones.add(phone_id);
      _buildUsers();
      _refresh();
    });
  }

  function confirmUnblock(phone_id) {
    showModal(t('modal_unblock_title'), t('modal_unblock_text'), t('btn_unblock'), async () => {
      await blockedRemove(phone_id);
      showToast(t('msg_unblocked'));
      blockedPhones.delete(phone_id);
      _buildUsers();
      _refresh();
    });
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

  // ── VALIDATION ADMINS ───────────────────────────────────────

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
    allSignals    = await signalsGetAll(currentProfile.lat, currentProfile.lon, currentRadius);
    await _loadPending();
    blockedPhones = await blockedGetAll();
    _buildUsers();
    _refresh();
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
  };

})();

document.addEventListener('DOMContentLoaded', App.init);
