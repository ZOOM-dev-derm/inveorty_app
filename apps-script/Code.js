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
      case "sendFollowUp":
        result = sendFollowUp(ss, data);
        break;
      case "sendDailyOrderEmail":
        result = sendDailyOrderEmail(ss, data);
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
    "חלוקה+הערות": data.distributionNotes || "",
    "אריזות ומדבקות": data.packagingLabels || "",
    "פורמולה": data.formula || "",
    "תכולה": data.content || "",
  };

  // Build row array matching header positions
  var row = [];
  for (var i = 0; i < numCols; i++) {
    var header = headers[i].toString().trim();
    row.push(fieldMapping.hasOwnProperty(header) ? fieldMapping[header] : "");
  }

  sheet.appendRow(row);

  // Per-order email removed — consolidated daily email sent via sendDailyOrderEmail action

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

// ── Email Integration (Peer Pharm / פאר פארם) ──

/**
 * Builds an RTL HTML email body with order details table.
 */
function buildOrderEmailHtml(data) {
  var rows = [
    ["שם פריט", data.productName || ""],
    ["מק\"ט דרמה", data.dermaSku || ""],
    ["מק\"ט פאר פארם", data.supplierSku || ""],
    ["כמות", data.quantity || ""],
    ["תאריך הזמנה", data.orderDate || ""],
    ["תאריך צפי", data.expectedDate || ""],
    ["מיכל", data.container || ""],
  ];

  var tableRows = rows
    .filter(function (r) { return r[1]; })
    .map(function (r) {
      return '<tr><td style="padding:8px 12px;border:1px solid #ddd;font-weight:bold;background:#f9f9f9;">' +
        r[0] + '</td><td style="padding:8px 12px;border:1px solid #ddd;">' + r[1] + '</td></tr>';
    })
    .join("");

  return '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;color:#333;">' +
    '<p>שלום רב,</p>' +
    '<p>נא לאשר קבלת ההזמנה הבאה:</p>' +
    '<table dir="rtl" style="border-collapse:collapse;margin:16px 0;width:100%;max-width:500px;">' +
    tableRows +
    '</table>' +
    '<p>תודה,<br>Dermalusophy</p>' +
    '</div>';
}

/**
 * Sends an order email to the supplier.
 * Silent no-op if SUPPLIER_EMAIL is not configured.
 */
function sendOrderEmail(data) {
  var props = PropertiesService.getScriptProperties();
  var supplierEmail = props.getProperty("SUPPLIER_EMAIL");
  if (!supplierEmail) return;

  var orderTag = "[DL-" + (data.dermaSku || "0000") + "--" + (data.orderDate || "unknown") + "]";
  var subject = "הזמנה Dermalusophy " + orderTag + " - " + (data.productName || "");
  var htmlBody = buildOrderEmailHtml(data);

  MailApp.sendEmail({ to: supplierEmail, subject: subject, htmlBody: htmlBody });
}

/**
 * Sends a follow-up email for an existing order.
 * Tries to reply to the original thread; falls back to a new email.
 * Auto-logs to the order's לוג column.
 */
function sendFollowUp(ss, data) {
  var props = PropertiesService.getScriptProperties();
  var supplierEmail = props.getProperty("SUPPLIER_EMAIL");
  if (!supplierEmail) return { success: false, error: "SUPPLIER_EMAIL not configured in Script Properties" };

  var orderTag = "[DL-" + (data.dermaSku || "0000") + "--" + (data.orderDate || "unknown") + "]";
  var subject = "מעקב הזמנה Dermalusophy " + orderTag + " - " + (data.productName || "");

  var htmlBody = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;color:#333;">' +
    '<p>שלום רב,</p>' +
    '<p>אשמח לעדכון לגבי ההזמנה הבאה:</p>' +
    buildOrderEmailHtml(data) +
    '</div>';

  // Try to find existing thread to reply to
  try {
    var threads = GmailApp.search('subject:"' + orderTag + '"', 0, 1);
    if (threads.length > 0) {
      threads[0].reply("", { htmlBody: htmlBody });
    } else {
      MailApp.sendEmail({ to: supplierEmail, subject: subject, htmlBody: htmlBody });
    }
  } catch (e) {
    // Fallback to MailApp if GmailApp not authorized
    MailApp.sendEmail({ to: supplierEmail, subject: subject, htmlBody: htmlBody });
  }

  // Auto-log the follow-up to the order's לוג column
  if (data.rowIndex) {
    var today = new Date();
    var dateStr = Utilities.formatDate(today, "Asia/Jerusalem", "dd/MM/yyyy HH:mm");
    var logEntry = dateStr + ": נשלח מייל מעקב לספק";
    try {
      updateOrderComments(ss, { rowIndex: data.rowIndex, comment: logEntry });
    } catch (e) {
      Logger.log("Failed to log follow-up: " + e);
    }
  }

  return { success: true };
}

// ── Consolidated Daily Order Email with Excel ──

/**
 * Sends a consolidated email with an Excel attachment containing all orders from a given date.
 * Replaces per-order emails — called once after a batch of orders is submitted.
 */
function sendDailyOrderEmail(ss, data) {
  var props = PropertiesService.getScriptProperties();
  var supplierEmail = props.getProperty("SUPPLIER_EMAIL");
  if (!supplierEmail) return { success: false, error: "SUPPLIER_EMAIL not configured in Script Properties" };

  var orderDate = data.orderDate || "";
  if (!orderDate) return { success: false, error: "orderDate is required" };

  var sheet = getSheetByGid(ss, ORDERS_GID);
  if (!sheet) return { success: false, error: "Orders sheet not found" };

  // Read all data
  var allData = sheet.getDataRange().getValues();
  if (allData.length < 2) return { success: false, error: "No orders found" };

  var headers = allData[0].map(function(h) { return h.toString().trim(); });

  // Find the order date column
  var dateColIdx = -1;
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].indexOf("תאריך הזמנה") !== -1) { dateColIdx = i; break; }
  }
  if (dateColIdx === -1) return { success: false, error: "תאריך הזמנה column not found" };

  // Filter rows matching the given order date
  // Google Sheets may return Date objects or strings — normalize both to DD/MM/YYYY
  function formatCellDate(val) {
    if (val instanceof Date && !isNaN(val.getTime())) {
      return Utilities.formatDate(val, "Asia/Jerusalem", "dd/MM/yyyy");
    }
    return val.toString().trim();
  }

  var matchingRows = [];
  for (var r = 1; r < allData.length; r++) {
    var cellDate = formatCellDate(allData[r][dateColIdx]);
    if (cellDate === orderDate) {
      matchingRows.push(allData[r]);
    }
  }

  if (matchingRows.length === 0) return { success: false, error: "No orders found for date " + orderDate };

  // ── Build Products lookup to fill missing columns ──
  var productsSheet = getSheetByGid(ss, PRODUCTS_GID);
  var productLookup = {}; // dermaSku → { header: value, ... }
  if (productsSheet) {
    var prodData = productsSheet.getDataRange().getValues();
    if (prodData.length > 1) {
      var prodHeaders = prodData[0].map(function(h) { return h.toString().trim(); });
      // Find the SKU column (פריט, not שם פריט)
      var prodSkuCol = -1;
      for (var pi = 0; pi < prodHeaders.length; pi++) {
        if (prodHeaders[pi] === "פריט") { prodSkuCol = pi; break; }
      }
      if (prodSkuCol === -1) {
        for (var pi2 = 0; pi2 < prodHeaders.length; pi2++) {
          if (prodHeaders[pi2].indexOf("פריט") !== -1 && prodHeaders[pi2].indexOf("שם") === -1) { prodSkuCol = pi2; break; }
        }
      }
      if (prodSkuCol !== -1) {
        for (var pr = 1; pr < prodData.length; pr++) {
          var pSku = prodData[pr][prodSkuCol].toString().trim();
          if (pSku) {
            var pRow = {};
            for (var ph = 0; ph < prodHeaders.length; ph++) {
              var val = prodData[pr][ph];
              pRow[prodHeaders[ph]] = (val instanceof Date && !isNaN(val.getTime()))
                ? Utilities.formatDate(val, "Asia/Jerusalem", "dd/MM/yyyy")
                : (val || "").toString().trim();
            }
            productLookup[pSku] = pRow;
          }
        }
      }
    }
  }

  // Excel column order as specified
  var excelHeaders = [
    "תאריך הזמנה", "מק\"ט פאר-פארם", "כמות סה\"כ", "מיכל", "תכולה",
    "שם פריט", "פורמולה", "קוד דרמה", "חלוקה+הערות",
    "אריזות ומדבקות", "בקבוקים", "לוג"
  ];

  // Map each excel header to the Orders sheet column index (fuzzy match)
  var colMapping = [];
  for (var e = 0; e < excelHeaders.length; e++) {
    var target = excelHeaders[e];
    var found = -1;
    for (var c = 0; c < headers.length; c++) {
      if (headers[c] === target) { found = c; break; }
    }
    if (found === -1) {
      for (var c2 = 0; c2 < headers.length; c2++) {
        if (headers[c2].indexOf(target) !== -1 || target.indexOf(headers[c2]) !== -1) { found = c2; break; }
      }
    }
    colMapping.push(found);
  }

  // Find dermaSku column index in orders for product lookup
  var dermaSkuColIdx = -1;
  for (var di = 0; di < headers.length; di++) {
    if (headers[di].indexOf("קוד") !== -1 && headers[di].indexOf("דרמה") !== -1) { dermaSkuColIdx = di; break; }
  }

  // Build SKU → product name map for container name resolution
  // (מיכל column stores a container product SKU like 994644, we want its name)
  var productNameBySku = {};
  if (productsSheet) {
    var prodNameCol = -1;
    var prodData2 = productsSheet.getDataRange().getValues();
    var prodHeaders2 = prodData2[0];
    var prodSkuCol2 = -1;
    for (var pn = 0; pn < prodHeaders2.length; pn++) {
      var ph2 = prodHeaders2[pn].toString().trim();
      if (ph2 === "פריט") prodSkuCol2 = pn;
      if (ph2 === "שם פריט" || (ph2.indexOf("שם") !== -1 && ph2.indexOf("פריט") !== -1)) prodNameCol = pn;
    }
    if (prodSkuCol2 !== -1 && prodNameCol !== -1) {
      for (var pnr = 1; pnr < prodData2.length; pnr++) {
        var pnSku = prodData2[pnr][prodSkuCol2].toString().trim();
        var pnName = prodData2[pnr][prodNameCol].toString().trim();
        if (pnSku && pnName) productNameBySku[pnSku] = pnName;
      }
    }
  }

  // Build previous-order lookup: dermaSku → most recent order row (for filling empty fields)
  // Scan ALL orders (not just today's), keep the last (most recent) row per dermaSku
  var prevOrderLookup = {}; // dermaSku → { headerName: value, ... }
  if (dermaSkuColIdx !== -1) {
    for (var po = 1; po < allData.length; po++) {
      var poSku = allData[po][dermaSkuColIdx].toString().trim();
      if (!poSku) continue;
      var poRow = {};
      for (var ph3 = 0; ph3 < headers.length; ph3++) {
        var pVal = allData[po][ph3];
        poRow[headers[ph3]] = (pVal instanceof Date && !isNaN(pVal.getTime()))
          ? Utilities.formatDate(pVal, "Asia/Jerusalem", "dd/MM/yyyy")
          : (pVal || "").toString().trim();
      }
      // Only update if this row has more non-empty fields (prefer richer data)
      if (!prevOrderLookup[poSku]) {
        prevOrderLookup[poSku] = poRow;
      } else {
        var existingFilled = 0, newFilled = 0;
        for (var ek in poRow) { if (poRow[ek]) newFilled++; }
        for (var ek2 in prevOrderLookup[poSku]) { if (prevOrderLookup[poSku][ek2]) existingFilled++; }
        if (newFilled > existingFilled) prevOrderLookup[poSku] = poRow;
      }
    }
  }

  // Build data rows — format dates, resolve container names, fill from prev orders & Products
  var excelData = [excelHeaders];
  for (var m = 0; m < matchingRows.length; m++) {
    var orderRow = matchingRows[m];
    var dermaSku = dermaSkuColIdx !== -1 ? orderRow[dermaSkuColIdx].toString().trim() : "";
    var product = productLookup[dermaSku] || {};
    var prevOrder = prevOrderLookup[dermaSku] || {};

    var row = [];
    for (var col = 0; col < excelHeaders.length; col++) {
      var cellVal = "";
      var headerName = excelHeaders[col];

      // 1. Try current order row first
      if (colMapping[col] !== -1) {
        var raw = orderRow[colMapping[col]];
        cellVal = (raw instanceof Date && !isNaN(raw.getTime()))
          ? Utilities.formatDate(raw, "Asia/Jerusalem", "dd/MM/yyyy")
          : (raw || "").toString();
      }

      // For מיכל: resolve SKU code to product name
      if (headerName === "מיכל" && cellVal.trim()) {
        var containerName = productNameBySku[cellVal.trim()];
        if (containerName) cellVal = containerName;
      }

      // For שם פריט: prefer the Peer Pharm name from previous orders
      if (headerName === "שם פריט" && prevOrder["שם פריט"]) {
        cellVal = prevOrder["שם פריט"];
      }

      // 2. If empty, try previous orders for same dermaSku
      if (!cellVal.trim() && dermaSku && prevOrder[headerName]) {
        cellVal = prevOrder[headerName];
        // Resolve container name if needed
        if (headerName === "מיכל") {
          var cn3 = productNameBySku[cellVal.trim()];
          if (cn3) cellVal = cn3;
        }
      }

      // 3. If still empty, try Products sheet
      if (!cellVal.trim() && dermaSku) {
        if (product[headerName]) {
          cellVal = product[headerName];
        } else {
          for (var pk in product) {
            if (product.hasOwnProperty(pk) && product[pk] &&
                (pk.indexOf(headerName) !== -1 || headerName.indexOf(pk) !== -1)) {
              cellVal = product[pk];
              break;
            }
          }
        }
        if (headerName === "מיכל" && cellVal.trim()) {
          var cn2 = productNameBySku[cellVal.trim()];
          if (cn2) cellVal = cn2;
        }
      }

      row.push(cellVal);
    }
    excelData.push(row);
  }

  // Build CSV content for attachment
  var csvLines = excelData.map(function(row) {
    return row.map(function(cell) {
      var s = cell.toString();
      if (s.indexOf(",") !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(",");
  });
  var csvContent = "\uFEFF" + csvLines.join("\r\n"); // BOM for Excel Hebrew support
  var csvBlob = Utilities.newBlob(csvContent, "text/csv", "Dermalusophy_Orders_" + orderDate.replace(/\//g, "-") + ".csv");

  // Build email HTML body with summary and inline table
  var tableRows = "";
  for (var t = 0; t < matchingRows.length; t++) {
    var nameIdx = colMapping[5]; // שם פריט
    var qtyIdx = colMapping[2];  // כמות סה"כ
    var skuIdx = colMapping[7];  // קוד דרמה
    tableRows += '<tr><td style="padding:6px 10px;border:1px solid #ddd;">' +
      (nameIdx !== -1 ? matchingRows[t][nameIdx] || "" : "") + '</td><td style="padding:6px 10px;border:1px solid #ddd;">' +
      (skuIdx !== -1 ? matchingRows[t][skuIdx] || "" : "") + '</td><td style="padding:6px 10px;border:1px solid #ddd;">' +
      (qtyIdx !== -1 ? matchingRows[t][qtyIdx] || "" : "") + '</td></tr>';
  }

  var summaryHtml = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;color:#333;">' +
    '<p>שלום רב,</p>' +
    '<p>מצורפת טבלת הזמנות מתאריך <b>' + orderDate + '</b> (' + matchingRows.length + ' פריטים).</p>' +
    '<p>נא לאשר קבלת ההזמנה.</p>' +
    '<table dir="rtl" style="border-collapse:collapse;margin:16px 0;width:100%;max-width:600px;">' +
    '<tr><th style="padding:8px 10px;border:1px solid #ddd;background:#4472C4;color:#fff;">שם פריט</th>' +
    '<th style="padding:8px 10px;border:1px solid #ddd;background:#4472C4;color:#fff;">קוד דרמה</th>' +
    '<th style="padding:8px 10px;border:1px solid #ddd;background:#4472C4;color:#fff;">כמות</th></tr>' +
    tableRows + '</table>' +
    '<p>תודה,<br>Dermalusophy</p>' +
    '</div>';

  var subject = "הזמנות Dermalusophy - " + orderDate;

  MailApp.sendEmail({
    to: supplierEmail,
    subject: subject,
    htmlBody: summaryHtml,
    attachments: [csvBlob],
  });

  return { success: true, count: matchingRows.length };
}

// ── Gmail Polling + LLM Auto-logging ──

/**
 * Calls an LLM API to parse a supplier email reply into a concise Hebrew summary (plain text).
 * Used by the tagged-email flow. Supports Claude and OpenAI APIs.
 */
function callLlmPlainText(provider, apiKey, emailBody, subject) {
  var prompt = 'You are an assistant that extracts order status information from supplier email replies.\n' +
    'The supplier is פאר פארם (Peer Pharm). Their contact is Firas (פיראס) at operating2@peerpharm.com.\n' +
    'Emails are in Hebrew. Extract the key status update per product/SKU mentioned.\n\n' +
    'Common status keywords from this supplier:\n' +
    '- סופק = supplied/delivered\n' +
    '- בעבודה = in production\n' +
    '- תוקן = fixed/corrected\n' +
    '- בוצע מיון = sorting completed\n' +
    '- נמתין לקבלת = waiting to receive (components/labels)\n' +
    '- נייצר = will produce\n' +
    '- קיבלתי והכנסתי את ההזמנה = order received and entered\n' +
    '- הכל טופל = everything handled\n\n' +
    'Return ONLY a concise Hebrew summary (max 100 chars). Include SKU numbers if mentioned.\n' +
    'Examples: "סופק", "בעבודה, צפי שבוע הבא", "קיבלתי ההזמנה", "סופק 2338 יח, 316 לתיקון".\n\n' +
    'Subject: ' + subject + '\n\nEmail body:\n' + emailBody;

  var url, payload, headers;

  if (provider === "claude") {
    url = "https://api.anthropic.com/v1/messages";
    headers = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    };
    payload = {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }]
    };
  } else {
    // OpenAI
    url = "https://api.openai.com/v1/chat/completions";
    headers = {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey
    };
    payload = {
      model: "gpt-4o-mini",
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }]
    };
  }

  var response = UrlFetchApp.fetch(url, {
    method: "post",
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var json = JSON.parse(response.getContentText());

  if (provider === "claude") {
    return (json.content && json.content[0] && json.content[0].text) || "";
  } else {
    return (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || "";
  }
}

/**
 * Calls an LLM API to extract structured SKU-level status from a supplier email.
 * Returns an array of {sku, status, quantity, expectedDate, confirmed} objects.
 */
function callLlmStructured(provider, apiKey, emailBody, subject) {
  var today = new Date();
  var todayStr = Utilities.formatDate(today, "Asia/Jerusalem", "dd/MM/yyyy");

  var prompt = 'You parse supplier emails from פאר פארם about cosmetics orders.\n' +
    'Extract every product SKU mentioned with its status.\n' +
    'Return ONLY a JSON array (no markdown, no explanation).\n' +
    'Today\'s date: ' + todayStr + '\n\n' +
    'Each item: {"sku":"string","status":"string","quantity":number|null,"expectedDate":"DD/MM/YYYY"|null,"confirmed":boolean}\n\n' +
    'Rules:\n' +
    '- sku = numeric product code (the supplier\'s SKU number)\n' +
    '- status = concise Hebrew: סופק/בעבודה/נייצר/תוקן/ממתין etc.\n' +
    '- quantity = number if explicitly stated, null otherwise\n' +
    '- expectedDate = resolve relative dates (שבוע הבא → +7d, שבועיים → +14d) to DD/MM/YYYY. null if none.\n' +
    '- confirmed = true only if explicitly confirms order receipt (קיבלתי/אושר/מאשר)\n\n' +
    'If the email has no order/production info, return [].\n\n' +
    'Subject: ' + subject + '\n\nEmail body:\n' + emailBody;

  var url, payload, headers;

  if (provider === "claude") {
    url = "https://api.anthropic.com/v1/messages";
    headers = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    };
    payload = {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }]
    };
  } else {
    url = "https://api.openai.com/v1/chat/completions";
    headers = {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey
    };
    payload = {
      model: "gpt-4o-mini",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }]
    };
  }

  var response = UrlFetchApp.fetch(url, {
    method: "post",
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var json = JSON.parse(response.getContentText());
  var raw;
  if (provider === "claude") {
    raw = (json.content && json.content[0] && json.content[0].text) || "[]";
  } else {
    raw = (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || "[]";
  }

  // Strip markdown fences if present
  raw = raw.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();

  try {
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    Logger.log("callLlmStructured: JSON parse failed: " + raw);
    return [];
  }
}

/**
 * Reads the orders sheet header row once and returns a map of 0-based column indices.
 */
function getOrdersColumnMap(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colMap = {
    supplierSku: -1,
    dermaSku: -1,
    received: -1,
    log: -1,
    expectedDate: -1,
    orderDate: -1
  };

  for (var i = 0; i < headers.length; i++) {
    var h = headers[i].toString().trim();
    if (h.indexOf("פאר") !== -1 && h.indexOf("פארם") !== -1) colMap.supplierSku = i;
    if (h.indexOf("קוד") !== -1 && h.indexOf("דרמה") !== -1) colMap.dermaSku = i;
    if (h.indexOf("התקבל") !== -1) colMap.received = i;
    if (h === "לוג" || (colMap.log === -1 && h.indexOf("לוג") !== -1)) colMap.log = i;
    if (h.indexOf("צפי") !== -1) colMap.expectedDate = i;
    if (h === "תאריך הזמנה" || h.indexOf("תאריך הזמנה") !== -1) colMap.orderDate = i;
  }

  return colMap;
}

/**
 * Builds an index of open orders by supplier SKU (and derma SKU as fallback).
 * Only includes rows where התקבל is not a "received" value.
 */
function buildSupplierSkuIndex(sheet, colMap) {
  var data = sheet.getDataRange().getValues();
  var receivedValues = ["כן", "v", "✓", "true", "yes"];
  var index = {};

  for (var r = 1; r < data.length; r++) {
    // Check if order is open (not received)
    var receivedVal = colMap.received !== -1 ? data[r][colMap.received].toString().trim().toLowerCase() : "";
    if (receivedValues.indexOf(receivedVal) !== -1) continue;

    var supplierSku = colMap.supplierSku !== -1 ? data[r][colMap.supplierSku].toString().trim() : "";
    var dermaSku = colMap.dermaSku !== -1 ? data[r][colMap.dermaSku].toString().trim() : "";

    var entry = { rowNum: r + 1, dermaSku: dermaSku, supplierSku: supplierSku };

    if (supplierSku) {
      if (!index[supplierSku]) index[supplierSku] = [];
      index[supplierSku].push(entry);
    }
    if (dermaSku) {
      var dermaKey = "derma_" + dermaSku;
      if (!index[dermaKey]) index[dermaKey] = [];
      index[dermaKey].push(entry);
    }
  }

  return index;
}

/**
 * Processes LLM-extracted items from a supplier email against open orders.
 * Matches by supplier SKU (primary) or derma SKU (fallback), writes log + expectedDate.
 */
function processSupplierEmail(sheet, colMap, skuIndex, items, emailDate) {
  var updated = 0;

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (!item.sku) continue;

    var sku = item.sku.toString().trim();
    var matches = skuIndex[sku] || skuIndex["derma_" + sku];
    if (!matches || matches.length === 0) {
      Logger.log("processSupplierEmail: no open order for SKU " + sku);
      continue;
    }

    // Build the log entry
    var statusText = item.confirmed ? "אושר ✓ " + (item.status || "") : (item.status || "");
    var logEntry = emailDate + ": [ספק] " + statusText;
    if (item.quantity != null) {
      logEntry += " - " + item.quantity + " יח'";
    }

    // Write to ALL matching open orders
    for (var m = 0; m < matches.length; m++) {
      var rowNum = matches[m].rowNum;

      // Deduplication: check if log already has this date + status
      if (colMap.log !== -1) {
        var existingLog = sheet.getRange(rowNum, colMap.log + 1).getValue().toString().trim();
        if (existingLog.indexOf(emailDate + ": [ספק] " + (item.status || "").substring(0, 10)) !== -1) {
          Logger.log("processSupplierEmail: skipping duplicate for row " + rowNum + " SKU " + sku);
          continue;
        }

        var finalLog = existingLog ? existingLog + " | " + logEntry : logEntry;
        sheet.getRange(rowNum, colMap.log + 1).setValue(finalLog);
      }

      // Update expected date if provided
      if (item.expectedDate && colMap.expectedDate !== -1) {
        sheet.getRange(rowNum, colMap.expectedDate + 1).setValue(item.expectedDate);
      }

      updated++;
      Logger.log("processSupplierEmail: updated row " + rowNum + " SKU " + sku + " → " + logEntry);
    }
  }

  return updated;
}

/**
 * Finds a matching order row by dermaSku + orderDate and appends a supplier reply summary to the לוג column.
 */
function appendSupplierReplyToLog(sheet, dermaSku, orderDate, parsedText) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Find derma SKU column
  var dermaCol = -1;
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i].toString();
    if (h.indexOf("קוד") !== -1 && h.indexOf("דרמה") !== -1) { dermaCol = i; break; }
  }

  // Find order date column
  var dateCol = -1;
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].toString().indexOf("תאריך הזמנה") !== -1) { dateCol = i; break; }
  }

  // Find לוג column
  var logCol = -1;
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].toString().trim() === "לוג") { logCol = i + 1; break; }
  }
  if (logCol === -1) {
    for (var i = 0; i < headers.length; i++) {
      if (headers[i].toString().indexOf("לוג") !== -1) { logCol = i + 1; break; }
    }
  }

  if (dermaCol === -1 || logCol === -1) {
    Logger.log("appendSupplierReplyToLog: required columns not found");
    return false;
  }

  var data = sheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    var rowSku = data[r][dermaCol].toString().trim();
    var rowDate = dateCol !== -1 ? data[r][dateCol].toString().trim() : "";

    if (rowSku === dermaSku && (dateCol === -1 || rowDate === orderDate)) {
      var range = sheet.getRange(r + 1, logCol);
      var existing = range.getValue().toString().trim();
      var today = new Date();
      var dateStr = Utilities.formatDate(today, "Asia/Jerusalem", "dd/MM/yyyy HH:mm");
      var entry = dateStr + ": [ספק] " + parsedText;
      var finalValue = existing ? existing + " | " + entry : entry;
      range.setValue(finalValue);
      return true;
    }
  }
  return false;
}

/**
 * Polls Gmail for unread supplier replies, parses them via LLM, and logs to matching orders.
 * Intended to run on a 15-minute time-based trigger.
 */
function pollSupplierReplies() {
  var props = PropertiesService.getScriptProperties();
  var supplierEmail = props.getProperty("SUPPLIER_EMAIL");
  var apiKey = props.getProperty("LLM_API_KEY");
  var provider = props.getProperty("LLM_PROVIDER") || "claude";

  if (!supplierEmail || !apiKey) {
    Logger.log("pollSupplierReplies: SUPPLIER_EMAIL or LLM_API_KEY not configured");
    return;
  }

  var threads = GmailApp.search("from:" + supplierEmail + " is:unread", 0, 20);
  if (threads.length === 0) return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getSheetByGid(ss, ORDERS_GID);
  if (!sheet) {
    Logger.log("pollSupplierReplies: Orders sheet not found");
    return;
  }

  // Build column map and SKU index once before the loop
  var colMap = getOrdersColumnMap(sheet);
  var skuIndex = buildSupplierSkuIndex(sheet, colMap);

  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();
    var lastMessage = messages[messages.length - 1];
    var subject = lastMessage.getSubject();
    var body = lastMessage.getPlainBody();
    var emailDate = Utilities.formatDate(lastMessage.getDate(), "Asia/Jerusalem", "dd/MM/yyyy");

    // Extract order tag [DL-{dermaSku}--{orderDate}]
    var tagMatch = subject.match(/\[DL-([^\]]+?)--([^\]]+?)\]/);

    try {
      if (tagMatch) {
        // Tagged flow: existing behavior
        var dermaSku = tagMatch[1];
        var orderDate = tagMatch[2];
        var parsed = callLlmPlainText(provider, apiKey, body, subject);
        if (parsed) {
          parsed = parsed.trim().substring(0, 100);
          appendSupplierReplyToLog(sheet, dermaSku, orderDate, parsed);
          Logger.log("pollSupplierReplies: logged tagged reply for DL-" + dermaSku + "--" + orderDate + ": " + parsed);
        }
      } else {
        // Untagged flow: extract SKUs via structured LLM call
        var items = callLlmStructured(provider, apiKey, body, subject);
        if (items.length > 0) {
          var count = processSupplierEmail(sheet, colMap, skuIndex, items, emailDate);
          Logger.log("pollSupplierReplies: untagged email processed, " + count + " orders updated. Subject: " + subject);
        } else {
          Logger.log("pollSupplierReplies: no SKUs extracted from untagged email: " + subject);
        }
      }
    } catch (e) {
      Logger.log("pollSupplierReplies: failed for " + subject + ": " + e);
    }

    threads[t].markRead();
  }

  props.setProperty("LAST_POLL_TIME", new Date().toISOString());
}

/**
 * Backfills order logs from recent supplier emails (last 30 days).
 * Run manually from the Apps Script editor. Non-destructive: does not mark emails as read.
 * Safety limit: max 50 LLM calls per run.
 */
function backfillFromEmails() {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty("LLM_API_KEY");
  var provider = props.getProperty("LLM_PROVIDER") || "claude";

  if (!apiKey) {
    Logger.log("backfillFromEmails: LLM_API_KEY not configured");
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getSheetByGid(ss, ORDERS_GID);
  if (!sheet) {
    Logger.log("backfillFromEmails: Orders sheet not found");
    return;
  }

  var colMap = getOrdersColumnMap(sheet);
  var skuIndex = buildSupplierSkuIndex(sheet, colMap);

  var threads = GmailApp.search("from:operating2@peerpharm.com newer_than:30d", 0, 50);
  Logger.log("backfillFromEmails: found " + threads.length + " threads");

  // Collect all messages, sorted chronologically (oldest first)
  var allMessages = [];
  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();
    for (var m = 0; m < messages.length; m++) {
      allMessages.push(messages[m]);
    }
  }
  allMessages.sort(function (a, b) { return a.getDate().getTime() - b.getDate().getTime(); });

  var llmCalls = 0;
  var totalUpdated = 0;

  for (var i = 0; i < allMessages.length && llmCalls < 50; i++) {
    var msg = allMessages[i];
    var subject = msg.getSubject();
    var body = msg.getPlainBody();

    // Skip tagged emails (already handled by pollSupplierReplies)
    if (/\[DL-/.test(subject)) continue;

    // Skip very short emails (empty/signature-only)
    if (!body || body.trim().length < 20) continue;

    var emailDate = Utilities.formatDate(msg.getDate(), "Asia/Jerusalem", "dd/MM/yyyy");

    try {
      var items = callLlmStructured(provider, apiKey, body, subject);
      llmCalls++;

      if (items.length > 0) {
        var count = processSupplierEmail(sheet, colMap, skuIndex, items, emailDate);
        totalUpdated += count;
        Logger.log("backfillFromEmails: " + emailDate + " — " + items.length + " SKUs extracted, " + count + " orders updated. Subject: " + subject);
      }
    } catch (e) {
      Logger.log("backfillFromEmails: LLM failed for " + subject + ": " + e);
      llmCalls++;
    }
  }

  Logger.log("backfillFromEmails: done. LLM calls: " + llmCalls + ", orders updated: " + totalUpdated);
}

/**
 * Run once from the Apps Script editor to create a 15-minute polling trigger.
 */
function setupPollTrigger() {
  // Remove existing triggers for this function
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "pollSupplierReplies") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger("pollSupplierReplies")
    .timeBased()
    .everyMinutes(15)
    .create();
  Logger.log("Poll trigger created: every 15 minutes");
}

// Required for CORS preflight
function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({ status: "ok" })
  ).setMimeType(ContentService.MimeType.JSON);
}
