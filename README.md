# BrandGuard AI

BrandGuard AI is a React/Vite frontend with a Spring Boot API and MySQL database. The current content checker uses the active brand rules; it does not call an external AI provider.

## Run locally

Requirements: Node.js, Java 21 or newer, Maven, and Docker Compose.

1. Start MySQL:

   ```sh
   docker compose up -d mysql
   ```

2. Set a private JWT signing secret and start the API from the project root:

   ```sh
   export DATABASE_URL='jdbc:mysql://localhost:3306/brandguard?serverTimezone=UTC'
   export DATABASE_USERNAME='brandguard'
   export DATABASE_PASSWORD='brandguard'
   export FRONTEND_ORIGIN='http://localhost:5173'
   export JWT_SECRET="$(openssl rand -base64 32)"
   export SEED_USERS=true
   export ADMIN_PASSWORD='AdminPass123!'
   export REVIEWER_PASSWORD='ReviewPass123!'
   export CREATOR_PASSWORD='CreatorPass123!'
   mvn -f backend/pom.xml spring-boot:run
   ```

   `JWT_SECRET` is required; the application has no built-in signing secret. Flyway applies the database migrations at startup. The API listens on port `8080`; MySQL listens on port `3306`.

3. In another terminal, install frontend dependencies and start Vite:

   ```sh
   npm install
   npm run dev
   ```

4. Open [http://localhost:5173](http://localhost:5173). Vite proxies `/api` requests to `http://localhost:8080` by default. To use a different API address, set `VITE_API_PROXY_TARGET`.

## Local demo accounts

Demo-user seeding is disabled by default. The optional local demo accounts are enabled in the setup command above; use unique passwords for local testing:

```sh
export SEED_USERS=true
export ADMIN_PASSWORD='AdminPass123!'
export REVIEWER_PASSWORD='ReviewPass123!'
export CREATOR_PASSWORD='CreatorPass123!'
```

These local accounts are then seeded:

| Role | Email | Password |
|---|---|---|
| Creator | `creator@brandguard.local` | `CreatorPass123!` |
| Reviewer | `reviewer@brandguard.local` | `ReviewPass123!` |
| Brand admin | `admin@brandguard.local` | `AdminPass123!` |

These are development credentials only. Set unique credentials for local testing, and leave demo seeding disabled outside development.

## Main workflow

Sign in as a creator to submit and analyze content. The active approved rules generate evidence-linked findings. A reviewer can request changes or approve a submission; a creator can then revise and re-analyze it. Brand admins can add, edit, and archive approved sources from the Brand library; each published change advances the guideline version.

Use the sun/moon control in the workspace or sign-in screen to switch between light and dark themes. Your theme preference is saved in this browser.

## Content analysis

Rule-based analysis is the default and does not send draft text to an external provider. To opt in to OpenAI analysis, configure `ANALYSIS_PROVIDER=openai` and `OPENAI_API_KEY` in the backend environment. `OPENAI_MODEL` defaults to `gpt-4.1-mini`. Draft text is sent to OpenAI for review against the active brand sources; returned findings are checked against those sources and the original draft before being saved. If the provider is unavailable or returns invalid data, analysis fails visibly instead of silently falling back. Keep the API key private and do not commit it to source control.

Frontend production build:

```sh
npm run build
```

Backend compile and test command:

```sh
mvn -f backend/pom.xml test
```

Backend unit tests run with `mvn -f backend/pom.xml test`. The creator/reviewer API workflow and MySQL migrations have also been smoke-tested locally.

The development database has changed from PostgreSQL to MySQL. The existing PostgreSQL Docker volume is not deleted or migrated; its data remains untouched. The MySQL database starts with the built-in BrightPath brand rules and seeded demo accounts.

## Deploy to Render

The Render Blueprint builds the React frontend and Spring Boot API into one web service. Create a managed MySQL 8 database with a MySQL provider; Render does not provide MySQL. In the Render dashboard, create a Blueprint instance from this repository and provide the database JDBC URL, username, and password when prompted. Use the provider's SSL connection parameters when required. Render generates `JWT_SECRET` automatically, applies the schema migrations at startup, and uses the service's public URL for same-origin frontend requests.

Demo-user seeding is disabled by default. To provision local-style roles for an initial demo deployment, set `SEED_USERS=true` and set unique, strong passwords for all three accounts in the Render environment settings. After the first successful startup, set `SEED_USERS=false` and redeploy. Never use the example passwords from this README on a public service. Registration otherwise creates creator accounts only.

The service health check is `/api/health`. Keep database credentials and any OpenAI API key in the hosting provider's secret environment settings, not in GitHub or committed files.
