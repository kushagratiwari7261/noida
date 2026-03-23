import { STATUS_STEPS, STATUS_COLORS } from '../constants/shipment';

export default function StatusTimeline({ currentStatus, updates }) {
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
