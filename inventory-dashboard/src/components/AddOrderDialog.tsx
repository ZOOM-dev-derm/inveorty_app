import { useState, useEffect, useRef, useMemo } from "react";
import { useAddOrder, useProducts, useLinkedProducts } from "@/hooks/useSheetData";
import { useQueryClient } from "@tanstack/react-query";
import { addOrder } from "@/services/googleSheets";
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
import { Plus, Loader2, X, Package, Check, AlertCircle } from "lucide-react";

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

interface ReviewItem {
  name: string;
  sku: string;
  supplierSku: string;
  warehouseQty: number;
  minAmount: number;
  quantity: string;
  checked: boolean;
  isOriginal: boolean;
}

interface SubmissionStatus {
  sku: string;
  status: "pending" | "submitting" | "success" | "error";
  error?: string;
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
  const [selectedProduct, setSelectedProduct] = useState<{ name: string; sku: string; manufacturer: string; warehouseQty: number; supplierSku?: string; container?: string } | null>(null);
  const [contextStock, setContextStock] = useState<number | undefined>();
  const [contextOnTheWay, setContextOnTheWay] = useState<number | undefined>();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: products } = useProducts();
  const mutation = useAddOrder();
  const { linkedProductsMap, supplierSkuMap } = useLinkedProducts();
  const queryClient = useQueryClient();

  // Three-phase dialog state
  const [dialogPhase, setDialogPhase] = useState<"form" | "review" | "submitting">("form");
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [submissionStatuses, setSubmissionStatuses] = useState<SubmissionStatus[]>([]);

  // Build min amount lookup from products
  const minAmountMap = useMemo(() => {
    const map = new Map<string, number>();
    if (products) {
      for (const p of products) {
        if (p.minAmount > 0) {
          map.set(p.sku.trim(), p.minAmount);
        }
      }
    }
    return map;
  }, [products]);

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
            manufacturer: "",
            warehouseQty: initialData.currentStock ?? 0,
          });
        }
      }
    }
  }, [open, initialData, products]);

  // Reset mutation and fields when dialog opens (without initialData)
  useEffect(() => {
    if (open) {
      mutation.reset();
      if (!initialData) {
        resetFields();
      }
    }
  }, [open]);

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

    // Auto-fill supplier SKU from product data, fall back to connected products map
    const ssku = product.supplierSku || supplierSkuMap.get(product.sku.trim()) || "";
    setSupplierSku(ssku);

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
    setSupplierSku("");
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
    setDialogPhase("form");
    setReviewItems([]);
    setSubmissionStatuses([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim() || !quantity.trim()) return;

    const currentSku = dermaSku.trim();
    const linked = linkedProductsMap.get(currentSku);

    if (!linked || linked.length === 0) {
      // No connected products → submit immediately
      mutation.mutate(
        {
          orderDate: orderDate.trim(),
          supplierSku: supplierSku.trim(),
          dermaSku: currentSku,
          quantity: quantity.trim(),
          productName: productName.trim(),
          expectedDate: expectedDate.trim(),
          log: log.trim() || undefined,
          container: selectedProduct?.container || undefined,
        },
        {
          onSuccess: () => {
            resetFields();
            setOpen(false);
          },
        }
      );
    } else {
      // Build review items: original + all linked
      const originalItem: ReviewItem = {
        name: productName.trim(),
        sku: currentSku,
        supplierSku: supplierSku.trim() || supplierSkuMap.get(currentSku) || "",
        warehouseQty: contextStock ?? selectedProduct?.warehouseQty ?? 0,
        minAmount: minAmountMap.get(currentSku) ?? 0,
        quantity: quantity.trim(),
        checked: true,
        isOriginal: true,
      };

      const linkedItems: ReviewItem[] = linked.map((item) => ({
        name: item.name,
        sku: item.sku,
        supplierSku: item.supplierSku || supplierSkuMap.get(item.sku) || "",
        warehouseQty: item.warehouseQty,
        minAmount: item.minAmount,
        quantity: String(item.minAmount || ""),
        checked: true,
        isOriginal: false,
      }));

      setReviewItems([originalItem, ...linkedItems]);
      setDialogPhase("review");
    }
  };

  const handleConfirmBatch = async () => {
    const checkedItems = reviewItems.filter((item) => item.checked);
    if (checkedItems.length === 0) return;

    setDialogPhase("submitting");
    const initialStatuses: SubmissionStatus[] = checkedItems.map((item) => ({
      sku: item.sku,
      status: "pending",
    }));
    setSubmissionStatuses(initialStatuses);

    for (let i = 0; i < checkedItems.length; i++) {
      const item = checkedItems[i];
      setSubmissionStatuses((prev) =>
        prev.map((s) => s.sku === item.sku ? { ...s, status: "submitting" } : s)
      );

      try {
        await addOrder({
          orderDate: orderDate.trim(),
          supplierSku: item.supplierSku,
          dermaSku: item.sku,
          quantity: item.quantity,
          productName: item.name,
          expectedDate: expectedDate.trim(),
          log: item.isOriginal ? (log.trim() || undefined) : undefined,
          container: item.isOriginal ? (selectedProduct?.container || undefined) : undefined,
        });
        setSubmissionStatuses((prev) =>
          prev.map((s) => s.sku === item.sku ? { ...s, status: "success" } : s)
        );
      } catch (err) {
        setSubmissionStatuses((prev) =>
          prev.map((s) => s.sku === item.sku ? { ...s, status: "error", error: (err as Error).message } : s)
        );
      }
    }

    queryClient.invalidateQueries({ queryKey: ["orders"] });
  };

  const handleRetry = async (sku: string) => {
    const item = reviewItems.find((r) => r.sku === sku);
    if (!item) return;

    setSubmissionStatuses((prev) =>
      prev.map((s) => s.sku === sku ? { ...s, status: "submitting", error: undefined } : s)
    );

    try {
      await addOrder({
        orderDate: orderDate.trim(),
        supplierSku: item.supplierSku,
        dermaSku: item.sku,
        quantity: item.quantity,
        productName: item.name,
        expectedDate: expectedDate.trim(),
        log: item.isOriginal ? (log.trim() || undefined) : undefined,
        container: item.isOriginal ? (selectedProduct?.container || undefined) : undefined,
      });
      setSubmissionStatuses((prev) =>
        prev.map((s) => s.sku === sku ? { ...s, status: "success" } : s)
      );
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (err) {
      setSubmissionStatuses((prev) =>
        prev.map((s) => s.sku === sku ? { ...s, status: "error", error: (err as Error).message } : s)
      );
    }
  };

  const selectedMinAmount = selectedProduct ? minAmountMap.get(selectedProduct.sku.trim()) : undefined;

  const checkedCount = reviewItems.filter((item) => item.checked).length;
  const allResolved = submissionStatuses.length > 0 && submissionStatuses.every((s) => s.status === "success" || s.status === "error");

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
          <DialogTitle>
            {dialogPhase === "form" && "הוספת הזמנה חדשה"}
            {dialogPhase === "review" && "סקירת הזמנות"}
            {dialogPhase === "submitting" && "שליחת הזמנות"}
          </DialogTitle>
        </DialogHeader>

        {/* Phase 1: Form */}
        {dialogPhase === "form" && (
          <>
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
                  <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                    <span>מק״ט: {selectedProduct.sku}</span>
                    {selectedProduct.manufacturer && <span>ספק: {selectedProduct.manufacturer}</span>}
                    {selectedProduct.container && <span>מיכל: {selectedProduct.container}</span>}
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
          </>
        )}

        {/* Phase 2: Review */}
        {dialogPhase === "review" && (
          <div className="space-y-4">
            {/* Shared dates context */}
            <div className="flex items-center gap-4 rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span>תאריך הזמנה: <span className="font-semibold">{orderDate}</span></span>
              {expectedDate && (
                <span>צפי הגעה: <span className="font-semibold">{expectedDate}</span></span>
              )}
            </div>

            {/* Review items */}
            <div className="space-y-2">
              {reviewItems.map((item, idx) => (
                <div
                  key={item.sku}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-opacity ${
                    item.checked ? "bg-background" : "opacity-50 bg-muted/30"
                  } ${item.isOriginal ? "border-primary/30" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    disabled={item.isOriginal}
                    onChange={(e) => {
                      setReviewItems((prev) =>
                        prev.map((r, i) => i === idx ? { ...r, checked: e.target.checked } : r)
                      );
                    }}
                    className="h-4 w-4 rounded border-gray-300 accent-primary shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{item.name}</span>
                      {item.isOriginal && (
                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded shrink-0">מקורי</span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                      <span>מק״ט: {item.sku}</span>
                      <span>מלאי: {item.warehouseQty}</span>
                      {item.minAmount > 0 && <span>מינימום: {item.minAmount}</span>}
                    </div>
                  </div>
                  <Input
                    type="number"
                    value={item.quantity}
                    disabled={!item.checked}
                    onChange={(e) => {
                      setReviewItems((prev) =>
                        prev.map((r, i) => i === idx ? { ...r, quantity: e.target.value } : r)
                      );
                    }}
                    className="w-20 h-8 text-sm text-center shrink-0"
                  />
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setDialogPhase("form")}
              >
                חזור לטופס
              </Button>
              <Button
                className="flex-1"
                disabled={checkedCount === 0}
                onClick={handleConfirmBatch}
              >
                אשר {checkedCount} הזמנות
              </Button>
            </div>
          </div>
        )}

        {/* Phase 3: Submitting */}
        {dialogPhase === "submitting" && (
          <div className="space-y-4">
            <div className="space-y-2">
              {submissionStatuses.map((s) => {
                const item = reviewItems.find((r) => r.sku === s.sku);
                return (
                  <div key={s.sku} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                    <div className="shrink-0">
                      {s.status === "pending" && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />}
                      {s.status === "submitting" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                      {s.status === "success" && <Check className="h-4 w-4 text-green-600" />}
                      {s.status === "error" && <AlertCircle className="h-4 w-4 text-destructive" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{item?.name ?? s.sku}</div>
                      <div className="text-[11px] text-muted-foreground">
                        כמות: {item?.quantity}
                      </div>
                      {s.status === "error" && s.error && (
                        <div className="text-[11px] text-destructive mt-0.5">{s.error}</div>
                      )}
                    </div>
                    {s.status === "error" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs shrink-0"
                        onClick={() => handleRetry(s.sku)}
                      >
                        נסה שוב
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {allResolved && (
              <Button
                className="w-full"
                onClick={() => {
                  resetFields();
                  setOpen(false);
                }}
              >
                סגור
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
