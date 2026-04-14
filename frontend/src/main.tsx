import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./i18n";
import App from "./App";
import { useAuth } from "./hooks/useAuth";
import EventsList from "./pages/EventsList";
import EventDetail from "./pages/EventDetail";
import ForgotPassword from "./pages/ForgotPassword";
import Join from "./pages/Join";
import Login from "./pages/Login";
import NewEvent from "./pages/NewEvent";
import ResetPassword from "./pages/ResetPassword";
import Signup from "./pages/Signup";
import VerifyEmail from "./pages/VerifyEmail";
import LegalPage from "./pages/LegalPage";
import "./tailwind.css";
import "./styles.css";

function RequireAuth() {
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

const el = document.getElementById("root")!;
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: "always",
      refetchOnReconnect: "always",
      staleTime: 0,
    },
  },
});
createRoot(el).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/join" element={<Join />} />
          <Route path="/privacy" element={<LegalPage />} />
          <Route path="/terms" element={<LegalPage />} />
          <Route path="/legal-notice" element={<LegalPage />} />

          {/* Protected routes */}
          <Route element={<RequireAuth />}>
            <Route element={<App />}>
              <Route index element={<EventsList />} />
              <Route path="/events/:eventId" element={<EventDetail />} />
              <Route path="/events/new" element={<NewEvent />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
