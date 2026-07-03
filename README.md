# Cedars Attendance — Apps Script + React

A small attendance app: React frontend, Google Apps Script backend, data lives in
your "Cedars Attendance" Google Sheet. Sign-in is restricted to **@cedarsprohub.com**
accounts, enforced on the server (not just in the browser), so it can't be bypassed
by editing the frontend code.

This isn't something I can deploy for you automatically — deploying Apps Script and
creating an OAuth client both happen inside *your* Google account, and hosting the
built site needs *your* hosting account. Everything below is copy-paste; none of it
requires coding knowledge, just following the steps in order.

## How it fits together

```
React app (hosted on Vercel/Netlify)
   │  signs in with Google, gets an ID token
   │  sends that token with every request
   ▼
Apps Script Web App (Code.gs)
   │  verifies the token is real AND ends in @cedarsprohub.com
   │  only then reads/writes the Sheet
   ▼
Google Sheet ("Cedars Attendance")
```

---

## Part 1 — Deploy the backend (Apps Script)

1. Open the Sheet: https://docs.google.com/spreadsheets/d/1VY2WycPGzNs5PNNSWc3RQzCZTbBbV9PG1DJkq-wuivU/edit
2. **Extensions → Apps Script**
3. Delete the placeholder code, paste in the contents of `apps-script/Code.gs` (in this folder)
4. Click **Deploy → New deployment**
5. Click the gear icon next to "Select type" → choose **Web app**
6. Fill in:
   - **Execute as:** Me
   - **Who has access:** Anyone
   
   (Yes — "Anyone", not the domain-restricted option. That option redirects to a
   Google login page, which breaks clean API calls from a separate React app.
   The domain check happens inside the script itself instead — see `verifyToken()`
   in Code.gs — so security isn't weaker, it's just enforced differently.)
7. Click **Deploy**, authorize the permissions it asks for (this is your own script
   accessing your own sheet)
8. Copy the URL ending in `/exec` — you'll need it in Part 3

Whenever you edit Code.gs later, you must go to **Deploy → Manage deployments →
Edit (pencil icon) → New version** for the changes to take effect.

## Part 2 — Create a Google OAuth Client ID (for Sign-In)

1. Go to https://console.cloud.google.com/
2. Create a new project (or use an existing one for Cedars)
3. **APIs & Services → OAuth consent screen** — set it to Internal if your
   Workspace allows it (restricts sign-in to your domain at the Google level too),
   otherwise External is fine since we double-check the domain in code anyway
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins: add the URL you'll host the app on
     (e.g. `https://cedars-attendance.vercel.app`) — you can add this after
     Part 3 once you know the URL, then come back and edit it in
5. Copy the **Client ID** (looks like `xxxx.apps.googleusercontent.com`)

## Part 3 — Run and deploy the frontend

1. Install [Node.js](https://nodejs.org) if you don't have it
2. In the `frontend` folder:
   ```
   npm install
   cp .env.example .env
   ```
3. Open `.env` and paste in:
   - `VITE_APPS_SCRIPT_URL` — the `/exec` URL from Part 1
   - `VITE_GOOGLE_CLIENT_ID` — the Client ID from Part 2
4. Test it locally:
   ```
   npm run dev
   ```
   Open the local URL it prints, sign in with a cedarsprohub.com account, confirm
   it loads your staff list and lets you add a record.
5. Deploy it for real — easiest is [Vercel](https://vercel.com):
   - Push this `frontend` folder to a GitHub repo
   - Import it in Vercel, add the same two environment variables in Vercel's
     project settings
   - Deploy — Vercel gives you a live URL
6. Go back to Google Cloud Console (Part 2, step 4) and add that live URL to
   **Authorized JavaScript origins**

That's it — anyone at cedarsprohub.com can now sign in at your live URL and log
attendance, and it's all saved straight to the Google Sheet.

## What each file does

- `apps-script/Code.gs` — the backend. Verifies the sign-in, reads/writes the Sheet.
- `frontend/src/App.jsx` — the whole app: sign-in screen, the log-attendance form,
  and the day-grouped log table with edit/delete.
- `frontend/src/style.css` — styling, matches the Cedars navy/gold look.

## If something doesn't work

- **"unauthorized" errors** — the ID token didn't verify. Double check the Client ID
  matches between Google Cloud Console and your `.env`, and that you signed in with
  a cedarsprohub.com account.
- **Sign-in button doesn't appear** — check the browser console; usually means the
  Client ID is missing or the JavaScript origin isn't authorized yet in Cloud Console.
- **Requests fail with a CORS error** — make sure the Apps Script deployment is set
  to "Anyone" (not domain-restricted) as described in Part 1.
