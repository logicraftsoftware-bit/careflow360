# Hospital ERP OPD API

Base URL: `https://YOUR-CARE-FLOW-HOST/api/erp/v1`

All ERP requests must send:

```http
X-API-Key: cferp_your_generated_key
Content-Type: application/json
```

Create or rotate the key from an authenticated clinic-admin session:

```http
POST /api/crm/erp/api-key
Authorization: Bearer <clinic-admin-access-token>
```

The full key is returned only once. Rotating it immediately invalidates the previous key.

## 1. Get scheduled OPD appointments

```http
GET /api/erp/v1/opd/appointments?from=2026-09-21T00:00:00%2B05:30&to=2026-09-22T00:00:00%2B05:30&status=CONFIRMED&syncStatus=PENDING&limit=50
```

Query parameters:

- `from` and `to`: required ISO-8601 timestamps; maximum range is 31 days.
- `status`: optional CRM appointment status.
- `syncStatus`: optional `PENDING`, `ACCEPTED`, or `REJECTED`.
- `limit`: optional, 1–100; default 50.
- `cursor`: pass `data.nextCursor` to request the next page.

## 2. Get one appointment

```http
GET /api/erp/v1/opd/appointments/AP-ABC123
```

## 3. Acknowledge import into ERP

```http
POST /api/erp/v1/opd/appointments/AP-ABC123/acknowledge
```

```json
{
  "externalAppointmentId": "ERP-OPD-98451",
  "syncStatus": "ACCEPTED",
  "message": "OPD registration created"
}
```

For a rejected import, use `"syncStatus": "REJECTED"` and put the reason in `message`.

## 4. Update appointment status from ERP

```http
PATCH /api/erp/v1/opd/appointments/AP-ABC123/status
```

```json
{
  "status": "CHECKED_IN"
}
```

Allowed statuses: `CHECKED_IN`, `IN_CONSULTATION`, `COMPLETED`, `NO_SHOW`, and `CANCELLED`.
For cancellation:

```json
{
  "status": "CANCELLED",
  "cancellationReason": "Cancelled at the hospital counter"
}
```

All responses use this envelope:

```json
{
  "success": true,
  "message": "Success",
  "data": {}
}
```

The ERP should store `appointmentNumber` as the immutable CRM reference, acknowledge each imported appointment, and retry only failed network requests. Repeating acknowledgement with the same ERP ID is safe.
