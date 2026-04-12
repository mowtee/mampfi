import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type AuthUser } from "../lib/api";

export function useAuth() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.getAuthMe(),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    qc.clear();
    window.location.href = "/login";
  };

  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    isAuthenticated: !!query.data,
    logout,
  };
}

export type { AuthUser };
