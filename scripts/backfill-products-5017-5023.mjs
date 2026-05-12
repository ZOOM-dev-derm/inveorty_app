// One-shot backfill: set מינימום=100, ספק=דרמלוסופי, מיכל=120ml on SKUs 5017-5023.
// Requires `bulkUpdateProductFields` handler deployed to Apps Script.
// Run from repo root: node scripts/backfill-products-5017-5023.mjs

import fs from "node:fs";

const env = fs.readFileSync("inventory-dashboard/.env", "utf8");
const urlMatch = env.match(/^VITE_APPS_SCRIPT_URL=(.+)$/m);
if (!urlMatch) throw new Error("VITE_APPS_SCRIPT_URL missing from inventory-dashboard/.env");
const url = urlMatch[1].trim();

const SKUS = ["5017", "5018", "5019", "5020", "5021", "5022", "5023"];
const FIELDS = { minAmount: 100, manufacturer: "דרמלוסופי", container: "120ml" };

const items = SKUS.map((sku) => ({ sku, fields: FIELDS }));

console.log(`POSTing bulkUpdateProductFields for ${items.length} SKUs to ${url}`);

const res = await fetch(url, {
  method: "POST",
  redirect: "follow",
  headers: { "Content-Type": "text/plain;charset=utf-8" },
  body: JSON.stringify({ action: "bulkUpdateProductFields", data: { items } }),
});

const body = await res.text();
console.log("Response:", body);

let parsed;
try {
  parsed = JSON.parse(body);
} catch {
  throw new Error("Apps Script returned non-JSON. Likely the handler is not deployed yet.");
}

if (!parsed.success) throw new Error(`Apps Script error: ${parsed.error || body}`);
if (parsed.updated !== SKUS.length) {
  throw new Error(`Expected ${SKUS.length} updates, got ${parsed.updated}. notFound=${JSON.stringify(parsed.notFound)} skipped=${JSON.stringify(parsed.skippedFields)}`);
}
if (parsed.notFound?.length) throw new Error(`SKUs not found: ${parsed.notFound.join(", ")}`);
if (parsed.skippedFields?.length) console.warn("Skipped fields:", parsed.skippedFields);

console.log(`OK — ${parsed.updated} rows updated.`);
