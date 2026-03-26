import { useState } from "react";
import type { StockJumpMatch } from "./useStockJumpDetector";

export interface ArrivedFlag {
  rowIndex: number;
  dermaSku: string;
  oldStock: number;
  newStock: number;
  jump: number;
  orderQuantity: string;
  productName: string;
  flaggedAt: string;
}

const ARRIVED_KEY = "arrived-orders";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function loadFlags(): Record<number, ArrivedFlag> {
  try {
    const raw = localStorage.getItem(ARRIVED_KEY);
    if (!raw) return {};
    const parsed: Record<number, ArrivedFlag> = JSON.parse(raw);
    const now = Date.now();
    const cleaned: Record<number, ArrivedFlag> = {};
    for (const [key, flag] of Object.entries(parsed)) {
      if (now - new Date(flag.flaggedAt).getTime() < MAX_AGE_MS) {
        cleaned[Number(key)] = flag;
      }
    }
    if (Object.keys(cleaned).length !== Object.keys(parsed).length) {
      localStorage.setItem(ARRIVED_KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return {};
  }
}

function saveFlags(flags: Record<number, ArrivedFlag>) {
  localStorage.setItem(ARRIVED_KEY, JSON.stringify(flags));
}

export function useArrivedFlags() {
  const [flags, setFlags] = useState<Record<number, ArrivedFlag>>(loadFlags);

  const flagAsArrived = (match: StockJumpMatch) => {
    const flag: ArrivedFlag = {
      rowIndex: match.order.rowIndex,
      dermaSku: match.order.dermaSku,
      oldStock: match.oldStock,
      newStock: match.newStock,
      jump: match.jump,
      orderQuantity: match.order.quantity,
      productName: match.product.name,
      flaggedAt: new Date().toISOString(),
    };
    setFlags((prev) => {
      const next = { ...prev, [flag.rowIndex]: flag };
      saveFlags(next);
      return next;
    });
  };

  const removeArrivedFlag = (rowIndex: number) => {
    setFlags((prev) => {
      const next = { ...prev };
      delete next[rowIndex];
      saveFlags(next);
      return next;
    });
  };

  return { arrivedFlags: flags, flagAsArrived, removeArrivedFlag };
}
