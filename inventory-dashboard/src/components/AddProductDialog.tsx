import { useState, useMemo, useRef, useEffect } from "react";
import { useAddProduct, useProducts } from "@/hooks/useSheetData";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MaterialIcon } from "@/components/ui/MaterialIcon";

export function AddProductDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [supplierSku, setSupplierSku] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [manufacturerSearch, setManufacturerSearch] = useState("");
  const [manufacturerIsNew, setManufacturerIsNew] = useState(false);
  const [showManufacturerDropdown, setShowManufacturerDropdown] = useState(false);
  const [warehouseQty, setWarehouseQty] = useState("");
  const [fixedAssignment, setFixedAssignment] = useState("");
  const [container, setContainer] = useState("");
  const mutation = useAddProduct();
  const { data: products } = useProducts();

  const manufacturerInputRef = useRef<HTMLInputElement>(null);
  const manufacturerDropdownRef = useRef<HTMLDivElement>(null);

  // Unique sorted list of existing suppliers, derived from products sheet
  const existingSuppliers = useMemo(() => {
    if (!products) return [];
    const set = new Set<string>();
    for (const p of products) {
      const m = p.manufacturer?.trim();
      if (m) set.add(m);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "he"));
  }, [products]);

  // Filter suppliers by search term
  const filteredSuppliers = useMemo(() => {
    const q = manufacturerSearch.trim().toLowerCase();
    if (!q) return existingSuppliers.slice(0, 10);
    return existingSuppliers
      .filter((s) => s.toLowerCase().includes(q))
      .slice(0, 10);
  }, [existingSuppliers, manufacturerSearch]);

  // Whether the typed value exactly matches an existing supplier
  const typedMatchesExisting = useMemo(() => {
    const q = manufacturerSearch.trim();
    if (!q) return false;
    return existingSuppliers.some((s) => s === q);
  }, [existingSuppliers, manufacturerSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        manufacturerDropdownRef.current &&
        !manufacturerDropdownRef.current.contains(e.target as Node) &&
        manufacturerInputRef.current &&
        !manufacturerInputRef.current.contains(e.target as Node)
      ) {
        setShowManufacturerDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handlePickExistingSupplier = (s: string) => {
    setManufacturer(s);
    setManufacturerSearch(s);
    setManufacturerIsNew(false);
    setShowManufacturerDropdown(false);
  };

  const handleAddNewSupplier = () => {
    const v = manufacturerSearch.trim();
    if (!v) return;
    setManufacturer(v);
    setManufacturerIsNew(true);
    setShowManufacturerDropdown(false);
  };

  const handleClearSupplier = () => {
    setManufacturer("");
    setManufacturerSearch("");
    setManufacturerIsNew(false);
    setShowManufacturerDropdown(false);
    manufacturerInputRef.current?.focus();
  };

  const reset = () => {
    setName("");
    setSku("");
    setSupplierSku("");
    setMinAmount("");
    setManufacturer("");
    setManufacturerSearch("");
    setManufacturerIsNew(false);
    setShowManufacturerDropdown(false);
    setWarehouseQty("");
    setFixedAssignment("");
    setContainer("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sku.trim()) return;

    // Resolve the supplier:
    // - if user explicitly picked from dropdown OR confirmed "add new" → manufacturer is set
    // - else, if the typed text exactly matches an existing supplier → use it
    // - else, if the user typed a brand-new supplier without confirming → block submission
    let resolvedManufacturer = manufacturer.trim();
    const typed = manufacturerSearch.trim();
    if (!resolvedManufacturer && typed) {
      if (existingSuppliers.includes(typed)) {
        resolvedManufacturer = typed;
      } else {
        // Force the user to confirm "+ הוסף ספק חדש" to avoid typo-as-new-supplier
        setShowManufacturerDropdown(true);
        manufacturerInputRef.current?.focus();
        return;
      }
    }

    const optText = (v: string) => (v.trim() ? v.trim() : undefined);
    const optNum = (v: string) => {
      const t = v.trim();
      if (!t) return undefined;
      const n = Number(t);
      return Number.isFinite(n) ? n : undefined;
    };

    mutation.mutate(
      {
        name: name.trim(),
        sku: sku.trim(),
        manufacturer: optText(resolvedManufacturer),
        minAmount: optNum(minAmount),
        fixedAssignment: optText(fixedAssignment),
        warehouseQty: optNum(warehouseQty),
        supplierSku: optText(supplierSku),
        container: optText(container),
      },
      {
        onSuccess: () => {
          reset();
          setOpen(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span className="text-base"><MaterialIcon name="add" /></span>
          הוסף מוצר
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>הוספת מוצר חדש</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product-name">שם מוצר *</Label>
            <Input
              id="product-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="שם המוצר"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="product-sku">מק״ט דרמלוסופי *</Label>
            <Input
              id="product-sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="למשל 4695"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="product-supplier-sku">מק״ט פאר פארם</Label>
            <Input
              id="product-supplier-sku"
              value={supplierSku}
              onChange={(e) => setSupplierSku(e.target.value)}
              placeholder="למשל 36454"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="product-min">מינימום מלאי</Label>
            <Input
              id="product-min"
              type="number"
              min={0}
              inputMode="numeric"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              placeholder="למשל 3000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="product-manufacturer">ספק</Label>
            <div className="relative">
              <Input
                ref={manufacturerInputRef}
                id="product-manufacturer"
                value={manufacturerSearch}
                onChange={(e) => {
                  setManufacturerSearch(e.target.value);
                  // typing invalidates any prior selection
                  if (manufacturer && e.target.value !== manufacturer) {
                    setManufacturer("");
                    setManufacturerIsNew(false);
                  }
                  setShowManufacturerDropdown(true);
                }}
                onFocus={() => setShowManufacturerDropdown(true)}
                placeholder="חפש ספק או הוסף חדש..."
                className={manufacturer ? "pe-9" : ""}
                autoComplete="off"
              />
              {manufacturer && (
                <button
                  type="button"
                  onClick={handleClearSupplier}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
                  aria-label="נקה"
                >
                  <span className="text-base"><MaterialIcon name="close" /></span>
                </button>
              )}
              {showManufacturerDropdown && (filteredSuppliers.length > 0 || (manufacturerSearch.trim() && !typedMatchesExisting)) && (
                <div
                  ref={manufacturerDropdownRef}
                  className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-48 overflow-y-auto"
                >
                  {filteredSuppliers.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`w-full px-3 py-2 text-right hover:bg-accent text-sm ${
                        manufacturer === s ? "bg-accent/50 font-semibold" : ""
                      }`}
                      onClick={() => handlePickExistingSupplier(s)}
                    >
                      {s}
                    </button>
                  ))}
                  {manufacturerSearch.trim() && !typedMatchesExisting && (
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-right hover:bg-accent text-sm border-t border-border flex items-center gap-2 text-amber-500"
                      onClick={handleAddNewSupplier}
                    >
                      <span className="text-base"><MaterialIcon name="add" /></span>
                      <span>הוסף ספק חדש: <span className="font-semibold">{manufacturerSearch.trim()}</span></span>
                    </button>
                  )}
                </div>
              )}
            </div>
            {manufacturerIsNew && manufacturer && (
              <p className="text-[11px] text-amber-500 flex items-center gap-1">
                <span className="text-sm"><MaterialIcon name="info" /></span>
                ספק חדש שאינו קיים ברשימה.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="product-qty">יתרת מלאי נוכחית</Label>
            <Input
              id="product-qty"
              type="number"
              min={0}
              inputMode="numeric"
              value={warehouseQty}
              onChange={(e) => setWarehouseQty(e.target.value)}
              placeholder="למשל 0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="product-assignment">שיוך קבוע</Label>
            <Input
              id="product-assignment"
              value={fixedAssignment}
              onChange={(e) => setFixedAssignment(e.target.value)}
              placeholder="שיוך קבוע"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="product-container">מיכל</Label>
            <Input
              id="product-container"
              value={container}
              onChange={(e) => setContainer(e.target.value)}
              placeholder="מיכל"
            />
          </div>
          {mutation.isError && (
            <p className="text-destructive text-sm">
              שגיאה: {(mutation.error as Error).message}
            </p>
          )}
          <Button type="submit" disabled={mutation.isPending} className="w-full">
            {mutation.isPending ? (
              <span className="text-base animate-spin"><MaterialIcon name="progress_activity" /></span>
            ) : (
              "הוסף מוצר"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
