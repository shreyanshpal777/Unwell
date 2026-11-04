import { Activity, Apple, BarChart3, BookOpen, ChevronDown, ClipboardList, Database, Dumbbell, Flag, HeartPulse, LayoutDashboard, LogOut, Menu, PanelLeftClose, Search, Settings, ShieldCheck, Users, Utensils, X } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { Button, Input } from "./ui";

const userNav = [
  { label: "Overview", path: "/", icon: LayoutDashboard },
  { label: "Workouts", path: "/workouts", icon: Dumbbell },
  { label: "Nutrition", path: "/nutrition", icon: Apple },
  { label: "Wellness", path: "/wellness", icon: HeartPulse },
  { label: "Goals", path: "/goals", icon: Flag },
];
const trainerNav = [
  { label: "Trainer overview", path: "/trainer", icon: LayoutDashboard },
  { label: "My clients", path: "/clients", icon: Users },
];
const adminNav = [
  { label: "Admin overview", path: "/admin", icon: ShieldCheck },
  { label: "Users", path: "/admin/users", icon: Users },
  { label: "Exercises", path: "/admin/exercises", icon: Dumbbell },
  { label: "Food catalog", path: "/admin/foods", icon: Utensils },
  { label: "Assignments", path: "/admin/assignments", icon: ClipboardList },
  { label: "Reports", path: "/reports", icon: BarChart3 },
  { label: "Database explorer", path: "/database", icon: Database },
];
const titles: Record<string, string> = { "/": "Overview", "/workouts": "Workout sessions", "/nutrition": "Nutrition tracking", "/wellness": "Wellness tracking", "/goals": "Goals", "/profile": "Your profile", "/trainer": "Trainer overview", "/clients": "My clients", "/admin": "Admin overview", "/admin/users": "User management", "/admin/exercises": "Exercise catalog", "/admin/foods": "Food catalog", "/admin/assignments": "Trainer assignments", "/reports": "Database reports", "/database": "Database explorer" };

export function Layout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const nav = user?.role === "admin" ? adminNav : user?.role === "trainer" ? trainerNav : userNav;

  if (!user) return null;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand"><span className="brand-mark"><Activity size={19} /></span><span>WellTrack</span><Button variant="ghost" className="mobile-close" onClick={() => setMobileOpen(false)}><X size={18} /></Button></div>
        <div className="nav-section"><p className="nav-label">Workspace</p>
          <nav>{nav.map(({ label, path, icon: Icon }) => <NavLink key={path} to={path} end={path === "/" || path === "/admin"} onClick={() => setMobileOpen(false)}><Icon size={18} />{label}</NavLink>)}</nav>
        </div>
        <div className="sidebar-foot">
          <NavLink to="/profile"><Settings size={18} />Settings</NavLink>
          <Button className="user-chip" variant="ghost" onClick={() => setProfileOpen(!profileOpen)}>
            <span className="avatar">{user.name.split(" ").map((part) => part[0]).join("")}</span>
            <span><strong>{user.name}</strong><small>{user.role}</small></span><ChevronDown size={15} />
          </Button>
          {profileOpen && <div className="role-menu">
            <p>Signed in as</p>
            <strong className="role-menu-email">{user.email}</strong>
            <Button variant="ghost" onClick={async () => { setProfileOpen(false); await logout(); navigate("/login", { replace: true }); }}><LogOut size={14} /> Sign out</Button>
          </div>}
        </div>
      </aside>
      {mobileOpen && <div className="scrim" onClick={() => setMobileOpen(false)} />}
      <main className="main">
        <header className="header">
          <div className="header-title"><Button variant="ghost" className="menu-button" onClick={() => setMobileOpen(true)}><Menu size={20} /></Button><div><p className="eyebrow">WellTrack workspace</p><h1>{titles[location.pathname] ?? "WellTrack"}</h1></div></div>
          <div className="header-actions"><div className="header-search"><Search size={17} /><Input aria-label="Search" placeholder="Search anything" /></div><div className="date-chip"><BookOpen size={16} /><span>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span></div></div>
        </header>
        <div className="page"><Outlet /></div>
      </main>
    </div>
  );
}
