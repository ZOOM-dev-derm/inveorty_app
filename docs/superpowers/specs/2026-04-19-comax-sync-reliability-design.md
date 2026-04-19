# Comax Sync Reliability — Design

**Date:** 2026-04-19
**Status:** approved

## Problem

The daily Comax inventory sync silently misses days. On 2026-04-19 the dashboard
showed `121` for SKU `461444` while that day's Comax email reported `790` —
matching the value from the saved 2026-04-13 CSV. The dashboard had been stuck
on April 13 data for that SKU for six days.

### Root cause

`api/cron/poll-comax-report.ts` queries Gmail with:

```js
`from:ComaxNotification_Do_Not_Reply@comax.co.il is:unread after:${YYYY/MM/DD}`
```

Three failure modes:

1. **Human reads the email first** → Gmail flips it to read → cron's `is:unread`
   filter skips it forever.
2. **Email arrives after the last cron of the day (15:00 IL)** → never processed
   today; tomorrow's `after:today` filter excludes it.
3. **Both crons fail/skip on a given day** → that day's data is permanently lost.

There is no audit trail of cron runs, so silent failures stay invisible until
a stakeholder spot-checks a number.

A secondary concern: `bulkUpdateStock` in `apps-script/Code.js` does ~600
individual `setValue` calls per email. Apps Script has a 6-minute execution
limit; per-cell writes are notoriously slow and risk timeout.

## Goals

- Process every Comax email exactly once, regardless of read status or arrival time.
- Recover automatically from missed days (within a 7-day window).
- When backfilling a missed day, write history with the **email's** date, not
  today's date — otherwise the forecast graph is corrupted.
- Surface failures so they don't stay silent.
- Give a human an in-product escape hatch when something needs to be re-run now.
- Eliminate the per-cell-write timeout risk.

## Non-goals

- Multi-warehouse aggregation. Inspection of the real CSV (629 rows) confirmed
  every SKU appears exactly once — no aggregation needed.
- Migrating off Google Sheets.
- Reprocessing Comax emails older than 7 days (out of scope; would require a
  separate one-shot tool).

## Design

### 1. Apps Script (`apps-script/Code.js`)

#### 1a. Rewrite `bulkUpdateStock` to batched IO

Replace the per-cell write loop with one read + one write:

```js
function bulkUpdateStock(ss, data) {
  // 1. Read entire stock column once (single getValues)
  // 2. Build sku -> rowIndex map from that read
  // 3. Modify the in-memory 2D array for matched SKUs
  // 4. Write the entire column back in ONE setValues call
  // Return: { success, updated, notFound }
}
```

Behavior unchanged from the caller's perspective. Eliminates timeout risk.

#### 1b. New action `bulkAddHistoryIfMissing`

```
data.rows = [{ item_code, inventory, date }]
```

1. Read the History sheet once.
2. Build a `Set` of `"item_code|date"` keys from existing rows.
3. Filter incoming rows whose key is not in the Set.
4. Append the filtered rows in one `setValues` call.

Returns `{ success, added, skipped }`. Idempotent — safe to call twice with
the same email.

The existing `bulkAddHistory` action stays for backwards compatibility but is
no longer called by the cron.

#### 1c. New action `appendComaxAuditLog`

```
data = { timestamp, emailSubject, emailDate, itemsUpdated, itemsNotFound, error }
```

1. Find or auto-create a sheet named `comax-audit` with headers:
   `timestamp | email_subject | email_date | items_updated | items_not_found | error`
2. Append one row.

Self-bootstrapping (creates the sheet on first call). One row per email
processed (or attempted).

### 2. Cron handler (`inventory-dashboard/api/cron/poll-comax-report.ts`)

#### 2a. New query

```ts
function comaxQuery(): string {
  return `from:ComaxNotification_Do_Not_Reply@comax.co.il -label:comax-processed newer_than:7d`;
}
```

Drops `is:unread` and the date filter. Picks up any Comax email from the last
7 days that hasn't yet been labeled `comax-processed`.

#### 2b. Use the email's send date for history entries

```ts
function emailDateToDDMMYYYY(d: Date): string {
  const il = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const yyyy = il.getFullYear();
  const mm = String(il.getMonth() + 1).padStart(2, "0");
  const dd = String(il.getDate()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy}`;
}
```

Per-email date replaces the single `today` constant. A Friday email processed
Sunday morning gets `18/04/2026` in History, not `20/04/2026`.

#### 2c. Per-email flow

1. Find Excel/CSV attachment → parse → get items
2. `emailDate = emailDateToDDMMYYYY(email.date)`
3. Call `bulkAddHistoryIfMissing` (idempotent on `item_code|date`)
4. Call `bulkUpdateStock` (latest value wins; non-idempotent semantics fine
   because we only call it for un-labeled emails, processed in date order)
5. **On success:** call `applyLabel(email.id, "comax-processed")`
6. **Always (success or fail):** call `appendComaxAuditLog` with the result

On error, the label is **not** applied → the next cron retries.

When multiple un-processed emails exist in the 7-day window, sort by send
date ascending so the *most recent* one wins the `bulkUpdateStock` call —
matching real-world expectation that the latest snapshot is current truth.

#### 2d. New cron schedule (`inventory-dashboard/vercel.json`)

```json
{ "path": "/api/cron/poll-comax-report", "schedule": "30 4 * * *" },
{ "path": "/api/cron/poll-comax-report", "schedule": "15 7 * * *" },
{ "path": "/api/cron/poll-comax-report", "schedule": "0 12 * * *"  }
```

Times in IL (UTC+3 DST): 07:30, 10:15, 15:00. The 07:30 run catches anything
that arrived after yesterday's last cron.

### 3. Gmail helper (`inventory-dashboard/api/lib/gmail.ts`)

New function:

```ts
export async function applyLabel(
  messageId: string,
  labelName: string
): Promise<void>
```

1. List user labels; if `labelName` doesn't exist, create it.
2. Cache the resolved label ID in a module-scope map (avoid repeated lookups
   within a single cron invocation).
3. Call `gmail.users.messages.modify` with `addLabelIds: [labelId]`.

`markAsRead` stays in the file (still used by `poll-supplier-emails`) but
the Comax cron no longer calls it.

### 4. Manual sync endpoint (`inventory-dashboard/api/manual/sync-comax.ts`)

New file. Same processing logic as the cron handler, factored into a shared
helper `processComaxEmails()` that both files call.

Auth: header `X-Manual-Sync-Token` must match `MANUAL_SYNC_TOKEN` env var.
The dashboard ships the token as `VITE_MANUAL_SYNC_TOKEN` — not a true
secret (visible in the bundle), but enough to deter casual abuse since the
URL isn't published.

Returns:

```json
{ "processed": <int>, "items": <int>, "newProducts": <int>, "errors": [...] }
```

### 5. Dashboard button (`inventory-dashboard/src/components/Dashboard.tsx`)

Small button in the header, next to existing controls:

```tsx
<Button variant="outline" size="sm" onClick={handleSyncComax} disabled={syncing}>
  {syncing ? "מסנכרן..." : "סנכרן מלאי עכשיו"}
</Button>
```

`handleSyncComax`:

1. POST `/api/manual/sync-comax` with the auth header.
2. On success, toast: `עודכנו {items} פריטים מ-{processed} מיילים`.
3. On error, toast the error message in red.
4. After success, invalidate the React Query keys for products + history so
   the UI re-fetches without a manual reload.

## Backfill plan

After deploy:

1. User clicks the new button once.
2. The label-based query picks up today's still-unprocessed Comax email,
   processes it, applies the label.
3. Dashboard shows `790` for SKU `461444`. History gets a row for `19/04/2026`.

No data migration script needed — the new query naturally backfills.

## Testing

- **Unit:** `comax-parser.test.ts` — unchanged, still passes.
- **New unit:** `bulk-add-history-if-missing.test.ts` — pure JS logic test
  for the dedup filter (build a Set, filter rows, return added/skipped counts).
- **New unit:** `email-date-to-ddmmyyyy.test.ts` — covers IL timezone edge
  cases (email arrives at 23:30 UTC = 02:30 IL next day, etc.).
- **Manual integration:** deploy → click button → verify
  - Dashboard updates SKU 461444 to 790
  - `comax-audit` sheet has a new row with success status
  - The Gmail email gains the `comax-processed` label
  - Clicking the button a second time → audit row says `skipped` for history,
    `updated: 0` (no items in any new email)

## Files touched

- `apps-script/Code.js` — rewrite `bulkUpdateStock`, add `bulkAddHistoryIfMissing`,
  add `appendComaxAuditLog`, register the new actions in the `doPost` switch.
- `inventory-dashboard/api/cron/poll-comax-report.ts` — new query, email-date-aware
  history, sort by date, label instead of mark-as-read, audit log calls. Extract
  shared `processComaxEmails()` helper.
- `inventory-dashboard/api/manual/sync-comax.ts` — new file, calls shared helper.
- `inventory-dashboard/api/lib/gmail.ts` — add `applyLabel`.
- `inventory-dashboard/api/lib/comax-processor.ts` — new file, shared
  `processComaxEmails()` and `processOneComaxEmail()` helpers.
- `inventory-dashboard/api/lib/sheets-writer.ts` — add `bulkAddHistoryIfMissing`
  and `appendComaxAuditLog` methods.
- `inventory-dashboard/vercel.json` — add the 04:30 UTC cron entry.
- `inventory-dashboard/src/components/Dashboard.tsx` — add the button + handler.
- `inventory-dashboard/.env` — add `MANUAL_SYNC_TOKEN` and `VITE_MANUAL_SYNC_TOKEN`.
- `inventory-dashboard/api/lib/email-date.ts` — new file, `emailDateToDDMMYYYY`.
- Tests above.

## Out of scope

- Replacing the bearer-auth on the existing cron endpoint (already works).
- Reprocessing pre-7-day emails.
- Multi-warehouse aggregation (not needed; verified one row per SKU).
