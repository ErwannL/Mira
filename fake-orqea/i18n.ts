/**
 * The fake Orqea's UI strings. Every string a catalogue step targets is copied from the real
 * Orqea's `frontend/src/locales/{en,fr}.json` (key noted where it helps); the catalogue and this
 * file must agree, and both follow Orqea.
 */
const en = {
  brand: 'Orqea',
  tagline: 'One board. Your whole dev chain behind it.',
  pitch:
    'Orqea is a plain kanban wired to your tools: Jira, Trello, GitHub, your own AI model. The card becomes code, the CI judges it, the pull request waits for you.',
  tryBeta: 'Try the beta', // orqea.hero.tryBeta
  signInLink: 'Sign in', // orqea.cta.login
  signupTitle: 'Sign up', // auth.signup.title
  signupSubmit: 'Sign up', // auth.signup.submit
  username: 'Username', // auth.signup.username_label
  email: 'Email', // auth.common.email_label
  password: 'Password', // auth.common.password_label
  terms: 'I accept the terms of use and the privacy policy', // auth.signup.accept_terms
  notRobot: 'I am not a robot',
  // auth.signup.undelivered: what Orqea shows a synthetic account (no mail leaves for .invalid).
  accountCreated:
    'Account created, but the verification email could not be sent (server configuration). You must verify your address before you can sign in: use “Resend” on the sign-in page or contact support.',
  emailVerified: 'Email verified — you can now log in', // verify_email.success
  verifyFailed: 'Verification failed', // verify_email.failed
  loginTitle: 'Sign in', // auth.login.title
  loginSubmit: 'Sign in', // auth.login.submit
  cookies: 'Cookies',
  cookiesText: 'We use cookies to keep you signed in and to measure audience.',
  acceptAll: 'Accept all',
  rejectAll: 'Reject all',
  search: 'Search', // search.open
  searchPlaceholder: 'Search a card across all your boards', // search.placeholder
  nav: 'Main navigation', // sidebar.nav_label
  home: 'Home',
  calendar: 'Calendar',
  qr: 'QR codes',
  billing: 'Billing & plans', // settings.nav_billing
  settings: 'Settings',
  profile: 'My Profile',
  notes: 'Notes and reminders', // notes.fab
  newNote: 'New note', // notes.new_label
  save: 'Save',
  emptyTitle: 'Create your first board', // home.empty_title
  boardName: 'Board name', // home.empty_name_label
  createBoard: 'Create board', // home.empty_submit
  gettingStarted: 'Getting started', // checklist.title
  hideGettingStarted: 'Hide getting started', // checklist.dismiss
  gettingStartedBody: 'A board brings together your lists, your tasks and your agents.', // checklist.board_body
  gettingStartedLong:
    'Before you start, please read carefully how workspaces, boards, lists, cards, labels, members, guests, permissions, automations, notifications, integrations, exports, retention policies and billing interact together, because every one of these concepts has consequences on what your collaborators can see, edit, share and delete, and on what you will be charged at the end of each billing period depending on seats, storage and advanced features that you may or may not activate later on.',
  addCard: '+ Add a card', // board_column.add_card
  newCard: 'New card', // board_modals.new_card
  titlePlaceholder: 'Title', // board_modals.title_placeholder
  add: 'Add', // board_modals.add
  addList: '+ Add a list', // board_column.add_list
  listName: 'List name', // board_modals.list_name_placeholder
  addNewList: 'Add the new list', // board_modals.add_new_list_aria
  select: 'Select', // bulk.select_mode
  selectedOne: '{count} card selected', // bulk.selected_one
  selectedOther: '{count} cards selected', // bulk.selected_other
  rules: 'Rules', // board_toolbar.rules
  newRule: 'New rule', // rules.add
  ruleName: 'Rule name', // rules.name_label
  collaborators: 'Collaborators', // board_toolbar.collaborators
  inviteAria: 'Invite a collaborator', // members_modal.invite_aria
  invite: 'Invite', // members_modal.invite
  forms: 'Forms', // board_toolbar.forms
  createForm: '+ Create New Form', // forms_modal.create_new_form
  copyLink: 'Copy public link', // forms_modal.copy_public_link
  description: 'Description', // edit_task.description
  priority: 'Priority', // edit_task.priority
  saveTask: 'Save', // edit_task.save_task
  addItem: 'Add item', // edit_task.add_item
  addCheck: 'Add check', // edit_task.add_check
  activity: 'Activity', // edit_task.tab_activity
  addComment: 'Add a comment', // edit_task.add_comment
  calendarTitle: '📅 My calendar', // personal_calendar.title
  statsTitle: 'My statistics', // stats.title
  statsLocked: 'Unlock advanced analytics', // billing.lock.analytics_title
  codeName: 'Code name', // qr.label_label
  destination: 'Destination', // qr.target_label
  createCode: 'Create the code', // qr.create
  choose: 'Choose', // billing.page.choose ("Choose {{plan}}")
  perMonth: 'mo',
  contactUs: 'Contact us',
  theme: 'Theme',
  dark: 'Dark',
  light: 'Light',
  darkAria: 'Select the dark theme', // settings.theme_dark_aria
  lightAria: 'Select the light theme',
  themeSaved: 'Theme saved!', // settings.save_success
  exportTitle: 'Export my data',
  exportButton: 'Download my data (JSON)', // settings.privacy_export_button
  exportDone: 'Export downloaded.', // settings.privacy_export_done
  deleteTitle: 'Delete my account',
  deleteButton: 'Permanently delete my account', // settings.privacy_delete_button
  deleteConfirmLabel:
    'To confirm, enter your password (or your email address if your account has no password):',
  confirmDeletion: 'Confirm deletion', // settings.privacy_delete_confirm_button
  edit: 'Edit', // profile.edit
  preferredLanguage: 'Preferred language', // profile.language_label
  sendRequest: 'Send my request', // public_form.page.submit_default
  thanks: 'Thank you', // public_form.page.thanks
  paywallTitle: 'Premium feature', // billing.lock.title
  paywallText: 'Your current plan does not include this feature.', // billing.feature_locked
  seePlans: 'View plans & upgrade', // billing.lock.cta
  close: 'Close',
  notFound: 'Page not found',
  done_invite:
    'Invitation created, but the email could not be sent: it was set aside on the server. Share the invitation link yourself.', // members_modal.delivery_queued
  done_settings: 'Theme saved!',
  done_export: 'Export downloaded.',
  done_answer: 'Thank you',
  done_moved: 'Card moved',
  err_terms: 'Please accept the terms of use and the privacy policy', // auth.signup.terms_required
  err_required: 'Please fill in every required field.',
  err_captcha: 'Please type the code shown in the image.', // auth.common.captcha_required
  err_generic: 'Error.',
  extra_firstName: 'First name',
  extra_lastName: 'Last name',
  extra_phone: 'Phone number',
  extra_company: 'Company',
  extra_jobTitle: 'Job title',
  extra_country: 'Country',
};

export type Key = keyof typeof en;

const fr: Record<Key, string> = {
  brand: 'Orqea',
  tagline: 'Un board. Toute votre chaîne de dev derrière.',
  pitch:
    'Orqea est un kanban classique branché à vos outils : Jira, Trello, GitHub, votre modèle d’IA. La carte devient du code, la CI le juge, la pull request vous attend.',
  tryBeta: 'Essayer la bêta',
  signInLink: 'Connexion',
  signupTitle: 'Inscription',
  signupSubmit: "S'inscrire",
  username: 'Pseudo',
  email: 'Email',
  password: 'Mot de passe',
  terms: "J'accepte les conditions d'utilisation et la politique de confidentialité",
  notRobot: 'Je ne suis pas un robot',
  accountCreated:
    "Compte créé, mais l'email de vérification n'a pas pu être envoyé (configuration serveur). Tu dois vérifier ton adresse avant de pouvoir te connecter : utilise « Renvoyer » sur la page de connexion ou contacte le support.",
  emailVerified: 'Email vérifié — tu peux maintenant te connecter',
  verifyFailed: 'Échec de la vérification',
  loginTitle: 'Connexion',
  loginSubmit: 'Se connecter',
  cookies: 'Cookies',
  cookiesText: 'Nous utilisons des cookies pour garder votre session et mesurer l’audience.',
  acceptAll: 'Tout accepter',
  rejectAll: 'Tout refuser',
  search: 'Rechercher',
  searchPlaceholder: 'Rechercher une carte dans tous vos boards',
  nav: 'Navigation principale',
  home: 'Accueil',
  calendar: 'Calendrier',
  qr: 'Codes QR',
  billing: 'Facturation et offres',
  settings: 'Réglages',
  profile: 'Mon Profil',
  notes: 'Notes et rappels',
  newNote: 'Nouvelle note',
  save: 'Enregistrer',
  emptyTitle: 'Créez votre premier board',
  boardName: 'Nom du board',
  createBoard: 'Créer le board',
  gettingStarted: 'Démarrage',
  hideGettingStarted: 'Masquer le démarrage',
  gettingStartedBody: 'Un board réunit vos listes, vos tâches et vos agents.',
  gettingStartedLong:
    'Avant de commencer, lisez attentivement comment les espaces, tableaux, listes, cartes, étiquettes, membres, invités, permissions, automatisations, notifications, intégrations, exports, politiques de conservation et la facturation interagissent, car chacun de ces concepts a des conséquences sur ce que vos collaborateurs peuvent voir, modifier, partager et supprimer, et sur ce qui vous sera facturé à la fin de chaque période selon les membres, le stockage et les fonctions avancées que vous activerez peut-être plus tard.',
  addCard: '+ Ajouter une carte',
  newCard: 'Nouvelle carte',
  titlePlaceholder: 'Titre',
  add: 'Ajouter',
  addList: '+ Ajouter une liste',
  listName: 'Nom de la liste',
  addNewList: 'Ajouter la nouvelle liste',
  select: 'Sélectionner',
  selectedOne: '{count} carte sélectionnée',
  selectedOther: '{count} cartes sélectionnées',
  rules: 'Règles',
  newRule: 'Nouvelle règle',
  ruleName: 'Nom de la règle',
  collaborators: 'Collaborateurs',
  inviteAria: 'Inviter un collaborateur',
  invite: 'Inviter',
  forms: 'Formulaires',
  createForm: '+ Créer un nouveau formulaire',
  copyLink: 'Copier le lien public',
  description: 'Description',
  priority: 'Priorité',
  saveTask: 'Sauvegarder',
  addItem: 'Ajouter un élément',
  addCheck: 'Ajouter un check',
  activity: 'Activité',
  addComment: 'Ajouter un commentaire',
  calendarTitle: '📅 Mon calendrier',
  statsTitle: 'Mes statistiques',
  statsLocked: 'Débloquez les analyses avancées',
  codeName: 'Nom du code',
  destination: 'Destination',
  createCode: 'Créer le code',
  choose: 'Choisir',
  perMonth: 'mois',
  contactUs: 'Nous contacter',
  theme: 'Thème',
  dark: 'Sombre',
  light: 'Clair',
  darkAria: 'Bouton sélectionner le thème sombre',
  lightAria: 'Bouton sélectionner le thème clair',
  themeSaved: 'Thème enregistré !',
  exportTitle: 'Exporter mes données',
  exportButton: 'Télécharger mes données (JSON)',
  exportDone: 'Export téléchargé.',
  deleteTitle: 'Supprimer mon compte',
  deleteButton: 'Supprimer définitivement mon compte',
  deleteConfirmLabel:
    'Pour confirmer, saisissez votre mot de passe (ou votre adresse email si votre compte n’a pas de mot de passe) :',
  confirmDeletion: 'Confirmer la suppression',
  edit: 'Modifier',
  preferredLanguage: 'Langue préférée',
  sendRequest: 'Envoyer ma demande',
  thanks: 'Merci',
  paywallTitle: 'Fonctionnalité premium',
  paywallText: "Votre offre actuelle n'inclut pas cette fonctionnalité.",
  seePlans: 'Voir les offres et passer à niveau',
  close: 'Fermer',
  notFound: 'Page introuvable',
  done_invite:
    "Invitation créée, mais le courriel n'a pas pu partir : il a été mis de côté sur le serveur. Transmettez le lien d'invitation vous-même.",
  done_settings: 'Thème enregistré !',
  done_export: 'Export téléchargé.',
  done_answer: 'Merci',
  done_moved: 'Carte déplacée',
  err_terms: 'Merci d’accepter les conditions d’utilisation et la politique de confidentialité',
  err_required: 'Merci de remplir tous les champs obligatoires.',
  err_captcha: "Merci de recopier le code de l'image.",
  err_generic: 'Erreur.',
  extra_firstName: 'Prénom',
  extra_lastName: 'Nom',
  extra_phone: 'Numéro de téléphone',
  extra_company: 'Entreprise',
  extra_jobTitle: 'Fonction',
  extra_country: 'Pays',
};

export type Lang = 'en' | 'fr';
export const EXTRA_FIELDS: Key[] = [
  'extra_firstName',
  'extra_lastName',
  'extra_phone',
  'extra_company',
  'extra_jobTitle',
  'extra_country',
];

/** Translator; `untranslated` simulates a French page left in English. */
export function translator(lang: Lang, untranslated: boolean): (k: Key) => string {
  const dict = lang === 'fr' && !untranslated ? fr : en;
  return (k) => dict[k];
}

export function pickLang(acceptLanguage: string | undefined, userLang: string | undefined): Lang {
  const wanted = userLang ?? (acceptLanguage ?? '').slice(0, 2).toLowerCase();
  return wanted === 'fr' ? 'fr' : 'en';
}
