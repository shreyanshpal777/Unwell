import { Activity, ArrowRight, CheckCircle2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { Button, Input } from "../components/ui";
import { homeFor, useAuth } from "../context/AuthContext";
import { ApiError } from "../services/api";

const ACTIVITY_ALIASES: Record<string, string> = {
  sedentary: "sedentary",
  light: "light",
  moderate: "moderate",
  high: "high",
  very_high: "very_high"
};

const normalizeActivity = (value: string) => {
  const cleaned = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ACTIVITY_ALIASES[cleaned] ?? "moderate";
};

const optionalNumber = (value: FormDataEntryValue | null) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

const errorMessage = (error: unknown) =>
  error instanceof ApiError
    ? error.fields
      ? Object.values(error.fields)[0]
      : error.message
    : "Something went wrong. Please try again.";

export default function Login() {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { user, loading, login, register: createAccount } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  useEffect(() => {
    if (!loading && user) navigate(from ?? homeFor(user.role), { replace: true });
  }, [user, loading, from, navigate]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      if (register) {
        const session = await createAccount({
          name: String(form.get("name") ?? "").trim(),
          email: String(form.get("email") ?? "").trim(),
          password: String(form.get("password") ?? ""),
          dateOfBirth: String(form.get("dateOfBirth") ?? ""),
          heightCm: optionalNumber(form.get("heightCm")),
          weightKg: optionalNumber(form.get("weightKg")),
          fitnessGoal: String(form.get("fitnessGoal") ?? "").trim(),
          activityLevel: normalizeActivity(String(form.get("activityLevel") ?? ""))
        });
        navigate(homeFor(session.role), { replace: true });
      } else {
        const session = await login(String(form.get("email") ?? "").trim(), String(form.get("password") ?? ""));
        navigate(from ?? homeFor(session.role), { replace: true });
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return <main className="auth-page"><section className="auth-story"><div className="brand light"><span className="brand-mark"><Activity size={19} /></span><span>WellTrack</span></div><div><p className="eyebrow">Fitness & wellness management</p><h1>Every health signal,<br />beautifully organized.</h1><p>A calm, relational workspace for training, nutrition, wellness, and measurable progress.</p><ul><li><CheckCircle2 size={17} />Understand trends across your health data</li><li><CheckCircle2 size={17} />Manage goals with clear progress</li><li><CheckCircle2 size={17} />Built on a secure PostgreSQL data model</li></ul></div></section><section className="auth-form-wrap"><form className="auth-form" onSubmit={submit}><p className="eyebrow">{register ? "Create your account" : "Welcome back"}</p><h2>{register ? "Start tracking with clarity" : "Sign in to WellTrack"}</h2><p>{register ? "New accounts are created with the user role." : "Sign in with your WellTrack account."}</p>{register && <><label><span>Full name</span><Input required name="name" placeholder="Your full name" /></label><div className="form-grid"><label><span>Date of birth</span><Input required type="date" name="dateOfBirth" /></label><label><span>Activity level</span><Input required placeholder="Moderate" name="activityLevel" defaultValue="Moderate" /></label><label><span>Height (cm)</span><Input required type="number" name="heightCm" min="50" max="300" /></label><label><span>Weight (kg)</span><Input required type="number" name="weightKg" min="20" max="500" /></label></div><label><span>Fitness goal</span><Input required placeholder="Build strength" name="fitnessGoal" /></label></>}<label><span>Email address</span><Input required type="email" name="email" /></label><label><span>Password</span><Input required type="password" name="password" /></label>{error && <p className="form-error" role="alert">{error}</p>}<Button className="auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : register ? "Create account" : "Sign in"}<ArrowRight size={17} /></Button><div className="auth-switch">{register ? "Already have an account?" : "New to WellTrack?"}<Button variant="ghost" type="button" onClick={() => { setRegister(!register); setError(""); }}>{register ? "Sign in" : "Create account"}</Button></div></form></section></main>;
}
