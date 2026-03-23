import { useEffect, useRef } from 'react';
import { STATUS_COLORS, getCoords } from '../constants/shipment';

export default function ShipmentMap({ origin, destination, currentLocation, status }) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);

    const originCoords = getCoords(origin);
    const destCoords = getCoords(destination);
    const currentCoords = getCoords(currentLocation);

    useEffect(() => {
        if (!window.L) return; // Leaflet not loaded yet
        if (mapInstanceRef.current) {
            mapInstanceRef.current.remove();
            mapInstanceRef.current = null;
        }
        if (!mapRef.current) return;

        // Use the most specific location for center
        const center = currentCoords || destCoords || originCoords || [20.5937, 78.9629];
        const map = window.L.map(mapRef.current, { zoomControl: true }).setView(center, 4);
        mapInstanceRef.current = map;

        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
            maxZoom: 18,
        }).addTo(map);

        const makeIcon = (emoji, color, isAnimated = false) => window.L.divIcon({
            html: `<div class="st-map-marker ${isAnimated ? 'st-marker-at-port' : ''}" style="font-size:22px;display:flex;align-items:center;justify-content:center;
             width:36px;height:36px;background:${color};border-radius:50%;border:3px solid #fff;
             box-shadow:0 2px 8px rgba(0,0,0,.4)"><span class="st-marker-emoji">${emoji}</span></div>`,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            className: '',
        });

        const bounds = [];

        if (originCoords) {
            window.L.marker(originCoords, { icon: makeIcon('🔵', '#3b82f6') })
                .addTo(map)
                .bindPopup(`<b>Origin</b><br>${origin}`);
            bounds.push(originCoords);
        }

        if (destCoords) {
            const destColor = STATUS_COLORS[status] || '#6366f1';
            window.L.marker(destCoords, { icon: makeIcon('📍', destColor) })
                .addTo(map)
                .bindPopup(`<b>Destination</b><br>${destination}`);
            bounds.push(destCoords);
        }

        if (currentCoords) {
            const isAnimated = true; // Always animate current location
            
            // Select emoji based on status
            let emoji = '🚢';
            if (status === 'At Port') emoji = '⚓';
            if (status === 'Out for Delivery' || status === 'Customs') emoji = '🚛';
            if (status === 'Delivered') emoji = '✅';
            if (status === 'Booked') emoji = '📋';

            const color = STATUS_COLORS[status] || '#f59e0b';
            
            window.L.marker(currentCoords, { icon: makeIcon(emoji, color, isAnimated) })
                .addTo(map)
                .bindPopup(`<b>Location Now (${status})</b><br>${currentLocation}`)
                .openPopup();
            bounds.push(currentCoords);
        }

        // Draw Polyline for route
        // connect origin -> current -> destination if possible
        const polylineCoords = [originCoords, currentCoords, destCoords].filter(Boolean);
        if (polylineCoords.length > 1) {
            window.L.polyline(polylineCoords, {
                color: STATUS_COLORS[status] || '#6366f1',
                weight: 2.5,
                dashArray: '6 4',
                opacity: 0.8,
            }).addTo(map);
        }

        if (bounds.length > 0) {
            map.fitBounds(bounds, { padding: [40, 40] });
        }

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, [origin, destination, currentLocation, status, originCoords, destCoords, currentCoords]);

    if (!originCoords && !destCoords && !currentCoords) {
        return (
            <div className="st-map-placeholder">
                <div className="st-map-placeholder-content">
                    <span className="st-map-placeholder-icon">🗺️</span>
                    <p>Port coordinates not available for this route</p>
                    <small>{origin} → {destination}</small>
                    {currentLocation && <small><br/>Current Location: {currentLocation}</small>}
                </div>
            </div>
        );
    }

    return <div ref={mapRef} className="st-map-container" style={{ height: '320px', borderRadius: '10px' }} />;
}
