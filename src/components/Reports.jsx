import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    AreaChart, Area,
} from 'recharts'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import './Reports.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = supabaseUrl && supabaseKey && supabaseUrl.startsWith('https://')
    ? createClient(supabaseUrl, supabaseKey)
    : null

/* ── Fallback demo data ─────────────────────────────────────── */
const MONTHS = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb']

const demoShipments = MONTHS.map((m, i) => ({
    month: m,
    shipments: [28, 42, 37, 55, 61, 49, 66][i],
    revenue: [84000, 126000, 111000, 165000, 183000, 147000, 198000][i],
}))

const demoStatus = [
    { name: 'Delivered', value: 47, color: '#22c55e' },
    { name: 'In Transit', value: 28, color: '#6366f1' },
    { name: 'Processing', value: 14, color: '#f59e0b' },
    { name: 'Cancelled', value: 7, color: '#ef4444' },
    { name: 'On Hold', value: 4, color: '#94a3b8' },
]

const demoJobTypes = MONTHS.map((m, i) => ({
    month: m,
    Air: [12, 18, 14, 22, 27, 19, 25][i],
    Sea: [10, 16, 15, 21, 24, 20, 29][i],
    Road: [6, 8, 8, 12, 10, 10, 12][i],
}))

const demoTopCustomers = [
    { rank: 1, name: 'Apex Global Exports', shipments: 34, revenue: 102000, trend: '+12%' },
    { rank: 2, name: 'BlueSky Imports Ltd.', shipments: 28, revenue: 84000, trend: '+8%' },
    { rank: 3, name: 'Meridian Logistics', shipments: 21, revenue: 63000, trend: '+5%' },
    { rank: 4, name: 'Crescent Traders', shipments: 17, revenue: 51000, trend: '-2%' },
    { rank: 5, name: 'NovaTex Industries', shipments: 13, revenue: 39000, trend: '+1%' },
]

const demoKPIs = {
    totalShipments: 338,
    totalRevenue: 914000,
    avgDeliveryDays: 4.2,
    onTimeRate: 91.4,
}

/* ── Status colour map ──────────────────────────────────────── */
const STATUS_COLORS = {
    delivered: '#22c55e',
    completed: '#22c55e',
    'in transit': '#6366f1',
    'in_transit': '#6366f1',
    processing: '#f59e0b',
    pending: '#f59e0b',
    open: '#f59e0b',
    cancelled: '#ef4444',
    canceled: '#ef4444',
    'on hold': '#94a3b8',
    on_hold: '#94a3b8',
    draft: '#64748b',
}
const statusColor = (name) =>
    STATUS_COLORS[(name || '').toLowerCase()] ??
    `hsl(${(name?.charCodeAt(0) ?? 0) * 47 % 360},65%,55%)`

/* ── Custom tooltip ─────────────────────────────────────────── */
const ChartTooltip = ({ active, payload, label, prefix = '', suffix = '' }) => {
    if (!active || !payload?.length) return null
    return (
        <div className="rp-tooltip">
            <p className="rp-tooltip-label">{label}</p>
            {payload.map(p => (
                <p key={p.dataKey} style={{ color: p.color }}>
                    {p.name}: {prefix}{typeof p.value === 'number' && p.value > 999
                        ? p.value.toLocaleString() : p.value}{suffix}
                </p>
            ))}
        </div>
    )
}

/* ── Custom legend ── */
const DonutLegend = ({ data }) => (
    <div className="rp-donut-legend">
        {data.map(d => (
            <div key={d.name} className="rp-donut-legend-item">
                <span className="rp-donut-dot" style={{ background: d.color }} />
                <span className="rp-donut-name">{d.name}</span>
                <span className="rp-donut-val">{d.value}%</span>
            </div>
        ))}
    </div>
)

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
const Reports = () => {
    const pageRef = useRef(null)
    const [pdfLoading, setPdfLoading] = useState(false)
    const [period, setPeriod] = useState('7m')
    const [loading, setLoading] = useState(false)
    const [kpis, setKpis] = useState(demoKPIs)
    const [shipmentData, setShipmentData] = useState(demoShipments)
    const [statusData, setStatusData] = useState(demoStatus)
    const [jobTypeData, setJobTypeData] = useState(demoJobTypes)
    const [topCustomers, setTopCustomers] = useState(demoTopCustomers)

    /* ── PDF export ── */
    const downloadPDF = async () => {
        if (!pageRef.current) return
        setPdfLoading(true)
        try {
            const canvas = await html2canvas(pageRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#0f1117',
                logging: false,
            })
            const imgW = 210  // A4 width mm
            const imgH = (canvas.height * imgW) / canvas.width
            const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
            let y = 0
            const pageH = 297  // A4 height mm
            while (y < imgH) {
                if (y > 0) pdf.addPage()
                pdf.addImage(
                    canvas.toDataURL('image/png'),
                    'PNG', 0, -y, imgW, imgH
                )
                y += pageH
            }
            const date = new Date().toISOString().split('T')[0]
            pdf.save(`freight-report-${date}.pdf`)
        } catch (err) {
            console.error('PDF export error:', err)
        }
        setPdfLoading(false)
    }

    /* ── Period → months back ── */
    const periodMonths = period === '3m' ? 3 : period === '1y' ? 12 : 7

    /* ── Live fetch from Supabase ── */
    useEffect(() => {
        if (!supabase) return
        setLoading(true)

        const fetchAll = async () => {
            try {
                /* ─ Date boundary ─ */
                const since = new Date()
                since.setMonth(since.getMonth() - periodMonths)
                const sinceStr = since.toISOString().split('T')[0]

                /* ── 1. KPIs: total jobs + revenue + avg delivery ── */
                const { data: kpiRows } = await supabase
                    .from('jobs')
                    .select('id, invoice_value, eta, etd')
                    .gte('job_date', sinceStr)

                if (kpiRows) {
                    const totalShipments = kpiRows.length
                    const totalRevenue = kpiRows.reduce((s, r) => s + (r.invoice_value || 0), 0)

                    const withDays = kpiRows.filter(r => r.eta && r.etd)
                    const avgDeliveryDays = withDays.length
                        ? +(withDays.reduce((s, r) => {
                            const diff = (new Date(r.eta) - new Date(r.etd)) / 86400000
                            return s + Math.abs(diff)
                        }, 0) / withDays.length).toFixed(1)
                        : demoKPIs.avgDeliveryDays

                    setKpis({ totalShipments, totalRevenue, avgDeliveryDays, onTimeRate: demoKPIs.onTimeRate })
                }

                /* ── 2. Monthly volume + revenue ── */
                const { data: monthly } = await supabase
                    .from('v_monthly_stats')
                    .select('month, shipments, revenue')
                    .order('month_date', { ascending: true })
                    .limit(periodMonths)

                if (monthly?.length) {
                    setShipmentData(monthly.map(r => ({
                        month: r.month,
                        shipments: Number(r.shipments),
                        revenue: Number(r.revenue),
                    })))
                }

                /* ── 3. Status distribution ── */
                const { data: statuses } = await supabase
                    .from('v_status_distribution')
                    .select('name, value')

                if (statuses?.length) {
                    setStatusData(statuses.map(r => ({
                        name: r.name,
                        value: Number(r.value),
                        color: statusColor(r.name),
                    })))
                }

                /* ── 4. Jobs by type monthly ── */
                const { data: byType } = await supabase
                    .from('v_jobs_by_type')
                    .select('month, Air, Sea, Road')
                    .order('month_date', { ascending: true })
                    .limit(periodMonths)

                if (byType?.length) {
                    setJobTypeData(byType.map(r => ({
                        month: r.month,
                        Air: Number(r.Air),
                        Sea: Number(r.Sea),
                        Road: Number(r.Road),
                    })))
                }

                /* ── 5. Top clients ── */
                const { data: clients } = await supabase
                    .from('v_top_clients')
                    .select('rank, name, shipments, revenue')
                    .limit(5)

                if (clients?.length) {
                    setTopCustomers(clients.map(r => ({
                        rank: Number(r.rank),
                        name: r.name,
                        shipments: Number(r.shipments),
                        revenue: Number(r.revenue),
                        trend: '—',
                    })))
                }

            } catch (err) {
                console.error('Reports fetch error:', err)
            }
            setLoading(false)
        }

        fetchAll()
    }, [period, periodMonths])

    const fmtRevenue = v => v >= 1000000
        ? `$${(v / 1000000).toFixed(1)}M`
        : `$${(v / 1000).toFixed(0)}K`

    return (
        <div className="rp-page page-container" ref={pageRef}>

            {/* ── Header ── */}
            <div className="rp-header">
                <div>
                    <h1 className="rp-title">Reports &amp; Analytics</h1>
                    <p className="rp-subtitle">Freight performance overview · Last {period === '3m' ? '3 months' : period === '1y' ? '12 months' : '7 months'}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button
                        className="rp-tab"
                        onClick={downloadPDF}
                        disabled={pdfLoading}
                        style={{
                            background: pdfLoading ? 'var(--border)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                            color: '#fff',
                            border: 'none',
                            cursor: pdfLoading ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                        }}
                    >
                        {pdfLoading ? '⏳ Exporting…' : '⬇ Download PDF'}
                    </button>
                    <div className="rp-period-tabs">
                        {['3m', '7m', '1y'].map(p => (
                            <button
                                key={p}
                                className={`rp-tab ${period === p ? 'active' : ''}`}
                                onClick={() => setPeriod(p)}
                            >
                                {p === '3m' ? '3 Months' : p === '7m' ? '7 Months' : '1 Year'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── KPI Cards ── */}
            <div className="rp-kpi-grid">
                <KPICard
                    label="Total Jobs" value={kpis.totalShipments.toLocaleString()}
                    icon={<ShipIcon />} color="blue" trend="+14%"
                />
                <KPICard
                    label="Total Revenue" value={fmtRevenue(kpis.totalRevenue)}
                    icon={<RevenueIcon />} color="green" trend="+22%"
                />
                <KPICard
                    label="Avg. Transit Days" value={`${kpis.avgDeliveryDays}d`}
                    icon={<ClockIcon />} color="amber" trend="-0.3d"
                />
                <KPICard
                    label="On-Time Rate" value={`${kpis.onTimeRate}%`}
                    icon={<CheckIcon />} color="teal" trend="+2.1%"
                />
            </div>

            {/* ── Row 1: Area chart + Donut ── */}
            <div className="rp-row">

                {/* Job Volume — area chart */}
                <div className="rp-card rp-card-lg">
                    <div className="rp-card-head">
                        <div>
                            <h3 className="rp-card-title">Job Volume</h3>
                            <p className="rp-card-sub">Monthly jobs over time</p>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={shipmentData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                            <defs>
                                <linearGradient id="shipGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip content={<ChartTooltip suffix=" jobs" />} />
                            <Area type="monotone" dataKey="shipments" name="Jobs" stroke="#6366f1" strokeWidth={2.5}
                                fill="url(#shipGrad)" dot={{ r: 4, fill: '#6366f1', strokeWidth: 0 }}
                                activeDot={{ r: 6, fill: '#818cf8', strokeWidth: 0 }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Status Distribution — donut */}
                <div className="rp-card rp-card-sm">
                    <div className="rp-card-head">
                        <div>
                            <h3 className="rp-card-title">Job Status</h3>
                            <p className="rp-card-sub">Current distribution</p>
                        </div>
                    </div>
                    <div className="rp-donut-wrap">
                        <ResponsiveContainer width="100%" height={180}>
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%" cy="50%"
                                    innerRadius={52} outerRadius={80}
                                    paddingAngle={3}
                                    dataKey="value"
                                    startAngle={90} endAngle={-270}
                                >
                                    {statusData.map((d, i) => (
                                        <Cell key={i} fill={d.color} stroke="none" />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(v) => `${v}%`} contentStyle={{
                                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                                    borderRadius: 8, fontSize: 12, color: 'var(--text-primary)',
                                }} />
                            </PieChart>
                        </ResponsiveContainer>
                        <DonutLegend data={statusData} />
                    </div>
                </div>
            </div>

            {/* ── Row 2: Revenue bar + Job type stacked bar ── */}
            <div className="rp-row">

                {/* Revenue bar chart */}
                <div className="rp-card rp-card-md">
                    <div className="rp-card-head">
                        <div>
                            <h3 className="rp-card-title">Revenue</h3>
                            <p className="rp-card-sub">Monthly invoice value (USD)</p>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={shipmentData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} barSize={18}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false}
                                tickFormatter={v => `$${v / 1000}K`} />
                            <Tooltip content={<ChartTooltip prefix="$" />} formatter={v => [`$${(v / 1000).toFixed(0)}K`, 'Revenue']} />
                            <Bar dataKey="revenue" name="Revenue" radius={[6, 6, 0, 0]}>
                                {shipmentData.map((_, i) => (
                                    <Cell key={i} fill={`url(#revGrad${i})`} />
                                ))}
                            </Bar>
                            <defs>
                                {shipmentData.map((_, i) => (
                                    <linearGradient key={i} id={`revGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#22d3ee" />
                                        <stop offset="100%" stopColor="#0891b2" />
                                    </linearGradient>
                                ))}
                            </defs>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Job type stacked bar */}
                <div className="rp-card rp-card-md">
                    <div className="rp-card-head">
                        <div>
                            <h3 className="rp-card-title">Jobs by Mode</h3>
                            <p className="rp-card-sub">Air · Sea · Road</p>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={jobTypeData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} barSize={18}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                            <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{
                                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                                borderRadius: 8, fontSize: 12, color: 'var(--text-primary)',
                            }} />
                            <Legend iconType="circle" iconSize={8}
                                formatter={v => <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{v}</span>} />
                            <Bar dataKey="Air" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="Sea" stackId="a" fill="#0ea5e9" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="Road" stackId="a" fill="#10b981" radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* ── Row 3: Top Customers table ── */}
            <div className="rp-card" style={{ marginBottom: 0 }}>
                <div className="rp-card-head">
                    <div>
                        <h3 className="rp-card-title">Top Clients</h3>
                        <p className="rp-card-sub">Ranked by job volume this period</p>
                    </div>
                </div>
                <div className="rp-table-wrap">
                    <table className="rp-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Client</th>
                                <th>Jobs</th>
                                <th>Revenue</th>
                                <th>Trend</th>
                            </tr>
                        </thead>
                        <tbody>
                            {topCustomers.map(c => (
                                <tr key={c.rank}>
                                    <td className="rp-rank">{c.rank}</td>
                                    <td className="rp-customer-name">{c.name}</td>
                                    <td>{c.shipments}</td>
                                    <td>${c.revenue.toLocaleString()}</td>
                                    <td>
                                        <span className={`rp-trend ${c.trend.startsWith('+') ? 'up' : c.trend === '—' ? '' : 'down'}`}>
                                            {c.trend}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {loading && <div className="rp-loading-overlay"><div className="rp-spinner" /></div>}
        </div>
    )
}

/* ── KPI Card ── */
const KPICard = ({ label, value, icon, color, trend }) => {
    const up = trend?.startsWith('+') || trend?.startsWith('-0') || trend?.startsWith('-0.')
    return (
        <div className={`rp-kpi rp-kpi-${color}`}>
            <div className="rp-kpi-icon">{icon}</div>
            <div className="rp-kpi-body">
                <p className="rp-kpi-label">{label}</p>
                <p className="rp-kpi-value">{value}</p>
            </div>
            {trend && (
                <span className={`rp-kpi-trend ${color === 'amber' && trend.startsWith('-') ? 'up' : trend.startsWith('+') ? 'up' : 'down'}`}>
                    {trend}
                </span>
            )}
        </div>
    )
}

/* ── Tiny icons ── */
const ShipIcon = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21l-8-4-8 4V5l8-4 8 4zM12 3.56L6 6.5V17.5l6-3 6 3V6.5z" /></svg>
const RevenueIcon = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" /></svg>
const ClockIcon = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm.5 5H11v6l5.2 3.2.8-1.3-4.5-2.7V7z" /></svg>
const CheckIcon = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>

export default Reports
