export interface Product {
  name: string;           // שם פריט
  sku: string;            // פריט
  manufacturer: string;   // ספק
  minAmount: number;      // מינימום
  fixedAssignment: string; // שיוך קבוע
  warehouseQty: number;   // יתרת מלאי
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
