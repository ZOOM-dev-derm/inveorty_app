export interface Product {
  name: string;           // שם פריט
  sku: string;            // פריט
  manufacturer: string;   // ספק
  minAmount: number;      // מינימום
  fixedAssignment: string; // שיוך קבוע
  warehouseQty: number;   // יתרת מלאי
  supplierSku: string;    // מק"ט פאר פארם
  container: string;      // מיכל
}

export interface ConnectedProduct {
  groupNumber: string;    // מספר קבוצה
  groupName: string;      // שם קבוצה
  supplierSku: string;    // פריט פאר פארם
  productName: string;    // שם פריט
  label: string;          // תווית
  connectedSkus: string[]; // מקטים מחוברים
  dermaSku: string;       // מק"ט דרמלוסופי
}

export interface Order {
  orderDate: string;
  supplierSku: string;
  dermaSku: string;       // קוד דרמה
  quantity: string;
  productName: string;
  received: string;
  productionDate: string;  // תאריך יצור
  expectedDate: string;    // תאריך הגעה (legacy header: תאריך צפי)
  comments: string;
  container: string;       // מיכל
  rowIndex: number;        // 1-based row in the sheet (for updates)
  distributionNotes: string; // חלוקה+הערות
  packagingLabels: string;   // אריזות ומדבקות
  formula: string;           // פורמולה
  content: string;           // תכולה
}

export interface InventoryOverviewItem {
  productName: string;
  sku: string;
  currentStock: number;
  onTheWay: number;
}

export interface LowStockItem {
  productName: string;
  sku: string;
  quantity: number;
}

export interface HistoryItem {
  date: string;
  sku: string;
  quantity: number;
}

export interface SupplierMessage {
  date: string;           // תאריך
  subject: string;        // נושא
  supplierSku: string;    // מק"ט ספק
  status: string;         // סטטוס
  quantity: string;       // כמות
  expectedDate: string;   // צפי
  linkedOrder: string;    // שויך להזמנה (rowIndex or empty)
  handled: string;        // טופל (כן/empty)
  rowIndex: number;       // row in supplier-messages sheet
}

export interface SupplierEmail {
  id: string;
  threadId: string;
  subject: string;
  date: string;
  direction: "incoming" | "outgoing";
  body: string;
  orderTag: string | null;
}

export interface EmailThread {
  threadId: string;
  emails: SupplierEmail[];
  subject: string;
  latestDate: string;
  messageCount: number;
  orderTag: string | null;
  hasIncoming: boolean;
  hasOutgoing: boolean;
  latestDirection: "incoming" | "outgoing";
  latestBody: string;
}

export interface ForecastPoint {
  date: string;
  quantity: number | null;
  forecast: number | null;
  onTheWay: number | null;
  minAmount: number | null;
}
