import { Navigate, Outlet, useLocation } from "react-router-dom";

import { FullPageSpinner } from "@/shared/ui/FullPageSpinner";

import { useAuth } from "./AuthProvider";

/** Protège les routes : redirige vers /login en conservant la destination. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <Outlet />;
}
