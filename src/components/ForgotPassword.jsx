// src/components/ForgotPassword.jsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import './inde.css'
import sealLogo from './seal.png';

const ForgotPassword = ({ onForgotPassword }) => {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!email) {
      setError('Please enter your email address');
      return;
    }

    setIsLoading(true)
    setError('')

    try {
      const result = await onForgotPassword(email)
      
      if (result.success) {
        setSuccess(true)
      } else {
        setError(result.error || 'Failed to send reset email. Please try again.')
      }
    } catch (error) {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
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
                  <h2>Reset Your Password</h2>
                  <p className="login-subtitle">
                    {success 
                      ? 'Check your email for reset instructions' 
                      : 'Enter your email to receive a password reset link'
                    }
                  </p>
                </div>

                {error && (
                  <div className="error-message">
                    {error}
                  </div>
                )}

                {success ? (
                  <div className="success-message">
                    <div className="success-icon">✓</div>
                    <h3>Email Sent Successfully!</h3>
                    <p>We've sent password reset instructions to <strong>{email}</strong></p>
                    <p>Please check your email and follow the link to reset your password.</p>
                    
                    <div className="forgot-password-actions">
                      <Link to="/login" className="btn btn--primary btn--full-width">
                        Back to Login
                      </Link>
                    </div>
                    
                    <div className="support-note">
                      <p>Didn't receive the email? Check your spam folder or <a href="mailto:support@seal.co.in">contact support</a>.</p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="login-form">
                    <div className="form-group">
                      <label htmlFor="email" className="form-label">Email Address</label>
                      <input 
                        type="email" 
                        id="email" 
                        name="email" 
                        className="form-control"
                        placeholder="Enter your email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={isLoading}
                      />
                    </div>

                    <button 
                      type="submit" 
                      className="btn btn--primary btn--full-width login-btn"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <div className="btn-loading">
                          <div className="btn-spinner"></div>
                          <span className="btn-text">Sending Reset Link...</span>
                        </div>
                      ) : (
                        <span className="btn-text">Send Reset Link</span>
                      )}
                    </button>

                    <div className="forgot-password-actions">
                      <Link to="/login" className="back-to-login">
                        ← Back to Login
                      </Link>
                    </div>
                  </form>
                )}

                <div className="login-footer">
                  <p>Need help?{' '}
                    <a href="mailto:support@seal.co.in" className="signup-link">
                      Contact Support
                    </a>
                  </p>
                </div>
              </div>
            </div>

            <div className="login-info">
              <h3>Secure Password Recovery</h3>
              <p>Our secure password recovery system ensures that only authorized users can reset their passwords. You'll receive a secure link in your email to create a new password.</p>
              <ul className="feature-list">
                <li>Secure email verification</li>
                <li>Time-sensitive reset links</li>
                <li>One-click password reset</li>
                <li>24/7 security monitoring</li>
              </ul>
              
              <div className="security-tips">
                <h4>Security Tips:</h4>
                <p>• Use a strong, unique password</p>
                <p>• Never share your password</p>
                <p>• Update your password regularly</p>
                <p>• Use two-factor authentication if available</p>
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
  )
}

export default ForgotPassword