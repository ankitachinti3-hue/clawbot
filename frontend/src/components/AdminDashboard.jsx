import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import {
  acknowledgeSilencePattern,
  getAnalytics,
  getCivicTwin,
  getCollectiveGrievances,
  getCorruptionSignals,
  getInfrastructureMemory,
  getOfficerAccountability,
  getReckoningReport,
  getRightsAlerts,
  getSilencePatterns,
  resolveCorruptionSignal,
} from "../utils/api.js";

function formatTime(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [corruption, setCorruption] = useState([]);
  const [officerData, setOfficerData] = useState([]);
  const [collectiveData, setCollectiveData] = useState([]);
  const [infraData, setInfraData] = useState([]);
  const [silenceData, setSilenceData] = useState([]);
  const [rightsData, setRightsData] = useState([]);
  const [civicTwin, setCivicTwin] = useState(null);
  const [reckoning, setReckoning] = useState(null);
  const [tab, setTab] = useState("analytics");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const tabs = [
    "analytics",
    "corruption signals",
    "officer accountability",
    "collective grievances",
    "infrastructure memory",
    "silence patterns",
    "community wisdom",
    "rights alerts",
    "civic twin",
    "reckoning report",
  ];

  const load = async () => {
    setErr("");
    try {
      const [a, c, o, g, i, s, r, twin, rec] = await Promise.all([
        getAnalytics(),
        getCorruptionSignals(),
        getOfficerAccountability(),
        getCollectiveGrievances(),
        getInfrastructureMemory(),
        getSilencePatterns(),
        getRightsAlerts(),
        getCivicTwin(),
        getReckoningReport(),
      ]);
      setAnalytics(a);
      setCorruption(c.items || []);
      setOfficerData(o.services || []);
      setCollectiveData(g.items || []);
      setInfraData(i.items || []);
      setSilenceData(s.items || []);
      setRightsData(r.items || []);
      setCivicTwin(twin);
      setReckoning(rec);
    } catch (e) {
      setErr(e?.message || "Failed to fetch analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = window.setInterval(load, 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const corruptionSummary = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const thisWeek = corruption.filter((x) => new Date(x.timestamp).getTime() >= weekAgo);
    const deptMap = {};
    const wardMap = {};
    thisWeek.forEach((x) => {
      deptMap[x.department || "Unknown"] = (deptMap[x.department || "Unknown"] || 0) + 1;
      wardMap[x.ward_number || "Unknown"] = (wardMap[x.ward_number || "Unknown"] || 0) + 1;
    });
    const topDept = Object.entries(deptMap).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
    const topWard = Object.entries(wardMap).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
    return { total: thisWeek.length, topDept, topWard };
  }, [corruption]);

  return (
    <div className="w-full h-[100dvh] overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-4 py-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-2xl font-bold tracking-tight">Admin analytics</div>
            <div className="text-sm text-slateInk-400">
              Live usage metrics (auto-refresh every 30s)
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-navy-800/60 hover:bg-navy-800/90 px-3 py-2 text-sm text-white"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <Link
              to="/"
              className="rounded-xl border border-white/10 bg-navy-800/60 hover:bg-navy-800/90 px-3 py-2 text-sm text-white"
            >
              ← Back to Chat
            </Link>
          </div>
        </div>

        {err ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">
            {err}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1.5 text-xs border ${tab === t ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-200" : "bg-navy-800/60 border-white/10 text-slateInk-300"}`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "analytics" ? (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-white/10 bg-navy-800/60 px-4 py-4">
              <div className="text-xs text-slateInk-400">Total queries</div>
              <div className="mt-1 text-2xl font-bold">{analytics?.total_queries ?? (loading ? "…" : 0)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-navy-800/60 px-4 py-4">
              <div className="text-xs text-slateInk-400">Unanswered rate</div>
              <div className="mt-1 text-2xl font-bold">{Math.round((analytics?.unanswered_rate || 0) * 100)}%</div>
            </div>
          </div>
        ) : null}

        {tab === "corruption signals" ? (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-white/10 bg-navy-800/60 px-4 py-4"><div className="text-xs text-slateInk-400">Signals this week</div><div className="text-2xl font-bold">{corruptionSummary.total}</div></div>
              <div className="rounded-2xl border border-white/10 bg-navy-800/60 px-4 py-4"><div className="text-xs text-slateInk-400">Most affected department</div><div className="text-xl font-bold">{corruptionSummary.topDept}</div></div>
              <div className="rounded-2xl border border-white/10 bg-navy-800/60 px-4 py-4"><div className="text-xs text-slateInk-400">Most affected ward</div><div className="text-xl font-bold">{corruptionSummary.topWard}</div></div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-navy-800/60 p-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-slateInk-400 text-xs"><th className="text-left">Timestamp</th><th className="text-left">Ward</th><th className="text-left">Department</th><th className="text-left">Query</th><th className="text-left">Strength</th><th /></tr></thead>
                <tbody>
                  {corruption.map((row) => (
                    <tr key={row.id} className={`${row.resolved ? "opacity-50" : ""} border-t border-white/5`}>
                      <td>{formatTime(row.timestamp)}</td><td>{row.ward_number || "-"}</td><td>{row.department || "-"}</td><td className="max-w-[380px] truncate">{row.query_text}</td>
                      <td>
                        <span className={`px-2 py-1 rounded-full text-xs ${row.signal_strength === "high" ? "bg-red-500/20 text-red-300" : row.signal_strength === "medium" ? "bg-orange-500/20 text-orange-300" : "bg-yellow-500/20 text-yellow-200"}`}>{String(row.signal_strength || "").toUpperCase()}</span>
                      </td>
                      <td>{!row.resolved ? <button onClick={async () => { await resolveCorruptionSignal(row.id); load(); }} className="text-xs rounded-lg border border-white/10 px-2 py-1">Mark Resolved</button> : "Resolved"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "officer accountability" ? <SimpleTable title="Sakala services" rows={officerData} columns={["service_name", "department", "responsible_officer", "sakala_timeline_days", "penalty_per_day", "escalation_count"]} /> : null}
        {tab === "collective grievances" ? <SimpleTable title="Collective grievances" rows={collectiveData} columns={["ward_number", "issue_type", "complaint_count", "first_reported", "status", "assigned_engineer"]} pulseColumn="complaint_count" /> : null}
        {tab === "infrastructure memory" ? <SimpleTable title="Infrastructure memory" rows={infraData} columns={["ward_number", "issue_type", "reported_count", "status", "assigned_engineer", "expected_resolution"]} /> : null}
        {tab === "silence patterns" ? (
          <div className="mt-6 space-y-3">
            {silenceData.map((s) => (
              <div key={s.id} className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                Ward {s.ward_number} - {s.issue_type} complaints dropped from {Math.round(s.previous_avg)} to {s.current_count}. Silence does not mean resolution.
                {!s.acknowledged ? <button className="ml-3 rounded-lg border border-white/20 px-2 py-1 text-xs" onClick={async () => { await acknowledgeSilencePattern(s.id); load(); }}>Acknowledge</button> : <span className="ml-3 text-xs">Acknowledged</span>}
              </div>
            ))}
          </div>
        ) : null}
        {tab === "community wisdom" ? <div className="mt-6 rounded-2xl border border-white/10 bg-navy-800/60 p-4 text-sm text-slateInk-300">Community wisdom moderation is available via backend routes and `/wisdom` page.</div> : null}
        {tab === "rights alerts" ? <SimpleTable title="Rights alerts" rows={rightsData} columns={["article", "right_name", "ward_number", "query_text", "timestamp"]} /> : null}
        {tab === "civic twin" ? (
          <div className="mt-6">
            <div className="rounded-2xl border border-white/10 bg-navy-800/60 p-4 mb-3">City health score: <span className="font-bold">{civicTwin?.city_health_score ?? "-"}</span></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(civicTwin?.wards || []).map((w) => (
                <div key={w.ward_number} className={`rounded-2xl border p-3 ${w.health_score > 70 ? "border-green-500/40" : w.health_score >= 40 ? "border-yellow-500/40" : "border-red-500/40"}`}>
                  <div className="text-xs text-slateInk-400">{w.ward_name}</div>
                  <div className="text-xl font-bold">{w.health_score}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {tab === "reckoning report" ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-navy-800/60 p-4">
            <div className="text-xs text-slateInk-400">Severity</div>
            <div className="text-xl font-bold">{reckoning?.report?.severity_rating}</div>
            <div className="mt-2 text-lg font-semibold">{reckoning?.report?.headline}</div>
            <div className="mt-3 text-sm text-slateInk-300 whitespace-pre-wrap">{reckoning?.report?.full_report_text}</div>
            <div className="mt-3 text-xs text-slateInk-400">Email to Commissioner action currently logs only.</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SimpleTable({ title, rows, columns, pulseColumn }) {
  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-navy-800/60 p-4 overflow-x-auto">
      <div className="text-sm font-semibold mb-3">{title}</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-slateInk-400 text-xs">{columns.map((c) => <th key={c} className="text-left">{c}</th>)}</tr>
        </thead>
        <tbody>
          {(rows || []).map((r, i) => (
            <tr key={i} className="border-t border-white/5">
              {columns.map((c) => {
                const v = r[c];
                const pulse = pulseColumn === c && Number(v) > 20;
                return <td key={c} className={pulse ? "text-red-300 animate-pulse" : ""}>{String(v ?? "-")}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

