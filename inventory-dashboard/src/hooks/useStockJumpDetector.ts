import { useRef, useState, useEffect } from "react";
import { useProducts, useOrders } from "./useSheetData";
import type { Product, Order } from "@/types";

export interface StockJumpMatch {
  order: Order;
  product: Product;
  oldStock: number;
  newStock: number;
  jump: number;
}

const RECEIVED_VALUES = ["כן", "v", "✓", "true", "yes"];
const STORAGE_KEY = "stock-snapshot";
const CHECKED_KEY = "stock-check-date";

function isOpenOrder(order: Order): boolean {
  return !RECEIVED_VALUES.includes((order.received || "").toString().trim().toLowerCase());
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function isAfter8AM(): boolean {
  return new Date().getHours() >= 8;
}

function loadSnapshot(): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSnapshot(map: Map<string, number>) {
  const obj: Record<string, number> = {};
  for (const [k, v] of map) obj[k] = v;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

export function useStockJumpDetector() {
  const { data: products } = useProducts();
  const { data: orders } = useOrders();
  const checkedRef = useRef(false);
  const dismissedSet = useRef<Set<number>>(new Set());
  const [pendingMatches, setPendingMatches] = useState<StockJumpMatch[]>([]);

  useEffect(() => {
    if (!products || !orders) return;
    if (checkedRef.current) return;

    // Only run once per day, after 8 AM
    if (!isAfter8AM()) return; // re-check on next render/refetch
    const lastChecked = localStorage.getItem(CHECKED_KEY);
    if (lastChecked === todayStr()) {
      checkedRef.current = true;
      return;
    }

    const prevSnapshot = loadSnapshot();

    // Build current stock map
    const currentMap = new Map<string, number>();
    for (const p of products) {
      if (p.sku) currentMap.set(p.sku, p.warehouseQty);
    }

    // First time — just save snapshot, no comparison
    if (!prevSnapshot) {
      saveSnapshot(currentMap);
      localStorage.setItem(CHECKED_KEY, todayStr());
      checkedRef.current = true;
      return;
    }

    const openOrders = orders.filter(isOpenOrder);
    const newMatches: StockJumpMatch[] = [];

    for (const product of products) {
      if (!product.sku) continue;
      const oldStock = prevSnapshot[product.sku];
      if (oldStock === undefined) continue;

      const jump = product.warehouseQty - oldStock;
      if (jump <= 0) continue;

      for (const order of openOrders) {
        if (order.dermaSku !== product.sku) continue;

        const orderQty = parseInt(order.quantity, 10) || 0;
        if (orderQty <= 0) continue;

        const ratio = Math.abs(jump - orderQty) / orderQty;
        if (ratio <= 0.2) {
          newMatches.push({
            order,
            product,
            oldStock,
            newStock: product.warehouseQty,
            jump,
          });
        }
      }
    }

    // Save today's snapshot and mark as checked
    saveSnapshot(currentMap);
    localStorage.setItem(CHECKED_KEY, todayStr());
    checkedRef.current = true;

    if (newMatches.length > 0) {
      setPendingMatches(newMatches);
    }
  }, [products, orders]);

  const dismiss = (rowIndex: number) => {
    dismissedSet.current.add(rowIndex);
    setPendingMatches((prev) => prev.filter((m) => m.order.rowIndex !== rowIndex));
  };

  const removeMatch = (rowIndex: number) => {
    setPendingMatches((prev) => prev.filter((m) => m.order.rowIndex !== rowIndex));
  };

  return { pendingMatches, dismiss, removeMatch };
}
