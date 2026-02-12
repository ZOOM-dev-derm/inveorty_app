import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchInventory, fetchProducts, fetchOrders, fetchHistory, fetchMinAmount, addProduct, addOrder, updateOrderStatus, syncMissingProducts } from "@/services/googleSheets";
import type { InventoryItem, Product, Order, LowStockItem, InventoryOverviewItem, HistoryItem, ForecastPoint, MinAmountItem } from "@/types";

const FIVE_MINUTES = 5 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;

export function useInventory() {
  return useQuery<InventoryItem[]>({
    queryKey: ["inventory"],
    queryFn: fetchInventory,
    refetchInterval: FIVE_MINUTES,
  });
}

export function useProducts() {
  return useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: fetchProducts,
    refetchInterval: TEN_MINUTES,
  });
}

export function useOrders() {
  return useQuery<Order[]>({
    queryKey: ["orders"],
    queryFn: fetchOrders,
    refetchInterval: FIVE_MINUTES,
  });
}

export function useHistory() {
  return useQuery<HistoryItem[]>({
    queryKey: ["history"],
    queryFn: fetchHistory,
    refetchInterval: FIVE_MINUTES,
  });
}

export function useMinAmount() {
  return useQuery<MinAmountItem[]>({
    queryKey: ["minAmount"],
    queryFn: fetchMinAmount,
    refetchInterval: TEN_MINUTES,
  });
}

export function useProductForecast(sku: string, currentStock: number) {
  const { data: history, isLoading: histLoading, error: histError } = useHistory();
  const { data: orders, isLoading: ordLoading, error: ordError } = useOrders();
  const { data: minAmountData, isLoading: minLoading, error: minError } = useMinAmount();

  const isLoading = histLoading || ordLoading || minLoading;
  const error = histError || ordError || minError;

  let chartData: ForecastPoint[] = [];
  let declineRate = 0;
  let minAmount: number | null = null;
  let realRate = 0; // actual linear regression rate (units/day)
  let minRate = 0;  // min-based rate (units/day)

  // Find min amount for this SKU
  if (minAmountData) {
    const found = minAmountData.find((m) => m.sku === sku);
    if (found) {
      minAmount = found.minAmount;
      minRate = -(minAmount / 180); // negative = decline, units per day
    }
  }

  if (history && orders) {
    // Filter history for this SKU and sort by date
    const skuHistory = history
      .filter((h) => h.sku === sku)
      .map((h) => ({ ...h, dateObj: parseDate(h.date) }))
      .filter((h) => h.dateObj !== null)
      .sort((a, b) => a.dateObj!.getTime() - b.dateObj!.getTime())
      .filter((h, i, arr) => {
        if (i === 0) return true;
        const prev = arr[i - 1];
        return formatDateShort(h.dateObj!) !== formatDateShort(prev.dateObj!) || h.quantity !== prev.quantity;
      });

    if (skuHistory.length >= 2) {
      // Calculate rate of decline (units per day) using linear regression
      const firstDate = skuHistory[0].dateObj!.getTime();
      const points = skuHistory.map((h) => ({
        x: (h.dateObj!.getTime() - firstDate) / (1000 * 60 * 60 * 24), // days
        y: h.quantity,
      }));

      const n = points.length;
      const sumX = points.reduce((s, p) => s + p.x, 0);
      const sumY = points.reduce((s, p) => s + p.y, 0);
      const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
      const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      realRate = slope; // units per day (negative = declining)

      // Use min-based rate for forecast if available, otherwise fall back to linear regression
      const forecastSlope = minAmount !== null ? minRate : slope;
      declineRate = forecastSlope;

      // Historical data points
      const lastDate = skuHistory[skuHistory.length - 1].dateObj!;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      chartData = skuHistory.map((h, i) => ({
        date: formatDateShort(h.dateObj!),
        quantity: h.quantity,
        forecast: i === skuHistory.length - 1 ? currentStock : null,
        onTheWay: null,
        minAmount: minAmount,
      }));

      // Add a transition point at today if the last history date isn't today
      const lastDateNorm = new Date(lastDate);
      lastDateNorm.setHours(0, 0, 0, 0);
      if (lastDateNorm.getTime() !== today.getTime()) {
        chartData.push({
          date: formatDateShort(today),
          quantity: null,
          forecast: currentStock,
          onTheWay: null,
          minAmount: minAmount,
        });
      }

      // Get open orders for this SKU with expected dates
      const RECEIVED_VALUES = ["כן", "v", "✓", "true", "yes"];
      const rawSkuOrders = orders.filter((o) => o.dermaSku === sku);
      console.debug(`[Forecast] SKU ${sku}: ${rawSkuOrders.length} raw orders matching dermaSku`);
      console.debug(`[Forecast] SKU ${sku}: raw orders:`, rawSkuOrders.map(o => ({ dermaSku: o.dermaSku, received: o.received, qty: o.quantity, expected: o.expectedDate })));
      const skuOrders = rawSkuOrders
        .filter((o) => !RECEIVED_VALUES.includes((o.received || "").toString().trim().toLowerCase()))
        .map((o) => {
          let expectedDate = parseDate(o.expectedDate);
          // Fallback: estimate as order date + 3 months
          if (!expectedDate) {
            const orderDate = parseDate(o.orderDate);
            if (orderDate) {
              expectedDate = new Date(orderDate);
              expectedDate.setMonth(expectedDate.getMonth() + 3);
            }
          }
          return { qty: parseInt(o.quantity, 10) || 0, expectedDate };
        })
        .filter((o) => o.expectedDate !== null)
        .sort((a, b) => a.expectedDate!.getTime() - b.expectedDate!.getTime());
      console.debug(`[Forecast] SKU ${sku}: ${skuOrders.length} open orders after filtering`, skuOrders);

      // Generate forecast points (every 7 days) with two lines:
      // - forecast: decline only (no orders)
      // - onTheWay: decline + order arrivals (shows spikes)
      const forecastStart = today > lastDate ? today : lastDate;

      // Add overdue orders to starting quantity (both lines start here)
      let overdueQty = 0;
      for (const order of skuOrders) {
        if (order.expectedDate! <= forecastStart) {
          overdueQty += order.qty;
          console.debug(`[Forecast] SKU ${sku}: adding overdue order qty ${order.qty} (expected ${order.expectedDate!.toISOString().slice(0, 10)})`);
        }
      }
      const startQty = currentStock + overdueQty;

      // Update the transition point at today to reflect overdue orders
      const todayLabel = formatDateShort(today);
      const todayPoint = chartData.find((p) => p.date === todayLabel && p.forecast !== null);
      if (todayPoint) {
        todayPoint.forecast = startQty;
        if (skuOrders.length > 0) {
          todayPoint.onTheWay = startQty;
        }
      }

      let runningForecast = startQty;
      let runningWithOrders = startQty;
      const hasOrders = skuOrders.length > 0;

      for (let i = 1; i <= 26; i++) {
        const prevDate = new Date(forecastStart);
        prevDate.setDate(prevDate.getDate() + (i - 1) * 7);
        const futureDate = new Date(forecastStart);
        futureDate.setDate(futureDate.getDate() + i * 7);

        // Apply decline for 7 days to both lines
        runningForecast = runningForecast + forecastSlope * 7;
        runningWithOrders = runningWithOrders + forecastSlope * 7;

        // Add orders only to the withOrders line
        for (const order of skuOrders) {
          if (order.expectedDate! > prevDate && order.expectedDate! <= futureDate) {
            runningWithOrders += order.qty;
          }
        }

        chartData.push({
          date: formatDateShort(futureDate),
          quantity: null,
          forecast: Math.max(0, Math.round(runningForecast)),
          onTheWay: hasOrders ? Math.max(0, Math.round(runningWithOrders)) : null,
          minAmount: minAmount,
        });
      }
    } else if (currentStock > 0) {
      // No history — use current stock as starting point
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const forecastSlope = minAmount !== null ? minRate : 0;
      declineRate = forecastSlope;

      chartData.push({
        date: formatDateShort(today),
        quantity: currentStock,
        forecast: currentStock,
        onTheWay: null,
        minAmount: minAmount,
      });

      // Open orders for this SKU
      const RECEIVED_VALUES = ["כן", "v", "✓", "true", "yes"];
      const skuOrders = orders
        .filter((o) => o.dermaSku === sku)
        .filter((o) => !RECEIVED_VALUES.includes((o.received || "").toString().trim().toLowerCase()))
        .map((o) => {
          let expectedDate = parseDate(o.expectedDate);
          // Fallback: estimate as order date + 3 months
          if (!expectedDate) {
            const orderDate = parseDate(o.orderDate);
            if (orderDate) {
              expectedDate = new Date(orderDate);
              expectedDate.setMonth(expectedDate.getMonth() + 3);
            }
          }
          return { qty: parseInt(o.quantity, 10) || 0, expectedDate };
        })
        .filter((o) => o.expectedDate !== null)
        .sort((a, b) => a.expectedDate!.getTime() - b.expectedDate!.getTime());

      // Generate 26 forecast points at 7-day (weekly) intervals
      // Add overdue orders to starting quantity
      let overdueQty = 0;
      for (const order of skuOrders) {
        if (order.expectedDate! <= today) {
          overdueQty += order.qty;
        }
      }
      const startQty = currentStock + overdueQty;

      // Update starting point to reflect overdue orders
      if (chartData.length > 0) {
        chartData[chartData.length - 1].forecast = startQty;
        if (skuOrders.length > 0) {
          chartData[chartData.length - 1].onTheWay = startQty;
        }
      }

      let runningForecast = startQty;
      let runningWithOrders = startQty;
      const hasOrders = skuOrders.length > 0;

      for (let i = 1; i <= 26; i++) {
        const prevDate = new Date(today);
        prevDate.setDate(prevDate.getDate() + (i - 1) * 7);
        const futureDate = new Date(today);
        futureDate.setDate(futureDate.getDate() + i * 7);

        runningForecast = runningForecast + forecastSlope * 7;
        runningWithOrders = runningWithOrders + forecastSlope * 7;

        for (const order of skuOrders) {
          if (order.expectedDate! > prevDate && order.expectedDate! <= futureDate) {
            runningWithOrders += order.qty;
          }
        }

        chartData.push({
          date: formatDateShort(futureDate),
          quantity: null,
          forecast: Math.max(0, Math.round(runningForecast)),
          onTheWay: hasOrders ? Math.max(0, Math.round(runningWithOrders)) : null,
          minAmount: minAmount,
        });
      }
    }
  }

  return { chartData, declineRate, minAmount, realRate, minRate, isLoading, error };
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  // Try DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY
  const parts = dateStr.split(/[\/\.\-]/);
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const fullYear = year < 100 ? 2000 + year : year;
    const d = new Date(fullYear, month, day);
    if (!isNaN(d.getTime())) return d;
  }
  // Try ISO format
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateShort(d: Date): string {
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
}

// ── Mutation hooks ──

export function useAddProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; sku: string; barcode: string }) => addProduct(data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useAddOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: { orderDate: string; supplierSku: string; dermaSku: string; quantity: string; productName: string; expectedDate: string }) => addOrder(data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export function useUpdateOrderStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: { rowIndex: number; received: boolean }) => updateOrderStatus(data.rowIndex, data.received),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export function useSyncMissingProducts() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => syncMissingProducts(),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useOpenOrders() {
  const { data: orders, isLoading, error } = useOrders();

  const RECEIVED_VALUES = ["כן", "v", "✓", "true", "yes"];
  const openOrders = orders?.filter((order) =>
    !RECEIVED_VALUES.includes((order.received || "").toString().trim().toLowerCase())
  ) ?? [];

  return { data: openOrders, isLoading, error };
}

export function useLowStockItems() {
  const { data: inventory, isLoading: invLoading, error: invError } = useInventory();
  const { data: products, isLoading: prodLoading, error: prodError } = useProducts();

  const isLoading = invLoading || prodLoading;
  const error = invError || prodError;

  let lowStockItems: LowStockItem[] = [];

  if (inventory && products) {
    // Take last occurrence of each SKU (most recent quantity)
    const skuMap = new Map<string, number>();
    for (const item of inventory) {
      skuMap.set(item.sku, item.quantity);
    }

    // Build product name lookup
    const productMap = new Map<string, string>();
    for (const product of products) {
      productMap.set(product.sku, product.name);
    }

    // Join and filter
    lowStockItems = Array.from(skuMap.entries())
      .filter(([, qty]) => qty < 15)
      .map(([sku, quantity]) => ({
        productName: productMap.get(sku) ?? sku,
        sku,
        quantity,
      }))
      .sort((a, b) => a.quantity - b.quantity);
  }

  return { data: lowStockItems, isLoading, error };
}

export function useInventoryOverview() {
  const { data: products, isLoading: prodLoading, error: prodError } = useProducts();
  const { data: orders, isLoading: ordLoading, error: ordError } = useOrders();

  const isLoading = prodLoading || ordLoading;
  const error = prodError || ordError;

  let items: InventoryOverviewItem[] = [];

  if (products && orders) {
    // On the way: sum quantities of open orders, grouped by dermaSku
    const onTheWayMap = new Map<string, number>();
    for (const order of orders) {
      const RECEIVED_VALUES = ["כן", "v", "✓", "true", "yes"];
      if (!RECEIVED_VALUES.includes((order.received || "").toString().trim().toLowerCase()) && order.dermaSku) {
        const qty = parseInt(order.quantity, 10) || 0;
        onTheWayMap.set(order.dermaSku, (onTheWayMap.get(order.dermaSku) ?? 0) + qty);
      }
    }

    // Build overview from products list, using warehouseQty from Products sheet
    items = products
      .map((product) => ({
        productName: product.name,
        sku: product.sku,
        currentStock: product.warehouseQty,
        onTheWay: onTheWayMap.get(product.sku) ?? 0,
      }))
      .filter((item) => item.currentStock > 0 || item.onTheWay > 0);
  }

  return { data: items, isLoading, error };
}
