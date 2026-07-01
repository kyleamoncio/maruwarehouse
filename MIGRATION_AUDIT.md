# Warehouse Portal Migration Audit

Source inspected locally in `C:\Users\kylea\OneDrive\Desktop\WAREHOUSE PORTAL`.

## Source project shape

- `index.html` exists and contains the portal UI, CSS, and client-side JavaScript in one file.
- `Code.gs` exists and contains Apps Script server/Sheets functions.
- No `scripts.html` or `styles.html` files were present in the local source folder.
- Original Apps Script files were not edited by this Vercel migration; the Vercel copy is under `vercel-warehouse-portal/`.

## Client/UI functions preserved inside `public/index.html`

- Navigation/pages: `navigate`, `syncTopbarScrollState`, `closeSidebar`, `openSidebar`.
- Setup/dropdowns/settings: `normalizeBuyerList`, `setTodayDate`, `populateDropdowns`, `populateProductSelect`, `populateSearchProductFilters`, `populateBuyerSelect`, `renderBuyerPills`, `addBuyer`, `removeBuyer`, `saveBuyers`, `renderPriceReference`, `saveScriptUrl`.
- Data loading: `loadAllData`, `loadDemoData`.
- Dashboard/charts: `renderDashboard`, `getDashboardMetrics`, `renderOverviewStats`, `renderMonthlyProfit`, `getMonthlySalesRows`, `renderMonthlySalesTimeline`, `renderTopProducts`.
- All Data table: `renderAllData`, `filterAllData`, `sortAllData`, `changePage`.
- Summary: `renderSummary`, `buildSummaryRows`, due-date helpers.
- Search: `runSearch`, `clearSearch`, `renderSearchSummary`, product filter add/remove/reset.
- New Entry: `onBuyerChange`, `onProductChange`, `autoFillPrice`, `onCasesChange`, `collectEntryLines`, `submitEntry`, entry-line add/remove/renumber, preview/save overlay helpers.
- Formatting/helpers: price/date/product/buyer badge and toast helpers.

The only intentional frontend behavior change is the default endpoint: `SCRIPT_URL` now defaults to `/api/sheets` instead of the Apps Script URL/current page URL. The one-file UI/CSS/JS structure is preserved.

## Apps Script backend functions mapped

- `doGet?action=getAllData` → `GET /api/sheets?action=getAllData`.
- `doPost { action: "appendProducts" }` → `POST /api/sheets`.
- `doPost { action: "appendToProduct" }` → `POST /api/sheets` fallback preserved.
- `getAllDataJSON` → `getAllDataJSON` in `api/sheets.js`.
- `appendProductsToProductTabs`, `appendToProduct`, `prepareProductAppend_`, `appendPreparedProductRows_`, `appendPreparedRowsToAllData_`, `findLastDataRow` → equivalent functions in `api/sheets.js`.
- Warehouse lookup helpers (`getWarehouseForProduct`, `getWarehouseTrackerProductName`, `normalizeWarehouseText`, `createWarehouseTrackerLookup_`, `getWarehouseUpdateTarget`) → equivalent functions in `api/sheets.js`.
- `syncWarehouseTrackerFromProductTabs` and formula generation are exposed as `POST /api/sheets` with `action: "syncWarehouseTrackerFromProductTabs"` for parity/maintenance.
- Spreadsheet edit triggers (`onEdit`, `buildAllData`, `searchWarehouseData`) are not browser endpoint calls. The Vercel first version preserves the portal's live app behavior by writing product rows and inserting new rows into `ALL DATA`, matching the current submit path.

## Google Sheet tabs/ranges used

Spreadsheet ID: `1quJTlW8R3c-__SFv9b6Xto8B5ZzEwcVkRIczsn7RBUA`

Read/write tabs:

- `ALL DATA!A:K`
  - Read from `A2:K` for dashboard/search/summary/all-data.
  - Insert new rows below header and write `A:K` on entry submit.
- Product tabs, from row 8, columns `A:H` for entry appends:
  - `Bathroom Tissue 4s Fluffy`
  - `Bathroom Tissue 9s Fluffy`
  - `Bathroom Tissue 12s Fluffy`
  - `Kitchen Towel Fluffy`
  - `Paper Towel Fluffy`
  - `Cotton Buds Fluffy`
  - `Cotton Pads Fluffy`
  - `Bamboo Kitchen Towel Fluffy`
  - `Bamboo Facial Tissue Fluffy`
  - `Wet Wipes 30s Fluffy`
  - `Wet Wipes 60s Fluffy`
  - `Bathroom Tissue 4s Plush`
  - `Bathroom Tissue 9s Plush`
  - `Bathroom Tissue 12s Plush`
  - `Bathroom Tissue 20s Plush`
  - `Bathroom Tissue 30s Plush`
  - `Kitchen Towel Plush`
  - `Paper Towel Plush`
  - `Wet Wipes 30s Plush`
  - `Wet Wipes 60s Plush`
  - `Cotton Buds (Plastic) Plush`
  - `Cotton Buds (Container) Plush`
- `WAREHOUSE TRACKER`
  - Reads display values to find `QC INVENTORY 2026` and `PASIG INVENTORY 2026` sections, headers, product rows, current/start case/pack columns.
  - Optional formula sync writes current case/current pack formulas when explicitly requested.

## Security mapping

- Browser code never contains Google credentials.
- `api/sheets.js` reads credentials from Vercel/server environment only.
- `.gitignore` excludes `.env`, `.env.local`, `.env.*.local`, `.vercel`, `node_modules`, `.next`, private keys, and credential JSON files.

## Verification completed so far

- `npm install` completed.
- `npm audit --omit=dev` found 0 vulnerabilities after updating `googleapis`.
- `npm run check` compiled the preserved inline client script and loaded `api/sheets.js` successfully.

## Verification still blocked until credentials are provided

The live Google Sheets read/write tests require a Google service account with Editor access to the spreadsheet and these env vars set locally and in Vercel:

- `GOOGLE_SHEET_ID`
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

Once provided, test these before switching users to Vercel:

1. `GET /api/sheets?action=getAllData` returns real rows.
2. Portal loads dashboard/search/summary from the same Sheet.
3. Add a clearly marked test entry.
4. Confirm the entry is appended to the correct product tab and inserted into `ALL DATA`.
5. If supported/needed, remove the test row manually from both places after verification.
6. Deploy to Vercel, add env vars, test the live URL against the same spreadsheet.
