# 🍽️ Dinnertime

A mobile-first web app that helps a group decide where to eat.

1. Someone taps **Start a group session**. An **Invite** sheet appears with a QR code friends can scan, a **Send in Messages** button, and a copy-link option.
2. Everyone opens the link on their phone, enters their name, and taps the cuisines they're in the mood for.
3. The app counts the overlap live and recommends the **top 5 restaurants** from your list, ranked by how many people each one satisfies.

Eating alone? Tap **Just me** to skip the session and go straight from picks to matches. Restaurants that match more of your picks rank higher. Solo mode doesn't use Firebase, so it still works if the backend is unreachable.

Plain HTML, CSS, and JavaScript. No build step, no npm. The frontend runs on **GitHub Pages** and shared session data lives in **Firebase Realtime Database** (free Spark plan).

---

## Project layout

```
index.html              All screens (home, picks, results, invite sheet)
js/vendor/qrcode.min.js QR code generator (qrcode-generator 1.4.4, MIT)
css/styles.css          Styles. Change colors at the top in :root
js/config.js            ← Paste your Firebase config here
js/app.js               UI logic (screens, buttons, rendering)
js/backend.js           All Firebase code (create/join session, save picks, live updates)
js/scoring.js           Ranking logic (pure functions, easy to tweak)
data/restaurants.json   ← Your restaurant list. Edit freely
database.rules.json     Security rules to paste into Firebase
```

---

## Editing the restaurant list

Open `data/restaurants.json`. It has a list of **areas** at the top, then the restaurants:

```json
{
  "areas": ["Disney Springs", "Winter Garden", "Windermere"],

  "restaurants": [
    {
      "name": "The Whisky",
      "cuisines": ["Burgers", "American", "Bar Food"],
      "location": "Windermere",
      "link": "https://example.com/menu"
    }
  ]
}
```

| Field      | Required | Notes |
|------------|----------|-------|
| `areas`    | yes | The "Where are you willing to go?" buttons. Add or remove areas here. |
| `name`     | yes | Shown on the result card. |
| `cuisines` | yes | One or more. **The cuisine buttons are built from this field**, so adding a restaurant with a new cuisine adds that button automatically. Capitals and a plural "s" don't matter: `Burger`, `burgers` and `Burgers` are the same button. |
| `location` | no  | One of the areas, spelled the same way. Shown on the card with a 📍. Leave it `""` and the restaurant shows up whatever area people pick. For a chain in several areas, use a list: `["Orlando", "I-Drive"]`. |
| `link`     | no  | Website or menu. Leave it out to hide the button. |

Watch for JSON gotchas: put commas *between* restaurants, use no trailing comma after the last one, and use double quotes only. If the app gets stuck on "Couldn't load the app", paste your file into [jsonlint.com](https://jsonlint.com) to find the typo.

**Emoji:** Each cuisine button gets an emoji from the `CUISINE_EMOJI` map at the top of `js/app.js`. Cuisines that aren't in the map show 🍽️. To add one, use the lowercase, dash-separated name as the key, e.g. `"middle-eastern": "🧆"`.

---

## How the ranking works

`js/scoring.js`:

- A person is **satisfied** by a restaurant if it serves *at least one* cuisine they picked **and** is in an area they're willing to go to. Picking no areas means anywhere is fine.
- Restaurants are sorted by number of people satisfied. Ties are broken by total votes for that restaurant's cuisines, then alphabetically.
- The results screen also shows the **top cuisines** with a vote count for each.
- To change how many matches are shown, edit `MAX_RESULTS` in `js/config.js`.

Results update live as more people submit. Anyone can change their picks later with **← My picks**.

---

## Set up Firebase (about 10 minutes, free)

You only do this once.

### 1. Create a project
1. Go to <https://console.firebase.google.com> and sign in with a Google account.
2. Click **Create a project** (or **Add project**), name it e.g. `dinnertime`, and click through. You can turn Google Analytics off.

### 2. Turn on anonymous sign-in
Each phone gets an invisible anonymous ID, so people can only edit their own picks. Nobody has to make an account.
1. In the left sidebar: **Build → Authentication → Get started**.
2. Open the **Sign-in method** tab → **Anonymous** → switch **Enable** on → **Save**.

### 3. Create the Realtime Database
1. Sidebar: **Build → Realtime Database → Create Database**.
2. Pick a location near you → **Next**.
3. Choose **Start in locked mode** → **Enable**. (You'll replace the rules in a moment.)

> Use **Realtime Database**, not *Firestore*. They're different products.

### 4. Paste in the security rules
1. Still in Realtime Database, open the **Rules** tab.
2. Delete everything there, paste in the full contents of `database.rules.json` from this repo, and click **Publish**.

These rules let signed-in visitors create a session, read a session if they know its code (nobody can list every session), and write only their own entry with a name of up to 30 characters and a set of cuisines.

### 5. Register the web app and copy the config
1. Click the ⚙️ gear next to **Project Overview → Project settings**.
2. Under **Your apps**, click the **`</>`** (Web) icon. Give it a nickname, leave "Firebase Hosting" **unchecked**, and click **Register app**.
3. You'll see a `firebaseConfig = { ... }` block. Copy those values into `js/config.js`, replacing the `YOUR_...` placeholders. **Make sure `databaseURL` is included.** If it's missing, copy it from the top of the Realtime Database page (it looks like `https://dinnertime-xxxx-default-rtdb.firebaseio.com`).

These config values are safe to commit to a public repo. They only identify your project, and the security rules do the protecting.

### 6. Authorize your GitHub Pages domain
Anonymous sign-in only works on approved domains.
1. **Authentication → Settings → Authorized domains → Add domain**.
2. Add `YOUR-GITHUB-USERNAME.github.io`. (`localhost` is already there for local testing.)

---

## Run it locally

The app uses ES modules and `fetch`, so it has to be served over HTTP. Double-clicking `index.html` won't work.

```bash
cd dinnertime
python3 -m http.server 8000
```

Open <http://localhost:8000>. To test with several "people", open the session link in a normal window and a private/incognito window. Each one counts as a different person.

To test on your phone over Wi-Fi, open `http://YOUR-COMPUTER-IP:8000` (on a Mac, find the IP with `ipconfig getifaddr en0`). Note that **Copy link** and **More sharing options** in the Invite sheet need `https`, so they may not work over plain Wi-Fi HTTP. They work properly once deployed.

---

## Deploy to GitHub Pages

1. Create a new repository on <https://github.com/new>, e.g. `dinnertime`. It can be public or private, but free accounts need it public for Pages.
2. Push this folder:
   ```bash
   cd dinnertime
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/dinnertime.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages**. Under **Build and deployment**, set **Source: Deploy from a branch**, **Branch: `main`**, folder **`/ (root)`**, and click **Save**.
4. After a minute or so, your app is live at `https://YOUR-USERNAME.github.io/dinnertime/`.
5. Make sure you did step 6 of the Firebase setup (authorized domain).

**To update** (for example after editing restaurants): commit and push again. Pages redeploys within a minute or two. If a phone still shows old data, pull to refresh.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Firebase isn't set up yet" | `js/config.js` still has `YOUR_...` placeholders. |
| Stuck on "Couldn't load the app" | Open the browser console. `auth/operation-not-allowed` means anonymous sign-in isn't enabled (step 2). `auth/unauthorized-domain` means the domain isn't authorized (step 6). A JSON error means there's a typo in `restaurants.json`. |
| "Couldn't create a session" / `PERMISSION_DENIED` | Rules weren't published (step 4), or `databaseURL` is missing or wrong in `config.js`. |
| Works locally, not on GitHub Pages | Add `YOUR-USERNAME.github.io` to authorized domains. |

## Housekeeping

Sessions stay in the database until you delete them. The free tier allows 1 GB of storage and each session is tiny, so this will take a very long time to matter. To clear them out, open **Realtime Database → Data**, hover over `sessions`, and click the 🗑️.
