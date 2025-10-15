// src/components/ForgotPassword.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import './inde.css';
import sealLogo from './seal.png';

const ForgotPassword = ({ onResetPassword }) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState({});

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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      // Call the password reset function from App.jsx
      const result = await onResetPassword(email);
      
      if (result.success) {
        setMessage('Password reset instructions have been sent to your email!');
      } else {
        setMessage(result.error || 'Failed to send reset instructions. Please try again.');
      }
    } catch (error) {
      console.error('Password reset error:', error);
      setMessage('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

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
                  <h2>Reset Your Password</h2>
                  <p className="login-subtitle">Enter your email to receive reset instructions</p>
                </div>

                {message && (
                  <div className={message.includes('sent') ? 'success-message' : 'error-message'}>
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
                      disabled={isLoading}
                    />
                    {errors.email && <div className="field-error">{errors.email}</div>}
                  </div>

                  <button 
                    type="submit" 
                    className="btn btn--primary btn--full-width login-btn"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <div className="btn-loading">
                        <div className="btn-spinner"></div>
                        <span className="btn-text">Sending...</span>
                      </div>
                    ) : (
                      <span className="btn-text">Send Reset Instructions</span>
                    )}
                  </button>
                </form>

                <div className="login-footer">
                  <p>Remember your password?{' '}
                    <Link to="/login" className="signup-link">
                      Back to Sign In
                    </Link>
                  </p>
                </div>
              </div>
            </div>

            <div className="login-info">
              <h3>Password Assistance</h3>
              <p>If you're having trouble accessing your account, we'll send password reset instructions to your registered email address.</p>
              
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

export default ForgotPassword;