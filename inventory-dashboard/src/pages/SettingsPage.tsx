import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Settings } from "lucide-react";

const sections = [
  { title: "כללי", description: "הגדרות כלליות של המערכת" },
  { title: "חיבורים", description: "חיבור ל-Google Sheets וממשקים חיצוניים" },
  { title: "ספקים", description: "ניהול רשימת ספקים ופרטי קשר" },
];

export function SettingsPage() {
  return (
    <>
      <PageHeader
        title="הגדרות"
        actions={<Settings className="h-5 w-5 text-muted-foreground" />}
      />
      <div className="grid gap-4">
        {sections.map((section) => (
          <Card key={section.title}>
            <CardContent className="py-8 text-center">
              <h3 className="font-semibold text-base mb-1">{section.title}</h3>
              <p className="text-sm text-muted-foreground">{section.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
