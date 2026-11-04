import { CalendarDays, KeyRound, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge, Button, Card, Input, Select } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../services/api";

const ACTIVITY_LEVELS = [
  { value: "sedentary", label: "Sedentary" },
  { value: "light", label: "Light" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
  { value: "very_high", label: "Very high" }
];

const ROLE_LABELS: Record<string, string> = { user: "Member", trainer: "Trainer", admin: "Administrator" };

const optionalNumber = (value: FormDataEntryValue | null) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

const textValue = (value: FormDataEntryValue | null) => (typeof value === "string" ? value.trim() : "");

const formatJoined = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
};

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [toast, setToast] = useState("");

  if (!user) return null;

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setProfileSaving(true);
    setProfileError("");
    try {
      await updateProfile({
        name: textValue(form.get("name")),
        email: textValue(form.get("email")),
        dateOfBirth: textValue(form.get("dateOfBirth")) || null,
        heightCm: optionalNumber(form.get("heightCm")),
        weightKg: optionalNumber(form.get("weightKg")),
        fitnessGoal: textValue(form.get("fitnessGoal")),
        activityLevel: textValue(form.get("activityLevel")) || null
      });
      notify("Profile updated");
    } catch (cause) {
      setProfileError(errorMessage(cause));
    } finally {
      setProfileSaving(false);
    }
  };

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newPassword = textValue(form.get("newPassword"));
    const confirmPassword = textValue(form.get("confirmPassword"));
    setPasswordError("");
    if (newPassword !== confirmPassword) {
      setPasswordError("The new passwords do not match.");
      return;
    }
    setPasswordSaving(true);
    try {
      await updateProfile({
        currentPassword: textValue(form.get("currentPassword")),
        newPassword
      });
      formElement.reset();
      notify("Password updated");
    } catch (cause) {
      setPasswordError(errorMessage(cause));
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <>
      <div className="page-intro">
        <div>
          <h2>Your profile</h2>
          <p>Manage the personal details and credentials behind your WellTrack account.</p>
        </div>
        <Badge>{ROLE_LABELS[user.role] ?? user.role}</Badge>
      </div>
      <div className="profile-grid">
        <Card className="profile-panel">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Personal details</p>
              <h3>Account information</h3>
            </div>
            <UserRound size={18} />
          </div>
          <form className="form-grid" onSubmit={saveProfile}>
            <label className="full">
              <span>Full name</span>
              <Input required name="name" defaultValue={user.name} autoComplete="name" />
            </label>
            <label className="full">
              <span>Email address</span>
              <Input required type="email" name="email" defaultValue={user.email} autoComplete="email" />
            </label>
            <label>
              <span>Date of birth</span>
              <Input type="date" name="dateOfBirth" defaultValue={user.dateOfBirth ?? ""} max={new Date().toISOString().slice(0, 10)} />
            </label>
            <label>
              <span>Activity level</span>
              <Select name="activityLevel" defaultValue={user.activityLevel ?? "moderate"}>
                {ACTIVITY_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </Select>
            </label>
            <label>
              <span>Height (cm)</span>
              <Input type="number" name="heightCm" min="50" max="300" step="0.1" defaultValue={user.heightCm ?? ""} />
            </label>
            <label>
              <span>Weight (kg)</span>
              <Input type="number" name="weightKg" min="20" max="500" step="0.1" defaultValue={user.weightKg ?? ""} />
            </label>
            <label className="full">
              <span>Fitness goal</span>
              <Input name="fitnessGoal" maxLength={160} defaultValue={user.fitnessGoal ?? ""} placeholder="Build strength" />
            </label>
            {profileError && (
              <p className="form-error full" role="alert">
                {profileError}
              </p>
            )}
            <div className="form-actions full">
              <Button type="submit" disabled={profileSaving}>
                {profileSaving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </Card>
        <div className="profile-side">
          <Card className="profile-panel">
            <div className="card-heading">
              <div>
                <p className="eyebrow">Account</p>
                <h3>Access summary</h3>
              </div>
              <ShieldCheck size={18} />
            </div>
            <div className="profile-meta">
              <div>
                <span>
                  <Mail size={14} /> Email
                </span>
                <strong>{user.email}</strong>
              </div>
              <div>
                <span>
                  <ShieldCheck size={14} /> Role
                </span>
                <strong>{ROLE_LABELS[user.role] ?? user.role}</strong>
              </div>
              <div>
                <span>
                  <CalendarDays size={14} /> Member since
                </span>
                <strong>{formatJoined(user.joinedAt)}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{user.isActive === false ? "Deactivated" : "Active"}</strong>
              </div>
            </div>
            <p className="profile-hint">Roles are managed by an administrator. Contact one if your access needs to change.</p>
          </Card>
          <Card className="profile-panel">
            <div className="card-heading">
              <div>
                <p className="eyebrow">Security</p>
                <h3>Change password</h3>
              </div>
              <KeyRound size={18} />
            </div>
            <form className="form-grid" onSubmit={savePassword}>
              <label className="full">
                <span>Current password</span>
                <Input required type="password" name="currentPassword" autoComplete="current-password" />
              </label>
              <label className="full">
                <span>New password</span>
                <Input required type="password" name="newPassword" minLength={8} autoComplete="new-password" placeholder="At least 8 characters" />
              </label>
              <label className="full">
                <span>Confirm new password</span>
                <Input required type="password" name="confirmPassword" minLength={8} autoComplete="new-password" />
              </label>
              {passwordError && (
                <p className="form-error full" role="alert">
                  {passwordError}
                </p>
              )}
              <div className="form-actions full">
                <Button type="submit" variant="secondary" disabled={passwordSaving}>
                  {passwordSaving ? "Updating…" : "Update password"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
      {toast && (
        <div className="toast">
          <Badge>Saved</Badge>
          {toast}
        </div>
      )}
    </>
  );
}
