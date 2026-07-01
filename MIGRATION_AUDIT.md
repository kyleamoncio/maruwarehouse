# Warehouse Portal Migration Audit

Source inspected locally in `C:\Users\kylea\OneDrive\Desktop\WAREHOUSE PORTAL`.

## Source project shape

- `index.html` exists and contains the portal UI, CSS, and client-side JavaScript in one file.
- `Code.gs` exists and contains Apps Script server/Sheets functions.
- No `scripts.html` or `styles.html` files were present in the local source folder.
- Original Apps Script deployment is preserved as backup; the Vercel copy is under `vercel-warehouse-portal/`.

## Current Vercel architecture

Updated to match the successful House Portal path:

```text
Vercel frontend
→ `/api/sheets`
→ Apps Script Web App `/exec` URL
→ existing Warehouse Apps Script functions
→ Google Sheets
```

This version does **not** require direct Google Sheets API credentials, service accounts, private keys, or credential JSON files.

## Vercel env vars now required

- `WAREHOUSE_PORTAL_APPS_SCRIPT_URL`
- `WAREHOUSE_PORTAL_API_TOKEN`
- `ALLOWED_ORIGIN`

Removed/stopped requiring:

- `GOOGLE_SHEET_ID`
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

## Client/UI functions preserved inside `public/index.html`

The one-file frontend remains preserved. Major preserved functions include:

- Navigation/pages: `navigate`, `syncTopbarScrollState`, `closeSidebar`, `openSidebar`.
- Setup/dropdowns/settings: `normalizeBuyerList`, `setTodayDate`, `populateDropdowns`, `populateProductSelect`, `populateSearchProductFilters`, `populateBuyerSelect`, `renderBuyerPills`, `addBuyer`, `removeBuyer`, `saveBuyers`, `renderPriceReference`, `saveScriptUrl`.
- Data loading: `loadAllData`, `loadDemoData`.
- Dashboard/charts: `renderDashboard`, `getDashboardMetrics`, `renderOverviewStats`, `renderMonthlyProfit`, `getMonthlySalesRows`, `renderMonthlySalesTimeline`, `renderTopProducts`.
- All Data table: `renderAllData`, `filterAllData`, `sortAllData`, `changePage`.
- Summary: `renderSummary`, `buildSummaryRows`, due-date helpers.
- Search: `runSearch`, `clearSearch`, `renderSearchSummary`, product filter add/remove/reset.
- New Entry: `onBuyerChange`, `onProductChange`, `autoFillPrice`, `onCasesChange`, `collectEntryLines`, `submitEntry`, entry-line add/remove/renumber, preview/save overlay helpers.

The only intentional frontend behavior change from Apps Script hosting is that `SCRIPT_URL` defaults to `/api/sheets` for Vercel.

## Apps Script backend functions mapped through bridge

- `GET /api/sheets?action=getAllData` forwards to Apps Script `doPost` action `getAllData`, which calls `getAllDataJSON()`.
- `POST /api/sheets` action `appendProducts` forwards to Apps Script `appendProductsToProductTabs(payload)`.
- `POST /api/sheets` action `appendToProduct` forwards to Apps Script `appendToProduct(payload)`.
- Optional maintenance action `syncWarehouseTrackerFromProductTabs` forwards to existing Apps Script sync function.

See `APPS_SCRIPT_BRIDGE.md` for the exact token-protected Apps Script `doPost(e)` bridge.

## Google Sheet tabs/ranges preserved by Apps Script

Spreadsheet ID remains:

`1quJTlW8R3c-__SFv9b6Xto8B5ZzEwcVkRIczsn7RBUA`

Existing Apps Script continues to handle:

- `ALL DATA!A:K`
- Product tabs from row 8, columns `A:H`
- `WAREHOUSE TRACKER` sections for `QC INVENTORY 2026` and `PASIG INVENTORY 2026`

## Security

- Browser code contains no Google credentials.
- Vercel only stores the Apps Script URL and bridge token in env vars.
- Apps Script validates `WAREHOUSE_PORTAL_API_TOKEN` from Script Properties.
- `.gitignore` excludes `.env`, `.env.local`, `.env.*.local`, `.vercel`, `node_modules`, `.next`, private keys, and credential JSON files.

## Verification completed locally

- `npm run check` compiles the preserved inline frontend script, loads `api/sheets.js`, and confirms the default endpoint is `/api/sheets`.

## Verification still blocked until Apps Script bridge URL/token are provided

Live Google Sheets tests require:

1. Apps Script `doPost(e)` bridge from `APPS_SCRIPT_BRIDGE.md` deployed as Web App.
2. Apps Script Script Property `WAREHOUSE_PORTAL_API_TOKEN` set.
3. Vercel env vars set with the same token and the Apps Script `/exec` URL.

Then test:

1. Vercel portal loads.
2. `/api/sheets?action=getAllData` returns real rows from Apps Script JSON.
3. Add a clearly marked test entry.
4. Confirm it appears in the correct product tab and `ALL DATA`.
5. Test search/filter/navigation and all main buttons.
6. Confirm no secrets are committed.
