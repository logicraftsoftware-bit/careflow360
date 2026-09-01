import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, PhoneCall, Search } from "lucide-react";
import { api, unwrap } from "../api";

const when = (value?: string) => value ? new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
const duration = (seconds?: number) => seconds === undefined || seconds === null ? "—" : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

export function CallLogsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [direction, setDirection] = useState("");
  const { data = { items: [], total: 0 }, isLoading, error } = useQuery({
    queryKey: ["knowlarity-calls", search, status, direction],
    queryFn: () => api.get("/integrations/knowlarity/calls", { params: { search: search || undefined, status: status || undefined, direction: direction || undefined } }).then(unwrap),
  });
  const exportCsv = () => {
    const rows = [["Call ID", "Caller", "Contact", "Direction", "Status", "Agent", "Started", "Duration", "Disposition"], ...data.items.map((x: any) => [x.externalId, x.callerNumber, x.patient?.name || x.lead?.name || "", x.direction, x.status, x.agentName || "", when(x.startedAt), x.durationSeconds ?? "", x.disposition || ""])];
    const csv = rows.map((row: any[]) => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = "knowlarity-call-logs.csv"; link.click(); URL.revokeObjectURL(link.href);
  };
  return <><div className="page-head"><div><span>IVR & CALL CENTRE</span><h1>Knowlarity Call Logs</h1><p>Incoming calls, recordings and CRM contact matching in one place.</p></div><button className="btn" onClick={exportCsv}><Download /> Export CSV</button></div><section className="panel table-panel"><div className="toolbar call-toolbar"><label className="search"><Search /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search phone, agent or call ID..." /></label><select value={direction} onChange={e => setDirection(e.target.value)}><option value="">All directions</option><option value="INBOUND">Inbound</option><option value="OUTBOUND">Outbound</option></select><select value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{["RINGING", "ANSWERED", "COMPLETED", "MISSED", "ABANDONED", "FAILED", "UNKNOWN"].map(x => <option key={x}>{x}</option>)}</select></div>{isLoading ? <div className="state">Loading call logs…</div> : error ? <div className="state error">Unable to load call logs.</div> : data.items.length ? <div className="table-wrap"><table><thead><tr><th>Caller</th><th>Matched contact</th><th>Direction</th><th>Status</th><th>Agent</th><th>Started</th><th>Duration</th><th>Recording</th></tr></thead><tbody>{data.items.map((call: any) => <tr key={call.id}><td><b>{call.callerNumber}</b><small className="cell-sub">{call.externalId}</small></td><td>{call.patient?.name || call.lead?.name || "Unmatched"}<small className="cell-sub">{call.patient?.patientNumber || call.lead?.leadNumber}</small></td><td>{call.direction}</td><td><span className={`call-badge ${call.status.toLowerCase()}`}>{call.status}</span></td><td>{call.agentName || "—"}</td><td>{when(call.startedAt || call.createdAt)}</td><td>{duration(call.durationSeconds)}</td><td>{call.recordingUrl ? <a className="recording-link" href={call.recordingUrl} target="_blank" rel="noreferrer"><ExternalLink size={15}/> Open</a> : "—"}</td></tr>)}</tbody></table></div> : <div className="empty"><PhoneCall /><h3>No Knowlarity calls yet</h3><p>Calls will appear after the webhook is configured in Knowlarity.</p></div>}<div className="call-total">{data.total} call{data.total === 1 ? "" : "s"}</div></section></>;
}
