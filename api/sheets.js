const { randomUUID } = require("crypto");

const ORIGINAL_APPS_SCRIPT_URL = process.env.WAREHOUSE_PORTAL_APPS_SCRIPT_URL || process.env.WAREHOUSE_PORTAL_URL || "";
const V2_APPS_SCRIPT_URL = process.env.WAREHOUSE_PORTAL_V2_URL || "";
const ORIGINAL_API_TOKEN = process.env.WAREHOUSE_PORTAL_API_TOKEN || "";
const V2_API_TOKEN = process.env.WAREHOUSE_PORTAL_V2_API_TOKEN || ORIGINAL_API_TOKEN;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const WRITE_ACTIONS = new Set(["appendProducts", "appendToProduct"]);

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function sendJson(res, status, body) {
  setCors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function sanitizeBodyPreview(text) {
  return String(text || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
}

async function readRequestBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function getAction(req, body) {
  return body.action || req.query?.action || "";
}

async function getV2Health() {
  if (!V2_APPS_SCRIPT_URL) return { success: false, error: "V2 URL is not configured." };
  const url = new URL(V2_APPS_SCRIPT_URL);
  url.searchParams.set("action", "health");
  const response = await fetch(url.toString(), { method: "GET", redirect: "follow" });
  const text = await response.text();
  try { return JSON.parse(text); }
  catch (_) { return { success: false, error: `V2 health returned non-JSON (${response.status}).` }; }
}

async function fetchLegacyGetAllData() {
  const url = new URL(ORIGINAL_APPS_SCRIPT_URL);
  url.searchParams.set("action", "getAllData");
  const response = await fetch(url.toString(), { method: "GET", redirect: "follow" });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    const preview = sanitizeBodyPreview(text);
    throw new Error(
      `Original Apps Script legacy getAllData returned non-JSON response (${response.status}). ` +
      (preview ? `Preview: ${preview}` : "No response body.")
    );
  }
}

async function forwardToAppsScript(url, token, action, body, label) {
  if (!url) throw new Error(`Missing ${label} Apps Script URL.`);
  if (!token) throw new Error(`Missing ${label} API token.`);
  if (!action) throw new Error("Missing action.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...body, action, token }),
      redirect: "follow",
      signal: controller.signal
    });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`${label} Apps Script timed out after 25 seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const preview = sanitizeBodyPreview(text);
    throw new Error(
      `${label} Apps Script returned non-JSON response (${response.status}). ` +
      (preview ? `Preview: ${preview}` : "No response body.")
    );
  }

  if (label === "Original" && parsed?.error === "Unknown action" && action === "getAllData") {
    return fetchLegacyGetAllData();
  }
  if (!response.ok) {
    return {
      __status: response.status,
      success: false,
      error: parsed.error || parsed.message || `${label} Apps Script request failed with HTTP ${response.status}`,
      details: parsed
    };
  }
  return parsed;
}

function succeeded(result) {
  return Boolean(result) && !result.error && result.success !== false && !result.__status;
}

async function dualWrite(action, body) {
  const requestId = String(body.requestId || randomUUID());
  const payload = { ...body, requestId };
  const original = await forwardToAppsScript(
    ORIGINAL_APPS_SCRIPT_URL, ORIGINAL_API_TOKEN, action, payload, "Original"
  );

  if (!succeeded(original)) {
    return {
      ...original,
      success: false,
      requestId,
      sync: {
        original: { success: false, error: original?.error || "Original write failed." },
        v2: { success: false, skipped: true, error: "V2 was not attempted because the original write failed." }
      }
    };
  }

  let v2;
  if (!V2_APPS_SCRIPT_URL) {
    v2 = { success: false, skipped: true, error: "V2 sync is not configured yet." };
  } else {
    try {
      const result = await forwardToAppsScript(V2_APPS_SCRIPT_URL, V2_API_TOKEN, action, payload, "V2");
      v2 = succeeded(result)
        ? { success: true, result }
        : { success: false, error: result?.error || "V2 write failed.", result };
    } catch (error) {
      v2 = { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    ...original,
    success: true,
    requestId,
    sync: {
      original: { success: true },
      v2
    },
    warning: v2.success ? undefined : `Original Sheet saved successfully, but V2 sync failed: ${v2.error}`
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });
  if (req.method !== "GET" && req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const body = req.method === "POST" ? await readRequestBody(req) : {};
    const action = getAction(req, body);
    let result;
    if (action === "appendRestocks") {
      const health = await getV2Health();
      result = ["2026-07-13.10", "2026-07-13.11", "2026-07-13.12", "2026-07-13.13", "2026-07-13.14"].includes(health.version)
        ? await forwardToAppsScript(V2_APPS_SCRIPT_URL, V2_API_TOKEN, action, body, "V2")
        : { __status: 503, success: false, error: "Restock is temporarily paused while the formula-safe backend repair is being deployed." };
    } else if (["repairRestockDamage", "repairRestockRows", "refreshProductView", "formatV2"].includes(action)) {
      result = await forwardToAppsScript(V2_APPS_SCRIPT_URL, V2_API_TOKEN, action, body, "V2");
    } else if (action === "getV2Bootstrap") {
      result = await forwardToAppsScript(V2_APPS_SCRIPT_URL, V2_API_TOKEN, action, body, "V2");
    } else if (req.method === "POST" && WRITE_ACTIONS.has(action)) {
      result = await dualWrite(action, body);
    } else {
      result = await forwardToAppsScript(
        ORIGINAL_APPS_SCRIPT_URL, ORIGINAL_API_TOKEN, action, body, "Original"
      );
    }
    const status = result?.__status || 200;
    if (result?.__status) delete result.__status;
    return sendJson(res, status, result);
  } catch (error) {
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
