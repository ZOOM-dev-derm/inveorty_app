import { useLowStockItems } from "@/hooks/useSheetData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Package, Loader2, AlertTriangle } from "lucide-react";

export function LowStock() {
  const { data: items, isLoading, error } = useLowStockItems();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Package className="h-5 w-5 text-primary" />
        <CardTitle>מלאי נמוך</CardTitle>
        {!isLoading && (
          <Badge variant="outline" className="mr-auto">
            {items.length}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <p className="text-destructive text-sm">שגיאה בטעינת הנתונים</p>
        )}
        {!isLoading && !error && items.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-4">
            כל המוצרים במלאי תקין
          </p>
        )}
        {!isLoading && !error && items.length > 0 && (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>שם מוצר</TableHead>
                  <TableHead>מק"ט</TableHead>
                  <TableHead>כמות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.sku}>
                    <TableCell className="font-medium">
                      {item.productName}
                    </TableCell>
                    <TableCell>{item.sku}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-destructive font-bold">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {item.quantity}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
