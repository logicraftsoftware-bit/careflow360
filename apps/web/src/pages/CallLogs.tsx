import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Clock3,
  Download,
  ExternalLink,
  FileText,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Search,
  Users,
} from "lucide-react";
import { api, unwrap } from "../api";
import "./CallLogs.css";
const when = (v?: string) =>
  v
    ? new Date(v).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
const duration = (s = 0) => {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60;
  return h ? h + "h " + m + "m " + sec + "s" : m + "m " + sec + "s";
};
const isoDay = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};
const percent = (value: number, total: number) =>
  total ? Math.round((value * 1000) / total) / 10 : 0;
function Donut({ segments, total, centerLabel }: { segments: { value: number; color: string }[]; total: number; centerLabel: string }) {
  let cursor = 0;
  const stops = segments.map((segment) => {
    const start = cursor;
    cursor += percent(segment.value, total);
    return `${segment.color} ${start}% ${cursor}%`;
  }).join(",");
  return <div className="analytics-donut" style={{ background: total ? `conic-gradient(${stops})` : "#e2e8f0" }}><div><b>{total}</b><small>{centerLabel}</small></div></div>;
}
function rangeFor(preset: string) {
  const now = new Date(),
    start = new Date(now),
    end = new Date(now);
  if (preset === "YESTERDAY") {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  } else if (preset === "WEEK") start.setDate(start.getDate() - 6);
  else if (preset === "MONTH") start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start: isoDay(start), end: isoDay(end) };
}
export function CallLogsPage() {
  const sessionUser = JSON.parse(localStorage.getItem("user") || "{}"),
    staffPortal = sessionUser.portal === "STAFF";
  const initial = rangeFor("TODAY"),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [direction, setDirection] = useState(""),
    [agentId, setAgentId] = useState(""),
    [number, setNumber] = useState(""),
    [exporting, setExporting] = useState<"csv" | "pdf" | "">(""),
    [preset, setPreset] = useState("TODAY"),
    [start, setStart] = useState(initial.start),
    [end, setEnd] = useState(initial.end);
  const startDate = new Date(start + "T00:00:00").toISOString(),
    endDate = new Date(end + "T23:59:59.999").toISOString();
  const { data: profile } = useQuery({
      queryKey: ["telecmi-me"],
      queryFn: () => api.get("/integrations/telecmi/me").then(unwrap),
    }),
    { data: agentData } = useQuery({
      queryKey: ["telecmi-users"],
      queryFn: () => api.get("/integrations/telecmi/users").then(unwrap),
      enabled: Boolean(profile?.isAdmin),
    }),
    {
      data = { items: [], total: 0, analytics: {} },
      isLoading,
      error,
    } = useQuery({
      queryKey: [
        "telecmi-calls",
        search,
        status,
        direction,
        agentId,
        start,
        end,
      ],
      queryFn: () =>
        api
          .get("/integrations/telecmi/calls", {
            params: {
              search: search || undefined,
              status: status || undefined,
              direction: direction || undefined,
              agentId: agentId || undefined,
              startDate,
              endDate,
            },
          })
          .then(unwrap),
      refetchInterval: 15000,
    });
  const call = useMutation({
      mutationFn: () =>
        api.post("/integrations/telecmi/make-call", { to: number }),
      onSuccess: () => setNumber(""),
    }),
    a: any = data.analytics || {},
    hours: any[] = a.byHour || [],
    maxHour = Math.max(1, ...hours.map((x) => x.total));
  const choose = (value: string) => {
    setPreset(value);
    const range = rangeFor(value);
    setStart(range.start);
    setEnd(range.end);
  };
  const exportParams = {
    search: search || undefined,
    status: status || undefined,
    direction: direction || undefined,
    agentId: agentId || undefined,
    startDate,
    endDate,
    page: 1,
    limit: 5000,
  };
  const loadExportData = () =>
    api
      .get("/integrations/telecmi/calls", { params: exportParams })
      .then(unwrap);
  const exportCsv = async () => {
    setExporting("csv");
    try {
      const report = await loadExportData();
    const rows = [
        [
          "Call ID",
          "Caller",
          "Contact",
          "Direction",
          "Status",
          "Agent",
          "Started",
          "Duration",
          "Disposition",
        ],
        ...report.items.map((x: any) => [
          x.externalId,
          x.callerNumber,
          x.patient?.name || x.lead?.name || "",
          x.direction,
          x.status,
          x.agentName || "",
          when(x.startedAt),
          x.durationSeconds ?? "",
          x.disposition || "",
        ]),
      ],
      csv = rows
        .map((r: any[]) =>
          r.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(",")
        )
        .join("\n"),
      link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
    );
    link.download = "telecmi-calls-" + start + "-to-" + end + ".csv";
    link.click();
    URL.revokeObjectURL(link.href);
    } finally {
      setExporting("");
    }
  };
  const exportPdf = async () => {
    setExporting("pdf");
    try {
      const [report, { jsPDF }, { default: autoTable }] = await Promise.all([
          loadExportData(),
          import("jspdf"),
          import("jspdf-autotable"),
        ]),
        analytics = report.analytics || {},
        selectedAgent = (agentData?.items || []).find(
          (x: any) => x.id === agentId
        ),
        filterText = [
          `${start} to ${end}`,
          direction || "All directions",
          status || "All statuses",
          selectedAgent?.name || "All TeleCMI users",
          search ? `Search: ${search}` : "",
        ]
          .filter(Boolean)
          .join(" | "),
        document = new jsPDF({ orientation: "landscape" });
      document.setFontSize(17);
      document.text("TeleCMI Call Report", 14, 16);
      document.setFontSize(9);
      document.setTextColor(80);
      document.text(filterText, 14, 23);
      document.setTextColor(0);
      document.text(
        `Total: ${analytics.totalCalls || 0}   Answered: ${analytics.answered || 0}   Missed: ${analytics.missed || 0}   Incoming: ${analytics.received || 0}   Outgoing: ${analytics.outgoing || 0}   Talk time: ${duration(analytics.totalDurationSeconds)}`,
        14,
        30
      );
      autoTable(document, {
        startY: 36,
        head: [[
          "Call ID",
          "Caller",
          "Contact",
          "Direction",
          "Status",
          "Agent",
          "Started",
          "Duration",
          "Disposition",
        ]],
        body: report.items.map((x: any) => [
          x.externalId || "",
          x.callerNumber || "",
          x.patient?.name || x.lead?.name || "Unmatched",
          x.direction,
          x.status,
          x.agentName || "",
          when(x.startedAt),
          duration(x.durationSeconds),
          x.disposition || "",
        ]),
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [15, 118, 110] },
      });
      document.save("telecmi-calls-" + start + "-to-" + end + ".pdf");
    } finally {
      setExporting("");
    }
  };
  const openRecording = async (url: string) => {
    if (/^https?:\/\//.test(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    const response = await api.get(url, { responseType: "blob" }),
      objectUrl = URL.createObjectURL(response.data);
    window.open(objectUrl, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  };
  const cards = [
    [a.totalCalls || 0, "Total Calls", PhoneCall, "blue"],
    [a.answered || 0, "Answered Calls", PhoneIncoming, "green"],
    [a.missed || 0, "Missed Calls", PhoneMissed, "red"],
    [a.received || 0, "Received Calls", PhoneIncoming, "purple"],
    [a.outgoing || 0, "Outgoing Calls", PhoneOutgoing, "orange"],
    [duration(a.totalDurationSeconds), "Total Call Time", Clock3, "sky"],
    [duration(a.averageDurationSeconds), "Average Call Time", Clock3, "violet"],
  ];
  return (
    <>
      <div className="page-head">
        <div>
          <span>IVR &amp; CALL CENTRE</span>
          <h1>{staffPortal ? "My TeleCMI Calls" : "TeleCMI Call Dashboard"}</h1>
          <p>
            {staffPortal
              ? "Inbound calls, outbound calls and dialer for your assigned TeleCMI user."
              : profile?.agentName
              ? "Showing only " +
                profile.agentName +
                (profile.extension ? " (Ext. " + profile.extension + ")" : "") +
                "."
              : "Clinic-wide call analytics, productivity and detailed call history."}
          </p>
        </div>
        <div className="call-export-actions">
          <button className="btn ghost" onClick={exportCsv} disabled={Boolean(exporting)}>
            <Download />
            {exporting === "csv" ? "Exporting..." : "Export CSV"}
          </button>
          <button className="btn" onClick={exportPdf} disabled={Boolean(exporting)}>
            <FileText />
            {exporting === "pdf" ? "Exporting..." : "Export PDF"}
          </button>
        </div>
      </div>
      <section className="panel call-filter-panel">
        <div className="call-filter-top">
          <div className="call-presets">
            {["TODAY", "YESTERDAY", "WEEK", "MONTH"].map((x) => (
              <button
                key={x}
                className={preset === x ? "active" : ""}
                onClick={() => choose(x)}
              >
                {x}
              </button>
            ))}
          </div>
          <label>
            From
            <input
              type="date"
              value={start}
              onChange={(e) => {
                setPreset("CUSTOM");
                setStart(e.target.value);
              }}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={end}
              min={start}
              onChange={(e) => {
                setPreset("CUSTOM");
                setEnd(e.target.value);
              }}
            />
          </label>
          <span>{a.answerRate || 0}% answer rate</span>
        </div>
        <div className="call-filter-bottom">
          <label className="search">
            <Search />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search phone, agent or call ID..."
            />
          </label>
          {profile?.isAdmin && (
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              <option value="">All TeleCMI users</option>
              {(agentData?.items || []).map((x: any) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                  {x.extension ? " · Ext. " + x.extension : ""}
                </option>
              ))}
            </select>
          )}
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
          >
            <option value="">All directions</option>
            <option value="INBOUND">Inbound</option>
            <option value="OUTBOUND">Outbound</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {[
              "ANSWERED",
              "COMPLETED",
              "MISSED",
              "ABANDONED",
              "FAILED",
              "RINGING",
              "UNKNOWN",
            ].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </section>
      {(
        <>
          <div className="call-analytics-heading"><div className="call-analytics-icon"><PhoneCall /></div><div><h2>Call Analytics</h2><p>{staffPortal ? "Your real-time communication performance" : "Real-time insights into your clinic communication"}</p></div><span><i /> Live Data</span></div>
          <section className="call-metrics">
            {cards.map(([value, label, Icon, tone]: any) => (
              <article className={`metric-${tone}`} key={label}>
                <Icon />
                <div>
                  <small>{label}</small>
                  <b>{value}</b>
                  <em>{typeof value === "number" && a.totalCalls ? `${percent(value, a.totalCalls)}% of filtered calls` : "Filtered result"}</em>
                </div>
              </article>
            ))}
          </section>
          <section className="call-overview-grid">
            <article className="analytics-card call-overview"><div className="analytics-title"><h3>Call Overview</h3><p>Distribution of all filtered calls</p></div><div className="overview-body"><Donut total={a.totalCalls || 0} centerLabel="Total Calls" segments={[{ value: a.incomingAnswered || 0, color: "#18b77a" }, { value: a.incomingMissed || 0, color: "#fb4056" }, { value: a.outgoingAnswered || 0, color: "#2484e8" }, { value: a.outgoingMissed || 0, color: "#ff9f1c" }]} /><div className="analytics-legend">{[["Incoming Answered", a.incomingAnswered, "green"], ["Incoming Missed", a.incomingMissed, "red"], ["Outgoing Answered", a.outgoingAnswered, "blue"], ["Outgoing Missed", a.outgoingMissed, "orange"]].map(([label, value, tone]: any) => <div key={label}><i className={tone} /><span>{label}</span><b>{value || 0}</b><small>{percent(value || 0, a.totalCalls || 0)}%</small></div>)}</div></div></article>
            <article className="analytics-card answer-gauge"><div className="analytics-title"><h3>Answered vs Missed Calls</h3><p>Overall performance</p></div><div className="gauge" style={{ "--rate": `${Math.min(100, a.answerRate || 0) * 1.8}deg` } as any}><div><b>{a.answerRate || 0}%</b><small>Answer Rate</small></div></div><div className="gauge-numbers"><span><i className="green" /><b>{a.answered || 0}</b><small>Answered</small></span><span><i className="red" /><b>{a.missed || 0}</b><small>Missed</small></span></div></article>
            <article className="analytics-card direction-donut"><div className="analytics-title"><h3>Incoming vs Outgoing Calls</h3><p>Call type distribution</p></div><div className="overview-body"><Donut total={a.totalCalls || 0} centerLabel="Total Calls" segments={[{ value: a.received || 0, color: "#2468c9" }, { value: a.outgoing || 0, color: "#49adf5" }]} /><div className="analytics-legend compact"><div><i className="deep-blue" /><span>Incoming Calls</span><b>{a.received || 0}</b><small>{percent(a.received || 0, a.totalCalls || 0)}%</small></div><div><i className="sky" /><span>Outgoing Calls</span><b>{a.outgoing || 0}</b><small>{percent(a.outgoing || 0, a.totalCalls || 0)}%</small></div></div></div></article>
          </section>
          <section className="call-analytics-grid">
            <article className="panel">
              <div className="panel-head">
                <h3>Calls by hour</h3>
                <span>Answered and missed</span>
              </div>
              <div className="call-hour-chart">
                {hours.map((x) => (
                  <div
                    key={x.hour}
                    title={x.hour + ":00 · " + x.total + " calls"}
                  >
                    <span className="hour-stack">
                      <i className="hour-missed" style={{ height: `${(x.missed / maxHour) * 100}%` }} />
                      <i className="hour-answered" style={{ height: `${(x.answered / maxHour) * 100}%` }} />
                    </span>
                    <small>{x.hour}</small>
                  </div>
                ))}
              </div>
            </article>
            <article className="panel call-breakdown">
              <h3>Call breakdown</h3>
              <div>
                <span>
                  Incoming answered<b>{a.incomingAnswered || 0}</b>
                </span>
                <span>
                  Incoming missed<b>{a.incomingMissed || 0}</b>
                </span>
                <span>
                  Outgoing answered<b>{a.outgoingAnswered || 0}</b>
                </span>
                <span>
                  Outgoing missed<b>{a.outgoingMissed || 0}</b>
                </span>
              </div>
            </article>
          </section>
          <section className="analytics-card detailed-numbers"><div className="analytics-title"><h3>Detailed Call Numbers</h3><p>Exact numbers with colour indication</p></div><div>{[["Incoming Answered", a.incomingAnswered, PhoneIncoming, "green"], ["Incoming Missed", a.incomingMissed, PhoneMissed, "red"], ["Outgoing Answered", a.outgoingAnswered, PhoneOutgoing, "blue"], ["Outgoing Missed", a.outgoingMissed, PhoneOutgoing, "orange"]].map(([label, value, Icon, tone]: any) => <article className={tone} key={label}><Icon /><span><small>{label}</small><b>{value || 0}</b></span></article>)}</div></section>
          {(a.byAgent || []).length > 0 && (
            <section className="panel table-panel call-productivity">
              <div className="call-section-head productivity-head">
                <div><span><Users /></span><div><h3>{staffPortal ? "My productivity" : "Agent productivity"}</h3><p>Call performance summary {staffPortal ? "for your account" : "for all agents"}</p></div></div>
                <b><Users /> {a.byAgent?.length || 0} agent{a.byAgent?.length === 1 ? "" : "s"}</b>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Agent</th>
                      <th>Total Calls</th>
                      <th>Inbound Answered</th>
                      <th>Inbound Missed</th>
                      <th>Outbound Answered</th>
                      <th>Outbound Missed</th>
                      <th>Talk Time</th>
                      <th>Answered Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(a.byAgent || []).map((x: any, index: number) => {
                      const answeredTotal=x.inboundAnswered+x.outboundAnswered,rate=x.total?Math.round(answeredTotal*100/x.total):0;
                      return (
                      <tr key={x.id}>
                        <td>{index+1}</td>
                        <td><div className={`agent-avatar tone-${index%5}`}>{String(x.name||"U").split(/\s+/).map((part:string)=>part[0]).join("").slice(0,2).toUpperCase()}</div><span className="agent-cell">
                          <b>{x.name}</b>
                          <small className="cell-sub">{x.id}</small>
                        </span></td>
                        <td>{x.total}</td>
                        <td><span className="metric-cell green-cell">{x.inboundAnswered}</span></td>
                        <td><span className="metric-cell red-cell">{x.inboundMissed}</span></td>
                        <td><span className="metric-cell purple-cell">{x.outboundAnswered}</span></td>
                        <td><span className="metric-cell orange-cell">{x.outboundMissed}</span></td>
                        <td>{duration(x.durationSeconds)}</td>
                        <td><div className={`rate-cell ${rate<50?"low":rate<75?"medium":""}`}><b>{rate}%</b><span><i style={{width:`${rate}%`}}/></span></div></td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
      {profile?.canCall && !staffPortal && (
        <section className="panel call-dialer">
          <form
            className="toolbar call-toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              call.mutate();
            }}
          >
            <label className="search">
              <PhoneCall />
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="Enter phone number to call"
                required
                minLength={7}
              />
            </label>
            <button className="btn" disabled={call.isPending}>
              {call.isPending ? "Connecting…" : "Call as " + profile.agentName}
            </button>
          </form>
          {call.isSuccess && (
            <div className="alert success">
              TeleCMI is calling your registered mobile. Answer it to connect
              the customer.
            </div>
          )}
          {call.error && (
            <div className="alert error">
              {(call.error as any).response?.data?.message ||
                "Unable to start call"}
            </div>
          )}
        </section>
      )}
      <section className="panel table-panel call-records">
        <div className="call-section-head caller-head"><div><span><PhoneCall /></span><div><h3>Caller</h3><p>Detailed call logs and caller information</p></div></div></div>
        <div className="toolbar call-toolbar">
          <label className="search">
            <Search />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search phone, agent or call ID..."
            />
          </label>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
          >
            <option value="">All directions</option>
            <option value="INBOUND">Inbound</option>
            <option value="OUTBOUND">Outbound</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {[
              "RINGING",
              "ANSWERED",
              "COMPLETED",
              "MISSED",
              "ABANDONED",
              "FAILED",
              "UNKNOWN",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        {isLoading ? (
          <div className="state">Loading TeleCMI calls…</div>
        ) : error ? (
          <div className="state error">
            {(error as any).response?.data?.message ||
              "Unable to load TeleCMI call logs."}
          </div>
        ) : data.items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Caller</th>
                  <th>Matched contact</th>
                  <th>Direction</th>
                  <th>Status</th>
                  <th>Agent</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Recording</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((x: any,index:number) => (
                  <tr key={x.id}>
                    <td>{index+1}</td>
                    <td>
                      <b>{x.callerNumber}</b>
                      <small className="cell-sub">{x.externalId}</small>
                    </td>
                    <td>
                      <span className={`contact-badge ${x.patient||x.lead?"matched":"unmatched"}`}>{x.patient?.name || x.lead?.name || "Unmatched"}</span>
                      <small className="cell-sub">
                        {x.patient?.patientNumber || x.lead?.leadNumber}
                      </small>
                    </td>
                    <td><span className={`direction-badge ${x.direction.toLowerCase()}`}>{x.direction==="INBOUND"?<PhoneIncoming/>:<PhoneOutgoing/>}{x.direction}</span></td>
                    <td>
                      <span className={"call-badge " + x.status.toLowerCase()}>
                        {x.status}
                      </span>
                    </td>
                    <td>{x.agentName || "—"}</td>
                    <td>{when(x.startedAt || x.createdAt)}</td>
                    <td>{duration(x.durationSeconds)}</td>
                    <td>
                      {x.recordingUrl ? (
                        <button
                          type="button"
                          className="recording-link"
                          onClick={() => openRecording(x.recordingUrl)}
                        >
                          <ExternalLink size={15} />
                          Open
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <PhoneCall />
            <h3>No TeleCMI calls in this period</h3>
            <p>Select another date range to view call activity.</p>
          </div>
        )}
        <div className="call-total">
          Showing {data.items.length ? 1 : 0} to {Math.min(data.items.length,data.total)} of {data.total} call{data.total === 1 ? "" : "s"}
        </div>
      </section>
    </>
  );
}
