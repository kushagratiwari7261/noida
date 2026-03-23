export const STATUS_STEPS = [
    { key: 'Booked', label: 'Booked', icon: '📋' },
    { key: 'In Transit', label: 'In Transit', icon: '🚢' },
    { key: 'At Port', label: 'At Port', icon: '⚓' },
    { key: 'Customs', label: 'Customs Clearance', icon: '🛃' },
    { key: 'Out for Delivery', label: 'Out for Delivery', icon: '🚛' },
    { key: 'Delivered', label: 'Delivered', icon: '✅' },
];

export const STATUS_COLORS = {
    'Booked': '#6366f1',
    'In Transit': '#0ea5e9',
    'At Port': '#f59e0b',
    'Customs': '#f97316',
    'Out for Delivery': '#8b5cf6',
    'Delivered': '#22c55e',
    'Cancelled': '#ef4444',
};

export const PORT_COORDS = {
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
    'MELBOURNE': [-37.8136, 144.9631], 'MEL': [-37.8136, 144.9631],
};

export function getCoords(portName) {
    if (!portName) return null;
    const upper = portName.toUpperCase().trim();
    for (const [key, coords] of Object.entries(PORT_COORDS)) {
        if (upper.includes(key)) return coords;
    }
    return null;
}
