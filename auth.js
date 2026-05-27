// ── auth.js — Authentification via PIN + session ──────────────
// Dépend de : config.js, db.js

const Auth = (() => {

  let _profile = null;
  let _token   = null;

  // ── SESSION LOCALE ─────────────────────────────────────────

  function _saveSession(token) {
    localStorage.setItem(CONFIG.SESSION_KEY, token);
    _token = token;
  }

  function _clearSession() {
    localStorage.removeItem(CONFIG.SESSION_KEY);
    _token   = null;
    _profile = null;
  }

  function _getStoredToken() {
    return localStorage.getItem(CONFIG.SESSION_KEY);
  }

  // ── LOGIN ──────────────────────────────────────────────────

  async function login(email, pin) {
    const { data, error } = await db.rpc('chassnid_login', {
      p_email: email,
      p_pin:   pin,
    });

    if (error) return { error: error.message };

    const result = typeof data === 'string' ? JSON.parse(data) : data;

    if (result.error) return { error: result.error };

    _token   = result.token;
    _profile = result.profile;
    _saveSession(_token);

    return { profile: _profile };
  }

  // ── VERIFY — vérifier la session au démarrage ──────────────

  async function verify() {
    const token = _getStoredToken();
    if (!token) return null;

    const { data, error } = await db.rpc('chassnid_verify', {
      p_token: token,
    });

    if (error || !data) {
      _clearSession();
      return null;
    }

    const profile = typeof data === 'string' ? JSON.parse(data) : data;
    _token   = token;
    _profile = profile;
    return profile;
  }

  // ── LOGOUT ─────────────────────────────────────────────────

  async function logout() {
    const token = _token || _getStoredToken();
    if (token) {
      await db.rpc('chassnid_logout', { p_token: token });
    }
    _clearSession();
  }

  // ── CHANGER SON PIN ────────────────────────────────────────

  async function setPin(newPin) {
    if (!_token) return { error: 'Session invalide' };
    if (newPin.length !== CONFIG.PIN_LENGTH) {
      return { error: `Le PIN doit contenir ${CONFIG.PIN_LENGTH} chiffres` };
    }

    const { data, error } = await db.rpc('chassnid_set_pin', {
      p_token:   _token,
      p_new_pin: newPin,
    });

    if (error) return { error: error.message };

    const result = typeof data === 'string' ? JSON.parse(data) : data;
    return result.error ? { error: result.error } : { ok: true };
  }

  // ── RÉINITIALISER LE PIN D'UN AUTRE UTILISATEUR ────────────

  async function resetPin(targetEmail) {
    if (!_token) return { error: 'Session invalide' };

    const { data, error } = await db.rpc('chassnid_reset_pin', {
      p_admin_token:  _token,
      p_target_email: targetEmail,
    });

    if (error) return { error: error.message };

    const result = typeof data === 'string' ? JSON.parse(data) : data;
    return result.error ? { error: result.error } : { ok: true };
  }

  // ── GETTERS ────────────────────────────────────────────────

  function getProfile() { return _profile; }
  function getToken()   { return _token; }
  function isLoggedIn() { return _token !== null && _profile !== null; }

  // ── API PUBLIQUE ───────────────────────────────────────────

  return {
    login,
    verify,
    logout,
    setPin,
    resetPin,
    getProfile,
    getToken,
    isLoggedIn,
  };

})();
