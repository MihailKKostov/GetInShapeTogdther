# WeFit — Get fit together

A web app for a group of friends getting in shape together: food log with calorie and macro goals, workout tracking with GPS, progress photos, and a friends-only feed where the only interaction is emoji reactions. There are no chats and no comments.

Built with React, TypeScript and Vite on Firebase (Auth, Firestore, Storage, Hosting). Deploys through GitHub Actions.

## Features

| Area | What's there |
| --- | --- |
| **Food log** (`/log`) | Search reference whole foods plus [Open Food Facts](https://world.openfoodfacts.org) (packaged foods, no API key needed). Barcode scan where the browser supports `BarcodeDetector`. Custom foods, recent foods, quick add, copy a meal from yesterday. Per-day energy budget (goal + exercise), macros, fiber, sodium, water, weigh-in. |
| **Completing a day** | "Mark day as complete" locks the day and checks it against your "on target" band (default: up to 15 % under / 5 % over budget). That updates your streak and can post a summary to the feed (kcal, macros, streak — never the food list). |
| **Activities** (`/move`) | Manual log (run, ride, walk, hike, swim, row, strength with sets×reps×load, HIIT, yoga, sport). In-browser GPS recording with a wake lock and crash recovery. GPX import. Pace, speed and elevation. Calorie estimate from MET values. Routes are drawn as schematic traces, not on map tiles. |
| **Progress photos** | Post up to 4 photos and mark them as progress, optionally with your weight at that time. They build a timeline on your profile with a before/after compare view. Photos are resized and stripped of metadata (including GPS) before upload. |
| **Profile** (`/me`, `/u/:id`) | Streak, days on target, workouts, distance, body stats, weight chart with target line, 30-day calorie bars, a 12-week on-target calendar, weekly active minutes, recent activities, progress photos. |
| **Privacy** | Each private field has a 👥 Friends / 🔒 Private badge on your own profile; tap it to switch. All toggles are also in Settings. |
| **Friends** | Invite by link (expires after 14 days, can be revoked). Accepting the link makes you friends both ways. Either person can remove the friendship. |
| **Feed** | Posts from you and your friends only. Filters: all / friends / me / progress. |
| **Reactions & emoji** | Any number of emojis per post, toggled on and off. Custom emojis work like Slack's: upload an image or make a text sticker. Emojis can be typed Slack-style anywhere you write text (posts, status, notes): `:fi` opens suggestions, and a full `:fire:` turns into 🔥. Custom emojis are written as `:name:` and shown as images. |
| **Profile basics** | Optional nickname (defaults to your name), Google photo / uploaded photo / initials avatar, and a status of up to 80 characters. |

### What friends can see

| Always visible to friends | Toggle (default) | Never shared |
| --- | --- | --- |
| Name, avatar, status | Current weight (private) | BMI |
| Streak, days on target | Target weight (private) | Birth year, sex |
| Workout count, distance | Start weight (private) | Email |
| Posts you mark "friends" | Weight change only, e.g. −4.2 kg (private) | Custom foods |
| | Weight history chart (private) | Posts marked "only me" |
| | Height, calorie goal (private) | |
| | Food log (private) | |
| | Activity history (shared) | |

The Firestore security rules enforce these settings on the server, not just in the UI. Data a friend isn't allowed to read is never sent to their browser. One exception: Storage download URLs act as bearer links, so anyone who has a photo's URL can open it.

## UI

The UI is clean and card-based, in the style of nutrition apps like Cronometer. It uses the Inter font, white cards on a light grey background, and one orange accent. Macros have their own colours: protein green, carbs blue, fat red. The diary has rings for consumed / exercise / remaining calories and bars for targets. Light and dark themes are supported.

Feedback stays visible but quiet. Buttons show a spinner while saving and a brief ✓ when done. Uploads show a progress bar, content loads with shimmer placeholders, and small toasts confirm actions. Motion is reduced under `prefers-reduced-motion`.

## Firebase setup (one-time)

1. Create a Firebase project and upgrade it to the **Blaze** plan (Cloud Storage requires it).
2. **Authentication → Sign-in method:** enable **Google** and **Email/Password**. If you use a custom domain, add it under *Authentication → Settings → Authorized domains*. The `*.web.app` and `*.firebaseapp.com` domains are already allowed.
3. **Firestore Database:** create the database (production mode). The rules and indexes are deployed from this repo.
4. **Storage:** create the default bucket. Its rules are deployed from this repo.
5. **Project settings → General → Your apps:** add a **Web app** and copy its config values.
6. **CI access (no key files):** GitHub Actions signs in to Google with Workload Identity Federation, so it works even when your organisation blocks service-account keys. Open [Cloud Shell](https://shell.cloud.google.com) and run the following, with your project ID filled in:

   ```bash
   PROJECT_ID=your-project-id
   REPO=MihailKKostov/GetInShapeTogdther
   gcloud config set project "$PROJECT_ID"
   PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
   SA="github-deploy@$PROJECT_ID.iam.gserviceaccount.com"

   gcloud services enable iamcredentials.googleapis.com sts.googleapis.com
   gcloud iam service-accounts create github-deploy --display-name="GitHub deploy" || true
   for ROLE in roles/firebase.admin roles/serviceusage.serviceUsageConsumer; do
     gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role="$ROLE" --condition=None >/dev/null
   done

   gcloud iam workload-identity-pools create github --location=global --display-name="GitHub"
   gcloud iam workload-identity-pools providers create-oidc github-repo \
     --location=global --workload-identity-pool=github --display-name="GitHub repo" \
     --issuer-uri="https://token.actions.githubusercontent.com" \
     --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
     --attribute-condition="assertion.repository=='$REPO'"
   gcloud iam service-accounts add-iam-policy-binding "$SA" --role=roles/iam.workloadIdentityUser \
     --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"

   echo "GCP_WORKLOAD_IDENTITY_PROVIDER = projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github-repo"
   echo "GCP_SERVICE_ACCOUNT            = $SA"
   ```

   Only workflows from this exact repository can use the service account. Then put the printed provider path, service account email and your project ID in the `env:` block at the top of `.github/workflows/deploy.yml`. They aren't secrets.

## GitHub setup

Add these **repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | from the web app config |
| `VITE_FIREBASE_AUTH_DOMAIN` | e.g. `wefit-friends.firebaseapp.com` |
| `VITE_FIREBASE_STORAGE_BUCKET` | e.g. `wefit-friends.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | from the web app config |
| `VITE_FIREBASE_APP_ID` | from the web app config |

The workflow is `.github/workflows/deploy.yml`:

- **Every push and PR:** typecheck, production build, and the security rules test suite against the Firebase emulators.
- **Push to `main`:** deploys Hosting, Firestore rules and indexes, and Storage rules.
- **PRs from this repo:** deploys a preview channel that expires after 7 days. Its URL appears in the workflow run summary. Google sign-in on preview URLs only works if you add that domain to Auth's authorized domains; email sign-in works everywhere.

Then share `https://<project-id>.web.app` with your friends. Each person signs in, completes the 2-minute setup, and sends invite links from the **Friends** tab.

## Local development

```bash
npm install

# Option A: fully local with emulators (Java 11+ required) — no Firebase project needed
npm run emulators          # terminal 1: auth, firestore, storage on 127.0.0.1
npm run dev:emu            # terminal 2: http://localhost:5173

# Option B: against your real project
cp .env.example .env.local # fill in the VITE_FIREBASE_* values
npm run dev

npm run typecheck
npm run build
npm run test:rules         # 19 security-rule tests (boots the emulators itself)
```

## Project layout

```
firestore.rules, storage.rules   server-side privacy & ownership rules
firestore.indexes.json           composite indexes for feed / activity queries
tests/rules.test.mjs             rules test suite
src/data/types.ts                data model
src/data/api.ts                  all Firestore / Storage writes
src/hooks/                       session (auth/profile/friends), live queries, async action states
src/lib/                         nutrition math (Mifflin–St Jeor, MET), units, GPS/GPX, images, food search
src/components/                  UI kit, charts, route trace, posts, reactions, emoji picker, food picker
src/pages/                       Feed, Diary, Activities, Record, Profile, Friends, Invite, Settings, Emojis, Setup, Login
```

### Data model

```
users/{uid}                     profile, sharing toggles, shared values, public stats
users/{uid}/private/settings    goals, body data, units (owner only)
users/{uid}/private/recents     recently logged foods
users/{uid}/diary/{YYYY-MM-DD}  entries[], water, exercise kcal, closed/onTarget
users/{uid}/weights/{date}      weigh-ins
users/{uid}/activities/{id}     workouts (route stored as simplified flat lat/lng array)
users/{uid}/foods/{id}          custom foods
users/{uid}/friends/{uid}       friendship (created in pairs via an invite)
invites/{code}                  invite links
posts/{id}                      feed posts (status | photo | activity | day)
posts/{id}/reactions/{uid}      one doc per reacting user: { emojis: [] }
emojis/{name}                   shared custom emoji pool
```

The feed runs one live query per friend (`authorId == X && visibility == 'friends'`) and merges the results. This is because Firestore security rules must be able to prove every query is allowed. It suits groups of up to a few dozen friends.
