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

  async function sendMagicLink() {
    const email = document.getElementById('login-email').value.trim();
    if (!email) return;
    const btn = document.getElementById('btn-magic');
    btn.disabled = true;
    const { error } = await authSendMagicLink(email);
    btn.disabled = false;
    showAuthMsg('login-msg', error ? 'error' : 'success',
      error ? error.message : t('msg_link_sent'));
  }

  async function registerAdmin() {
    const prenom = document.getElementById('reg-prenom').value.trim();
    const nom    = document.getElementById('reg-nom').value.trim();
    const email  = document.getElementById('reg-email').value.trim();
    const dept   = document.getElementById('reg-dept').value.trim();
    const canton = document.getElementById('reg-canton').value.trim();

    if (!prenom || !nom || !email || !dept || !canton) {
      showAuthMsg('register-msg', 'error', t('msg_fill'));
      return;
    }
    const btn = document.getElementById('btn-register');
    btn.disabled = true;
    const { error } = await authSendMagicLink(email);
    btn.disabled = false;
    if (error) { showAuthMsg('register-msg', 'error', error.message); return; }
    localStorage.setItem('pending_profile', JSON.stringify({
      prenom, nom, email, departement: dept, canton
    }));
    showAuthMsg('register-msg', 'success', t('msg_registered'));
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

  // ── RAYON ───────────────────────────────────────────────────

  async function onRadiusChange(km) {
    currentRadius = km;
    setRadiusDisplay(km);
    setLoading('signals-list');
    setLoading('users-list');
    allSignals    = await signalsGetAll(currentProfile.lat, currentProfile.lon, currentRadius);
    blockedPhones = await blockedGetAll();
    _buildUsers();
    _refresh();
  }

  // ── API PUBLIQUE ─────────────────────────────────────────────

  return {
    init,
    sendMagicLink,
    registerAdmin,
    signOut,
    confirmDelete,
    confirmBlock,
    confirmUnblock,
    filterSignals,
    filterUsers,
    onRadiusChange,
  };

})();

document.addEventListener('DOMContentLoaded', App.init);
