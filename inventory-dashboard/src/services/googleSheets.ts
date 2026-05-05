import Papa from "papaparse";
import type { Product, Order, HistoryItem, ConnectedProduct, SupplierMessage, SupplierEmail } from "@/types";

const SHEET_ID = import.meta.env.VITE_SHEET_ID;
const ORDERS_GID = import.meta.env.VITE_ORDERS_GID;
const PRODUCTS_GID = import.meta.env.VITE_PRODUCTS_GID;
const HISTORY_GID = import.meta.env.VITE_HISTORY_GID;
const CONNECTED_PRODUCTS_GID = import.meta.env.VITE_CONNECTED_PRODUCTS_GID;
const SUPPLIER_MESSAGES_GID = import.meta.env.VITE_SUPPLIER_MESSAGES_GID;

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
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (error: Error) => reject(error),
    });
  });
}

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

export async function fetchProducts(): Promise<Product[]> {
  const url = buildCsvUrl(PRODUCTS_GID);
  const raw = await parseCsv<Record<string, string>>(url);

  if (raw.length === 0) {
    console.warn("[fetchProducts] CSV returned 0 rows from:", url);
    return [];
  }

  const cols = Object.keys(raw[0]);
  console.debug("[fetchProducts] columns:", cols);

  // Auto-detect column names (flexible matching like fetchOrders)
  const skuKey = cols.find(k => k.includes("פריט") && !k.includes("שם")) ?? "פריט";
  const nameKey = cols.find(k => k.includes("שם") && k.includes("פריט")) ?? "שם פריט";
  const supplierKey = cols.find(k => k === "ספק") ?? cols.find(k => k.includes("ספק")) ?? "ספק";
  const minKey = cols.find(k => k.includes("מינימום")) ?? "מינימום";
  const assignKey = cols.find(k => k.includes("שיוך")) ?? "שיוך קבוע";
  const qtyKey = cols.find(k => k.includes("יתרת") || (k.includes("מלאי") && !k.includes("מינימום"))) ?? "יתרת מלאי";
  const supplierSkuKey = cols.find(k => k.includes("פאר") && k.includes("פארם")) ?? "מק\"ט פאר פארם";
  const containerKey = cols.find(k => k.includes("מיכל")) ?? "מיכל";
  console.debug("[fetchProducts] detected keys:", { skuKey, nameKey, supplierKey, minKey, assignKey, qtyKey, supplierSkuKey, containerKey });

  const products = raw
    .filter((row) => row[skuKey]?.trim())
    .map((row) => ({
      sku: row[skuKey]?.trim() ?? "",
      name: row[nameKey]?.trim() ?? "",
      manufacturer: row[supplierKey]?.trim() ?? "",
      minAmount: parseInt((row[minKey] ?? "0").replace(/,/g, ""), 10) || 0,
      fixedAssignment: row[assignKey]?.trim() ?? "",
      warehouseQty: parseInt((row[qtyKey] ?? "0").replace(/,/g, ""), 10) || 0,
      supplierSku: row[supplierSkuKey]?.trim() ?? "",
      container: row[containerKey]?.trim() ?? "",
    }));

  console.debug("[fetchProducts]", raw.length, "raw rows →", products.length, "products");
  return products;
}

export async function fetchHistory(): Promise<HistoryItem[]> {
  const raw = await parseCsv<Record<string, string>>(buildCsvUrl(HISTORY_GID));

  if (raw.length === 0) return [];

  const cols = Object.keys(raw[0]);
  console.debug("[fetchHistory] columns:", cols);

  const skuKey = cols.find(k => k.includes("דרמלוסופי")) ?? "מ\"קט דרמלוסופי";
  const qtyKey = cols.find(k => k.includes("כמות")) ?? "כמות";
  const dateKey = cols.find(k => k.includes("תאריך")) ?? "תאריך";

  return raw
    .filter((row) => row[skuKey]?.trim())
    .map((row) => ({
      sku: row[skuKey]?.trim() ?? "",
      quantity: parseInt(row[qtyKey] ?? "0", 10) || 0,
      date: row[dateKey]?.trim() ?? "",
    }))
    .filter((item) => item.date && item.sku);
}

export async function fetchConnectedProducts(): Promise<ConnectedProduct[]> {
  const raw = await parseCsv<Record<string, string>>(buildCsvUrl(CONNECTED_PRODUCTS_GID));

  if (raw.length === 0) return [];

  const cols = Object.keys(raw[0]);
  console.debug("[fetchConnectedProducts] columns:", cols);

  const groupNumKey = cols.find(k => k.includes("מספר") && k.includes("קבוצה")) ?? "מספר קבוצה";
  const groupNameKey = cols.find(k => k.includes("שם") && k.includes("קבוצה")) ?? "שם קבוצה";
  const supplierSkuKey = cols.find(k => k.includes("פאר") && k.includes("פארם")) ?? "פריט פאר פארם";
  const productNameKey = cols.find(k => k.includes("שם") && k.includes("פריט")) ?? "שם פריט";
  const labelKey = cols.find(k => k.includes("תווית")) ?? "תווית";
  const connectedKey = cols.find(k => k.includes("מחוברים")) ?? "מקטים מחוברים";
  const dermaSkuKey = cols.find(k => k.includes("דרמלוסופי")) ?? 'מק"ט דרמלוסופי';

  return raw
    .filter(row => row[groupNumKey]?.trim())
    .map(row => ({
      groupNumber: row[groupNumKey]?.trim() ?? "",
      groupName: row[groupNameKey]?.trim() ?? "",
      supplierSku: row[supplierSkuKey]?.trim() ?? "",
      productName: row[productNameKey]?.trim() ?? "",
      label: row[labelKey]?.trim() ?? "",
      connectedSkus: (row[connectedKey] ?? "").split(",").map(s => s.trim()).filter(Boolean),
      dermaSku: row[dermaSkuKey]?.trim() ?? "",
    }));
}

export async function fetchOrders(): Promise<Order[]> {
  const rawWithIndex = await parseCsvWithIndex<Record<string, string>>(buildCsvUrl(ORDERS_GID));

  if (rawWithIndex.length === 0) return [];

  const firstDataRow = rawWithIndex[0]?.data ?? {};
  const cols = Object.keys(firstDataRow);
  console.debug("[fetchOrders] all columns:", cols);

  const dermaSkuKey = cols.find((k) => k.includes("קוד") && k.includes("דרמה")) ?? cols.find((k) => k.includes("קוד דרמה")) ?? "קוד דרמה";
  const qtyKey = cols.find((k) => k.includes("כמות")) ?? "כמות סה\"כ";
  const receivedKey = cols.find((k) => k.includes("התקבל")) ?? "התקבל";
  const expectedKey = cols.find((k) => k.includes("הגעה")) ?? cols.find((k) => k.includes("צפי")) ?? "תאריך צפי";
  const productionKey = cols.find((k) => k.includes("יצור")) ?? "תאריך יצור";
  // Prioritize exact match for "לוג" (Log) to avoid matching "קטלוג" (Catalog) or similar
  const logKey = cols.find((k) => k.trim() === "לוג") ?? cols.find((k) => k.includes("לוג")) ?? "לוג";
  const supplierSkuKey = cols.find((k) => k.includes("פאר") && k.includes("פארם")) ?? cols.find((k) => k.includes("מק") && k.includes("ספק")) ?? "מק\"ט פאר פארם";
  const containerKey = cols.find((k) => k.includes("מיכל")) ?? "מיכל";
  const distributionKey = cols.find((k) => k.includes("חלוקה")) ?? "חלוקה+הערות";
  const packagingKey = cols.find((k) => k.includes("אריזות") && k.includes("מדבקות")) ?? "אריזות ומדבקות";
  const formulaKey = cols.find((k) => k.includes("פורמולה")) ?? "פורמולה";
  const contentKey = cols.find((k) => k.includes("תכולה")) ?? "תכולה";

  console.debug("[fetchOrders] detected columns:", { dermaSkuKey, qtyKey, receivedKey, expectedKey, logKey, supplierSkuKey, containerKey });

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
        supplierSku: row[supplierSkuKey]?.trim() ?? "",
        dermaSku: row[dermaSkuKey]?.trim() ?? "",
        quantity: (row[qtyKey]?.trim() ?? "").replace(/,/g, ""),
        productName: row["שם פריט"]?.trim() ?? "",
        received: row[receivedKey]?.trim() ?? "",
        productionDate: row[productionKey]?.trim() ?? "",
        expectedDate,
        comments: row[logKey]?.trim() ?? "",
        container: row[containerKey]?.trim() ?? "",
        rowIndex: item.originalIndex, // Use the captured original index
        distributionNotes: row[distributionKey]?.trim() ?? "",
        packagingLabels: row[packagingKey]?.trim() ?? "",
        formula: row[formulaKey]?.trim() ?? "",
        content: row[contentKey]?.trim() ?? "",
      };
    });
}

export async function fetchSupplierMessages(): Promise<SupplierMessage[]> {
  if (!SUPPLIER_MESSAGES_GID) return [];

  const rawWithIndex = await parseCsvWithIndex<Record<string, string>>(buildCsvUrl(SUPPLIER_MESSAGES_GID));
  if (rawWithIndex.length === 0) return [];

  const cols = Object.keys(rawWithIndex[0]?.data ?? {});
  const dateKey = cols.find(k => k.includes("תאריך")) ?? "תאריך";
  const subjectKey = cols.find(k => k.includes("נושא")) ?? "נושא";
  const skuKey = cols.find(k => k.includes("מק") && k.includes("ספק")) ?? 'מק"ט ספק';
  const statusKey = cols.find(k => k === "סטטוס") ?? cols.find(k => k.includes("סטטוס")) ?? "סטטוס";
  const qtyKey = cols.find(k => k.includes("כמות")) ?? "כמות";
  const expectedKey = cols.find(k => k.includes("צפי")) ?? "צפי";
  const linkedKey = cols.find(k => k.includes("שויך")) ?? "שויך להזמנה";
  const handledKey = cols.find(k => k === "טופל") ?? cols.find(k => k.includes("טופל")) ?? "טופל";

  return rawWithIndex
    .filter(item => item.data[skuKey]?.trim() || item.data[statusKey]?.trim())
    .map(item => {
      const row = item.data;
      return {
        date: row[dateKey]?.trim() ?? "",
        subject: row[subjectKey]?.trim() ?? "",
        supplierSku: row[skuKey]?.trim() ?? "",
        status: row[statusKey]?.trim() ?? "",
        quantity: row[qtyKey]?.trim() ?? "",
        expectedDate: row[expectedKey]?.trim() ?? "",
        linkedOrder: row[linkedKey]?.trim() ?? "",
        handled: row[handledKey]?.trim() ?? "",
        rowIndex: item.originalIndex,
      };
    });
}

// ── Write operations ──

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL;
const EMAIL_SCRIPT_URL = import.meta.env.VITE_EMAIL_SCRIPT_URL;

async function postToScript(url: string, action: string, data?: Record<string, unknown>): Promise<{ success: boolean; error?: string; added?: number; count?: number }> {
  if (!url) {
    throw new Error("Script URL is not configured");
  }
  const res = await fetch(url, {
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

async function postToSheet(action: string, data?: Record<string, unknown>) {
  return postToScript(APPS_SCRIPT_URL, action, data);
}

async function postToEmailScript(action: string, data?: Record<string, unknown>) {
  return postToScript(EMAIL_SCRIPT_URL || APPS_SCRIPT_URL, action, data);
}

export async function addProduct(data: {
  name: string;
  sku: string;
  manufacturer?: string;
  minAmount?: number;
  fixedAssignment?: string;
  warehouseQty?: number;
  supplierSku?: string;
  container?: string;
}) {
  return postToSheet("addProduct", data);
}

export async function addOrder(data: {
  orderDate: string;
  supplierSku: string;
  dermaSku: string;
  quantity: string;
  productName: string;
  productionDate: string;
  expectedDate: string;
  log?: string;
  container?: string;
  distributionNotes?: string;
  packagingLabels?: string;
  formula?: string;
  content?: string;
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

export async function syncSupplierSkus() {
  return postToSheet("syncSupplierSkus");
}

export async function sendFollowUp(data: {
  rowIndex: number;
  orderDate: string;
  supplierSku: string;
  dermaSku: string;
  quantity: string;
  productName: string;
  expectedDate: string;
  container?: string;
  customMessage?: string;
}) {
  return postToEmailScript("sendFollowUp", data);
}

export async function sendFreeEmail(data: { subject: string; body: string }) {
  return postToEmailScript("sendFreeEmail", data);
}

export async function fetchSupplierEmailHistory(): Promise<SupplierEmail[]> {
  const res = await fetch("/api/supplier-emails");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function sendDailyOrderEmail(
  orderDate: string,
  customMessage?: string,
  editedRows?: { name: string; sku: string; supplierSku: string; quantity: string; container: string; distributionNotes: string; formula: string; content: string }[]
) {
  return postToEmailScript("sendDailyOrderEmail", { orderDate, customMessage, editedRows });
}

export async function updateOrderFields(rowIndex: number, fields: Record<string, string>, replaceComments?: string) {
  return postToSheet("updateOrderFields", { rowIndex, fields, replaceComments });
}

export async function deleteOrder(rowIndex: number) {
  return postToSheet("deleteOrder", { rowIndex });
}

export async function linkSupplierMessage(data: {
  messageRowIndex: number;
  orderRowIndex: number;
  logEntry: string;
  expectedDate?: string;
}) {
  return postToSheet("linkSupplierMessage", data);
}
