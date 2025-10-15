// src/components/Login.jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './inde.css'
import sealLogo from './seal.png';


const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = () => {
    const newErrors = {};

    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!isValidEmail(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    
    if (!validateForm()) {
      return;
    }

    setIsLoggingIn(true);

    try {
      // Use the onLogin function passed from App.jsx which uses Supabase
      const result = await onLogin(email, password);
      
      if (result.success) {
        setMessage('Login successful! Redirecting to dashboard...');
        
        if (rememberMe) {
          localStorage.setItem('rememberMe', 'true');
        }
        
        // The authentication state change in App.jsx will handle the redirect
      } else {
        setMessage(result.error || 'Invalid email or password. Please try again.');
      }
    } catch (error) {
      console.error('Login error:', error);
      setMessage('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (isLoading) {
    return (
      <div id="loading-screen" className="loading-screen">
        <div className="loading-container">
          <div className="logo-container" style={{textAlign: 'center'}}>
            <div className="logo-icon">
              <img 
                src={sealLogo}
                alt="Seal Freight Logo" 
                style={{width: '300px', height: 'auto', display: 'block', margin: '0 auto'}} 
              />
            </div>
          </div>
          <div className="loading-spinner">
            <div className="spinner-ring"></div>
          </div>
          <p className="loading-text">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div id="main-content" className="main-content">
      {/* Header */}
      <header className="header">
        <div className="container">
          <div className="logo-header">
            <div className="logo-icon">
              <img 
                src={sealLogo}
                alt="Seal Freight Logo" 
                style={{width: '200px', height: 'auto', marginRight: '13px'}} 
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Section */}
      <main className="main-section">
        <div className="background-pattern"></div>
        <div className="container">
          <div className="login-wrapper">
            <div className="login-card card">
              <div className="card__body">
                <div className="login-header">
                  <h2>Welcome Back</h2>
                  <p className="login-subtitle">Sign in to your Seal Freight account</p>
                </div>

                {message && (
                  <div className={message.includes('successful') ? 'success-message' : 'error-message'}>
                    {message}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="login-form">
                  <div className="form-group">
                    <label htmlFor="email" className="form-label">Email Address</label>
                    <input 
                      type="email" 
                      id="email" 
                      name="email" 
                      className={`form-control ${errors.email ? 'error' : ''}`}
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isLoggingIn}
                    />
                    {errors.email && <div className="field-error">{errors.email}</div>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="password" className="form-label">Password</label>
                    <input 
                      type="password" 
                      id="password" 
                      name="password" 
                      className={`form-control ${errors.password ? 'error' : ''}`}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isLoggingIn}
                    />
                    {errors.password && <div className="field-error">{errors.password}</div>}
                  </div>

                  <div className="form-options">
                    <label className="checkbox-container">
                      <input 
                        type="checkbox" 
                        id="remember" 
                        name="remember"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        disabled={isLoggingIn}
                      />
                      <span className="checkmark"></span>
                      Remember me
                    </label>
                    <Link to="/forgot-password" className="forgot-password">
                      Forgot Password?
                    </Link>
                  </div>

                  <button 
                    type="submit" 
                    className="btn btn--primary btn--full-width login-btn"
                    disabled={isLoggingIn}
                  >
                    {isLoggingIn ? (
                      <div className="btn-loading">
                        <div className="btn-spinner"></div>
                        <span className="btn-text">Signing In...</span>
                      </div>
                    ) : (
                      <span className="btn-text">Sign In</span>
                    )}
                  </button>
                </form>

                <div className="login-footer">
                  <p>Don't have an account?{' '}
                    <a href="#" className="signup-link" onClick={(e) => {
                      e.preventDefault();
                      alert('To create a new account, please contact your system administrator.');
                    }}>
                      Contact Administrator
                    </a>
                  </p>
                </div>
              </div>
            </div>

            <div className="login-info">
              <h3>Global Freight Solutions</h3>
              <p>Streamline your logistics operations with our comprehensive freight forwarding platform. Track shipments, manage documentation, optimize your supply chain all in one place.</p>
              <ul className="feature-list">
                <li>Real-time shipment tracking</li>
                <li>Automated documentation</li>
                <li>Global network coverage</li>
                <li>24/7 customer support</li>
              </ul>
              
              {/* Valid User Accounts Info */}
              <div className="user-accounts-info">
                <h4>Authorized Users:</h4>
                <p>• info@seal.co.in</p>
                <p>• pankaj.singh@seal.co.in</p>
                <p>• anshuman.singh@seal.co.in</p>
                <p>• transport@seal.co.in</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <p>&copy; 2025 Seal Freight. All rights reserved.</p>
            <div className="footer-links">
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
              <a href="#">Support</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Login;