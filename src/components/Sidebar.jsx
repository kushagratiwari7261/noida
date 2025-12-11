import { Link } from 'react-router-dom'
import sealLogo from '../assets/seal.png'

const Sidebar = ({ mobileMenuOpen, toggleMobileMenu, onLogout }) => {
  const handleLogoutClick = async () => {
    console.log('Sidebar logout triggered')
    await onLogout()
  }

  // Close mobile menu when a link is clicked
  const handleLinkClick = () => {
    if (mobileMenuOpen) {
      toggleMobileMenu()
    }
  }

  return (
    <>
      {/* Mobile Header */}
      <div className="mobile-header">
        <button className="hamburger-btn" onClick={toggleMobileMenu}>
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
        </button>
        <div className="mobile-logo">
          <img src={sealLogo} alt="Seal Freight" className="logo-text-image" />
        </div>
      </div>

      {/* Mobile Overlay Menu */}
      <div 
        className={`mobile-menu-overlay ${mobileMenuOpen ? 'active' : ''}`} 
        onClick={toggleMobileMenu}
      >
        <div className="mobile-menu-content" onClick={(e) => e.stopPropagation()}>
          <nav className="mobile-nav-menu">
            <Link 
              to="/dashboard" 
              className="nav-link"
              onClick={handleLinkClick}
            >
              <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
              </svg>
              Dashboard
            </Link>
            
            <Link 
              to="/customers" 
              className="nav-link"
              onClick={handleLinkClick}
            >
              <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7.5 6.5C7.5 8.981 9.519 11 12 11s4.5-2.019 4.5-4.5S14.481 2 12 2 7.5 4.019 7.5 6.5zM20 21h1v-1c0-3.859-3.141-7-7-7h-4c-3.859 0-7 3.141-7 7v1h1 1 14z"/>
              </svg>
              Customers
            </Link>
            
            <Link 
              to="/new-shipment" 
              className="nav-link"
              onClick={handleLinkClick}
            >
              <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63A1.5 1.5 0 0 0 18.54 8H16c-.8 0-1.54.37-2.01.99L12 12l-1.99-3.01A2.5 2.5 0 0 0 8 8H5.46c-.8 0-1.49.59-1.42 1.37L6.5 16H9v6h2v-6h2v6h4z"/>
              </svg>
              Shipments
            </Link>
            
            <Link 
              to="/messages" 
              className="nav-link"
              onClick={handleLinkClick}
            >
              <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
              </svg>
              Messages
            </Link>
            
            <Link 
              to="/reports" 
              className="nav-link"
              onClick={handleLinkClick}
            >
              <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
              </svg>
              Reports
            </Link>
            
            <Link 
              to="/settings" 
              className="nav-link"
              onClick={handleLinkClick}
            >
              <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24 0-0.43 0.17-0.47 0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24 0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98 0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6 1.62,3.6 3.6S13.98,15.6,12,15.6z"/>
              </svg>
              Settings
            </Link>
            
            <Link 
              to="/dsr" 
              className="nav-link"
              onClick={handleLinkClick}
            >
              <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-6h2v6zm0-8h-2V7h2v4z"/>
              </svg>
              DSR
            </Link>
            <Link 
              to="/invoices" 
              className="nav-link"
              onClick={handleLinkClick}
            >
              <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-6h2v6zm0-8h-2V7h2v4z"/>
              </svg>
              Invoices
            </Link>
            
            <Link 
              to="/job-orders" 
              className="nav-link"
              onClick={handleLinkClick}
            >
              <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
              </svg>
              Job Order
            </Link>

            <button 
              onClick={handleLogoutClick} 
              className="nav-link logout-btn"
              type="button"
            >
              <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.59L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
              </svg>
              Logout
            </button>
          </nav>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="logo-section">
          <img src={sealLogo} alt="Seal Freight" className="logo-text-image" />
        </div>

        <nav className="nav-menu">
          <Link 
            to="/dashboard" 
            className="nav-link"
            onClick={handleLinkClick}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
            </svg>
            Dashboard
          </Link>
          
          <Link 
            to="/customers" 
            className="nav-link"
            onClick={handleLinkClick}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7.5 6.5C7.5 8.981 9.519 11 12 11s4.5-2.019 4.5-4.5S14.481 2 12 2 7.5 4.019 7.5 6.5zM20 21h1v-1c0-3.859-3.141-7-7-7h-4c-3.859 0-7 3.141-7 7v1h1 1 14z"/>
            </svg>
            Customers
          </Link>
          
          <Link 
            to="/new-shipment" 
            className="nav-link"
            onClick={handleLinkClick}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63A1.5 1.5 0 0 0 18.54 8H16c-.8 0-1.54.37-2.01.99L12 12l-1.99-3.01A2.5 2.5 0 0 0 8 8H5.46c-.8 0-1.49.59-1.42 1.37L6.5 16H9v6h2v-6h2v6h4z"/>
            </svg>
            Shipments
          </Link>
           <Link 
              to="/invoices" 
              className="nav-link"
              onClick={handleLinkClick}
            >
              <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-6h2v6zm0-8h-2V7h2v4z"/>
              </svg>
              Invoices
            </Link>
          
          <Link 
            to="/messages" 
            className="nav-link"
            onClick={handleLinkClick}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
            </svg>
            Messages
          </Link>
          
          <Link 
            to="/reports" 
            className="nav-link"
            onClick={handleLinkClick}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
            </svg>
            Reports
          </Link>
          
          <Link 
            to="/settings" 
            className="nav-link"
            onClick={handleLinkClick}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24 0-0.43 0.17-0.47 0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24 0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98 0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6 1.62,3.6 3.6S13.98,15.6,12,15.6z"/>
            </svg>
            Settings
          </Link>
          
          <Link 
            to="/dsr" 
            className="nav-link"
            onClick={handleLinkClick}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-6h2v6zm0-8h-2V7h2v4z"/>
            </svg>
            DSR
          </Link>
          
          <Link 
            to="/job-orders" 
            className="nav-link"
            onClick={handleLinkClick}
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
            </svg>
            Job Order
          </Link>

          <button 
            onClick={handleLogoutClick} 
            className="nav-link logout-btn"
            type="button"
          >
            <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.59L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
            </svg>
            Logout
          </button>
        </nav>
      </aside>
    </>
  )
}

export default Sidebar