// ── ÉCRANS ────────────────────────────────────────────────────

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
}

// ── ONGLETS AUTH ──────────────────────────────────────────────

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((b, i) =>
    b.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register'))
  );
  document.getElementById('form-login').style.display   = tab === 'login'    ? 'block' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
}

// ── ONGLETS DASHBOARD ─────────────────────────────────────────

function switchTab(name, btn) {
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'map') mapInvalidate();
}

// ── TOAST ─────────────────────────────────────────────────────

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

// ── MODAL ─────────────────────────────────────────────────────

function showModal(title, text, label, callback) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-text').textContent  = text;
  const btn = document.getElementById('modal-ok');
  btn.textContent = label;
  btn.onclick = () => { closeModal(); callback(); };
  document.getElementById('modal').classList.add('active');
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
}

// ── MESSAGES AUTH ─────────────────────────────────────────────

function showAuthMsg(id, type, text) {
  const el = document.getElementById(id);
  el.className = 'auth-message ' + type;
  el.textContent = text;
}

// ── STATS ─────────────────────────────────────────────────────

function updateStats(signals, users) {
  const today = new Date().toDateString();
  document.getElementById('stat-total').textContent   = signals.length;
  document.getElementById('stat-today').textContent   = signals.filter(s => new Date(s.created_at).toDateString() === today).length;
  document.getElementById('stat-users').textContent   = users.length;
  document.getElementById('stat-blocked').textContent = users.filter(u => u.blocked).length;
}

// ── RENDU LISTES ──────────────────────────────────────────────

function renderSignals(signals, users) {
  const blockedPhones = new Set(users.filter(u => u.blocked).map(u => u.phone_id));
  const el = document.getElementById('signals-list');
  if (!signals.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">📍</div>${t('empty_signals')}</div>`;
    return;
  }
  const loc = lang === 'fr' ? 'fr-FR' : 'de-DE';
  el.innerHTML = signals.map(s => {
    const isBlocked = blockedPhones.has(s.phone_id);
    return `
      <div class="signal-card ${isBlocked ? 'blocked-user' : ''}">
        <div class="signal-info">
          <div class="signal-date">${new Date(s.created_at).toLocaleString(loc)}</div>
          <div class="signal-meta">${(s.lat||0).toFixed(5)}, ${(s.lon||0).toFixed(5)} · ${s.distance||0}m · ${s.direction||0}°</div>
          <div class="signal-phone">${s.phone_id || '—'}</div>
        </div>
        <button class="btn-delete" onclick="App.confirmDelete(${s.id})">${t('btn_delete')}</button>
      </div>`;
  }).join('');
}

function renderUsers(users) {
  const el = document.getElementById('users-list');
  if (!users.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">👤</div>${t('empty_users')}</div>`;
    return;
  }
  const loc = lang === 'fr' ? 'fr-FR' : 'de-DE';
  el.innerHTML = users.map(u => `
    <div class="user-card ${u.blocked ? 'blocked' : ''}">
      <div class="user-info">
        <div class="user-phone">${u.phone_id}</div>
        <div class="user-meta">${u.count} ${t('lbl_signals')} · ${new Date(u.last).toLocaleDateString(loc)}</div>
      </div>
      <span class="badge ${u.blocked ? 'badge-blocked' : 'badge-active'}">
        ${u.blocked ? t('badge_blocked') : t('badge_active')}
      </span>
      ${u.blocked
        ? `<button class="btn-unblock" onclick="App.confirmUnblock('${u.phone_id}')">${t('btn_unblock')}</button>`
        : `<button class="btn-block"   onclick="App.confirmBlock('${u.phone_id}')">${t('btn_block')}</button>`
      }
    </div>`).join('');
}

function setLoading(id) {
  document.getElementById(id).innerHTML =
    `<div class="loading"><div class="spinner"></div></div>`;
}
