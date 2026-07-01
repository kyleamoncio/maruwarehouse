const { google } = require('googleapis');

const PRODUCT_TABS = {
  "Bathroom Tissue 4s Fluffy": "Bathroom Tissue 4s Fluffy",
  "Bathroom Tissue 9s Fluffy": "Bathroom Tissue 9s Fluffy",
  "Bathroom Tissue 12s Fluffy": "Bathroom Tissue 12s Fluffy",
  "Kitchen Towel Fluffy": "Kitchen Towel Fluffy",
  "Paper Towel Fluffy": "Paper Towel Fluffy",
  "Cotton Buds Fluffy": "Cotton Buds Fluffy",
  "Cotton Pads Fluffy": "Cotton Pads Fluffy",
  "Bamboo Kitchen Towel Fluffy": "Bamboo Kitchen Towel Fluffy",
  "Bamboo Facial Tissue Fluffy": "Bamboo Facial Tissue Fluffy",
  "Wet Wipes 30s Fluffy": "Wet Wipes 30s Fluffy",
  "Wet Wipes 60s Fluffy": "Wet Wipes 60s Fluffy",
  "Bathroom Tissue 4s Plush": "Bathroom Tissue 4s Plush",
  "Bathroom Tissue 9s Plush": "Bathroom Tissue 9s Plush",
  "Bathroom Tissue 12s Plush": "Bathroom Tissue 12s Plush",
  "Bathroom Tissue 20s Plush": "Bathroom Tissue 20s Plush",
  "Bathroom Tissue 30s Plush": "Bathroom Tissue 30s Plush",
  "Kitchen Towel Plush": "Kitchen Towel Plush",
  "Paper Towel Plush": "Paper Towel Plush",
  "Wet Wipes 30s Plush": "Wet Wipes 30s Plush",
  "Wet Wipes 60s Plush": "Wet Wipes 60s Plush",
  "Cotton Buds (Plastic) Plush": "Cotton Buds (Plastic) Plush",
  "Cotton Buds (Container) Plush": "Cotton Buds (Container) Plush"
};

const WAREHOUSE_TRACKER_SHEET_NAME = "WAREHOUSE TRACKER";
const WAREHOUSE_TRACKER_PRODUCTS = {
  "Bathroom Tissue 4s Fluffy": "FLUFFY BATHROOM TISSUE 4 ROLLS",
  "Bathroom Tissue 9s Fluffy": "FLUFFY BATHROOM TISSUE 9 ROLLS",
  "Bathroom Tissue 12s Fluffy": "FLUFFY BATHROOM TISSUE 12 ROLLS",
  "Kitchen Towel Fluffy": "FLUFFY KITCHEN TOWEL",
  "Paper Towel Fluffy": "FLUFFY PAPER TOWEL",
  "Cotton Buds Fluffy": "FLUFFY COTTON BUDS",
  "Cotton Pads Fluffy": "FLUFFY COTTON PADS",
  "Bamboo Kitchen Towel Fluffy": "FLUFFY BAMBOO KITCHEN TOWEL",
  "Bamboo Facial Tissue Fluffy": "FLUFFY BAMBOO FACIAL TISSUE",
  "Wet Wipes 30s Fluffy": "FLUFFY WET WIPES 30s",
  "Wet Wipes 60s Fluffy": "FLUFFY WET WIPES 60s",
  "Bathroom Tissue 4s Plush": "PLUSH BATHROOM TISSUE 4 ROLLS",
  "Bathroom Tissue 9s Plush": "PLUSH BATHROOM TISSUE 9 ROLLS",
  "Bathroom Tissue 12s Plush": "PLUSH BATHROOM TISSUE 12 ROLLS",
  "Bathroom Tissue 20s Plush": "PLUSH BATHROOM TISSUE 20 ROLLS",
  "Bathroom Tissue 30s Plush": "PLUSH BATHROOM TISSUE 30 ROLLS",
  "Kitchen Towel Plush": "PLUSH KITCHEN TOWEL",
  "Paper Towel Plush": "PLUSH PAPER TOWEL",
  "Wet Wipes 30s Plush": "PLUSH WET WIPES 30s",
  "Wet Wipes 60s Plush": "PLUSH WET WIPES 60s",
  "Cotton Buds (Plastic) Plush": "PLUSH COTTON BUDS 200 STEMS",
  "Cotton Buds (Container) Plush": "PLUSH COTTON BUDS 300 STEMS"
};

const PRODUCT_COSTS = {
  "Bathroom Tissue 4s Fluffy": 51.39,
  "Bathroom Tissue 9s Fluffy": 116.84,
  "Bathroom Tissue 12s Fluffy": 155.71,
  "Kitchen Towel Fluffy": 59.88,
  "Paper Towel Fluffy": 65.89,
  "Bamboo Facial Tissue Fluffy": 39.29,
  "Bamboo Kitchen Towel Fluffy": 35.88,
  "Cotton Buds Fluffy": 16.34,
  "Cotton Pads Fluffy": 39.94,
  "Wet Wipes 30s Fluffy": 73.41,
  "Wet Wipes 60s Fluffy": 116.95,
  "Bathroom Tissue 4s Plush": 54.06,
  "Bathroom Tissue 9s Plush": 120.01,
  "Bathroom Tissue 12s Plush": 158.26,
  "Bathroom Tissue 20s Plush": 451.66,
  "Bathroom Tissue 30s Plush": 677.49,
  "Kitchen Towel Plush": 70.91,
  "Paper Towel Plush": 62.65,
  "Cotton Buds (Plastic) Plush": 16.14,
  "Cotton Buds (Container) Plush": 26.60,
  "Wet Wipes 30s Plush": 75.64,
  "Wet Wipes 60s Plush": 123.52
};

const WAREHOUSE_TRACKER_SECTIONS = {
  QC: /QC\s+INVENTORY\s+2026/i,
  PASIG: /PASIG\s+INVENTORY\s+2026/i
};

const SHEET_ID = process.env.GOOGLE_SHEET_ID || "1quJTlW8R3c-__SFv9b6Xto8B5ZzEwcVkRIczsn7RBUA";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.end(JSON.stringify(body));
}

function requireEnv() {
  const missing = ["GOOGLE_CLIENT_EMAIL", "GOOGLE_PRIVATE_KEY"].filter((key) => !process.env[key]);
  if (missing.length) throw new Error("Missing environment variables: " + missing.join(", "));
}

function getSheetsClient() {
  requireEnv();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
  const auth = new google.auth.JWT(process.env.GOOGLE_CLIENT_EMAIL, null, privateKey, SCOPES);
  return google.sheets({ version: "v4", auth });
}

function quoteSheet(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

function columnLetter(n) {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function serialToDate(value) {
  if (value === "" || value === null || value === undefined) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  if (typeof value === "number" && Number.isFinite(value)) {
    const utc = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(utc);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const cleaned = String(value).replace(/\*/g, "").replace(/\s+/g, " ").trim();
  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  return null;
}

function formatDateForDisplay(value) {
  const d = serialToDate(value);
  if (!d) return String(value || "").replace(/\*/g, "").trim();
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function normalizeWarehouseText(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getSpreadsheetMeta(sheets) {
  const response = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: "sheets.properties" });
  const byTitle = new Map();
  for (const sheet of response.data.sheets || []) byTitle.set(sheet.properties.title, sheet.properties);
  return byTitle;
}

async function readValues(sheets, range, valueRenderOption = "UNFORMATTED_VALUE") {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
    valueRenderOption,
    dateTimeRenderOption: "SERIAL_NUMBER"
  });
  return response.data.values || [];
}

async function writeValues(sheets, range, values) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values }
  });
}

async function getAllDataJSON(sheets) {
  const values = await readValues(sheets, `${quoteSheet("ALL DATA")}!A2:K`);
  return values
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => [
      formatDateForDisplay(row[0]),
      row[1] || "", row[2] || "", row[3] || "", Number(row[4]) || 0, Number(row[5]) || 0,
      Number(row[6]) || 0, Number(row[7]) || 0, Number(row[8]) || 0, Number(row[9]) || 0, row[10] || ""
    ]);
}

async function findLastDataRow(sheets, tabName) {
  const values = await readValues(sheets, `${quoteSheet(tabName)}!A8:A`);
  let lastRow = 7;
  values.forEach((row, i) => {
    if (String(row[0] ?? "").trim() !== "") lastRow = 8 + i;
  });
  return lastRow;
}

function getWarehouseForProduct(product) {
  const value = String(product || "");
  const isBathroomTissue = value.indexOf("Bathroom Tissue") !== -1;
  const isExcludedPlushBulk = value === "Bathroom Tissue 20s Plush" || value === "Bathroom Tissue 30s Plush";
  return isBathroomTissue && !isExcludedPlushBulk ? "QC" : "PASIG";
}

function getWarehouseTrackerProductName(product) {
  return WAREHOUSE_TRACKER_PRODUCTS[product] || String(product || "").toUpperCase();
}

async function createWarehouseTrackerLookup(sheets) {
  const values = await readValues(sheets, `${quoteSheet(WAREHOUSE_TRACKER_SHEET_NAME)}!A:Z`, "FORMATTED_VALUE");
  if (!values.length) throw new Error("Sheet tab not found or empty: " + WAREHOUSE_TRACKER_SHEET_NAME);
  const targets = new Map();

  for (const warehouse of Object.keys(WAREHOUSE_TRACKER_SECTIONS)) {
    const sectionPattern = WAREHOUSE_TRACKER_SECTIONS[warehouse];
    const sectionRowIndex = values.findIndex((row) => row.some((cell) => sectionPattern.test(String(cell || ""))));
    if (sectionRowIndex === -1) throw new Error("Warehouse section not found: " + warehouse);

    const nextSectionRowIndex = values.findIndex((row, index) => index > sectionRowIndex && row.some((cell) => /INVENTORY\s+2026/i.test(String(cell || ""))));
    const sectionEndIndex = nextSectionRowIndex === -1 ? values.length : nextSectionRowIndex;

    const headerRowIndex = values.findIndex((row, index) => {
      if (index <= sectionRowIndex || index >= sectionEndIndex) return false;
      const normalized = row.map(normalizeWarehouseText);
      return normalized.includes("PRODUCT") && normalized.includes("CURRENT CASE") && normalized.includes("CURRENT PACK");
    });
    if (headerRowIndex === -1) throw new Error("Warehouse header row not found for: " + warehouse);

    const header = values[headerRowIndex].map(normalizeWarehouseText);
    const productColIndex = header.indexOf("PRODUCT");
    const startCaseColIndex = header.indexOf("START CASE");
    const startPackColIndex = header.indexOf("START PACK");
    const currentCaseColIndex = header.indexOf("CURRENT CASE");
    const currentPackColIndex = header.indexOf("CURRENT PACK");

    for (let rowIndex = headerRowIndex + 1; rowIndex < sectionEndIndex; rowIndex += 1) {
      const productKey = normalizeWarehouseText(values[rowIndex]?.[productColIndex]);
      if (!productKey || productKey === "TOTAL") break;
      targets.set(`${warehouse}|${productKey}`, {
        warehouse,
        row: rowIndex + 1,
        startCaseCol: startCaseColIndex + 1,
        startPackCol: startPackColIndex + 1,
        currentCaseCol: currentCaseColIndex + 1,
        currentPackCol: currentPackColIndex + 1
      });
    }
  }
  return { targets };
}

function getWarehouseUpdateTarget(product, requestedWarehouse, warehouseLookup) {
  const warehouse = String(requestedWarehouse || getWarehouseForProduct(product)).toUpperCase() === "QC" ? "QC" : "PASIG";
  const trackerProduct = getWarehouseTrackerProductName(product);
  const lookupKey = `${warehouse}|${normalizeWarehouseText(trackerProduct)}`;
  const target = warehouseLookup.targets.get(lookupKey);
  if (!target) throw new Error("Product not found in " + warehouse + " warehouse tracker: " + trackerProduct);
  return target;
}

function prepareProductAppend(payload, warehouseLookup) {
  const { product, date, buyer, po, si, packs, cases, price } = payload;
  if (!product || !date || !buyer || !packs) throw new Error("Missing required fields: product, date, buyer, packs");
  const tabName = PRODUCT_TABS[product];
  if (!tabName) throw new Error("No tab mapped for: " + product);
  const packsNum = Number(packs) || 0;
  const casesNum = Number(cases) || 0;
  const buyerKey = String(buyer).trim().toUpperCase();
  const isNoRevenueEntry = buyerKey === "SAMPLE" || buyerKey === "PERSONAL";
  const priceNum = isNoRevenueEntry ? 0 : Number(price) || 0;
  const isSM = buyerKey.includes("SM");
  const total = isNoRevenueEntry ? 0 : isSM ? casesNum * priceNum : packsNum * priceNum;
  const warehouseTarget = getWarehouseUpdateTarget(product, payload.warehouse, warehouseLookup);
  return { product, date, buyer, po, si, packsNum, casesNum, priceNum, total, tabName, warehouseTarget };
}

async function appendPreparedProductRows(sheets, preparedEntries) {
  const appended = new Array(preparedEntries.length);
  const groups = new Map();
  preparedEntries.forEach((prepared, index) => {
    const group = groups.get(prepared.tabName) || [];
    group.push({ prepared, index });
    groups.set(prepared.tabName, group);
  });

  for (const [tabName, entries] of groups.entries()) {
    const startRow = (await findLastDataRow(sheets, tabName)) + 1;
    const values = entries.map(({ prepared }) => [
      formatDateForDisplay(prepared.date),
      prepared.buyer,
      prepared.po || "",
      prepared.si || "",
      prepared.packsNum,
      prepared.casesNum,
      prepared.priceNum,
      prepared.total
    ]);
    await writeValues(sheets, `${quoteSheet(tabName)}!A${startRow}:H${startRow + values.length - 1}`, values);

    entries.forEach(({ prepared, index }, offset) => {
      appended[index] = {
        product: prepared.product,
        tabName: prepared.tabName,
        row: startRow + offset,
        warehouse: prepared.warehouseTarget.warehouse,
        warehouseRow: prepared.warehouseTarget.row,
        packs: prepared.packsNum,
        cases: prepared.casesNum
      };
    });
  }
  return appended;
}

async function appendPreparedRowsToAllData(sheets, meta, preparedEntries) {
  if (!preparedEntries.length) return;
  const allDataProps = meta.get("ALL DATA");
  if (!allDataProps) return;
  const rows = preparedEntries.map((prepared) => {
    const cost = (PRODUCT_COSTS[prepared.product] || 0) * prepared.packsNum;
    const net = prepared.total - cost;
    return [
      formatDateForDisplay(prepared.date),
      prepared.buyer,
      prepared.po || "",
      prepared.si || "",
      prepared.packsNum,
      prepared.casesNum,
      prepared.priceNum,
      prepared.total,
      cost,
      net,
      prepared.tabName
    ];
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        insertDimension: {
          range: { sheetId: allDataProps.sheetId, dimension: "ROWS", startIndex: 1, endIndex: 1 + rows.length },
          inheritFromBefore: false
        }
      }]
    }
  });
  await writeValues(sheets, `${quoteSheet("ALL DATA")}!A2:K${1 + rows.length}`, rows);
  await formatAllDataRows(sheets, allDataProps.sheetId, rows.length);
}

async function formatAllDataRows(sheets, sheetId, rowCount) {
  if (!rowCount) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 1 + rowCount, startColumnIndex: 0, endColumnIndex: 1 },
            cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "mmmm d, yyyy" } } },
            fields: "userEnteredFormat.numberFormat"
          }
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 1 + rowCount, startColumnIndex: 6, endColumnIndex: 10 },
            cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "₱#,##0.00" } } },
            fields: "userEnteredFormat.numberFormat"
          }
        }
      ]
    }
  });
}

async function appendProductsToProductTabs(sheets, payload) {
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  if (entries.length === 0) return { success: false, error: "No entries were provided." };
  const meta = await getSpreadsheetMeta(sheets);
  for (const entry of entries) {
    const tabName = PRODUCT_TABS[entry.product];
    if (!meta.has(tabName)) throw new Error("Sheet tab not found: " + tabName);
  }
  if (!meta.has(WAREHOUSE_TRACKER_SHEET_NAME)) throw new Error("Sheet tab not found: " + WAREHOUSE_TRACKER_SHEET_NAME);

  const warehouseLookup = await createWarehouseTrackerLookup(sheets);
  const preparedEntries = entries.map((entry) => prepareProductAppend({ ...payload, ...entry }, warehouseLookup));
  const appended = await appendPreparedProductRows(sheets, preparedEntries);
  await appendPreparedRowsToAllData(sheets, meta, preparedEntries);
  return {
    success: true,
    message: appended.length + " entr" + (appended.length === 1 ? "y" : "ies") + " added to product tabs.",
    appended
  };
}

async function syncWarehouseTrackerFromProductTabs(sheets) {
  const meta = await getSpreadsheetMeta(sheets);
  const trackerProps = meta.get(WAREHOUSE_TRACKER_SHEET_NAME);
  if (!trackerProps) throw new Error("Sheet tab not found: " + WAREHOUSE_TRACKER_SHEET_NAME);
  const warehouseLookup = await createWarehouseTrackerLookup(sheets);
  const results = [];
  const data = [];
  for (const product of Object.keys(PRODUCT_TABS)) {
    try {
      const tabName = PRODUCT_TABS[product];
      const target = getWarehouseUpdateTarget(product, null, warehouseLookup);
      const caseFormula = createLatestStockFormula(tabName, "L", target.row, target.startCaseCol);
      const packFormula = createLatestStockFormula(tabName, "K", target.row, target.startPackCol);
      data.push({ range: `${quoteSheet(WAREHOUSE_TRACKER_SHEET_NAME)}!${columnLetter(target.currentCaseCol)}${target.row}`, values: [[caseFormula]] });
      data.push({ range: `${quoteSheet(WAREHOUSE_TRACKER_SHEET_NAME)}!${columnLetter(target.currentPackCol)}${target.row}`, values: [[packFormula]] });
      results.push({ product, warehouse: target.warehouse, currentCaseFormula: caseFormula, currentPackFormula: packFormula, success: true });
    } catch (error) {
      results.push({ product, success: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (data.length) {
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { valueInputOption: "USER_ENTERED", data } });
  }
  return results;
}

function createLatestStockFormula(tabName, stockColumnLetter, fallbackRow, fallbackColumnNumber) {
  const safeTabName = tabName.replace(/'/g, "''");
  const fallbackColumnLetter = columnLetter(fallbackColumnNumber);
  return "=IFERROR(" +
    "INDEX('" + safeTabName + "'!" + stockColumnLetter + "8:" + stockColumnLetter + "," +
      "MAX(FILTER(" +
        "ROW('" + safeTabName + "'!A8:A)-ROW('" + safeTabName + "'!A8)+1," +
        "ISNUMBER('" + safeTabName + "'!A8:A)" +
      "))" +
    ")," +
    fallbackColumnLetter + fallbackRow +
  ")";
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, { ok: true });
  try {
    const sheets = getSheetsClient();
    if (req.method === "GET") {
      const action = req.query?.action || "";
      if (action === "getAllData") return json(res, 200, { data: await getAllDataJSON(sheets) });
      return json(res, 200, { ok: true, service: "MARU Warehouse Portal Sheets API" });
    }
    if (req.method === "POST") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      if (payload.action === "appendToProduct") return json(res, 200, await appendProductsToProductTabs(sheets, { ...payload, entries: [payload] }));
      if (payload.action === "appendProducts") return json(res, 200, await appendProductsToProductTabs(sheets, payload));
      if (payload.action === "syncWarehouseTrackerFromProductTabs") return json(res, 200, { success: true, results: await syncWarehouseTrackerFromProductTabs(sheets) });
      return json(res, 400, { error: "Unknown action" });
    }
    return json(res, 405, { error: "Method not allowed" });
  } catch (err) {
    return json(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
};
