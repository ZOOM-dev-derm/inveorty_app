/**
 * Google Apps Script — Web App for Inventory Dashboard Write Operations
 *
 * Setup:
 * 1. Open your Google Spreadsheet → Extensions → Apps Script
 * 2. Paste this entire file into the script editor (replace any existing code)
 * 3. Click Deploy → New deployment
 * 4. Select type: Web app
 * 5. Execute as: Me (your account)
 * 6. Who has access: Anyone
 * 7. Click Deploy, then copy the Web app URL
 * 8. Paste that URL into your .env file as VITE_APPS_SCRIPT_URL
 */

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var data = payload.data || {};
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    var result;
    switch (action) {
      case "addProduct":
        result = addProduct(ss, data);
        break;
      case "addOrder":
        result = addOrder(ss, data);
        break;
      case "updateOrderStatus":
        result = updateOrderStatus(ss, data);
        break;
      case "syncMissingProducts":
        result = syncMissingProducts(ss);
        break;
      case "updateOrderComments":
        result = updateOrderComments(ss, data);
        break;
      default:
        result = { success: false, error: "Unknown action: " + action };
    }

    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
      ContentService.MimeType.JSON
    );
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function getSheetByGid(ss, gid) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === gid) {
      return sheets[i];
    }
  }
  return null;
}

// GIDs matching the app's env vars
var PRODUCTS_GID = 1497265723;
var ORDERS_GID = 75015255;

function addProduct(ss, data) {
  var sheet = getSheetByGid(ss, PRODUCTS_GID);
  if (!sheet) return { success: false, error: "Products sheet not found" };

  // Headers: מוצר | מקט דרמלוסופי | ברקוד
  sheet.appendRow([data.name || "", data.sku || "", data.barcode || ""]);
  return { success: true };
}

function addOrder(ss, data) {
  var sheet = getSheetByGid(ss, ORDERS_GID);
  if (!sheet) return { success: false, error: "Orders sheet not found" };

  // Headers: תאריך הזמנה | מק"ט פאר-פארם | קוד דרמה | כמות סה"כ | שם פריט | התקבל | תאריך צפי | לוג
  sheet.appendRow([
    data.orderDate || "",
    data.supplierSku || "",
    data.dermaSku || "",
    data.quantity || "",
    data.productName || "",
    "", // received - empty by default
    data.expectedDate || "",
    data.log || "",
  ]);
  return { success: true };
}

function updateOrderStatus(ss, data) {
  var sheet = getSheetByGid(ss, ORDERS_GID);
  if (!sheet) return { success: false, error: "Orders sheet not found" };

  var rowIndex = data.rowIndex; // 1-based row number in the sheet
  if (!rowIndex || rowIndex < 2)
    return { success: false, error: "Invalid row index" };

  // Find the "התקבל" column
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var receivedCol = -1;
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].toString().indexOf("התקבל") !== -1) {
      receivedCol = i + 1; // 1-based
      break;
    }
  }
  if (receivedCol === -1)
    return { success: false, error: "Column התקבל not found" };

  var newValue = data.received ? "כן" : "";
  sheet.getRange(rowIndex, receivedCol).setValue(newValue);
  return { success: true };
}

function syncMissingProducts(ss) {
  var ordersSheet = getSheetByGid(ss, ORDERS_GID);
  var productsSheet = getSheetByGid(ss, PRODUCTS_GID);
  if (!ordersSheet || !productsSheet)
    return { success: false, error: "Sheet not found" };

  // Get all derma SKUs from orders
  var ordersData = ordersSheet.getDataRange().getValues();
  var ordersHeaders = ordersData[0];

  // Find derma SKU and product name columns in orders
  var dermaCol = -1;
  var nameCol = -1;
  for (var i = 0; i < ordersHeaders.length; i++) {
    var h = ordersHeaders[i].toString();
    if (h.indexOf("קוד") !== -1 && h.indexOf("דרמה") !== -1) dermaCol = i;
    if (h.indexOf("שם פריט") !== -1) nameCol = i;
  }
  if (dermaCol === -1)
    return { success: false, error: "Derma SKU column not found in orders" };

  // Get existing product SKUs
  var productsData = productsSheet.getDataRange().getValues();
  var productsHeaders = productsData[0];
  var prodSkuCol = -1;
  for (var j = 0; j < productsHeaders.length; j++) {
    if (productsHeaders[j].toString().indexOf("דרמלוסופי") !== -1) {
      prodSkuCol = j;
      break;
    }
  }
  if (prodSkuCol === -1)
    return {
      success: false,
      error: "SKU column not found in products",
    };

  var existingSkus = {};
  for (var k = 1; k < productsData.length; k++) {
    var sku = productsData[k][prodSkuCol].toString().trim();
    if (sku) existingSkus[sku] = true;
  }

  // Find missing SKUs from orders
  var added = 0;
  var seenSkus = {};
  for (var m = 1; m < ordersData.length; m++) {
    var orderSku = ordersData[m][dermaCol].toString().trim();
    var orderName = nameCol !== -1 ? ordersData[m][nameCol].toString().trim() : "";
    if (orderSku && !existingSkus[orderSku] && !seenSkus[orderSku]) {
      seenSkus[orderSku] = true;
      productsSheet.appendRow([orderName, orderSku, ""]);
      added++;
    }
  }

  return { success: true, added: added };
}

function updateOrderComments(ss, data) {
  var sheet = getSheetByGid(ss, ORDERS_GID);
  if (!sheet) return { success: false, error: "Orders sheet not found" };

  var rowIndex = data.rowIndex;
  if (!rowIndex || rowIndex < 2)
    return { success: false, error: "Invalid row index" };

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var logCol = -1;
  // Try exact match first for "לוג"
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].toString().trim() === "לוג") {
      logCol = i + 1;
      break;
    }
  }
  // Fallback to partial match if not found
  if (logCol === -1) {
    for (var i = 0; i < headers.length; i++) {
      if (headers[i].toString().indexOf("לוג") !== -1) {
        logCol = i + 1;
        break;
      }
    }
  }

  if (logCol === -1) {
    // Auto-create the column so the feature is self-bootstrapping
    logCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, logCol).setValue("לוג");
  }

  // Read existing value and append new comment
  var range = sheet.getRange(rowIndex, logCol);
  var existing = range.getValue().toString().trim();
  var newComment = data.comment || data.comments || "";

  if (!newComment) return { success: true }; // Nothing to add

  var finalValue = existing
    ? existing + " | " + newComment
    : newComment;

  range.setValue(finalValue);
  return { success: true };
}

// Required for CORS preflight
function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ status: "ok" })
  ).setMimeType(ContentService.MimeType.JSON);
}
