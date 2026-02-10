import Papa from "papaparse";
import type { InventoryItem, Product, Order, HistoryItem, MinAmountItem } from "@/types";

const SHEET_ID = import.meta.env.VITE_SHEET_ID;
const INVENTORY_GID = import.meta.env.VITE_INVENTORY_GID;
const ORDERS_GID = import.meta.env.VITE_ORDERS_GID;
const PRODUCTS_GID = import.meta.env.VITE_PRODUCTS_GID;
const HISTORY_GID = import.meta.env.VITE_HISTORY_GID;
const MIN_AMOUNT_GID = import.meta.env.VITE_MIN_AMOUNT_GID;

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
  // Detect SKU column - could be מק"ט דרמלוסופי or מ"קט דרמלוסופי or מקט דרמלוסופי
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
      minAmount: parseInt(row[minAmountKey] ?? "0", 10) || 0,
    }))
    .filter((item) => item.minAmount > 0);
}

export async function fetchOrders(): Promise<Order[]> {
  const raw = await parseCsv<Record<string, string>>(buildCsvUrl(ORDERS_GID));
  if (raw.length === 0) return [];

  const firstRow = raw[0];
  const cols = Object.keys(firstRow);
  console.debug("[fetchOrders] all columns:", cols);

  const dermaSkuKey = cols.find((k) => k.includes("קוד") && k.includes("דרמה")) ?? cols.find((k) => k.includes("קוד דרמה")) ?? "קוד דרמה";
  const qtyKey = cols.find((k) => k.includes("כמות")) ?? "כמות סה\"כ";
  const receivedKey = cols.find((k) => k.includes("התקבל")) ?? "התקבל";
  const expectedKey = cols.find((k) => k.includes("צפי")) ?? "תאריך צפי";

  console.debug("[fetchOrders] detected columns:", { dermaSkuKey, qtyKey, receivedKey, expectedKey });

  return raw
    .filter((row) => row["שם פריט"]?.trim())
    .map((row) => ({
      orderDate: row["תאריך הזמנה"]?.trim() ?? "",
      supplierSku: row["מק\"ט פאר-פארם"]?.trim() ?? "",
      dermaSku: row[dermaSkuKey]?.trim() ?? "",
      quantity: row[qtyKey]?.trim() ?? "",
      productName: row["שם פריט"]?.trim() ?? "",
      received: row[receivedKey]?.trim() ?? "",
      expectedDate: row[expectedKey]?.trim() ?? "",
    }));
}
