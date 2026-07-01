# MARU Warehouse Portal — Vercel Apps Script Bridge

This project is a minimum-risk Vercel migration of the existing Google Apps Script Warehouse Portal.

The first Vercel version intentionally keeps the frontend as one mostly unchanged file and uses the same successful bridge pattern as House Portal:

```text
Vercel Warehouse Portal frontend
→ Vercel API route `/api/sheets`
→ Warehouse Apps Script Web App URL with `doPost(e)`
→ existing Apps Script functions
→ Google Sheets
```

No Google service account or private key is required for this version.

## Structure

```text
vercel-warehouse-portal/
├─ public/
│  └─ index.html          # original one-file UI/CSS/client JS, kept together
├─ api/
│  └─ sheets.js           # Vercel proxy to Apps Script bridge
├─ scripts/
│  └─ check.js            # syntax/sanity verification
├─ APPS_SCRIPT_BRIDGE.md  # exact Apps Script doPost bridge instructions
├─ package.json
├─ vercel.json
├─ .env.example
└─ .gitignore
```

## Required Vercel environment variables

```text
WAREHOUSE_PORTAL_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
WAREHOUSE_PORTAL_API_TOKEN=change-this-to-a-long-random-secret
ALLOWED_ORIGIN=https://maruwarehouse.vercel.app
```

Use the same `WAREHOUSE_PORTAL_API_TOKEN` value in Apps Script Script Properties.

## Local run

```bash
npm install
cp .env.example .env.local
# edit .env.local with real Apps Script URL and token
npx vercel dev --yes
```

Open the local URL and keep Settings API endpoint as `/api/sheets`.

## Security

Never commit `.env`, `.env.local`, `.vercel`, credentials files, or tokens.

This version does **not** use:

- `GOOGLE_SHEET_ID`
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `service-account.json`
- `credentials.json`

## Verification

Run:

```bash
npm run check
```

Live data verification requires the Apps Script bridge deployment URL and matching token to be configured locally/Vercel.
