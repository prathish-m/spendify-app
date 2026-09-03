# Spendify · Minimal Expense Tracker

A modern, minimalist **expense tracking and bill splitting** app.

## Tech stack

- **Vite + React + TypeScript**, **Tailwind CSS v4**, **Zustand**, **lucide-react**
- **Node.js + Express + SQLite** backend with **JWT auth**

## Features

- **Accounts** — register / login; each user has their own ledger.
- **Dashboard** — Personal Balance + Net Position, plus a **Settlements**
  section ("Who owes you" / "Who you owe"), all editable.
- **People management** — add friends, and **link a friend to a real account**
  by email for **Splitwise-style two-sided sharing** (a split expense appears in
  both accounts and affects each side's balance).
- **Transactions** — expense/income, equal or custom splits, multi-delete.
- **Persistence** — all data stored in PostgreSQL, scoped per user.

## Architecture

- **Frontend** (this folder): React + Vite UI. A Zustand store handles auth
  (JWT in `localStorage`) and talks to the backend over REST (`src/lib/api.ts`).
  Settlement figures are derived on the client for display.
- **Backend** (`server/`): Node.js + Express + SQLite (built-in `node:sqlite`,
  no external DB). Multi-user, with a two-sided sharing model. See
  `server/README.md`.

## Getting started

Requires **Node.js v22.5+** (for the built-in SQLite). No database to install.

```bash
# 1) Backend  (http://localhost:4000)
cd server
npm install
cp .env.example .env      # then set JWT_SECRET
npm run migrate           # create tables in data.sqlite
npm start

# 2) Frontend (http://localhost:5173)
npm install
npm run dev
```

The Vite dev server proxies `/api` → `http://localhost:4000`, so the frontend
calls same-origin `/api/...` paths. To point at a different backend URL, set
`VITE_API_URL` (e.g. `VITE_API_URL=http://host:4000 npm run dev`).

```bash
npm run build    # typecheck + production build (frontend)
npm run preview  # preview the production build
```

## How settlements work

Each split transaction credits the payer with the full amount and debits every
participant their share. A person's **net balance** is `paid − consumed`. The
engine (`src/lib/settlements.ts`) greedily matches the largest creditor with
the largest debtor to produce the minimal set of transfers.
