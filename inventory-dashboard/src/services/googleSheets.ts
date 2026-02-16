import Papa from "papaparse";
import type { InventoryItem, Product, Order, HistoryItem, MinAmountItem } from "@/types";

const SHEET_ID = import.meta.env.VITE_SHEET_ID;
const INVENTORY_GID = import.meta.env.VITE_INVENTORY_GID;
const ORDERS_GID = import.meta.env.VITE_ORDERS_GID;
const PRODUCTS_GID = import.meta.env.VITE_PRODUCTS_GID;
const HISTORY_GID = import.meta.env.VITE_HISTORY_GID;
const MIN_AMOUNT_GID = import.meta.env.VITE_MIN_AMOUNT_GID;

function parseDateString(dateStr: string): Date | null {
  // Try DD/MM/YYYY first (Israeli format)
  const ddmmyyyy = dateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  }
  // Fallback to ISO
  const iso = new Date(dateStr);
  return isNaN(iso.getTime()) ? null : iso;
}

function buildCsvUrl(gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
}

function parseCsv<T>(url: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<T>(url, {
      download: true,
      header: true,
      skipEmptyLines: true, // Keep true for other functions
      complete: (results) => resolve(results.data),
      error: (error: Error) => reject(error),
    });
  });
}
// ...
// Actually, let's try a safer approach:
// 1. Fetch with skipEmptyLines: false (so we get ALL rows)
// 2. But inside fetchOrders, we must be VERY careful with the raw data.
// 3. And limit the number of rows if it's crazy huge?

// Let's rethink. Use a different robust parsing method.
// We'll use skipEmptyLines: false but immediately filter and map safely.

function parseCsvWithIndex<T>(url: string): Promise<{ data: T; originalIndex: number }[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<T>(url, {
      download: true,
      header: true,
      skipEmptyLines: false, // Must be false to keep row indices correct
      complete: (results) => {
        const mapped = results.data.map((item, idx) => ({
          data: item,
          originalIndex: idx + 2
        }));
        resolve(mapped);
      },
      error: (error: Error) => reject(error),
    });
  });
}

export async function fetchInventory(): Promise<InventoryItem[]> {
  const raw = await parseCsv<Record<string, string>>(buildCsvUrl(INVENTORY_GID));
  return raw
    .filter((row) => row["מק\"ט דרמלוסופי"]?.trim())
    .map((row) => ({
      sku: row["מק\"ט דרמלוסופי"]?.trim() ?? "",
      quantity: parseInt(row["כמות"] ?? "0", 10) || 0,
    }));
}

export async function fetchProducts(): Promise<Product[]> {
  const raw = await parseCsv<Record<string, string>>(buildCsvUrl(PRODUCTS_GID));
  return raw
    .filter((row) => row["מקט דרמלוסופי"]?.trim())
    .map((row) => ({
      name: row["מוצר"]?.trim() ?? "",
      sku: row["מקט דרמלוסופי"]?.trim() ?? "",
      barcode: row["ברקוד"]?.trim() ?? "",
      warehouseQty: parseInt(row["כמות במחסן"] ?? "0", 10) || 0,
    }));
}

export async function fetchHistory(): Promise<HistoryItem[]> {
  const raw = await parseCsv<Record<string, string>>(buildCsvUrl(HISTORY_GID));
  return raw
    .filter((row) => row["מ\"קט דרמלוסופי"]?.trim())
    .map((row) => ({
      sku: row["מ\"קט דרמלוסופי"]?.trim() ?? "",
      quantity: parseInt(row["כמות"] ?? "0", 10) || 0,
      date: row["תאריך"]?.trim() ?? "",
    }))
    .filter((item) => item.date && item.sku);
}

export async function fetchMinAmount(): Promise<MinAmountItem[]> {
  const raw = await parseCsv<Record<string, string>>(buildCsvUrl(MIN_AMOUNT_GID));
  const firstRow = raw[0] ?? {};
  const cols = Object.keys(firstRow);
  const skuKey = cols.find((k) =>
    k.includes("דרמלוסופי")
  ) ?? "מק\"ט דרמלוסופי";
  const minAmountKey = cols.find((k) => k.includes("מינימום")) ?? "מלאי מינימום";
  console.debug("[fetchMinAmount] detected columns:", { skuKey, minAmountKey, allColumns: cols });
  return raw
    .filter((row) => row[skuKey]?.trim())
    .map((row) => ({
      sku: row[skuKey]?.trim() ?? "",
      minAmount: parseInt((row[minAmountKey] ?? "0").replace(/,/g, ""), 10) || 0,
    }))
    .filter((item) => item.minAmount > 0);
}

export async function fetchOrders(): Promise<Order[]> {
  const rawWithIndex = await parseCsvWithIndex<Record<string, string>>(buildCsvUrl(ORDERS_GID));

  if (rawWithIndex.length === 0) return [];

  // Use the first non-empty row to detect columns? 
  // Attempt to find a row with headers if possible, OR assumes PapaParse header:true worked and first row of file was headers.
  // rawWithIndex[0].data has keys.

  const firstDataRow = rawWithIndex[0]?.data ?? {};
  const cols = Object.keys(firstDataRow);
  console.debug("[fetchOrders] all columns:", cols);

  const dermaSkuKey = cols.find((k) => k.includes("קוד") && k.includes("דרמה")) ?? cols.find((k) => k.includes("קוד דרמה")) ?? "קוד דרמה";
  const qtyKey = cols.find((k) => k.includes("כמות")) ?? "כמות סה\"כ";
  const receivedKey = cols.find((k) => k.includes("התקבל")) ?? "התקבל";
  const expectedKey = cols.find((k) => k.includes("צפי")) ?? "תאריך צפי";
  // Prioritize exact match for "לוג" (Log) to avoid matching "קטלוג" (Catalog) or similar
  const logKey = cols.find((k) => k.trim() === "לוג") ?? cols.find((k) => k.includes("לוג")) ?? "לוג";

  console.debug("[fetchOrders] detected columns:", { dermaSkuKey, qtyKey, receivedKey, expectedKey, logKey });

  return rawWithIndex
    .filter((item) => item.data["שם פריט"]?.trim()) // Filter based on content
    .map((item) => {
      const row = item.data;
      const orderDateStr = row["תאריך הזמנה"]?.trim() ?? "";
      let expectedDate = row[expectedKey]?.trim() ?? "";

      // If no expected date, default to order date + 3 months
      if (!expectedDate && orderDateStr) {
        const parsed = parseDateString(orderDateStr);
        if (parsed) {
          parsed.setMonth(parsed.getMonth() + 3);
          expectedDate = `${parsed.getDate().toString().padStart(2, "0")}/${(parsed.getMonth() + 1).toString().padStart(2, "0")}/${parsed.getFullYear()}`;
        }
      }

      return {
        orderDate: orderDateStr,
        supplierSku: row["מק\"ט פאר-פארם"]?.trim() ?? "",
        dermaSku: row[dermaSkuKey]?.trim() ?? "",
        quantity: (row[qtyKey]?.trim() ?? "").replace(/,/g, ""),
        productName: row["שם פריט"]?.trim() ?? "",
        received: row[receivedKey]?.trim() ?? "",
        expectedDate,
        comments: row[logKey]?.trim() ?? "",
        rowIndex: item.originalIndex, // Use the captured original index
      };
    });
}

// ── Write operations ──

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;

async function postToSheet(action: string, data?: Record<string, unknown>): Promise<{ success: boolean; error?: string; added?: number }> {
  if (!APPS_SCRIPT_URL) {
    throw new Error("VITE_APPS_SCRIPT_URL is not configured");
  }
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action, data }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || "Unknown error");
  }
  return json;
}

export async function addProduct(data: { name: string; sku: string; barcode: string }) {
  return postToSheet("addProduct", data);
}

export async function addOrder(data: {
  orderDate: string;
  supplierSku: string;
  dermaSku: string;
  quantity: string;
  productName: string;
  expectedDate: string;
  log?: string;
}) {
  return postToSheet("addOrder", data);
}

export async function updateOrderStatus(rowIndex: number, received: boolean) {
  return postToSheet("updateOrderStatus", { rowIndex, received });
}

export async function updateOrderComments(rowIndex: number, comments: string) {
  return postToSheet("updateOrderComments", { rowIndex, comments, comment: comments });
}

export async function syncMissingProducts() {
  return postToSheet("syncMissingProducts");
}
