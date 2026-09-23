# CareFlow360 API and Workflow Reference

**Production domain:** [https://crm.hosmedai.com](https://crm.hosmedai.com)  
**Production API base URL:** `https://crm.hosmedai.com/api`  
**Document version:** 1.0  
**Last updated:** 22 September 2026

This document describes the HTTP API implemented in `apps/api/src`. It covers public, patient, clinic staff/admin, Super Admin, integration, and ERP endpoints.

## 1. Basics

### Base URLs

| Environment | Base URL |
|---|---|
| Local API | `http://localhost:4000/api` |
| Production | `https://crm.hosmedai.com/api` |

All JSON requests must send `Content-Type: application/json` unless an endpoint explicitly returns an image or audio file.

### Standard response envelope

Successful JSON responses use:

```json
{
  "success": true,
  "message": "Success",
  "data": {}
}
```

Errors use:

```json
{
  "success": false,
  "message": "Human-readable error",
  "errorCode": "MACHINE_READABLE_CODE",
  "errors": []
}
```

Common status codes are `200` success, `201` created, `400` validation error, `401` missing/expired authentication, `403` forbidden, `404` not found, `409` conflict, `429` too many attempts, and `500` internal error.

### Authentication types

| Type | Header | Used by |
|---|---|---|
| Staff JWT | `Authorization: Bearer ACCESS_TOKEN` | Clinic admin, clinic staff, Super Admin |
| Patient JWT | `Authorization: Bearer PATIENT_TOKEN` | Patient portal |
| ERP API key | `Authorization: Bearer ERP_API_KEY` or `X-API-Key: ERP_API_KEY` | External ERP/HIS |
| Provider signature | Provider-specific headers | Cashfree and TeleCMI webhooks |

Staff access tokens expire after 15 minutes. Refresh tokens are rotated whenever `/auth/refresh` succeeds. Patient tokens expire after 30 days.

### Role and tenant behavior

- Super Admin users have `isPlatform: true` and may access `/super-admin/*`.
- Clinic users receive a `tenantId`; all `/crm/*` data is automatically scoped to that clinic.
- Administrative roles include `CLINIC_ADMIN`, `CLINIC_MANAGER`, `BRANCH_ADMIN`, and `MANAGER`.
- Regular staff must log in with `portal: "STAFF"`; administrative users use `portal: "ADMIN"`.
- The CRM dashboard checks `dashboard.read` or `dashboard.manage`. Most other CRM routes currently require an authenticated tenant user but do not enforce individual permission keys at the API route level.

## 2. Authentication API

Prefix: `/api/auth`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/login` | Public | Authenticate Super Admin, clinic admin, or staff |
| POST | `/refresh` | Refresh token | Rotate refresh token and issue a new session |
| GET | `/me` | Staff JWT | Return the current user |
| POST | `/logout` | Staff JWT | Revoke all active refresh tokens for the user |

### POST `/auth/login`

```json
{
  "email": "staff@example.com",
  "password": "minimum-8-characters",
  "portal": "ADMIN"
}
```

`portal` is `ADMIN` or `STAFF` and defaults to `ADMIN`. The response contains `accessToken`, `refreshToken`, and a `user` object with `permissions` and `roleCodes`.

### POST `/auth/refresh`

```json
{ "refreshToken": "TOKEN_FROM_LOGIN" }
```

The submitted refresh token is revoked and replaced. Store the returned replacement token.

## 3. Public API

Prefix: `/api/public`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/plans` | List active subscription plans with features and limits |
| POST | `/register` | Register a clinic for approval |
| GET | `/payments/:appointmentNumber` | Get appointment payment status and Cashfree payment URL |
| GET | `/appointment-token/:id.png?signature=...` | Download a signed appointment-token PNG |

### POST `/public/register`

```json
{
  "clinicName": "Example Clinic",
  "ownerName": "Clinic Owner",
  "email": "owner@example.com",
  "mobile": "9876543210",
  "password": "secure-password",
  "address": "Optional",
  "city": "Guwahati",
  "state": "Assam",
  "pin": "781001",
  "planId": "PLAN_OBJECT_ID",
  "billingCycle": "MONTHLY",
  "acceptedTerms": true
}
```

`billingCycle` accepts `MONTHLY` or `ANNUAL`. New clinics are created with `PENDING_APPROVAL` status.

## 4. Patient Portal API

Prefix: `/api/patient`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/clinics` | Public | List active/trial clinics |
| POST | `/auth/request-otp` | Public | Send a patient login OTP |
| POST | `/auth/verify-otp` | Public | Verify OTP and receive patient JWT |
| GET | `/bootstrap` | Patient JWT | Load patient, clinic, doctors, tests, appointments, diagnostics, and reports |
| POST | `/doctor-bookings` | Patient JWT | Book a doctor appointment |
| POST | `/lab-bookings` | Patient JWT | Book one or more lab tests |

### Request patient OTP

```json
{ "tenantId": "CLINIC_ID", "mobile": "9876543210" }
```

The OTP expires after 10 minutes and locks after five incorrect attempts.

### Verify patient OTP

```json
{ "tenantId": "CLINIC_ID", "mobile": "9876543210", "otp": "123456" }
```

### Book doctor appointment

```json
{
  "doctorId": "DOCTOR_ID",
  "branchId": "BRANCH_ID",
  "startsAt": "2026-09-22T10:00:00+05:30",
  "visitType": "CLINIC",
  "notes": "Optional notes"
}
```

`visitType` accepts `CLINIC` or `VIDEO`.

### Book lab tests

```json
{
  "testIds": ["TEST_ID_1", "TEST_ID_2"],
  "appointmentAt": "2026-09-22T10:00:00+05:30",
  "collectionType": "HOME",
  "address": "Collection address",
  "notes": "Optional instructions"
}
```

`collectionType` accepts `HOME` or `LAB`.

## 5. Clinic Admin and Staff CRM API

Prefix: `/api/crm`. Every endpoint requires a staff JWT and a clinic tenant context.

### Dashboard and clinic profile

| Method | Endpoint | Description |
|---|---|---|
| GET | `/dashboard` | Clinic metrics, pipeline, appointments, follow-ups, calls, revenue, and workload |
| GET | `/clinic-profile` | Return current clinic profile |
| PATCH | `/clinic-profile` | Update clinic details and branding |

### Staff accounts

| Method | Endpoint | Description |
|---|---|---|
| GET | `/staff-accounts` | List clinic staff |
| POST | `/staff-accounts` | Create staff account |
| PATCH | `/staff-accounts/:id` | Update account, role, password, or TeleCMI mapping |
| GET | `/staff-accounts/:id/activity` | Last 100 audit entries for a staff user |
| DELETE | `/staff-accounts/:id` | Delete staff account; self-deletion is blocked |

Create staff example:

```json
{
  "name": "Staff Member",
  "email": "staff@example.com",
  "mobile": "9876543210",
  "password": "secure-password",
  "role": "RECEPTIONIST",
  "status": "ACTIVE",
  "telecmiAgentId": "optional-agent-id",
  "telecmiLoginEmail": "optional@example.com"
}
```

Update requires `name`, `email`, `role`, and `status`; `password` may be omitted or empty. Status accepts `ACTIVE` or `INACTIVE`.

### Generic CRM resources

These resources use the generic routes below:

`branches`, `departments`, `doctors`, `doctorSchedules`, `leadSources`, `leads`, `patients`, `appointments`, `followups`, `auditLogs`, `notifications`, `supportTickets`.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/:resource?page=1&limit=25&status=ACTIVE` | Paginated list; maximum limit is 100 |
| POST | `/:resource` | Create a tenant-scoped record |
| PATCH | `/:resource/:id` | Update an allowed subset of fields |
| DELETE | `/:resource/:id` | Delete a tenant-scoped record |
| POST | `/bulk/:resource` | Create multiple resource records |
| PATCH | `/leads/:id/status` | Change lead status with lead workflow rules |

Allowed writable fields:

| Resource | Fields |
|---|---|
| branches | `name`, `address`, `city`, `state`, `country`, `pin`, `phone`, `email`, `status` |
| departments | `branchId`, `branchIds`, `name`, `code`, `description`, `status` |
| doctors | `departmentId`, `name`, `qualification`, `specialization`, `registrationNumber`, `mobile`, `email`, `experience`, `consultationFee`, `status` |
| doctorSchedules | `doctorId`, `branchId`, `dayOfWeek`, `scheduleDate`, `sessionPeriod`, `startTime`, `endTime`, `slotMinutes`, `maxPatients`, `status` |
| leadSources | `name`, `code`, `status` |
| leads | `name`, `mobile`, `email`, `city`, `departmentId`, `doctorId`, `sourceId`, `status`, `priority`, `remarks`, `nextFollowUpAt`, `assignedToId` |
| patients | `leadId`, `name`, `gender`, `age`, `mobile`, `email`, `address`, `city`, `state`, `pin`, `status` |
| appointments | `patientId`, `leadId`, `branchId`, `departmentId`, `doctorId`, `startsAt`, `endsAt`, `status`, `paymentStatus`, `amount`, `cancellationReason`, `paymentConfirmedAt` |
| followups | `leadId`, `staffId`, `scheduledAt`, `type`, `remarks`, `outcome`, `status`, `nextFollowUpAt` |
| notifications | `userId`, `type`, `title`, `body`, `readAt` |
| supportTickets | `requesterId`, `subject`, `description`, `priority`, `status`, `assignedToId`, `internalNotes` |

### Appointment workflow

| Method | Endpoint | Description |
|---|---|---|
| GET | `/doctor-schedule-roster` | Doctors grouped by assigned branch and schedule |
| GET | `/doctor-schedule-calendar?doctorId=...&branchId=...` | Schedules for a doctor and branch |
| GET | `/doctor-appointment-options?date=YYYY-MM-DD` | Available schedules and existing bookings |
| GET | `/appointment-patients?search=...` | Search up to 25 patients |
| GET | `/appointment-patients?patientId=...` | Load one patient option |
| POST | `/appointments/book` | Validate slot, create appointment, accept/initialize payment |
| POST | `/appointments/:id/whatsapp/retry` | Retry the appropriate appointment WhatsApp message |
| GET | `/appointments/:id/logs` | Appointment audit history |
| GET | `/appointments/calendar` | Calendar-oriented appointment data |

Booking body:

```json
{
  "patientId": "PATIENT_ID",
  "branchId": "BRANCH_ID",
  "departmentId": "DEPARTMENT_ID",
  "doctorId": "DOCTOR_ID",
  "scheduleId": "SCHEDULE_ID",
  "startsAt": "2026-09-22T10:00:00+05:30",
  "status": "CONFIRMED",
  "paymentStatus": "PENDING",
  "sendWhatsApp": true,
  "paymentMethod": "UPI",
  "utrNumber": "TRANSACTION_REFERENCE",
  "paymentRemarks": "Optional"
}
```

Appointment status accepts `DRAFT`, `BOOKING_PENDING`, `PAYMENT_PENDING`, or `CONFIRMED`. Payment status accepts `NOT_REQUIRED`, `PENDING`, or `PAID`. Manual paid methods are `CASH`, `UPI`, `CARD`, `BANK_TRANSFER`, or `CHEQUE`; a transaction reference is required for non-cash methods. Pending payments generate a Cashfree link when the clinic integration is active.

### Patient follow-ups

| Method | Endpoint | Description |
|---|---|---|
| GET | `/patient-followups` | List patient follow-ups |
| POST | `/patient-followups` | Schedule a patient call follow-up |
| PATCH | `/patient-followups/:id/status` | Set `PENDING`, `COMPLETED`, `MISSED`, or `CANCELLED` |

### Dynamic clinic modules

| Method | Endpoint | Description |
|---|---|---|
| GET | `/modules/:module` | List module records |
| POST | `/modules/:module` | Create module record |
| PATCH | `/modules/:module/:id` | Merge changes into module data |
| DELETE | `/modules/:module/:id` | Delete module record |
| GET | `/modules/:module/:id/logs` | Module audit history |
| POST | `/modules/:module/:id/whatsapp/retry` | Retry diagnostics WhatsApp notification |

Module records use a common shape containing `title`, `status`, and flexible module-specific JSON data. Modules used by the application include master data, roles/permissions, lab tests, radiology tests, lab appointments, radiology appointments, reports, and other navigation workspaces.

### Lab collection workflow

| Method | Endpoint | Description |
|---|---|---|
| GET | `/lab-technicians` | List active lab technicians |
| PATCH | `/lab-appointments/:id/assign` | Assign `{ "technicianId": "..." }` |
| POST | `/lab-collections/orders` | Create and assign collection order/specimens |
| PATCH | `/lab-collections/orders/:id` | Update collection order |
| GET | `/lab-collections` | List collection jobs |
| GET | `/lab-collections/:id/labels` | Generate specimen label information |
| PATCH | `/lab-collections/:id/workflow` | Move through collection workflow |
| POST | `/lab-collections/:id/verification-otp` | Send patient verification OTP |
| POST | `/lab-collections/:id/verify-otp` | Verify collection OTP |
| PATCH | `/lab-collections/:id/location` | Record collector location |
| PATCH | `/lab-collections/:id/collect` | Mark collection details/specimens |

Workflow stages are `ASSIGNED`, `ACCEPTED`, `ON_THE_WAY`, `ARRIVED`, `PATIENT_VERIFIED`, `PREPARATION_CHECKED`, `BARCODES_SCANNED`, `SPECIMENS_COLLECTED`, `PAYMENT_RECORDED`, `PACKAGED`, `SAMPLE_COLLECTED`, `IN_TRANSIT`, and `RECEIVED`.

### Payment logs

`GET /crm/payment-logs` returns tenant payment activity, including appointment and diagnostic payment records.

## 6. Super Admin API

Prefix: `/api/super-admin`. All endpoints require a staff JWT with `isPlatform: true`.

### Platform and tenant management

| Method | Endpoint | Description |
|---|---|---|
| GET | `/dashboard` | Platform totals and activity |
| GET | `/subscriptions` | Subscription records and statistics |
| GET | `/tenants` | List all clinics |
| GET | `/tenants/:id` | Clinic details |
| POST | `/tenants` | Create clinic, owner, role, and subscription |
| PATCH | `/tenants/:id` | Update clinic, owner, password, or subscription |
| PATCH | `/tenants/:id/status` | Activate, reject, suspend, or start trial |

Tenant status update:

```json
{ "status": "ACTIVE", "reason": "Optional reason" }
```

Status accepts `ACTIVE`, `REJECTED`, `SUSPENDED`, or `TRIAL`.

### Plans

| Method | Endpoint | Description |
|---|---|---|
| GET | `/plans` | List plans with features and limits |
| POST | `/plans` | Create plan |
| PATCH | `/plans/:id` | Update plan |
| DELETE | `/plans/:id` | Delete unused plan |

Create plan fields are `name`, `code`, optional `description`, `monthlyPrice`, `annualPrice`, optional `trialDays`, optional `currency`, and optional `popular`.

### Platform module records

| Method | Endpoint | Description |
|---|---|---|
| GET | `/modules/:module` | List platform-scoped module records |
| POST | `/modules/:module` | Create platform record |
| PATCH | `/modules/:module/:id` | Update platform record |
| DELETE | `/modules/:module/:id` | Delete platform record |

### Per-clinic integrations

| Method | Endpoint | Description |
|---|---|---|
| GET | `/aisensy-integrations` | List clinic AiSensy configurations without secrets |
| PUT | `/tenants/:id/aisensy` | Save encrypted AiSensy settings/campaign names |
| GET | `/cashfree-integrations` | List clinic Cashfree configurations without secrets |
| PUT | `/tenants/:id/cashfree` | Save Cashfree App ID, encrypted Secret Key, sandbox flag, active flag |
| GET | `/telecmi-integrations` | List TeleCMI configurations without secrets |
| PUT | `/tenants/:id/telecmi` | Save TeleCMI credentials and settings |
| GET | `/telecmi-report?from=...&to=...` | Platform-wide call report |
| POST | `/tenants/:id/telecmi/sync` | Synchronize clinic calls for a date range |
| GET | `/tenants/:id/telecmi/account-report?from=...&to=...` | Clinic provider account report |

Cashfree configuration body:

```json
{
  "appId": "CASHFREE_APP_ID",
  "secretKey": "CASHFREE_SECRET_KEY",
  "isTestMode": true,
  "isActive": true
}
```

When updating an existing configuration, `secretKey` may be empty to retain the saved encrypted value.

## 7. TeleCMI API

Prefix: `/api/integrations/telecmi`

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET/POST | `/webhook` | Provider | Receive TeleCMI call events |
| POST | `/sync` | Staff JWT | Sync calls between `startDate` and `endDate` |
| GET | `/users` | Staff JWT | List provider users/agents |
| GET | `/me` | Staff JWT | Current user’s agent and call capability |
| POST | `/status` | Staff JWT | Update softphone agent status |
| GET | `/softphone-credentials` | Staff JWT | Retrieve permitted softphone session settings |
| GET | `/recordings/:filename` | Staff JWT | Proxy an authorized call recording |
| POST | `/make-call` | Staff JWT | Initiate outbound call |
| GET | `/calls` | Staff JWT | Filtered calls and call-centre analytics |

## 8. Cashfree Webhook

`POST /api/cashfree/webhook` receives Cashfree `PAYMENT_SUCCESS_WEBHOOK` and `PAYMENT_FAILED_WEBHOOK` events.

Required headers:

- `x-webhook-signature`
- `x-webhook-timestamp`

The API verifies the Base64 HMAC-SHA256 signature using the clinic’s encrypted Cashfree Secret Key and the untouched raw request body. Events are stored idempotently. Successful payments confirm the appointment/diagnostic booking and may trigger a WhatsApp confirmation.

Do not call this endpoint from the frontend and do not parse/re-serialize the payload in a proxy before forwarding it.

## 9. ERP/HIS API

External prefix: `/api/erp/v1`. Authentication uses the clinic-specific ERP API key.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/opd/appointments` | List OPD appointments using supported filters |
| GET | `/opd/appointments/:appointmentNumber` | Get one OPD appointment |
| POST | `/opd/appointments/:appointmentNumber/acknowledge` | Store ERP acknowledgement/external reference |
| PATCH | `/opd/appointments/:appointmentNumber/status` | Update ERP synchronization/appointment status |

Clinic management prefix: `/api/crm/erp`; staff JWT required.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api-key` | Generate/rotate clinic ERP API key; raw key is returned once |
| GET | `/api-key` | Return key prefix, active state, and last-used date |
| DELETE | `/api-key` | Revoke ERP integration key |

Never store the raw ERP API key in source control or browser storage.

## 10. Examples

### Authenticated request

```bash
curl "https://crm.hosmedai.com/api/crm/patients?page=1&limit=25" \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

### Create a patient

```bash
curl -X POST "https://crm.hosmedai.com/api/crm/patients" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Example Patient",
    "gender": "FEMALE",
    "age": 35,
    "mobile": "9876543210",
    "status": "ACTIVE"
  }'
```

### Super Admin clinic list

```bash
curl "https://crm.hosmedai.com/api/super-admin/tenants" \
  -H "Authorization: Bearer SUPER_ADMIN_ACCESS_TOKEN"
```

## 11. Security and integration notes

- Never expose JWT secrets, Cashfree Secret Keys, AiSensy keys, TeleCMI secrets, or ERP raw keys.
- Determine amounts and paid state on the server; never trust payment results submitted by a browser.
- Use ISO 8601 date/time values with an explicit offset, normally `+05:30` for clinic operations.
- IDs are MongoDB ObjectId strings unless a provider-specific ID is documented.
- Webhooks must be publicly reachable over HTTPS.
- Retry `429` and transient `5xx` responses with exponential backoff. Do not blindly retry validation or authorization failures.
- Use the returned `errorCode` for application logic and `message` for display/logging.

## 12. Source-of-truth note

This reference documents the currently implemented API, not a future contract. Flexible `/modules/:module` payloads are intentionally schema-light and should be versioned or given dedicated endpoints before exposing them to third-party clients. Whenever routes or Zod validators change, update this file in the same pull request.
