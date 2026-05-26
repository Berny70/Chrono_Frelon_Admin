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
  document.getElementById('form-login').style.display    = tab === 'login'    ? 'block' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
}

// ── ONGLETS DASHBOARD ─────────────────────────────────────────

function switchTab(name, btn) {
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'map')    mapInvalidate();
  if (name === 'admins') App.loadAdminsTab();
  if (name === 'pilots') App.loadPilotsTab();
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
  document.getElementById('stat-today').textContent   = signals.filter(s =>
    new Date(s.created_at).toDateString() === today).length;
  document.getElementById('stat-users').textContent   = users.length;
  document.getElementById('stat-blocked').textContent = users.filter(u => u.blocked).length;
}

function initRadiusSelector() {
  const el = document.getElementById('radius-select');
  if (!el) return;
  el.addEventListener('change', () => App.onRadiusChange(parseInt(el.value)));
}

function setRadiusDisplay(km) {
  const el = document.getElementById('radius-select');
  if (el) el.value = km;
}

// ── RENDU SIGNALEMENTS ────────────────────────────────────────

function renderSignals(signals, users) {
  const blockedSet = new Set(users.filter(u => u.blocked).map(u => u.phone_id));
  const el = document.getElementById('signals-list');
  if (!signals.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">📍</div>${t('empty_signals')}</div>`;
    return;
  }
  const loc = lang === 'fr' ? 'fr-FR' : 'de-DE';
  el.innerHTML = signals.map(s => {
    const isBlocked = blockedSet.has(s.phone_id);
    return `
      <div class="signal-card ${isBlocked ? 'blocked-user' : ''}">
        <div class="signal-info">
          <div class="signal-date">${new Date(s.created_at).toLocaleString(loc)}</div>
          <div class="signal-meta">
            ${(s.lat||0).toFixed(5)}, ${(s.lon||0).toFixed(5)}
            · ${s.distance||0}m · ${s.direction||0}°
          </div>
          <div class="signal-phone">${s.phone_id || '—'}</div>
        </div>
        <button class="btn-delete" onclick="App.confirmDelete(${s.id})">${t('btn_delete')}</button>
      </div>`;
  }).join('');
}

// ── RENDU UTILISATEURS ────────────────────────────────────────

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
        <div class="user-meta">
          ${u.count} ${t('lbl_signals')}
          · ${u.last ? new Date(u.last).toLocaleDateString(loc) : '—'}
        </div>
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

// ── RENDU ADMINS DÉPARTEMENTAUX ───────────────────────────────

function renderAdmins(admins) {
  const el = document.getElementById('admins-list');
  if (!el) return;
  if (!admins.length) {
    el.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🗺</div>
        Aucun administrateur départemental.<br>
        <small style="color:var(--text-muted)">Cliquez sur "+ Nouvel admin" pour en créer un.</small>
      </div>`;
    return;
  }
  const loc = lang === 'fr' ? 'fr-FR' : 'de-DE';
  el.innerHTML = admins.map(a => {
    const isBlocked = a.role === 'blocked';
    const initiales = ((a.prenom?.[0] || '') + (a.nom?.[0] || '')).toUpperCase();
    return `
      <div class="user-card ${isBlocked ? 'blocked' : ''}">
        <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
          <div style="
            width:36px;height:36px;border-radius:50%;
            background:${isBlocked ? '#c0392b' : '#d4820a'};
            color:#fff;display:flex;align-items:center;justify-content:center;
            font-weight:600;font-size:14px;flex-shrink:0
          ">${initiales}</div>
          <div class="user-info" style="min-width:0">
            <div class="user-phone" style="font-family:'DM Sans',sans-serif;font-size:14px">
              ${a.prenom} ${a.nom}
              ${isBlocked ? '<span style="color:#c0392b;font-size:11px"> · Bloqué</span>' : ''}
            </div>
            <div class="user-meta">${a.email}</div>
            <div class="user-meta">📍 ${a.secteur || '—'} · ${a.departement || '—'}</div>
            <div class="user-meta" style="font-size:11px">
              Créé le ${new Date(a.created_at).toLocaleDateString(loc)}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
          ${isBlocked
            ? `<button class="btn-unblock" onclick="App.confirmUnblockAdmin('${a.id}', '${a.prenom} ${a.nom}')">Débloquer</button>`
            : `<button class="btn-block"   onclick="App.confirmBlockAdmin('${a.id}', '${a.prenom} ${a.nom}')">Bloquer</button>`
          }
          <button class="btn-delete" onclick="App.confirmDeleteAdmin('${a.id}', '${a.prenom} ${a.nom}')">🗑</button>
        </div>
      </div>`;
  }).join('');
}

// ── RENDU PILOTES ─────────────────────────────────────────────

function renderPilots(pilots) {
  const el = document.getElementById('pilots-list');
  if (!el) return;
  if (!pilots.length) {
    el.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🧭</div>
        Aucun pilote enregistré.<br>
        <small style="color:var(--text-muted)">Cliquez sur "+ Nouveau pilote" pour en créer un.</small>
      </div>`;
    return;
  }
  const loc = lang === 'fr' ? 'fr-FR' : 'de-DE';
  el.innerHTML = pilots.map(p => {
    const isBlocked = p.role === 'blocked';
    const initiales = ((p.prenom?.[0] || '') + (p.nom?.[0] || '')).toUpperCase();
    return `
      <div class="user-card ${isBlocked ? 'blocked' : ''}">
        <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
          <div style="
            width:36px;height:36px;border-radius:50%;
            background:${isBlocked ? '#c0392b' : '#2d6a4f'};
            color:#fff;display:flex;align-items:center;justify-content:center;
            font-weight:600;font-size:14px;flex-shrink:0
          ">${initiales}</div>
          <div class="user-info" style="min-width:0">
            <div class="user-phone" style="font-family:'DM Sans',sans-serif;font-size:14px">
              ${p.prenom} ${p.nom}
              ${isBlocked ? '<span style="color:#c0392b;font-size:11px"> · Bloqué</span>' : ''}
            </div>
            <div class="user-meta">${p.email}</div>
            <div class="user-meta">📍 ${p.secteur || p.canton || '—'} · ${p.departement || '—'}</div>
            <div class="user-meta" style="font-size:11px">
              Créé le ${new Date(p.created_at).toLocaleDateString(loc)}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
          ${isBlocked
            ? `<button class="btn-unblock" onclick="App.confirmUnblockPilot('${p.id}', '${p.prenom} ${p.nom}')">Débloquer</button>`
            : `<button class="btn-block"   onclick="App.confirmBlockPilot('${p.id}', '${p.prenom} ${p.nom}')">Bloquer</button>`
          }
          <button class="btn-delete" onclick="App.confirmDeletePilot('${p.id}', '${p.prenom} ${p.nom}')">🗑</button>
        </div>
      </div>`;
  }).join('');
}

// ── RENDU DEMANDES EN ATTENTE ─────────────────────────────────

function renderPending(profiles) {
  const el    = document.getElementById('pending-list');
  const badge = document.getElementById('pending-badge');

  if (badge) {
    badge.style.display = profiles.length > 0 ? 'inline' : 'none';
    badge.textContent   = profiles.length;
  }

  if (!profiles.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">✅</div>Aucune demande en attente.</div>`;
    return;
  }

  const loc = lang === 'fr' ? 'fr-FR' : 'de-DE';
  el.innerHTML = profiles.map(p => `
    <div class="user-card" style="flex-wrap:wrap;gap:12px">
      <div class="user-info" style="min-width:200px">
        <div class="user-phone" style="font-family:'DM Sans',sans-serif;font-size:14px">
          ${p.prenom} ${p.nom}
        </div>
        <div class="user-meta">${p.email}</div>
        <div class="user-meta">${p.canton || p.secteur || '—'} · ${p.departement || '—'}</div>
        <div class="user-meta" style="font-size:11px">${new Date(p.created_at).toLocaleString(loc)}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn-unblock" onclick="App.confirmValidate('${p.id}', '${p.prenom} ${p.nom}')">✅ Valider</button>
        <button class="btn-block"   onclick="App.confirmReject('${p.id}', '${p.prenom} ${p.nom}')">❌ Refuser</button>
      </div>
    </div>`).join('');
}

// ── UTILITAIRE ────────────────────────────────────────────────

function setLoading(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
}

// ── FAQ ACCORDION ─────────────────────────────────────────────

function toggleFaq(el) {
  const answer = el.nextElementSibling;
  const isOpen = answer.classList.contains('open');
  document.querySelectorAll('.faq-answer.open').forEach(a => a.classList.remove('open'));
  document.querySelectorAll('.faq-question.open').forEach(q => q.classList.remove('open'));
  if (!isOpen) {
    answer.classList.add('open');
    el.classList.add('open');
  }
}
