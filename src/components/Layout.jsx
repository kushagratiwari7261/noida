import { useState } from 'react';
import Sidebar from './Sidebar';
import './Layout.css'; // Import the CSS file

const Layout = ({ children, user, onLogout }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const handleLogout = async () => {
    await onLogout();
  };

  return (
    <div className="app-layout">
      <Sidebar 
        mobileMenuOpen={mobileMenuOpen}
        toggleMobileMenu={toggleMobileMenu}
        onLogout={handleLogout}
      />
      <main className="main-content">
        {children}
      </main>
    </div>
  );
};

export default Layout;