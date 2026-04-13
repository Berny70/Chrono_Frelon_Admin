const I18N = {
  fr: {
    admin_portal:       'Portail Administrateur',
    tab_login:          'Connexion',
    tab_register:       'Inscription',
    lbl_email:          'Email',
    lbl_prenom:         'Prénom',
    lbl_nom:            'Nom',
    lbl_dept:           'Département',
    lbl_canton:         'Canton',
    btn_send_link:      'Envoyer le lien magique',
    btn_request:        "Demander l'accès",
    btn_logout:         'Se déconnecter',
    pending_title:      'Compte en attente',
    pending_text:       "Votre demande d'accès a été enregistrée. Vous serez notifié par email après validation par le super-administrateur.",
    tab_map:            'Carte',
    tab_signals:        'Signalements',
    tab_users:          'Utilisateurs',
    lbl_total:          'Signalements',
    lbl_today:          "Aujourd'hui",
    lbl_users:          'Utilisateurs',
    lbl_blocked:        'Bloqués',
    btn_cancel:         'Annuler',
    btn_block:          'Bloquer',
    btn_unblock:        'Débloquer',
    btn_delete:         'Supprimer',
    badge_blocked:      'Bloqué',
    badge_active:       'Actif',
    lbl_signals:        'signalements',
    empty_signals:      'Aucun signalement dans ce canton.',
    empty_users:        'Aucun utilisateur dans ce canton.',
    msg_link_sent:      'Lien magique envoyé ! Vérifiez votre email.',
    msg_registered:     'Inscription enregistrée. En attente de validation.',
    msg_blocked:        'Utilisateur bloqué.',
    msg_unblocked:      'Utilisateur débloqué.',
    msg_deleted:        'Signalement supprimé.',
    msg_fill:           'Veuillez remplir tous les champs.',
    modal_block_title:  'Bloquer cet utilisateur',
    modal_block_text:   'Cet utilisateur ne pourra plus soumettre de signalements.',
    modal_unblock_title:'Débloquer cet utilisateur',
    modal_unblock_text: 'Cet utilisateur pourra à nouveau soumettre des signalements.',
    modal_delete_title: 'Supprimer ce signalement',
    modal_delete_text:  'Cette action est irréversible.',
    search_placeholder: 'Rechercher…',
  },
  de: {
    admin_portal:       'Administrationsportal',
    tab_login:          'Anmelden',
    tab_register:       'Registrieren',
    lbl_email:          'E-Mail',
    lbl_prenom:         'Vorname',
    lbl_nom:            'Nachname',
    lbl_dept:           'Département',
    lbl_canton:         'Kanton',
    btn_send_link:      'Magic-Link senden',
    btn_request:        'Zugang beantragen',
    btn_logout:         'Abmelden',
    pending_title:      'Konto ausstehend',
    pending_text:       'Ihre Administratoranfrage wurde registriert. Sie werden per E-Mail benachrichtigt, sobald der Super-Administrator bestätigt.',
    tab_map:            'Karte',
    tab_signals:        'Meldungen',
    tab_users:          'Benutzer',
    lbl_total:          'Meldungen',
    lbl_today:          'Heute',
    lbl_users:          'Benutzer',
    lbl_blocked:        'Gesperrt',
    btn_cancel:         'Abbrechen',
    btn_block:          'Sperren',
    btn_unblock:        'Entsperren',
    btn_delete:         'Löschen',
    badge_blocked:      'Gesperrt',
    badge_active:       'Aktiv',
    lbl_signals:        'Meldungen',
    empty_signals:      'Keine Meldungen in diesem Kanton.',
    empty_users:        'Keine Benutzer in diesem Kanton.',
    msg_link_sent:      'Magic-Link gesendet! Überprüfen Sie Ihre E-Mail.',
    msg_registered:     'Registrierung gespeichert. Warte auf Bestätigung.',
    msg_blocked:        'Benutzer gesperrt.',
    msg_unblocked:      'Benutzer entsperrt.',
    msg_deleted:        'Meldung gelöscht.',
    msg_fill:           'Bitte füllen Sie alle Felder aus.',
    modal_block_title:  'Benutzer sperren',
    modal_block_text:   'Dieser Benutzer kann keine Meldungen mehr einreichen.',
    modal_unblock_title:'Benutzer entsperren',
    modal_unblock_text: 'Dieser Benutzer kann wieder Meldungen einreichen.',
    modal_delete_title: 'Meldung löschen',
    modal_delete_text:  'Diese Aktion ist unwiderruflich.',
    search_placeholder: 'Suchen…',
  }
};

let lang = localStorage.getItem('cf-lang') || 'fr';

function t(key) {
  return I18N[lang][key] || key;
}

function setLang(l) {
  lang = l;
  localStorage.setItem('cf-lang', l);
  document.querySelectorAll('.lang-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.lang === l)
  );
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const v = I18N[lang][el.dataset.i18n];
    if (v) el.textContent = v;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const v = I18N[lang][el.dataset.i18nPlaceholder];
    if (v) el.placeholder = v;
  });
}
