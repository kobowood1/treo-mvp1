# Treo — AI Algebra Coach

An AI-powered web platform connecting students, teachers, and parents around algebra learning. Students upload photos of their handwritten work, Treo finds where their reasoning broke down, and coaches them Socratically without giving away the answer.

---

## Quick Start

```bash
# 1. Clone and install
git clone <repo>
cd treo
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local — see Environment Variables below

# 3. Start infrastructure
docker compose up -d

# 4. Run database migration
npm run db:migrate

# 5. Seed demo data
npm run db:seed

# 6. Start the app
npm run dev
# → http://localhost:3000
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://treo:treo_dev_password@localhost:5432/treo_dev` |
| `AUTH_SECRET` | Random secret for Auth.js JWT | `openssl rand -base64 32` |
| `STORAGE_ENDPOINT` | S3-compatible endpoint | `http://localhost:9000` (MinIO) |
| `STORAGE_BUCKET` | Bucket name | `treo-uploads` |
| `STORAGE_ACCESS_KEY_ID` | S3 access key | `treo_minio` |
| `STORAGE_SECRET_ACCESS_KEY` | S3 secret | `treo_minio_secret` |
| `STORAGE_FORCE_PATH_STYLE` | Required for MinIO | `true` |
| `AI_PROVIDER` | LLM backend | `openai` / `anthropic` / `openai-compatible` |
| `AI_MODEL` | Model name | `gpt-4o` / `claude-3-5-sonnet-20241022` |
| `AI_API_KEY` | Your API key | `sk-...` |
| `AI_BASE_URL` | (openai-compatible) base URL | `http://localhost:11434/v1` |
| `MATH_SERVICE_URL` | FastAPI math service | `http://localhost:8001` |
| `RATE_LIMIT_UPLOAD_RPM` | Upload rate limit | `10` |
| `RATE_LIMIT_AI_RPM` | AI call rate limit | `20` |
| `IMAGE_RETENTION_DAYS` | Days before image deletion | `180` |
| `CRON_SECRET` | Pre-shared secret for retention cron | any random string |
| `NEXT_PUBLIC_APP_URL` | Public base URL | `http://localhost:3000` |

---

## npm Scripts

```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm start            # Start production server
npm test             # Run unit tests (vitest)
npm run test:watch   # Watch mode tests
npm run db:migrate   # Run Prisma migrations
npm run db:push      # Push schema to DB (no migration file)
npm run db:generate  # Regenerate Prisma client
npm run db:studio    # Open Prisma Studio
npm run db:seed      # Seed demo data
```

---

## Architecture

```
src/
├── app/                      # Next.js App Router
│   ├── api/                  # API routes
│   │   ├── auth/[...nextauth]/  # Auth.js handler
│   │   ├── upload/           # Image upload + LLM extraction
│   │   ├── sessions/[id]/    # Session CRUD, verify, diagnose, hints, respond
│   │   ├── classrooms/       # Classroom management
│   │   ├── invitations/      # Teacher/parent invitations
│   │   ├── parent-links/     # Parent↔student links
│   │   ├── parent/reports/   # Weekly report generation
│   │   ├── teacher/          # Teacher analytics API
│   │   └── admin/            # School admin API
│   ├── student/              # Student pages
│   ├── teacher/              # Teacher dashboard
│   ├── parent/               # Parent view
│   ├── admin/                # Admin view
│   ├── login/                # Auth pages
│   └── invite/[token]/       # Invitation acceptance
├── lib/
│   ├── ai/                   # AIProvider + extraction + diagnosis + hints
│   ├── analytics/            # Mastery formula
│   ├── math/                 # Math verification client
│   ├── reports/              # Weekly report generator
│   ├── storage/              # S3 client
│   ├── auth.ts               # Auth.js config
│   ├── auth-helpers.ts       # Authorization guards
│   ├── prisma.ts             # Prisma singleton
│   └── rate-limit.ts         # In-memory rate limiter
├── components/
│   ├── math/KaTeXRenderer    # LaTeX rendering
│   ├── teacher/              # Teacher UI components
│   └── admin/                # Admin UI components
├── types/next-auth.d.ts      # Auth.js type extensions
└── __tests__/                # Unit tests (91 tests)

services/math/                # FastAPI + SymPy verification service
prisma/
├── schema.prisma             # Database schema
└── seed.ts                   # Demo data seed script
prompts/                      # Versioned LLM prompts
seed/images/                  # Sample handwritten algebra images
```

---

## Data Model

```
School → User (SCHOOL_ADMIN | TEACHER | STUDENT | PARENT)
       → Classroom → Enrollment (student↔classroom)
                   → ProblemSession → SessionStep
                                    → HintEvent
                                    → SessionSkill → SkillTag
                                    → TeacherOverride
       → ParentLink (parent↔student, consentGiven)
       → Invitation (email + role + token + expiry)
       → WeeklyParentReport
```

---

## Roles & Access

| Role | Login method | Can see |
|---|---|---|
| **School Admin** | Email + password | School aggregates, teacher list, no student PII |
| **Teacher** | Email + password | Own classrooms, enrolled students, sessions, analytics |
| **Student** | Class code + username + PIN | Own sessions only |
| **Parent** | Email + password | Reports for linked+consented children only |

Authorization is enforced server-side on every API route via `src/lib/auth-helpers.ts`. Tests prove cross-role and cross-school access is denied.

---

## AI Provider

Swap providers via env vars — no code changes needed:

```bash
# OpenAI (default)
AI_PROVIDER=openai
AI_MODEL=gpt-4o
AI_API_KEY=sk-...

# Anthropic
AI_PROVIDER=anthropic
AI_MODEL=claude-3-5-sonnet-20241022
AI_API_KEY=sk-ant-...

# Local (Ollama, LM Studio, etc.)
AI_PROVIDER=openai-compatible
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=llama3.1
AI_API_KEY=ignored
```

All prompts are versioned files in `/prompts/`. JSON output is validated with Zod and retried once on failure.

---

## Math Verification Service

A FastAPI + SymPy microservice (`services/math/`) checks algebraic equivalence between steps.

```bash
# Run standalone (requires Python 3.12+)
cd services/math
pip install fastapi uvicorn sympy
uvicorn main:app --port 8001

# Or via Docker Compose (included)
docker compose up math-service
```

Endpoints:
- `POST /verify` — verify a full sequence of steps
- `POST /check` — check two LaTeX expressions for equivalence
- `GET /health` — liveness check

---

## Mastery Formula

Documented in `src/lib/analytics/mastery.ts`:

```
For each session:
  score    = finalAnswerCorrect ? 1.0 : 0.0
  penalty  = hintsUsed × 0.1
  adjusted = max(0, score − penalty)

Exponential recency weighting (decay = 0.8):
  weight_i = 0.8^(n−1−i)   (oldest sessions weighted least)
  mastery  = Σ(weight_i × adjusted_i) / Σ(weight_i)
  clamped  to [0, 1]

Bands: needs-work (< 0.40) | developing (0.40–0.69) | proficient (0.70–0.89) | mastered (≥ 0.90)
```

---

## Image Retention

Student images are stored in a private S3 bucket. Signed URLs expire after `STORAGE_URL_EXPIRY_SECONDS` (default 1 hour). Images are automatically deleted after `IMAGE_RETENTION_DAYS` (default 180) when you call:

```bash
curl -X POST https://yourapp.com/api/admin/retention \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

Set up as a daily cron job on your hosting platform.

---

## Demo Script (all 4 roles)

### 1. School Admin

```
URL: http://localhost:3000/login (Teacher/Admin/Parent tab)
Email: admin@demo.edu
Password: DemoAdmin123
```

- See school stats: 2 teachers, 15 students, 3 classrooms
- Invite a new teacher via the inline form
- See all classrooms and which teacher owns each

### 2. Teacher

```
Email: teacher1@demo.edu
Password: DemoTeacher123
```

- See 2 classrooms: Algebra 1 Period 1 & Period 2
- Click a classroom → skill heatmap (students × 12 skills, colored)
- Note "Needs Attention" strip showing inactive or struggling students
- Click a student → strength/weakness breakdown + weekly activity chart
- Click a session → see image + transcription + hint trail + diagnosis note
- Override an error type or correctness on any session
- Download CSV export with the "Export CSV" button

### 3. Student

```
URL: http://localhost:3000/login (Student tab)
Class code: (printed by seed script — look for "class code: XXXXXX")
Username:   alexm1
PIN:        1234
```

- Click "+ Upload New Problem"
- Upload one of the sample images from `seed/images/algebra-sample-2.svg`
- Wait ~10s for extraction → side-by-side confirmation
- Edit any step if needed → click "Yes, this looks right"
- Watch "Checking your math…" → arrive on coaching page
- Step 2 (distribution error) will be highlighted in amber
- Click "Get a Hint" → Socratic question appears
- Type a revised step in the LaTeX input (try: `3x - 6 = 9`)
- Submit → re-verification runs → if correct → praise + challenge

### 4. Parent

```
Email: parent1@example.com
Password: DemoParent123
```

- See linked child (Alex M.)
- Click "Refresh This Week's Report" to generate one (requires `AI_API_KEY`)
- Report shows: what's going well, one area to work on, 2 home tips
- No scores, no images, no comparisons with other students

---

## Running Tests

```bash
npm test
# 91 tests across 6 test files
# No DB or API key required — all tests use mocks or pure logic
```

Test coverage:
- Authorization: 17 tests (cross-role, cross-school, parent consent)
- Extraction schema: 5 tests
- Rate limiter: 4 tests + storage key format: 2 tests
- Verification schema: 6 tests
- Diagnosis schema + skill taxonomy: 6 tests
- Hint schemas + level ordering: 17 tests
- Mastery formula + CSV escaping: 22 tests
- Report schema + privacy + week start: 12 tests

---

## Deployment Notes

1. **Database**: Any PostgreSQL 15+ host (Neon, Supabase, Railway, etc.)
2. **Storage**: AWS S3, Cloudflare R2, or any S3-compatible service — set `STORAGE_FORCE_PATH_STYLE=false` for AWS
3. **Math service**: Deploy `services/math/` as a separate container or serverless function; set `MATH_SERVICE_URL`
4. **Cron job**: Schedule `POST /api/admin/retention` daily with `x-cron-secret` header
5. **Rate limits**: In-memory rate limiter works for single-instance deployments. For multi-instance, replace `src/lib/rate-limit.ts` with a Redis adapter

---

## Privacy Compliance Notes

- No student email required — students identify by username + PIN
- Minimum PII: first name + last initial only
- Images are private (signed URLs only, no public ACL)
- Student names and IDs are **never sent to the LLM** — only problem content
- All AI inputs and outputs are logged per session for teacher review
- Configurable data retention for images (default 180 days)
- Parent access requires explicit `consentGiven = true` on `ParentLink`
