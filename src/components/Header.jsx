// src/components/Header.jsx
const Header = ({ toggleMobileMenu, createNewShipment }) => {
  return (
    <div className="header-section">
      <div>
        <h1 className="header-title">SEAL FREIGHT </h1>
        <p className="header-subtitle">Welcome back. Here's your freight forwarding overview.</p>
      </div>
      <button className="primary-button" onClick={createNewShipment}>
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
        </svg>
        New Shipment
      </button>
    </div>
  )
}

export default Header