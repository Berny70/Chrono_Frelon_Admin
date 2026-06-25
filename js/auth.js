// ── auth.js — Authentification via PIN + session ──────────────
// Dépend de : config.js, db.js

const Auth = (() => {

  let _profile = null;
  let _token   = null;

  // ── SESSION LOCALE ─────────────────────────────────────────

  function _saveSession(token, profile) {
    localStorage.setItem(CONFIG.SESSION_KEY,         token);
    localStorage.setItem(CONFIG.SESSION_KEY + '_profile', JSON.stringify(profile));
    _token   = token;
    _profile = profile;
  }

  function _clearSession() {
    localStorage.removeItem(CONFIG.SESSION_KEY);
    localStorage.removeItem(CONFIG.SESSION_KEY + '_profile');
    _token   = null;
    _profile = null;
  }

  function _getStoredToken() {
    return localStorage.getItem(CONFIG.SESSION_KEY);
  }

  function _getStoredProfile() {
    try {
      const raw = localStorage.getItem(CONFIG.SESSION_KEY + '_profile');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
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

    _saveSession(result.token, result.profile);

    return { profile: _profile };
  }

  // ── VERIFY — vérifier la session au démarrage ──────────────
  // Plus d'appel à chassnid_verify (404 PostgREST).
  // On vérifie que le token et le profil sont en cache,
  // puis on rafraîchit le profil depuis chassnid_login n'est
  // pas possible sans PIN → on revalide via chassnid_get_pilots
  // ou simplement on fait confiance au cache jusqu'à expiration
  // naturelle (le token est valide 30 jours côté Supabase).
  // Si le token est expiré, le premier appel RPC authentifié
  // retournera une erreur et _handleExpired() sera appelé.

  async function verify() {
    const token   = _getStoredToken();
    const profile = _getStoredProfile();

    if (!token || !profile) return null;

    // Vérification légère : on tente un appel RPC authentifié
    // (chassnid_get_pilots) pour confirmer que le token est encore valide.
    const { data, error } = await db.rpc('chassnid_get_pilots', {
      p_token: token,
    });

    if (error) {
      // Erreur réseau passagère : on garde la session en cache
      // et on laisse l'utilisateur entrer (fail-open).
      // Si c'est une vraie expiration, le prochain appel métier échouera
      // et l'utilisateur sera redirigé vers le login.
      console.warn('[Auth.verify] Erreur réseau légère, session conservée :', error.message);
      _token   = token;
      _profile = profile;
      return profile;
    }

    const pilots = typeof data === 'string' ? JSON.parse(data) : data;

    // Si la RPC retourne une erreur métier (token invalide / expiré)
    if (pilots && pilots.error) {
      _clearSession();
      return null;
    }

    // Token valide — restaurer la session
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
