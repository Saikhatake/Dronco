import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie, Cell, ResponsiveContainer,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine
} from 'recharts';
import {
  Activity, FileText, TrendingUp,
  AlertTriangle, Heart, BarChart2, RefreshCw
} from 'lucide-react';
import { PredictionAPI, ReportAPI } from './utils/api';

// ─── Exact field names matching app.py → SessionDB.save_prediction ───────────
//
//  MongoDB prediction doc shape:
//  {
//    created_at: <ISOString>,
//    prediction: { risk_level, probability, recommendations[] },
//    input_data: {
//      Age, BMI, Glucose, Insulin, HOMA, Leptin,
//      Adiponectin, Resistin, "MCP.1",
//      smoking_status, alcohol_units, exercise_hours,
//      diet_quality, family_history
//    }
//  }
//
//  MongoDB report doc shape:
//  { id, summary, created_at }

const C = {
  primary:   '#db2777',
  secondary: '#9333ea',
  success:   '#16a34a',
  warning:   '#d97706',
  danger:    '#dc2626',
  info:      '#0284c7',
  muted:     '#94a3b8',
  low:       '#22c55e',
  medium:    '#f59e0b',
  high:      '#ef4444',
};

const PIE_COLORS = [C.low, C.medium, C.high];

function riskColor(level = '') {
  const l = level.toLowerCase();
  if (l.includes('high'))   return C.high;
  if (l.includes('medium')) return C.medium;
  if (l.includes('low'))    return C.low;
  return C.muted;
}

function fmt(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

function n(val) {
  const v = parseFloat(val);
  return isNaN(v) ? 0 : v;
}

// ── Shared components ─────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100 flex items-start gap-4 hover:shadow-lg transition-shadow">
      <div className="rounded-xl p-3" style={{ background: `${color}20` }}>
        <Icon className="w-6 h-6" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-gray-800 mt-0.5">{value ?? '—'}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl shadow-md border border-gray-100 p-5 ${className}`}>
      <div className="mb-4">
        <h3 className="font-bold text-gray-800 text-base">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function EmptyChart({ msg = 'No data yet — run a prediction first.' }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-300">
      <BarChart2 className="w-10 h-10 mb-2" />
      <p className="text-sm text-gray-400 text-center">{msg}</p>
    </div>
  );
}

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-sm min-w-[140px]">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5" style={{ color: p.color }}>
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          {p.name}:
          <span className="font-bold ml-auto pl-2">
            {typeof p.value === 'number' ? +p.value.toFixed(2) : p.value}
          </span>
        </p>
      ))}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard({ user }) {
  const [predictions, setPredictions] = useState([]);
  const [reports,     setReports]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshedAt, setRefreshedAt] = useState(new Date());

  // Live fetch from MongoDB via FastAPI
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [preds, repsRes] = await Promise.all([
        PredictionAPI.history(),   // GET /api/predictions/history
        ReportAPI.history(),       // GET /api/reports/history
      ]);
      setPredictions(Array.isArray(preds) ? preds : []);
      setReports(repsRes?.reports || []);
      setRefreshedAt(new Date());
    } catch (err) {
      console.error('Dashboard data error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Derived data from MongoDB documents ─────────────────────────────────────

  const total    = predictions.length;
  const highRisk = predictions.filter(p => p.prediction?.risk_level === 'High Risk').length;
  const medRisk  = predictions.filter(p => p.prediction?.risk_level === 'Medium Risk').length;
  const lowRisk  = predictions.filter(p => p.prediction?.risk_level === 'Low Risk').length;
  const avgProb  = total
    ? +(predictions.reduce((s, p) => s + n(p.prediction?.probability), 0) / total * 100).toFixed(1)
    : 0;

  const latest     = total ? predictions[total - 1] : null;
  const latestRisk = latest?.prediction?.risk_level || 'None yet';
  const latestProb = latest ? +(n(latest.prediction?.probability) * 100).toFixed(1) : null;

  // 1. Area chart — probability per prediction
  const probTrend = predictions.map((p, i) => ({
    label: fmt(p.created_at) || `#${i + 1}`,
    prob:  +(n(p.prediction?.probability) * 100).toFixed(1),
  }));

  // 2. Donut — risk level distribution
  const riskDist = [
    { name: 'Low Risk',    value: lowRisk  },
    { name: 'Medium Risk', value: medRisk  },
    { name: 'High Risk',   value: highRisk },
  ].filter(d => d.value > 0);

  // 3. Dual line — Glucose & BMI  (input_data.Glucose, input_data.BMI)
  const glucoseBMI = predictions.map((p, i) => ({
    label:   fmt(p.created_at) || `#${i + 1}`,
    Glucose: n(p.input_data?.Glucose),
    BMI:     n(p.input_data?.BMI),
  }));

  // 4. Dual line — Insulin & HOMA  (input_data.Insulin, input_data.HOMA)
  const insulinHOMA = predictions.map((p, i) => ({
    label:   fmt(p.created_at) || `#${i + 1}`,
    Insulin: n(p.input_data?.Insulin),
    HOMA:    n(p.input_data?.HOMA),
  }));

  // 5. Bar — biomarker averages across all predictions
  const BM = ['Glucose', 'BMI', 'Insulin', 'HOMA', 'Leptin', 'Adiponectin', 'Resistin'];
  const bioAvg = BM.map(key => {
    const vals = predictions.map(p => n(p.input_data?.[key])).filter(v => v > 0);
    return {
      name: key,
      avg:  vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : 0,
    };
  });

  // 6. Radar — latest prediction biomarkers (normalised 0-100)
  const radarData = latest ? [
    { subject: 'Glucose',     A: Math.min(n(latest.input_data?.Glucose)     / 3,   100) },
    { subject: 'BMI',         A: Math.min(n(latest.input_data?.BMI)         * 2,   100) },
    { subject: 'Insulin',     A: Math.min(n(latest.input_data?.Insulin),           100) },
    { subject: 'Leptin',      A: Math.min(n(latest.input_data?.Leptin),            100) },
    { subject: 'Resistin',    A: Math.min(n(latest.input_data?.Resistin),          100) },
    { subject: 'Adiponectin', A: Math.min(n(latest.input_data?.Adiponectin) * 3,   100) },
    { subject: 'HOMA',        A: Math.min(n(latest.input_data?.HOMA)        * 10,  100) },
  ] : [];

  // 7. Bar — monthly prediction volume (from created_at)
  const monthMap = {};
  predictions.forEach(p => {
    const k = new Date(p.created_at).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    monthMap[k] = (monthMap[k] || 0) + 1;
  });
  const monthlyVol = Object.entries(monthMap).map(([month, count]) => ({ month, count }));

  // 8. Bar — lifestyle averages (diet_quality, exercise_hours, alcohol_units)
  const avg = key => total
    ? +(predictions.reduce((s, p) => s + n(p.input_data?.[key]), 0) / total).toFixed(1)
    : 0;
  const lifestyle = [
    { name: 'Diet Quality',  avg: avg('diet_quality'),   color: C.success },
    { name: 'Exercise Hrs',  avg: avg('exercise_hours'), color: C.info    },
    { name: 'Alcohol Units', avg: avg('alcohol_units'),  color: C.danger  },
  ];

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">
            Welcome back, {user?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'User'} 👋
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Live analytics · refreshed {refreshedAt.toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={loadData} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200
                     text-gray-600 rounded-xl text-sm hover:bg-gray-50 shadow-sm transition disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Activity}      label="Total Predictions" value={total}          color={C.primary}   sub="All time" />
        <StatCard icon={AlertTriangle} label="High Risk Cases"   value={highRisk}       color={C.danger}    sub={`${total ? ((highRisk/total)*100).toFixed(0) : 0}% of total`} />
        <StatCard icon={TrendingUp}    label="Avg Risk Score"    value={`${avgProb}%`}  color={C.warning}   sub="Mean probability" />
        <StatCard icon={FileText}      label="Reports Analyzed"  value={reports.length} color={C.secondary} sub="Uploaded reports" />
      </div>

      {/* Latest Result Banner */}
      {latest && (
        <div
          className="rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 text-white shadow-lg"
          style={{ background: `linear-gradient(135deg, ${riskColor(latestRisk)}, ${riskColor(latestRisk)}bb)` }}
        >
          <div className="flex items-center gap-3">
            <Heart className="w-8 h-8 opacity-80" />
            <div>
              <p className="text-sm opacity-80">Latest Assessment</p>
              <p className="text-2xl font-bold">{latestRisk}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm opacity-80">Cancer Probability</p>
            <p className="text-4xl font-black">{latestProb}%</p>
          </div>
          <div className="text-right">
            <p className="text-sm opacity-80">Age / BMI</p>
            <p className="text-lg font-semibold">
              {n(latest.input_data?.Age)} yrs &nbsp;|&nbsp; {n(latest.input_data?.BMI)} BMI
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm opacity-80">Recorded</p>
            <p className="text-lg font-semibold">{fmt(latest.created_at)}</p>
          </div>
        </div>
      )}

      {/* Row 1 — Probability Trend + Risk Donut */}
      <div className="grid lg:grid-cols-3 gap-4">

        <ChartCard
          title="Risk Probability Over Time"
          subtitle="prediction.probability per MongoDB document"
          className="lg:col-span-2"
        >
          {probTrend.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={probTrend} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="probGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.primary} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={C.primary} stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip content={<Tip />} />
                <ReferenceLine y={50} stroke={C.warning} strokeDasharray="4 2"
                  label={{ value: '50% threshold', position: 'insideTopRight', fontSize: 10, fill: C.warning }} />
                <Area type="monotone" dataKey="prob" name="Risk %"
                  stroke={C.primary} strokeWidth={2.5} fill="url(#probGrad)"
                  dot={{ fill: C.primary, r: 4 }} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Risk Distribution" subtitle="prediction.risk_level counts">
          {riskDist.length === 0 ? <EmptyChart /> : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={riskDist} cx="50%" cy="50%"
                    innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                    {riskDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % 3]} />)}
                  </Pie>
                  <Tooltip formatter={(v, name) => [`${v} cases`, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {riskDist.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ background: PIE_COLORS[i % 3] }} />
                      <span className="text-gray-600">{d.name}</span>
                    </div>
                    <span className="font-bold text-gray-800">
                      {d.value}
                      <span className="text-gray-400 font-normal text-xs ml-1">
                        ({total ? ((d.value / total) * 100).toFixed(0) : 0}%)
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </ChartCard>
      </div>

      {/* Row 2 — Glucose & BMI + Insulin & HOMA */}
      <div className="grid lg:grid-cols-2 gap-4">

        <ChartCard title="Glucose & BMI Trends" subtitle="input_data.Glucose + input_data.BMI">
          {glucoseBMI.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={glucoseBMI} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip content={<Tip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="l" type="monotone" dataKey="Glucose" name="Glucose (mg/dL)"
                  stroke={C.danger} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line yAxisId="r" type="monotone" dataKey="BMI" name="BMI"
                  stroke={C.info} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} strokeDasharray="5 3" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Insulin & HOMA Trends" subtitle="input_data.Insulin + input_data.HOMA">
          {insulinHOMA.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={insulinHOMA} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip content={<Tip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="l" type="monotone" dataKey="Insulin" name="Insulin (µU/mL)"
                  stroke={C.secondary} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line yAxisId="r" type="monotone" dataKey="HOMA" name="HOMA-IR"
                  stroke={C.warning} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} strokeDasharray="5 3" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Row 3 — Radar + Biomarker Averages */}
      <div className="grid lg:grid-cols-2 gap-4">

        <ChartCard
          title="Latest Biomarker Radar"
          subtitle={latest ? `Prediction on ${fmt(latest.created_at)} — values normalised to 0-100` : 'No data'}
        >
          {radarData.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: '#64748b' }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                <Radar name="Level" dataKey="A"
                  stroke={C.primary} fill={C.primary} fillOpacity={0.25} strokeWidth={2} />
                <Tooltip formatter={(v) => [`${v.toFixed(1)} (normalised)`, 'Level']} />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Average Biomarker Levels" subtitle="Mean across all prediction records in MongoDB">
          {bioAvg.every(b => b.avg === 0) ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={bioAvg} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip content={<Tip />} />
                <Bar dataKey="avg" name="Average" radius={[6, 6, 0, 0]}>
                  {bioAvg.map((_, i) => (
                    <Cell key={i} fill={`hsl(${270 + i * 20}, 65%, 58%)`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Row 4 — Monthly Volume */}
      <div className="grid lg:grid-cols-1 gap-4">

        <ChartCard title="Monthly Prediction Volume" subtitle="Predictions grouped by created_at month">
          {monthlyVol.length === 0 ? <EmptyChart /> : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyVol} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={C.secondary} />
                    <stop offset="100%" stopColor={C.primary}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip content={<Tip />} />
                <Bar dataKey="count" name="Predictions" fill="url(#volGrad)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

      </div>

    </div>
  );
}
