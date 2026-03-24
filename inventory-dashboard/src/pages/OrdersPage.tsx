import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterBar } from "@/components/layout/FilterBar";
import { SearchInput } from "@/components/layout/SearchInput";
import { OpenOrders } from "@/components/OpenOrders";
import { useOrders } from "@/hooks/useSheetData";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";

const RECEIVED_VALUES = ["כן", "v", "✓", "true", "yes"];

export function OrdersPage() {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [showReceived, setShowReceived] = useState(false);
  const { data: allOrders } = useOrders();

  const openCount = allOrders?.filter(
    (o) => !RECEIVED_VALUES.includes((o.received || "").toString().trim().toLowerCase())
  ).length ?? 0;

  // Read ?search= from URL on mount (cross-nav from products)
  useEffect(() => {
    const q = searchParams.get("search");
    if (q) setSearch(q);
  }, [searchParams]);

  return (
    <>
      <PageHeader
        title={showReceived ? "כל ההזמנות" : "הזמנות פתוחות"}
        badge={showReceived ? allOrders?.length : openCount}
      />
      <FilterBar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="חפש הזמנה לפי שם, מק״ט או תאריך..."
        />
        <Button
          variant={showReceived ? "default" : "outline"}
          size="sm"
          className="text-xs gap-1.5 shrink-0"
          onClick={() => setShowReceived((v) => !v)}
        >
          {showReceived ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showReceived ? "הסתר שהתקבלו" : "הצג שהתקבלו"}
        </Button>
      </FilterBar>
      <OpenOrders search={search} showReceived={showReceived} />
    </>
  );
}
