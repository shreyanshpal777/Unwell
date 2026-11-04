import bcrypt from "bcrypt";
import pg from "pg";
import "dotenv/config";
import { buildConnectionConfig } from "../config/connection.js";

const { Client } = pg;

const db = new Client(buildConnectionConfig());
await db.connect();

const day = (daysAgo) => {
  const date = new Date(Date.now() - daysAgo * 86400000);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const passwordHash = await bcrypt.hash(process.env.SEED_PASSWORD || "welltrack", 10);

const users = [
  { name: "Avery Morgan", email: "avery@welltrack.dev", role: "admin", activity: null, height: null, weight: null, dob: null, goal: null },
  { name: "Raghav Setia", email: "raghavsetia999@gmail.com", role: "admin", activity: "moderate", height: 180, weight: 63, dob: null, goal: "System administration" },
  { name: "Jordan Lee", email: "jordan@welltrack.dev", role: "trainer", activity: "high", height: 180, weight: 79, dob: "1993-04-02", goal: "Coach my clients" },
  { name: "Maya Chen", email: "maya@welltrack.dev", role: "user", activity: "moderate", height: 168, weight: 67, dob: "2002-06-15", goal: "Build strength" },
  { name: "Nina Patel", email: "nina@welltrack.dev", role: "user", activity: "light", height: 162, weight: 60, dob: "1998-01-24", goal: "General wellness" },
  { name: "Theo Brooks", email: "theo@welltrack.dev", role: "user", activity: "high", height: 175, weight: 72, dob: "1996-09-11", goal: "Improve endurance" },
  { name: "Eli Thompson", email: "eli@welltrack.dev", role: "user", activity: "moderate", height: 183, weight: 88, dob: "1991-12-05", goal: "Weight management" }
];

const exercises = [
  ["Barbell squat", "Lower body", "intermediate", 8.4],
  ["Bench press", "Chest", "intermediate", 6.2],
  ["Deadlift", "Posterior chain", "advanced", 7.5],
  ["Running", "Cardio", "beginner", 9.5],
  ["Plank", "Core", "beginner", 4.0],
  ["Pull-up", "Back", "intermediate", 7.0],
  ["Lunges", "Lower body", "beginner", 6.5],
  ["Cycling", "Cardio", "beginner", 8.0],
  ["Shoulder press", "Shoulders", "intermediate", 5.5],
  ["Burpees", "Full body", "advanced", 10.0],
  ["Mountain climbers", "Core", "beginner", 7.5],
  ["Rowing", "Cardio", "intermediate", 8.5]
];

const foods = [
  ["Greek yogurt", 97, 9, 4, 5],
  ["Chicken breast", 165, 31, 0, 3.6],
  ["Quinoa", 120, 4.4, 21, 1.9],
  ["Salmon", 208, 20, 0, 13],
  ["Almonds", 579, 21, 22, 50],
  ["Brown rice", 112, 2.6, 24, 0.9],
  ["Oatmeal", 68, 2.4, 12, 1.4],
  ["Banana", 89, 1.1, 23, 0.3],
  ["Broccoli", 34, 2.8, 7, 0.4],
  ["Eggs", 143, 12.6, 0.7, 9.5],
  ["Whole wheat bread", 247, 13, 41, 3.4],
  ["Avocado", 160, 2, 9, 15]
];

for (const user of users) {
  await db.query(
    `INSERT INTO users (name, email, password_hash, role, activity_level, height_cm, weight_kg, date_of_birth, fitness_goal)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (email) DO NOTHING`,
    [user.name, user.email, passwordHash, user.role, user.activity, user.height, user.weight, user.dob, user.goal]
  );
}
console.log(`Users: ${(await db.query("SELECT COUNT(*) FROM users")).rows[0].count}`);

for (const [name, group, difficulty, calories] of exercises) {
  await db.query(
    `INSERT INTO exercises (name, muscle_group, difficulty, calories_per_minute)
     VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO NOTHING`,
    [name, group, difficulty, calories]
  );
}
console.log(`Exercises: ${(await db.query("SELECT COUNT(*) FROM exercises")).rows[0].count}`);

for (const [name, calories, protein, carbs, fat] of foods) {
  await db.query(
    `INSERT INTO food_items (name, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO NOTHING`,
    [name, calories, protein, carbs, fat]
  );
}
console.log(`Food items: ${(await db.query("SELECT COUNT(*) FROM food_items")).rows[0].count}`);

const idOf = async (table, column, value) => {
  const { rows } = await db.query(`SELECT id FROM ${table} WHERE ${column} = $1`, [value]);
  if (!rows[0]) throw new Error(`Missing ${table} row: ${value}`);
  return rows[0].id;
};

const userIds = {};
for (const user of users) userIds[user.email] = await idOf("users", "email", user.email);
const exerciseIds = {};
for (const [name] of exercises) exerciseIds[name] = await idOf("exercises", "name", name);
const foodIds = {};
for (const [name] of foods) foodIds[name] = await idOf("food_items", "name", name);

if (Number((await db.query("SELECT COUNT(*) FROM workout_sessions")).rows[0].count) === 0) {
  const sessions = [
    { email: "maya@welltrack.dev", daysAgo: 1, title: "Full Body Strength", duration: 60, notes: "Felt strong through the last set", items: [["Barbell squat", 4, 8, 60], ["Bench press", 4, 10, 40], ["Plank", 3, 60, null]] },
    { email: "maya@welltrack.dev", daysAgo: 2, title: "Evening Run", duration: 30, notes: null, items: [["Running", 1, 1, null]] },
    { email: "maya@welltrack.dev", daysAgo: 4, title: "Upper Body", duration: 45, notes: "Good pump", items: [["Bench press", 4, 8, 42.5], ["Pull-up", 4, 8, null], ["Shoulder press", 3, 12, 20]] },
    { email: "maya@welltrack.dev", daysAgo: 6, title: "Mobility & Core", duration: 35, notes: null, items: [["Plank", 3, 60, null], ["Mountain climbers", 3, 20, null]] },
    { email: "maya@welltrack.dev", daysAgo: 9, title: "Leg Day", duration: 55, notes: "Add weight next week", items: [["Barbell squat", 5, 5, 65], ["Lunges", 3, 12, 20]] },
    { email: "maya@welltrack.dev", daysAgo: 12, title: "Full Body Strength", duration: 50, notes: null, items: [["Deadlift", 4, 6, 80], ["Pull-up", 3, 8, null]] },
    { email: "maya@welltrack.dev", daysAgo: 16, title: "Cardio Mix", duration: 40, notes: null, items: [["Cycling", 1, 1, null], ["Rowing", 1, 1, null]] },
    { email: "nina@welltrack.dev", daysAgo: 3, title: "Light Full Body", duration: 35, notes: null, items: [["Lunges", 3, 10, 10], ["Plank", 3, 45, null]] },
    { email: "nina@welltrack.dev", daysAgo: 7, title: "Morning Walkout", duration: 40, notes: null, items: [["Running", 1, 1, null]] },
    { email: "nina@welltrack.dev", daysAgo: 13, title: "Core Focus", duration: 25, notes: null, items: [["Plank", 4, 45, null], ["Mountain climbers", 3, 15, null]] },
    { email: "theo@welltrack.dev", daysAgo: 1, title: "Intervals", duration: 45, notes: "Negative splits", items: [["Running", 1, 1, null]] },
    { email: "theo@welltrack.dev", daysAgo: 3, title: "Row & Core", duration: 50, notes: null, items: [["Rowing", 1, 1, null], ["Plank", 3, 60, null]] },
    { email: "theo@welltrack.dev", daysAgo: 5, title: "Tempo Ride", duration: 60, notes: null, items: [["Cycling", 1, 1, null]] },
    { email: "theo@welltrack.dev", daysAgo: 8, title: "Strength Endurance", duration: 45, notes: null, items: [["Burpees", 4, 15, null], ["Pull-up", 4, 10, null]] },
    { email: "theo@welltrack.dev", daysAgo: 11, title: "Long Run", duration: 70, notes: null, items: [["Running", 1, 1, null]] },
    { email: "theo@welltrack.dev", daysAgo: 15, title: "Full Body", duration: 50, notes: null, items: [["Deadlift", 4, 6, 90], ["Bench press", 4, 8, 60]] },
    { email: "eli@welltrack.dev", daysAgo: 4, title: "Strength Base", duration: 45, notes: null, items: [["Barbell squat", 3, 10, 50], ["Bench press", 3, 10, 40]] },
    { email: "eli@welltrack.dev", daysAgo: 10, title: "Cardio Starter", duration: 30, notes: null, items: [["Cycling", 1, 1, null]] },
    { email: "eli@welltrack.dev", daysAgo: 14, title: "Full Body", duration: 40, notes: null, items: [["Lunges", 3, 12, 15], ["Plank", 3, 45, null]] }
  ];

  for (const session of sessions) {
    const { rows } = await db.query(
      `INSERT INTO workout_sessions (user_id, title, session_date, duration_minutes, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userIds[session.email], session.title, day(session.daysAgo), session.duration, session.notes]
    );
    for (const [name, sets, reps, weight] of session.items) {
      await db.query(
        "INSERT INTO session_exercises (session_id, exercise_id, sets, reps, weight_kg) VALUES ($1, $2, $3, $4, $5)",
        [rows[0].id, exerciseIds[name], sets, reps, weight]
      );
    }
  }
  console.log(`Workout sessions: ${sessions.length}`);
} else {
  console.log("Workout sessions already present, skipping");
}

if (Number((await db.query("SELECT COUNT(*) FROM nutrition_logs")).rows[0].count) === 0) {
  const logs = [
    { email: "maya@welltrack.dev", daysAgo: 0, food: "Greek yogurt", meal: "breakfast", grams: 250 },
    { email: "maya@welltrack.dev", daysAgo: 0, food: "Oatmeal", meal: "breakfast", grams: 80 },
    { email: "maya@welltrack.dev", daysAgo: 0, food: "Chicken breast", meal: "lunch", grams: 200 },
    { email: "maya@welltrack.dev", daysAgo: 0, food: "Quinoa", meal: "lunch", grams: 150 },
    { email: "maya@welltrack.dev", daysAgo: 0, food: "Almonds", meal: "snack", grams: 30 },
    { email: "maya@welltrack.dev", daysAgo: 0, food: "Salmon", meal: "dinner", grams: 180 },
    { email: "maya@welltrack.dev", daysAgo: 1, food: "Eggs", meal: "breakfast", grams: 100 },
    { email: "maya@welltrack.dev", daysAgo: 1, food: "Brown rice", meal: "dinner", grams: 200 },
    { email: "maya@welltrack.dev", daysAgo: 2, food: "Banana", meal: "snack", grams: 120 },
    { email: "maya@welltrack.dev", daysAgo: 2, food: "Chicken breast", meal: "dinner", grams: 180 },
    { email: "nina@welltrack.dev", daysAgo: 0, food: "Greek yogurt", meal: "breakfast", grams: 200 },
    { email: "nina@welltrack.dev", daysAgo: 1, food: "Broccoli", meal: "dinner", grams: 150 },
    { email: "theo@welltrack.dev", daysAgo: 0, food: "Whole wheat bread", meal: "breakfast", grams: 80 },
    { email: "theo@welltrack.dev", daysAgo: 0, food: "Salmon", meal: "dinner", grams: 200 },
    { email: "eli@welltrack.dev", daysAgo: 1, food: "Avocado", meal: "lunch", grams: 100 }
  ];
  for (const log of logs) {
    await db.query(
      `INSERT INTO nutrition_logs (user_id, food_id, meal_type, quantity_grams, consumed_date)
       VALUES ($1, $2, $3, $4, $5)`,
      [userIds[log.email], foodIds[log.food], log.meal, log.grams, day(log.daysAgo)]
    );
  }
  console.log(`Nutrition logs: ${logs.length}`);
} else {
  console.log("Nutrition logs already present, skipping");
}

if (Number((await db.query("SELECT COUNT(*) FROM wellness_logs")).rows[0].count) === 0) {
  const moodCycle = ["good", "excellent", "neutral", "good", "low", "good", "excellent", "neutral", "good", "neutral"];
  const entries = [
    { email: "maya@welltrack.dev", sleep: [7.5, 7.8, 6.9, 7.4, 6.5, 8.0, 7.6, 7.2, 7.9, 7.1], water: [2.4, 2.6, 2.0, 2.5, 1.8, 2.8, 2.4, 2.2, 2.7, 2.3] },
    { email: "nina@welltrack.dev", sleep: [7.0, 7.2, 6.8, 7.5, 7.3], water: [2.0, 2.2, 1.9, 2.4, 2.1] },
    { email: "theo@welltrack.dev", sleep: [6.8, 7.4, 7.0, 7.6, 6.9, 7.8, 7.2], water: [2.8, 3.0, 2.5, 3.2, 2.9, 3.1, 2.7] },
    { email: "eli@welltrack.dev", sleep: [6.5, 7.0, 6.9], water: [1.8, 2.0, 2.1] }
  ];
  let moodIndex = 0;
  for (const entry of entries) {
    for (let i = 0; i < entry.sleep.length; i += 1) {
      await db.query(
        `INSERT INTO wellness_logs (user_id, log_date, sleep_hours, water_liters, stress_level, mood)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userIds[entry.email], day(i), entry.sleep[i], entry.water[i], (i % 5) + 1, moodCycle[moodIndex++ % moodCycle.length]]
      );
    }
  }
  console.log("Wellness logs seeded");
} else {
  console.log("Wellness logs already present, skipping");
}

if (Number((await db.query("SELECT COUNT(*) FROM goals")).rows[0].count) === 0) {
  const goals = [
    { email: "maya@welltrack.dev", type: "weekly_workout_minutes", target: 240, current: 210, deadline: day(-6) },
    { email: "maya@welltrack.dev", type: "daily_water_intake", target: 3, current: 2.4, deadline: day(-13) },
    { email: "maya@welltrack.dev", type: "target_body_weight", target: 64, current: 67, deadline: day(-72) },
    { email: "nina@welltrack.dev", type: "daily_water_intake", target: 2.5, current: 2.1, deadline: day(-10) },
    { email: "theo@welltrack.dev", type: "weekly_workout_minutes", target: 300, current: 270, deadline: day(-6) },
    { email: "eli@welltrack.dev", type: "target_body_weight", target: 82, current: 88, deadline: day(-90) }
  ];
  const units = { weekly_workout_minutes: "minutes", daily_water_intake: "liters", target_body_weight: "kg" };
  for (const goal of goals) {
    await db.query(
      `INSERT INTO goals (user_id, goal_type, target_value, current_value, unit, deadline)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userIds[goal.email], goal.type, goal.target, goal.current, units[goal.type], goal.deadline]
    );
  }
  console.log(`Goals: ${goals.length}`);
} else {
  console.log("Goals already present, skipping");
}

if (Number((await db.query("SELECT COUNT(*) FROM trainer_clients")).rows[0].count) === 0) {
  const trainerId = userIds["jordan@welltrack.dev"];
  for (const email of ["maya@welltrack.dev", "nina@welltrack.dev", "theo@welltrack.dev", "eli@welltrack.dev"]) {
    await db.query("INSERT INTO trainer_clients (trainer_id, client_id) VALUES ($1, $2)", [trainerId, userIds[email]]);
  }
  console.log("Trainer assignments: 4");
} else {
  console.log("Trainer assignments already present, skipping");
}

await db.end();
console.log("Seed complete");
