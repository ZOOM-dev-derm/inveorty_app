import { useState, useEffect } from "react";
import { useAddOrder } from "@/hooks/useSheetData";
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

function todayFormatted(): string {
  const d = new Date();
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
}

export interface OrderInitialData {
  productName: string;
  dermaSku: string;
  quantity: string;
  expectedDate: string;
}

interface AddOrderDialogProps {
  initialData?: OrderInitialData;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

export function AddOrderDialog({ initialData, open: controlledOpen, onOpenChange, trigger }: AddOrderDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);

  // Controlled vs uncontrolled open state
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (onOpenChange ?? (() => {})) : setInternalOpen;

  const [orderDate, setOrderDate] = useState(todayFormatted());
  const [supplierSku, setSupplierSku] = useState("");
  const [dermaSku, setDermaSku] = useState("");
  const [quantity, setQuantity] = useState("");
  const [productName, setProductName] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const mutation = useAddOrder();

  // Pre-fill fields when dialog opens with initialData
  useEffect(() => {
    if (open && initialData) {
      setProductName(initialData.productName);
      setDermaSku(initialData.dermaSku);
      setQuantity(initialData.quantity);
      setExpectedDate(initialData.expectedDate);
      setOrderDate(todayFormatted());
      setSupplierSku("");
    }
  }, [open, initialData]);

  const resetFields = () => {
    setOrderDate(todayFormatted());
    setSupplierSku("");
    setDermaSku("");
    setQuantity("");
    setProductName("");
    setExpectedDate("");
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
      },
      {
        onSuccess: () => {
          resetFields();
          setOpen(false);
        },
      }
    );
  };

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
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>הוספת הזמנה חדשה</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
          <div className="space-y-2">
            <Label htmlFor="order-product-name">שם פריט *</Label>
            <Input
              id="order-product-name"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="שם הפריט"
              required
            />
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
              <Label htmlFor="derma-sku">קוד דרמה</Label>
              <Input
                id="derma-sku"
                value={dermaSku}
                onChange={(e) => setDermaSku(e.target.value)}
                placeholder="קוד דרמלוסופי"
              />
            </div>
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
