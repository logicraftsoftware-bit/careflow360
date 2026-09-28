# Appointment accounts

The Accounts menu has Doctor Appointment Wise, Lab Appointment Wise and
Radiology Appointment Wise reports. Each report supports search, appointment-date
ranges, service/status filters, totals, 25-row pages, CSV and PDF export. Exports
include every filtered row, not only the current page. Dates use the clinic's
timezone. Reports are read-only.

Clinic administrators and managers can access the reports. Other staff need
`accounts.read` or `accounts.manage`, configured under Roles & Permissions.
The API checks the current role configuration and scopes queries to the tenant.

## Financial definitions

- Gross charge and discount use the diagnostic appointment's stored subtotal and
  discount. Doctor appointments currently have a fee but no separate discount.
- Net charge is the amount stored on the appointment. Billable excludes cancelled,
  refunded and NOT_REQUIRED appointments.
- Doctor collections total PAID and PARTIALLY_PAID payment records, including the
  original value of REFUNDED records. Failed/pending payment attempts are excluded.
  Where no settled payment record exists, PAID/REFUNDED appointment status provides
  the full amount. Diagnostic records also use payment status, because they do not
  have a separate payment ledger.
- Refunded status represents a full refund. Net collected is collected minus
  refunds. Outstanding is the positive difference between billable and net
  collected. Cancelled appointments retaining collections are flagged for review.
- Partial payments without a recorded payment amount are Unknown; totals exclude
  the unknown values and display an incomplete-data message.
- Doctor commission is an estimate on billable appointment fees using the doctor's
  current flat/percentage setting. No historical rate snapshots or payout ledger
  exist, so this is not a historical commission settlement report.

These are appointment-based reports, not collection-date cash-flow statements.
Changing a doctor's commission setting changes the estimate on past appointments.
Overcollections are retained and flagged rather than silently capped.
