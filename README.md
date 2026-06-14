# Secure Parent WhatsApp Chatbot

This project implements an authenticated WhatsApp chatbot for educational institutions so parents can securely access their own child's academic details.

Parent usage has two channels:

- Parent website portal: login with child registration number and OTP sent to the registered parent phone number.
- WhatsApp chatbot: authenticated conversation with interactive WhatsApp menus.

## Key Security Design (Best Authentication for WhatsApp Context)

Authentication uses a strict 5-step flow:

1. Parent sends `HI` on WhatsApp.
2. Parent enters the child roll number.
3. Parent enters student registration number.
4. Parent enters student DOB (`YYYY-MM-DD`).
5. Parent enters institution-issued Parent Security PIN.

Access is allowed only when all checks pass:

- WhatsApp number is registered to a parent account.
- Parent is mapped to the specific student in `parent_student_map`.
- Student registration number matches.
- Student DOB matches.
- Parent PIN matches.
- Session JWT is valid and not expired.

If any check fails, the bot blocks data and returns a security warning.

## Requested Options Implemented

After authentication, parent can tap WhatsApp menu options for:

1. Attendance
2. Internal Marks
3. CGPA (Current + Previous)
4. Backlogs Info
5. Counselor Contact Details
6. Fee Payment Status
7. Credit Details
8. Academic Calendar
9. Exam Schedule
10. Suspension Status
11. Semester Faculty Members
12. Logout

## Real-Time Data Updates

The bot reads data from PostgreSQL on every request. Any admin update is visible immediately on the next parent query.

## Tech Stack

- Frontend: HTML, CSS, Vanilla JavaScript parent portal
- Backend: Node.js + Express webhook/API server
- Database: PostgreSQL SQL database with connection pooling via `pg`
- Security: JWT session tokens + bcrypt PIN hashing + rate limiting + helmet
- Integration: WhatsApp Cloud API webhook

## Technology Choice Explanation

- Frontend: the current admin dashboard uses plain HTML/CSS/JavaScript so it is easy to run locally without extra build steps.
- Backend: Express is used because webhook handling and admin APIs are straightforward, fast to build, and easy to maintain.
- Database: PostgreSQL is used instead of SQLite because your project targets large data volume, multi-user access, better concurrency, stronger indexing, and production-grade reliability.

## Production-Grade Stack Recommendation

- Frontend: Next.js (TypeScript) + Tailwind CSS + shadcn/ui
- Backend: NestJS (TypeScript) with REST + webhook workers
- Database: PostgreSQL (with Prisma ORM)
- Caching and session hardening: Redis
- Queue: BullMQ (for async WhatsApp retries)
- Auth hardening: WhatsApp number binding + registration number + DOB + parent PIN + optional OTP

## Seeded Demo Data

- Parent WhatsApp number: `919999111222`
- Parent PIN: `4455`
- Student roll number: `22CSE1001`
- Student registration number: `REG22CSE1001`
- Student DOB: `2004-10-15`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Install frontend dependencies:

```bash
cd frontend
npm install
cd ..
```

3. Start PostgreSQL SQL database:

```bash
docker compose up -d
```

Or use the shortcut:

```bash
npm run db:up
```

4. Configure environment in `.env`:

- `JWT_SECRET`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `DATABASE_URL` (or `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD`, `PG_DATABASE`)

5. Run backend only:

```bash
npm run start:backend
```

6. Run frontend only (in another terminal):

```bash
cd frontend
npm run start
```

Now use:

- Frontend URL: `http://localhost:5173`
- Backend URL: `http://localhost:4000`

Optional shortcut to start DB + backend:

```bash
npm run start:all
```

7. Verify health endpoint:

```bash
GET http://localhost:4000/health
```

## Webhook Endpoints

- `GET /webhook` for WhatsApp webhook verification
- `POST /webhook` for inbound messages

Use `APP_BASE_URL/webhook` in WhatsApp Cloud API configuration.

## Parent Portal

Open:

- `http://localhost:5173`

Parent login flow:

- Enter child registration number
- Receive OTP on the already registered parent phone number
- Enter OTP on the website
- View only that child's academic data

## Authentication Explanation

This app uses relationship-based authentication, not a normal password login.

Website parent portal authentication:

1. Parent enters child registration number.
2. Backend finds the mapped parent phone number already stored in the `parents` table.
3. Backend generates a one-time OTP.
4. OTP is sent to the registered parent phone number.
5. Parent enters OTP on the website.
6. Backend verifies OTP and creates a parent JWT session.

WhatsApp chatbot authentication:

1. WhatsApp number check.
2. Parent-student relationship check.
3. Student registration number check.
4. Student DOB check.
5. Parent security PIN check.

After all checks pass, the server issues a JWT-based session token with expiry. Every request is filtered by `parentId` and `studentId`, so one parent cannot read another student's data.

If any step fails, access is blocked and the bot does not reveal student information.

## Sample End-to-End Test Data

Seeded sample data created automatically on first startup:

- Parent WhatsApp number: `919999111222`
- Parent name: `Meera Rao`
- Student name: `Arjun Rao`
- Roll number: `22CSE1001`
- Registration number: `REG22CSE1001`
- DOB: `2004-10-15`
- PIN: `4455`

Sample website authentication flow:

1. Open `http://localhost:5173`
2. Enter `REG22CSE1001`
3. Click `Send OTP`
4. OTP is sent to registered parent phone `919999111222`
5. Enter the OTP on the website
6. Student dashboard opens for only that student

Sample authentication flow on WhatsApp:

1. Send `HI`
2. Send `22CSE1001`
3. Send `REG22CSE1001`
4. Send `2004-10-15`
5. Send `4455`
6. Send `1` for Attendance

Expected result:

- Authentication succeeds
- Interactive WhatsApp menus are shown
- Attendance for only that seeded student is returned

## How To Create And Run From Scratch

1. Install Node.js and Docker Desktop.
2. Clone or open the project folder.
3. Run `npm install`.
4. Start Docker Desktop.
5. Run `npm run db:up`.
6. Confirm database container is running with `docker compose ps`.
7. Run `npm run start:all` or `npm run dev:all`.
8. Open `http://localhost:4000`.
9. Open `http://localhost:4000/health` to confirm backend status.

## How To Access The Database

To open PostgreSQL shell inside the running container:

```bash
npm run db:psql
```

Or directly:

```bash
docker exec -it parent-chatbot-postgres psql -U postgres -d parent_chatbot
```

## How To View Stored Database Data

Inside `psql`, use these commands:

List all tables:

```sql
\dt
```

View all parents:

```sql
SELECT * FROM parents;
```

View all students:

```sql
SELECT * FROM students;
```

View parent-student mapping:

```sql
SELECT * FROM parent_student_map;
```

View all marks:

```sql
SELECT * FROM marks_internal;
```

View all CGPA rows:

```sql
SELECT * FROM cgpa_history;
```

View all faculty assignments:

```sql
SELECT * FROM faculty_assignments;
```

View all exam schedules:

```sql
SELECT * FROM exams;
```

View all academic events:

```sql
SELECT * FROM academic_events;
```

View active chatbot sessions:

```sql
SELECT * FROM chat_sessions;
```

## Backend And Database Coverage

- Backend routes handle WhatsApp webhook verification, incoming messages, session management, and admin APIs.
- Database schema covers parent records, student records, secure mapping, marks, CGPA, faculty, events, exams, and chat sessions.
- The backend queries PostgreSQL on every request so updates in the database are reflected immediately in WhatsApp responses.

## API Summary

Parent portal:

- `POST /api/parent/request-otp`
- `POST /api/parent/verify-otp`
- `GET /api/parent/dashboard`

Admin:

- `POST /api/admin/login`
- `GET /api/admin/student/:roll/all`
- `PUT /api/admin/student/:roll/basic`
- `POST /api/admin/student/:roll/marks`
- `POST /api/admin/student/:roll/cgpa`
- `POST /api/admin/student/:roll/faculty`
- `POST /api/admin/student/:roll/exam`
- `POST /api/admin/events`

## Notes

- If WhatsApp credentials are missing, outbound WhatsApp messages are logged to console in mock mode.
- For production, use HTTPS, rotate secrets, and store admin password as bcrypt hash.
