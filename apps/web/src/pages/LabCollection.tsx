import { useQuery } from "@tanstack/react-query";
import { FlaskConical, QrCode } from "lucide-react";
import { api, unwrap } from "../api";

export function LabCollectionPage({
  state,
}: {
  state: "assigned" | "collected" | "all";
}) {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const admin =
    user.isPlatform ||
    user.portal === "ADMIN" ||
    (user.roleCodes || []).some((code: string) =>
      ["SUPER_ADMIN", "CLINIC_ADMIN", "BRANCH_ADMIN", "MANAGER"].includes(code)
    );
  const { data, isLoading, error } = useQuery({
      queryKey: ["lab-collections", state],
      queryFn: () =>
        api.get(`/crm/lab-collections?state=${state}`).then(unwrap),
    }),
    items = data?.items || [],
    all = state === "all";
  const labels = async (item: any) => {
    try {
      const result = unwrap(
        await api.get(`/crm/lab-collections/${item.id}/labels`)
      );
      if (!result.specimens.length) {
        alert("This legacy order has no specimen labels.");
        return;
      }
      const popup = window.open("", "_blank");
      if (!popup) return;
      popup.document.write(
        `<html><head><title>${
          result.orderNumber
        } labels</title><style>body{font-family:Arial;display:flex;flex-wrap:wrap;gap:16px;padding:20px}.label{width:260px;border:2px solid #111;padding:12px;text-align:center;page-break-inside:avoid}.label img{width:180px}.label b,.label span{display:block;margin:4px}</style></head><body>${result.specimens
          .map(
            (x: any) =>
              `<div class="label"><b>${result.orderNumber}</b><img src="${
                x.qrDataUrl
              }"/><strong>${x.id}</strong><span>${x.tubeType} · ${
                x.sampleType
              }</span><span>${x.tests.join(", ")}</span></div>`
          )
          .join("")}</body></html>`
      );
      popup.document.close();
      setTimeout(() => popup.print(), 400);
    } catch (error: any) {
      alert(error?.response?.data?.message || "Unable to generate labels");
    }
  };
  return (
    <div>
      <div className="page-head">
        <div>
          <span>LAB COLLECTION</span>
          <h1>
            {state === "assigned"
              ? "Assigned Samples"
              : state === "collected"
              ? "Collected Samples"
              : "All Technician Data"}
          </h1>
          <p>
            {all
              ? "All assigned and collected samples across every lab technician."
              : state === "assigned"
              ? "Samples assigned to the logged-in lab technician."
              : "Completed sample collections and technician details."}
          </p>
        </div>
      </div>
      <section className="panel table-panel">
        {isLoading ? (
          <div className="state">Loading samples…</div>
        ) : error ? (
          <div className="state error">Unable to load sample assignments.</div>
        ) : items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Appointment</th>
                  <th>Patient</th>
                  <th>Tests</th>
                  <th>Technician</th>
                  <th>Status</th>
                  {admin && <th>Tube labels</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => (
                  <tr key={item.id}>
                    <td>
                      <b>{item.title}</b>
                    </td>
                    <td>{item.patient?.name || "—"}</td>
                    <td>{item.testNames || "—"}</td>
                    <td>{item.assignedTechnicianName || "—"}</td>
                    <td>
                      <span className="status-pill">
                        {item.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    {admin && <td>
                      <button
                        className="btn ghost"
                        onClick={() => labels(item)}
                      >
                        <QrCode /> {item.labelsGeneratedAt && item.specimens?.length ? "Reprint labels" : "Generate / print"}
                      </button>
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <FlaskConical />
            <p>No {state} samples found.</p>
          </div>
        )}
      </section>
    </div>
  );
}
