# Warehouse Portal Apps Script bridge update

Use this in the existing Warehouse Apps Script project before testing the Vercel deployment.

## Script Property required

In Apps Script:

1. Open the Warehouse Apps Script project.
2. Go to **Project Settings**.
3. Under **Script Properties**, add:

```text
WAREHOUSE_PORTAL_API_TOKEN=<same long random secret used in Vercel>
```

## Required `doPost(e)` bridge

Replace the existing `doPost(e)` with this token-protected version. It keeps the same existing backend functions as the real Sheets handler.

```js
function doPost(e) {
  try {
    const payload = e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : {};

    const expectedToken = PropertiesService
      .getScriptProperties()
      .getProperty("WAREHOUSE_PORTAL_API_TOKEN");

    if (!expectedToken) {
      return jsonResponse_({ success: false, error: "Missing WAREHOUSE_PORTAL_API_TOKEN script property" });
    }

    if (!payload.token || payload.token !== expectedToken) {
      return jsonResponse_({ success: false, error: "Unauthorized" });
    }

    if (payload.action === "getAllData") {
      return jsonResponse_({ data: getAllDataJSON() });
    }

    if (payload.action === "appendToProduct") {
      return jsonResponse_(appendToProduct(payload));
    }

    if (payload.action === "appendProducts") {
      return jsonResponse_(appendProductsToProductTabs(payload));
    }

    if (payload.action === "syncWarehouseTrackerFromProductTabs") {
      return jsonResponse_({ success: true, results: syncWarehouseTrackerFromProductTabs() });
    }

    return jsonResponse_({ success: false, error: "Unknown action" });
  } catch (err) {
    return jsonResponse_({ success: false, error: err && err.stack ? err.stack : String(err) });
  }
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## Deploy Apps Script

After saving the bridge:

1. Click **Deploy > Manage deployments**.
2. Edit the existing Web App deployment, or create a new Web App deployment.
3. Execute as: **Me**.
4. Who has access: usually **Anyone** for Vercel bridge access, protected by the token above.
5. Copy the `/exec` URL into Vercel env var:

```text
WAREHOUSE_PORTAL_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

Keep the old Apps Script portal deployment live as backup. This bridge only adds a token-protected API path for Vercel.
