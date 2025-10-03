// src/components/Login.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './inde.css'
import sealLogo from './seal.png'; // Import the image

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

useEffect(() => {
  // Simulate loading screen
  const timer = setTimeout(() => {
    setIsLoading(false);
  }, 2500);

  return () => clearTimeout(timer);
}, []); // Remove navigate from dependencies

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
    const result = await authenticateUser(email, password, rememberMe);
    
    if (result.success) {
      setMessage('Login successful! Redirecting to dashboard...');
      
      // Store authentication token
      localStorage.setItem('authToken', 'demo-token');
      if (rememberMe) {
        localStorage.setItem('rememberMe', 'true');
      }
      
      // Call the onLogin callback - this is crucial!
      if (onLogin) {
        onLogin(); // This should update the state in App.jsx
      }
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

  // Placeholder authentication function
  const authenticateUser = async (email, password, rememberMe) => {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Placeholder logic for demo purposes
    if (email === 'demo@freightco.com' && password === 'demo123') {
      return { success: true, user: { email } };
    } else if (email === 'admin@freightco.com' && password === 'admin123') {
      return { success: true, user: { email } };
    } else {
      return { 
        success: false, 
        error: 'Invalid credentials. Please check your email and password.' 
      };
    }
  };

  const handleForgotPassword = (e) => {
    e.preventDefault();
    const emailInput = prompt('Please enter your email address for password reset:');
    
    if (emailInput) {
      if (isValidEmail(emailInput)) {
        alert(`Password reset instructions would be sent to ${emailInput}. This feature will be implemented with Supabase integration.`);
      } else {
        alert('Please enter a valid email address.');
      }
    }
  };

  const handleContactAdmin = (e) => {
    e.preventDefault();
    alert('To create a new account, please contact your system administrator:\n\nEmail: admin@freightco.com\nPhone: +1 (555) 123-4567\n\nThey will set up your account and provide login credentials.');
  };

 const handleDemoLogin = (demoEmail, demoPassword) => {
  setEmail(demoEmail);
  setPassword(demoPassword);
  
  // Auto-submit after a short delay
  setTimeout(() => {
    const form = document.querySelector('.login-form');
    if (form) {
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);
    }
  }, 500);
};
 if (isLoading) {
    return (
      <div id="loading-screen" className="loading-screen">
        <div className="loading-container">
          <div className="logo-container" style={{textAlign: 'center'}}>
            <div className="logo-icon">
              <img 
                src={sealLogo} // Use the imported image
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
                src={sealLogo} // Use the imported image here too
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

                {/* Demo Login Buttons */}
                <div className="demo-buttons">
                  <button 
                    className="demo-btn admin-btn"
                    onClick={() => handleDemoLogin('admin@freightco.com', 'admin123')}
                    disabled={isLoggingIn}
                  >
                    Login as Admin
                  </button>
                  <button 
                    className="demo-btn user-btn"
                    onClick={() => handleDemoLogin('demo@freightco.com', 'demo123')}
                    disabled={isLoggingIn}
                  >
                    Login as Demo User
                  </button>
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
                    <a href="#" className="forgot-password" onClick={handleForgotPassword}>
                      Forgot Password?
                    </a>
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
                    <a href="#" className="signup-link" onClick={handleContactAdmin}>
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
              
              {/* Demo Credentials Info */}
              <div className="demo-credentials">
                <h4>Demo Credentials:</h4>
                <p><strong>Admin:</strong> admin@freightco.com / admin123</p>
                <p><strong>User:</strong> demo@freightco.com / demo123</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <p>&copy; 2025 Freight Co. All rights reserved.</p>
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