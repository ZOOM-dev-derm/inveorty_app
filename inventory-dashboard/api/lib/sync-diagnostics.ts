/**
 * Post-Comax-sync diagnostics: detect catalog-wide dropouts and stale SKUs.
 *
 * Reads the published Products and History sheets directly as CSV (same
 * source the dashboard uses), then surfaces:
 *   - todayCount       — rows added to History today
 *   - baselineAvg      — avg rows per day over the prior 7 days
 *   - staleSkuCount    — SKUs in Products sheet with no History row in last 7 days
 *   - topStaleSkus     — first N stale SKUs (for log readability)
 *
 * No writes. Safe to fail — caller wraps in try/catch.
 */

const SHEET_ID = process.env.VITE_SHEET_ID || process.env.SHEET_ID;
const PRODUCTS_GID = process.env.VITE_PRODUCTS_GID || process.env.PRODUCTS_GID;
const HISTORY_GID = process.env.VITE_HISTORY_GID || process.env.HISTORY_GID;

interface StaleSku {
  sku: string;
  name: string;
  supplier: string;
  stock: string;
  lastSeen: string;
}

export interface SyncDiagnostics {
  todayKey: string;
  cutoffDays: number;
  todayCount: number;
  baselineAvg: number;
  staleSkuCount: number;
  topStaleSkus: StaleSku[];
}

function parseCsv(text: string): string[][] {
  const lines: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inQ) {
      if (c === '"' && n === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQ = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") {
        cur.push(field);
        field = "";
      } else if (c === "\n") {
        cur.push(field);
        lines.push(cur);
        cur = [];
        field = "";
      } else if (c === "\r") {
        /* skip */
      } else {
        field += c;
      }
    }
  }
  if (field.length || cur.length) {
    cur.push(field);
    lines.push(cur);
  }
  return lines;
}

/** Parse Israeli DD/MM/YYYY → UTC midnight Date. */
function parseDdmmyyyy(s: string): Date | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Date.UTC(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])));
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today in IL timezone, normalized to UTC midnight of that calendar date. */
function todayIL(): Date {
  const il = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  // en-CA returns YYYY-MM-DD
  const [y, m, d] = il.split("-").map((s) => parseInt(s, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

export async function computeSyncDiagnostics(opts: { cutoffDays?: number; topN?: number } = {}): Promise<SyncDiagnostics> {
  if (!SHEET_ID || !PRODUCTS_GID || !HISTORY_GID) {
    throw new Error("Sheet IDs not configured (VITE_SHEET_ID / VITE_PRODUCTS_GID / VITE_HISTORY_GID)");
  }

  const cutoffDays = opts.cutoffDays ?? 7;
  const topN = opts.topN ?? 25;

  const url = (gid: string) =>
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;

  const [productsCsv, historyCsv] = await Promise.all([
    fetch(url(PRODUCTS_GID)).then((r) => r.text()),
    fetch(url(HISTORY_GID)).then((r) => r.text()),
  ]);

  const products = parseCsv(productsCsv);
  const history = parseCsv(historyCsv);

  const pHeader = products[0] ?? [];
  const skuIdx = pHeader.indexOf("פריט");
  const nameIdx = pHeader.indexOf("שם פריט");
  const stockIdx = pHeader.indexOf("יתרת מלאי");
  const supplierIdx = pHeader.indexOf("ספק");

  if (skuIdx === -1) {
    throw new Error('Products sheet header missing "פריט" column');
  }

  const productMap = new Map<string, Omit<StaleSku, "lastSeen">>();
  for (let i = 1; i < products.length; i++) {
    const row = products[i];
    const sku = (row[skuIdx] || "").trim();
    if (!sku) continue;
    productMap.set(sku, {
      sku,
      name: row[nameIdx] || "",
      stock: row[stockIdx] || "",
      supplier: row[supplierIdx] || "",
    });
  }

  const lastSeen = new Map<string, Date>();
  const dailyCounts = new Map<string, number>();
  for (let i = 1; i < history.length; i++) {
    const row = history[i];
    const sku = (row[0] || "").trim();
    const date = parseDdmmyyyy((row[2] || "").trim());
    if (!sku || !date) continue;
    const prev = lastSeen.get(sku);
    if (!prev || date > prev) lastSeen.set(sku, date);
    const k = ymd(date);
    dailyCounts.set(k, (dailyCounts.get(k) || 0) + 1);
  }

  const today = todayIL();
  const cutoff = new Date(today);
  cutoff.setUTCDate(today.getUTCDate() - cutoffDays);

  const stale: StaleSku[] = [];
  for (const [sku, prod] of productMap) {
    const ls = lastSeen.get(sku);
    if (!ls || ls < cutoff) {
      stale.push({ ...prod, lastSeen: ls ? ymd(ls) : "never" });
    }
  }
  stale.sort((a, b) => a.lastSeen.localeCompare(b.lastSeen));

  const todayKey = ymd(today);
  const todayCount = dailyCounts.get(todayKey) || 0;

  let baselineSum = 0;
  let baselineDays = 0;
  for (let i = 1; i <= cutoffDays; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    const c = dailyCounts.get(ymd(d));
    if (c != null) {
      baselineSum += c;
      baselineDays++;
    }
  }
  const baselineAvg = baselineDays > 0 ? baselineSum / baselineDays : 0;

  return {
    todayKey,
    cutoffDays,
    todayCount,
    baselineAvg,
    staleSkuCount: stale.length,
    topStaleSkus: stale.slice(0, topN),
  };
}
