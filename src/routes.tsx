import type { ReactNode } from "react";
import { Navigate, createBrowserRouter, useLocation } from "react-router";
import { Layout } from "./components/Layout";
import { homeFor, useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import TrackerPage, { GoalsPage } from "./pages/TrackerPage";
import { AdminOverview, AdminTable, ClientsPage, TrainerDashboard } from "./pages/RolePages";
import Reports, { DatabaseExplorer } from "./pages/Reports";
import type { Role } from "./services/api";

function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="page-loading">
        <span className="eyebrow">WellTrack</span>
        <p>Loading your workspace…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={homeFor(user?.role ?? "user")} replace />;
}

export const router = createBrowserRouter([
  { path: "/login", Component: Login },
  {
    path: "/",
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <RequireAuth roles={["user"]}><Dashboard /></RequireAuth> },
      { path: "workouts", element: <RequireAuth roles={["user"]}><TrackerPage type="workouts" /></RequireAuth> },
      { path: "nutrition", element: <RequireAuth roles={["user"]}><TrackerPage type="nutrition" /></RequireAuth> },
      { path: "wellness", element: <RequireAuth roles={["user"]}><TrackerPage type="wellness" /></RequireAuth> },
      { path: "goals", element: <RequireAuth roles={["user"]}><GoalsPage /></RequireAuth> },
      { path: "profile", Component: Profile },
      { path: "trainer", element: <RequireAuth roles={["trainer"]}><TrainerDashboard /></RequireAuth> },
      { path: "clients", element: <RequireAuth roles={["trainer"]}><ClientsPage /></RequireAuth> },
      { path: "admin", element: <RequireAuth roles={["admin"]}><AdminOverview /></RequireAuth> },
      { path: "admin/users", element: <RequireAuth roles={["admin"]}><AdminTable type="users" /></RequireAuth> },
      { path: "admin/exercises", element: <RequireAuth roles={["admin"]}><AdminTable type="exercises" /></RequireAuth> },
      { path: "admin/foods", element: <RequireAuth roles={["admin"]}><AdminTable type="foods" /></RequireAuth> },
      { path: "admin/assignments", element: <RequireAuth roles={["admin"]}><AdminTable type="assignments" /></RequireAuth> },
      { path: "reports", element: <RequireAuth roles={["admin"]}><Reports /></RequireAuth> },
      { path: "database", element: <RequireAuth roles={["admin"]}><DatabaseExplorer /></RequireAuth> },
      { path: "*", Component: HomeRedirect }
    ]
  }
]);
