import type { OrderUpdateWriter, PendingMessage } from "./types.js";

/**
 * Writes order updates via the existing Apps Script POST endpoint.
 * Swap this implementation when migrating away from Google Sheets.
 */
export class AppsScriptWriter implements OrderUpdateWriter {
  private url: string;

  constructor() {
    const url = process.env.APPS_SCRIPT_URL;
    if (!url) throw new Error("APPS_SCRIPT_URL not configured");
    this.url = url;
  }

  async appendLog(rowIndex: number, logEntry: string): Promise<void> {
    await this.post("updateOrderComments", {
      rowIndex,
      comment: logEntry,
    });
  }

  async updateExpectedDate(rowIndex: number, date: string): Promise<void> {
    await this.post("updateExpectedDate", {
      rowIndex,
      expectedDate: date,
    });
  }

  async addPendingMessage(msg: PendingMessage): Promise<void> {
    await this.post("addSupplierMessage", {
      date: msg.date,
      subject: msg.subject,
      supplierSku: msg.supplierSku,
      status: msg.status,
      quantity: msg.quantity != null ? String(msg.quantity) : "",
      expectedDate: msg.expectedDate || "",
    });
  }

  async bulkAddHistory(
    rows: Array<{ item_code: string; inventory: number; date: string }>
  ): Promise<void> {
    await this.post("bulkAddHistory", { rows });
  }

  async bulkUpdateStock(
    items: Array<{ sku: string; qty: number }>
  ): Promise<{ updated: number; notFound: string[] }> {
    const result = await this.post<{ updated: number; notFound: string[] }>(
      "bulkUpdateStock", { items }
    );
    return { updated: result.updated, notFound: result.notFound ?? [] };
  }

  async bulkAddProducts(
    products: Array<{ sku: string; name: string; stock: number }>
  ): Promise<{ added: number }> {
    return this.post<{ added: number }>("bulkAddProducts", { products });
  }

  private async post<T = Record<string, unknown>>(action: string, data: Record<string, unknown>): Promise<T> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, data }),
      redirect: "follow",
    });

    const result = await res.json();
    if (!result.success) {
      throw new Error(`Apps Script ${action} failed: ${result.error}`);
    }
    return result as T;
  }
}
