import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import './ShipmentTracking.css';

/* ─── Status config ─────────────────────────────────── */
const STATUS_STEPS = [
    { key: 'Booked', label: 'Booked', icon: '📋' },
    { key: 'In Transit', label: 'In Transit', icon: '🚢' },
    { key: 'At Port', label: 'At Port', icon: '⚓' },
    { key: 'Customs', label: 'Customs Clearance', icon: '🛃' },
    { key: 'Out for Delivery', label: 'Out for Delivery', icon: '🚛' },
    { key: 'Delivered', label: 'Delivered', icon: '✅' },
];

const STATUS_COLORS = {
    'Booked': '#6366f1',
    'In Transit': '#0ea5e9',
    'At Port': '#f59e0b',
    'Customs': '#f97316',
    'Out for Delivery': '#8b5cf6',
    'Delivered': '#22c55e',
    'Cancelled': '#ef4444',
};

/* Port → approximate coordinates for geo marker */
const PORT_COORDS = {
    'DELHI': [28.6139, 77.2090], 'DEL': [28.6139, 77.2090],
    'MUMBAI': [18.9388, 72.8354], 'BOM': [18.9388, 72.8354],
    'CHENNAI': [13.0827, 80.2707], 'MAA': [13.0827, 80.2707],
    'KOLKATA': [22.5726, 88.3639], 'CCU': [22.5726, 88.3639],
    'NHAVA SHEVA': [18.9388, 72.9354], 'JNPT': [18.9388, 72.9354],
    'SINGAPORE': [1.3521, 103.8198], 'SIN': [1.3521, 103.8198],
    'DUBAI': [25.2048, 55.2708], 'DXB': [25.2048, 55.2708],
    'SHANGHAI': [31.2304, 121.4737], 'SHA': [31.2304, 121.4737],
    'HONG KONG': [22.3193, 114.1694], 'HKG': [22.3193, 114.1694],
    'NEW YORK': [40.7128, -74.0060], 'JFK': [40.7128, -74.0060],
    'LOS ANGELES': [33.9425, -118.4081], 'LAX': [33.9425, -118.4081],
    'LONDON': [51.5074, -0.1278], 'LHR': [51.5074, -0.1278],
    'HAMBURG': [53.5488, 9.9872], 'HAM': [53.5488, 9.9872],
};

function getCoords(portName) {
    if (!portName) return null;
    const upper = portName.toUpperCase().trim();
    for (const [key, coords] of Object.entries(PORT_COORDS)) {
        if (upper.includes(key)) return coords;
    }
    return null;
}

/* ─── Map component (Leaflet via CDN, no npm) ────────── */
function ShipmentMap({ origin, destination, status }) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);

    const originCoords = getCoords(origin);
    const destCoords = getCoords(destination);

    useEffect(() => {
        if (!window.L) return; // Leaflet not loaded yet
        if (mapInstanceRef.current) {
            mapInstanceRef.current.remove();
            mapInstanceRef.current = null;
        }
        if (!mapRef.current) return;

        const center = originCoords || destCoords || [20.5937, 78.9629];
        const map = window.L.map(mapRef.current, { zoomControl: true }).setView(center, 4);
        mapInstanceRef.current = map;

        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
            maxZoom: 18,
        }).addTo(map);

        const makeIcon = (emoji, color) => window.L.divIcon({
            html: `<div style="font-size:22px;display:flex;align-items:center;justify-content:center;
             width:36px;height:36px;background:${color};border-radius:50%;border:3px solid #fff;
             box-shadow:0 2px 8px rgba(0,0,0,.4)">${emoji}</div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            className: '',
        });

        if (originCoords) {
            window.L.marker(originCoords, { icon: makeIcon('🔵', '#3b82f6') })
                .addTo(map)
                .bindPopup(`<b>Origin</b><br>${origin}`)
                .openPopup();
        }

        if (destCoords) {
            const destColor = STATUS_COLORS[status] || '#6366f1';
            window.L.marker(destCoords, { icon: makeIcon('📍', destColor) })
                .addTo(map)
                .bindPopup(`<b>Destination</b><br>${destination}`);
        }

        if (originCoords && destCoords) {
            window.L.polyline([originCoords, destCoords], {
                color: STATUS_COLORS[status] || '#6366f1',
                weight: 2.5,
                dashArray: '6 4',
                opacity: 0.8,
            }).addTo(map);

            const bounds = window.L.latLngBounds([originCoords, destCoords]);
            map.fitBounds(bounds, { padding: [40, 40] });
        }

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, [origin, destination, status, originCoords, destCoords]);

    if (!originCoords && !destCoords) {
        return (
            <div className="st-map-placeholder">
                <div className="st-map-placeholder-content">
                    <span className="st-map-placeholder-icon">🗺️</span>
                    <p>Port coordinates not available for this route</p>
                    <small>{origin} → {destination}</small>
                </div>
            </div>
        );
    }

    return <div ref={mapRef} className="st-map-container" />;
}

/* ─── Status Timeline ────────────────────────────────── */
function StatusTimeline({ currentStatus, updates }) {
    const currentIdx = STATUS_STEPS.findIndex(s => s.key === currentStatus);

    return (
        <div className="st-timeline">
            {STATUS_STEPS.map((step, idx) => {
                const isCompleted = idx < currentIdx;
                const isCurrent = idx === currentIdx;
                const isPending = idx > currentIdx;
                return (
                    <div key={step.key} className={`st-timeline-step ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''} ${isPending ? 'pending' : ''}`}>
                        <div className="st-timeline-icon">
                            <span>{step.icon}</span>
                        </div>
                        <div className="st-timeline-content">
                            <span className="st-timeline-label">{step.label}</span>
                            {isCurrent && <span className="st-timeline-badge">Current</span>}
                        </div>
                        {idx < STATUS_STEPS.length - 1 && (
                            <div className={`st-timeline-connector ${isCompleted || isCurrent ? 'active' : ''}`} />
                        )}
                    </div>
                );
            })}

            {/* Actual DB updates */}
            {updates && updates.length > 0 && (
                <div className="st-update-log">
                    <h4>Update History</h4>
                    {updates.map((u, i) => (
                        <div key={i} className="st-update-entry">
                            <span className="st-update-dot" style={{ background: STATUS_COLORS[u.status] || '#6366f1' }} />
                            <div>
                                <strong>{u.status}</strong>
                                <p>{u.remarks}</p>
                                <small>{new Date(u.created_at).toLocaleString()}</small>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ─── Status Update Form ─────────────────────────────── */
function StatusUpdateForm({ shipment, onUpdated }) {
    const [form, setForm] = useState({
        status: shipment.status || '',
        location: '',
        remarks: '',
        estimated_arrival: '',
    });
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');

    const handleChange = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

    const handleSubmit = async e => {
        e.preventDefault();
        if (!form.status) return;
        setSaving(true);
        setMsg('');
        try {
            // 1. Insert into shipment_updates
            const { error: updErr } = await supabase
                .from('shipment_updates')
                .insert([{
                    shipment_id: shipment.id,
                    status: form.status,
                    location: form.location || null,
                    remarks: form.remarks || null,
                    estimated_arrival: form.estimated_arrival || null,
                }]);
            if (updErr) throw updErr;

            // 2. Update master status on shipments table
            const { error: shipErr } = await supabase
                .from('shipments')
                .update({
                    status: form.status,
                    current_location: form.location || null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', shipment.id);
            if (shipErr) throw shipErr;

            setMsg('✅ Status updated successfully!');
            setForm(p => ({ ...p, location: '', remarks: '', estimated_arrival: '' }));
            setTimeout(() => { onUpdated(); setMsg(''); }, 1200);
        } catch (err) {
            setMsg('❌ ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form className="st-update-form" onSubmit={handleSubmit}>
            <h3 className="st-section-title">📡 Update Shipment Status</h3>
            <div className="st-form-grid">
                <div className="st-form-group">
                    <label>New Status *</label>
                    <select name="status" value={form.status} onChange={handleChange} required>
                        <option value="">Select status…</option>
                        {STATUS_STEPS.map(s => <option key={s.key}>{s.key}</option>)}
                        <option value="Cancelled">Cancelled</option>
                    </select>
                </div>
                <div className="st-form-group">
                    <label>Current Location</label>
                    <input name="location" value={form.location} onChange={handleChange}
                        placeholder="e.g. Mumbai Port / JNPT Gate 3" />
                </div>
                <div className="st-form-group">
                    <label>Estimated Arrival</label>
                    <input type="date" name="estimated_arrival" value={form.estimated_arrival} onChange={handleChange} />
                </div>
                <div className="st-form-group st-form-group--full">
                    <label>Remarks / Notes</label>
                    <textarea name="remarks" value={form.remarks} onChange={handleChange}
                        rows={2} placeholder="Add tracking notes or comments…" />
                </div>
            </div>
            {msg && <div className={`st-msg ${msg.startsWith('✅') ? 'st-msg--ok' : 'st-msg--err'}`}>{msg}</div>}
            <button type="submit" className="st-btn-update" disabled={saving}>
                {saving ? 'Saving…' : '✅ Save Update'}
            </button>
        </form>
    );
}

/* ─── Shipment Detail Panel ─────────────────────────── */
function ShipmentDetail({ shipment, onBack, onRefresh }) {
    const [updates, setUpdates] = useState([]);
    const [loadingUpdates, setLoadingUpdates] = useState(true);

    const fetchUpdates = useCallback(async () => {
        setLoadingUpdates(true);
        const { data } = await supabase
            .from('shipment_updates')
            .select('*')
            .eq('shipment_id', shipment.id)
            .order('created_at', { ascending: false });
        setUpdates(data || []);
        setLoadingUpdates(false);
    }, [shipment.id]);

    useEffect(() => { fetchUpdates(); }, [fetchUpdates]);

    const statusColor = STATUS_COLORS[shipment.status] || '#6366f1';

    const fields = [
        ['Shipment No', shipment.shipment_no || shipment.id],
        ['Job No', shipment.job_no],
        ['Client', shipment.client],
        ['Shipper', shipment.shipper],
        ['Consignee', shipment.consignee],
        ['Type', shipment.shipment_type],
        ['Trade', shipment.trade_direction],
        ['Service', shipment.service_type],
        ['POR', shipment.por],
        ['POL', shipment.pol],
        ['POD', shipment.pod],
        ['POF', shipment.pof],
        ['ETD', shipment.etd],
        ['ETA', shipment.eta],
        ['HBL No', shipment.hbl_no],
        ['Container No', shipment.containerNo || shipment.container_no],
        ['Vessel', shipment.vessel],
        ['Voyage', shipment.voy],
        ['AWB', shipment.awb],
        ['Commodity', shipment.commodity],
        ['Gross Weight', shipment.gross_weight],
        ['Volume', shipment.volume],
        ['Location Now', shipment.current_location],
    ].filter(([, v]) => v);

    return (
        <div className="st-detail">
            {/* Header */}
            <div className="st-detail-header">
                <button className="st-back-btn" onClick={onBack}>← Back</button>
                <div className="st-detail-title">
                    <h2>{shipment.shipment_no || `SHP-${String(shipment.id).padStart(6, '0')}`}</h2>
                    <span className="st-status-chip" style={{ background: statusColor }}>
                        {shipment.status || 'Booked'}
                    </span>
                </div>
                <button className="st-refresh-btn" onClick={() => { fetchUpdates(); onRefresh(); }}>↻ Refresh</button>
            </div>

            {/* Map */}
            <div className="st-map-wrapper">
                <h3 className="st-section-title">🗺️ Route Map</h3>
                <ShipmentMap
                    origin={shipment.por || shipment.pol}
                    destination={shipment.pod || shipment.destination}
                    status={shipment.status}
                />
            </div>

            <div className="st-detail-body">
                {/* Timeline */}
                <div className="st-detail-left">
                    <h3 className="st-section-title">📍 Tracking Timeline</h3>
                    {loadingUpdates ? (
                        <div className="st-loading">Loading updates…</div>
                    ) : (
                        <StatusTimeline currentStatus={shipment.status} updates={updates} />
                    )}
                </div>

                {/* Info + Update Form */}
                <div className="st-detail-right">
                    <h3 className="st-section-title">📦 Shipment Details</h3>
                    <div className="st-info-grid">
                        {fields.map(([label, value]) => (
                            <div key={label} className="st-info-row">
                                <span className="st-info-label">{label}</span>
                                <span className="st-info-value">{value}</span>
                            </div>
                        ))}
                    </div>

                    <div className="st-divider" />
                    <StatusUpdateForm
                        shipment={shipment}
                        onUpdated={() => { fetchUpdates(); onRefresh(); }}
                    />
                </div>
            </div>
        </div>
    );
}

/* ─── Shipment List ──────────────────────────────────── */
function ShipmentList({ onSelect }) {
    const [shipments, setShipments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');

    const fetchShipments = useCallback(async () => {
        setLoading(true);
        let q = supabase
            .from('shipments')
            .select('id,shipment_no,job_no,client,por,pod,status,shipment_type,current_location,etd,eta,awb,hbl_no,updated_at,shipment_date')
            .order('updated_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false });

        if (statusFilter) q = q.eq('status', statusFilter);
        if (typeFilter) q = q.eq('shipment_type', typeFilter);

        const { data, error } = await q;
        if (!error) setShipments(data || []);
        setLoading(false);
    }, [statusFilter, typeFilter]);

    useEffect(() => { fetchShipments(); }, [fetchShipments]);

    const filtered = shipments.filter(s => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            (s.shipment_no || '').toLowerCase().includes(q) ||
            (s.job_no || '').toLowerCase().includes(q) ||
            (s.client || '').toLowerCase().includes(q) ||
            (s.por || '').toLowerCase().includes(q) ||
            (s.pod || '').toLowerCase().includes(q) ||
            (s.awb || '').toLowerCase().includes(q) ||
            (s.hbl_no || '').toLowerCase().includes(q)
        );
    });

    return (
        <div className="st-list">
            {/* Filters */}
            <div className="st-filters">
                <input
                    className="st-search"
                    placeholder="🔍 Search shipment, AWB, HBL, client, route…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <select className="st-filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="">All Statuses</option>
                    {STATUS_STEPS.map(s => <option key={s.key}>{s.key}</option>)}
                    <option>Cancelled</option>
                </select>
                <select className="st-filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                    <option value="">All Types</option>
                    <option>AIR FREIGHT</option>
                    <option>SEA FREIGHT</option>
                    <option>TRANSPORT</option>
                    <option>OTHERS</option>
                </select>
                <button className="st-refresh-btn-sm" onClick={fetchShipments}>↻</button>
            </div>

            {/* Stats row */}
            <div className="st-stat-row">
                {STATUS_STEPS.slice(0, 5).map(step => {
                    const count = shipments.filter(s => s.status === step.key).length;
                    return (
                        <button
                            key={step.key}
                            className={`st-stat-chip ${statusFilter === step.key ? 'active' : ''}`}
                            style={{ '--chip-color': STATUS_COLORS[step.key] }}
                            onClick={() => setStatusFilter(p => p === step.key ? '' : step.key)}
                        >
                            <span>{step.icon}</span>
                            <span>{count}</span>
                            <small>{step.label}</small>
                        </button>
                    );
                })}
            </div>

            {/* Table */}
            {loading ? (
                <div className="st-loading">Loading shipments…</div>
            ) : filtered.length === 0 ? (
                <div className="st-empty">No shipments found</div>
            ) : (
                <div className="st-table-wrap">
                    <table className="st-table">
                        <thead>
                            <tr>
                                <th>Shipment No</th>
                                <th>AWB / HBL</th>
                                <th>Client</th>
                                <th>Route</th>
                                <th>Type</th>
                                <th>Status</th>
                                <th>Location</th>
                                <th>ETA</th>
                                <th>Last Updated</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(s => (
                                <tr key={s.id} className="st-table-row" onClick={() => onSelect(s)}>
                                    <td className="st-mono">{s.shipment_no || `SHP-${String(s.id).padStart(6, '0')}`}</td>
                                    <td className="st-mono st-awb">{s.awb || s.hbl_no || '—'}</td>
                                    <td>{s.client || '—'}</td>
                                    <td className="st-route">{s.por || '—'} → {s.pod || '—'}</td>
                                    <td><span className="st-type-badge">{s.shipment_type || '—'}</span></td>
                                    <td>
                                        <span className="st-status-pill"
                                            style={{ background: (STATUS_COLORS[s.status] || '#6366f1') + '22', color: STATUS_COLORS[s.status] || '#6366f1', border: `1px solid ${STATUS_COLORS[s.status] || '#6366f1'}44` }}>
                                            {s.status || 'Booked'}
                                        </span>
                                    </td>
                                    <td className="st-location">{s.current_location || '—'}</td>
                                    <td>{s.eta ? new Date(s.eta).toLocaleDateString() : '—'}</td>
                                    <td className="st-muted">{s.updated_at ? new Date(s.updated_at).toLocaleDateString() : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

/* ─── Root Component ─────────────────────────────────── */
export default function ShipmentTracking() {
    const [selected, setSelected] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);

    /* Load Leaflet CSS + JS once */
    useEffect(() => {
        if (!document.getElementById('leaflet-css')) {
            const link = document.createElement('link');
            link.id = 'leaflet-css';
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }
        if (!window.L && !document.getElementById('leaflet-js')) {
            const script = document.createElement('script');
            script.id = 'leaflet-js';
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            document.head.appendChild(script);
        }
    }, []);

    const handleBack = () => setSelected(null);
    const handleRefresh = () => setRefreshKey(k => k + 1);

    return (
        <div className="st-root">
            <div className="st-page-header">
                <div className="st-page-header-left">
                    <h1>🚢 Shipment Tracking</h1>
                    <p>Real-time shipment monitoring, status updates &amp; route visualization</p>
                </div>
            </div>

            {selected ? (
                <ShipmentDetail
                    key={`${selected.id}-${refreshKey}`}
                    shipment={selected}
                    onBack={handleBack}
                    onRefresh={handleRefresh}
                />
            ) : (
                <ShipmentList key={refreshKey} onSelect={s => setSelected(s)} />
            )}
        </div>
    );
}
