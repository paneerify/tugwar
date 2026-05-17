# Firebase and Netlify Setup

This project can use Firebase Realtime Database for the `Different Devices` lobby and match sync.
It also supports anonymous Firebase Auth so you can use safer database rules on the free Spark plan.

## 1. Create a Firebase project

1. Go to https://console.firebase.google.com/
2. Click `Create a project`.
3. Choose a project name.
4. You can stay on the `Spark` free plan. No credit card is required.
5. Finish project creation.

## 2. Add a web app

This means registering your Tug of War website with Firebase. It does not mean Firebase Hosting.

1. Open your Firebase project.
2. On the project overview page, click the web icon `</>`.
3. For app nickname, enter `tugwar-web`.
4. Leave `Also set up Firebase Hosting` unchecked because this site is hosted on Netlify.
5. Click `Register app`.
6. Firebase will show the web config.
7. Copy these values:
  - `apiKey`
  - `authDomain`
  - `databaseURL`
  - `projectId`
  - `appId`

Your current values are:

```js
apiKey: "AIzaSyDZMyaitX5nE2Y3IiuDj7L4YR38Z94AVfY",
authDomain: "tugwar-565e2.firebaseapp.com",
databaseURL: "https://tugwar-565e2-default-rtdb.firebaseio.com/",
projectId: "tugwar-565e2",
appId: "1:449035288621:web:ddd1e539ff7fa6f192f8a4"
```

## 3. Enable Realtime Database

1. Open `Build` -> `Realtime Database`.
2. Click `Create Database`.
3. Pick a region close to your users.
4. Start in locked mode if available.
5. After it is created, go to the `Rules` tab.
6. Replace the rules with the rules from step 5 below.
7. Click `Publish`.

## 4. Enable Anonymous Authentication

1. Open `Build` -> `Authentication`.
2. Click `Get started`.
3. Open the `Sign-in method` tab.
4. Enable `Anonymous`.
5. Click `Save`.

## 5. Set Realtime Database rules

Use these rules for this app's current client-side sync model:

```json
{
  "rules": {
    "tugwar": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

These rules allow authenticated anonymous users to read and write the game data.

## 6. Local development setup

You have two options.

### Option A: Quick local setup

`static/js/firebaseRuntimeConfig.js` already exists. Make sure it contains:

```js
window.__TUGWAR_FIREBASE__ = {
  apiKey: "AIzaSyDZMyaitX5nE2Y3IiuDj7L4YR38Z94AVfY",
  authDomain: "tugwar-565e2.firebaseapp.com",
  databaseURL: "https://tugwar-565e2-default-rtdb.firebaseio.com/",
  projectId: "tugwar-565e2",
  appId: "1:449035288621:web:ddd1e539ff7fa6f192f8a4"
};
```

Then open the site and test `Different Devices` in two browser windows.

### Option B: Regenerate the config file

Run:

```bash
TUGWAR_FIREBASE_API_KEY="..." \
TUGWAR_FIREBASE_AUTH_DOMAIN="..." \
TUGWAR_FIREBASE_DATABASE_URL="..." \
TUGWAR_FIREBASE_PROJECT_ID="..." \
TUGWAR_FIREBASE_APP_ID="..." \
node scripts/generate-firebase-config.mjs
```

This writes `static/js/firebaseRuntimeConfig.js` for you.

## 7. Netlify setup

This repo includes `netlify.toml` with a build command that generates the runtime Firebase config file.

Set these environment variables in Netlify:

- `TUGWAR_FIREBASE_API_KEY`
- `TUGWAR_FIREBASE_AUTH_DOMAIN`
- `TUGWAR_FIREBASE_DATABASE_URL`
- `TUGWAR_FIREBASE_PROJECT_ID`
- `TUGWAR_FIREBASE_APP_ID`

In Netlify:

1. Open your site dashboard.
2. Go to `Site configuration` -> `Environment variables`.
3. Click `Add a variable`.
4. Add all five variables one by one.
5. Use these values:

```text
TUGWAR_FIREBASE_API_KEY=AIzaSyDZMyaitX5nE2Y3IiuDj7L4YR38Z94AVfY
TUGWAR_FIREBASE_AUTH_DOMAIN=tugwar-565e2.firebaseapp.com
TUGWAR_FIREBASE_DATABASE_URL=https://tugwar-565e2-default-rtdb.firebaseio.com/
TUGWAR_FIREBASE_PROJECT_ID=tugwar-565e2
TUGWAR_FIREBASE_APP_ID=1:449035288621:web:ddd1e539ff7fa6f192f8a4
```

6. Trigger a redeploy.
7. After deploy finishes, open the live site.
8. Test `Different Devices` from two different browsers or devices.

During deploy, Netlify runs:

```bash
node scripts/generate-firebase-config.mjs
```

That command writes `static/js/firebaseRuntimeConfig.js` with your Firebase values before the site is published.

## 8. Important notes

- Firebase web config values are safe to ship to the browser. They are not secret keys.
- Security must come from Firebase Auth and Realtime Database rules.
- The current implementation syncs lobby state and shared match state through Firebase.
- If you want stronger anti-cheat or authoritative gameplay, move game-state mutation into a server function later.

## 9. Quick test checklist

1. Open the app in browser A.
2. Open the app in browser B.
3. In both, click `Different Devices`.
4. In browser A, create team `Alpha`.
5. In browser B, create team `Beta`.
6. In either browser, select the other waiting team.
7. Continue to team setup in both browsers.
8. Enter player names and start the match.
9. Confirm only the active team can answer.
10. Confirm score and question changes appear on both browsers.
