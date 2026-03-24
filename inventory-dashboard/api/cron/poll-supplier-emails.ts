import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fetchUnreadSupplierEmails, markAsRead } from "../lib/gmail.js";
import { callLlmPlainText, callLlmStructured } from "../lib/anthropic.js";
import { fetchOpenOrders, buildSkuIndex, matchAndBuildUpdates } from "../lib/orders.js";
import { AppsScriptWriter } from "../lib/sheets-writer.js";

const SUPPLIER_EMAIL = "operating2@peerpharm.com";

function formatDate(date: Date): string {
  const d = date.toLocaleDateString("en-GB", { timeZone: "Asia/Jerusalem" });
  // en-GB gives DD/MM/YYYY
  return d;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret (Vercel sends Authorization header for cron jobs)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // 1. Fetch unread supplier emails
    const emails = await fetchUnreadSupplierEmails(SUPPLIER_EMAIL);
    if (emails.length === 0) {
      return res.status(200).json({ message: "No unread emails", processed: 0 });
    }

    console.log(`Found ${emails.length} unread emails from ${SUPPLIER_EMAIL}`);

    // 2. Fetch open orders and build SKU index
    const openOrders = await fetchOpenOrders();
    const skuIndex = buildSkuIndex(openOrders);
    const writer = new AppsScriptWriter();

    let totalUpdated = 0;
    let totalPending = 0;
    const errors: string[] = [];

    // 3. Process each email
    for (const email of emails) {
      try {
        const emailDate = formatDate(email.date);

        // Check for tagged email: [DL-{dermaSku}--{orderDate}]
        const tagMatch = email.subject.match(/\[DL-([^\]]+?)--([^\]]+?)\]/);

        if (tagMatch) {
          // Tagged flow: find specific order by dermaSku + orderDate, append plain text summary
          const dermaSku = tagMatch[1];
          const orderDate = tagMatch[2];
          const summary = await callLlmPlainText(email.body, email.subject);

          if (summary) {
            // Find matching order by dermaSku and orderDate
            const matchingOrder = openOrders.find(
              (o) => o.dermaSku === dermaSku
            );
            if (matchingOrder) {
              const logEntry = `${emailDate}: [ספק] ${summary}`;
              await writer.appendLog(matchingOrder.rowIndex, logEntry);
              totalUpdated++;
              console.log(`Tagged: DL-${dermaSku}--${orderDate} → ${summary}`);
            }
          }
        } else {
          // Untagged flow: extract structured SKU data
          const items = await callLlmStructured(email.body, email.subject);
          if (items.length > 0) {
            const { updates, pending } = matchAndBuildUpdates(items, skuIndex, emailDate, email.subject);

            for (const update of updates) {
              await writer.appendLog(update.rowIndex, update.logEntry);
              if (update.expectedDate) {
                await writer.updateExpectedDate(update.rowIndex, update.expectedDate);
              }
              totalUpdated++;
            }

            for (const msg of pending) {
              await writer.addPendingMessage(msg);
              totalPending++;
            }

            console.log(`Untagged: ${items.length} SKUs extracted, ${updates.length} updated, ${pending.length} pending. Subject: ${email.subject}`);
          } else {
            console.log(`No SKUs extracted from: ${email.subject}`);
          }
        }

        // Mark as read after successful processing
        await markAsRead(email.id);
      } catch (err) {
        const msg = `Failed processing "${email.subject}": ${err}`;
        console.error(msg);
        errors.push(msg);
      }
    }

    return res.status(200).json({
      message: `Processed ${emails.length} emails, updated ${totalUpdated} orders, ${totalPending} pending`,
      processed: emails.length,
      updated: totalUpdated,
      pending: totalPending,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("Poll supplier emails failed:", err);
    return res.status(500).json({ error: String(err) });
  }
}
