# Unwell Frontend

Frontend application for the **Unwell** fitness and wellness management system. Track workouts, nutrition, wellness, and goals, with role-specific experiences for users, trainers, and administrators.

This repository contains the frontend only. It expects the API server to be available at `/api` during development.

## Tech Stack

- React 19
- React Router 7
- Vite 8
- TypeScript 5.7
- Tailwind CSS v4
- Recharts
- Lucide

## Prerequisites

- Node.js 22 or newer
- npm 10 or newer
- The backend API running locally (default: `http://localhost:5001`)

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:8443`.

Vite proxies `/api` requests to `http://localhost:5001`. Override the target when the API runs elsewhere:

```powershell
# PowerShell
$env:API_PROXY_TARGET = "http://localhost:5002"
npm run dev
```

```bash
# macOS / Linux
API_PROXY_TARGET=http://localhost:5002 npm run dev
```

No frontend environment file is required by default.

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server on port `8443` |
| `npm run build` | Build the production bundle into `dist/` |
| `npm run preview` | Preview the production build |
| `npm run format` | Format source files with oxfmt |

## Project Structure

```text
.
├── public/
│   └── favicon.svg
├── src/
│   ├── components/       # Layout, tables, query panel, UI primitives
│   ├── context/          # Authentication context
│   ├── pages/            # Dashboard, trackers, admin, reports, profile
│   ├── services/         # API client
│   ├── App.tsx
│   ├── routes.tsx
│   ├── main.tsx
│   └── index.css
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Authentication and Roles

- Authentication uses an `httpOnly` cookie set by the API.
- Roles are `user`, `trainer`, and `admin`.
- Routes are role-guarded; unauthorized navigation redirects to the appropriate role home.
- Any `401` response clears the session and redirects to the login page.

## Styling

Tailwind CSS v4 is enabled through the `@tailwindcss/vite` plugin. `src/index.css` imports Tailwind with `@import 'tailwindcss';`. Use utility classes directly in JSX and keep global styles, theme customization, and font wiring in `src/index.css`.

## API Expectations

The frontend expects the backend to expose routes under `/api`, including:

- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/me`
- `GET /dashboard`
- Workout, nutrition, wellness, goal, exercise, and food endpoints
- Trainer and administrator endpoints
- Report and wellness insight endpoints

See the backend API documentation for request and response details.
