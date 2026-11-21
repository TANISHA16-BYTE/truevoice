# TrueVoice — Free PostgreSQL deployment

## Architecture
- API: Render Web Service (Free)
- Database: Supabase PostgreSQL (Free)
- Local development and tests: built-in SQLite
- Hosted mode: PostgreSQL is selected automatically when `DATABASE_URL` is present.

## Supabase
1. Open the dedicated TrueVoice Supabase project (do not use the Red Pen project).
2. In SQL Editor, run the complete `src/db/supabase_migration.sql` file. The earlier schema repair script can also be rerun safely if the project was created from an older schema.
3. In Project Settings → Database → Connect, choose the **Session pooler** connection string. Keep it private.

The API runs an idempotent reference-data seed at startup. It inserts missing rows only; it does not overwrite existing library edits. User accounts are created through signup and demo SQLite users are not copied into production.

## Render Web Service
Create a new Web Service connected to `TANISHA16-BYTE/truevoice` and select branch `migration/postgresql-supabase`.

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/api/health`
- Instance: Free

Set these Environment Variables in Render (never commit them to GitHub):

| Key | Value |
|---|---|
| `DATABASE_URL` | Supabase **Session pooler** URI |
| `DATABASE_SSL` | `true` |
| `JWT_SECRET` | A newly generated random secret of at least 32 characters |
| `BASE_URL` | The Render service URL, e.g. `https://your-service.onrender.com` |
| `FRONTEND_URL` | The deployed frontend URL |

Optional: `DB_POOL_MAX=5`.

After deployment, test `/api/health`, then create an account through `POST /api/auth/signup`, log in, and test library/check/draft routes. Render Free services can sleep while idle; the first request after inactivity may take longer.

## Local development
Without `DATABASE_URL`, the app continues to use SQLite and the existing demo seed. Run `npm install`, then `npm start`. Existing API integration tests and benchmark run with `npm test` and `npm run benchmark`.

## Important
The PostgreSQL adapter and seed path are implemented, but a live Supabase connection and Render deployment must still be verified using the project's private connection string and Render environment. Do not treat a green SQLite CI run as proof of a live PostgreSQL deployment.
