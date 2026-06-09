<div align="center">

# 🎓 Cert\_EET

### Digital Certification & Micro-Certification Platform

**AI-native · Verifiable · Sovereign**

[![Status](https://img.shields.io/badge/status-in%20development-yellow?style=flat-square)](https://github.com)
[![Stack](https://img.shields.io/badge/backend-NestJS-E0234E?style=flat-square&logo=nestjs&logoColor=white)](https://nestjs.com)
[![Stack](https://img.shields.io/badge/frontend-Next.js-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![DB](https://img.shields.io/badge/database-PostgreSQL-336791?style=flat-square&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Cache](https://img.shields.io/badge/cache-Redis-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io)
[![AI](https://img.shields.io/badge/AI-LLM%20Native-8B5CF6?style=flat-square&logo=openai&logoColor=white)](https://openai.com)
[![License](https://img.shields.io/badge/license-Private-gray?style=flat-square)](./LICENSE)
[![PFE](https://img.shields.io/badge/ESPRIT-PFE%202026-003087?style=flat-square)](https://esprit.tn)

<br/>

> *"No existing LMS on the market satisfies all the requirements of Cert\_EET.  
> The only viable path is a fully custom build."*  
> — Phase 1 Benchmark, April 2026

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [The Problem We Solve](#-the-problem-we-solve)
- [Core Features](#-core-features)
- [Architecture](#️-architecture)
- [Tech Stack](#-tech-stack)
- [User Roles](#-user-roles)
- [UML Documentation](#-uml-documentation)
- [Non-Functional Requirements](#-non-functional-requirements)
- [Development Roadmap](#️-development-roadmap)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Contributing](#-contributing)
- [Author](#-author)

---

## 🌍 Overview

**Cert\_EET** is a full-stack, AI-native platform for digital certification and micro-certification, built for **ESPRIT Entreprise** — the continuing education entity of the ESPRIT group in Tunisia.

The platform manages the complete competency validation lifecycle:

- Certifying assessments (anti-fraud MCQ engine)
- Practical workshops with structured grading
- Cryptographically verifiable digital certificates (QR + SHA-256)
- A contextual AI chatbot that knows each learner's progression
- Role-based access control for Administrators, Trainers, and Learners

Cert\_EET is **not** a replacement for existing teaching tools (Blackboard, Teams, Moodle). It intervenes **downstream**, at the point of certification, filling a gap none of those tools were designed to cover.

---

## 🚨 The Problem We Solve

Three structural trends in 2025–2026 are reshaping professional certification:

| Trend | Impact |
|---|---|
| 📈 LLM democratization in education | New category of "AI-native" platforms emerges |
| 🏅 Rise of micro-certifications & digital badges | Credentials now matter in hiring pipelines |
| 🔒 Data sovereignty requirements in Tunisia | Institutional data must stay local |

**The gap:** A Phase 1 benchmark of 6 major LMS/LXP platforms (Moodle, TalentLMS, 360Learning, Open edX, Docebo, Canvas) revealed three critical structural gaps — none of the platforms provide all three simultaneously:

- **G1 — No AI agent with learner context** — No platform offers an agent aware of QCM scores, workshop progress, and capable of proactively alerting a trainer.
- **G2 — No structured practical workshops** — The concept of a configurable skills rubric + submission + validation workflow is absent or rudimentary on 5 out of 6 platforms.
- **G3 — No verifiable digital certification** — Only Open edX attempts cryptographic signing, at the cost of disproportionate operational complexity.

**The decision:** After evaluating three strategic scenarios (direct adoption, Moodle hybridization, custom development), the benchmark recommends **full custom development** — the only scenario achieving 100% coverage of the functional spec.

---

## ✨ Core Features

### 🧪 F1 — Anti-Fraud MCQ Engine
Server-side question randomization, configurable timer, attempt history, automatic scoring. No client-side cheating vectors. Questions support rich text, images, and code blocks.

### 🛠️ F2 — Practical Workshops with Trainer Workflow
Full lifecycle: workshop creation → deliverable submission → configurable competency rubric → trainer correction → structured feedback. Progressive locking prevents retroactive editing after correction begins.

### 🏆 F3 — Verifiable Digital Certification
PDF certificate generation with embedded QR code and **SHA-256 cryptographic hash**. Every certificate has a public verification URL. Employers can scan and verify authenticity in seconds — without any account.

### 🤖 F4 — Contextual AI Chatbot
The most differentiating feature. An LLM agent with dynamic context injection per learner:
- Knows the learner's latest QCM scores
- Knows their workshop progress and identified gaps
- **Support mode:** answers learner questions about course content
- **Follow-up mode:** proactively alerts the trainer on detected dropout risk
- Provider-agnostic (GPT-4o / Claude / Mistral swappable without refactoring)

### 🔐 F5 — Granular Role-Based Access Control (RBAC)
Three roles with strict permission isolation: **Administrator**, **Trainer**, **Learner**. A trainer sees only their own learners. Session invalidation on role change.

### 📊 F6 — Analytics & Reporting
Per-role dashboards: completion rates, average scores, dropout detection. PDF and CSV exports. Real-time monitoring for administrators.

### 🛡️ F7 — Security & Compliance
JWT with refresh tokens, optional MFA, TLS everywhere, timestamped audit logs for all critical operations, data anonymization on account deletion.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│          Browser (SPA / SSR)          Smartphone (QR scan)      │
└─────────────────┬───────────────────────────────────┬───────────┘
                  │ HTTPS + TLS                        │
┌─────────────────▼───────────────────────────────────▼───────────┐
│                    API GATEWAY — NestJS                          │
│       REST endpoints (OpenAPI 3.0) + SSE (chatbot streaming)    │
└──────┬──────────────────────┬───────────────────────┬───────────┘
       │                      │                        │
┌──────▼──────┐   ┌───────────▼──────────┐  ┌─────────▼──────────┐
│  PostgreSQL │   │   Redis              │  │  MinIO / S3        │
│  (primary)  │   │   Cache + Bull Queue │  │  PDF & file storage│
└─────────────┘   └───────────┬──────────┘  └────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Bull Worker       │
                    │ PDF gen · SHA-256   │
                    │ QR code · Emails    │
                    └──────────┬──────────┘
                               │
              ┌────────────────▼────────────────┐
              │        External Services         │
              │  LLM API (GPT-4o/Claude/Mistral) │
              │  SMTP (email notifications)      │
              │  MFA service                     │
              └─────────────────────────────────┘
```

**Key architectural decisions:**

- **API-first** — all features exposed via a documented REST API (OpenAPI 3.0)
- **Async certificate generation** — PDF + SHA-256 + QR code runs in a Bull queue worker, not in the HTTP request thread, keeping the API reactive
- **LLM abstraction layer** — swap AI providers without touching business logic
- **RAG-ready** — architecture prepared for Retrieval-Augmented Generation in V2
- **Dockerized** — reproducible dev/staging/production environments via Docker Compose

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Backend / API** | NestJS (Node.js) | Modularity, TypeScript, decorator-based architecture, ecosystem maturity |
| **Frontend** | Next.js (React) | SSR/SSG, performance, SEO, reactive components |
| **Primary Database** | PostgreSQL | Relational integrity, JSONB support, audit compliance |
| **Cache & Queues** | Redis + Bull | Session cache, async job queues for PDF generation |
| **AI / LLM** | OpenAI GPT-4o / Anthropic Claude / Mistral | Swappable via abstraction layer |
| **File Storage** | MinIO or AWS S3 | Certificate PDFs, workshop deliverables |
| **Containerization** | Docker + Docker Compose | Portable, reproducible across all environments |
| **CI/CD** | GitHub Actions | Automated testing and deployment pipeline |
| **Real-time** | SSE (Server-Sent Events) | Chatbot streaming responses |
| **Auth** | JWT + Refresh Tokens + MFA | Stateless, secure, multi-factor capable |
| **API Docs** | Swagger / OpenAPI 3.0 | Full endpoint documentation |

---

## 👥 User Roles

### 🎓 Learner
Enrolls in training programs, takes MCQ exams, submits workshop deliverables, receives AI-assisted feedback, downloads verified certificates.

### 👨‍🏫 Trainer
Creates MCQs and workshops, defines grading rubrics, corrects submissions with structured feedback, monitors learner progress dashboards, receives AI dropout alerts.

### ⚙️ Administrator
Manages all user accounts (including bulk CSV import), configures the RBAC, creates and archives training programs, assigns trainers and learners, revokes certificates, accesses the full audit log and institutional reports.

### 🌐 Public Visitor (anonymous)
Scans a certificate QR code or enters a URL to verify certificate authenticity. Gets a clear VALID / REVOKED / NOT FOUND result. No personal data exposed (GDPR-compliant by design).

---

## 📐 UML Documentation

Full UML 2.5 documentation is produced as part of the PFE deliverables:

| Diagram | Type | Status |
|---|---|---|
| Use Cases — Learner | Behavioral | ✅ Done |
| Use Cases — Trainer | Behavioral | ✅ Done |
| Use Cases — Administrator | Behavioral | ✅ Done |
| Use Cases — Public Visitor | Behavioral | ✅ Done |
| Class Diagram (Domain Model) | Structural | ⏳ In progress |
| Sequence Diagrams (7 scenarios) | Behavioral | ⏳ In progress |
| Activity Diagrams (4 workflows) | Behavioral | ⏳ In progress |
| State-Transition Diagrams (4 objects) | Behavioral | ⏳ In progress |
| Deployment Diagram | Structural | ⏳ In progress |
| Component Diagram | Structural | ⏳ Planned |

Diagrams are authored in PlantUML (`.puml` files under `/docs/uml/`).

---

## ⚡ Non-Functional Requirements

| Ref | Requirement | Target |
|---|---|---|
| NF1 | **Performance** | API response ≤ 500 ms under nominal load. Page load < 3 s. |
| NF2 | **Availability** | 99% uptime (excluding planned maintenance) |
| NF3 | **Security** | JWT, MFA, RBAC, timestamped audit logs |
| NF4 | **Data Sovereignty** | Deployable on local infrastructure or Tunisian VPS |
| NF5 | **Scalability** | Docker-based horizontal scaling |
| NF6 | **Maintainability** | Documented code, unit + integration tests on critical modules |
| NF7 | **Ergonomics** | Fully responsive (desktop + mobile), no prior training required |
| NF8 | **Interoperability** | RESTful API with OpenAPI 3.0 for future ESPRIT system integration |
| NF9 | **Portability** | Docker Compose for all environments (dev / staging / prod) |

---

## 🗓️ Development Roadmap

The project follows **Agile / Scrum** methodology with 2-week sprints over 6 months (April → October 2026).

| Sprint | Period | Focus |
|---|---|---|
| Sprint 0 | Apr 24 – May 7 | Architecture ADRs, infrastructure setup, CI/CD, backlog |
| Sprint 1–2 | May 8 – Jun 4 | Auth (JWT + MFA), RBAC, user management |
| Sprint 3–4 | Jun 5 – Jul 2 | MCQ engine (anti-fraud, timer, scoring, history) |
| Sprint 4–5 | Jun 19 – Jul 16 | Workshop module (creation, submission, workflow) |
| Sprint 5–6 | Jul 3 – Jul 30 | Workshop correction, rubric grading, notifications |
| Sprint 6 | Jul 17 – Jul 30 | Certification: PDF, QR code, SHA-256, public URL |
| Sprint 7 | Jul 31 – Aug 13 | Chatbot AI V1: LLM integration, conversation UI, history |
| Sprint 8 | Aug 14 – Aug 27 | Chatbot AI V2: full context injection, dropout alerts |
| Sprint 9 | Aug 28 – Sep 10 | Analytics dashboards, PDF/CSV exports |
| Sprint 10 | Sep 11 – Sep 24 | Load testing, OWASP security audit, performance tuning |
| Sprint 11–12 | Sep 25 – Oct 24 | Final QA, full technical documentation, PFE report & defense |

---

## 📁 Project Structure

```
cert-eet/
├── backend/                   # NestJS API
│   └── src/
│       ├── modules/
│       │   ├── auth/          # JWT, MFA, guards, strategies
│       │   ├── users/         # User management, RBAC
│       │   ├── formations/    # Training programs
│       │   ├── qcm/           # MCQ engine + anti-fraud
│       │   ├── ateliers/      # Workshops + deliverables
│       │   ├── certificats/   # PDF gen, SHA-256, QR code
│       │   ├── chatbot/       # LLM integration, context injection
│       │   ├── notifications/ # Email + in-app notifications
│       │   └── audit/         # Audit log
│       ├── shared/            # DTOs, entities, interfaces, enums
│       ├── common/            # Filters, interceptors, pipes, decorators
│       ├── config/
│       └── main.ts
├── frontend/                  # Next.js application
│   └── src/
│       ├── app/               # App router pages
│       ├── components/
│       └── lib/
├── docs/
│   ├── uml/                   # PlantUML diagrams (.puml)
│   ├── adr/                   # Architecture Decision Records
│   └── specs/                 # Functional specifications
├── docker-compose.yml
├── docker-compose.prod.yml
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16+ (or use the Docker service)
- Redis 7+ (or use the Docker service)

### Local Development

```bash
# Clone the repository
git clone https://github.com/<your-username>/cert-eet.git
cd cert-eet

# Start infrastructure services
docker-compose up -d postgres redis minio

# Install backend dependencies
cd backend
npm install
cp .env.example .env   # Fill in your environment variables
npm run start:dev

# Install frontend dependencies
cd ../frontend
npm install
npm run dev
```

The API will be available at `http://localhost:3000`  
The frontend will be available at `http://localhost:4000`  
Swagger documentation: `http://localhost:3000/api/docs`

### Environment Variables

Key variables to configure in `backend/.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/cert_eet
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret
JWT_REFRESH_SECRET=your_refresh_secret
LLM_PROVIDER=openai           # openai | anthropic | mistral
OPENAI_API_KEY=sk-...
SMTP_HOST=smtp.example.com
STORAGE_ENDPOINT=http://localhost:9000
```

---

## 🤝 Contributing

This project is a **PFE (Final Year Project)** and is currently in active development. Contributions, suggestions, and feedback are welcome.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push and open a Pull Request

Please follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

---

## 👨‍💻 Author & Supervision

| Role | Name |
|---|---|
| 🎓 **Student / Developer** | Iyed Omri |
| 🏫 **Academic Supervisor** | Wiem Trabelsi |
| 🏢 **Professional Supervisor** | Chokri Chaaraoui |

**Institution:** ESPRIT — École Supérieure Privée d'Ingénierie et de Technologies  
**Program:** Software Engineering — PFE 2026  
**Commissioned by:** ESPRIT Entreprise

---

<div align="center">

**Cert\_EET** — Built from scratch because no existing platform was enough.

[![ESPRIT](https://img.shields.io/badge/ESPRIT-Ingénierie%20Logicielle-003087?style=flat-square)](https://esprit.tn)
[![Made with NestJS](https://img.shields.io/badge/Made%20with-NestJS-E0234E?style=flat-square&logo=nestjs)](https://nestjs.com)
[![Powered by AI](https://img.shields.io/badge/Powered%20by-AI-8B5CF6?style=flat-square&logo=openai)](https://openai.com)

*April 2026 – October 2026 · Tunisia*

</div>