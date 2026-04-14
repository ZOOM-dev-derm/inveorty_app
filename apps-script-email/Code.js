/**
 * Google Apps Script — Standalone Email Script for Dermalusophy
 *
 * This script handles ONLY email sending to suppliers.
 * It runs from the logistics@dermalosophy.co.il account so emails
 * are sent from the logistics address.
 *
 * Setup:
 * 1. Login to script.google.com as logistics@dermalosophy.co.il
 * 2. Create a new project, paste this code
 * 3. Set Script Properties: SUPPLIER_EMAIL = operating2@peerpharm.com
 * 4. Deploy → Web app (Execute as: Me, Access: Anyone)
 * 5. Copy the URL to .env as VITE_EMAIL_SCRIPT_URL
 */

var SPREADSHEET_ID = "1Cqr5SHHbH3MtCKU5h3GAShGG5NtpPA6LNCLNk16EH_Q";
var PRODUCTS_GID = 1500898630;
var ORDERS_GID = 75015255;

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var data = payload.data || {};
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    var result;
    switch (action) {
      case "sendFollowUp":
        result = sendFollowUp(ss, data);
        break;
      case "sendDailyOrderEmail":
        result = sendDailyOrderEmail(ss, data);
        break;
      case "sendFreeEmail":
        result = sendFreeEmail(data);
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

// ── Email HTML Builder ──

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

// ── Update Order Comments (for follow-up logging) ──

function updateOrderComments(ss, data) {
  var sheet = getSheetByGid(ss, ORDERS_GID);
  if (!sheet) return { success: false, error: "Orders sheet not found" };

  var rowIndex = data.rowIndex;
  if (!rowIndex || rowIndex < 2)
    return { success: false, error: "Invalid row index" };

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var logCol = -1;
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].toString().trim() === "לוג") {
      logCol = i + 1;
      break;
    }
  }
  if (logCol === -1) {
    for (var i = 0; i < headers.length; i++) {
      if (headers[i].toString().indexOf("לוג") !== -1) {
        logCol = i + 1;
        break;
      }
    }
  }

  if (logCol === -1) {
    logCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, logCol).setValue("לוג");
  }

  var range = sheet.getRange(rowIndex, logCol);
  var existing = range.getValue().toString().trim();
  var newComment = data.comment || data.comments || "";

  if (!newComment) return { success: true };

  var finalValue = existing
    ? existing + " | " + newComment
    : newComment;

  range.setValue(finalValue);
  return { success: true };
}

// ── Follow-Up Email ──

function sendFollowUp(ss, data) {
  var props = PropertiesService.getScriptProperties();
  var supplierEmail = props.getProperty("SUPPLIER_EMAIL");
  if (!supplierEmail) return { success: false, error: "SUPPLIER_EMAIL not configured in Script Properties" };

  var orderTag = "[DL-" + (data.dermaSku || "0000") + "--" + (data.orderDate || "unknown") + "]";
  var subject = "מעקב הזמנה Dermalusophy " + orderTag + " - " + (data.productName || "");

  var messageText = data.customMessage || "שלום רב,\nאשמח לעדכון לגבי ההזמנה הבאה.";
  var messageParagraphs = messageText.split("\n").map(function(line) {
    return "<p>" + line + "</p>";
  }).join("");

  var htmlBody = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;color:#333;">' +
    messageParagraphs +
    buildOrderEmailHtml(data) +
    '</div>';

  try {
    var threads = GmailApp.search('subject:"' + orderTag + '"', 0, 1);
    if (threads.length > 0) {
      threads[0].reply("", { htmlBody: htmlBody });
    } else {
      MailApp.sendEmail({ to: supplierEmail, subject: subject, htmlBody: htmlBody });
    }
  } catch (e) {
    MailApp.sendEmail({ to: supplierEmail, subject: subject, htmlBody: htmlBody });
  }

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

// ── Consolidated Daily Order Email ──

function sendDailyOrderEmail(ss, data) {
  var props = PropertiesService.getScriptProperties();
  var supplierEmail = props.getProperty("SUPPLIER_EMAIL");
  if (!supplierEmail) return { success: false, error: "SUPPLIER_EMAIL not configured in Script Properties" };

  var orderDate = data.orderDate || "";
  if (!orderDate) return { success: false, error: "orderDate is required" };

  if (data.editedRows && data.editedRows.length > 0) {
    return sendDailyOrderEmailFromEdited(supplierEmail, orderDate, data);
  }

  var sheet = getSheetByGid(ss, ORDERS_GID);
  if (!sheet) return { success: false, error: "Orders sheet not found" };

  var allData = sheet.getDataRange().getValues();
  if (allData.length < 2) return { success: false, error: "No orders found" };

  var headers = allData[0].map(function(h) { return h.toString().trim(); });

  var dateColIdx = -1;
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].indexOf("תאריך הזמנה") !== -1) { dateColIdx = i; break; }
  }
  if (dateColIdx === -1) return { success: false, error: "תאריך הזמנה column not found" };

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

  // Build Products lookup
  var productsSheet = getSheetByGid(ss, PRODUCTS_GID);
  var productLookup = {};
  if (productsSheet) {
    var prodData = productsSheet.getDataRange().getValues();
    if (prodData.length > 1) {
      var prodHeaders = prodData[0].map(function(h) { return h.toString().trim(); });
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

  var excelHeaders = [
    "תאריך הזמנה", "מק\"ט פאר-פארם", "כמות סה\"כ", "מיכל", "תכולה",
    "שם פריט", "פורמולה", "קוד דרמה", "חלוקה+הערות",
    "אריזות ומדבקות", "בקבוקים", "לוג"
  ];

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

  var dermaSkuColIdx = -1;
  for (var di = 0; di < headers.length; di++) {
    if (headers[di].indexOf("קוד") !== -1 && headers[di].indexOf("דרמה") !== -1) { dermaSkuColIdx = di; break; }
  }

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

  var prevOrderLookup = {};
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

      if (colMapping[col] !== -1) {
        var raw = orderRow[colMapping[col]];
        cellVal = (raw instanceof Date && !isNaN(raw.getTime()))
          ? Utilities.formatDate(raw, "Asia/Jerusalem", "dd/MM/yyyy")
          : (raw || "").toString();
      }

      if (headerName === "מיכל" && cellVal.trim()) {
        var containerName = productNameBySku[cellVal.trim()];
        if (containerName) cellVal = containerName;
      }

      if (headerName === "שם פריט" && prevOrder["שם פריט"]) {
        cellVal = prevOrder["שם פריט"];
      }

      if (!cellVal.trim() && dermaSku && prevOrder[headerName] && headerName !== "אריזות ומדבקות") {
        cellVal = prevOrder[headerName];
        if (headerName === "מיכל") {
          var cn3 = productNameBySku[cellVal.trim()];
          if (cn3) cellVal = cn3;
        }
      }

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

  var csvLines = excelData.map(function(row) {
    return row.map(function(cell) {
      var s = cell.toString();
      if (s.indexOf(",") !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(",");
  });
  var csvContent = "\uFEFF" + csvLines.join("\r\n");
  var csvBlob = Utilities.newBlob(csvContent, "text/csv", "Dermalusophy_Orders_" + orderDate.replace(/\//g, "-") + ".csv");

  var tableRows = "";
  for (var t = 0; t < matchingRows.length; t++) {
    var nameIdx = colMapping[5];
    var qtyIdx = colMapping[2];
    var skuIdx = colMapping[7];
    var pharmIdx = colMapping[1];
    tableRows += '<tr><td style="padding:6px 10px;border:1px solid #ddd;">' +
      (nameIdx !== -1 ? matchingRows[t][nameIdx] || "" : "") + '</td><td style="padding:6px 10px;border:1px solid #ddd;">' +
      (pharmIdx !== -1 ? matchingRows[t][pharmIdx] || "" : "") + '</td><td style="padding:6px 10px;border:1px solid #ddd;">' +
      (skuIdx !== -1 ? matchingRows[t][skuIdx] || "" : "") + '</td><td style="padding:6px 10px;border:1px solid #ddd;">' +
      (qtyIdx !== -1 ? matchingRows[t][qtyIdx] || "" : "") + '</td></tr>';
  }

  var messageText = data.customMessage || "שלום רב,\nמצורפת טבלת הזמנות מתאריך " + orderDate + " (" + matchingRows.length + " פריטים).\nנא לאשר קבלת ההזמנה.";
  var messageParagraphs = messageText.split("\n").map(function(line) {
    return "<p>" + line + "</p>";
  }).join("");

  var summaryHtml = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;color:#333;">' +
    messageParagraphs +
    '<table dir="rtl" style="border-collapse:collapse;margin:16px 0;width:100%;max-width:600px;">' +
    '<tr><th style="padding:8px 10px;border:1px solid #ddd;background:#4472C4;color:#fff;">שם פריט</th>' +
    '<th style="padding:8px 10px;border:1px solid #ddd;background:#4472C4;color:#fff;">מק"ט פאר פארם</th>' +
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

function sendDailyOrderEmailFromEdited(supplierEmail, orderDate, data) {
  var rows = data.editedRows;

  var excelHeaders = [
    "תאריך הזמנה", 'מק"ט פאר-פארם', 'כמות סה"כ', "מיכל", "תכולה",
    "שם פריט", "פורמולה", "קוד דרמה", "חלוקה+הערות"
  ];

  var excelData = [excelHeaders];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    excelData.push([
      orderDate,
      r.supplierSku || "",
      r.quantity || "",
      r.container || "",
      r.content || "",
      r.name || "",
      r.formula || "",
      r.sku || "",
      r.distributionNotes || ""
    ]);
  }

  var csvLines = excelData.map(function(row) {
    return row.map(function(cell) {
      var s = cell.toString();
      if (s.indexOf(",") !== -1 || s.indexOf('"') !== -1 || s.indexOf("\n") !== -1) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(",");
  });
  var csvContent = "\uFEFF" + csvLines.join("\r\n");
  var csvBlob = Utilities.newBlob(csvContent, "text/csv", "Dermalusophy_Orders_" + orderDate.replace(/\//g, "-") + ".csv");

  var tableRows = "";
  for (var t = 0; t < rows.length; t++) {
    tableRows += '<tr><td style="padding:6px 10px;border:1px solid #ddd;">' + (rows[t].name || "") +
      '</td><td style="padding:6px 10px;border:1px solid #ddd;">' + (rows[t].supplierSku || "") +
      '</td><td style="padding:6px 10px;border:1px solid #ddd;">' + (rows[t].sku || "") +
      '</td><td style="padding:6px 10px;border:1px solid #ddd;">' + (rows[t].quantity || "") + '</td></tr>';
  }

  var messageText = data.customMessage || "שלום רב,\nמצורפת טבלת הזמנות מתאריך " + orderDate + " (" + rows.length + " פריטים).\nנא לאשר קבלת ההזמנה.";
  var messageParagraphs = messageText.split("\n").map(function(line) {
    return "<p>" + line + "</p>";
  }).join("");

  var summaryHtml = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;color:#333;">' +
    messageParagraphs +
    '<table dir="rtl" style="border-collapse:collapse;margin:16px 0;width:100%;max-width:600px;">' +
    '<tr><th style="padding:8px 10px;border:1px solid #ddd;background:#4472C4;color:#fff;">שם פריט</th>' +
    '<th style="padding:8px 10px;border:1px solid #ddd;background:#4472C4;color:#fff;">מק"ט פאר פארם</th>' +
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

  return { success: true, count: rows.length };
}

// ── Free Email ──

function sendFreeEmail(data) {
  var props = PropertiesService.getScriptProperties();
  var supplierEmail = props.getProperty("SUPPLIER_EMAIL");
  if (!supplierEmail) return { success: false, error: "SUPPLIER_EMAIL not configured in Script Properties" };

  var subject = data.subject || "";
  if (!subject) return { success: false, error: "subject is required" };

  var bodyText = data.body || "";
  var bodyParagraphs = bodyText.split("\n").map(function(line) {
    return "<p>" + line + "</p>";
  }).join("");

  var htmlBody = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:14px;color:#333;">' +
    bodyParagraphs +
    '<p>תודה,<br>Dermalusophy</p>' +
    '</div>';

  MailApp.sendEmail({ to: supplierEmail, subject: subject, htmlBody: htmlBody });

  return { success: true };
}
