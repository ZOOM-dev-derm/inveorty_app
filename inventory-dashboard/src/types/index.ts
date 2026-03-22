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
  expectedDate: string;
  comments: string;
  container: string;       // מיכל
  rowIndex: number;        // 1-based row in the sheet (for updates)
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

export interface ForecastPoint {
  date: string;
  quantity: number | null;
  forecast: number | null;
  onTheWay: number | null;
  minAmount: number | null;
}
