import { useState } from "react";
import { useAddProduct } from "@/hooks/useSheetData";
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
  const [warehouseQty, setWarehouseQty] = useState("");
  const [fixedAssignment, setFixedAssignment] = useState("");
  const [container, setContainer] = useState("");
  const mutation = useAddProduct();

  const reset = () => {
    setName("");
    setSku("");
    setSupplierSku("");
    setMinAmount("");
    setManufacturer("");
    setWarehouseQty("");
    setFixedAssignment("");
    setContainer("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sku.trim()) return;

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
        manufacturer: optText(manufacturer),
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
            <Input
              id="product-manufacturer"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              placeholder="ספק"
            />
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
