const APPS_SCRIPT_URL = process.env.WAREHOUSE_PORTAL_APPS_SCRIPT_URL || "";
const API_TOKEN = process.env.WAREHOUSE_PORTAL_API_TOKEN || "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

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

async function forwardToAppsScript(action, body) {
  if (!APPS_SCRIPT_URL) {
    throw new Error("Missing WAREHOUSE_PORTAL_APPS_SCRIPT_URL environment variable.");
  }
  if (!API_TOKEN) {
    throw new Error("Missing WAREHOUSE_PORTAL_API_TOKEN environment variable.");
  }
  if (!action) {
    throw new Error("Missing action.");
  }

  const upstreamPayload = {
    ...body,
    action,
    token: API_TOKEN
  };

  const upstreamResponse = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(upstreamPayload),
    redirect: "follow"
  });

  const text = await upstreamResponse.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const preview = sanitizeBodyPreview(text);
    throw new Error(
      `Apps Script returned non-JSON response (${upstreamResponse.status}). ` +
      (preview ? `Preview: ${preview}` : "No response body.")
    );
  }

  if (!upstreamResponse.ok) {
    return {
      __status: upstreamResponse.status,
      error: parsed.error || parsed.message || `Apps Script request failed with HTTP ${upstreamResponse.status}`,
      details: parsed
    };
  }

  return parsed;
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });
  if (req.method !== "GET" && req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  try {
    const body = req.method === "POST" ? await readRequestBody(req) : {};
    const action = getAction(req, body);
    const result = await forwardToAppsScript(action, body);
    const status = result && result.__status ? result.__status : 200;
    if (result && result.__status) delete result.__status;
    return sendJson(res, status, result);
  } catch (error) {
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
