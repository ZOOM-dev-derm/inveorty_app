import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OpenOrders } from "./OpenOrders";
import { LowStock } from "./LowStock";
import { ProductGraph } from "./ProductGraph";
import { useInventoryOverview } from "@/hooks/useSheetData";
import { Package, RefreshCw, Search, BarChart3, ShoppingCart, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";

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

  const handleRefresh = async () => {
    setRefreshing(true);
    await client.invalidateQueries();
    setRefreshing(false);
  };

  const filteredItems = useMemo(() => {
    if (!items) return [];
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter(
      (item) =>
        item.productName.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q)
    );
  }, [items, search]);

  const totalStock = items?.reduce((sum, i) => sum + i.currentStock, 0) ?? 0;
  const productsOnTheWay = items?.filter((i) => i.onTheWay > 0).length ?? 0;
  const lowStockCount = items?.filter((i) => i.currentStock < 15).length ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-white/80 border-b border-border/50">
        <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <Package className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">דשבורד מלאי והזמנות</h1>
                <p className="text-xs text-muted-foreground">ניתוח מגמות ותחזית מלאי</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              רענן
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-xs text-emerald-600 font-medium">סה״כ מוצרים</div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">{items?.length ?? "—"}</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-100">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-xs text-blue-600 font-medium">סה״כ מלאי</div>
              <div className="text-2xl font-bold text-blue-700 mt-1">{totalStock.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-violet-50 to-white border-violet-100">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-xs text-violet-600 font-medium flex items-center gap-1">
                <ShoppingCart className="h-3 w-3" /> בדרך
              </div>
              <div className="text-2xl font-bold text-violet-700 mt-1">{productsOnTheWay}</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-amber-50 to-white border-amber-100">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="text-xs text-amber-600 font-medium flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> מלאי נמוך
              </div>
              <div className="text-2xl font-bold text-amber-700 mt-1">{lowStockCount}</div>
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
              className="w-full h-10 pr-10 pl-4 rounded-lg border border-input bg-white text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all"
            />
          </div>
          <div className="flex gap-1 p-1 rounded-lg bg-muted">
            <button
              onClick={() => setActiveTab("graphs")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === "graphs"
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              גרפים
            </button>
            <button
              onClick={() => setActiveTab("orders")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === "orders"
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
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
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {activeTab === "orders" && (
          <div className="grid gap-6 md:grid-cols-2">
            <OpenOrders />
            <LowStock />
          </div>
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
