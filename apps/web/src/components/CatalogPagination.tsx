import { useEffect, useState } from "react";
import "./CatalogPagination.css";

const PAGE_SIZE = 25;

export function useCatalogPagination<T>(rows: T[], resetKey: string, enabled: boolean) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  useEffect(() => setPage(1), [resetKey]);
  useEffect(() => setPage((previous) => Math.min(previous, totalPages)), [totalPages]);
  return {
    visibleRows: enabled ? rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE) : rows,
    pagination: enabled ? <CatalogPagination page={currentPage} total={rows.length} onChange={setPage}/> : null,
  };
}

function CatalogPagination({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return <nav className="pagination catalog-pagination" aria-label="Test list pagination">
    <span aria-live="polite">Showing {total ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, total)} of {total} tests</span>
    <div>
      <button type="button" disabled={page === 1} onClick={() => onChange(1)}>First</button>
      <button type="button" disabled={page === 1} onClick={() => onChange(page - 1)}>Previous</button>
      <span>Page {page} of {totalPages}</span>
      <button type="button" disabled={page === totalPages} onClick={() => onChange(page + 1)}>Next</button>
      <button type="button" disabled={page === totalPages} onClick={() => onChange(totalPages)}>Last</button>
    </div>
  </nav>;
}
