import { useOpenOrders } from "@/hooks/useSheetData";
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
import { ShoppingCart, Loader2 } from "lucide-react";

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split(".");
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = 2000 + parseInt(parts[2], 10);
  return new Date(year, month, day);
}

function getStatusBadge(expectedDate: string) {
  const date = parseDate(expectedDate);
  if (!date) {
    return <Badge variant="secondary">לא ידוע</Badge>;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (date < today) {
    return <Badge variant="destructive">באיחור</Badge>;
  }
  return (
    <Badge className="bg-amber-500 text-white hover:bg-amber-600">ממתין</Badge>
  );
}

export function OpenOrders() {
  const { data: orders, isLoading, error } = useOpenOrders();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <ShoppingCart className="h-5 w-5 text-primary" />
        <CardTitle>הזמנות פתוחות</CardTitle>
        {!isLoading && (
          <Badge variant="outline" className="mr-auto">
            {orders.length}
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
        {!isLoading && !error && orders.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-4">
            אין הזמנות פתוחות
          </p>
        )}
        {!isLoading && !error && orders.length > 0 && (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>תאריך הזמנה</TableHead>
                  <TableHead>שם פריט</TableHead>
                  <TableHead>כמות</TableHead>
                  <TableHead>תאריך צפי</TableHead>
                  <TableHead>סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order, idx) => (
                  <TableRow key={`${order.supplierSku}-${idx}`}>
                    <TableCell>{order.orderDate}</TableCell>
                    <TableCell className="font-medium">
                      {order.productName}
                    </TableCell>
                    <TableCell>{order.quantity}</TableCell>
                    <TableCell>{order.expectedDate || "—"}</TableCell>
                    <TableCell>{getStatusBadge(order.expectedDate)}</TableCell>
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
