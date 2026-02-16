import { useState, useEffect, useRef, useMemo } from "react";
import { useAddOrder, useProducts, useMinAmount } from "@/hooks/useSheetData";
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
import { Plus, Loader2, X, Package } from "lucide-react";

function todayFormatted(): string {
  const d = new Date();
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
}

export interface OrderInitialData {
  productName: string;
  dermaSku: string;
  quantity: string;
  expectedDate: string;
  currentStock?: number;
  onTheWay?: number;
  orderDate?: string;
}

interface AddOrderDialogProps {
  initialData?: OrderInitialData;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

export function AddOrderDialog({ initialData, open: controlledOpen, onOpenChange, trigger }: AddOrderDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (onOpenChange ?? (() => {})) : setInternalOpen;

  const [orderDate, setOrderDate] = useState(todayFormatted());
  const [supplierSku, setSupplierSku] = useState("");
  const [dermaSku, setDermaSku] = useState("");
  const [quantity, setQuantity] = useState("");
  const [productName, setProductName] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [log, setLog] = useState("");

  // Product selector state
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ name: string; sku: string; barcode: string; warehouseQty: number } | null>(null);
  const [contextStock, setContextStock] = useState<number | undefined>();
  const [contextOnTheWay, setContextOnTheWay] = useState<number | undefined>();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: products } = useProducts();
  const { data: minAmountData } = useMinAmount();
  const mutation = useAddOrder();

  // Build min amount lookup
  const minAmountMap = useMemo(() => {
    const map = new Map<string, number>();
    if (minAmountData) {
      for (const m of minAmountData) {
        map.set(m.sku.trim(), m.minAmount);
      }
    }
    return map;
  }, [minAmountData]);

  // Filter products by search query
  const filteredProducts = useMemo(() => {
    if (!products || !searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [products, searchQuery]);

  // Pre-fill fields when dialog opens with initialData
  useEffect(() => {
    if (open && initialData) {
      setProductName(initialData.productName);
      setDermaSku(initialData.dermaSku);
      setQuantity(initialData.quantity);
      setExpectedDate(initialData.expectedDate);
      setOrderDate(initialData.orderDate ?? todayFormatted());
      setSupplierSku("");
      setLog("");
      setSearchQuery(initialData.productName);
      setContextStock(initialData.currentStock);
      setContextOnTheWay(initialData.onTheWay);

      // Find matching product from the products list
      if (products) {
        const match = products.find((p) => p.sku === initialData.dermaSku);
        if (match) {
          setSelectedProduct(match);
        } else {
          // Create a synthetic selected product for display
          setSelectedProduct({
            name: initialData.productName,
            sku: initialData.dermaSku,
            barcode: "",
            warehouseQty: initialData.currentStock ?? 0,
          });
        }
      }
    }
  }, [open, initialData, products]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelectProduct = (product: typeof products extends (infer T)[] | undefined ? T : never) => {
    if (!product) return;
    setSelectedProduct(product);
    setProductName(product.name);
    setDermaSku(product.sku);
    setSearchQuery(product.name);
    setShowDropdown(false);
    setContextStock(product.warehouseQty);

    // Auto-suggest quantity from minAmount
    const minAmt = minAmountMap.get(product.sku.trim());
    if (minAmt && !quantity) {
      setQuantity(String(minAmt));
    }
  };

  const handleClearProduct = () => {
    setSelectedProduct(null);
    setProductName("");
    setDermaSku("");
    setSearchQuery("");
    setContextStock(undefined);
    setContextOnTheWay(undefined);
    setQuantity("");
    inputRef.current?.focus();
  };

  const resetFields = () => {
    setOrderDate(todayFormatted());
    setSupplierSku("");
    setDermaSku("");
    setQuantity("");
    setProductName("");
    setExpectedDate("");
    setLog("");
    setSearchQuery("");
    setSelectedProduct(null);
    setContextStock(undefined);
    setContextOnTheWay(undefined);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim() || !quantity.trim()) return;
    mutation.mutate(
      {
        orderDate: orderDate.trim(),
        supplierSku: supplierSku.trim(),
        dermaSku: dermaSku.trim(),
        quantity: quantity.trim(),
        productName: productName.trim(),
        expectedDate: expectedDate.trim(),
        log: log.trim() || undefined,
      },
      {
        onSuccess: () => {
          resetFields();
          setOpen(false);
        },
      }
    );
  };

  const selectedMinAmount = selectedProduct ? minAmountMap.get(selectedProduct.sku.trim()) : undefined;

  const defaultTrigger = (
    <Button variant="outline" size="sm" className="gap-2">
      <Plus className="h-4 w-4" />
      הוסף הזמנה
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? defaultTrigger}
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>הוספת הזמנה חדשה</DialogTitle>
        </DialogHeader>

        {/* Context info from initialData or selected product */}
        {(contextStock !== undefined || contextOnTheWay !== undefined) && (
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <Package className="h-4 w-4 text-muted-foreground shrink-0" />
            {contextStock !== undefined && (
              <span>מלאי: <span className="font-semibold">{contextStock}</span></span>
            )}
            {contextOnTheWay !== undefined && contextOnTheWay > 0 && (
              <span>בדרך: <span className="font-semibold">{contextOnTheWay}</span></span>
            )}
            {selectedMinAmount !== undefined && (
              <span>מינימום: <span className="font-semibold">{selectedMinAmount}</span></span>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Product selector */}
          <div className="space-y-2">
            <Label htmlFor="product-search">מוצר *</Label>
            <div className="relative">
              <Input
                ref={inputRef}
                id="product-search"
                value={selectedProduct ? selectedProduct.name : searchQuery}
                onChange={(e) => {
                  if (selectedProduct) {
                    // If a product is selected, clear and start new search
                    handleClearProduct();
                    setSearchQuery(e.target.value);
                  } else {
                    setSearchQuery(e.target.value);
                  }
                  setShowDropdown(true);
                }}
                onFocus={() => {
                  if (!selectedProduct && searchQuery.trim()) {
                    setShowDropdown(true);
                  }
                }}
                placeholder="חפש לפי שם מוצר או מק״ט..."
                readOnly={!!selectedProduct}
                className={selectedProduct ? "bg-muted/30 pe-9" : ""}
              />
              {selectedProduct && (
                <button
                  type="button"
                  onClick={handleClearProduct}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {showDropdown && filteredProducts.length > 0 && !selectedProduct && (
                <div
                  ref={dropdownRef}
                  className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-48 overflow-y-auto"
                >
                  {filteredProducts.map((product) => (
                    <button
                      key={product.sku}
                      type="button"
                      className="w-full px-3 py-2 text-right hover:bg-accent flex items-center justify-between gap-2 text-sm"
                      onClick={() => handleSelectProduct(product)}
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{product.name}</div>
                        <div className="text-xs text-muted-foreground">{product.sku}</div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        מלאי: {product.warehouseQty}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Show selected product info */}
            {selectedProduct && (
              <div className="text-xs text-muted-foreground flex items-center gap-3">
                <span>מק״ט: {selectedProduct.sku}</span>
                {selectedProduct.barcode && <span>ברקוד: {selectedProduct.barcode}</span>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="order-date">תאריך הזמנה</Label>
              <Input
                id="order-date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                placeholder="DD/MM/YYYY"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expected-date">תאריך צפי</Label>
              <Input
                id="expected-date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                placeholder="DD/MM/YYYY"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="supplier-sku">מק״ט ספק</Label>
              <Input
                id="supplier-sku"
                value={supplierSku}
                onChange={(e) => setSupplierSku(e.target.value)}
                placeholder="מק״ט פאר-פארם"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order-quantity">כמות *</Label>
              <Input
                id="order-quantity"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="כמות"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="order-log">לוג</Label>
            <textarea
              id="order-log"
              value={log}
              onChange={(e) => setLog(e.target.value)}
              placeholder="הערה ראשונית להזמנה..."
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
              rows={2}
            />
          </div>
          {mutation.isError && (
            <p className="text-destructive text-sm">
              שגיאה: {(mutation.error as Error).message}
            </p>
          )}
          <Button type="submit" disabled={mutation.isPending} className="w-full">
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "הוסף הזמנה"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
