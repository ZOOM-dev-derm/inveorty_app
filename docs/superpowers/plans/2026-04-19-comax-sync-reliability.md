# Comax Sync Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the daily Comax inventory sync robust against missed/read emails, with email-date-aware history backfill, an audit log, batched stock writes, an early-morning catch-up cron, and a manual sync button in the dashboard.

**Architecture:** Replace the cron's fragile `is:unread after:today` Gmail query with a label-based "processed" tracker (`-label:comax-processed newer_than:7d`). Apply the label only after success so retries are automatic. Use the email's `Date` header as the history date so backfilled days land on the correct row. Refactor the per-email logic into a shared `processComaxEmails()` helper used by both the cron and a new manual `/api/manual/sync-comax` endpoint. Replace per-cell `setValue` writes in the Apps Script with batched `setValues`. Add a `comax-audit` sheet that records every cron run.

**Tech Stack:** TypeScript + Vercel serverless + googleapis Gmail API + Google Apps Script + Vitest + React 19 + TanStack Query.

---

## File Structure

**New files:**
- `inventory-dashboard/api/lib/email-date.ts` — `emailDateToDDMMYYYY(d: Date): string` helper (IL timezone)
- `inventory-dashboard/api/lib/email-date.test.ts` — unit tests for the helper
- `inventory-dashboard/api/lib/comax-processor.ts` — shared `processComaxEmails(query)` and `processOneComaxEmail(email)` extracted from the cron
- `inventory-dashboard/api/manual/sync-comax.ts` — new endpoint that calls `processComaxEmails()` with shared-secret auth

**Modified files:**
- `apps-script/Code.js` — rewrite `bulkUpdateStock` (batched), add `bulkAddHistoryIfMissing`, add `appendComaxAuditLog`, register both new actions in `doPost` switch
- `inventory-dashboard/api/lib/sheets-writer.ts` — add `bulkAddHistoryIfMissing` and `appendComaxAuditLog` methods
- `inventory-dashboard/api/lib/gmail.ts` — add `applyLabel(messageId, labelName)` with label-id caching
- `inventory-dashboard/api/cron/poll-comax-report.ts` — switch query, sort emails by date, call shared helper
- `inventory-dashboard/vercel.json` — add 04:30 UTC (07:30 IL) cron entry
- `inventory-dashboard/src/services/googleSheets.ts` — add `manualSyncComax()` POST helper
- `inventory-dashboard/src/hooks/useSheetData.ts` — add `useManualSyncComax()` mutation hook
- `inventory-dashboard/src/components/layout/Header.tsx` — add ghost-icon button next to existing sync
- `inventory-dashboard/.env` — document new `MANUAL_SYNC_TOKEN` and `VITE_MANUAL_SYNC_TOKEN`

---

### Task 1: Email-date helper (TDD, pure function)

**Files:**
- Create: `inventory-dashboard/api/lib/email-date.ts`
- Test: `inventory-dashboard/api/lib/email-date.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// inventory-dashboard/api/lib/email-date.test.ts
import { describe, it, expect } from "vitest";
import { emailDateToDDMMYYYY } from "./email-date.js";

describe("emailDateToDDMMYYYY", () => {
  it("formats a midday IL date", () => {
    // 2026-04-19 12:00 UTC = 15:00 Asia/Jerusalem (DST)
    const d = new Date("2026-04-19T12:00:00Z");
    expect(emailDateToDDMMYYYY(d)).toBe("19/04/2026");
  });

  it("rolls forward across midnight in IL timezone", () => {
    // 2026-04-19 22:30 UTC = 2026-04-20 01:30 IL
    const d = new Date("2026-04-19T22:30:00Z");
    expect(emailDateToDDMMYYYY(d)).toBe("20/04/2026");
  });

  it("does NOT roll back when UTC midnight is still 'today' in IL", () => {
    // 2026-04-19 00:30 UTC = 2026-04-19 03:30 IL
    const d = new Date("2026-04-19T00:30:00Z");
    expect(emailDateToDDMMYYYY(d)).toBe("19/04/2026");
  });

  it("zero-pads single-digit days and months", () => {
    const d = new Date("2026-01-05T12:00:00Z");
    expect(emailDateToDDMMYYYY(d)).toBe("05/01/2026");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `inventory-dashboard/`: `npm test -- email-date`
Expected: FAIL with "Cannot find module './email-date.js'" or "emailDateToDDMMYYYY is not a function"

- [ ] **Step 3: Implement the helper**

```ts
// inventory-dashboard/api/lib/email-date.ts

/** Convert a Date to DD/MM/YYYY in Asia/Jerusalem timezone. */
export function emailDateToDDMMYYYY(d: Date): string {
  const il = new Date(
    d.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })
  );
  const yyyy = il.getFullYear();
  const mm = String(il.getMonth() + 1).padStart(2, "0");
  const dd = String(il.getDate()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- email-date`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add inventory-dashboard/api/lib/email-date.ts inventory-dashboard/api/lib/email-date.test.ts
git commit -m "Add emailDateToDDMMYYYY helper with IL-timezone tests"
```

---

### Task 2: Apps Script `bulkUpdateStock` batched rewrite

**Files:**
- Modify: `apps-script/Code.js:496-539` (the existing `bulkUpdateStock` function body)

- [ ] **Step 1: Replace the function body in `apps-script/Code.js`**

Replace the entire existing `bulkUpdateStock` function with:

```js
function bulkUpdateStock(ss, data) {
  var sheet = getSheetByGid(ss, PRODUCTS_GID);
  if (!sheet) return { success: false, error: "Products sheet not found" };

  var items = data.items;
  if (!items || !items.length) return { success: false, error: "No items provided" };

  var allData = sheet.getDataRange().getValues();
  var headers = allData[0];

  var skuCol = -1;
  var stockCol = -1;
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i].toString().trim();
    if (h === "פריט") skuCol = i;
    if (h === "יתרת מלאי") stockCol = i;
  }
  if (skuCol === -1) return { success: false, error: "SKU column (פריט) not found" };
  if (stockCol === -1) return { success: false, error: "Stock column (יתרת מלאי) not found" };

  // Build SKU -> row-index-in-allData map (0-based)
  var skuToRowIdx = {};
  for (var r = 1; r < allData.length; r++) {
    var sku = allData[r][skuCol].toString().trim();
    if (sku) skuToRowIdx[sku] = r;
  }

  // Read the entire stock column once (rows 2..lastRow, single-column 2D array)
  var stockRange = sheet.getRange(2, stockCol + 1, allData.length - 1, 1);
  var stockValues = stockRange.getValues(); // [[v1],[v2],...]

  var updated = 0;
  var notFound = [];
  for (var j = 0; j < items.length; j++) {
    var itemSku = items[j].sku.toString().trim();
    var qty = items[j].qty;
    var rowIdx = skuToRowIdx[itemSku];
    if (rowIdx !== undefined) {
      // rowIdx is the 0-based index into allData; stockValues is 0-based starting at row 2.
      // Map: allData[r] (1-based row r+1) -> stockValues[r-1]
      stockValues[rowIdx - 1][0] = qty;
      updated++;
    } else {
      notFound.push(itemSku);
    }
  }

  // Single batched write
  stockRange.setValues(stockValues);

  return { success: true, updated: updated, notFound: notFound };
}
```

- [ ] **Step 2: Verify nothing else in `apps-script/Code.js` references the old per-cell pattern**

Run (Grep tool): pattern `getRange\(.*stockCol`, path `apps-script/Code.js`
Expected: zero matches — the only writes to the stock column are now via `stockRange.setValues(stockValues)`.

- [ ] **Step 3: Commit**

```bash
git add apps-script/Code.js
git commit -m "Batch bulkUpdateStock writes via single setValues call"
```

---

### Task 3: Apps Script `bulkAddHistoryIfMissing` action

**Files:**
- Modify: `apps-script/Code.js` — add new function and register in `doPost` switch

- [ ] **Step 1: Add the new function after `bulkAddHistory` (currently around line 579-594)**

Insert this function immediately after the existing `bulkAddHistory` function:

```js
/**
 * Bulk-append rows to the History sheet, skipping any (item_code, date) pair
 * that already exists. Idempotent — safe to call repeatedly with the same email.
 * data.rows = [{ item_code, inventory, date }]
 */
function bulkAddHistoryIfMissing(ss, data) {
  var sheet = getSheetByGid(ss, HISTORY_GID);
  if (!sheet) return { success: false, error: "History sheet not found" };

  var rows = data.rows;
  if (!rows || !rows.length) return { success: true, added: 0, skipped: 0 };

  // Read existing history once. Assumes columns: item_code | inventory | date
  var existing = sheet.getDataRange().getValues();
  var existingKeys = {};
  for (var r = 1; r < existing.length; r++) {
    var code = existing[r][0];
    var date = existing[r][2];
    if (code === "" && date === "") continue;
    var key = String(code).trim() + "|" + String(date).trim();
    existingKeys[key] = true;
  }

  var toAppend = [];
  var skipped = 0;
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var k = String(row.item_code).trim() + "|" + String(row.date).trim();
    if (existingKeys[k]) {
      skipped++;
    } else {
      toAppend.push([row.item_code, row.inventory, row.date]);
      existingKeys[k] = true; // guard against duplicates within the same payload
    }
  }

  if (toAppend.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, 3)
         .setValues(toAppend);
  }

  return { success: true, added: toAppend.length, skipped: skipped };
}
```

- [ ] **Step 2: Register the action in the `doPost` switch (around line 75-77 where `bulkAddHistory` is registered)**

Find this block in `apps-script/Code.js`:

```js
      case "bulkAddHistory":
        result = bulkAddHistory(ss, data);
        break;
```

Add immediately after it:

```js
      case "bulkAddHistoryIfMissing":
        result = bulkAddHistoryIfMissing(ss, data);
        break;
```

- [ ] **Step 3: Commit**

```bash
git add apps-script/Code.js
git commit -m "Add bulkAddHistoryIfMissing action for idempotent history backfill"
```

---

### Task 4: Apps Script `appendComaxAuditLog` action

**Files:**
- Modify: `apps-script/Code.js` — add new function and register in `doPost` switch

- [ ] **Step 1: Add the new function near the other audit/log helpers (append at end of file before any `doGet`)**

```js
/**
 * Append one row to the comax-audit sheet. Auto-creates the sheet on first call.
 * data = { timestamp, emailSubject, emailDate, itemsUpdated, itemsNotFound, error }
 */
function appendComaxAuditLog(ss, data) {
  var sheet = ss.getSheetByName("comax-audit");
  if (!sheet) {
    sheet = ss.insertSheet("comax-audit");
    sheet.getRange(1, 1, 1, 6).setValues([[
      "timestamp", "email_subject", "email_date",
      "items_updated", "items_not_found", "error"
    ]]);
    sheet.setFrozenRows(1);
  }

  sheet.appendRow([
    data.timestamp || new Date().toISOString(),
    data.emailSubject || "",
    data.emailDate || "",
    data.itemsUpdated == null ? "" : Number(data.itemsUpdated),
    data.itemsNotFound == null ? "" : Number(data.itemsNotFound),
    data.error || ""
  ]);

  return { success: true };
}
```

- [ ] **Step 2: Register in the `doPost` switch (alongside the other case statements, e.g. after `bulkAddHistoryIfMissing`)**

```js
      case "appendComaxAuditLog":
        result = appendComaxAuditLog(ss, data);
        break;
```

- [ ] **Step 3: Commit**

```bash
git add apps-script/Code.js
git commit -m "Add appendComaxAuditLog action with self-bootstrapping sheet"
```

---

### Task 5: Push Apps Script changes via clasp

**Files:**
- Deploys: `apps-script/Code.js` to Google Apps Script

- [ ] **Step 1: Push the code**

Run from repo root:

```bash
cd apps-script && clasp push
```

Expected: `└─ Code.js` listed and pushed without errors.

- [ ] **Step 2: Update the existing deployment**

Run:

```bash
cd apps-script && clasp deploy -i "AKfycbw_LLMdiPOg1IqbMzT6tIABAxFBOmPOGXfbEwld6MKIqmuU6drQ-d8ZgrTNlrdrCTo" -d "comax sync reliability v1"
```

Expected: `Deployed Version <N>` printed.

- [ ] **Step 3: Smoke-test the new actions via fetch**

Run a Node one-liner from `inventory-dashboard/` to confirm the deployment accepts the new action:

```bash
node --input-type=module -e "import('node:fs').then(()=>{}); fetch('https://script.google.com/macros/s/AKfycbw_LLMdiPOg1IqbMzT6tIABAxFBOmPOGXfbEwld6MKIqmuU6drQ-d8ZgrTNlrdrCTo/exec', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({action:'appendComaxAuditLog', data:{timestamp: new Date().toISOString(), emailSubject:'plan-task-5-smoke-test', emailDate:'19/04/2026', itemsUpdated:0, itemsNotFound:0, error:''}}), redirect:'follow'}).then(r=>r.text()).then(console.log)"
```

Expected: `{"success":true}` — and the user opens the Sheet to verify a `comax-audit` tab now exists with one row whose `email_subject` is `plan-task-5-smoke-test`.

If the response is `{"success":false,"error":"Unknown action: ..."}`, the deployment didn't pick up the new code — re-run `clasp push && clasp deploy ...`.

- [ ] **Step 4: Commit (no code changes — this task is deploy-only, no commit needed)**

Skip — Apps Script changes were already committed in Tasks 2-4.

---

### Task 6: SheetsWriter additions

**Files:**
- Modify: `inventory-dashboard/api/lib/sheets-writer.ts`

- [ ] **Step 1: Add the two new methods inside the `AppsScriptWriter` class**

Open `inventory-dashboard/api/lib/sheets-writer.ts`. Inside the class body, add these methods immediately after the existing `bulkUpdateStock` method:

```ts
  async bulkAddHistoryIfMissing(
    rows: Array<{ item_code: string; inventory: number; date: string }>
  ): Promise<{ added: number; skipped: number }> {
    const result = await this.post<{ added: number; skipped: number }>(
      "bulkAddHistoryIfMissing", { rows }
    );
    return { added: result.added ?? 0, skipped: result.skipped ?? 0 };
  }

  async appendComaxAuditLog(entry: {
    timestamp: string;
    emailSubject: string;
    emailDate: string;
    itemsUpdated: number;
    itemsNotFound: number;
    error: string;
  }): Promise<void> {
    await this.post("appendComaxAuditLog", entry);
  }
```

- [ ] **Step 2: Verify the file still type-checks**

Run from `inventory-dashboard/`: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add inventory-dashboard/api/lib/sheets-writer.ts
git commit -m "Add bulkAddHistoryIfMissing and appendComaxAuditLog to AppsScriptWriter"
```

---

### Task 7: `applyLabel` in gmail.ts

**Files:**
- Modify: `inventory-dashboard/api/lib/gmail.ts`

- [ ] **Step 1: Add a module-scope label-id cache and the `applyLabel` function at the bottom of the file**

Append to `inventory-dashboard/api/lib/gmail.ts`:

```ts
// Cache resolved label IDs for the lifetime of the function invocation
const labelIdCache = new Map<string, string>();

/**
 * Apply a Gmail label to a message, creating the label if it doesn't exist.
 */
export async function applyLabel(
  messageId: string,
  labelName: string
): Promise<void> {
  const auth = getAuth();
  const gmail = google.gmail({ version: "v1", auth });

  let labelId = labelIdCache.get(labelName);
  if (!labelId) {
    const list = await gmail.users.labels.list({ userId: "me" });
    const found = (list.data.labels || []).find((l) => l.name === labelName);
    if (found?.id) {
      labelId = found.id;
    } else {
      const created = await gmail.users.labels.create({
        userId: "me",
        requestBody: {
          name: labelName,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        },
      });
      if (!created.data.id) throw new Error(`Failed to create label ${labelName}`);
      labelId = created.data.id;
    }
    labelIdCache.set(labelName, labelId);
  }

  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { addLabelIds: [labelId] },
  });
}
```

- [ ] **Step 2: Verify the file type-checks**

Run from `inventory-dashboard/`: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add inventory-dashboard/api/lib/gmail.ts
git commit -m "Add applyLabel helper with label-id caching"
```

---

### Task 8: Shared `comax-processor.ts` helper

**Files:**
- Create: `inventory-dashboard/api/lib/comax-processor.ts`

- [ ] **Step 1: Create the shared processor**

Create `inventory-dashboard/api/lib/comax-processor.ts`:

```ts
import { fetchUnreadEmailsWithAttachments, applyLabel, type EmailWithAttachments } from "./gmail.js";
import { parseComaxReport } from "./comax-parser.js";
import { AppsScriptWriter } from "./sheets-writer.js";
import { emailDateToDDMMYYYY } from "./email-date.js";

const PROCESSED_LABEL = "comax-processed";

export interface ProcessResult {
  processed: number;
  items: number;
  newProducts: number;
  errors: string[];
}

/** Default Gmail query — un-labeled Comax emails from the last 7 days */
export function defaultComaxQuery(): string {
  return `from:ComaxNotification_Do_Not_Reply@comax.co.il -label:${PROCESSED_LABEL} newer_than:7d`;
}

export async function processComaxEmails(query: string = defaultComaxQuery()): Promise<ProcessResult> {
  const emails = await fetchUnreadEmailsWithAttachments(query);
  if (emails.length === 0) {
    return { processed: 0, items: 0, newProducts: 0, errors: [] };
  }

  // Process oldest first so the latest snapshot wins the stock-write race
  emails.sort((a, b) => a.date.getTime() - b.date.getTime());

  const writer = new AppsScriptWriter();
  let totalItems = 0;
  let totalNewProducts = 0;
  const errors: string[] = [];

  for (const email of emails) {
    try {
      const result = await processOneComaxEmail(email, writer);
      totalItems += result.items;
      totalNewProducts += result.newProducts;
      // Label only on success — failures will be retried by the next run
      await applyLabel(email.id, PROCESSED_LABEL);
    } catch (err) {
      const msg = `Failed processing "${email.subject}": ${String(err)}`;
      console.error(msg);
      errors.push(msg);
      // Best-effort: still write an audit row noting the failure
      try {
        await writer.appendComaxAuditLog({
          timestamp: new Date().toISOString(),
          emailSubject: email.subject,
          emailDate: emailDateToDDMMYYYY(email.date),
          itemsUpdated: 0,
          itemsNotFound: 0,
          error: String(err),
        });
      } catch (_) { /* swallow — audit best-effort */ }
    }
  }

  return {
    processed: emails.length,
    items: totalItems,
    newProducts: totalNewProducts,
    errors,
  };
}

async function processOneComaxEmail(
  email: EmailWithAttachments,
  writer: AppsScriptWriter
): Promise<{ items: number; newProducts: number }> {
  const attachment = email.attachments.find(
    (a) =>
      a.filename.endsWith(".xls") ||
      a.filename.endsWith(".xlsx") ||
      a.filename.endsWith(".csv") ||
      a.mimeType.includes("spreadsheet") ||
      a.mimeType.includes("excel")
  );

  const emailDate = emailDateToDDMMYYYY(email.date);

  if (!attachment) {
    await writer.appendComaxAuditLog({
      timestamp: new Date().toISOString(),
      emailSubject: email.subject,
      emailDate,
      itemsUpdated: 0,
      itemsNotFound: 0,
      error: "no Excel/CSV attachment",
    });
    return { items: 0, newProducts: 0 };
  }

  const items = parseComaxReport(attachment.data);
  if (items.length === 0) {
    await writer.appendComaxAuditLog({
      timestamp: new Date().toISOString(),
      emailSubject: email.subject,
      emailDate,
      itemsUpdated: 0,
      itemsNotFound: 0,
      error: "parser returned 0 items",
    });
    return { items: 0, newProducts: 0 };
  }

  // History (idempotent — keyed on item_code|date)
  await writer.bulkAddHistoryIfMissing(
    items.map((i) => ({
      item_code: i.item_code,
      inventory: i.inventory,
      date: emailDate,
    }))
  );

  // Stock (latest value wins; clamp negatives to 0)
  const stockResult = await writer.bulkUpdateStock(
    items.map((i) => ({ sku: i.item_code, qty: Math.max(0, i.inventory) }))
  );

  // Auto-add unknown SKUs to the Products sheet
  let newProducts = 0;
  if (stockResult.notFound.length > 0) {
    const itemMap = new Map(items.map((i) => [i.item_code, i]));
    const productsToAdd = stockResult.notFound.map((sku) => {
      const it = itemMap.get(sku);
      return {
        sku,
        name: it?.product_name || "",
        stock: Math.max(0, it?.inventory ?? 0),
      };
    });
    await writer.bulkAddProducts(productsToAdd);
    newProducts = productsToAdd.length;
  }

  await writer.appendComaxAuditLog({
    timestamp: new Date().toISOString(),
    emailSubject: email.subject,
    emailDate,
    itemsUpdated: stockResult.updated,
    itemsNotFound: stockResult.notFound.length,
    error: "",
  });

  return { items: items.length, newProducts };
}
```

- [ ] **Step 2: Type-check**

Run from `inventory-dashboard/`: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add inventory-dashboard/api/lib/comax-processor.ts
git commit -m "Extract shared processComaxEmails helper with label + audit + idempotent history"
```

---

### Task 9: Refactor `poll-comax-report.ts` to use the shared helper

**Files:**
- Modify: `inventory-dashboard/api/cron/poll-comax-report.ts` (full replacement)

- [ ] **Step 1: Replace the file contents**

Overwrite `inventory-dashboard/api/cron/poll-comax-report.ts` with:

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { processComaxEmails } from "../lib/comax-processor.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await processComaxEmails();
    if (result.processed === 0) {
      return res.status(200).json({
        message: "No unprocessed Comax emails in the last 7 days",
        ...result,
      });
    }
    return res.status(200).json({
      message: `Processed ${result.processed} email(s), ${result.items} items updated, ${result.newProducts} new product(s) added`,
      ...result,
    });
  } catch (err) {
    console.error("Poll Comax report failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
```

- [ ] **Step 2: Type-check**

Run from `inventory-dashboard/`: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add inventory-dashboard/api/cron/poll-comax-report.ts
git commit -m "Refactor poll-comax-report to delegate to shared processor"
```

---

### Task 10: Add the 07:30 IL cron entry

**Files:**
- Modify: `inventory-dashboard/vercel.json`

- [ ] **Step 1: Replace `inventory-dashboard/vercel.json`**

```json
{
  "crons": [
    {
      "path": "/api/cron/poll-supplier-emails",
      "schedule": "0 7 * * *"
    },
    {
      "path": "/api/cron/poll-comax-report",
      "schedule": "30 4 * * *"
    },
    {
      "path": "/api/cron/poll-comax-report",
      "schedule": "15 7 * * *"
    },
    {
      "path": "/api/cron/poll-comax-report",
      "schedule": "0 12 * * *"
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add inventory-dashboard/vercel.json
git commit -m "Add 07:30 IL Comax catch-up cron"
```

---

### Task 11: Manual sync endpoint

**Files:**
- Create: `inventory-dashboard/api/manual/sync-comax.ts`

- [ ] **Step 1: Create the endpoint**

```ts
// inventory-dashboard/api/manual/sync-comax.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { processComaxEmails } from "../lib/comax-processor.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — the dashboard runs on the same Vercel domain, but be explicit for safety
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Manual-Sync-Token");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = req.headers["x-manual-sync-token"];
  const expected = process.env.MANUAL_SYNC_TOKEN;
  if (!expected) return res.status(500).json({ error: "MANUAL_SYNC_TOKEN not configured" });
  if (token !== expected) return res.status(401).json({ error: "Unauthorized" });

  try {
    const result = await processComaxEmails();
    return res.status(200).json({
      message:
        result.processed === 0
          ? "אין מיילים חדשים מ-Comax לעיבוד"
          : `עודכנו ${result.items} פריטים מ-${result.processed} מיילים`,
      ...result,
    });
  } catch (err) {
    console.error("Manual sync failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
```

- [ ] **Step 2: Type-check**

Run from `inventory-dashboard/`: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add inventory-dashboard/api/manual/sync-comax.ts
git commit -m "Add /api/manual/sync-comax endpoint with shared-secret auth"
```

---

### Task 12: Service + hook for manual sync

**Files:**
- Modify: `inventory-dashboard/src/services/googleSheets.ts` (add `manualSyncComax`)
- Modify: `inventory-dashboard/src/hooks/useSheetData.ts` (add `useManualSyncComax`)

- [ ] **Step 1: Add the service function at the end of `inventory-dashboard/src/services/googleSheets.ts`**

```ts
const MANUAL_SYNC_TOKEN = import.meta.env.VITE_MANUAL_SYNC_TOKEN as string | undefined;

export async function manualSyncComax(): Promise<{
  message: string;
  processed: number;
  items: number;
  newProducts: number;
  errors?: string[];
}> {
  const res = await fetch("/api/manual/sync-comax", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Manual-Sync-Token": MANUAL_SYNC_TOKEN ?? "",
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}
```

- [ ] **Step 2: Add the import to `useSheetData.ts`**

In `inventory-dashboard/src/hooks/useSheetData.ts`, find the existing import from `@/services/googleSheets` (line 3) and add `manualSyncComax`:

```ts
import { fetchProducts, fetchOrders, fetchHistory, fetchConnectedProducts, fetchSupplierMessages, fetchSupplierEmailHistory, addProduct, addOrder, updateOrderStatus, updateOrderComments, updateOrderFields, deleteOrder, syncMissingProducts, syncSupplierSkus, sendFollowUp, sendFreeEmail, linkSupplierMessage, manualSyncComax } from "@/services/googleSheets";
```

- [ ] **Step 3: Add the mutation hook at the end of `useSheetData.ts`**

```ts
export function useManualSyncComax() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: manualSyncComax,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["products"] });
      client.invalidateQueries({ queryKey: ["history"] });
    },
  });
}
```

- [ ] **Step 4: Type-check**

Run from `inventory-dashboard/`: `npx tsc -b`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add inventory-dashboard/src/services/googleSheets.ts inventory-dashboard/src/hooks/useSheetData.ts
git commit -m "Add manualSyncComax service + useManualSyncComax mutation hook"
```

---

### Task 13: Header button

**Files:**
- Modify: `inventory-dashboard/src/components/layout/Header.tsx`

- [ ] **Step 1: Add the button next to the existing sync button**

Open `inventory-dashboard/src/components/layout/Header.tsx`. Update the import on line 7:

```ts
import { useSyncMissingProducts, useSyncSupplierSkus, useManualSyncComax } from "@/hooks/useSheetData";
```

In the component body (after `const syncSkusMutation = useSyncSupplierSkus();` on line 18), add:

```ts
  const comaxSyncMutation = useManualSyncComax();

  const handleComaxSync = () => {
    comaxSyncMutation.mutate(undefined, {
      onSuccess: (data) => {
        alert(data.message + (data.errors?.length ? `\nשגיאות: ${data.errors.join("; ")}` : ""));
      },
      onError: (err) => alert(`סנכרון נכשל: ${(err as Error).message}`),
    });
  };
```

Insert this `<Button>` immediately AFTER the existing `<Button>` block that has `title="סנכרן מוצרים + מק״טי פאר פארם"` (ends around line 58):

```tsx
          <Button
            variant="ghost"
            size="icon"
            onClick={handleComaxSync}
            disabled={comaxSyncMutation.isPending}
            title="סנכרן מלאי מ-Comax עכשיו"
            className="h-8 w-8 hidden sm:inline-flex hover:bg-white/10"
          >
            <span className={`text-base ${comaxSyncMutation.isPending ? "animate-spin" : ""}`}>
              <MaterialIcon name="inventory" />
            </span>
          </Button>
```

- [ ] **Step 2: Type-check + lint**

Run from `inventory-dashboard/`: `npx tsc -b && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add inventory-dashboard/src/components/layout/Header.tsx
git commit -m "Add manual Comax sync button to header"
```

---

### Task 14: Vercel env var setup + deploy + backfill

**Files:**
- Configures: Vercel project env vars (no source files)

- [ ] **Step 1: Generate a token and tell the user how to set the env vars**

Run locally to generate a random token:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Print the output. Then instruct the user:

> Set both env vars in Vercel (Production scope): `MANUAL_SYNC_TOKEN=<token>` and `VITE_MANUAL_SYNC_TOKEN=<same token>`. Same value in both. (The `VITE_` one is baked into the browser bundle; the bare one is read by the serverless function.)

Wait for confirmation that the user has set them.

- [ ] **Step 2: Deploy**

Run from `inventory-dashboard/`:

```bash
vercel --prod
```

Expected: successful deploy, prints production URL.

- [ ] **Step 3: Backfill — click the new button**

Tell the user: open the dashboard, hit the new sync icon (next to the existing sync icon in the header). Expected toast: `עודכנו N פריטים מ-1 מיילים` (where N matches the row count of today's Comax email).

- [ ] **Step 4: Verify the fix**

Confirm three things:

1. **Dashboard:** SKU 461444 now shows the email's value (e.g., 790), not 121.
2. **Sheets `comax-audit` tab:** has a new row for today with `items_updated > 0` and `error` empty.
3. **Gmail:** open the Comax email — it now has a `comax-processed` label.

If all three pass, the fix is verified.

- [ ] **Step 5: Idempotency check**

Click the manual sync button again. Expected toast: `אין מיילים חדשים מ-Comax לעיבוד`. The audit sheet gains no new row. This proves the label-based dedup works.

---

## Verification summary

After Task 14, the system should:

1. Process every Comax email in the last 7 days that lacks the `comax-processed` label.
2. Apply the label only on success (failed emails retry on the next cron).
3. Stamp each history row with the email's send date in IL timezone.
4. Skip duplicate `(item_code, date)` history rows on re-run.
5. Update stock with one batched `setValues` call (no timeout risk).
6. Append one row to `comax-audit` per email processed (success or failure).
7. Run automatically at 07:30, 10:15, and 15:00 IL time.
8. Allow manual on-demand sync from the dashboard header button.

If any of those don't hold, return to the failing task.
