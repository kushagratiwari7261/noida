import { useEffect, useRef } from 'react'

const iconMap = {
  blue: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
      <path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
    </svg>
  ),
  teal: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
    </svg>
  ),
  yellow: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
      <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
    </svg>
  ),
  red: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
      <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
    </svg>
  ),
}

const trendColor = { blue: '#818cf8', teal: '#22d3ee', yellow: '#fbbf24', red: '#f87171' }

function useCountUp(target, duration = 900) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const numericTarget = parseInt(String(target).replace(/\D/g, ''), 10)
    if (isNaN(numericTarget)) { el.textContent = target; return }
    const prefix = String(target).includes('$') ? '$' : ''
    const suffix = String(target).includes('%') ? '%' : ''
    let start = null
    const step = (ts) => {
      if (!start) start = ts
      const progress = Math.min((ts - start) / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3) // ease-out-cubic
      el.textContent = prefix + Math.floor(ease * numericTarget).toLocaleString() + suffix
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target, duration])
  return ref
}

function StatCard({ label, value, iconType = 'blue', id, onClick, trend }) {
  const valueRef = useCountUp(value)

  return (
    <div
      className={`stat-card ${iconType}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      id={id}
    >
      <div className={`stat-icon ${iconType}`}>
        {iconMap[iconType] ?? iconMap.blue}
      </div>

      <div className="stat-info">
        <div className="stat-label">{label}</div>
        <div className="stat-value" ref={valueRef}>{value}</div>
        {trend !== undefined && (
          <div className="stat-trend" style={{ color: trendColor[iconType] }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
            {trend}
          </div>
        )}
      </div>
    </div>
  )
}

export default StatCard
