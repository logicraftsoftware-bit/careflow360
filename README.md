# CareFlow360

CareFlow360 is a multi-tenant SaaS lead-management and doctor-appointment CRM for clinics. This repository contains a React/Vite web app and an Express/Prisma API backed by MongoDB.

## Included foundation

- Responsive public landing, pricing, features, contact, legal, login, and registration pages
- Database-driven subscription plans and pending-approval tenant registration
- Super Admin dashboard, tenant review, approval, suspension, and plan management
- Tenant CRM dashboard and API-backed branch, department, doctor, lead, follow-up, patient, appointment, notification, support, and audit workspaces
- Complete tenant and Super Admin navigation for all Phase 1 extension areas
- JWT access tokens, refresh-token rotation/revocation, Argon2 passwords, rate limiting, Helmet, CORS, validation, and consistent API errors
- PostgreSQL schema for tenants, RBAC, plans, subscriptions, CRM, appointments, payments, webhooks, notifications, audit logs, and support tickets
- CareFlow360 branding, supplied logo, India/INR defaults, and `Asia/Kolkata`

## Local setup

Requirements: Node.js 20+, npm 10+, and a MongoDB replica set (MongoDB Atlas is recommended).

1. Copy `.env.example` to `.env` and set secure values.
2. Supply a MongoDB Atlas URL or start a local MongoDB replica set.
3. Install packages with `npm install`.
4. Generate Prisma Client with `npm run db:generate`.
5. Synchronize collections and indexes with `npm run db:push`.
6. Seed plans, permissions, and the Super Admin with `npm run db:seed`.
7. Start both apps with `npm run dev`.

Web: `http://localhost:5173`  
API health: `http://localhost:4000/api/health`

The seeded Super Admin email comes from `SUPER_ADMIN_EMAIL`. The password comes from `SUPER_ADMIN_PASSWORD`. Never use the example password in production.

## Commands

```bash
npm run dev
npm run typecheck
npm run test
npm run build
npm run db:generate
npm run db:push
npm run db:seed
```

## Architecture

The authenticated JWT supplies the user and tenant context. Tenant API routes derive `tenantId` from that context and never trust a tenant ID from a browser payload. Platform routes require `isPlatform`. Sensitive state changes are written to `AuditLog`.

Core flow:

```text
Public registration -> Pending tenant/subscription -> Super Admin approval
-> Owner login -> Tenant-scoped CRM -> Lead -> Patient -> Appointment
```

External email, payment, Meta, WhatsApp, object-storage, and Redis settings remain environment-driven. Production connections must be configured after credentials are available; secrets must only be entered in local/Vercel environment variables.

## Deployment

Build the web app from `apps/web` using `npm run build`; its output is `apps/web/dist`. Configure `VITE_API_URL` to the deployed API URL. Deploy the API to a Node-compatible platform or adapt it as a Vercel function, and configure `DATABASE_URL`, JWT secrets, CORS origins, and provider credentials in the host environment.

Before production launch:

- Attach MongoDB Atlas, review the schema push, and seed the database.
- Replace all example secrets and the seed password.
- Configure HTTPS origins and provider webhook secrets.
- Add production email/payment/Meta/WhatsApp adapters as selected.
- Perform end-to-end approval, tenant-isolation, booking-concurrency, webhook-idempotency, backup, and restore testing.

## Repository safety

`.env`, build output, dependencies, logs, and local database files are ignored. No provider credentials or production secrets belong in Git.
