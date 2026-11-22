# WeFit — Get fit together

A web app for a group of friends getting in shape together: food log with calorie and macro goals, workout tracking with GPS, progress photos, and a friends-only feed where the only interaction is emoji reactions. There are no chats and no comments.

Built with React, TypeScript and Vite on Firebase (Auth, Firestore, Storage, Hosting). Deploys through GitHub Actions.

## Features

| Area | What's there |
| --- | --- |
| **AI estimates** | *Add food → AI estimate*: take a photo, or describe what you ate in your own words ("2 eggs with butter and a flat white"), and OpenAI estimates each food, its portion and nutrition. You review and edit the items before adding them. Each person adds their own OpenAI API key in *Settings → AI food estimates*; it's stored only in that browser and sent straight to OpenAI, never to WeFit's servers. |
| **Recipe import** | Paste a recipe link in *Recipes → Import*. A Cloud Function reads the page's schema.org recipe data (name, servings, ingredients, nutrition per serving), you review it, and it's saved to *My foods* to log by the serving. Sites that block automated reading or don't list nutrition fall back to entering the values by hand. |
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

### Recipes (ported from RecipeMan)

The **Recipes** tab brings in everything from the RecipeMan Android app:

| Area | What's there |
| --- | --- |
| **Library** | Search names and ingredients, categories, favorites, 5-star ratings, sorting (name, rating, recently added, recently cooked), grid or list view, random recipe. |
| **Cooking** | Photos, scaling (½×–3× or any number of servings, with fractions like ½ and ⅔), metric/US unit conversion, tap ingredients to cross them off, tap a step to mark your place. Times in directions ("bake 25–30 minutes") become timers that keep running across screens and ring with sound, vibration and a notification. The screen stays on while cooking, and you can mark a recipe as cooked, share it as text or open the original page. |
| **From a photo** | Photograph a dish and AI writes a recipe that would make it, or photograph a written recipe (cookbook page, card, screenshot; up to 4 pages) and it's transcribed. Ingredients with amounts, steps, times and estimated nutrition per serving open in the editor to adjust before saving. Uses your own OpenAI key (Settings → AI food estimates); a dish photo becomes the recipe photo. |
| **Import** | Paste a link (or on Android use *Share → WeFit* once it's on your home screen). The `importRecipe` function reads schema.org JSON-LD, then microdata, then page heuristics, and you review before saving. You can also import a Paprika export (`.paprikarecipes`) with photos, ratings, categories, nutrition and dates; recipes you already have are skipped. |
| **Meal plan** | Week view with breakfast, lunch, dinner and snack. Send a week's ingredients to the grocery list, skipping pantry items. |
| **Menus** | Reusable groups of meals you add to the plan in one go. |
| **Groceries** | Multiple lists grouped by aisle (guessed automatically) or by recipe. Matching quantities are combined ("1 cup flour" + "2 cups flour" = "3 cups flour"). Share a list, or move bought items to the pantry. |
| **Pantry** | Quantities, purchase and expiry dates, expiring-soon warnings. Ingredients you already have start unticked when you add a recipe to the grocery list. |
| **Logging meals** | Recipes carry **nutrition per serving**: imported from the page, read from Paprika's nutrition text, typed in, or estimated with AI from the ingredients. Ways to log: *Log to diary* from a recipe, *Add food → Recipe* in the diary, a one-tap *Log* on planned meals (shown in the diary and the plan), or **Auto-log planned meals**, which logs planned recipes once their meal time passes (breakfast 10:00, lunch 14:00, snack 17:00, dinner 20:00). Auto-log catches up on the last 7 days, skips days you've completed, and can't double-log from two devices. |
| **Sharing** | *Share* posts a recipe to the friends feed. Friends can open the full recipe, react, and *Add to my recipes* straight from the post. Friends can also browse your whole recipe book on your profile and copy recipes from it (your ratings, favourites and cooking history stay yours). |

Your recipe book is visible to friends (read-only) unless you turn off **Recipe book** under Settings → Privacy or on your profile. Grocery lists, the meal plan, pantry and menus are always private.

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
| | Activity history (shared) | Grocery lists, meal plan, pantry, menus |
| | Recipe book (shared) | |

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

7. **Cloud Functions (needed for recipe import):** new Google Cloud organisations no longer create or grant default accounts automatically, so run this once in [Cloud Shell](https://shell.cloud.google.com) (bash, not Windows PowerShell):

   ```bash
   PROJECT_ID=your-project-id
   PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
   SA="github-deploy@$PROJECT_ID.iam.gserviceaccount.com"
   COMPUTE_SA="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"

   # services (Compute Engine creates the default runtime account; no cost by itself)
   gcloud services enable compute.googleapis.com cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
     run.googleapis.com eventarc.googleapis.com pubsub.googleapis.com --project "$PROJECT_ID"
   for i in $(seq 1 30); do
     gcloud iam service-accounts describe "$COMPUTE_SA" --project "$PROJECT_ID" >/dev/null 2>&1 && echo "runtime account exists" && break
     echo "waiting for the runtime account…"; sleep 10
   done

   # permissions
   for ROLE in roles/cloudfunctions.admin roles/run.admin roles/artifactregistry.admin roles/eventarc.admin roles/iam.serviceAccountUser roles/datastore.viewer roles/serviceusage.serviceUsageAdmin; do
     gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role="$ROLE" --condition=None >/dev/null && echo "deploy account: $ROLE"
   done
   for ROLE in roles/cloudbuild.builds.builder roles/eventarc.eventReceiver roles/run.invoker roles/datastore.user roles/logging.logWriter; do
     gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$COMPUTE_SA" --role="$ROLE" --condition=None >/dev/null && echo "runtime account: $ROLE"
   done
   ```

   The function is a Firestore trigger rather than a public HTTP endpoint, so it also works under organisation policies that forbid public access.

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
- **Push to `main`:** deploys Hosting, Firestore rules and indexes, and Storage rules, then Cloud Functions in a separate job, in the same region as your Firestore database.
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
