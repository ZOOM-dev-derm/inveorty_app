import * as XLSX from "xlsx";
import iconv from "iconv-lite";

export interface ComaxItem {
  item_code: string;
  inventory: number;
  product_name?: string;
  barcode?: string;
}

/**
 * Parse a Comax inventory report.
 * Comax sends reports in three possible formats:
 *   1. HTML disguised as .xls (windows-1255 encoded)
 *   2. Real Excel (.xls/.xlsx)
 *   3. Plain CSV (windows-1255 encoded)
 */
export function parseComaxReport(buffer: Buffer): ComaxItem[] {
  const head = buffer.subarray(0, 200).toString("ascii");
  // Check if it's HTML (Comax sends HTML disguised as .xls)
  if (head.includes("<meta") || head.includes("<TABLE") || head.includes("<html")) {
    return parseHtmlReport(buffer);
  }
  // Check if it looks like CSV (comma-separated text, not binary)
  if (looksLikeCsv(head)) {
    return parseCsvReport(buffer);
  }
  // Fallback: real Excel
  return parseExcelReport(buffer);
}

/** Parse HTML report with windows-1255 Hebrew encoding */
function parseHtmlReport(buffer: Buffer): ComaxItem[] {
  // Detect encoding from meta tag, default to windows-1255
  const asciiHead = buffer.subarray(0, 500).toString("ascii");
  const charsetMatch = asciiHead.match(/charset\s*=\s*([\w-]+)/i);
  const encoding = charsetMatch ? charsetMatch[1].replace("windows-", "win") : "win1255";

  const html = iconv.decode(buffer, encoding);

  // Extract header row to find column indices
  const headerMatch = html.match(/<TR>\s*(<TD[^>]*>.*?<\/TD>\s*)+<\/TR>/i);
  if (!headerMatch) {
    console.error("Comax parser: no header row found in HTML");
    return [];
  }

  const headerCells = extractCells(headerMatch[0]);
  let itemCodeCol = -1;
  let inventoryCol = -1;
  let productNameCol = -1;
  let barcodeCol = -1;

  for (let i = 0; i < headerCells.length; i++) {
    const h = headerCells[i];
    // "קוד פריט" or "פריט" but not "ברקוד פריט"
    if ((h.includes("קוד פריט") || h === "פריט") && !h.includes("ברקוד")) itemCodeCol = i;
    if (h.includes("כמות מלאי") || h.includes("יתרה נוכחית") || h.includes("יתרה במלאי")) inventoryCol = i;
    if (h.includes("שם פריט")) productNameCol = i;
    if (h.includes("ברקוד")) barcodeCol = i;
  }

  if (itemCodeCol === -1 || inventoryCol === -1) {
    console.error(
      "Comax parser: required columns not found in HTML. Headers:",
      headerCells
    );
    return [];
  }

  // Extract all data rows (rows with id=trN)
  const rowRegex = /<TR\s+id=tr\d+[^>]*>([\s\S]*?)<\/TR>/gi;
  const items: ComaxItem[] = [];

  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const cells = extractCells(match[0]);

    const rawCode = (cells[itemCodeCol] ?? "").trim();
    const rawInventory = (cells[inventoryCol] ?? "").trim();

    if (!rawCode || !rawInventory) continue;
    if (rawCode.includes('סה"כ') || rawCode.includes("סה״כ")) continue;

    const inventory = Number(rawInventory.replace(/,/g, ""));
    if (isNaN(inventory)) continue;

    items.push({
      item_code: rawCode,
      inventory,
      product_name:
        productNameCol >= 0
          ? (cells[productNameCol] ?? "").trim() || undefined
          : undefined,
      barcode:
        barcodeCol >= 0
          ? (cells[barcodeCol] ?? "").trim() || undefined
          : undefined,
    });
  }

  return items;
}

/** Extract text content from <TD> cells in a row */
function extractCells(rowHtml: string): string[] {
  const cells: string[] = [];
  const tdRegex = /<TD[^>]*>([\s\S]*?)<\/TD>/gi;
  let m;
  while ((m = tdRegex.exec(rowHtml)) !== null) {
    // Strip HTML tags and decode entities
    cells.push(
      m[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .trim()
    );
  }
  return cells;
}

/** Check if buffer content looks like CSV (text with commas, not binary) */
function looksLikeCsv(asciiHead: string): boolean {
  // CSV will be mostly printable chars with commas and newlines
  const printable = asciiHead.replace(/[^\x20-\x7E\r\n,]/g, "");
  return printable.length > asciiHead.length * 0.3 && asciiHead.includes(",");
}

/** Parse CSV report with windows-1255 Hebrew encoding */
function parseCsvReport(buffer: Buffer): ComaxItem[] {
  const text = iconv.decode(buffer, "win1255");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  let itemCodeCol = -1;
  let inventoryCol = -1;
  let productNameCol = -1;
  let barcodeCol = -1;

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if ((h.includes("קוד פריט") || h === "פריט") && !h.includes("ברקוד"))
      itemCodeCol = i;
    if (
      h.includes("כמות מלאי") ||
      h.includes("יתרה נוכחית") ||
      h.includes("יתרה במלאי")
    )
      inventoryCol = i;
    if (h.includes("שם פריט")) productNameCol = i;
    if (h.includes("ברקוד")) barcodeCol = i;
  }

  if (itemCodeCol === -1 || inventoryCol === -1) {
    console.error(
      "Comax parser: required columns not found in CSV. Headers:",
      headers
    );
    return [];
  }

  const items: ComaxItem[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    const rawCode = (cells[itemCodeCol] ?? "").trim();
    const rawInventory = (cells[inventoryCol] ?? "").trim();

    if (!rawCode || !rawInventory) continue;
    if (rawCode.includes('סה"כ') || rawCode.includes("סה״כ")) continue;

    const inventory = Number(rawInventory.replace(/,/g, ""));
    if (isNaN(inventory)) continue;

    items.push({
      item_code: rawCode,
      inventory,
      product_name:
        productNameCol >= 0
          ? (cells[productNameCol] ?? "").trim() || undefined
          : undefined,
      barcode:
        barcodeCol >= 0
          ? (cells[barcodeCol] ?? "").trim() || undefined
          : undefined,
    });
  }

  return items;
}

/** Fallback: parse a real Excel file */
function parseExcelReport(buffer: Buffer): ComaxItem[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
  });

  let itemCodeKey = "";
  let inventoryKey = "";
  let productNameKey = "";
  let barcodeKey = "";

  if (rows.length > 0) {
    const keys = Object.keys(rows[0]);
    for (const key of keys) {
      const k = key.trim();
      if ((k.includes("קוד פריט") || k === "פריט") && !k.includes("ברקוד")) itemCodeKey = key;
      if (k.includes("כמות מלאי") || k.includes("יתרה נוכחית") || k.includes("יתרה במלאי")) inventoryKey = key;
      if (k.includes("שם פריט")) productNameKey = key;
      if (k.includes("ברקוד")) barcodeKey = key;
    }
  }

  if (!itemCodeKey || !inventoryKey) {
    console.error(
      "Comax parser: required columns not found. Available:",
      rows.length > 0 ? Object.keys(rows[0]) : "no rows"
    );
    return [];
  }

  const items: ComaxItem[] = [];

  for (const row of rows) {
    const rawCode = String(row[itemCodeKey] ?? "").trim();
    const rawInventory = String(row[inventoryKey] ?? "").trim();

    if (!rawCode || !rawInventory) continue;
    if (rawCode.includes('סה"כ') || rawCode.includes("סה״כ")) continue;

    const inventory = Number(rawInventory.replace(/,/g, ""));
    if (isNaN(inventory)) continue;

    items.push({
      item_code: rawCode,
      inventory,
      product_name: productNameKey
        ? String(row[productNameKey] ?? "").trim() || undefined
        : undefined,
      barcode: barcodeKey
        ? String(row[barcodeKey] ?? "").trim() || undefined
        : undefined,
    });
  }

  return items;
}
