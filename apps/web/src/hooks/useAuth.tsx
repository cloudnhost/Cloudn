import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../lib/api";

export interface Me {
  id: string;
  email: string;
  username: string;
  role: "USER" | "STAFF" | "ADMIN" | "SUPER_ADMIN";
  status: string;
  planId: string | null;
}

interface AuthContextValue {
  user: Me | null;
  loading: boolean;
  isStaff: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const me = await api.get<Me>("/auth/me");
      setUser(me);
    } catch (e) {
      if (e instanceof ApiError) setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await api.post("/auth/logout").catch(() => {});
    setUser(null);
  }

  useEffect(() => {
    refresh();
  }, []);

  const isStaff = !!user && ["STAFF", "ADMIN", "SUPER_ADMIN"].includes(user.role);
  const isAdmin = !!user && ["ADMIN", "SUPER_ADMIN"].includes(user.role);

  return (
    <AuthContext.Provider value={{ user, loading, isStaff, isAdmin, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
