// ── ui.js — Fonctions d'affichage génériques ─────────────────
// Dépend de : config.js

// ── ÉCRANS ────────────────────────────────────────────────────

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.add('active');
}

// ── OVERLAYS ──────────────────────────────────────────────────

function showOverlay(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function hideOverlay(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

// Fermeture par bouton data-close
document.addEventListener('click', e => {
  const target = e.target.closest('[data-close]');
  if (target) hideOverlay(target.dataset.close);
});

// Fermeture en cliquant sur le fond
document.addEventListener('click', e => {
  if (e.target.classList.contains('overlay')) {
    e.target.classList.remove('active');
  }
});

// ── ONGLETS ───────────────────────────────────────────────────

function switchTab(name) {
  document.querySelectorAll('.nav-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === name)
  );
  document.querySelectorAll('.tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === 'tab-' + name)
  );
  if (name === 'map') mapInvalidate();
}

// ── TOAST ─────────────────────────────────────────────────────

function showToast(msg, duration = 3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

// ── MODAL CONFIRMATION ────────────────────────────────────────

function showModal(title, text, label, callback) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-text').textContent  = text;
  const btn = document.getElementById('modal-ok');
  btn.textContent = label;
  btn.onclick = async () => { hideOverlay('overlay-modal'); await callback(); };
  showOverlay('overlay-modal');
}

// ── MESSAGE À ENVOYER ─────────────────────────────────────────

function showMessage(title, msg) {
  document.getElementById('message-title').textContent   = title;
  document.getElementById('message-content').value       = msg;
  showOverlay('overlay-message');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-copy-message')?.addEventListener('click', () => {
    const text = document.getElementById('message-content').value;
    navigator.clipboard.writeText(text)
      .then(() => showToast('Message copié !'))
      .catch(() => showToast('Sélectionnez et copiez manuellement'));
  });
});

// ── AUTH MESSAGE ──────────────────────────────────────────────

function showAuthMsg(id, type, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'auth-message ' + type;
  el.textContent = text;
}

function clearAuthMsg(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'auth-message';
  el.textContent = '';
}

// ── CHARGEMENT ────────────────────────────────────────────────

function setLoading(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
}

// ── STATS ─────────────────────────────────────────────────────

function updateStats(signals, users) {
  const today = new Date().toDateString();
  document.getElementById('stat-total').textContent =
    signals.length;
  document.getElementById('stat-today').textContent =
    signals.filter(s => new Date(s.created_at).toDateString() === today).length;
  document.getElementById('stat-users').textContent =
    users.length;
  document.getElementById('stat-blocked').textContent =
    users.filter(u => u.blocked).length;
}

// ── RAYON ─────────────────────────────────────────────────────

function initRadiusSelector(onChange) {
  const el = document.getElementById('radius-select');
  if (!el) return;
  el.addEventListener('change', () => onChange(parseInt(el.value)));
}

// ── RÔLE LABEL ────────────────────────────────────────────────

function roleLabel(role) {
  return {
    superadmin: 'Super Admin',
    admin_dept: 'Admin Départemental',
    pilot:      'Pilote',
    pending:    'En attente',
    blocked:    'Bloqué',
  }[role] || role;
}

// ── TOPBAR ────────────────────────────────────────────────────

function updateTopbar(profile) {
  const sub = (profile.secteur || profile.canton || '—') +
              ' · ' + (profile.departement || '—');
  document.getElementById('topbar-sub').textContent = sub;
  document.getElementById('login-version') &&
    (document.getElementById('login-version').textContent = '');
}

// ── RÔLES UI ──────────────────────────────────────────────────

function applyRoleUI(role) {
  const show = (id, visible) => {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? (id.startsWith('tab-btn') ? 'block' : 'inline-flex') : 'none';
  };

  show('tab-btn-admins',  role === 'superadmin');
  show('tab-btn-pilots',  ['superadmin', 'admin_dept'].includes(role));
  show('tab-btn-pending', ['superadmin', 'admin_dept'].includes(role));
  show('btn-qrcode',      ['superadmin', 'admin_dept', 'pilot'].includes(role));
  show('btn-new-admin',   role === 'superadmin');
  show('btn-new-pilot',   ['superadmin', 'admin_dept'].includes(role));

  // Filtre admins visible seulement si superadmin
  const filterAdmins = document.getElementById('filter-admins');
  if (filterAdmins) filterAdmins.style.display = role === 'superadmin' ? 'block' : 'none';
}

// ── FAQ ACCORDION ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const answer = btn.nextElementSibling;
      const isOpen = answer.classList.contains('open');
      document.querySelectorAll('.faq-a').forEach(a => a.classList.remove('open'));
      document.querySelectorAll('.faq-q').forEach(q => q.classList.remove('open'));
      if (!isOpen) {
        answer.classList.add('open');
        btn.classList.add('open');
      }
    });
  });
});

// ── RENDU SIGNALEMENTS ────────────────────────────────────────

function renderSignals(signals, blockedSet) {
  const el = document.getElementById('signals-list');
  if (!el) return;
  if (!signals.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📍</div>Aucun signalement dans ce secteur.</div>';
    return;
  }
  el.innerHTML = signals.map(s => {
    const isBlocked = blockedSet.has(s.phone_id);
    return `
      <div class="signal-card ${isBlocked ? 'blocked-user' : ''}">
        <div class="signal-info">
          <div class="signal-date">${new Date(s.created_at).toLocaleString('fr-FR')}</div>
          <div class="signal-meta">${(s.lat||0).toFixed(5)}, ${(s.lon||0).toFixed(5)} · ${s.distance||0}m · ${s.direction||0}°</div>
          <div class="signal-phone">${s.phone_id || '—'}</div>
        </div>
        <button class="btn-delete" data-signal-id="${s.id}">🗑</button>
      </div>`;
  }).join('');
}

// ── RENDU UTILISATEURS ────────────────────────────────────────

function renderUsers(users) {
  const el = document.getElementById('users-list');
  if (!el) return;
  if (!users.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">👤</div>Aucune sentinelle dans ce secteur.</div>';
    return;
  }
  el.innerHTML = users.map(u => `
    <div class="user-card ${u.blocked ? 'blocked' : ''}">
      <div class="user-info">
        <div class="user-phone">${u.phone_id}</div>
        <div class="user-meta">${u.count} signalement${u.count > 1 ? 's' : ''} · ${u.last ? new Date(u.last).toLocaleDateString('fr-FR') : '—'}</div>
      </div>
      <span class="badge ${u.blocked ? 'badge-blocked' : 'badge-active'}">${u.blocked ? 'Bloqué' : 'Actif'}</span>
      ${u.blocked
        ? `<button class="btn-unblock" data-phone="${u.phone_id}">Débloquer</button>`
        : `<button class="btn-block"   data-phone="${u.phone_id}">Bloquer</button>`
      }
    </div>`).join('');
}

// Liste sentinelles dans un conteneur donné (mes sentinelles directes)
function renderUsersList(users, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!users.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">👤</div>Aucune sentinelle directe.</div>';
    return;
  }
  el.innerHTML = users.map(u => `
    <div class="user-card ${u.blocked ? 'blocked' : ''}">
      <div class="user-info">
        <div class="user-phone">${u.pseudo || u.phone_id.substring(0,8) + '…'}</div>
        <div class="user-meta">${u.nb_observations || 0} signalement${(u.nb_observations || 0) > 1 ? 's' : ''} · ${u.derniere_observation ? new Date(u.derniere_observation).toLocaleDateString('fr-FR') : '—'}</div>
      </div>
      <span class="badge ${u.blocked ? 'badge-blocked' : 'badge-active'}">${u.blocked ? 'Bloqué' : 'Actif'}</span>
      ${u.blocked
        ? `<button class="btn-unblock" data-phone="${u.phone_id}">Débloquer</button>`
        : `<button class="btn-block"   data-phone="${u.phone_id}">Bloquer</button>`
      }
    </div>`).join('');
}

// Sentinelles groupées par pilote
function renderSentinelsByPilot(grouped) {
  const el = document.getElementById('pilots-sentinels-list');
  if (!el) return;
  if (!grouped.length || grouped.every(g => g.users.length === 0)) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">👤</div>Aucune sentinelle chez vos pilotes.</div>';
    return;
  }
  el.innerHTML = grouped.map(g => {
    if (g.users.length === 0) return '';
    return `
      <div style="margin-bottom:16px">
        <div style="font-size:13px;font-weight:600;color:var(--text-muted);margin-bottom:8px;padding:0 4px">
          ${g.pilot.prenom} ${g.pilot.nom} — ${g.pilot.secteur || '—'}
          <span style="font-weight:400">(${g.users.length})</span>
        </div>
        ${g.users.map(u => `
          <div class="user-card ${u.blocked ? 'blocked' : ''}">
            <div class="user-info">
              <div class="user-phone">${u.prenom ? u.prenom + ' ' + u.nom : u.phone_id}</div>
              <div class="user-meta">${u.nb_observations || 0} signalement${(u.nb_observations || 0) > 1 ? 's' : ''} · ${u.derniere_observation ? new Date(u.derniere_observation).toLocaleDateString('fr-FR') : '—'}</div>
            </div>
            <span class="badge ${u.blocked ? 'badge-blocked' : 'badge-active'}">${u.blocked ? 'Bloqué' : 'Actif'}</span>
          </div>`).join('')}
      </div>`;
  }).join('');
}

// ── RENDU ADMINS ──────────────────────────────────────────────

function renderAdmins(admins) {
  const el = document.getElementById('admins-list');
  if (!el) return;
  if (!admins.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🗺</div>Aucun administrateur départemental.<br><small>Cliquez sur "+ Nouvel admin" pour en créer un.</small></div>';
    return;
  }
  el.innerHTML = admins.map(a => {
    const isBlocked = a.role === 'blocked';
    const initiales = ((a.prenom?.[0] || '') + (a.nom?.[0] || '')).toUpperCase();
    return `
      <div class="user-card ${isBlocked ? 'blocked' : ''}">
        <div class="user-avatar" style="background:${isBlocked ? '#c0392b' : '#d4820a'}">${initiales}</div>
        <div class="user-info" style="flex:1;min-width:0">
          <div class="user-phone" style="font-family:'DM Sans',sans-serif">${a.prenom} ${a.nom}${isBlocked ? ' <span style="color:#c0392b;font-size:11px">· Bloqué</span>' : ''}</div>
          <div class="user-meta">${a.email}</div>
          <div class="user-meta">📍 ${a.secteur || '—'} · ${a.departement || '—'}</div>
          <div class="user-meta" style="font-size:11px">Créé le ${new Date(a.created_at).toLocaleDateString('fr-FR')}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
          ${isBlocked
            ? `<button class="btn-unblock" data-admin-id="${a.id}" data-admin-name="${a.prenom} ${a.nom}">Débloquer</button>`
            : `<button class="btn-block"   data-admin-id="${a.id}" data-admin-name="${a.prenom} ${a.nom}">Bloquer</button>`
          }
          <button class="btn-view"      data-admin-id="${a.id}" data-admin-name="${a.prenom} ${a.nom}" title="Voir les pilotes">Voir</button>
          <button class="btn-message"   data-admin-id="${a.id}" data-admin-name="${a.prenom} ${a.nom}" data-admin-email="${a.email}" data-admin-prenom="${a.prenom}" data-admin-nom="${a.nom}" title="Message de bienvenue">✉</button>
          <button class="btn-params"    data-admin-id="${a.id}" data-admin-name="${a.prenom} ${a.nom}" data-trait="${a.trait_length_m || 500}" data-validity="${a.validity_days || 30}" title="Paramètres">Param</button>
          <button class="btn-reset-pin" data-admin-id="${a.id}" data-admin-name="${a.prenom} ${a.nom}" data-admin-email="${a.email}" title="Réinitialiser le PIN à 000000">PIN</button>
          <button class="btn-migrate"   data-admin-id="${a.id}" data-admin-name="${a.prenom} ${a.nom}" data-admin-role="${a.role}" title="Migrer — réattribuer les pilotes à un remplaçant">Migrer</button>
          <button class="btn-delete"    data-admin-id="${a.id}" data-admin-name="${a.prenom} ${a.nom}" data-admin-email="${a.email}">🗑</button>
        </div>
      </div>`;
  }).join('');
}

// ── RENDU PILOTES ─────────────────────────────────────────────

function renderPilots(pilots) {
  const el = document.getElementById('pilots-list');
  if (!el) return;
  if (!pilots.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🧭</div>Aucun pilote enregistré.<br><small>Cliquez sur "+ Nouveau pilote" pour en créer un.</small></div>';
    return;
  }
  el.innerHTML = pilots.map(p => {
    const isBlocked = p.role === 'blocked';
    const initiales = ((p.prenom?.[0] || '') + (p.nom?.[0] || '')).toUpperCase();
    return `
      <div class="user-card ${isBlocked ? 'blocked' : ''}">
        <div class="user-avatar" style="background:${isBlocked ? '#c0392b' : '#2d6a4f'}">${initiales}</div>
        <div class="user-info" style="flex:1;min-width:0">
          <div class="user-phone" style="font-family:'DM Sans',sans-serif">${p.prenom} ${p.nom}${isBlocked ? ' <span style="color:#c0392b;font-size:11px">· Bloqué</span>' : ''}</div>
          <div class="user-meta">${p.email}</div>
          <div class="user-meta">📍 ${p.secteur || '—'} · ${p.departement || '—'}</div>
          <div class="user-meta" style="font-size:11px">Créé le ${new Date(p.created_at).toLocaleDateString('fr-FR')}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
          ${isBlocked
            ? `<button class="btn-unblock" data-pilot-id="${p.id}" data-pilot-name="${p.prenom} ${p.nom}">Débloquer</button>`
            : `<button class="btn-block"   data-pilot-id="${p.id}" data-pilot-name="${p.prenom} ${p.nom}">Bloquer</button>`
          }
          <button class="btn-view"      data-pilot-id="${p.id}" data-pilot-name="${p.prenom} ${p.nom}" title="Voir les sentinelles">Voir</button>
          <button class="btn-message"   data-pilot-id="${p.id}" data-pilot-email="${p.email}" data-pilot-prenom="${p.prenom}" data-pilot-nom="${p.nom}" title="Message de bienvenue">✉</button>
          <button class="btn-params"    data-pilot-id="${p.id}" data-pilot-name="${p.prenom} ${p.nom}" data-trait="${p.trait_length_m || 500}" data-validity="${p.validity_days || 30}" title="Paramètres du pilote">Param</button>
          <button class="btn-reset-pin" data-pilot-id="${p.id}" data-pilot-name="${p.prenom} ${p.nom}" data-pilot-email="${p.email}" title="Réinitialiser le PIN à 000000">PIN</button>
          <button class="btn-migrate"   data-pilot-id="${p.id}" data-pilot-name="${p.prenom} ${p.nom}" data-pilot-role="${p.role}" title="Migrer — réattribuer les sentinelles à un remplaçant">Migrer</button>
          <button class="btn-delete"    data-pilot-id="${p.id}" data-pilot-name="${p.prenom} ${p.nom}" data-pilot-email="${p.email}">🗑</button>
        </div>
      </div>`;
  }).join('');
}

// ── RENDU EN ATTENTE ──────────────────────────────────────────

function renderPending(profiles) {
  const el    = document.getElementById('pending-list');
  const badge = document.getElementById('pending-badge');
  if (badge) {
    badge.style.display = profiles.length > 0 ? 'inline' : 'none';
    badge.textContent   = profiles.length;
  }
  if (!el) return;
  if (!profiles.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">✅</div>Aucune demande en attente.</div>';
    return;
  }
  el.innerHTML = profiles.map(p => `
    <div class="user-card" style="flex-wrap:wrap;gap:12px">
      <div class="user-info" style="min-width:200px">
        <div class="user-phone" style="font-family:'DM Sans',sans-serif">${p.prenom} ${p.nom}</div>
        <div class="user-meta">${p.email}</div>
        <div class="user-meta">${p.canton || p.secteur || '—'} · ${p.departement || '—'}</div>
        <div class="user-meta" style="font-size:11px">${new Date(p.created_at).toLocaleString('fr-FR')}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn-unblock" data-pending-id="${p.id}" data-pending-name="${p.prenom} ${p.nom}">✅ Valider</button>
        <button class="btn-block"   data-pending-id="${p.id}" data-pending-name="${p.prenom} ${p.nom}">❌ Refuser</button>
      </div>
    </div>`).join('');
}

// ── MESSAGE APRÈS CRÉATION ────────────────────────────────────

function showCreationMessage(prenom, nom, email) {
  const msg =
`Bonjour ${prenom},

Ton accès à ChassNid est prêt.

Lien : ${CONFIG.APP_URL}
Email : ${email}
PIN provisoire : ${CONFIG.DEFAULT_PIN}

Change ton PIN à la première connexion via l'icône 👤 en haut à droite.
En cas de problème, utilise Chrome de préférence.

Bonne traque !
Bernard`;

  showMessage(`✅ ${prenom} ${nom} créé`, msg);
}
