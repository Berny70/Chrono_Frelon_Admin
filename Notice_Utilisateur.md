Voici la notice utilisateur complète :

Chrono-Frelon Admin — Notice utilisateur
Portail de gestion du réseau Piste-Frelon

À qui s'adresse cette notice ?
Cette notice s'adresse aux administrateurs départementaux et aux pilotes locaux du réseau Piste-Frelon. Elle explique comment utiliser l'application Chrono-Frelon Admin pour distribuer Chrono-Frelon à vos observateurs, gérer votre secteur et exploiter les données de la carte.

1. Installation de l'application
Chrono-Frelon Admin est une application web progressive (PWA), installable sur smartphone sans passer par l'App Store ou Google Play.
Sur Android (Chrome) :

Ouvrir Chrome et aller sur https://berny70.github.io/Chrono_Frelon_Admin/
Appuyer sur le menu ⋮ (trois points en haut à droite)
Sélectionner "Ajouter à l'écran d'accueil"
Confirmer l'installation

Sur iPhone (Safari) :

Ouvrir Safari et aller sur https://berny70.github.io/Chrono_Frelon_Admin/
Appuyer sur le bouton de partage ⬆
Sélectionner "Sur l'écran d'accueil"
Confirmer l'installation

L'application apparaît alors sur votre écran d'accueil comme une application normale. Les mises à jour sont automatiques à chaque lancement.

2. Inscription
Au premier accès, vous devez créer votre compte.

Sur l'écran de connexion, appuyer sur l'onglet "Inscription"
Renseigner :

Prénom et Nom
Email (celui que vous utilisez habituellement)
Département (ex. : Haute-Saône (70))
Canton / Secteur (ex. : Lure)
Code PIN à 6 chiffres — à saisir deux fois pour confirmation


Appuyer sur "Demander l'accès"

Votre demande est transmise à l'administrateur central. Vous recevrez un email de confirmation lorsque votre accès sera validé. En attendant, l'application affiche un écran "Compte en attente".

Note : Si vous êtes créé directement par un administrateur départemental (cas d'un pilote), vous recevrez un email avec un PIN provisoire 000000. Changez-le immédiatement à votre première connexion via le panneau "Mon profil".


3. Connexion

Saisir votre email
Entrer votre code PIN à 6 chiffres sur le clavier numérique
Appuyer sur "Se connecter"

Code PIN oublié ?
Appuyer sur "Code oublié ?" — un email de réinitialisation vous sera envoyé. Suivez le lien reçu pour définir un nouveau PIN.
Changer son PIN :
Une fois connecté, appuyer sur l'icône profil 👤 en haut à droite → saisir et confirmer le nouveau PIN → "Enregistrer".

4. Le tableau de bord
Après connexion, vous accédez au tableau de bord. La barre du haut affiche votre secteur, votre département et la version de l'application.
Onglets disponibles selon votre rôle
OngletPiloteAdmin départementalCarte✅✅Signalements✅✅Utilisateurs✅✅Mes pilotes❌✅En attente❌✅

5. Votre QR Code de distribution
Le QR Code est votre outil clé pour distribuer Chrono-Frelon à vos observateurs. Chaque utilisateur qui scanne votre QR Code sera automatiquement rattaché à votre secteur.
Afficher votre QR Code :

Appuyer sur l'icône QR Code ▦ dans la barre du haut
Le QR Code s'affiche — il est unique et lié à votre identifiant

Comment l'utiliser :

Lors d'une réunion de présentation, projetez ou imprimez ce QR Code
Chaque participant le scanne avec son smartphone
Chrono-Frelon s'installe et l'observateur est immédiatement rattaché à votre secteur
Aucune inscription n'est demandée à l'utilisateur


Conseil : Imprimez votre QR Code en grand format (A5 minimum) pour les réunions en salle, ou préparez une capture d'écran à partager par WhatsApp pour les contacts à distance.


6. Lire la carte
La carte est l'outil central de Piste-Frelon. Elle affiche les observations de votre secteur sous forme de traits directionnels.
Les traits directionnels
Chaque trait représente une observation :

Le point vert = position de l'observateur au moment du relevé
La ligne verte = direction de vol du frelon vers son nid
Plus le trait est long, plus la direction est fiable

La zone de convergence
Lorsque plusieurs traits convergent vers une même zone, l'application calcule automatiquement un cercle orange indiquant la zone probable du nid :

Le centre du cercle = point de convergence optimal
Le rayon indiqué = marge d'incertitude en mètres
Plus le rayon est petit, plus la localisation est précise


Sur le terrain : Concentrez vos recherches à l'intérieur du cercle orange, en commençant par le centre. Inspectez les arbres de plus de 5 mètres, les haies denses et les bâtiments agricoles.

Filtrer par rayon
Le sélecteur "Rayon" dans la barre de statistiques permet d'ajuster la zone affichée (10 à 200 km) autour de votre position.
Interagir avec la carte

Clic sur un trait → ouvre la fiche du signalement (date, direction, distance estimée, phone_id)
Bouton 🗑 dans la fiche → supprime le signalement après confirmation


7. Gérer ses utilisateurs
L'onglet "Utilisateurs" liste tous les observateurs rattachés à votre secteur via votre QR Code.
Pour chaque utilisateur vous voyez :

Son identifiant anonyme (UUID)
Le nombre de signalements envoyés
La date du dernier signalement
Son statut : Actif ou Bloqué

Bloquer un utilisateur :
Un utilisateur dont les observations sont manifestement erronées (mauvaises directions, coordonnées aberrantes) peut être bloqué. Ses signalements apparaissent alors en rouge sur la carte et n'entrent plus dans le calcul de convergence.
→ Appuyer sur "Bloquer" puis confirmer
Débloquer un utilisateur :
→ Appuyer sur "Débloquer" puis confirmer
Supprimer les signalements d'une zone :
Une fois un nid détruit, il est important de nettoyer la carte pour ne pas induire de nouvelles recherches inutiles. Dans l'onglet Signalements, filtrez par phone_id et supprimez les observations concernées.

8. Gérer ses pilotes (admin départemental uniquement)
L'onglet "Mes pilotes" vous permet de constituer et administrer votre réseau de pilotes locaux.
Créer un pilote

Appuyer sur "+ Nouveau pilote"
Renseigner prénom, nom, email et secteur (commune ou zone)
Appuyer sur "Créer"

Le pilote reçoit un email de confirmation avec un PIN provisoire 000000. Transmettez-lui ce message et demandez-lui de changer son PIN à la première connexion.
Gérer un pilote existant
Chaque pilote apparaît dans la liste avec ses informations et deux actions :

Bloquer — suspend l'accès du pilote sans supprimer ses données
🗑 Supprimer — supprime définitivement le pilote et tous ses utilisateurs rattachés


Attention : La suppression d'un pilote est irréversible. Les utilisateurs rattachés à ce pilote perdent leur rattachement.

Valider les demandes en attente
L'onglet "En attente" affiche les personnes ayant demandé un accès via le formulaire d'inscription. Pour chaque demande :

✅ Valider — accorde l'accès (rôle pilot ou admin_dept selon votre choix à définir dans Supabase)
❌ Refuser — supprime la demande


9. Bonnes pratiques
Avant une traque :

Vérifier que la carte est à jour (supprimer les anciens signalements si un nid a déjà été détruit dans la zone)
Partager votre QR Code aux nouveaux observateurs

Pendant une traque :

Surveiller la carte en temps réel depuis votre smartphone
Dès que le cercle de convergence apparaît, orienter les recherches vers cette zone

Après la destruction d'un nid :

Supprimer les signalements convergents sur la zone neutralisée
Informer vos observateurs que le nid est détruit

Confidentialité :

Les utilisateurs Chrono-Frelon sont totalement anonymes — vous ne voyez que leur UUID, jamais leur nom ni leur numéro de téléphone
Ne partagez pas votre QR Code sur des supports publics (internet, réseaux sociaux) — il est destiné à une distribution en réunion ou par contact direct


10. En cas de problème
ProblèmeSolutionImpossible de me connecterVérifier l'email · utiliser "Code oublié ?"Mon compte est en attente depuis plusieurs joursContacter votre référent départementalLa carte ne s'affiche pasVérifier la connexion internet · recharger l'applicationLes traits ne s'affichent pasAucun signalement dans le rayon sélectionné · augmenter le rayonLe QR Code ne s'affiche pasVérifier que votre rôle est bien pilot ou admin_deptL'application ne se met pas à jourFermer complètement l'application et la relancer

Chrono-Frelon Admin — v2.0.0 — Mai 2026
Réseau Piste-Frelon — lutte collaborative contre Vespa velutina
