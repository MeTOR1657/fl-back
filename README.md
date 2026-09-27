# Setup

Install dependencies with `pnpm install`, copy `.env.example` to `.env`, and set
`DATABASE_URL` to the PostgreSQL connection string for the Preflight database.
Set `JWT_SECRET` to a private random value of at least 32 characters. The
database must have the tables defined in `src/db/schema.ts` before starting the
API. Generate and apply schema migrations with `pnpm run db:generate` and
`pnpm run db:migrate` when the schema changes.

To enable Google sign-in, create a Google OAuth 2.0 Web application client and
set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in
`.env`. Register the redirect URI exactly as `http://localhost:3001/auth/google/callback`
for local development (use your deployed HTTPS API URL in production). Start
sign-in by navigating the browser to `GET /auth/google`. On success the API
redirects to the frontend root with `access_token` and `token_type` in the URL
fragment; the frontend should read the fragment, store the token, then clear it
from browser history. Google sign-in creates a reporter account or links an
existing account with the same verified email address.

Run locally with `pnpm run dev`; create a production build with `pnpm run build`
and start it with `pnpm start`. Startup checks the database connection and exits
if PostgreSQL is unavailable. `GET /health` reports backend health.

For Docker, configure `POSTGRES_DB`, `POSTGRES_PORT`, `POSTGRES_APP_USER`, and
`POSTGRES_APP_PASSWORD` in the compose environment. The backend connects to the
`pf-db` service over the `preflight_pf-net` Docker network.
