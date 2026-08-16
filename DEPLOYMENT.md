# Deployment

How to host the Task Board on **GitHub Pages** with **Firebase** for
authentication and storage, and what changes about the app when you do.

Everything here is optional. `npm run dev` still runs the original local,
file-backed, single-user app and needs no Firebase project at all.

---

## 1. What changes when hosted

The app has two interchangeable persistence backends behind one interface
(`src/data/types.ts`). The build picks one with `VITE_DATA_BACKEND`.

| | `local` (default) | `firebase` (hosted) |
|---|---|---|
| Data lives in | `data/board.json` | one Firestore document per workspace |
| Served by | Express, `server/index.js` | GitHub Pages — static files only |
| Identity | mock profile in `settings.json` | Firebase Auth session |
| Users | one | many, with roles |
| Boards | one | many, as workspaces |
| Live updates | SSE on file change | Firestore `onSnapshot` |
| Write gate | Ajv + integrity, server-side | the same rules, client-side |
| Hand/AI editable file | yes | no |
| Snapshots | `data/backups/*.json` | `workspaces/{id}/backups` |

GitHub Pages cannot run the Express API, which is why the hosted build talks
directly to Firestore rather than to a server of ours.

Both backends run the *same* validation code (`shared/boardIntegrity.js`), and
`tests/validation-parity.test.js` asserts they agree rule-for-rule. A board
written by the hosted app will load locally and vice versa.

---

## 2. Firebase setup

### 2.1 Create the project

1. <https://console.firebase.google.com> → **Add project**.
2. Google Analytics is not used — skip it.
3. **Project settings → General → Your apps → Web (`</>`)**. Register an app.
4. Copy the `firebaseConfig` values shown. You need six of them.

### 2.2 Enable sign-in methods

**Authentication → Sign-in method**, enable all four:

| Provider | Extra setup |
|---|---|
| Google | none |
| Email/Password | none. Leave "Email link" off |
| GitHub | needs a GitHub OAuth app — see below |
| Anonymous | none |

Any provider you leave disabled produces a clear error in the UI
("that sign-in method is not enabled"), so you can start with Google only and
add the rest later.

**GitHub provider.** In GitHub → *Settings → Developer settings → OAuth Apps →
New OAuth App*:

- Homepage URL: `https://<user>.github.io/kanban-taskboard/`
- Authorization callback URL: copy the one Firebase shows on the GitHub provider
  panel (`https://<project>.firebaseapp.com/__/auth/handler`)

Paste the resulting Client ID and Client Secret back into Firebase.

### 2.3 Authorised domains

**Authentication → Settings → Authorised domains.** Add:

- `<user>.github.io`
- your custom domain, if you have one

`localhost` is there by default. **Sign-in fails with
`auth/unauthorized-domain` until this is done** — it is the single most common
setup mistake.

### 2.4 Create the database

**Firestore Database → Create database**. Pick a region close to you. Start in
**production mode**; the rules in this repo replace the defaults in the next
step.

### 2.5 Deploy rules and indexes

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # select your project
firebase deploy --only firestore:rules,firestore:indexes
```

`firestore.indexes.json` contains a **collection-group index on `invites`**.
Without it, checking for pending invitations fails with
`failed-precondition: The query requires an index`. The app reports this
specifically when it happens.

---

## 3. Local development against Firebase

To work on the hosted code path without deploying:

```bash
cp .env.example .env.local
# set VITE_DATA_BACKEND=firebase and paste the six VITE_FIREBASE_* values
npm run dev:web              # no need for dev:api on this backend
```

If the config values are still placeholders, the app renders a setup checklist
instead of failing on the first Firestore call.

### Emulator suite (no real project needed)

```bash
firebase emulators:start
# then in .env.local: VITE_FIREBASE_USE_EMULATORS=1
```

The emulator still needs a project id, but it can be any string. This is the
only way to test security rules without touching real data.

---

## 4. GitHub Pages

### 4.1 One-time repository setup

1. Push the repo to GitHub as **`kanban-taskboard`**.
   Using a different name? Either update the fallback in
   `.github/workflows/deploy-pages.yml`, or add a repository **variable**
   `BASE_PATH` = `/<your-repo-name>/`.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Settings → Secrets and variables → Actions → New repository secret**, six
   times:

| Secret | From `firebaseConfig` |
|---|---|
| `FIREBASE_API_KEY` | `apiKey` |
| `FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `FIREBASE_PROJECT_ID` | `projectId` |
| `FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `FIREBASE_APP_ID` | `appId` |

### 4.2 Deploy

Push to `main`. The workflow typechecks, tests, builds with
`VITE_DATA_BACKEND=firebase`, and publishes. Watch it under **Actions**.

The workflow **fails the build** if the bundle still contains
`REPLACE_WITH_FIREBASE_API_KEY`, because a deploy with missing secrets succeeds
quietly and then shows the setup screen to every visitor.

It also writes two files Pages needs:

- `.nojekyll` — Pages otherwise drops paths beginning with `_`
- `404.html`, a copy of `index.html` — makes a deep link load the app instead of
  a GitHub error page

### 4.3 Custom domain

Set the repo variable `BASE_PATH` to `/`, add a `public/CNAME` file containing
the domain, configure DNS, and add the domain to Firebase authorised domains.

---

## 5. On the API key being public

`VITE_*` values are compiled into the JavaScript bundle. Anyone can read them.

**This is how Firebase web apps work and is not a leak.** The API key identifies
the project for quota and routing; it grants nothing. Security comes from
`firestore.rules`, which is evaluated server-side on every single read and write
against the caller's verified auth token.

What *would* be a leak, and is not in this repo: a Firebase **service account
key** (`serviceAccountKey.json`, admin SDK credentials). Those bypass rules
entirely. Never commit one, and never put one in a `VITE_` variable.

Optional hardening in the Google Cloud console:

- Restrict the browser key to your domains (*APIs & Services → Credentials → HTTP
  referrers*)
- **Authentication → Settings → User actions**: disable "Create (sign-up)" if you
  only want invited users, since Email/Password sign-up is open to anyone who can
  load the page

---

## 6. The security model, stated plainly

| Boundary | Enforced by | Strength |
|---|---|---|
| Only members read or write a workspace | `firestore.rules` | Real. Server-side, per request |
| Viewers cannot write | `firestore.rules` + `canEdit` in the UI | Real |
| Only owners manage members | `firestore.rules` | Real |
| An invite grants exactly its stated role | `firestore.rules` (`claimingOwnInvite`) | Real |
| The owner cannot be removed | rules + `removeMember` | Real |
| Board revisions only move forward | rules + a client transaction | Real |
| The board is *well-formed* | client-side validation only | **Advisory** |

The last row is a deliberate trade-off worth understanding. The board is stored
as a JSON string so it round-trips byte-for-byte — which the schema depends on,
since it distinguishes an omitted key from a null one. The cost is that rules
cannot inspect its contents. So:

- someone who is **not** a member can do nothing at all
- a member you invited **could**, with hand-crafted requests, store a malformed
  board in a workspace they already have write access to

Membership is the boundary; shape is a data-quality concern inside it. If you
need shape enforced server-side too, the place to add it is a Cloud Function on
write, running the same `shared/boardIntegrity.js`.

---

## 7. Other hosts

The static bundle has no server requirement, so it also deploys to Firebase
Hosting, Netlify, Vercel, Cloudflare Pages, or S3. Build with:

```bash
VITE_DATA_BACKEND=firebase VITE_BASE=/ npm run build
```

`firebase.json` includes a `hosting` block with SPA rewrites and cache headers,
so `firebase deploy --only hosting` works out of the box.

To keep the Express backend instead — for a private VPS, say — run
`npm start`, which builds and serves `dist/` plus the API on one port. Note the
warning in `ARCHITECTURE.md`: the local API has no authentication and must not be
exposed to the internet.

---

## 8. Troubleshooting

| Symptom | Cause |
|---|---|
| Blank page, 404s on `/assets/...` | `VITE_BASE` does not match the repo name |
| `auth/unauthorized-domain` | `<user>.github.io` missing from authorised domains (§2.3) |
| `auth/operation-not-allowed` | That sign-in provider is not enabled (§2.2) |
| `auth/admin-restricted-operation` | Anonymous sign-in is not enabled |
| Setup checklist appears when deployed | Secrets not set — the workflow should have caught this |
| "A Firestore index is missing" | Deploy `firestore.indexes.json` (§2.5) |
| "You do not have permission" | Rules not deployed, or you are a viewer |
| "Another session saved first" | Working as designed — a collaborator's write won |
| Save fails on a large board | Firestore's 1 MiB document cap. Archive done stories |
| Guest board disappeared | Anonymous sessions live in browser storage only. Upgrade via the user menu |
