// ── pages/login.js — Écran de connexion PIN ──────────────────
// Dépend de : config.js, auth.js, ui.js

const Login = (() => {

  let _pin = '';

  // ── PIN KEYBOARD ───────────────────────────────────────────

  function _updateDots() {
    document.querySelectorAll('#pin-login-display .pin-dot').forEach((dot, i) => {
      dot.classList.toggle('filled', i < _pin.length);
    });
  }

  function _pressDigit(digit) {
    if (_pin.length >= CONFIG.PIN_LENGTH) return;
    _pin += digit;
    _updateDots();
    if (_pin.length === CONFIG.PIN_LENGTH) {
      // Auto-submit quand le PIN est complet
      setTimeout(_submit, 120);
    }
  }

  function _delDigit() {
    _pin = _pin.slice(0, -1);
    _updateDots();
  }

  function _setError() {
    const dots = document.querySelectorAll('#pin-login-display .pin-dot');
    dots.forEach(d => d.classList.add('error'));
    setTimeout(() => {
      dots.forEach(d => { d.classList.remove('error', 'filled'); });
      _pin = '';
    }, 500);
  }

  function _reset() {
    _pin = '';
    _updateDots();
    clearAuthMsg('login-msg');
  }

  // ── SUBMIT ─────────────────────────────────────────────────

  async function _submit() {
    const email = document.getElementById('login-email').value.trim();

    if (!email) {
      showAuthMsg('login-msg', 'error', 'Saisissez votre adresse email.');
      return;
    }

    if (_pin.length < CONFIG.PIN_LENGTH) {
      showAuthMsg('login-msg', 'error', `Saisissez votre PIN à ${CONFIG.PIN_LENGTH} chiffres.`);
      return;
    }

    const btn = document.getElementById('btn-login');
    btn.disabled = true;
    btn.textContent = 'Connexion…';

    const { profile, error } = await Auth.login(email, _pin);

    btn.disabled = false;
    btn.textContent = 'Se connecter';

    if (error) {
      _setError();
      showAuthMsg('login-msg', 'error', error);
      return;
    }

    _reset();
    // Déléguer le routing à app.js
    window.dispatchEvent(new CustomEvent('chassnid:login', { detail: profile }));
  }

  // ── INIT ───────────────────────────────────────────────────

  function init() {
    // Version
    const vEl = document.getElementById('login-version');
    if (vEl) vEl.textContent = `v${CONFIG.APP_VERSION} · ${CONFIG.APP_DATE}`;

    // Clavier PIN
    document.querySelectorAll('.pin-key[data-digit]').forEach(btn => {
      // Seulement les boutons sans data-ctx (ceux du login)
      if (!btn.dataset.ctx) {
        btn.addEventListener('click', () => _pressDigit(btn.dataset.digit));
      }
    });

    document.getElementById('pin-del')?.addEventListener('click', _delDigit);

    // Bouton connexion
    document.getElementById('btn-login')?.addEventListener('click', _submit);

    // Enter sur le champ email
    document.getElementById('login-email')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') _submit();
    });

    // Lien PIN oublié
    document.getElementById('btn-forgot')?.addEventListener('click', () => {
      showScreen('reset');
    });

    // Retour depuis reset
    document.getElementById('btn-back-login')?.addEventListener('click', () => {
      showScreen('login');
    });
  }

  return { init };

})();
