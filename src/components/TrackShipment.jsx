import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import ShipmentMap from './ShipmentMap';
import StatusTimeline from './StatusTimeline';
import { STATUS_COLORS } from '../constants/shipment';
import './ShipmentTracking.css'; // Reuse styles

export default function TrackShipment() {
    const { id } = useParams();
    const [shipment, setShipment] = useState(null);
    const [updates, setUpdates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const tokenId = id ? id.trim() : '';
            console.log('Attempting to fetch token:', tokenId);
            // 1. Find token in shipment_updates to get shipment_id
            const { data: linkData, error: linkErr } = await supabase
                .from('shipment_updates')
                .select('shipment_id, status, remarks')
                .eq('remarks', tokenId) // 'id' URL param is the token
                .eq('status', 'Link Generated')
                .maybeSingle();

            console.log('Link lookup result:', { linkData, linkErr });
            if (linkErr) throw new Error(`Database Error: ${linkErr.message} (${linkErr.code})`);
            if (!linkData) throw new Error('Invalid or Expired Tracking Link (No record found for token)');

            const shipId = linkData.shipment_id;

            // 2. Check if link was revoked
            const { data: revokeData } = await supabase
                .from('shipment_updates')
                .select('id')
                .eq('remarks', id)
                .eq('status', 'Link Revoked')
                .maybeSingle();

            if (revokeData) throw new Error('This tracking link has been deactivated');

            // 3. Fetch Shipment
            const { data: shipData, error: shipErr } = await supabase
                .from('shipments')
                .select('*')
                .eq('id', shipId)
                .single();

            if (shipErr) throw new Error('Shipment details not found');
            setShipment(shipData);

            // 4. Fetch Updates
            const { data: updData, error: updErr } = await supabase
                .from('shipment_updates')
                .select('*')
                .eq('shipment_id', shipId)
                .order('created_at', { ascending: false });

            if (!updErr) {
                // Filter out link-management rows for public display
                const publicUpdates = (updData || []).filter(u => 
                    u.status !== 'Link Generated' && u.status !== 'Link Revoked'
                );
                setUpdates(publicUpdates);
            }

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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

    if (loading) return <div className="st-loading">Loading tracking details…</div>;
    if (error) return <div className="st-empty">❌ {error}</div>;
    if (!shipment) return <div className="st-empty">No shipment found</div>;

    const statusColor = STATUS_COLORS[shipment.status] || '#6366f1';

    const fields = [
        ['Shipment No', shipment.shipment_no || shipment.id],
        ['Origin', shipment.por || shipment.pol],
        ['Destination', shipment.pod || shipment.destination],
        ['Type', shipment.shipment_type],
        ['Vessel', shipment.vessel],
        ['Container No', shipment.containerNo || shipment.container_no],
        ['ETD', shipment.etd],
        ['ETA', shipment.eta],
        ['Location Now', shipment.current_location],
    ].filter(([, v]) => v);

    return (
        <div className="st-root public-tracking" style={{ background: '#f8fafc', color: '#1e293b' }}>
            <div className="st-detail">
                {/* Header */}
                <div className="st-detail-header" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <div className="st-detail-title">
                        <h2>{shipment.shipment_no || `SHP-${String(shipment.id).padStart(6, '0')}`}</h2>
                        <span className="st-status-chip" style={{ background: statusColor }}>
                            {shipment.status || 'Booked'}
                        </span>
                    </div>
                    <button className="st-refresh-btn" onClick={fetchData}>↻ Refresh</button>
                </div>

                {/* Map */}
                <div className="st-map-wrapper" style={{ padding: 0, overflow: 'hidden' }}>
                    <ShipmentMap
                        origin={shipment.por || shipment.pol}
                        destination={shipment.pod || shipment.destination}
                        currentLocation={shipment.current_location}
                        status={shipment.status}
                    />
                </div>

                <div className="st-detail-body">
                    {/* Timeline */}
                    <div className="st-detail-left">
                        <h3 className="st-section-title">📍 Tracking Timeline</h3>
                        <StatusTimeline currentStatus={shipment.status} updates={updates} />
                    </div>

                    {/* Details */}
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
                    </div>
                </div>

                {/* Footer / Branding */}
                <div style={{ textAlign: 'center', marginTop: '20px', color: '#64748b', fontSize: '13px' }}>
                    <p>Tracked via Seal Freight Logistics</p>
                </div>
            </div>
        </div>
    );
}
