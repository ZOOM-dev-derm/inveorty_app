import { useInventoryOverview } from "@/hooks/useSheetData";
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
import { MaterialIcon } from "@/components/ui/MaterialIcon";

export function InventoryOverview() {
  const { data: items, isLoading, error } = useInventoryOverview();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <span className="text-xl text-primary"><MaterialIcon name="assignment" /></span>
        <CardTitle>סקירת מלאי</CardTitle>
        {!isLoading && (
          <Badge variant="outline" className="mr-auto">
            {items.length} מוצרים
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <span className="text-2xl animate-spin text-muted-foreground"><MaterialIcon name="progress_activity" /></span>
          </div>
        )}
        {error && (
          <p className="text-destructive text-sm">שגיאה בטעינת הנתונים</p>
        )}
        {!isLoading && !error && items.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-4">
            אין נתוני מלאי
          </p>
        )}
        {!isLoading && !error && items.length > 0 && (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>שם מוצר</TableHead>
                  <TableHead>מלאי נוכחי</TableHead>
                  <TableHead>הזמנות פתוחות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.sku}>
                    <TableCell className="font-medium">
                      {item.productName}
                    </TableCell>
                    <TableCell>{item.currentStock}</TableCell>
                    <TableCell>
                      {item.onTheWay > 0 ? (
                        <Badge className="bg-blue-500 text-white hover:bg-blue-600">
                          {item.onTheWay}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
