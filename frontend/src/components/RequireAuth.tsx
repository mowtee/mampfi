import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading)
    return (
      <p className="muted" style={{ padding: 24 }}>
        Loading...
      </p>
    );
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}
