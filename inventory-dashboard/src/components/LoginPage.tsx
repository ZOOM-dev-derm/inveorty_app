import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import logoSrc from "@/assets/logo.png";

export function LoginPage() {
  const { login, error, loading } = useAuth();
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading || !buttonRef.current) return;
    if (window.google?.accounts?.id) {
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        width: 300,
        text: "signin_with",
        shape: "rectangular",
      });
    }
  }, [loading]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-slate-900/30">
        <div className="animate-pulse text-muted-foreground">טוען...</div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-slate-900/30">
      <div className="flex flex-col items-center gap-8 p-8">
        <img src={logoSrc} alt="Dermalosophy" className="h-16 w-auto" />
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">דשבורד מלאי והזמנות</h1>
          <p className="text-sm text-muted-foreground">התחבר עם חשבון Google מורשה</p>
        </div>

        <div ref={buttonRef} />

        {!window.google?.accounts?.id && (
          <button
            onClick={login}
            className="px-6 py-2.5 rounded-lg border bg-background hover:bg-muted transition-colors text-sm font-medium"
          >
            התחבר עם Google
          </button>
        )}

        {error && (
          <div className="rounded-lg bg-destructive/10 text-destructive px-4 py-3 text-sm max-w-xs text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
