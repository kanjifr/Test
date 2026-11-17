# 絆 Kizuna : les cartes de la communauté

Un site d'ouverture de boosters à l'ambiance « Japon nocturne / sabres et éléments », où les cartes représentent les membres de ta communauté Discord.

- 🔐 **Connexion Discord**, avec accès limité aux membres de ton serveur si tu le souhaites
- 🎴 **Boosters** de 5 cartes toutes les 4 h, avec une animation d'ouverture et de retournement des cartes
- ✨ **4 raretés** : Commune 64 %, Rare 25 %, Épique 9 %, Légendaire 2 % (la dernière carte est toujours Rare ou mieux)
- 🔥 **8 éléments** : Eau, Flamme, Foudre, Vent, Pierre, Brume, Fleur, Ombre
- 📚 **Collection** avec progression, doublons et zoom sur les cartes
- ⇄ **Échanges** entre membres : proposition, contre-proposition, acceptation ou refus. Seuls les doublons sont échangeables, une proposition expire après 48 h et chacun peut avoir 5 propositions en attente au maximum.
- 🏅 **15 succès** (Bronze, Argent, Or) avec une notification quand on en débloque un, une progression visible sur le profil et un badge à afficher à côté de son pseudo
- 🏆 **Classement** des collectionneurs, avec la possibilité de voir la collection des autres
- 🙋 **Accord des membres** : chacun choisit dans son profil s'il accepte d'apparaître sur une carte
- 🛠️ **Panel admin** : créer ou modifier des cartes (avatar Discord ou image envoyée), les désactiver, offrir un booster
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
| `NEXT_PUBLIC_SITE_NAME` | Nom affiché du site |
| `PACK_SIZE` / `PACK_COOLDOWN_HOURS` | Cartes par booster / délai entre deux boosters |

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
