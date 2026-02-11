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
import { Plus, Loader2 } from "lucide-react";

export function AddProductDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const mutation = useAddProduct();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sku.trim()) return;
    mutation.mutate(
      { name: name.trim(), sku: sku.trim(), barcode: barcode.trim() },
      {
        onSuccess: () => {
          setName("");
          setSku("");
          setBarcode("");
          setOpen(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
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
            <Label htmlFor="product-barcode">ברקוד</Label>
            <Input
              id="product-barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="ברקוד"
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
              "הוסף מוצר"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
