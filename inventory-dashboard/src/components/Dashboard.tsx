import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OpenOrders } from "./OpenOrders";

import { ProductGraph } from "./ProductGraph";
import { useInventoryOverview, useCriticalDates } from "@/hooks/useSheetData";
import { useSyncMissingProducts } from "@/hooks/useSheetData";
import { AddProductDialog } from "./AddProductDialog";
import { AddOrderDialog } from "./AddOrderDialog";
import { Package, RefreshCw, Search, BarChart3, ShoppingCart, AlertTriangle, Loader2 } from "lucide-react";
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
    let result = items;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (item) =>
          item.productName.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q)
      );
    }
    // Sort: items with critical dates first (soonest first), then items without
    return [...result].sort((a, b) => {
      const da = criticalDates.get(a.sku);
      const db = criticalDates.get(b.sku);
      if (da && db) return da.getTime() - db.getTime();
      if (da && !db) return -1;
      if (!da && db) return 1;
      return 0;
    });
  }, [items, search, criticalDates]);

  const totalStock = items?.reduce((sum, i) => sum + i.currentStock, 0) ?? 0;
  const productsOnTheWay = items?.filter((i) => i.onTheWay > 0).length ?? 0;
  const lowStockCount = items?.filter((i) => i.currentStock < 15).length ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/30 via-background to-purple-50/20" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-xl bg-background/90 border-b border-border/50 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-2xl bg-primary/10 ring-1 ring-primary/20">
                <Package className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">דשבורד מלאי והזמנות</h1>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">ניתוח מגמות ותחזית מלאי · Dermalosophy</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AddProductDialog />
              <AddOrderDialog />
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="gap-2 font-medium"
              >
                {syncMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                סנכרן מוצרים
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="gap-2 font-medium"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                רענן
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-emerald-50/50 via-white to-emerald-50/30 border-emerald-200/40 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-5 pb-4 px-5">
              <div className="text-xs text-emerald-700 font-semibold">סה״כ מוצרים</div>
              <div className="text-3xl font-bold text-emerald-800 mt-1">{items?.length ?? "—"}</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50/50 via-white to-cyan-50/30 border-blue-200/40 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-5 pb-4 px-5">
              <div className="text-xs text-blue-700 font-semibold">סה״כ מלאי</div>
              <div className="text-3xl font-bold text-blue-800 mt-1">{totalStock.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-50/50 via-white to-purple-50/30 border-purple-200/40 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-5 pb-4 px-5">
              <div className="text-xs text-purple-700 font-semibold flex items-center gap-1.5">
                <ShoppingCart className="h-3.5 w-3.5" /> בדרך
              </div>
              <div className="text-3xl font-bold text-purple-800 mt-1">{productsOnTheWay}</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-rose-50/50 via-white to-pink-50/30 border-rose-200/40 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-5 pb-4 px-5">
              <div className="text-xs text-rose-700 font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> מלאי נמוך
              </div>
              <div className="text-3xl font-bold text-rose-800 mt-1">{lowStockCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Search + Tabs */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="חפש מוצר לפי שם או מק״ט..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pr-10 pl-4 rounded-xl border border-input bg-white text-sm font-medium placeholder:text-muted-foreground placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
            />
          </div>
          <div className="flex gap-1 p-1 rounded-xl bg-muted/80 shadow-inner">
            <button
              onClick={() => setActiveTab("graphs")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "graphs"
                  ? "bg-white text-foreground shadow-sm ring-1 ring-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/50"
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              גרפים
            </button>
            <button
              onClick={() => setActiveTab("orders")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "orders"
                  ? "bg-white text-foreground shadow-sm ring-1 ring-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/50"
              }`}
            >
              <ShoppingCart className="h-4 w-4" />
              הזמנות
            </button>
          </div>
        </div>

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
                <div className="grid gap-4 lg:grid-cols-2">
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
