import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchUnreadEmailsWithAttachments, markAsRead } from "../lib/gmail.js";
import { parseComaxReport } from "../lib/comax-parser.js";
import { AppsScriptWriter } from "../lib/sheets-writer.js";
import { computeSyncDiagnostics } from "../lib/sync-diagnostics.js";

function todayDateString(): string {
  return new Date().toLocaleDateString("en-GB", {
    timeZone: "Asia/Jerusalem",
  });
}

/** Gmail date filter: only match emails from today (Asia/Jerusalem) */
function comaxQuery(): string {
  const now = new Date();
  const ilDate = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })
  );
  const yyyy = ilDate.getFullYear();
  const mm = String(ilDate.getMonth() + 1).padStart(2, "0");
  const dd = String(ilDate.getDate()).padStart(2, "0");
  return `from:ComaxNotification_Do_Not_Reply@comax.co.il is:unread after:${yyyy}/${mm}/${dd}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const emails = await fetchUnreadEmailsWithAttachments(comaxQuery());
    if (emails.length === 0) {
      return res
        .status(200)
        .json({ message: "No unread Comax reports", processed: 0 });
    }

    console.log(`Found ${emails.length} unread Comax report(s)`);

    const writer = new AppsScriptWriter();
    const today = todayDateString();
    let totalItems = 0;
    let totalNewProducts = 0;
    const errors: string[] = [];

    for (const email of emails) {
      try {
        // Log every attachment for diagnostics — Comax format drift / multi-attachment cases.
        console.log(
          `comax.attachments [${email.subject}]: ${email.attachments
            .map((a) => `${a.filename} (${a.mimeType}, ${a.data.length}B)`)
            .join(" | ") || "none"}`
        );

        // Find Excel attachment
        const excelAttachment = email.attachments.find(
          (a) =>
            a.filename.endsWith(".xls") ||
            a.filename.endsWith(".xlsx") ||
            a.filename.endsWith(".csv") ||
            a.mimeType.includes("spreadsheet") ||
            a.mimeType.includes("excel")
        );

        if (!excelAttachment) {
          console.log(
            `No Excel attachment in: ${email.subject} (attachments: ${email.attachments.map((a) => a.filename).join(", ")})`
          );
          await markAsRead(email.id);
          continue;
        }

        // Reveal format drift: first 200 ASCII bytes show HTML vs CSV vs binary Excel
        console.log(
          `comax.attachment.picked: ${excelAttachment.filename} (${excelAttachment.mimeType}, ${excelAttachment.data.length}B). head=${JSON.stringify(excelAttachment.data.subarray(0, 200).toString("ascii"))}`
        );

        // Parse the Excel file
        const items = parseComaxReport(excelAttachment.data);
        if (items.length === 0) {
          console.log(`No items extracted from: ${email.subject}`);
          await markAsRead(email.id);
          continue;
        }

        console.log(
          `Extracted ${items.length} items from: ${email.subject}`
        );

        // Write to history sheet
        const historyResult = await writer.bulkAddHistory(
          items.map((i) => ({
            item_code: i.item_code,
            inventory: i.inventory,
            date: today,
          }))
        );
        console.log(
          `bulkAddHistory returned: ${JSON.stringify(historyResult)} (sent ${items.length} rows)`
        );

        // Update products stock (clamp negatives to 0)
        const stockResult = await writer.bulkUpdateStock(
          items.map((i) => ({ sku: i.item_code, qty: Math.max(0, i.inventory) }))
        );
        console.log(
          `bulkUpdateStock: updated=${stockResult.updated}, notFound=${stockResult.notFound.length} (sent ${items.length})`
        );

        // Auto-add new products not found in Products sheet.
        // Note: notFound is logged loudly because every entry here is also a
        // duplicate-row risk if the SKU exists under a different normalization.
        if (stockResult.notFound.length > 0) {
          console.warn(
            `comax.notFound (${stockResult.notFound.length}): ${stockResult.notFound.join(", ")}`
          );
          const itemMap = new Map(items.map((i) => [i.item_code, i]));
          const productsToAdd = stockResult.notFound.map((sku) => {
            const item = itemMap.get(sku);
            return {
              sku,
              name: item?.product_name || "",
              stock: Math.max(0, item?.inventory ?? 0),
            };
          });

          await writer.bulkAddProducts(productsToAdd);
          totalNewProducts += productsToAdd.length;
          console.log(
            `Auto-added ${productsToAdd.length} new product(s): ${stockResult.notFound.join(", ")}`
          );
        }

        totalItems += items.length;
        await markAsRead(email.id);
      } catch (err) {
        const msg = `Failed processing "${email.subject}": ${err}`;
        console.error(msg);
        errors.push(msg);
      }
    }

    // Post-sync diagnostics: detect catalog-wide dropouts (Comax-side report
    // scope changes) and stale SKUs. Surfaces silently broken syncs that
    // succeed for some SKUs but freeze others.
    let diagnostics: Awaited<ReturnType<typeof computeSyncDiagnostics>> | undefined;
    try {
      diagnostics = await computeSyncDiagnostics();
      if (diagnostics.staleSkuCount > 0) {
        console.warn(
          `comax.stale: ${diagnostics.staleSkuCount} SKUs in Products sheet have no History entry in the last ${diagnostics.cutoffDays} days. Top: ${diagnostics.topStaleSkus.slice(0, 10).map((s) => s.sku).join(", ")}`
        );
      }
      if (diagnostics.todayCount > 0 && diagnostics.baselineAvg > 0) {
        const ratio = diagnostics.todayCount / diagnostics.baselineAvg;
        if (ratio < 0.5) {
          console.warn(
            `comax.dropoff: today's report has ${diagnostics.todayCount} items vs ${Math.round(diagnostics.baselineAvg)} avg (${Math.round(ratio * 100)}%). Possible Comax-side scope change.`
          );
        }
      }
    } catch (diagErr) {
      console.error("Diagnostics failed:", diagErr);
    }

    return res.status(200).json({
      message: `Processed ${emails.length} email(s), ${totalItems} items updated, ${totalNewProducts} new product(s) added`,
      processed: emails.length,
      items: totalItems,
      newProducts: totalNewProducts,
      errors: errors.length > 0 ? errors : undefined,
      diagnostics,
    });
  } catch (err) {
    console.error("Poll Comax report failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
