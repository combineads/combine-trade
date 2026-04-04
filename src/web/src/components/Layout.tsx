import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useAuthStore } from "../stores/auth.ts";
import { Header } from "./Header.tsx";

export function Layout() {
  const { isAuthenticated, checkAuth } = useAuthStore();
  const location = useLocation();

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0a0e14" }}>
      <Header />
      <Outlet />
    </div>
  );
}
