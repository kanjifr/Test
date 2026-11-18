# 絆 Kizuna : les cartes de la communauté

Un site d'ouverture de boosters à l'ambiance « Japon nocturne / sabres et éléments », où les cartes représentent les membres de ta communauté Discord.

- 🔐 **Connexion Discord**, avec accès limité aux membres de ton serveur si tu le souhaites
- 🎴 **Boosters** de 5 cartes toutes les 4 h, avec une animation d'ouverture et de retournement des cartes
- ✨ **5 raretés** : Commune 64 %, Rare 25 %, Épique 9 %, Légendaire 2 % par carte (la dernière carte est toujours Rare ou mieux), et **Mythique** via le système de pity
- 🌈 **Cartes brillantes** : chaque carte tirée a 1 chance sur 50 (`SHINY_CHANCE`) d'être brillante (cadre arc-en-ciel, paillettes) ; jamais recyclées, échangeables à part
- ✦ **Pity Mythique** : 1,5 % par booster, chance en hausse à partir du 46e booster sans Mythique, garantie au 60e. Jauge visible sur la page Booster. En moyenne, une Mythique arrive en 35 boosters.
- 🎬 **Vidéo d'obtention** pour les cartes Mythiques (MP4/WEBM, 40 Mo max), jouée en plein écran puis en boucle dans la carte
- 🔥 **8 éléments** : Eau, Flamme, Foudre, Vent, Pierre, Brume, Fleur, Ombre
- ♻ **Recyclage** : 10 doublons (réglable avec `RECYCLE_COST`) = 1 booster bonus à ouvrir sans attendre, on garde toujours un exemplaire de chaque carte
- 📚 **Collection** avec progression, doublons et zoom sur les cartes
- ⇄ **Échanges** entre membres : proposition, contre-proposition, acceptation ou refus. Toutes les cartes possédées sont échangeables (avec un avertissement quand on donne son dernier exemplaire), une proposition expire après 48 h et chacun peut avoir 5 propositions en attente au maximum.
- ⚔ **Duels** : équipe de 3 cartes contre la défense d'un membre (ou entraînement), combat au tour par tour animé avec ATK, DEF, éléments, critiques et esquives. Première victoire du jour = 1 booster bonus. Classement des duellistes.
- 🏅 **15 succès** (Bronze, Argent, Or) avec une notification quand on en débloque un, une progression visible sur le profil et un badge à afficher à côté de son pseudo
- 🏆 **Classement** des collectionneurs, avec la possibilité de voir la collection des autres
- 🙋 **Accord des membres** : chacun choisit dans son profil s'il accepte d'apparaître sur une carte
- 🛠️ **Panel admin** : créer ou modifier des cartes (avatar Discord ou image envoyée), les désactiver, offrir un booster
- 📥 **Import en masse** de cartes depuis un tableau CSV (Excel, Google Sheets), avec vérification ligne par ligne avant import. Modèle Excel prêt à remplir : `modeles/modele-cartes.xlsx`
- 🗳️ **Votes de la communauté** : l'admin lance un vote (des membres ou des textes), les membres votent et voient les résultats, le gagnant peut devenir une carte en un clic
- 🎂 **Anniversaires** : chaque membre peut indiquer son anniversaire (jour et mois) ; ce jour-là sa carte brille et sort 5 fois plus souvent, avec un message sur Discord
- 👤 **Profils publics** (`/membre/…`) : vitrine de 3 cartes, badge, succès, statistiques, lien à copier
- 🖼️ **Image de partage** : chaque carte se télécharge en PNG, prête à poster sur Discord
- 📖 **Livre d'or** : sur la fiche de chaque carte, les membres proposent des anecdotes, validées, modifiées ou supprimées par le staff
- 🔊 **Effets sonores** (ouverture, raretés, duels), avec un bouton pour couper le son
- 📣 **Annonces Discord** : grands tirages, victoires en duel et échanges publiés dans un salon (webhook `ANNOUNCE_DISCORD_WEBHOOK_URL`), avec un délai pour ne rien spoiler. Réglages dans Admin → Annonces Discord.
- 💾 **Sauvegardes** : téléchargement, envoi automatique quotidien dans un salon Discord privé, restauration
- 👑 **Rôles** gérés depuis le panel par le propriétaire, avec un **journal des actions**

## Rôles

| Rôle | Comment l'obtenir | Droits |
|---|---|---|
| Propriétaire | `OWNER_DISCORD_IDS` dans la configuration | Tout, y compris nommer les admins et modérateurs |
| Admin | Nommé par un propriétaire dans le panel | Tout sauf la gestion des rôles |
| Modérateur | Nommé par un propriétaire dans le panel | Créer et modifier des cartes |
| Membre | Par défaut | Jouer |

Les droits se règlent dans `src/lib/admin.ts` (`PERMISSIONS`).

## 1. Créer l'application Discord

1. Va sur <https://discord.com/developers/applications> et clique sur **New Application**.
2. Dans **OAuth2**, copie le **Client ID** et le **Client Secret**.
3. Dans **OAuth2 → Redirects**, ajoute :
   - `http://localhost:3000/api/auth/callback/discord` (pour tester sur ton PC)
   - `https://TON-DOMAINE/api/auth/callback/discord` (pour le site en ligne)
4. Pour récupérer l'ID de ton serveur et ton ID Discord : Paramètres Discord → Avancés → active le **Mode développeur**, puis fais un clic droit sur le serveur ou sur ton profil → **Copier l'identifiant**.

## 2. Configurer

Copie `.env.example` en `.env` et remplis :

| Variable | Rôle |
|---|---|
| `AUTH_SECRET` | Clé secrète (`openssl rand -base64 32`) |
| `AUTH_URL` | Adresse publique du site |
| `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET` | Identifiants de l'application Discord |
| `DISCORD_GUILD_ID` | ID de ton serveur (vide = tout le monde peut se connecter) |
| `OWNER_DISCORD_IDS` | Ton ID Discord : tu es propriétaire du site (plusieurs IDs séparés par des virgules) |
| `SITE_NAME` | Nom affiché du site |
| `PACK_SIZE` / `PACK_COOLDOWN_HOURS` | Cartes par booster / délai entre deux boosters |
| `MYTHIC_CHANCE` / `PITY_SOFT` / `PITY_HARD` | Chance de Mythique par booster / début de la hausse / booster garanti |

Les taux de drop se règlent dans `src/lib/game.ts` (`RARITIES`), et les succès dans `src/lib/achievements.ts`.

## 3. Lancer en local

Il faut Node.js 22 et PostgreSQL (ou Docker).

```bash
npm install
npx prisma migrate deploy
npm run dev
```

Ouvre <http://localhost:3000>. Avec `DEV_LOGIN=true`, tu peux te connecter sans Discord avec un pseudo de test (c'est toujours désactivé en production). Mets `dev-tonpseudo` dans `OWNER_DISCORD_IDS` pour être propriétaire en test.

Dans **Admin**, le bouton « Créer les cartes de démo » ajoute 12 cartes d'exemple. Tu pourras les supprimer quand tu auras créé celles de tes membres.

## 4. Mettre en ligne

### Option A : VPS (Hetzner, OVH…) avec Docker
```bash
git clone <ce dépôt> && cd <dossier>
cp .env.example .env   # puis remplis-le, et ajoute POSTGRES_PASSWORD=un-mot-de-passe
docker compose up -d --build
```
Le site écoute sur le port 3000. Mets un reverse proxy HTTPS devant (Caddy, Nginx ou Coolify, qui s'en charge tout seul).
Avec **Coolify**, crée une ressource « Docker Compose » qui pointe vers ce dépôt et renseigne les variables dans l'interface.

### Option B : Railway
1. **New Project → Deploy from GitHub repo**, puis choisis ce dépôt (le `Dockerfile` est détecté).
2. Ajoute une base **PostgreSQL** et mets `DATABASE_URL=${{Postgres.DATABASE_URL}}` dans les variables du service.
3. Ajoute un **Volume** monté sur `/app/uploads` (c'est là que sont stockées les images des cartes).
4. Renseigne les autres variables et génère un domaine. N'oublie pas d'ajouter l'URL de callback dans Discord.

Les migrations de la base sont appliquées automatiquement à chaque démarrage.

## Duels

- 3 manches : la carte 1 de chaque équipe s'affronte, puis la 2, puis la 3. Il faut gagner 2 manches.
- Points de vie = 100 + 20 % de la DEF. Les dégâts dépendent de l'ATK, sont réduits par la DEF et varient au hasard (±30 %), avec 15 % de critiques (×1,8) et 12 % d'esquives.
- Éléments : Eau → Flamme → Fleur → Pierre → Foudre → Eau, et Vent → Brume → Ombre → Vent (×1,3 en attaque contre l'élément suivant, ×0,8 contre le précédent).
- L'équipe de défense de l'adversaire reste secrète. Sans équipe choisie, ce sont ses 3 cartes les plus fortes.
- Réglages : `DUEL_DAILY_LIMIT`, `DUEL_SAME_OPPONENT_LIMIT`, `DUEL_DAILY_REWARD`. Moteur : `src/lib/duel.ts`.

## Sauvegardes

- **Admin → Sauvegardes → Télécharger** : fichier `.json.gz` avec membres, cartes, collections, échanges, succès et journal (sans l'historique des tirages ni les jetons Discord).
- **Automatique** : crée un webhook dans un salon Discord privé et colle son adresse dans `BACKUP_DISCORD_WEBHOOK_URL`. Une sauvegarde est envoyée chaque jour.
- **Restaurer** : remplace toutes les données par celles du fichier (réservé au propriétaire). Une copie de l'état actuel est gardée dans `uploads/backups/`.
- Les **images et vidéos** sont dans le volume : active aussi les sauvegardes de volumes dans Railway.

## Logo

Les fichiers du logo sont dans `public/logo/` (et donc en ligne sur `/logo/...`) :

| Fichier | Usage |
|---|---|
| `kizuna-embleme.svg` / `-512.png` / `-1024.png` | Emblème seul, fond transparent |
| `kizuna-logo-clair.svg` / `.png` | Logo complet pour fond sombre |
| `kizuna-logo-sombre.svg` / `.png` | Logo complet pour fond clair |
| `kizuna-icone-simple.svg` | Version simplifiée pour les petites tailles |
| `kizuna-avatar-discord.png` | Image de l'application Discord et des webhooks |

L'icône de l'onglet (`src/app/icon.svg`), l'icône mobile (`apple-icon.png`) et l'aperçu des liens partagés (`opengraph-image.png`) sont générés à partir du même dessin. Police : Shippori Mincho B1 (licence libre SIL OFL).

## Structure

```
prisma/schema.prisma      Modèle de données (membres, cartes, collections, tirages)
src/auth.ts               Connexion Discord + vérification du serveur
src/lib/game.ts           Raretés, éléments, logique de tirage
src/app/actions.ts        Ouverture de booster (anti-triche : cooldown vérifié côté serveur)
src/app/admin/            Panel admin
src/app/echanges/         Échanges (actions serveur sécurisées, transactions atomiques)
src/components/           Cartes, animation du booster, grille de collection
```

## Idées pour la suite
- Bot Discord qui annonce les tirages Légendaires
- Monnaie virtuelle et boosters thématiques
- Stockage des images sur Cloudflare R2
