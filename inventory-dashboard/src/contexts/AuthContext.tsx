import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface AuthUser {
  email: string;
  name: string;
  picture: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = "dermalosophy_auth_user";
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const AUTHORIZED_EMAILS = (import.meta.env.VITE_AUTHORIZED_EMAILS || "")
  .split(",")
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean);

function decodeJwtPayload(token: string): Record<string, string> {
  const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(base64));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleCredentialResponse = useCallback((response: { credential: string }) => {
    const payload = decodeJwtPayload(response.credential);
    const email = payload.email?.toLowerCase();

    if (!AUTHORIZED_EMAILS.includes(email)) {
      setError("אין לך הרשאה לגשת למערכת");
      setUser(null);
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    const authUser: AuthUser = {
      email,
      name: payload.name || email,
      picture: payload.picture || "",
    };
    setUser(authUser);
    setError(null);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
  }, []);

  // Initialize Google Sign-In
  useEffect(() => {
    if (!CLIENT_ID) {
      setLoading(false);
      return;
    }

    // Check cached session
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (AUTHORIZED_EMAILS.includes(parsed.email?.toLowerCase())) {
          setUser(parsed);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    // Wait for GSI to load
    const initGsi = () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: handleCredentialResponse,
          auto_select: true,
        });
        setLoading(false);
      } else {
        setTimeout(initGsi, 100);
      }
    };
    initGsi();
  }, [handleCredentialResponse]);

  const login = useCallback(() => {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
