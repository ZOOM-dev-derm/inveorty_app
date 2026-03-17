import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OpenOrders } from "./OpenOrders";

import { ProductGraph } from "./ProductGraph";
import { useInventoryOverview, useCriticalDates, useOpenOrders, useProducts, parseDate } from "@/hooks/useSheetData";
import { useSyncMissingProducts } from "@/hooks/useSheetData";
import { AddProductDialog } from "./AddProductDialog";
import { AddOrderDialog } from "./AddOrderDialog";
import { RefreshCw, Search, BarChart3, ShoppingCart, Loader2, ChevronDown, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo, useCallback, useRef, useEffect } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      retry: 2,
    },
  },
});

type Tab = "graphs" | "orders";

function DashboardContent() {
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("graphs");
  const [pinnedSku, setPinnedSku] = useState<string | null>(null);
  const [supplierFilter, setSupplierFilter] = useState<string>("");
  const [stockFilter, setStockFilter] = useState<"all" | "belowMin">("belowMin");
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const supplierDropdownRef = useRef<HTMLDivElement>(null);

  const { data: items, isLoading, error } = useInventoryOverview();
  const criticalDates = useCriticalDates(items ?? []);
  const { data: openOrders } = useOpenOrders();
  const { data: products } = useProducts();
  const syncMutation = useSyncMissingProducts();

  const handleNavigateToOrders = useCallback((productName: string) => {
    setSearch(productName);
    setActiveTab("orders");
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await client.invalidateQueries();
    setRefreshing(false);
  };

  const manufacturerByDermaSku = useMemo(() => {
    const map = new Map<string, string>();
    products?.forEach(p => map.set(p.sku, p.manufacturer));
    return map;
  }, [products]);

  const uniqueSuppliers = useMemo(() => {
    if (!products) return [];
    const set = new Set<string>();
    products.forEach(p => {
      if (p.manufacturer && p.manufacturer.trim()) set.add(p.manufacturer.trim());
    });
    return [...set].sort((a, b) => a.localeCompare(b, "he"));
  }, [products]);

  // Default supplier filter to first supplier containing "פאר פארם"
  const [supplierDefaultSet, setSupplierDefaultSet] = useState(false);
  useEffect(() => {
    if (!supplierDefaultSet && uniqueSuppliers.length > 0) {
      const match = uniqueSuppliers.find(s => s.includes("פאר פארם"));
      if (match) setSupplierFilter(match);
      setSupplierDefaultSet(true);
    }
  }, [uniqueSuppliers, supplierDefaultSet]);

  // Build set of SKUs with open orders
  const skusWithOpenOrders = useMemo(() => {
    return new Set(openOrders?.map((o) => o.dermaSku) ?? []);
  }, [openOrders]);

  // Earliest expected date per SKU from open orders (stores both display string and parsed Date)
  const earliestExpectedDate = useMemo(() => {
    const map = new Map<string, { display: string; date: Date }>();
    if (!openOrders) return map;
    for (const order of openOrders) {
      const d = parseDate(order.expectedDate);
      if (!d) continue;
      const existing = map.get(order.dermaSku);
      if (!existing) {
        map.set(order.dermaSku, { display: order.expectedDate, date: d });
      } else {
        if (d < existing.date) {
          map.set(order.dermaSku, { display: order.expectedDate, date: d });
        }
      }
    }
    return map;
  }, [openOrders]);

  // Days remaining per SKU: currentStock / (minAmount / 180)
  const daysRemaining = useMemo(() => {
    const map = new Map<string, number | null>();
    if (!items || !products) return map;
    for (const item of items) {
      const product = products.find(p => p.sku.trim() === item.sku.trim());
      if (!product || product.minAmount <= 0) {
        map.set(item.sku, null);
        continue;
      }
      const dailyUsage = product.minAmount / 180;
      map.set(item.sku, Math.round(item.currentStock / dailyUsage));
    }
    return map;
  }, [items, products]);

  // Close supplier dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(e.target as Node)) {
        setSupplierDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredItems = useMemo(() => {
    if (!items) return [];

    // Only show products that have a minimum amount defined
    const minAmountSkus = new Set(
      products?.filter((p) => p.minAmount > 0).map((p) => p.sku) ?? []
    );
    let result = items.filter((item) => minAmountSkus.has(item.sku));

    // Deduplicate by sku — Products sheet may have multiple rows per SKU (label variants, etc.)
    const seenSkus = new Set<string>();
    result = result.filter((item) => {
      if (seenSkus.has(item.sku)) return false;
      seenSkus.add(item.sku);
      return true;
    });

    // Filter by supplier
    if (supplierFilter) {
      result = result.filter((item) => {
        const manufacturer = manufacturerByDermaSku.get(item.sku) || "";
        return manufacturer.trim() === supplierFilter;
      });
    }

    if (search.trim()) {
      const terms = search.trim().toLowerCase().split(/\s+/);
      result = result.filter((item) => {
        const nameLower = (item.productName || "").toLowerCase();
        const dermaSku = (item.sku || "").toLowerCase();
        return terms.every(
          (term) =>
            nameLower.includes(term) ||
            dermaSku.startsWith(term)
        );
      });
    }

    // Filter by stock level
    if (stockFilter === "belowMin") {
      result = result.filter((item) => criticalDates.get(item.sku) != null);
    }

    // Sort by urgency:
    // Primary: days remaining ascending (lowest first)
    // Secondary: items WITHOUT open orders before items WITH (same days remaining)
    // null days remaining go to bottom
    return [...result].sort((a, b) => {
      const daysA = daysRemaining.get(a.sku);
      const daysB = daysRemaining.get(b.sku);

      // nulls to bottom
      if (daysA == null && daysB == null) return 0;
      if (daysA == null) return 1;
      if (daysB == null) return -1;

      // Primary: days remaining ascending
      if (daysA !== daysB) return daysA - daysB;

      // Secondary: no order before has order
      const aHasOrder = skusWithOpenOrders.has(a.sku);
      const bHasOrder = skusWithOpenOrders.has(b.sku);
      if (aHasOrder !== bHasOrder) return aHasOrder ? 1 : -1;

      return 0;
    });
  }, [items, search, supplierFilter, stockFilter, criticalDates, products, openOrders, manufacturerByDermaSku, daysRemaining, skusWithOpenOrders]);


  const handleRowClick = (sku: string) =>
    setPinnedSku(prev => prev === sku ? null : sku);

  const totalStock = items?.reduce((sum, i) => sum + i.currentStock, 0) ?? 0;
  const productsOnTheWay = items?.filter((i) => i.onTheWay > 0).length ?? 0;


  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/30 via-background to-purple-50/20" dir="rtl">
      {/* Sticky Header with Search, Metrics, and Actions */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-2 md:py-3">
          <div className="flex flex-col md:flex-row items-center gap-3 md:gap-4 justify-between">

            {/* Right Side: Search & Metrics */}
            <div className="flex items-center gap-2 flex-1 w-full md:w-auto">
              <div className="relative flex-1 max-w-full md:max-w-sm lg:max-w-md">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="חפש מוצר לפי שם או מק״ט..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 md:h-10 pr-10 pl-4 rounded-lg border border-input bg-background text-sm font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>

              {/* Supplier filter dropdown */}
              <div className="relative shrink-0" ref={supplierDropdownRef}>
                <button
                  onClick={() => setSupplierDropdownOpen(!supplierDropdownOpen)}
                  className={`flex items-center gap-1.5 h-9 md:h-10 px-3 rounded-lg border text-sm font-medium transition-all whitespace-nowrap
                    ${supplierFilter
                      ? "border-primary/40 bg-primary/5 text-foreground"
                      : "border-input bg-background text-muted-foreground hover:text-foreground"
                    } focus:outline-none focus:ring-2 focus:ring-primary/20`}
                >
                  <span className="hidden sm:inline">{supplierFilter || "ספק"}</span>
                  <span className="sm:hidden">{supplierFilter || "ספק"}</span>
                  {supplierFilter ? (
                    <X
                      className="h-3.5 w-3.5 hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); setSupplierFilter(""); setSupplierDropdownOpen(false); }}
                    />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
                {supplierDropdownOpen && uniqueSuppliers.length > 0 && (
                  <div className="absolute top-full mt-1 right-0 z-50 min-w-[180px] max-h-64 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
                    {uniqueSuppliers.map((supplier) => (
                      <button
                        key={supplier}
                        onClick={() => { setSupplierFilter(supplier); setSupplierDropdownOpen(false); }}
                        className={`w-full text-right px-3 py-2 text-sm hover:bg-muted/50 transition-colors
                          ${supplierFilter === supplier ? "bg-primary/10 font-semibold" : ""}`}
                      >
                        {supplier}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Stock filter toggle */}
              <div className="flex gap-1 p-1 rounded-lg bg-muted/80 shrink-0">
                <button
                  onClick={() => setStockFilter("belowMin")}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${stockFilter === "belowMin"
                    ? "bg-white text-foreground shadow-sm ring-1 ring-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/50"
                    }`}
                >
                  מתחת למינימום
                </button>
                <button
                  onClick={() => setStockFilter("all")}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${stockFilter === "all"
                    ? "bg-white text-foreground shadow-sm ring-1 ring-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/50"
                    }`}
                >
                  כל המוצרים
                </button>
              </div>

              {/* Metrics - Desktop */}
              <div className="hidden lg:flex items-center gap-4 text-sm text-muted-foreground whitespace-nowrap px-2">
                <div className="flex items-center gap-1.5 bg-blue-50/50 px-2.5 py-1 rounded-md border border-blue-100/50">
                  <span className="text-blue-700 font-medium">סה״כ במלאי:</span>
                  <span className="font-bold text-blue-900">{totalStock.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1.5 bg-purple-50/50 px-2.5 py-1 rounded-md border border-purple-100/50">
                  <span className="text-purple-700 font-medium">הזמנות פתוחות:</span>
                  <span className="font-bold text-purple-900">{productsOnTheWay}</span>
                </div>
              </div>
            </div>

            {/* Left Side: Tabs & Actions */}
            <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
              <div className="flex gap-1 p-1 rounded-lg bg-muted/80 shrink-0">
                <button
                  onClick={() => setActiveTab("graphs")}
                  className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${activeTab === "graphs"
                    ? "bg-white text-foreground shadow-sm ring-1 ring-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/50"
                    }`}
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">גרפים</span>
                  <span className="sm:hidden">גרפים</span>
                </button>
                <button
                  onClick={() => setActiveTab("orders")}
                  className={`flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${activeTab === "orders"
                    ? "bg-white text-foreground shadow-sm ring-1 ring-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/50"
                    }`}
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">הזמנות</span>
                  <span className="sm:hidden">הזמנות</span>
                </button>
              </div>

              <div className="h-5 w-px bg-border mx-1 shrink-0 hidden sm:block" />

              <div className="flex items-center gap-1 md:gap-2 shrink-0">
                <AddProductDialog />
                <AddOrderDialog />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                  title="סנכרן מוצרים"
                  className="h-8 w-8 hidden sm:inline-flex"
                >
                  {syncMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  title="רענן נתונים"
                  className="h-8 w-8"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>
          </div>

          {/* Mobile Metrics (Visible only on smaller screens) */}
          <div className="lg:hidden flex items-center gap-2 mt-2 text-xs text-muted-foreground overflow-x-auto pb-1 scrollbar-hide">
            <div className="flex items-center gap-1.5 bg-blue-50/50 px-2 py-1 rounded-md border border-blue-100/50 whitespace-nowrap shrink-0">
              <span className="text-blue-700 font-medium">סה״כ במלאי:</span>
              <span className="font-bold text-blue-900">{totalStock.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1.5 bg-purple-50/50 px-2 py-1 rounded-md border border-purple-100/50 whitespace-nowrap shrink-0">
              <span className="text-purple-700 font-medium">הזמנות פתוחות:</span>
              <span className="font-bold text-purple-900">{productsOnTheWay}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-3 md:px-8 py-3 md:py-6 space-y-4 md:space-y-6">
        {/* Content */}
        {activeTab === "graphs" && (
          <>
            {isLoading && (
              <div className="flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
                  <span className="text-sm text-muted-foreground">טוען נתוני מלאי...</span>
                </div>
              </div>
            )}
            {error && (
              <Card className="border-destructive/50 bg-destructive/5">
                <CardContent className="py-6 text-center text-destructive text-sm">
                  שגיאה בטעינת הנתונים. נסה לרענן את הדף.
                </CardContent>
              </Card>
            )}
            {!isLoading && !error && filteredItems.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Search className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">
                    {search ? "לא נמצאו מוצרים תואמים" : "אין נתוני מלאי"}
                  </p>
                </CardContent>
              </Card>
            )}
            {!isLoading && !error && filteredItems.length > 0 && (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {filteredItems.length} מוצרים
                    {(search || supplierFilter || stockFilter === "belowMin") && ` (מסוננים מתוך ${items?.length ?? 0})`}
                  </Badge>
                </div>
                <div className="flex flex-col gap-2">
                  {filteredItems.map((item) => {
                    const open = pinnedSku === item.sku;
                    const hasOrder = skusWithOpenOrders.has(item.sku);
                    const expectedInfo = earliestExpectedDate.get(item.sku);
                    const isOverdue = hasOrder && expectedInfo && expectedInfo.date < new Date();
                    const days = daysRemaining.get(item.sku);
                    return (
                      <div key={item.sku}>
                        {/* Collapsed row — two-line card */}
                        <div
                          className={`px-4 py-3 rounded-xl border bg-card shadow-sm cursor-pointer transition-colors select-none
                            ${open ? "border-primary/30 bg-primary/5 rounded-b-none border-b-0" : "hover:bg-muted/30"}`}
                          onClick={() => handleRowClick(item.sku)}
                        >
                          {/* Top line: product name + SKU */}
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <span className="font-semibold text-sm truncate">{item.productName}</span>
                            <span className="text-sm font-bold text-muted-foreground shrink-0">{item.sku}</span>
                          </div>
                          {/* Bottom line: info chips */}
                          <div className="flex items-center justify-between gap-2">
                            {/* Order status chip */}
                            {hasOrder ? (
                              isOverdue ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-red-50 text-red-700 border border-red-200/60">
                                  הזמנה בדרך: באיחור
                                </span>
                              ) : expectedInfo ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-green-50 text-green-700 border border-green-200/60">
                                  הזמנה בדרך: {expectedInfo.display}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-green-50 text-green-700 border border-green-200/60">
                                  הזמנה בדרך
                                </span>
                              )
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-muted/50 text-muted-foreground border border-border/60">
                                אין הזמנה
                              </span>
                            )}
                            {/* Days remaining chip */}
                            {days != null ? (
                              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md border ${
                                days <= 30
                                  ? "bg-red-50 text-red-700 border-red-200/60"
                                  : days <= 60
                                    ? "bg-amber-50 text-amber-700 border-amber-200/60"
                                    : "bg-muted/50 text-muted-foreground border-border/60"
                              }`}>
                                צפי לסיום סחורה: {days} ימים
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-muted/50 text-muted-foreground border-border/60">
                                —
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Expanded graph — visible when clicked */}
                        {open && (
                          <div
                            className="border border-primary/30 border-t-0 rounded-b-xl overflow-hidden"
                          >
                            <ProductGraph
                              sku={item.sku}
                              productName={item.productName}
                              currentStock={item.currentStock}
                              onTheWay={item.onTheWay}
                              onOrdersClick={handleNavigateToOrders}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {activeTab === "orders" && (
          <OpenOrders search={search} />
        )}

        <footer className="text-center text-xs text-muted-foreground pb-4">
          הנתונים מתעדכנים כל 5 דקות
        </footer>
      </div>
    </div>
  );
}

export function Dashboard() {
  return (
    <QueryClientProvider client={queryClient}>
      <DashboardContent />
    </QueryClientProvider>
  );
}
