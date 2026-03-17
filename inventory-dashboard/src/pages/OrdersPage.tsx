import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilterBar } from "@/components/layout/FilterBar";
import { SearchInput } from "@/components/layout/SearchInput";
import { OpenOrders } from "@/components/OpenOrders";
import { useOpenOrders } from "@/hooks/useSheetData";

export function OrdersPage() {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const { data: orders } = useOpenOrders();

  // Read ?search= from URL on mount (cross-nav from products)
  useEffect(() => {
    const q = searchParams.get("search");
    if (q) setSearch(q);
  }, [searchParams]);

  return (
    <>
      <PageHeader
        title="הזמנות פתוחות"
        badge={orders?.length}
      />
      <FilterBar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="חפש הזמנה לפי שם, מק״ט או תאריך..."
        />
      </FilterBar>
      <OpenOrders search={search} />
    </>
  );
}
