import { ArrowRight, BrainCircuit, CalendarDays, ChevronRight, Clock3, Dumbbell, Flame, Flag, Moon, Plus, Sparkles, Utensils, Waves } from "lucide-react";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router";
import { api, type DashboardData } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { Card, Button, ProgressIndicator } from "../components/ui";

function StatCard({ label, value, helper, icon: Icon }: { label: string; value: string; helper: string; icon: typeof Dumbbell }) {
  return <Card className="stat-card"><div className="stat-top"><span className="icon-box"><Icon size={19} /></span></div><p>{label}</p><strong>{value}</strong><small>{helper}</small></Card>;
}

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
};

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [insight, setInsight] = useState<"idle" | "loading" | "empty">("idle");
  const [insightMessage, setInsightMessage] = useState("");

  useEffect(() => {
    let active = true;
    api
      .getDashboard()
      .then((result) => {
        if (active) setData(result.data);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, []);

  const generateInsight = async () => {
    setInsight("loading");
    try {
      const result = await api.getWellnessInsights();
      const payload = result.data;
      setInsight("empty");
      setInsightMessage(
        payload.status === "insufficient_data"
          ? payload.message ??
              `Not enough historical data. Log at least ${payload.minimumWeeks} weeks of activity (you have ${payload.availableWeeks}) to generate a reliable prediction.`
          : `Baseline ready from ${payload.availableWeeks} weeks of logged data. Prediction models are not trained yet, so no forecast is shown.`
      );
    } catch {
      setInsight("empty");
      setInsightMessage("Wellness insight is unavailable right now. Please try again later.");
    }
  };

  if (error) {
    return <div className="page-loading"><span className="eyebrow">Connection error</span><p>{error}</p></div>;
  }
  if (!data) {
    return <div className="page-loading"><span className="eyebrow">WellTrack</span><p>Loading your dashboard…</p></div>;
  }

  const weeklyGoal = data.goals.find((goal) => goal.goalType === "weekly_workout_minutes");
  const firstName = (user?.name ?? "there").split(" ")[0];
  const calorieTarget = 2100;
  const caloriePercent = Math.round((data.nutrition.calories / calorieTarget) * 100);

  return (
    <>
      <div className="welcome-row"><div><h2>{greeting()}, {firstName}</h2><p>Here’s how your health is tracking this week.</p></div><div className="quick-actions"><Link className="btn btn-secondary" to="/nutrition"><Utensils size={16} /> Log food</Link><Link className="btn btn-primary" to="/workouts"><Plus size={16} /> Log workout</Link></div></div>
      <div className="stats-grid">
        <StatCard label="Workouts this week" value={String(data.summary.workoutsThisWeek)} helper="Sessions in the last 7 days" icon={Dumbbell} />
        <StatCard label="Exercise minutes" value={String(data.summary.exerciseMinutes)} helper={weeklyGoal ? `${Math.max(weeklyGoal.target - data.summary.exerciseMinutes, 0)} min to weekly goal` : "Sessions in the last 7 days"} icon={Clock3} />
        <StatCard label="Today’s calories" value={data.summary.todayCalories.toLocaleString()} helper={`of ${calorieTarget.toLocaleString()} kcal target`} icon={Flame} />
        <StatCard label="Active goals" value={String(data.summary.activeGoals)} helper={`${data.summary.goalsOnTrack} on track`} icon={Flag} />
      </div>
      <div className="dashboard-grid">
        <Card className="chart-card wide">
          <div className="card-heading"><div><p className="eyebrow">Workout activity</p><h3>Weekly duration</h3></div><span className="select-like">Last 7 days <ChevronRight size={14} /></span></div>
          <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.weeklyActivity} barSize={24}><CartesianGrid vertical={false} stroke="#edf1ee" /><XAxis dataKey="day" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: "#f2f6f3" }} /><Bar dataKey="minutes" fill="#315d4b" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </Card>
        <Card className="nutrition-card">
          <div className="card-heading"><div><p className="eyebrow">Nutrition overview</p><h3>Daily intake</h3></div><span className="donut-label">{caloriePercent}%</span></div>
          <div className="calorie-row"><div className="calorie-ring"><span><strong>{data.nutrition.calories.toLocaleString()}</strong><small>kcal</small></span></div><div className="macro-list"><div><span>Protein</span><b>{Math.round(data.nutrition.protein)} / 145g</b><ProgressIndicator value={(data.nutrition.protein / 145) * 100} /></div><div><span>Carbs</span><b>{Math.round(data.nutrition.carbs)} / 240g</b><ProgressIndicator value={(data.nutrition.carbs / 240) * 100} /></div><div><span>Fat</span><b>{Math.round(data.nutrition.fat)} / 70g</b><ProgressIndicator value={(data.nutrition.fat / 70) * 100} /></div></div></div>
        </Card>
        <Card className="recent-card wide">
          <div className="card-heading"><div><p className="eyebrow">Recent activity</p><h3>Workout sessions</h3></div><Link to="/workouts">View all <ArrowRight size={15} /></Link></div>
          <div className="session-list">{data.recentWorkouts.length === 0 && <p className="empty-note">No workouts logged yet. Add your first session to get started.</p>}{data.recentWorkouts.slice(0, 3).map((workout) => <div className="session" key={workout.id}><span className="session-icon"><Dumbbell size={17} /></span><div><strong>{workout.name}</strong><small>{workout.date} · {workout.exercises} exercises</small></div><span>{workout.duration}</span></div>)}</div>
        </Card>
        <Card className="wellness-card">
          <div className="card-heading"><div><p className="eyebrow">Wellness trends</p><h3>Sleep consistency</h3></div><Moon size={18} /></div>
          <div className="mini-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.weeklyActivity}><XAxis dataKey="day" axisLine={false} tickLine={false} /><Tooltip /><Line type="monotone" dataKey="sleep" stroke="#315d4b" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div>
          <div className="wellness-metrics"><span><Waves size={17} /><b>{data.wellness ? `${data.wellness.waterLiters} L` : "—"}</b><small>Water</small></span><span><Sparkles size={17} /><b>{data.wellness ? data.wellness.mood : "—"}</b><small>Mood</small></span></div>
        </Card>
        <Card className="goals-card">
          <div className="card-heading"><div><p className="eyebrow">Goal progress</p><h3>Active goals</h3></div><Link to="/goals">Manage <ArrowRight size={15} /></Link></div>
          {data.goals.length === 0 && <p className="empty-note">No active goals yet.</p>}
          {data.goals.slice(0, 2).map((goal) => <div className="goal-row" key={goal.id}><div><strong>{goal.name}</strong><span>{goal.current} / {goal.target} {goal.unit}</span></div><ProgressIndicator value={(goal.current / goal.target) * 100} /><small><CalendarDays size={13} /> Due {goal.deadline}</small></div>)}
        </Card>
        <Card className="insight-card">
          <div className="insight-icon"><BrainCircuit size={20} /></div><div><p className="eyebrow">Wellness insights</p><h3>Weekly goal prediction</h3><p>{insight === "empty" ? insightMessage || "Not enough historical data. Log at least 4 weeks of activity to generate a reliable prediction." : "Use your activity, sleep, and workout history to estimate your likelihood of reaching this week’s target."}</p></div>
          <Button variant="secondary" onClick={generateInsight} disabled={insight === "loading"}>{insight === "loading" ? "Analyzing…" : "Generate insight"}</Button>
        </Card>
      </div>
    </>
  );
}
