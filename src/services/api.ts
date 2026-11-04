export type Role = "user" | "trainer" | "admin";

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  heightCm?: number | null;
  weightKg?: number | null;
  dateOfBirth?: string | null;
  fitnessGoal?: string | null;
  activityLevel?: string | null;
  isActive?: boolean;
  joinedAt?: string;
}

export interface QueryInfo {
  sql: string;
  ms: number;
  rowCount: number;
}

export interface ApiResult<T> {
  data: T;
  query?: QueryInfo;
  total?: number;
  statistics?: Record<string, number>;
}

export class ApiError extends Error {
  code: string;
  status: number;
  fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const errorMessage = (error: unknown) =>
  error instanceof ApiError
    ? error.fields
      ? Object.values(error.fields)[0]
      : error.message
    : "Something went wrong. Please try again.";

export const UNAUTHORIZED_EVENT = "welltrack:unauthorized";

interface Envelope<T> {
  data: T;
  meta?: {
    requestId?: string;
    query?: QueryInfo;
    total?: number;
    statistics?: Record<string, number>;
  };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<Envelope<T>> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: "include",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers ?? {})
      }
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Is the backend running?");
  }

  let payload: Envelope<T> | null = null;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    const error = (payload as { error?: { code?: string; message?: string; fields?: Record<string, string> } } | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? `Request failed with status ${response.status}.`,
      error?.fields
    );
  }
  return payload as Envelope<T>;
}

const qs = (params: Record<string, unknown> = {}) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const rendered = search.toString();
  return rendered ? `?${rendered}` : "";
};

const unwrap = async <T>(path: string, options?: RequestInit): Promise<ApiResult<T>> => {
  const payload = await request<T>(path, options);
  return { data: payload.data, query: payload.meta?.query, total: payload.meta?.total, statistics: payload.meta?.statistics };
};

const jsonBody = (payload: unknown): string => JSON.stringify(payload ?? {});

export interface Exercise {
  id: number;
  name: string;
  muscleGroup: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  caloriesPerMinute: number;
  isActive: boolean;
}

export interface Food {
  id: number;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingUnit: string;
  isActive: boolean;
}

export interface SessionExercise {
  exerciseId: number;
  name: string;
  sets: number;
  reps: number;
  weightKg: number | null;
}

export interface Workout {
  id: number;
  userId: number;
  userName?: string;
  date: string;
  title: string | null;
  name: string;
  durationMinutes: number;
  notes: string | null;
  exercises: SessionExercise[];
  exerciseCount: number;
}

export interface NutritionLog {
  id: number;
  foodId: number;
  food: string;
  meal: string;
  mealType: string;
  quantity: string;
  quantityGrams: number;
  calories: number;
  protein: string;
  carbs: string;
  fat: string;
  date: string;
}

export interface NutritionTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface WellnessLog {
  id: number;
  date: string;
  sleep: string;
  sleepHours: number;
  water: string;
  waterLiters: number;
  stress: string;
  stressLevel: number;
  mood: string;
  moodValue: string;
}

export interface Goal {
  id: number;
  name: string;
  goalType: string;
  target: number;
  current: number;
  unit: string;
  deadline: string;
  deadlineLabel: string;
  status: string;
}

export interface DashboardData {
  summary: {
    workoutsThisWeek: number;
    exerciseMinutes: number;
    todayCalories: number;
    activeGoals: number;
    goalsOnTrack: number;
  };
  weeklyActivity: { day: string; minutes: number; sleep: number }[];
  recentWorkouts: { id: number; name: string; date: string; duration: string; exercises: number }[];
  nutrition: { calories: number; protein: number; carbs: number; fat: number };
  wellness: { sleepHours: number; waterLiters: number; mood: string } | null;
  goals: { id: number; goalType: string; name: string; current: number; target: number; unit: string; deadline: string }[];
}

export interface ClientRow {
  id: number;
  name: string;
  email: string;
  goal: string;
  level: string;
  last: string;
  progress: string;
  progressValue: number;
  workoutsThisWeek: number;
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  goal: string;
  activityLevel: string | null;
  isActive: boolean;
  joined: string;
  trainerAssignments?: number;
}

export interface Assignment {
  trainerId: number;
  clientId: number;
  trainerName: string;
  clientName: string;
  clientEmail: string;
  goal: string;
  last: string;
}

export interface TrainerOption {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
  foreignKey: { table: string; column: string; onDelete: string }[];
}

export interface DatabaseSchema {
  tableCount: number;
  relationshipCount: number;
  tables: { name: string; columns: SchemaColumn[]; primaryKey: string[] }[];
}

export interface RegistrationPayload {
  name: string;
  email: string;
  password: string;
  dateOfBirth?: string;
  heightCm?: number | null;
  weightKg?: number | null;
  fitnessGoal?: string;
  activityLevel?: string;
}

export interface ProfileUpdate {
  name?: string;
  email?: string;
  dateOfBirth?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  fitnessGoal?: string | null;
  activityLevel?: string | null;
  currentPassword?: string;
  newPassword?: string;
}

export const api = {
  loginUser: async (email: string, password: string) => {
    const payload = await request<{ user: SessionUser }>("/auth/login", { method: "POST", body: jsonBody({ email, password }) });
    return payload.data.user;
  },
  registerUser: async (payload: RegistrationPayload) => {
    const response = await request<{ user: SessionUser }>("/auth/register", { method: "POST", body: jsonBody(payload) });
    return response.data.user;
  },
  getCurrentUser: async () => {
    const payload = await request<{ user: SessionUser }>("/auth/me");
    return payload.data.user;
  },
  updateProfile: async (payload: ProfileUpdate) => {
    const response = await request<{ user: SessionUser }>("/auth/me", { method: "PATCH", body: jsonBody(payload) });
    return response.data.user;
  },
  logoutUser: async () => {
    await request<{ loggedOut: boolean }>("/auth/logout", { method: "POST" });
  },

  getDashboard: async (params: { from?: string; to?: string } = {}) =>
    unwrap<DashboardData>(`/dashboard${qs(params)}`),

  getExercises: (params: { q?: string; muscleGroup?: string; difficulty?: string; includeInactive?: boolean } = {}) =>
    unwrap<Exercise[]>(`/exercises${qs(params)}`),
  searchExercises: (query: string) => unwrap<Exercise[]>(`/exercises${qs({ q: query })}`),
  addExercise: (payload: { name: string; muscleGroup: string; difficulty: string; caloriesPerMinute: number }) =>
    unwrap<Exercise>("/exercises", { method: "POST", body: jsonBody(payload) }),
  updateExercise: (id: number, payload: Partial<{ name: string; muscleGroup: string; difficulty: string; caloriesPerMinute: number; isActive: boolean }>) =>
    unwrap<Exercise>(`/exercises/${id}`, { method: "PATCH", body: jsonBody(payload) }),
  deleteExercise: (id: number) => unwrap<{ id: number }>(`/exercises/${id}`, { method: "DELETE" }),

  getFoods: (params: { q?: string; includeInactive?: boolean } = {}) => unwrap<Food[]>(`/foods${qs(params)}`),
  searchFoods: (query: string) => unwrap<Food[]>(`/foods${qs({ q: query })}`),
  addFood: (payload: { name: string; calories: number; protein: number; carbs: number; fat: number }) =>
    unwrap<Food>("/foods", { method: "POST", body: jsonBody(payload) }),
  updateFood: (id: number, payload: Partial<{ name: string; calories: number; protein: number; carbs: number; fat: number; isActive: boolean }>) =>
    unwrap<Food>(`/foods/${id}`, { method: "PATCH", body: jsonBody(payload) }),
  deleteFood: (id: number) => unwrap<{ id: number }>(`/foods/${id}`, { method: "DELETE" }),

  getWorkoutSessions: (params: { from?: string; to?: string; q?: string; page?: number; limit?: number; clientId?: number } = {}) =>
    unwrap<Workout[]>(`/workouts${qs(params)}`),
  getWorkoutSession: (id: number) => unwrap<Workout>(`/workouts/${id}`),
  addWorkoutSession: (payload: {
    date: string;
    durationMinutes: number;
    title?: string;
    notes?: string;
    exercises: { exerciseId: number; sets: number; reps: number; weightKg?: number | null }[];
  }) => unwrap<Workout>("/workouts", { method: "POST", body: jsonBody(payload) }),
  updateWorkoutSession: (
    id: number,
    payload: Partial<{ date: string; durationMinutes: number; title: string; notes: string; exercises: { exerciseId: number; sets: number; reps: number; weightKg?: number | null }[] }>
  ) => unwrap<Workout>(`/workouts/${id}`, { method: "PATCH", body: jsonBody(payload) }),
  deleteWorkoutSession: (id: number) => unwrap<{ id: number }>(`/workouts/${id}`, { method: "DELETE" }),

  getNutritionLogs: (params: { date?: string; from?: string; to?: string; mealType?: string; clientId?: number } = {}) =>
    unwrap<{ logs: NutritionLog[]; totals: NutritionTotals }>(`/nutrition${qs(params)}`),
  addNutritionLog: (payload: { foodId: number; mealType: string; quantityGrams: number; date: string }) =>
    unwrap<NutritionLog>("/nutrition", { method: "POST", body: jsonBody(payload) }),
  updateNutritionLog: (id: number, payload: Partial<{ foodId: number; mealType: string; quantityGrams: number; date: string }>) =>
    unwrap<NutritionLog>(`/nutrition/${id}`, { method: "PATCH", body: jsonBody(payload) }),
  deleteNutritionLog: (id: number) => unwrap<{ id: number }>(`/nutrition/${id}`, { method: "DELETE" }),

  getWellnessLogs: (params: { from?: string; to?: string; clientId?: number } = {}) =>
    unwrap<WellnessLog[]>(`/wellness${qs(params)}`),
  addWellnessLog: (date: string, payload: { sleepHours: number; waterLiters: number; stressLevel: number; mood: string }) =>
    unwrap<WellnessLog>(`/wellness/${date}`, { method: "PUT", body: jsonBody(payload) }),
  deleteWellnessLog: (date: string) => unwrap<{ id: number }>(`/wellness/${date}`, { method: "DELETE" }),

  getGoals: (params: { status?: string; clientId?: number } = {}) => unwrap<Goal[]>(`/goals${qs(params)}`),
  addGoal: (payload: { goalType: string; targetValue: number; currentValue: number; deadline: string }) =>
    unwrap<Goal>("/goals", { method: "POST", body: jsonBody(payload) }),
  updateGoal: (id: number, payload: Partial<{ targetValue: number; currentValue: number; deadline: string; status: string }>) =>
    unwrap<Goal>(`/goals/${id}`, { method: "PATCH", body: jsonBody(payload) }),
  deleteGoal: (id: number) => unwrap<{ id: number }>(`/goals/${id}`, { method: "DELETE" }),

  getTrainers: () => unwrap<TrainerOption[]>("/trainers"),
  getTrainerClients: () => unwrap<ClientRow[]>("/trainer/clients"),
  getTrainerClientOverview: (clientId: number) =>
    unwrap<Record<string, unknown>>(`/trainer/clients/${clientId}/overview`),

  getAdminUsers: (params: { q?: string; role?: string; page?: number; limit?: number } = {}) =>
    unwrap<AdminUser[]>(`/admin/users${qs(params)}`),
  createAdminUser: (payload: { name: string; email: string; password: string; role: Role; activityLevel?: string; fitnessGoal?: string }) =>
    unwrap<AdminUser>("/admin/users", { method: "POST", body: jsonBody(payload) }),
  updateAdminUser: (id: number, payload: Partial<Pick<AdminUser, "name" | "email" | "role" | "isActive">>) =>
    unwrap<AdminUser>(`/admin/users/${id}`, { method: "PATCH", body: jsonBody(payload) }),
  deleteAdminUser: (id: number) => unwrap<{ id: number }>(`/admin/users/${id}`, { method: "DELETE" }),
  getAdminStats: () =>
    unwrap<{
      totalUsers: number;
      activeUsers: number;
      activeTrainers: number;
      totalWorkouts: number;
      activeExercises: number;
      activeFoods: number;
      assignments: number;
    }>("/admin/stats"),

  getTrainerAssignments: () => unwrap<Assignment[]>("/admin/trainer-assignments"),
  addTrainerAssignment: (trainerId: number, clientId: number) =>
    unwrap<{ trainerId: number; clientId: number }>("/admin/trainer-assignments", {
      method: "POST",
      body: jsonBody({ trainerId, clientId })
    }),
  removeTrainerAssignment: (trainerId: number, clientId: number) =>
    unwrap<{ trainerId: number }>(`/admin/trainer-assignments/${trainerId}/${clientId}`, { method: "DELETE" }),

  getReports: (reportKey: string) => unwrap<Record<string, unknown>[]>(`/reports/${reportKey}`),
  getDatabaseSchema: () => unwrap<DatabaseSchema>("/admin/database-schema"),
  getWellnessInsights: () =>
    unwrap<{ status: string; minimumWeeks: number; availableWeeks: number; logDays?: number; message?: string }>(
      "/insights/wellness",
      { method: "POST" }
    )
};
