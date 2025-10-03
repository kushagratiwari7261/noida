// src/components/StatCard.jsx

function StatCard({ label, value, iconType, id, onClick }) {
  const getIcon = () => {
    switch (iconType) {
      case 'blue':
        return (
          <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
            <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
          </svg>
        )
      case 'teal':
        return (
          <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
        )
      // Add other cases for different icons
      default:
        return null
    }
  }

  return (
    <div 
      className={`stat-card ${iconType}`} 
      onClick={onClick} 
      style={{ cursor: 'pointer' }}
    >
      <div className={`stat-icon ${iconType}`}>
        {getIcon()}
      </div>
      <div className="stat-info">
        <div className="stat-label">{label}</div>
        <div className="stat-value" id={id}>{value}</div>
      </div>
    </div>
  )
}

export default StatCard
