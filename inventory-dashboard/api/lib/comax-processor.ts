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

export async function processComaxEmails(
  query: string = defaultComaxQuery()
): Promise<ProcessResult> {
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
      try {
        await writer.appendComaxAuditLog({
          timestamp: new Date().toISOString(),
          emailSubject: email.subject,
          emailDate: emailDateToDDMMYYYY(email.date),
          itemsUpdated: 0,
          itemsNotFound: 0,
          error: String(err),
        });
      } catch {
        // audit best-effort
      }
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

  await writer.bulkAddHistoryIfMissing(
    items.map((i) => ({
      item_code: i.item_code,
      inventory: i.inventory,
      date: emailDate,
    }))
  );

  const stockResult = await writer.bulkUpdateStock(
    items.map((i) => ({ sku: i.item_code, qty: Math.max(0, i.inventory) }))
  );

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
