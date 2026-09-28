# Import the supplied test list

The production deployment runs this import after the original catalog reset.
It writes a completion marker only after all rows pass database verification;
failed imports fail the deployment and can be retried. Later deployments skip
the completed import so subsequent manual catalog edits remain intact. Production
reports and backups are in `apps/api/.maintenance` (the npm workspace directory).

The prepared data in `apps/api/scripts/data/test-list-2026-09-25.json` contains all
3,403 rows from `test_list.xls` (SHA-256
`19a8b1dcf5dbb4a195e68c60717856cc904a4ad5d8f45331d441fc74afd07c6c`).

Run from the repository root with the server's existing `.env` available:

```sh
npx tsx apps/api/scripts/import-test-list.ts
npx tsx apps/api/scripts/import-test-list.ts --apply
```

The first command validates without accessing the database. Optionally set
`TEST_LIST_ORIGINAL` to the original file path to verify both the checksum and
every parsed table cell against the prepared data. The second command imports
into the uniquely named `MEDICITY GUWAHATI` tenant; `TEST_IMPORT_TENANT` can select
another explicitly intended tenant.

The importer creates missing Department documents and catalog categories. Blank
departments become `No Department` (595 rows). The seven imaging departments go
into radiology (1,231 rows); other departments go into the laboratory catalog
(2,172 rows). Original department names, test names, IDs and prices are retained.
The 35 blank test names receive `Unnamed test — <source ID>` display titles and
are flagged with `needsNameReview`; no clinical details are invented.

Before writing, it saves existing departments and catalog records in the ignored
`.maintenance` directory. Creation and full row verification use one transaction.
Source checksum and source ID prevent duplicates when rerunning the import.
Existing records are preserved. Any existing imported row that differs from the
source causes verification to fail and the transaction to roll back.

The final report is written to `.maintenance/test-import-report-<tenant-id>.json`
after successful verification. The application audit log also records counts.
