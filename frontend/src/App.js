import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";
import { AppProvider, useApp } from "@/contexts/AppContext";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Maintenance from "@/pages/Maintenance";
import Debts from "@/pages/Debts";
import SpareParts from "@/pages/SpareParts";
import Customers from "@/pages/Customers";
import Settings from "@/pages/Settings";
import Reports from "@/pages/Reports";

function ProtectedRoute({ children }) {
  const { user } = useApp();
  if (user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <div data-testid="auth-loading">...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AuthRoute({ children }) {
  const { user } = useApp();
  if (user && typeof user === "object") return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />
      <Route path="/register" element={<AuthRoute><Register /></AuthRoute>} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="debts" element={<Debts />} />
        <Route path="spare-parts" element={<SpareParts />} />
        <Route path="customers" element={<Customers />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-center" richColors closeButton />
      </BrowserRouter>
    </AppProvider>
  );
}
