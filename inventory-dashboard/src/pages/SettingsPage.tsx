import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { MaterialIcon } from "@/components/ui/MaterialIcon";
import { useTheme } from "@/contexts/ThemeContext";

export function SettingsPage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <>
      <PageHeader
        title="הגדרות"
        actions={<span className="text-lg text-muted-foreground"><MaterialIcon name="settings" /></span>}
      />
      <div className="grid gap-4">
        {/* Theme toggle */}
        <Card>
          <CardContent className="py-6 px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10">
                  <span className="text-lg text-primary">
                    <MaterialIcon name={theme === "dark" ? "dark_mode" : "light_mode"} />
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-sm">מצב תצוגה</h3>
                  <p className="text-xs text-muted-foreground">
                    {theme === "dark" ? "מצב כהה" : "מצב בהיר"}
                  </p>
                </div>
              </div>
              <button
                onClick={toggleTheme}
                className={`relative w-12 h-7 rounded-full transition-colors ${
                  theme === "dark" ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                    theme === "dark" ? "right-0.5" : "right-[22px]"
                  }`}
                />
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-8 text-center">
            <h3 className="font-semibold text-base mb-1">כללי</h3>
            <p className="text-sm text-muted-foreground">הגדרות כלליות של המערכת</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-8 text-center">
            <h3 className="font-semibold text-base mb-1">חיבורים</h3>
            <p className="text-sm text-muted-foreground">חיבור ל-Google Sheets וממשקים חיצוניים</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-8 text-center">
            <h3 className="font-semibold text-base mb-1">ספקים</h3>
            <p className="text-sm text-muted-foreground">ניהול רשימת ספקים ופרטי קשר</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
