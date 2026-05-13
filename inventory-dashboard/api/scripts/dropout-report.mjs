// One-shot diagnostic: list Products-sheet SKUs missing from recent Comax History.
// Read-only. Fetches Products + History CSVs from Google Sheets, prints a report.
// Usage: node api/scripts/dropout-report.mjs

import fs from "node:fs";

function parseCsv(text) {
  const lines = [];
  let cur = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inQ) {
      if (c === '"' && n === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); lines.push(cur); cur = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || cur.length) { cur.push(field); lines.push(cur); }
  return lines;
}

function parseIsraeliDate(s) {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  // Use UTC to avoid timezone-shift quirks when formatting back to YYYY-MM-DD.
  return new Date(Date.UTC(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])));
}

const SHEET_ID = "1Cqr5SHHbH3MtCKU5h3GAShGG5NtpPA6LNCLNk16EH_Q";
const PRODUCTS_GID = "1500898630";
const HISTORY_GID = "2071549789";
const url = (gid) => `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;

const [products, history] = await Promise.all([
  fetch(url(PRODUCTS_GID)).then((r) => r.text()).then(parseCsv),
  fetch(url(HISTORY_GID)).then((r) => r.text()).then(parseCsv),
]);

const pH = products[0];
const skuIdx = pH.indexOf("פריט");
const nameIdx = pH.indexOf("שם פריט");
const stockIdx = pH.indexOf("יתרת מלאי");
const supplierIdx = pH.indexOf("ספק");

const productMap = new Map();
for (let i = 1; i < products.length; i++) {
  const row = products[i];
  if (!row[skuIdx]?.trim()) continue;
  productMap.set(row[skuIdx].trim(), {
    sku: row[skuIdx].trim(),
    name: row[nameIdx] || "",
    stock: row[stockIdx] || "",
    supplier: row[supplierIdx] || "",
  });
}

const lastSeen = new Map();
for (let i = 1; i < history.length; i++) {
  const row = history[i];
  if (!row[0]) continue;
  const sku = row[0].trim();
  const d = parseIsraeliDate((row[2] || "").trim());
  if (!d) continue;
  const prev = lastSeen.get(sku);
  if (!prev || d > prev) lastSeen.set(sku, d);
}

const today = new Date(Date.UTC(2026, 4, 13));
const cutoff = new Date(today); cutoff.setUTCDate(today.getUTCDate() - 7);

const stale = [];
for (const [sku, prod] of productMap) {
  const ls = lastSeen.get(sku);
  if (!ls || ls < cutoff) {
    stale.push({ ...prod, lastSeen: ls ? ls.toISOString().slice(0, 10) : "never" });
  }
}

const dailyCounts = new Map();
for (let i = 1; i < history.length; i++) {
  const d = parseIsraeliDate((history[i][2] || "").trim());
  if (!d) continue;
  const k = d.toISOString().slice(0, 10);
  dailyCounts.set(k, (dailyCounts.get(k) || 0) + 1);
}

console.log("=== Comax Sync Diagnostic — 2026-05-13 ===");
console.log(`Products sheet SKUs: ${productMap.size}`);
console.log(`SKUs with NO History entry in last 7 days: ${stale.length}`);
console.log("");
console.log("Daily history counts (last 20):");
const days = [...dailyCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-20);
for (const [d, n] of days) console.log(`  ${d}: ${n}`);
console.log("");
console.log("Last-seen distribution for stale SKUs:");
const byDate = new Map();
for (const s of stale) {
  byDate.set(s.lastSeen, (byDate.get(s.lastSeen) || 0) + 1);
}
for (const [d, n] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`  last seen ${d}: ${n} SKUs`);
}
console.log("");
console.log(`=== SKU 46299 ===`);
console.log(`Products row: ${JSON.stringify(productMap.get("46299"))}`);
const ls46299 = lastSeen.get("46299");
console.log(`Last History entry: ${ls46299 ? ls46299.toISOString().slice(0, 10) : "never"}`);

const lines = ["sku,name,supplier,stock,lastSeen"];
for (const s of stale.sort((a, b) => a.lastSeen.localeCompare(b.lastSeen))) {
  lines.push(`${s.sku},"${(s.name || "").replace(/"/g, '""')}","${(s.supplier || "").replace(/"/g, '""')}",${s.stock},${s.lastSeen}`);
}
fs.writeFileSync(new URL("./stale_skus.csv", import.meta.url), lines.join("\n"));
console.log(`\nWrote ${stale.length} SKUs → api/scripts/stale_skus.csv`);
