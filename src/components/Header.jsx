import { useState, useEffect } from 'react'

const Header = ({ createNewShipment, creatActiveJob, user }) => {
  const [now, setNow] = useState(new Date())

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const hour = now.getHours()
  const greeting =
    hour < 5 ? 'Good night' :
      hour < 12 ? 'Good morning' :
        hour < 17 ? 'Good afternoon' :
          hour < 21 ? 'Good evening' : 'Good night'

  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const firstName = user?.email
    ? user.email.split('@')[0].replace(/[._]/g, ' ')
    : ''
  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : 'SF'

  return (
    <div className="header-section">
      <div className="header-content">
        <h1 className="header-title">
          <span className="header-title-gradient">{greeting}</span>
          {firstName && (
            <span className="header-title-gradient">, {firstName}</span>
          )}
          <span style={{ fontSize: '22px', marginLeft: 6 }}>👋</span>
        </h1>
        <p className="header-subtitle">
          <span>{dateStr}</span>
          <span className="header-time-badge">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            {timeStr}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>· Freight Overview</span>
        </p>
      </div>

      <div className="header-actions">
        <button className="primary-button" onClick={createNewShipment} id="new-shipment-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="14" height="14">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Shipment
        </button>
        <button
          className="primary-button"
          onClick={creatActiveJob}
          id="new-job-btn"
          style={{ background: 'linear-gradient(135deg, #0891b2, #0e7490)', boxShadow: '0 3px 16px rgba(8,145,178,0.3)' }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
          </svg>
          New Job
        </button>
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: 'var(--brand-gradient)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, color: '#fff',
          flexShrink: 0, cursor: 'default',
          boxShadow: '0 0 0 2px var(--brand-glow)',
        }} title={user?.email}>
          {initials}
        </div>
      </div>
    </div>
  )
}

export default Header