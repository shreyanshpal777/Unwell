BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(320) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    height_cm NUMERIC(5,2),
    weight_kg NUMERIC(5,2),
    date_of_birth DATE,
    fitness_goal VARCHAR(160),
    activity_level VARCHAR(20),
    role VARCHAR(10) NOT NULL DEFAULT 'user',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT users_email_lowercase_chk
        CHECK (email = LOWER(email)),

    CONSTRAINT users_role_chk
        CHECK (role IN ('user', 'trainer', 'admin')),

    CONSTRAINT users_activity_level_chk
        CHECK (
            activity_level IS NULL OR
            activity_level IN ('sedentary', 'light', 'moderate', 'high', 'very_high')
        ),

    CONSTRAINT users_height_chk
        CHECK (height_cm IS NULL OR height_cm BETWEEN 50 AND 300),

    CONSTRAINT users_weight_chk
        CHECK (weight_kg IS NULL OR weight_kg BETWEEN 20 AND 500),

    CONSTRAINT users_dob_chk
        CHECK (date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE)
);

CREATE TABLE IF NOT EXISTS exercises (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    muscle_group VARCHAR(80) NOT NULL,
    difficulty VARCHAR(20) NOT NULL,
    calories_per_minute NUMERIC(6,2) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT exercises_difficulty_chk
        CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),

    CONSTRAINT exercises_calories_chk
        CHECK (calories_per_minute >= 0)
);

CREATE TABLE IF NOT EXISTS food_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(160) NOT NULL UNIQUE,
    calories_per_100g NUMERIC(8,2) NOT NULL,
    protein_per_100g NUMERIC(8,2) NOT NULL,
    carbs_per_100g NUMERIC(8,2) NOT NULL,
    fat_per_100g NUMERIC(8,2) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT food_calories_chk
        CHECK (calories_per_100g >= 0),

    CONSTRAINT food_protein_chk
        CHECK (protein_per_100g >= 0),

    CONSTRAINT food_carbs_chk
        CHECK (carbs_per_100g >= 0),

    CONSTRAINT food_fat_chk
        CHECK (fat_per_100g >= 0)
);

CREATE TABLE IF NOT EXISTS workout_sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL,
    title VARCHAR(120),
    session_date DATE NOT NULL,
    duration_minutes INTEGER NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT workout_sessions_user_fk
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT workout_duration_chk
        CHECK (duration_minutes BETWEEN 1 AND 1440)
);

CREATE TABLE IF NOT EXISTS session_exercises (
    session_id BIGINT NOT NULL,
    exercise_id BIGINT NOT NULL,
    sets INTEGER NOT NULL,
    reps INTEGER NOT NULL,
    weight_kg NUMERIC(7,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (session_id, exercise_id),

    CONSTRAINT session_exercises_session_fk
        FOREIGN KEY (session_id)
        REFERENCES workout_sessions(id)
        ON DELETE CASCADE,

    CONSTRAINT session_exercises_exercise_fk
        FOREIGN KEY (exercise_id)
        REFERENCES exercises(id)
        ON DELETE RESTRICT,

    CONSTRAINT session_exercises_sets_chk
        CHECK (sets BETWEEN 1 AND 100),

    CONSTRAINT session_exercises_reps_chk
        CHECK (reps BETWEEN 1 AND 10000),

    CONSTRAINT session_exercises_weight_chk
        CHECK (weight_kg IS NULL OR weight_kg >= 0)
);

CREATE TABLE IF NOT EXISTS nutrition_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL,
    food_id BIGINT NOT NULL,
    meal_type VARCHAR(12) NOT NULL,
    quantity_grams NUMERIC(8,2) NOT NULL,
    consumed_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT nutrition_logs_user_fk
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT nutrition_logs_food_fk
        FOREIGN KEY (food_id)
        REFERENCES food_items(id)
        ON DELETE RESTRICT,

    CONSTRAINT nutrition_meal_type_chk
        CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),

    CONSTRAINT nutrition_quantity_chk
        CHECK (quantity_grams > 0 AND quantity_grams <= 10000)
);

CREATE TABLE IF NOT EXISTS wellness_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL,
    log_date DATE NOT NULL,
    sleep_hours NUMERIC(4,2) NOT NULL,
    water_liters NUMERIC(5,2) NOT NULL,
    stress_level SMALLINT NOT NULL,
    mood VARCHAR(12) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT wellness_logs_user_fk
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT wellness_user_date_uk
        UNIQUE (user_id, log_date),

    CONSTRAINT wellness_sleep_chk
        CHECK (sleep_hours BETWEEN 0 AND 24),

    CONSTRAINT wellness_water_chk
        CHECK (water_liters BETWEEN 0 AND 20),

    CONSTRAINT wellness_stress_chk
        CHECK (stress_level BETWEEN 1 AND 5),

    CONSTRAINT wellness_mood_chk
        CHECK (mood IN ('very_low', 'low', 'neutral', 'good', 'excellent'))
);

CREATE TABLE IF NOT EXISTS goals (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL,
    goal_type VARCHAR(40) NOT NULL,
    target_value NUMERIC(10,2) NOT NULL,
    current_value NUMERIC(10,2) NOT NULL DEFAULT 0,
    unit VARCHAR(12) NOT NULL,
    deadline DATE NOT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT goals_user_fk
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT goals_type_unit_chk
        CHECK (
            (goal_type = 'weekly_workout_minutes' AND unit = 'minutes') OR
            (goal_type = 'daily_water_intake' AND unit = 'liters') OR
            (goal_type = 'target_body_weight' AND unit = 'kg')
        ),

    CONSTRAINT goals_values_chk
        CHECK (target_value > 0 AND current_value >= 0),

    CONSTRAINT goals_status_chk
        CHECK (status IN ('active', 'completed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS trainer_clients (
    trainer_id BIGINT NOT NULL,
    client_id BIGINT NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (trainer_id, client_id),

    CONSTRAINT trainer_clients_trainer_fk
        FOREIGN KEY (trainer_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT trainer_clients_client_fk
        FOREIGN KEY (client_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT trainer_not_client_chk
        CHECK (trainer_id <> client_id)
);

CREATE INDEX IF NOT EXISTS users_role_idx
    ON users(role)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS users_name_search_idx
    ON users(LOWER(name));

CREATE INDEX IF NOT EXISTS exercises_name_search_idx
    ON exercises(LOWER(name))
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS exercises_muscle_group_idx
    ON exercises(muscle_group)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS food_items_name_search_idx
    ON food_items(LOWER(name))
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS workout_sessions_user_date_idx
    ON workout_sessions(user_id, session_date DESC);

CREATE INDEX IF NOT EXISTS session_exercises_exercise_idx
    ON session_exercises(exercise_id);

CREATE INDEX IF NOT EXISTS nutrition_logs_user_date_idx
    ON nutrition_logs(user_id, consumed_date DESC);

CREATE INDEX IF NOT EXISTS nutrition_logs_food_idx
    ON nutrition_logs(food_id);

CREATE INDEX IF NOT EXISTS wellness_logs_user_date_idx
    ON wellness_logs(user_id, log_date DESC);

CREATE INDEX IF NOT EXISTS goals_user_status_deadline_idx
    ON goals(user_id, status, deadline);

CREATE INDEX IF NOT EXISTS trainer_clients_client_idx
    ON trainer_clients(client_id);

COMMIT;
