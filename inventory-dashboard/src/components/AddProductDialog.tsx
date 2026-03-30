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
  const [manufacturer, setManufacturer] = useState("");
  const mutation = useAddProduct();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sku.trim()) return;
    mutation.mutate(
      { name: name.trim(), sku: sku.trim(), manufacturer: manufacturer.trim() || undefined },
      {
        onSuccess: () => {
          setName("");
          setSku("");
          setManufacturer("");
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
      <DialogContent dir="rtl">
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
              placeholder="מק״ט"
              required
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
