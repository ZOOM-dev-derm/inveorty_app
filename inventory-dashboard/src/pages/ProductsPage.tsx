import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Package, Warehouse } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterBar } from "@/components/layout/FilterBar";
import { SearchInput } from "@/components/layout/SearchInput";
import { SummaryCard } from "@/components/layout/SummaryCard";
import { SupplierDropdown } from "@/components/SupplierDropdown";
import { ProductGraph } from "@/components/ProductGraph";
import { useInventoryOverview, useCriticalDates, useOpenOrders, useProducts, parseDate } from "@/hooks/useSheetData";

export function ProductsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [pinnedSku, setPinnedSku] = useState<string | null>(null);
  const [supplierFilter, setSupplierFilter] = useState<string>("");
  const [stockFilter, setStockFilter] = useState<"all" | "belowMin">("belowMin");

  const { data: items, isLoading, error } = useInventoryOverview();
  const criticalDates = useCriticalDates(items ?? []);
  const { data: openOrders } = useOpenOrders();
  const { data: products } = useProducts();

  const handleNavigateToOrders = useCallback((productName: string) => {
    navigate(`/orders?search=${encodeURIComponent(productName)}`);
  }, [navigate]);

  // --- Memos extracted from Dashboard ---

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

  // Default supplier filter to "פאר פארם"
  const [supplierDefaultSet, setSupplierDefaultSet] = useState(false);
  useEffect(() => {
    if (!supplierDefaultSet && uniqueSuppliers.length > 0) {
      const match = uniqueSuppliers.find(s => s.includes("פאר פארם"));
      if (match) setSupplierFilter(match);
      setSupplierDefaultSet(true);
    }
  }, [uniqueSuppliers, supplierDefaultSet]);

  const skusWithOpenOrders = useMemo(() => {
    return new Set(openOrders?.map((o) => o.dermaSku) ?? []);
  }, [openOrders]);

  const earliestExpectedDate = useMemo(() => {
    const map = new Map<string, { display: string; date: Date }>();
    if (!openOrders) return map;
    for (const order of openOrders) {
      const d = parseDate(order.expectedDate);
      if (!d) continue;
      const existing = map.get(order.dermaSku);
      if (!existing) {
        map.set(order.dermaSku, { display: order.expectedDate, date: d });
      } else if (d < existing.date) {
        map.set(order.dermaSku, { display: order.expectedDate, date: d });
      }
    }
    return map;
  }, [openOrders]);

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

  const filteredItems = useMemo(() => {
    if (!items) return [];

    const minAmountSkus = new Set(
      products?.filter((p) => p.minAmount > 0).map((p) => p.sku) ?? []
    );
    let result = items.filter((item) => minAmountSkus.has(item.sku));

    // Deduplicate by sku
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
          (term) => nameLower.includes(term) || dermaSku.startsWith(term)
        );
      });
    }

    // Filter by stock level
    if (stockFilter === "belowMin") {
      result = result.filter((item) => criticalDates.get(item.sku) != null);
    }

    // Sort by urgency
    return [...result].sort((a, b) => {
      const daysA = daysRemaining.get(a.sku);
      const daysB = daysRemaining.get(b.sku);
      if (daysA == null && daysB == null) return 0;
      if (daysA == null) return 1;
      if (daysB == null) return -1;
      if (daysA !== daysB) return daysA - daysB;
      const aHasOrder = skusWithOpenOrders.has(a.sku);
      const bHasOrder = skusWithOpenOrders.has(b.sku);
      if (aHasOrder !== bHasOrder) return aHasOrder ? 1 : -1;
      return 0;
    });
  }, [items, search, supplierFilter, stockFilter, criticalDates, products, manufacturerByDermaSku, daysRemaining, skusWithOpenOrders]);

  const handleRowClick = (sku: string) =>
    setPinnedSku(prev => prev === sku ? null : sku);

  const totalStock = items?.reduce((sum, i) => sum + i.currentStock, 0) ?? 0;
  const productsOnTheWay = items?.filter((i) => i.onTheWay > 0).length ?? 0;

  return (
    <>
      <PageHeader
        title="מוצרים"
        badge={
          filteredItems.length > 0
            ? `${filteredItems.length} מוצרים${(search || supplierFilter || stockFilter === "belowMin") ? ` מתוך ${items?.length ?? 0}` : ""}`
            : undefined
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard
          label="סה״כ במלאי"
          value={totalStock}
          icon={<Warehouse className="h-5 w-5" />}
          variant="blue"
        />
        <SummaryCard
          label="הזמנות בדרך"
          value={productsOnTheWay}
          icon={<Package className="h-5 w-5" />}
          variant="purple"
        />
      </div>

      {/* Filters */}
      <FilterBar>
        <SupplierDropdown
          suppliers={uniqueSuppliers}
          value={supplierFilter}
          onChange={setSupplierFilter}
        />
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
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="חפש מוצר לפי שם או מק״ט..."
        />
      </FilterBar>

      {/* Content */}
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
        <div className="flex flex-col gap-2">
          {filteredItems.map((item) => {
            const open = pinnedSku === item.sku;
            const hasOrder = skusWithOpenOrders.has(item.sku);
            const expectedInfo = earliestExpectedDate.get(item.sku);
            const isOverdue = hasOrder && expectedInfo && expectedInfo.date < new Date();
            const days = daysRemaining.get(item.sku);
            return (
              <div key={item.sku}>
                {/* Collapsed row */}
                <div
                  className={`px-4 py-3 rounded-xl border bg-card shadow-sm cursor-pointer transition-colors select-none
                    ${open ? "border-primary/30 bg-primary/5 rounded-b-none border-b-0" : "hover:bg-muted/30"}`}
                  onClick={() => handleRowClick(item.sku)}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="font-semibold text-sm truncate">{item.productName}</span>
                    <span className="text-sm font-bold text-muted-foreground shrink-0">{item.sku}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
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

                {/* Expanded graph */}
                {open && (
                  <div className="border border-primary/30 border-t-0 rounded-b-xl overflow-hidden">
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
      )}
    </>
  );
}
