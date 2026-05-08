import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RefreshCw } from "lucide-react";
import { getAnalytics } from "../utils/api.js";

const CATEGORY_LABELS = {
  trade_licence: "Trade licence",
  property_tax: "Property tax",
  building_permit: "Building permit",
  utility: "Utilities",
  certificate: "Certificates",
  grievance: "Grievances",
  unknown: "Unknown",
};

const PIE_COLORS = ["#10B981", "#60A5FA", "#F59E0B", "#F472B6", "#A78BFA", "#22C55E", "#94A3B8"];

function pct(n) {
  return `${Math.round((n || 0) * 100)}%`;
}

function clamp01(x) {
  const v = Number(x);
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = async () => {
    setErr("");
    try {
      const d = await getAnalytics();
      setData(d);
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

  const topCategory = useMemo(() => {
    const first = data?.top_categories?.[0]?.category;
    return first || "unknown";
  }, [data]);

  const queriesToday = useMemo(() => {
    const buckets = data?.queries_by_hour || [];
    const today = new Date();
    const yyyyMmDd = today.toISOString().slice(0, 10);
    return buckets
      .filter((b) => (b.timestamp || "").startsWith(yyyyMmDd))
      .reduce((sum, b) => sum + (b.count || 0), 0);
  }, [data]);

  const categoryPieData = useMemo(() => {
    const top = data?.top_categories || [];
    if (!top.length) return [{ name: "No data", value: 1, category: "unknown" }];
    return top.map((c) => ({
      name: CATEGORY_LABELS[c.category] || c.category,
      value: c.count,
      category: c.category,
    }));
  }, [data]);

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

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-white/10 bg-navy-800/60 px-4 py-4">
            <div className="text-xs text-slateInk-400">Total queries</div>
            <div className="mt-1 text-2xl font-bold">{data?.total_queries ?? (loading ? "…" : 0)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-navy-800/60 px-4 py-4">
            <div className="text-xs text-slateInk-400">Unanswered rate</div>
            <div className="mt-1 text-2xl font-bold">{data ? pct(data.unanswered_rate) : (loading ? "…" : "0%")}</div>
            <div className="mt-2 h-2 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-2 rounded-full bg-amber-500"
                style={{ width: `${Math.round((data?.unanswered_rate || 0) * 100)}%` }}
              />
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-navy-800/60 px-4 py-4">
            <div className="text-xs text-slateInk-400">Top category</div>
            <div className="mt-1 text-xl font-bold">
              {CATEGORY_LABELS[topCategory] || topCategory}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-navy-800/60 px-4 py-4">
            <div className="text-xs text-slateInk-400">Queries today</div>
            <div className="mt-1 text-2xl font-bold">{loading ? "…" : queriesToday}</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-3 rounded-2xl border border-white/10 bg-navy-800/60 p-4">
            <div className="text-sm font-semibold">Queries by hour (last 24 hours)</div>
            <div className="mt-3 h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.queries_by_hour || []}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="hour" stroke="rgba(203,213,225,0.7)" tick={{ fontSize: 12 }} />
                  <YAxis stroke="rgba(203,213,225,0.7)" tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(15,23,42,0.95)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 12,
                      color: "white",
                    }}
                    cursor={{ fill: "rgba(16,185,129,0.08)" }}
                  />
                  <Bar dataKey="count" fill="#10B981" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-navy-800/60 p-4">
            <div className="text-sm font-semibold">Top categories (distribution)</div>
            <div className="mt-3 h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    contentStyle={{
                      background: "rgba(15,23,42,0.95)",
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 12,
                      color: "white",
                    }}
                  />
                  <Pie
                    data={categoryPieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={62}
                    outerRadius={92}
                    paddingAngle={2}
                  >
                    {categoryPieData.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {categoryPieData.slice(0, 5).map((c, idx) => (
                <div
                  key={c.category}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-navy-900/30 px-3 py-1.5 text-xs text-slateInk-300"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }}
                  />
                  {c.name}: <span className="font-mono text-white">{c.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-navy-800/60 p-4">
          <div className="text-sm font-semibold">Recent queries</div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-xs text-slateInk-400">
                  <th className="px-3 py-2">Query</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Confidence</th>
                  <th className="px-3 py-2">Escalated</th>
                  <th className="px-3 py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recent_queries || []).map((q, idx) => {
                  const conf = clamp01(q.confidence);
                  const confColor =
                    conf >= 0.75 ? "bg-emerald-500" : conf >= 0.45 ? "bg-amber-500" : "bg-red-500";
                  return (
                    <tr key={`${q.timestamp}-${idx}`} className="bg-navy-900/30 border border-white/10">
                      <td className="px-3 py-3 rounded-l-xl">
                        <div className="text-sm text-white line-clamp-2">{q.query_text}</div>
                        <div className="mt-1 text-[11px] text-slateInk-500">
                          Session: <span className="font-mono">{q.session_id?.slice(0, 8)}</span> · Lang:{" "}
                          <span className="font-mono">{q.language}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-full border border-white/10 bg-navy-800/70 px-2.5 py-1 text-xs text-slateInk-300">
                          {CATEGORY_LABELS[q.category] || q.category}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-40 h-2 rounded-full bg-white/5 overflow-hidden">
                            <div
                              className={`h-2 rounded-full ${confColor}`}
                              style={{ width: `${Math.round(conf * 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs text-white">{conf.toFixed(2)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {q.escalated ? (
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200">
                            Yes
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200">
                            No
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 rounded-r-xl text-xs text-slateInk-300 font-mono">
                        {formatTime(q.timestamp)}
                      </td>
                    </tr>
                  );
                })}
                {!loading && (data?.recent_queries || []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-slateInk-400">
                      No queries logged yet. Open the chat and ask a question to generate analytics.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

