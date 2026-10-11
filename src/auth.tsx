import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "../shared/contracts";
import { api, ApiError, errorText, post } from "./api";
const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  error: string;
  local: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}>({
  user: null,
  loading: true,
  error: "",
  local: false,
  refresh: async () => {},
  logout: async () => {},
});
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [local, setLocal] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api<{ user: User; local: boolean }>("/me");
      setUser(result.user);
      setLocal(result.local);
    } catch (e) {
      setUser(null);
      if (!(e instanceof ApiError && e.status === 401)) setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        local,
        refresh,
        logout: async () => {
          await post("/auth/logout");
          setUser(null);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
