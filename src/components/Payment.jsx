import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import './Payment.css';

/* ─── Load Razorpay SDK ─── */
const loadRazorpay = () =>
    new Promise((resolve) => {
        if (window.Razorpay) { resolve(true); return; }
        const s = document.createElement('script');
        s.src = 'https://checkout.razorpay.com/v1/checkout.js';
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.body.appendChild(s);
    });

const RAZORPAY_KEY = import.meta.env.VITE_RAZORPAY_KEY_ID || '';

const PaymentPage = () => {
    const [shipments, setShipments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [payingId, setPayingId] = useState(null);
    const [toast, setToast] = useState(null);

    /* Amount-override dialog */
    const [amtDialog, setAmtDialog] = useState(null);  // { shipment }
    const [customAmt, setCustomAmt] = useState('');

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 6000);
    };

    /* ─── Fetch shipments ─── */
    const fetchShipments = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const { data, error } = await supabase
                .from('shipments')
                .select('id, shipment_no, job_no, client, freight, payment_status, shipment_type, por, pod')
                .order('created_at', { ascending: false });
            if (error) throw error;
            setShipments(data || []);
        } catch (err) {
            console.error('PaymentPage fetch error:', err);
            setError(`Failed to load shipments: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchShipments(); }, [fetchShipments]);

    /* ─── Open payment ─── */
    const openRazorpay = async (shipment, amount) => {
        if (!RAZORPAY_KEY) {
            showToast('Razorpay key not set. Add VITE_RAZORPAY_KEY_ID to your .env and restart.', 'error');
            return;
        }
        const loaded = await loadRazorpay();
        if (!loaded) {
            showToast('Could not load Razorpay SDK. Check internet connection.', 'error');
            return;
        }

        setPayingId(shipment.id);

        const options = {
            key: RAZORPAY_KEY,
            amount: Math.round(parseFloat(amount) * 100),
            currency: 'INR',
            name: 'Seal Freight Forwarders',
            description: `Freight for ${shipment.shipment_no || shipment.id}`,
            image: '/seal.png',
            handler: async (response) => {
                try {
                    /* Insert payment record */
                    const { error: insErr } = await supabase.from('payments').insert([{
                        shipment_id: shipment.id,
                        razorpay_payment_id: response.razorpay_payment_id,
                        razorpay_order_id: response.razorpay_order_id || null,
                        amount: parseFloat(amount),
                        currency: 'INR',
                        status: 'paid',
                        paid_at: new Date().toISOString(),
                    }]);
                    if (insErr) {
                        console.error('Insert payment error:', insErr);
                        showToast(`Payment captured but DB record failed: ${insErr.message}`, 'error');
                    }

                    /* Update shipment payment_status */
                    const { error: updErr } = await supabase
                        .from('shipments')
                        .update({ payment_status: 'paid' })
                        .eq('id', shipment.id);
                    if (updErr) {
                        console.error('Update shipment error:', updErr);
                        showToast(`Status update failed: ${updErr.message}. Run payment_schema.sql first.`, 'error');
                    } else {
                        showToast(`✓ Payment successful! ID: ${response.razorpay_payment_id}`);
                        fetchShipments();
                    }
                } catch (err) {
                    console.error('Post-payment error:', err);
                    showToast(`Post-payment error: ${err.message}`, 'error');
                } finally {
                    setPayingId(null);
                }
            },
            prefill: { name: shipment.client || '', email: '', contact: '' },
            notes: { shipment_no: shipment.shipment_no || '', job_no: shipment.job_no || '' },
            theme: { color: '#6366f1' },
            modal: {
                ondismiss: () => {
                    setPayingId(null);
                    showToast('Payment cancelled — you closed the payment window.', 'error');
                },
            },
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', (resp) => {
            console.error('Razorpay payment.failed:', resp.error);
            showToast(`Payment failed: ${resp.error.description}`, 'error');
            setPayingId(null);
        });
        rzp.open();
    };

    /* ─── Handle Pay Now click ─── */
    const handlePayNow = (shipment) => {
        const freight = parseFloat(shipment.freight) || 0;
        if (freight > 0) {
            openRazorpay(shipment, freight);
        } else {
            /* No freight set → show dialog to enter amount manually */
            setAmtDialog(shipment);
            setCustomAmt('');
        }
    };

    const confirmCustomAmount = () => {
        const amt = parseFloat(customAmt);
        if (!amt || amt <= 0) { showToast('Enter a valid amount greater than 0', 'error'); return; }
        const shipment = amtDialog;
        setAmtDialog(null);
        openRazorpay(shipment, amt);
    };

    /* ─── Filter ─── */
    const filtered = shipments.filter((s) => {
        const q = search.toLowerCase();
        const matchSearch = !q ||
            (s.shipment_no || '').toLowerCase().includes(q) ||
            (s.client || '').toLowerCase().includes(q) ||
            (s.job_no || '').toLowerCase().includes(q);
        const matchStatus = filterStatus === 'all' ||
            (s.payment_status || 'pending') === filterStatus;
        return matchSearch && matchStatus;
    });

    /* ─── KPIs ─── */
    const totalPaid = shipments.filter(s => s.payment_status === 'paid').reduce((a, s) => a + (parseFloat(s.freight) || 0), 0);
    const totalPending = shipments.filter(s => (s.payment_status || 'pending') !== 'paid').reduce((a, s) => a + (parseFloat(s.freight) || 0), 0);
    const fmt = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);

    return (
        <div className="payment-page">

            {/* Toast */}
            {toast && (
                <div className={`pay-toast pay-toast--${toast.type}`}>
                    <span>{toast.type === 'success' ? '✓' : '✗'}</span>
                    <span>{toast.msg}</span>
                    <button className="pay-toast-close" onClick={() => setToast(null)}>×</button>
                </div>
            )}

            {/* Razorpay key missing — persistent warning */}
            {!RAZORPAY_KEY && (
                <div className="pay-key-warning">
                    ⚠ <strong>Razorpay not configured.</strong> Add <code>VITE_RAZORPAY_KEY_ID=rzp_test_XXXX</code> to your <code>.env</code> file and restart the dev server.
                </div>
            )}

            {/* Header */}
            <div className="pay-header">
                <div>
                    <h1 className="pay-title">Payments</h1>
                    <p className="pay-subtitle">Collect freight payments from clients via Razorpay</p>
                </div>
                <button className="pay-refresh-btn" onClick={fetchShipments} disabled={loading}>
                    {loading ? 'Loading…' : '↻ Refresh'}
                </button>
            </div>

            {/* KPI Cards */}
            <div className="pay-kpi-row">
                <div className="pay-kpi pay-kpi--total">
                    <div className="pay-kpi-label">Total Shipments</div>
                    <div className="pay-kpi-value">{shipments.length}</div>
                </div>
                <div className="pay-kpi pay-kpi--paid">
                    <div className="pay-kpi-label">Collected</div>
                    <div className="pay-kpi-value">{fmt(totalPaid)}</div>
                </div>
                <div className="pay-kpi pay-kpi--pending">
                    <div className="pay-kpi-label">Outstanding</div>
                    <div className="pay-kpi-value">{fmt(totalPending)}</div>
                </div>
            </div>

            {/* Filters */}
            <div className="pay-filters">
                <div className="pay-search-wrap">
                    <svg className="pay-search-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
                    </svg>
                    <input
                        className="pay-search" type="text"
                        placeholder="Search shipment no, client, job no…"
                        value={search} onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <select className="pay-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                </select>
            </div>

            {/* Error */}
            {error && (
                <div className="pay-error">
                    <span>⚠ {error}</span>
                    <button onClick={() => setError(null)}>Dismiss</button>
                </div>
            )}

            {/* Table */}
            {loading ? (
                <div className="pay-loading">
                    <div className="pay-spinner" />
                    <span>Loading shipments…</span>
                </div>
            ) : (
                <div className="pay-table-wrap">
                    <table className="pay-table">
                        <thead>
                            <tr>
                                <th>Shipment No</th>
                                <th>Job No</th>
                                <th>Client</th>
                                <th>Route</th>
                                <th>Type</th>
                                <th>Freight (INR)</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={8} className="pay-empty">No shipments found. {search && 'Try a different search.'}</td></tr>
                            ) : filtered.map(s => {
                                const isPaid = s.payment_status === 'paid';
                                const freight = parseFloat(s.freight) || 0;
                                return (
                                    <tr key={s.id} className={isPaid ? 'pay-row--paid' : ''}>
                                        <td className="pay-mono">{s.shipment_no || `SHP-${String(s.id).slice(0, 8)}`}</td>
                                        <td className="pay-mono">{s.job_no || '—'}</td>
                                        <td>{s.client || '—'}</td>
                                        <td className="pay-route">{s.por || '—'} → {s.pod || '—'}</td>
                                        <td><span className="pay-type-badge">{s.shipment_type || '—'}</span></td>
                                        <td className="pay-amount">
                                            {freight > 0 ? fmt(freight) : <span className="pay-nil">Enter on pay</span>}
                                        </td>
                                        <td>
                                            <span className={`pay-status-badge pay-status--${isPaid ? 'paid' : 'pending'}`}>
                                                {isPaid ? '✓ Paid' : '⏳ Pending'}
                                            </span>
                                        </td>
                                        <td>
                                            {isPaid ? (
                                                <span className="pay-done-label">Collected</span>
                                            ) : (
                                                <button
                                                    className="pay-btn"
                                                    onClick={() => handlePayNow(s)}
                                                    disabled={payingId === s.id}
                                                    title={freight <= 0 ? 'No freight set — you can enter a custom amount' : `Pay ₹${freight}`}
                                                >
                                                    {payingId === s.id ? 'Opening…' : (freight > 0 ? `Pay ${fmt(freight)}` : 'Pay Now')}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <p className="pay-razorpay-note">Secured by <strong>Razorpay</strong> — PCI DSS compliant</p>

            {/* ─── Custom Amount Dialog ─── */}
            {amtDialog && (
                <div className="pay-dialog-overlay" onClick={() => setAmtDialog(null)}>
                    <div className="pay-dialog" onClick={e => e.stopPropagation()}>
                        <h3>Enter Payment Amount</h3>
                        <p>
                            <strong>{amtDialog.client || amtDialog.shipment_no}</strong> has no freight amount set.
                            Enter the amount to collect:
                        </p>
                        <div className="pay-dialog-input-row">
                            <span className="pay-dialog-prefix">₹</span>
                            <input
                                className="pay-dialog-input"
                                type="number"
                                min="1"
                                step="0.01"
                                placeholder="e.g. 5000"
                                value={customAmt}
                                onChange={e => setCustomAmt(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && confirmCustomAmount()}
                                autoFocus
                            />
                        </div>
                        <div className="pay-dialog-actions">
                            <button className="pay-dialog-cancel" onClick={() => setAmtDialog(null)}>Cancel</button>
                            <button className="pay-btn" onClick={confirmCustomAmount}>Proceed to Pay</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PaymentPage;
