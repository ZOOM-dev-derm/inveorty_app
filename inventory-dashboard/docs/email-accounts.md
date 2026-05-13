# Email accounts — who gets what

The inventory dashboard touches three Google Workspace accounts. Mixing them up has caused real bugs (see "May 4 incident" below), so this document pins down who's responsible for what.

## Account map

| Account | Role | What lives here |
|---|---|---|
| `ZOOM@dermalosophy.co.il` | Brand inbox | General `Dermalosophy` mail. **Not used by the cron or Apps Script.** Marketing / customer-facing channel only. |
| `amit.b@dermalosophy.co.il` | Operator / owner | **Full daily Comax inventory report** arrives here. Google Sheets (the dashboard's source of truth) is owned by this account. `clasp login` for Apps Script also authenticates as Amit. |
| `logistics@dermalosophy.co.il` | Logistics / supplier comms | Communication with **Peer Pharm** (and other suppliers) flows through this inbox. Comax also sends the **"Alert 13 — Minimum Stock"** report here, but **not** the full inventory report. |

## How the cron should read mail

`api/cron/poll-comax-report.ts` calls the Gmail API using a refresh token stored in the Vercel env var `GMAIL_REFRESH_TOKEN`. That token determines which inbox is polled.

**The refresh token MUST be for `amit.b@dermalosophy.co.il`** — because that's where the full daily inventory report (~600+ items) is delivered. If the token is wrong, the cron silently polls the wrong inbox and processes whichever Comax mail happens to be there.

## May 4 incident

**Symptom**: SKU 46299 (and ~520 others) stopped getting daily stock updates. History sheet's daily row count cliffed from ~633 rows/day to ~118 on Mon 2026-05-04 and stayed at ~118 through 2026-05-13.

**Root cause**: At some point, the Vercel `GMAIL_REFRESH_TOKEN` for this cron was swapped from `amit.b@` to `logistics@`. After the swap, the cron started polling `logistics@`, where Comax sends only the **"Alert 13 — Minimum Stock"** report (~118 items), not the full inventory report. The pipeline then processed exactly what arrived — 118 items per day, leaving the other ~520 catalog SKUs frozen at their last-known values.

**Why it looked like a code bug**: the parser, `bulkAddHistory`, `bulkUpdateStock`, and Apps Script all worked correctly. They processed all 118 items they were given, so nothing surfaced as an error. The mismatch only became visible by comparing the full-catalog manual Comax export (638 rows) against the daily History writes (~118 rows).

**Fix**: regenerate the Gmail OAuth refresh token under `amit.b@dermalosophy.co.il` and update the Vercel project's `GMAIL_REFRESH_TOKEN` env var (also `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` if those tied to a different Google project under `logistics@`). After the swap, the cron will poll Amit's inbox and ingest the full inventory report again.

## Verification after fixing the token

1. Manually trigger the cron once (curl with `CRON_SECRET`).
2. In Vercel function logs, confirm:
   - `comax.attachment.picked: <filename> (mime) <size>B. head="..."` — head should NOT start with a "Minimum Stock Alert" header.
   - `Extracted N items from: <subject>` — N should be ~600+ (full inventory), not ~118.
   - `bulkAddHistory returned: {"success":true,"added":N}` — matches the item count.
3. Spot-check the Products sheet: SKU 46299 (and other previously stale items) should now show fresh stock matching the Comax UI.

## Future drift detection

`api/lib/sync-diagnostics.ts` runs after every successful sync and warns in Vercel logs when:
- Today's processed item count is < 50% of the prior 7-day average (`comax.dropoff`).
- More than 0 Products-sheet SKUs have no History entry in the last 7 days (`comax.stale`).

These would have flagged the May 4 incident the day it happened.
