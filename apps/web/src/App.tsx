import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { AppLayout } from "./layouts/AppLayout";
import { PublicLayout } from "./layouts/PublicLayout";

import Home from "./pages/public/Home";
import Features from "./pages/public/Features";
import Plans from "./pages/public/Plans";
import About from "./pages/public/About";
import Contact from "./pages/public/Contact";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Servers from "./pages/Servers";
import ServerDetail from "./pages/ServerDetail";
import ServerWizard from "./pages/ServerWizard";
import AdminUsers from "./pages/admin/Users";
import AdminUserDetail from "./pages/admin/UserDetail";
import AdminNodes from "./pages/admin/Nodes";
import AdminLocations from "./pages/admin/Locations";
import AdminAllocations from "./pages/admin/Allocations";
import AdminPlans from "./pages/admin/Plans";
import AdminEggs from "./pages/admin/Eggs";
import AdminServers from "./pages/admin/Servers";
import AdminActivity from "./pages/admin/Activity";

function Protected({ children, staffOnly }: { children: JSX.Element; staffOnly?: boolean }) {
  const { user, loading, isStaff } = useAuth();
  if (loading) return <FullScreenSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (staffOnly && !isStaff) return <Navigate to="/app" replace />;
  return children;
}

function FullScreenSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-base-950">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-accent-500" />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public marketing site */}
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="features" element={<Features />} />
        <Route path="plans" element={<Plans />} />
        <Route path="about" element={<About />} />
        <Route path="contact" element={<Contact />} />
      </Route>

      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Authenticated panel */}
      <Route
        path="/app"
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="servers" element={<Servers />} />
        <Route path="servers/new" element={<ServerWizard />} />
        <Route path="servers/:id" element={<ServerDetail />} />

        <Route
          path="admin/users"
          element={
            <Protected staffOnly>
              <AdminUsers />
            </Protected>
          }
        />
        <Route
          path="admin/users/:id"
          element={
            <Protected staffOnly>
              <AdminUserDetail />
            </Protected>
          }
        />
        <Route
          path="admin/servers"
          element={
            <Protected staffOnly>
              <AdminServers />
            </Protected>
          }
        />
        <Route
          path="admin/nodes"
          element={
            <Protected staffOnly>
              <AdminNodes />
            </Protected>
          }
        />
        <Route
          path="admin/locations"
          element={
            <Protected staffOnly>
              <AdminLocations />
            </Protected>
          }
        />
        <Route
          path="admin/allocations"
          element={
            <Protected staffOnly>
              <AdminAllocations />
            </Protected>
          }
        />
        <Route
          path="admin/plans"
          element={
            <Protected staffOnly>
              <AdminPlans />
            </Protected>
          }
        />
        <Route
          path="admin/eggs"
          element={
            <Protected staffOnly>
              <AdminEggs />
            </Protected>
          }
        />
        <Route
          path="admin/activity"
          element={
            <Protected staffOnly>
              <AdminActivity />
            </Protected>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
