'use strict';

const V2_URL = () => process.env.WAREHOUSE_PORTAL_V2_URL || '';
const V2_TOKEN = () => process.env.WAREHOUSE_PORTAL_V2_API_TOKEN || process.env.WAREHOUSE_PORTAL_API_TOKEN || '';

async function callV2(action,body = {},options = {}) {
  if (!V2_URL()) throw new Error('WAREHOUSE_PORTAL_V2_URL is not configured.');
  if (!V2_TOKEN()) throw new Error('WAREHOUSE_PORTAL_V2_API_TOKEN is not configured.');
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs || (action === 'getPoBootstrap' ? 45000 : 25000);
  const timeout = setTimeout(() => controller.abort(),timeoutMs);
  let response;
  try {
    response = await fetch(V2_URL(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...body,action,token:V2_TOKEN()}),redirect:'follow',signal:controller.signal});
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error(`Warehouse database timed out during ${action}.`);
    throw error;
  } finally { clearTimeout(timeout); }
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); }
  catch (_) { throw new Error(`Warehouse database returned an invalid response during ${action}.`); }
  if (!response.ok || result.error || result.success === false) {
    const error = new Error(result.error || `Warehouse database request ${action} failed.`);
    error.details = result;
    throw error;
  }
  return result;
}
module.exports = {callV2};
