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
      case "bulkUpdateStock":
        result = bulkUpdateStock(ss, data);
        break;
      case "syncSupplierSkus":
        result = syncSupplierSkus(ss);
        break;
      case "bulkUpdateSupplierSkus":
        result = bulkUpdateSupplierSkus(ss, data);
        break;
      case "bulkUpdateMinAmounts":
        result = bulkUpdateMinAmounts(ss, data);
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
var PRODUCTS_GID = 1500898630;
var ORDERS_GID = 75015255;

function addProduct(ss, data) {
  var sheet = getSheetByGid(ss, PRODUCTS_GID);
  if (!sheet) return { success: false, error: "Products sheet not found" };

  // Headers: פריט | שם פריט | ספק | מינימום | שיוך קבוע | יתרת מלאי
  sheet.appendRow([data.sku || "", data.name || "", data.manufacturer || "", "", "", ""]);
  return { success: true };
}

function addOrder(ss, data) {
  var sheet = getSheetByGid(ss, ORDERS_GID);
  if (!sheet) return { success: false, error: "Orders sheet not found" };

  // Read header row to find correct column positions
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var numCols = headers.length;

  // Map incoming data fields to sheet header names
  var fieldMapping = {
    "תאריך הזמנה": data.orderDate || "",
    "מק\"ט פאר-פארם": data.supplierSku || "",
    "כמות סה\"כ": data.quantity || "",
    "שם פריט": data.productName || "",
    "קוד דרמה": data.dermaSku || "",
    "תאריך צפי": data.expectedDate || "",
    "לוג": data.log || "",
    "מיכל": data.container || "",
  };

  // Build row array matching header positions
  var row = [];
  for (var i = 0; i < numCols; i++) {
    var header = headers[i].toString().trim();
    row.push(fieldMapping.hasOwnProperty(header) ? fieldMapping[header] : "");
  }

  sheet.appendRow(row);
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

  // Get existing product SKUs — find by header "פריט"
  var productsData = productsSheet.getDataRange().getValues();
  var productsHeaders = productsData[0];
  var prodSkuCol = -1;
  for (var j = 0; j < productsHeaders.length; j++) {
    if (productsHeaders[j].toString().trim() === "פריט") {
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
      // New column order: פריט | שם פריט | ספק | מינימום | שיוך קבוע | יתרת מלאי
      productsSheet.appendRow([orderSku, orderName, "", "", "", ""]);
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

function bulkUpdateStock(ss, data) {
  var sheet = getSheetByGid(ss, PRODUCTS_GID);
  if (!sheet) return { success: false, error: "Products sheet not found" };

  var items = data.items;
  if (!items || !items.length) return { success: false, error: "No items provided" };

  var allData = sheet.getDataRange().getValues();
  var headers = allData[0];

  // Find SKU ("פריט") and stock ("יתרת מלאי") columns
  var skuCol = -1;
  var stockCol = -1;
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i].toString().trim();
    if (h === "פריט") skuCol = i;
    if (h === "יתרת מלאי") stockCol = i;
  }
  if (skuCol === -1) return { success: false, error: "SKU column (פריט) not found" };
  if (stockCol === -1) return { success: false, error: "Stock column (יתרת מלאי) not found" };

  // Build SKU → row index map (1-based sheet rows)
  var skuToRow = {};
  for (var r = 1; r < allData.length; r++) {
    var sku = allData[r][skuCol].toString().trim();
    if (sku) skuToRow[sku] = r + 1; // +1 because sheet rows are 1-based and row 0 is header
  }

  var updated = 0;
  var notFound = [];
  for (var j = 0; j < items.length; j++) {
    var itemSku = items[j].sku.toString().trim();
    var qty = items[j].qty;
    var row = skuToRow[itemSku];
    if (row) {
      sheet.getRange(row, stockCol + 1).setValue(qty); // +1 for 1-based column
      updated++;
    } else {
      notFound.push(itemSku);
    }
  }

  return { success: true, updated: updated, notFound: notFound };
}

/**
 * Reads מק"ט פאר פארם from the Orders sheet and writes it into the Products sheet.
 * Creates the column if it doesn't exist. Updates existing values.
 */
function syncSupplierSkus(ss) {
  var ordersSheet = getSheetByGid(ss, ORDERS_GID);
  var productsSheet = getSheetByGid(ss, PRODUCTS_GID);
  if (!ordersSheet || !productsSheet)
    return { success: false, error: "Sheet not found" };

  // --- Read orders to build dermaSku → supplierSku map ---
  var ordersData = ordersSheet.getDataRange().getValues();
  var ordersHeaders = ordersData[0];

  var dermaCol = -1;
  var supplierSkuCol = -1;
  for (var i = 0; i < ordersHeaders.length; i++) {
    var h = ordersHeaders[i].toString().trim();
    if (h.indexOf("קוד") !== -1 && h.indexOf("דרמה") !== -1) dermaCol = i;
    if (h.indexOf("פאר") !== -1 && h.indexOf("פארם") !== -1) supplierSkuCol = i;
  }
  if (dermaCol === -1) return { success: false, error: "Derma SKU column not found in orders" };
  if (supplierSkuCol === -1) return { success: false, error: "Supplier SKU (מק\"ט פאר פארם) column not found in orders" };

  // Build map: dermaSku → supplierSku (last non-empty value wins)
  var skuMap = {};
  for (var r = 1; r < ordersData.length; r++) {
    var dsku = ordersData[r][dermaCol].toString().trim();
    var ssku = ordersData[r][supplierSkuCol].toString().trim();
    if (dsku && ssku) {
      skuMap[dsku] = ssku;
    }
  }

  // --- Find or create the column in Products ---
  var productsData = productsSheet.getDataRange().getValues();
  var productsHeaders = productsData[0];

  // Find SKU column (פריט)
  var prodSkuCol = -1;
  for (var j = 0; j < productsHeaders.length; j++) {
    var ph = productsHeaders[j].toString().trim();
    if (ph === "פריט") prodSkuCol = j;
  }
  if (prodSkuCol === -1) return { success: false, error: "SKU column (פריט) not found in products" };

  // Find or create מק"ט פאר פארם column
  var peerFarmCol = -1;
  for (var k = 0; k < productsHeaders.length; k++) {
    var hdr = productsHeaders[k].toString().trim();
    if (hdr.indexOf("פאר") !== -1 && hdr.indexOf("פארם") !== -1) {
      peerFarmCol = k;
      break;
    }
  }
  if (peerFarmCol === -1) {
    // Create new column
    peerFarmCol = productsSheet.getLastColumn(); // 0-based index for new column
    productsSheet.getRange(1, peerFarmCol + 1).setValue("מק\"ט פאר פארם");
    // Re-read data to include new column
    productsData = productsSheet.getDataRange().getValues();
  }

  // --- Write supplier SKUs ---
  var updated = 0;
  for (var m = 1; m < productsData.length; m++) {
    var productSku = productsData[m][prodSkuCol].toString().trim();
    if (productSku && skuMap[productSku]) {
      var currentVal = productsData[m][peerFarmCol] ? productsData[m][peerFarmCol].toString().trim() : "";
      if (currentVal !== skuMap[productSku]) {
        productsSheet.getRange(m + 1, peerFarmCol + 1).setValue(skuMap[productSku]);
        updated++;
      }
    }
  }

  return { success: true, updated: updated };
}

/**
 * Bulk update מק"ט פאר פארם in the Products sheet from a provided mapping array.
 * data.items = [{dermaSku, supplierSku}, ...]
 */
function bulkUpdateSupplierSkus(ss, data) {
  var sheet = getSheetByGid(ss, PRODUCTS_GID);
  if (!sheet) return { success: false, error: "Products sheet not found" };

  var items = data.items;
  if (!items || !items.length) return { success: false, error: "No items provided" };

  var allData = sheet.getDataRange().getValues();
  var headers = allData[0];

  // Find SKU column (פריט)
  var skuCol = -1;
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].toString().trim() === "פריט") { skuCol = i; break; }
  }
  if (skuCol === -1) return { success: false, error: "SKU column (פריט) not found" };

  // Find or create מק"ט פאר פארם column
  var supplierCol = -1;
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i].toString().trim();
    if (h.indexOf("פאר") !== -1 && h.indexOf("פארם") !== -1) { supplierCol = i; break; }
  }
  if (supplierCol === -1) {
    supplierCol = sheet.getLastColumn(); // 0-based index for new col
    sheet.getRange(1, supplierCol + 1).setValue("מק\"ט פאר פארם");
    allData = sheet.getDataRange().getValues();
  }

  // Build dermaSku → row index map
  var skuToRow = {};
  for (var r = 1; r < allData.length; r++) {
    var sku = allData[r][skuCol].toString().trim();
    if (sku) skuToRow[sku] = r + 1; // 1-based sheet row
  }

  var updated = 0;
  var notFound = [];
  for (var j = 0; j < items.length; j++) {
    var dermaSku = items[j].dermaSku.toString().trim();
    var supplierSku = items[j].supplierSku.toString().trim();
    var row = skuToRow[dermaSku];
    if (row) {
      sheet.getRange(row, supplierCol + 1).setValue(supplierSku);
      updated++;
    } else {
      notFound.push(dermaSku);
    }
  }

  return { success: true, updated: updated, notFound: notFound };
}

/**
 * Bulk update מינימום (min amount) in the Products sheet.
 * data.items = [{sku, minAmount}, ...]
 */
function bulkUpdateMinAmounts(ss, data) {
  var sheet = getSheetByGid(ss, PRODUCTS_GID);
  if (!sheet) return { success: false, error: "Products sheet not found" };

  var items = data.items;
  if (!items || !items.length) return { success: false, error: "No items provided" };

  var allData = sheet.getDataRange().getValues();
  var headers = allData[0];

  // Find SKU ("פריט") and min amount ("מינימום") columns
  var skuCol = -1;
  var minCol = -1;
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i].toString().trim();
    if (h === "פריט") skuCol = i;
    if (h === "מינימום") minCol = i;
  }
  if (skuCol === -1) return { success: false, error: "SKU column (פריט) not found" };
  if (minCol === -1) return { success: false, error: "Min amount column (מינימום) not found" };

  // Build SKU → row index map (1-based sheet rows)
  var skuToRow = {};
  for (var r = 1; r < allData.length; r++) {
    var sku = allData[r][skuCol].toString().trim();
    if (sku) skuToRow[sku] = r + 1;
  }

  var updated = 0;
  var notFound = [];
  for (var j = 0; j < items.length; j++) {
    var itemSku = items[j].sku.toString().trim();
    var minAmt = items[j].minAmount;
    var row = skuToRow[itemSku];
    if (row) {
      sheet.getRange(row, minCol + 1).setValue(minAmt);
      updated++;
    } else {
      notFound.push(itemSku);
    }
  }

  return { success: true, updated: updated, notFound: notFound };
}

// Required for CORS preflight
function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ status: "ok" })
  ).setMimeType(ContentService.MimeType.JSON);
}
