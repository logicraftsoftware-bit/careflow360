import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Barcode, FlaskConical, MapPin } from "lucide-react";
import { api, unwrap } from "../api";

export function LabCollectionPage({
  state,
}: {
  state: "assigned" | "collected" | "all";
}) {
  const [mapItem, setMapItem] = useState<any>(null);
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
    all = state === "all",
    canPrint = (item: any) => admin || (item.createdByTechnicianId === user.id && item.assignedTechnicianId === user.id),
    showLabelColumn = items.some(canPrint);
  const labels = async (item: any) => {
    try {
      const result = unwrap(
        await api.get(`/crm/lab-collections/${item.id}/labels`)
      );
      if (!result.specimens.length) {
        alert("This legacy order has no specimen labels.");
        return;
      }
      const html = `<html><head><title>${
          result.orderNumber
        } labels</title><style>@page{margin:8mm}body{font-family:Arial;display:flex;align-items:flex-start;flex-wrap:wrap;gap:10px;padding:10px}.label{width:340px;border:1px solid #111;padding:12px;text-align:center;page-break-inside:avoid}.label img{display:block;width:310px;height:105px;object-fit:contain;margin:7px auto}.label b,.label span{display:block;margin:3px;font-size:12px}.label strong{font-size:11px}</style></head><body>${result.specimens
          .map(
            (x: any) =>
              `<div class="label"><b>${result.orderNumber}</b><img src="${
                x.barcodeDataUrl
              }"/><strong>${x.id}</strong><span>${x.tubeType} · ${
                x.sampleType
              }</span><span>${x.tests.join(", ")}</span></div>`
          )
          .join("")}</body></html>`;
      if ((window as any).ReactNativeWebView) {
        (window as any).ReactNativeWebView.postMessage(JSON.stringify({ type: "PRINT_HTML", html }));
        return;
      }
      const popup = window.open("", "_blank");
      if (!popup) return;
      popup.document.write(html);
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
                  {admin && <th>Live journey</th>}
                  {showLabelColumn && <th>Tube labels</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => (
                  <tr key={item.id}>
                    <td>
                      <b>{item.title}</b>
                    </td>
                    {admin && <td>
                      {item.technicianLocation ? <button className="btn ghost" onClick={() => setMapItem(item)}>
                        <MapPin /> View map
                      </button> : <span>Not started</span>}
                    </td>}
                    <td>{item.patient?.name || "—"}</td>
                    <td>{item.testNames || "—"}</td>
                    <td>{item.assignedTechnicianName || "—"}</td>
                    <td>
                      <span className="status-pill">
                        {item.status.replaceAll("_", " ")}
                      </span>
                    </td>
                    {showLabelColumn && <td>
                      {canPrint(item) && <button
                        className="btn ghost"
                        onClick={() => labels(item)}
                      >
                        <Barcode /> {item.labelsGeneratedAt && item.specimens?.length ? "Regenerate / print" : "Generate / print"}
                      </button>}
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
      {mapItem?.technicianLocation && <section className="panel" style={{ marginTop: 16 }}>
        <div className="page-head"><div><span>LIVE TECHNICIAN JOURNEY</span><h2>{mapItem.assignedTechnicianName}</h2><p>{mapItem.journeyLocations?.length || 1} location points recorded · last update {new Date(mapItem.technicianLocation.capturedAt).toLocaleString("en-IN")}</p></div><button className="btn ghost" onClick={() => setMapItem(null)}>Close map</button></div>
        <iframe title={`${mapItem.assignedTechnicianName} live location`} style={{ width: "100%", height: 420, border: 0, borderRadius: 14 }} src={`https://www.openstreetmap.org/export/embed.html?bbox=${mapItem.technicianLocation.longitude - .01}%2C${mapItem.technicianLocation.latitude - .01}%2C${mapItem.technicianLocation.longitude + .01}%2C${mapItem.technicianLocation.latitude + .01}&layer=mapnik&marker=${mapItem.technicianLocation.latitude}%2C${mapItem.technicianLocation.longitude}`} />
        <a className="btn" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${mapItem.technicianLocation.latitude},${mapItem.technicianLocation.longitude}`}>Open roadmap</a>
      </section>}
    </div>
  );
}
