import { Link, useLocation } from 'react-router-dom'
import sealLogo from '../seal.png'
import './Sidebar.css'

const navItems = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
      </svg>
    ),
  },
  {
    to: '/customers',
    label: 'Customers',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
      </svg>
    ),
  },
  {
    to: '/new-shipment',
    label: 'Shipments',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
      </svg>
    ),
  },
  {
    to: '/tracking',
    label: 'Tracking',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
      </svg>
    ),
  },

  {
    to: '/invoices',
    label: 'Invoices',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
      </svg>
    ),
  },
  {
    to: '/payments',
    label: 'Payments',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
        <rect x="4" y="10" width="4" height="2" rx="1" />
        <rect x="4" y="13" width="6" height="1.5" rx="0.75" />
      </svg>
    ),
  },
  {
    to: '/job-orders',
    label: 'Job Orders',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
      </svg>
    ),
  },
  {
    to: '/messages',
    label: 'Messages',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
      </svg>
    ),
  },
  {
    to: '/dsr',
    label: 'DSR',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
      </svg>
    ),
  },
  {
    to: '/reports',
    label: 'Reports',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4zm2.5 2.1h-15V5h15v14.1zm0-16.1h-15c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94zM12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
      </svg>
    ),
  },
]

const Sidebar = ({ mobileMenuOpen, toggleMobileMenu, onLogout, user }) => {
  const location = useLocation()

  const handleLogoutClick = async () => { await onLogout() }
  const handleLinkClick = () => { if (mobileMenuOpen) toggleMobileMenu() }
  const isActive = (path) => location.pathname === path

  // User avatar initials
  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'SF'
  const emailDisplay = user?.email ?? 'freight@seal.com'

  const NavItem = ({ item, onClick }) => (
    <Link
      to={item.to}
      className={`nav-link ${isActive(item.to) ? 'active' : ''}`}
      onClick={onClick}
    >
      <span className="nav-icon">{item.icon}</span>
      <span className="nav-label">{item.label}</span>
      {isActive(item.to) && <span className="active-indicator" />}
    </Link>
  )

  const UserFooter = () => (
    <div className="sidebar-footer">
      <div className="sidebar-user-badge">
        <div className="sidebar-user-avatar">{initials}</div>
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">{emailDisplay}</div>
          <div className="sidebar-user-role">Freight Admin</div>
        </div>
      </div>
      <div className="sidebar-status-dot">System Online</div>
    </div>
  )

  return (
    <>
      {/* Mobile Header */}
      <div className="mobile-header">
        <button
          className={`hamburger-btn ${mobileMenuOpen ? 'active' : ''}`}
          onClick={toggleMobileMenu}
          aria-label="Menu"
        >
          <span className="hamburger-line" />
          <span className="hamburger-line" />
          <span className="hamburger-line" />
        </button>
        <div className="mobile-logo">
          <img src={sealLogo} alt="Seal Freight" className="logo-text-image" />
        </div>
      </div>

      {/* Mobile Overlay */}
      <div
        className={`mobile-menu-overlay ${mobileMenuOpen ? 'active' : ''}`}
        onClick={toggleMobileMenu}
      >
        <div className="mobile-menu-content" onClick={(e) => e.stopPropagation()}>
          <div className="sidebar-logo-section">
            <img src={sealLogo} alt="Seal Freight" className="logo-text-image" />
            <div className="sidebar-brand-tag">Logistics Platform</div>
          </div>
          <div className="sidebar-section-label">Main Menu</div>
          <nav className="mobile-nav-menu">
            {navItems.map((item) => (
              <NavItem key={item.to} item={item} onClick={handleLinkClick} />
            ))}
          </nav>
          <div className="sidebar-divider" />
          <button onClick={handleLogoutClick} className="nav-link logout-btn" type="button">
            <span className="nav-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.59L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
              </svg>
            </span>
            <span className="nav-label">Logout</span>
          </button>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo-section">
          <div className="logo-glow">
            <img src={sealLogo} alt="Seal Freight" className="logo-text-image" />
          </div>
          <div className="sidebar-brand-tag">Logistics Platform</div>
        </div>

        <div className="sidebar-section-label">Main Menu</div>

        <nav className="nav-menu">
          {navItems.map((item) => (
            <NavItem key={item.to} item={item} onClick={handleLinkClick} />
          ))}
        </nav>

        <div className="sidebar-divider" />

        <button onClick={handleLogoutClick} className="nav-link logout-btn" type="button">
          <span className="nav-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.59L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
            </svg>
          </span>
          <span className="nav-label">Logout</span>
        </button>

        <UserFooter />
      </aside>
    </>
  )
}

export default Sidebar