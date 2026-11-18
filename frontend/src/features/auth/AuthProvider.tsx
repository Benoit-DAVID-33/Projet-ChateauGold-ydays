import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

import { ApiError, type User } from "@/shared/api/client";
import { authApi } from "@/shared/api/endpoints";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login(identifier: string, password: string): Promise<User>;
  register(username: string, email: string, password: string): Promise<User>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ME_QUERY_KEY = ["auth", "me"] as const;

async function fetchMe(): Promise<User | null> {
  try {
    return await authApi.me();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchMe, retry: false });

  const login = useCallback(
    async (identifier: string, password: string) => {
      const user = await authApi.login(identifier, password);
      queryClient.setQueryData(ME_QUERY_KEY, user);
      return user;
    },
    [queryClient],
  );

  const register = useCallback(
    (username: string, email: string, password: string) =>
      authApi.register(username, email, password),
    [],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      // Ne PAS utiliser queryClient.clear() : il détache l'observateur de la
      // requête « me » et l'interface garderait l'ancien utilisateur affiché.
      queryClient.setQueryData(ME_QUERY_KEY, null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
    }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ user: data ?? null, loading: isPending, login, register, logout }),
    [data, isPending, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return context;
}
