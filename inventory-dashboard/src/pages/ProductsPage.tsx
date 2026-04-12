import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MaterialIcon } from "@/components/ui/MaterialIcon";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterBar } from "@/components/layout/FilterBar";
import { SearchInput } from "@/components/layout/SearchInput";
import { SummaryCard } from "@/components/layout/SummaryCard";
import { SupplierDropdown } from "@/components/SupplierDropdown";
import { ProductGraph } from "@/components/ProductGraph";
import { useInventoryOverview, useCriticalDates, useOpenOrders, useProducts, useLinkedProducts, parseDate } from "@/hooks/useSheetData";

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
  const { supplierSkuMap, linkedProductsMap } = useLinkedProducts();

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
      map.set(item.sku, Math.max(0, Math.round(item.currentStock / dailyUsage)));
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

  const totalStock = items?.reduce((sum, i) => sum + Math.max(0, i.currentStock), 0) ?? 0;
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
          icon={<span className="text-xl"><MaterialIcon name="warehouse" /></span>}
          variant="blue"
        />
        <SummaryCard
          label="הזמנות בדרך"
          value={productsOnTheWay}
          icon={<span className="text-xl"><MaterialIcon name="local_shipping" /></span>}
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
        <div className="flex gap-1 p-1 rounded-lg bg-white/5 shrink-0">
          <button
            onClick={() => setStockFilter("belowMin")}
            className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${stockFilter === "belowMin"
              ? "bg-destructive/20 text-destructive border border-destructive/30"
              : "text-muted-foreground hover:text-foreground hover:bg-white/10"
              }`}
          >
            מתחת למינימום
          </button>
          <button
            onClick={() => setStockFilter("all")}
            className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${stockFilter === "all"
              ? "bg-card text-foreground shadow-sm ring-1 ring-white/10"
              : "text-muted-foreground hover:text-foreground hover:bg-white/10"
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
            <span className="text-3xl text-muted-foreground/40 block mx-auto mb-3"><MaterialIcon name="search" /></span>
            <p className="text-muted-foreground text-sm">
              {search ? "לא נמצאו מוצרים תואמים" : "אין נתוני מלאי"}
            </p>
          </CardContent>
        </Card>
      )}
      {!isLoading && !error && filteredItems.length > 0 && (
        <div className="bg-card rounded-3xl overflow-hidden border border-border">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-4 px-6 md:px-8 py-5 border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] bg-white/5">
            <div className="col-span-5">מוצר</div>
            <div className="col-span-2 text-center">מלאי זמין</div>
            <div className="col-span-3">סטטוס אספקה</div>
            <div className="col-span-2 text-left">פעולות</div>
          </div>
          <div className="divide-y divide-border">
          {filteredItems.map((item) => {
            const open = pinnedSku === item.sku;
            const hasOrder = skusWithOpenOrders.has(item.sku);
            const expectedInfo = earliestExpectedDate.get(item.sku);
            const isOverdue = hasOrder && expectedInfo && expectedInfo.date < new Date();
            const days = daysRemaining.get(item.sku);
            const product = products?.find(p => p.sku === item.sku);
            const peerFarmSku = product?.supplierSku || supplierSkuMap.get(item.sku);
            const linked = linkedProductsMap.get(item.sku);
            return (
              <div key={item.sku}>
                {/* Collapsed row — grid layout matching mockup */}
                <div
                  className={`px-6 md:px-8 py-5 cursor-pointer transition-colors select-none
                    ${open ? "bg-primary/5" : "hover:bg-muted/50"}`}
                  onClick={() => handleRowClick(item.sku)}
                >
                  <div className="grid grid-cols-12 gap-4 items-center">
                    {/* Product name + SKU */}
                    <div className="col-span-5 flex items-center gap-4">
                      <div>
                        <h3 className="font-bold text-sm text-foreground mb-1">{item.productName}</h3>
                        <span className="text-[10px] font-bold font-display text-primary tracking-widest">
                          REF: {item.sku}
                          {peerFarmSku && <span className="text-muted-foreground font-normal mr-1">({peerFarmSku})</span>}
                        </span>
                      </div>
                    </div>

                    {/* Stock count — centered */}
                    <div className="col-span-2 text-center">
                      <span className={`text-xl font-bold font-display ${
                        item.currentStock <= 0 ? "text-destructive" : days != null && days <= 30 ? "text-destructive" : "text-foreground"
                      }`}>
                        {Math.max(0, item.currentStock)}
                      </span>
                      <span className={`block text-[9px] uppercase tracking-widest ${
                        item.currentStock <= 0 ? "text-destructive font-bold" : days != null && days <= 30 ? "text-destructive font-bold" : "text-muted-foreground"
                      }`}>
                        {item.currentStock <= 0 ? "אזל מהמלאי" : days != null && days <= 30 ? "חוסר במלאי" : "יחידות"}
                      </span>
                    </div>

                    {/* Supply status */}
                    <div className="col-span-3">
                      {hasOrder ? (
                        isOverdue ? (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-bold uppercase tracking-widest mb-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            הזמנה בדרך - עיכוב
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 text-green-400 text-[10px] font-bold uppercase tracking-widest mb-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                            הזמנה בדרך - בזמן
                          </div>
                        )
                      ) : (
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 text-muted-foreground text-[10px] font-bold uppercase tracking-widest mb-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                          אין הזמנה פעילה
                        </div>
                      )}
                      {days != null && (
                        <p className={`text-xs ${days <= 30 ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                          {item.currentStock <= 0 ? "אזל מהמלאי" : `צפי לסיום סחורה: ${days} ימים`}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="col-span-2 text-left flex gap-1">
                      <button className="p-2 text-muted-foreground hover:text-foreground transition-colors">
                        <MaterialIcon name="more_vert" className="text-lg" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded graph */}
                {open && (
                  <div className="border-x border-b border-primary/30 overflow-hidden">
                    <ProductGraph
                      sku={item.sku}
                      productName={item.productName}
                      currentStock={Math.max(0, item.currentStock)}
                      onTheWay={item.onTheWay}
                      onOrdersClick={handleNavigateToOrders}
                      supplierSku={peerFarmSku}
                      linkedProducts={linked}
                    />
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </div>
      )}
    </>
  );
}
