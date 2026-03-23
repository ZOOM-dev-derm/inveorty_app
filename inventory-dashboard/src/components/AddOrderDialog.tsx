import { useState, useEffect, useRef, useMemo } from "react";
import { useAddOrder, useProducts, useLinkedProducts, useOpenOrders, useOrders } from "@/hooks/useSheetData";
import { useQueryClient } from "@tanstack/react-query";
import { addOrder, sendDailyOrderEmail } from "@/services/googleSheets";
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
import { Plus, Loader2, X, Package, Check, AlertCircle, Mail } from "lucide-react";

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
  isSuggestion?: boolean;
  container?: string;
  distributionNotes?: string;
  packagingLabels?: string;
  formula?: string;
  content?: string;
  parentSku?: string; // linked sub-item of a suggestion
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
  const [distributionNotes, setDistributionNotes] = useState("");
  const [packagingLabels, setPackagingLabels] = useState("");

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
  const { data: openOrders } = useOpenOrders();
  const { data: allOrders } = useOrders();
  const queryClient = useQueryClient();

  // Three-phase dialog state
  const [dialogPhase, setDialogPhase] = useState<"form" | "review" | "submitting">("form");
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [submissionStatuses, setSubmissionStatuses] = useState<SubmissionStatus[]>([]);
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

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

  // Build previous order lookup: dermaSku → most recent order with richest data
  const prevOrderMap = useMemo(() => {
    const map = new Map<string, { distributionNotes: string; packagingLabels: string; formula: string; content: string; container: string }>();
    if (allOrders) {
      for (const o of allOrders) {
        if (!o.dermaSku) continue;
        const sku = o.dermaSku.trim();
        const existing = map.get(sku);
        const filledCount = [o.distributionNotes, o.packagingLabels, o.formula, o.content].filter(Boolean).length;
        const existingCount = existing ? [existing.distributionNotes, existing.packagingLabels, existing.formula, existing.content].filter(Boolean).length : 0;
        if (!existing || filledCount > existingCount) {
          map.set(sku, {
            distributionNotes: o.distributionNotes || "",
            packagingLabels: o.packagingLabels || "",
            formula: o.formula || "",
            content: o.content || "",
            container: o.container || "",
          });
        }
      }
    }
    return map;
  }, [allOrders]);

  // Build set of SKUs that already have open orders
  const openOrderSkus = useMemo(() => {
    const set = new Set<string>();
    if (openOrders) {
      for (const o of openOrders) {
        if (o.dermaSku) set.add(o.dermaSku.trim());
      }
    }
    return set;
  }, [openOrders]);

  // Low-stock Peer Pharm products without open orders (for suggestions)
  const lowStockSuggestions = useMemo(() => {
    if (!products) return [];
    return products.filter((p) => {
      if (!p.manufacturer.includes("פאר")) return false;
      if (p.minAmount <= 0) return false;
      if (p.warehouseQty > p.minAmount * 1.1) return false;
      if (openOrderSkus.has(p.sku.trim())) return false;
      return true;
    });
  }, [products, openOrderSkus]);

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
      setLog("");
      setSearchQuery(initialData.productName);
      setContextStock(initialData.currentStock);
      setContextOnTheWay(initialData.onTheWay);

      // Find matching product from the products list
      if (products) {
        const match = products.find((p) => p.sku === initialData.dermaSku);
        if (match) {
          setSelectedProduct(match);
          setSupplierSku(match.supplierSku || supplierSkuMap.get(match.sku.trim()) || "");
          // Auto-fill from previous order
          const prev = prevOrderMap.get(match.sku.trim());
          if (prev) {
            setDistributionNotes(prev.distributionNotes);
          }
        } else {
          setSupplierSku("");
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

    // Auto-fill from previous order (if orders already loaded)
    const prev = prevOrderMap.get(product.sku.trim());
    if (prev) {
      setDistributionNotes(prev.distributionNotes);
    }
  };

  // Re-fill from previous order when orders data loads after product selection
  useEffect(() => {
    if (!selectedProduct || prevOrderMap.size === 0) return;
    const prev = prevOrderMap.get(selectedProduct.sku.trim());
    if (prev) {
      if (!distributionNotes) setDistributionNotes(prev.distributionNotes);
    }
  }, [selectedProduct, prevOrderMap]);

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
    setDistributionNotes("");
    setPackagingLabels("");
    setSearchQuery("");
    setSelectedProduct(null);
    setContextStock(undefined);
    setContextOnTheWay(undefined);
    setDialogPhase("form");
    setReviewItems([]);
    setSubmissionStatuses([]);
    setEmailStatus("idle");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim() || !quantity.trim()) return;

    const currentSku = dermaSku.trim();
    const linked = linkedProductsMap.get(currentSku);

    // Build review items: original product
    // Build product lookup for container info
    const productLookup = new Map<string, typeof products extends (infer T)[] | undefined ? T : never>();
    if (products) {
      for (const p of products) productLookup.set(p.sku.trim(), p);
    }

    const prevOrig = prevOrderMap.get(currentSku);
    const originalItem: ReviewItem = {
      name: productName.trim(),
      sku: currentSku,
      supplierSku: supplierSku.trim() || supplierSkuMap.get(currentSku) || "",
      warehouseQty: contextStock ?? selectedProduct?.warehouseQty ?? 0,
      minAmount: minAmountMap.get(currentSku) ?? 0,
      quantity: quantity.trim(),
      checked: true,
      isOriginal: true,
      container: selectedProduct?.container || productLookup.get(currentSku)?.container || "",
      distributionNotes: distributionNotes.trim(),
      packagingLabels: packagingLabels.trim(),
      formula: prevOrig?.formula || "",
      content: prevOrig?.content || "",
    };

    // Linked products from recipe groups
    const linkedItems: ReviewItem[] = (linked ?? []).map((item) => {
      const prev = prevOrderMap.get(item.sku.trim());
      return {
        name: item.name,
        sku: item.sku,
        supplierSku: item.supplierSku || supplierSkuMap.get(item.sku) || "",
        warehouseQty: item.warehouseQty,
        minAmount: item.minAmount,
        quantity: String(item.minAmount || ""),
        checked: true,
        isOriginal: false,
        container: productLookup.get(item.sku.trim())?.container || "",
        distributionNotes: prev?.distributionNotes || "",
        packagingLabels: prev?.packagingLabels || "",
        formula: prev?.formula || "",
        content: prev?.content || "",
      };
    });

    // Low-stock suggestions (exclude original and linked SKUs)
    const excludeSkus = new Set([currentSku, ...linkedItems.map((l) => l.sku)]);
    const suggestionItems: ReviewItem[] = lowStockSuggestions
      .filter((p) => !excludeSkus.has(p.sku.trim()))
      .map((p) => {
        const prev = prevOrderMap.get(p.sku.trim());
        return {
          name: p.name,
          sku: p.sku,
          supplierSku: p.supplierSku || supplierSkuMap.get(p.sku.trim()) || "",
          warehouseQty: p.warehouseQty,
          minAmount: p.minAmount,
          quantity: String(p.minAmount || ""),
          checked: false,
          isOriginal: false,
          isSuggestion: true,
          container: p.container || "",
          distributionNotes: prev?.distributionNotes || "",
          packagingLabels: prev?.packagingLabels || "",
          formula: prev?.formula || "",
          content: prev?.content || "",
        };
      });

    setReviewItems([originalItem, ...linkedItems, ...suggestionItems]);
    setDialogPhase("review");
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

    let hasAnySuccess = false;
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
          container: item.container || undefined,
          distributionNotes: item.distributionNotes || undefined,
          packagingLabels: item.packagingLabels || undefined,
          formula: item.formula || undefined,
          content: item.content || undefined,
        });
        setSubmissionStatuses((prev) =>
          prev.map((s) => s.sku === item.sku ? { ...s, status: "success" } : s)
        );
        hasAnySuccess = true;
      } catch (err) {
        setSubmissionStatuses((prev) =>
          prev.map((s) => s.sku === item.sku ? { ...s, status: "error", error: (err as Error).message } : s)
        );
      }
    }

    queryClient.invalidateQueries({ queryKey: ["orders"] });

    // Send consolidated daily email if at least one order succeeded
    if (hasAnySuccess) {
      try {
        setEmailStatus("sending");
        await sendDailyOrderEmail(orderDate.trim());
        setEmailStatus("sent");
      } catch {
        setEmailStatus("error");
      }
    }
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
        container: item.container || undefined,
        distributionNotes: item.distributionNotes || undefined,
        packagingLabels: item.packagingLabels || undefined,
        formula: item.formula || undefined,
        content: item.content || undefined,
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
                <Label htmlFor="distribution-notes">חלוקה+הערות</Label>
                <Input
                  id="distribution-notes"
                  value={distributionNotes}
                  onChange={(e) => setDistributionNotes(e.target.value)}
                  placeholder="חלוקה והערות..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="packaging-labels">אריזות ומדבקות</Label>
                <Input
                  id="packaging-labels"
                  value={packagingLabels}
                  onChange={(e) => setPackagingLabels(e.target.value)}
                  placeholder="אריזות ומדבקות..."
                />
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
              {(() => {
                let shownSeparator = false;

                const handleSuggestionCheck = (idx: number, checked: boolean) => {
                  setReviewItems((prev) => {
                    const item = prev[idx];
                    let updated = prev.map((r, i) => i === idx ? { ...r, checked } : r);

                    if (checked && item.isSuggestion) {
                      // Add linked products if they exist
                      const linked = linkedProductsMap.get(item.sku.trim());
                      if (linked && linked.length > 0) {
                        const existingSkus = new Set(updated.map((r) => r.sku));
                        const linkedItems: ReviewItem[] = linked
                          .filter((l) => !existingSkus.has(l.sku))
                          .map((l) => {
                            const prev2 = prevOrderMap.get(l.sku.trim());
                            return {
                              name: l.name,
                              sku: l.sku,
                              supplierSku: l.supplierSku || supplierSkuMap.get(l.sku) || "",
                              warehouseQty: l.warehouseQty,
                              minAmount: l.minAmount,
                              quantity: String(l.minAmount || ""),
                              checked: false,
                              isOriginal: false,
                              parentSku: item.sku,
                              container: products?.find((p) => p.sku.trim() === l.sku.trim())?.container || "",
                              distributionNotes: prev2?.distributionNotes || "",
                              formula: prev2?.formula || "",
                              content: prev2?.content || "",
                            };
                          });
                        // Insert linked items right after the parent
                        updated = [...updated.slice(0, idx + 1), ...linkedItems, ...updated.slice(idx + 1)];
                      }
                    } else if (!checked && item.isSuggestion) {
                      // Remove linked sub-items of this parent
                      updated = updated.filter((r) => r.parentSku !== item.sku);
                    }
                    return updated;
                  });
                };

                return reviewItems.map((item, idx) => {
                  const showSeparator = item.isSuggestion && !item.parentSku && !shownSeparator;
                  if (showSeparator) shownSeparator = true;
                  const isLinkedChild = !!item.parentSku;

                  return (
                    <div key={item.sku}>
                      {showSeparator && (
                        <div className="flex items-center gap-2 pt-2 pb-1">
                          <div className="flex-1 border-t border-dashed border-amber-400/60" />
                          <span className="text-xs text-amber-600 font-medium whitespace-nowrap">מוצרים נוספים מתחת למינימום</span>
                          <div className="flex-1 border-t border-dashed border-amber-400/60" />
                        </div>
                      )}
                      <div
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-opacity ${
                          item.checked ? "bg-background" : "opacity-50 bg-muted/30"
                        } ${item.isOriginal ? "border-primary/30" : ""} ${item.isSuggestion && !item.checked ? "border-amber-200" : ""} ${isLinkedChild ? "mr-6 border-dashed" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={item.checked}
                          disabled={item.isOriginal}
                          onChange={(e) => {
                            if (item.isSuggestion && !item.parentSku) {
                              handleSuggestionCheck(idx, e.target.checked);
                            } else {
                              setReviewItems((prev) =>
                                prev.map((r, i) => i === idx ? { ...r, checked: e.target.checked } : r)
                              );
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300 accent-primary shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{item.name}</span>
                            {item.isOriginal && (
                              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded shrink-0">מקורי</span>
                            )}
                            {isLinkedChild && (
                              <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded shrink-0">מקושר</span>
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
                      {/* Expanded details when suggestion is checked */}
                      {item.isSuggestion && item.checked && !isLinkedChild && (
                        <div className="mt-1 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 px-3 py-2 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-muted-foreground">מק״ט ספק</label>
                              <Input
                                value={item.supplierSku}
                                onChange={(e) => {
                                  setReviewItems((prev) =>
                                    prev.map((r, i) => i === idx ? { ...r, supplierSku: e.target.value } : r)
                                  );
                                }}
                                className="h-7 text-xs"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground">חלוקה+הערות</label>
                              <Input
                                value={item.distributionNotes || ""}
                                onChange={(e) => {
                                  setReviewItems((prev) =>
                                    prev.map((r, i) => i === idx ? { ...r, distributionNotes: e.target.value } : r)
                                  );
                                }}
                                className="h-7 text-xs"
                              />
                            </div>
                          </div>
                          {(item.container || item.content || item.formula) && (
                            <div className="text-[10px] text-muted-foreground flex items-center gap-3 flex-wrap">
                              {item.container && <span>מיכל: {item.container}</span>}
                              {item.content && <span>תכולה: {item.content}</span>}
                              {item.formula && <span>פורמולה: {item.formula}</span>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
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

            {/* Email status */}
            {emailStatus !== "idle" && (
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                emailStatus === "sending" ? "bg-blue-50 text-blue-700" :
                emailStatus === "sent" ? "bg-green-50 text-green-700" :
                "bg-red-50 text-red-700"
              }`}>
                {emailStatus === "sending" && <Loader2 className="h-4 w-4 animate-spin" />}
                {emailStatus === "sent" && <Mail className="h-4 w-4" />}
                {emailStatus === "error" && <AlertCircle className="h-4 w-4" />}
                <span>
                  {emailStatus === "sending" && "שולח מייל מרוכז לספק..."}
                  {emailStatus === "sent" && "מייל הזמנה נשלח בהצלחה"}
                  {emailStatus === "error" && "שגיאה בשליחת מייל"}
                </span>
              </div>
            )}

            {allResolved && emailStatus !== "sending" && (
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
