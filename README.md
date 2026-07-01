# MARU Warehouse Portal — Vercel Migration

This project is a minimum-risk Vercel migration of the existing Google Apps Script Warehouse Portal.

## Structure

```text
vercel-warehouse-portal/
├─ public/
│  └─ index.html          # original one-file UI/CSS/client JS, kept together
├─ api/
│  └─ sheets.js           # server-side Google Sheets API replacement for Apps Script doGet/doPost
├─ package.json
├─ vercel.json
├─ .env.example
└─ .gitignore
```

## Required environment variables

Copy `.env.example` to `.env.local` for local testing and set:

- `GOOGLE_SHEET_ID` — `1quJTlW8R3c-__SFv9b6Xto8B5ZzEwcVkRIczsn7RBUA`
- `GOOGLE_CLIENT_EMAIL` — Google Cloud service account email
- `GOOGLE_PRIVATE_KEY` — service account private key with `\n` line breaks
- optional `ALLOWED_ORIGIN` — deployed Vercel URL

The Google Sheet must be shared with the service account email as Editor.

## Preserved tabs/ranges

- `ALL DATA!A:K`
- product tabs from row 8, columns `A:H`
- `WAREHOUSE TRACKER` inventory sections for `QC INVENTORY 2026` and `PASIG INVENTORY 2026`

## Local run

```bash
npm install
cp .env.example .env.local
# edit .env.local with real service-account values
npx vercel dev
```

Open the local URL and keep Settings API endpoint as `/api/sheets`. Do not run `npm run dev`; this package intentionally avoids a recursive Vercel dev script.

## Security

Never commit `.env`, `.env.local`, service-account JSON, private keys, or Vercel project metadata.
