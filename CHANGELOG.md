# Changelog — Chrono-Frelon Admin

Toutes les modifications notables sont documentées ici.
Format : [Semantic Versioning](https://semver.org/) — MAJEUR.MINEUR.PATCH

---

## [1.0.0] — 2026-04

### Ajouté
- Portail administrateur PWA installable sur smartphone
- Authentification par lien magique (email, sans mot de passe)
- Inscription nominative avec canton et département
- Système de rôles : `pending` → `admin` → `superadmin` / `blocked`
- Validation manuelle des nouveaux admins via Supabase
- Tableau de bord avec 3 onglets : Carte, Signalements, Utilisateurs
- Carte Leaflet/OpenStreetMap des signalements du canton
- Statistiques : total signalements, aujourd'hui, utilisateurs, bloqués
- Liste des signalements avec date, coordonnées, phone_id
- Suppression de signalements avec confirmation
- Liste des utilisateurs avec compteur de signalements
- Blocage/déblocage d'utilisateurs abusifs
- Signalements des utilisateurs bloqués marqués en rouge sur la carte
- Recherche/filtre dans les listes signalements et utilisateurs
- Interface bilingue FR / DE
- Service Worker pour utilisation offline partielle
- Connexion à la base Supabase existante `chrono_frelon_geo`

---

## [À venir]

### [1.1.0] — Filtres et export
- [ ] Filtre par plage de dates sur les signalements
- [ ] Export CSV des signalements du canton
- [ ] Tri des colonnes (date, distance, direction)
- [ ] Pagination pour les grands volumes de données

### [1.2.0] — Notifications
- [ ] Notification email lors d'un nouveau signalement
- [ ] Résumé hebdomadaire automatique par canton
- [ ] Alerte si un utilisateur soumet un volume anormal

### [1.3.0] — Vue superadmin
- [ ] Accès à tous les cantons (vue régionale)
- [ ] Gestion des admins communaux (valider, bloquer)
- [ ] Statistiques croisées multi-cantons
- [ ] Carte régionale agrégée

### [2.0.0] — Refonte majeure (si besoin)
- [ ] Intégration avec Chrono-Frelon (appli terrain) via API
- [ ] Synchronisation temps réel (Supabase Realtime)
- [ ] Gestion des interventions (statut nid : signalé / traité / détruit)
- [ ] Rapport PDF exportable par canton
- [ ] Application mobile native (PWA avancée)

---

## Conventions de versionnement

| Type de changement | Version |
|---|---|
| Correction de bug | PATCH `x.x.1` |
| Nouvelle fonctionnalité rétrocompatible | MINOR `x.1.0` |
| Changement incompatible / refonte | MAJOR `2.0.0` |

## Convention des commits GitHub

```
feat: ajout export CSV
fix: correction filtre date
style: amélioration topbar mobile
refactor: restructuration auth flow
docs: mise à jour README
```
