# Cedars Attendance

React frontend, Google Apps Script backend, and Google Sheets storage for the
Cedars staff attendance register.

The frontend can be hosted on Vercel. The backend runs in your Google account as
an Apps Script Web App attached to the Cedars Attendance spreadsheet. Every API
request includes a Google ID token and the backend only accepts
`@cedarsprohub.com` accounts.

## Project Structure

- `frontend/` - Vite + React app for sign-in, staff management, attendance entry,
  edit/delete, filtering, and daily summaries.
- `apps-script/Code.gs` - Apps Script JSON API that reads and writes the Google
  Sheet.

## Backend Setup

1. Open the Sheet:
   `https://docs.google.com/spreadsheets/d/1VY2WycPGzNs5PNNSWc3RQzCZTbBbV9PG1DJkq-wuivU/edit`
2. Go to **Extensions > Apps Script**.
3. Replace the starter code with `apps-script/Code.gs`.
4. In `Code.gs`, optionally paste your Google OAuth Client ID into
   `GOOGLE_CLIENT_ID`. This lets the backend verify that tokens were issued for
   this exact app.
5. Click **Deploy > New deployment**.
6. Choose **Web app**.
7. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone
8. Deploy, authorize the script, and copy the URL ending in `/exec`.

After editing `Code.gs`, create a new deployment version from **Deploy > Manage
deployments > Edit > New version**.

## Google OAuth Setup

1. Open `https://console.cloud.google.com/`.
2. Create or choose a project.
3. Configure the OAuth consent screen. Internal is best if your Workspace allows
   it; External also works because the backend verifies the domain.
4. Create an OAuth Client ID:
   - Application type: **Web application**
   - Authorized JavaScript origins: your Vercel URL, for example
     `https://cedars-attendance.vercel.app`
5. Copy the Client ID.

## Frontend Setup

From `frontend/`:

```bash
pnpm install
cp .env.example .env
```

Fill in:

```bash
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
```

Run locally:

```bash
pnpm run dev
```

Build:

```bash
pnpm run build
```

## Vercel Deployment

Deploy from the project root. The root `vercel.json` points Vercel at the
`frontend/` Vite app for install, build, and output.

Required Vercel environment variables:

- `VITE_APPS_SCRIPT_URL`
- `VITE_GOOGLE_CLIENT_ID`

If either variable is missing, the live app shows a setup screen instead of a
broken sign-in button.

## Troubleshooting

- **Setup screen on Vercel:** Add both environment variables in Vercel and
  redeploy.
- **Unauthorized:** Confirm the user signs in with `@cedarsprohub.com`, the
  frontend Client ID is correct, and `GOOGLE_CLIENT_ID` in `Code.gs` is either
  blank or exactly the same Client ID.
- **CORS or fetch errors:** Confirm the Apps Script deployment access is
  **Anyone** and the frontend uses the `/exec` URL.
- **Changes to Apps Script are ignored:** Publish a new Apps Script deployment
  version.
