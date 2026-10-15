# Backend setup

Express/TypeScript API for CampusFix. PostgreSQL access, JWT authentication, Google OAuth and CMU OAuth are handled here. Keep OAuth secrets in this service's `.env`; never put them in the frontend.

## Local development (PowerShell)

Keep `fl-front`, `pf-backend`, `pf-db`, and `pf-deploy` as sibling folders. Configure `.env` from `.env.example`; use the same `POSTGRES_APP_USER`, `POSTGRES_APP_PASSWORD`, and `POSTGRES_DB` as `pf-db/.env`. The local `DATABASE_URL` uses `localhost:5432`; `PORT=3001`; frontend origin is `http://localhost:5173`.

Start the database first from `pf-db` with `docker compose up -d`. Then run:

```powershell
pnpm install
pnpm run db:migrate
pnpm run dev
```

The API is available at `http://localhost:3001`; `GET /health` checks the database.

## OAuth callback URLs

Register the exact Google Web OAuth redirect `http://localhost:3001/auth/google/callback` in Google Cloud Console. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in `.env`. For CMU OAuth, configure `CMU_OAUTH_CLIENT_ID`, `CMU_OAUTH_CLIENT_SECRET`, and the exact frontend callback `http://localhost:5173/api/auth/callback`. `FRONTEND_URL` must be `http://localhost:5173` for local development.

## Docker

For the complete stack, use the single Compose project in `pf-deploy` (recommended). To run this API container beside a separately started `pf-db`, use this repository's Compose file; it joins `preflight_pf-net`, connects to the `pf-db` container, and maps host port 3001. Set all OAuth and JWT values in this `.env` first:

```powershell
docker compose up -d --build
docker compose logs -f backend
```

For schema changes, generate and apply migrations with `pnpm run db:generate` and `pnpm run db:migrate`.
