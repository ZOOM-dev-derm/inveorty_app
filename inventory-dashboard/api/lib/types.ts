/** Item extracted by the LLM from a supplier email */
export interface LlmExtractedItem {
  sku: string;
  status: string;
  quantity: number | null;
  expectedDate: string | null;
  confirmed: boolean;
}

/** An open order from the Orders sheet */
export interface OpenOrder {
  rowIndex: number;
  supplierSku: string;
  dermaSku: string;
  existingLog: string;
  received: string;
  orderDate: string;
  quantity: number;
  productName: string;
}

/** A write operation to apply to an order row */
export interface OrderUpdate {
  rowIndex: number;
  logEntry: string;
  expectedDate?: string;
}

/** An ambiguous message that needs manual linking */
export interface PendingMessage {
  date: string;
  subject: string;
  supplierSku: string;
  status: string;
  quantity: number | null;
  expectedDate: string | null;
}

/** Abstract writer — swap implementation when changing database */
export interface OrderUpdateWriter {
  appendLog(rowIndex: number, logEntry: string): Promise<void>;
  updateExpectedDate(rowIndex: number, date: string): Promise<void>;
}
