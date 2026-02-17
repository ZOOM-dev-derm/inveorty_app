import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OpenOrders } from "./OpenOrders";

import { ProductGraph } from "./ProductGraph";
import { useInventoryOverview, useCriticalDates, useMinAmount, useOpenOrders } from "@/hooks/useSheetData";
import { useSyncMissingProducts } from "@/hooks/useSheetData";
import { AddProductDialog } from "./AddProductDialog";
import { AddOrderDialog } from "./AddOrderDialog";
import { RefreshCw, Search, BarChart3, ShoppingCart, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo, useCallback } from "react";

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

  const { data: items, isLoading, error } = useInventoryOverview();
  const criticalDates = useCriticalDates(items ?? []);
  const { data: minAmountData } = useMinAmount();
  const { data: openOrders } = useOpenOrders();
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

  const filteredItems = useMemo(() => {
    if (!items) return [];

    // Only show products that have a minimum amount defined
    const minAmountSkus = new Set(minAmountData?.map((m) => m.sku) ?? []);
    let result = items.filter((item) => minAmountSkus.has(item.sku));

    if (search.trim()) {
      const terms = search.trim().toLowerCase().split(/\s+/);
      result = result.filter((item) => {
        const searchable = `${item.productName || ""} ${item.sku || ""}`.toLowerCase();
        return terms.every((term) => searchable.includes(term));
      });
    }

    // Build set of SKUs with open (non-received) orders
    const skusWithOpenOrders = new Set(openOrders?.map((o) => o.dermaSku) ?? []);

    // Sort into 3 tiers:
    // 1. Has critical date, NO open order (urgent - need to order)
    // 2. Has critical date, HAS open order (ordered, waiting)
    // 3. No critical date (everything else)
    // Within each tier, sort by critical date ascending (soonest first)
    return [...result].sort((a, b) => {
      const da = criticalDates.get(a.sku);
      const db = criticalDates.get(b.sku);
      const aHasOrder = skusWithOpenOrders.has(a.sku);
      const bHasOrder = skusWithOpenOrders.has(b.sku);

      const tierA = da ? (aHasOrder ? 2 : 1) : 3;
      const tierB = db ? (bHasOrder ? 2 : 1) : 3;

      if (tierA !== tierB) return tierA - tierB;

      // Within same tier, sort by critical date ascending (nulls last)
      if (da && db) return da.getTime() - db.getTime();
      if (da && !db) return -1;
      if (!da && db) return 1;
      return 0;
    });
  }, [items, search, criticalDates, minAmountData, openOrders]);

  const totalStock = items?.reduce((sum, i) => sum + i.currentStock, 0) ?? 0;
  const productsOnTheWay = items?.filter((i) => i.onTheWay > 0).length ?? 0;


  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/30 via-background to-purple-50/20" dir="rtl">
      {/* Sticky Header with Search, Metrics, and Actions */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-2 md:py-3">
          <div className="flex flex-col md:flex-row items-center gap-3 md:gap-4 justify-between">

            {/* Right Side: Search & Metrics */}
            <div className="flex items-center gap-3 flex-1 w-full md:w-auto">
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

      <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-6 space-y-6">
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
                    {search && ` (מסוננים מתוך ${items?.length ?? 0})`}
                  </Badge>
                </div>
                <div className="grid gap-4 grid-cols-1">
                  {filteredItems.map((item) => (
                    <ProductGraph
                      key={item.sku}
                      sku={item.sku}
                      productName={item.productName}
                      currentStock={item.currentStock}
                      onTheWay={item.onTheWay}
                      onOrdersClick={handleNavigateToOrders}
                    />
                  ))}
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
