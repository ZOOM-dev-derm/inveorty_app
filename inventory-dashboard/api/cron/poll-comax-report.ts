import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchUnreadEmailsWithAttachments, markAsRead } from "../lib/gmail.js";
import { parseComaxReport } from "../lib/comax-parser.js";
import { AppsScriptWriter } from "../lib/sheets-writer.js";

const COMAX_QUERY =
  "from:ComaxNotification_Do_Not_Reply@comax.co.il is:unread";

function todayDateString(): string {
  return new Date().toLocaleDateString("en-GB", {
    timeZone: "Asia/Jerusalem",
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const emails = await fetchUnreadEmailsWithAttachments(COMAX_QUERY);
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
        await writer.bulkAddHistory(
          items.map((i) => ({
            item_code: i.item_code,
            inventory: i.inventory,
            date: today,
          }))
        );

        // Update products stock
        const stockResult = await writer.bulkUpdateStock(
          items.map((i) => ({ sku: i.item_code, qty: i.inventory }))
        );

        // Auto-add new products not found in Products sheet
        if (stockResult.notFound.length > 0) {
          const itemMap = new Map(items.map((i) => [i.item_code, i]));
          const productsToAdd = stockResult.notFound.map((sku) => {
            const item = itemMap.get(sku);
            return {
              sku,
              name: item?.product_name || "",
              stock: item?.inventory ?? 0,
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

    return res.status(200).json({
      message: `Processed ${emails.length} email(s), ${totalItems} items updated, ${totalNewProducts} new product(s) added`,
      processed: emails.length,
      items: totalItems,
      newProducts: totalNewProducts,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("Poll Comax report failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
