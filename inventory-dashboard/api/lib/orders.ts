import Papa from "papaparse";
import type { OpenOrder, LlmExtractedItem, OrderUpdate, PendingMessage } from "./types.js";

const RECEIVED_VALUES = ["כן", "v", "✓", "true", "yes"];

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split(/[\/\.\-]/);
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const fullYear = year < 100 ? 2000 + year : year;
    const d = new Date(fullYear, month, day);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/** Fetch open orders from the Google Sheet CSV export */
export async function fetchOpenOrders(): Promise<OpenOrder[]> {
  const sheetId = process.env.SHEET_ID;
  const ordersGid = process.env.ORDERS_GID;
  if (!sheetId || !ordersGid) throw new Error("SHEET_ID or ORDERS_GID not configured");

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${ordersGid}`;
  const res = await fetch(url);
  const csv = await res.text();

  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: false,
  });

  const cols = parsed.meta.fields || [];
  const dermaSkuKey = cols.find((k) => k.includes("קוד") && k.includes("דרמה")) ?? "קוד דרמה";
  const receivedKey = cols.find((k) => k.includes("התקבל")) ?? "התקבל";
  const logKey = cols.find((k) => k.trim() === "לוג") ?? cols.find((k) => k.includes("לוג")) ?? "לוג";
  const supplierSkuKey = cols.find((k) => k.includes("פאר") && k.includes("פארם")) ?? 'מק"ט פאר פארם';
  const qtyKey = cols.find((k) => k.includes("כמות")) ?? 'כמות סה"כ';
  const orderDateKey = cols.find((k) => k === "תאריך הזמנה" || k.includes("תאריך הזמנה")) ?? "תאריך הזמנה";

  const orders: OpenOrder[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    if (!row["שם פריט"]?.trim()) continue;

    const received = (row[receivedKey] ?? "").trim().toLowerCase();
    if (RECEIVED_VALUES.includes(received)) continue;

    orders.push({
      rowIndex: i + 2,
      supplierSku: (row[supplierSkuKey] ?? "").trim(),
      dermaSku: (row[dermaSkuKey] ?? "").trim(),
      existingLog: (row[logKey] ?? "").trim(),
      received,
      orderDate: (row[orderDateKey] ?? "").trim(),
      quantity: parseInt((row[qtyKey] ?? "0").replace(/,/g, ""), 10) || 0,
      productName: (row["שם פריט"] ?? "").trim(),
    });
  }

  return orders;
}

/** Build a lookup map: SKU → matching open orders */
export function buildSkuIndex(orders: OpenOrder[]): Map<string, OpenOrder[]> {
  const index = new Map<string, OpenOrder[]>();

  for (const order of orders) {
    if (order.supplierSku) {
      const existing = index.get(order.supplierSku) || [];
      existing.push(order);
      index.set(order.supplierSku, existing);
    }
    if (order.dermaSku) {
      const key = "derma_" + order.dermaSku;
      const existing = index.get(key) || [];
      existing.push(order);
      index.set(key, existing);
    }
  }

  return index;
}

/**
 * Pick the best matching order when multiple match:
 * 1. Exact quantity match
 * 2. Most recent order date
 * 3. Not yet logged for this email date
 * Returns null if still ambiguous (multiple equally-good matches).
 */
function pickBestMatch(
  matches: OpenOrder[],
  item: LlmExtractedItem,
  emailDate: string
): OpenOrder | null {
  if (matches.length === 1) return matches[0];

  // Filter out already-logged (dedup)
  const statusPrefix = `${emailDate}: [ספק] ${(item.status || "").substring(0, 10)}`;
  let candidates = matches.filter((o) => !o.existingLog.includes(statusPrefix));
  if (candidates.length === 0) return null; // all duplicates
  if (candidates.length === 1) return candidates[0];

  // Tier 1: exact quantity match
  if (item.quantity != null) {
    const qtyMatches = candidates.filter((o) => o.quantity === item.quantity);
    if (qtyMatches.length === 1) return qtyMatches[0];
    if (qtyMatches.length > 1) candidates = qtyMatches;
  }

  // Tier 2: most recent order date
  const withDates = candidates
    .map((o) => ({ order: o, date: parseDate(o.orderDate) }))
    .filter((x) => x.date !== null)
    .sort((a, b) => b.date!.getTime() - a.date!.getTime());

  if (withDates.length > 0) {
    // If the top 2 have the same date, it's ambiguous
    if (
      withDates.length >= 2 &&
      withDates[0].date!.getTime() === withDates[1].date!.getTime()
    ) {
      // Still ambiguous — check if quantity breaks the tie
      if (item.quantity != null) {
        const topDate = withDates[0].date!.getTime();
        const sameDateOrders = withDates
          .filter((x) => x.date!.getTime() === topDate)
          .map((x) => x.order);
        const qtyMatch = sameDateOrders.find((o) => o.quantity === item.quantity);
        if (qtyMatch) return qtyMatch;
      }
      return null; // truly ambiguous
    }
    return withDates[0].order;
  }

  return null; // no dates to compare
}

/** Match LLM-extracted items to open orders, with smart disambiguation */
export function matchAndBuildUpdates(
  items: LlmExtractedItem[],
  skuIndex: Map<string, OpenOrder[]>,
  emailDate: string,
  emailSubject?: string
): { updates: OrderUpdate[]; pending: PendingMessage[] } {
  const updates: OrderUpdate[] = [];
  const pending: PendingMessage[] = [];

  for (const item of items) {
    if (!item.sku) continue;
    const sku = item.sku.toString().trim();
    const matches = skuIndex.get(sku) || skuIndex.get("derma_" + sku);

    if (!matches || matches.length === 0) {
      console.log(`No open order for SKU ${sku}`);
      pending.push({
        date: emailDate,
        subject: emailSubject || "",
        supplierSku: sku,
        status: item.status || "",
        quantity: item.quantity,
        expectedDate: item.expectedDate,
      });
      continue;
    }

    const statusText = item.confirmed
      ? "אושר ✓ " + (item.status || "")
      : (item.status || "");
    let logEntry = `${emailDate}: [ספק] ${statusText}`;
    if (item.quantity != null) {
      logEntry += ` - ${item.quantity} יח'`;
    }

    const bestMatch = pickBestMatch(matches, item, emailDate);

    if (bestMatch) {
      updates.push({
        rowIndex: bestMatch.rowIndex,
        logEntry,
        expectedDate: item.expectedDate || undefined,
      });
    } else {
      // Ambiguous — send to pending messages
      console.log(`Ambiguous match for SKU ${sku} (${matches.length} candidates)`);
      pending.push({
        date: emailDate,
        subject: emailSubject || "",
        supplierSku: sku,
        status: item.status || "",
        quantity: item.quantity,
        expectedDate: item.expectedDate,
      });
    }
  }

  return { updates, pending };
}
