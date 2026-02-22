// src/components/ResetPassword.jsx
import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import './inde.css';
import sealLogo from './seal.png';

const ResetPassword = ({ onUpdatePassword }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState({});
  const [passwordStrength, setPasswordStrength] = useState('');
  
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    handleSupabaseResetFlow();
  }, []);

  // Check password strength
  useEffect(() => {
    if (password.length === 0) {
      setPasswordStrength('');
      return;
    }

    let strength = 'Weak';
    let score = 0;

    // Length check
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;

    // Character variety checks
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    // Common password patterns to avoid
    const commonPatterns = [
      '123456', 'password', 'qwerty', 'admin', 'welcome',
      '12345678', '123456789', '1234567890'
    ];

    const isCommon = commonPatterns.some(pattern => 
      password.toLowerCase().includes(pattern)
    );

    if (isCommon) {
      strength = 'Too Common';
    } else if (score >= 6) {
      strength = 'Strong';
    } else if (score >= 4) {
      strength = 'Good';
    } else if (score >= 2) {
      strength = 'Fair';
    } else {
      strength = 'Weak';
    }

    setPasswordStrength(strength);
  }, [password]);

  const handleSupabaseResetFlow = async () => {
    try {
      // Get the hash parameters from URL (Supabase uses hash for auth redirects)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const type = hashParams.get('type');
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      // Also check regular query parameters
      const queryType = searchParams.get('type');
      const queryAccessToken = searchParams.get('access_token');
      const queryRefreshToken = searchParams.get('refresh_token');

      const finalType = type || queryType;
      const finalAccessToken = accessToken || queryAccessToken;
      const finalRefreshToken = refreshToken || queryRefreshToken;

      console.log('Reset password flow detected:', { 
        type: finalType, 
        hasAccessToken: !!finalAccessToken,
        hasRefreshToken: !!finalRefreshToken
      });

      // If we have recovery tokens, set the session
      if (finalType === 'recovery' && finalAccessToken) {
        console.log('Setting recovery session...');
        
        const { error } = await supabase.auth.setSession({
          access_token: finalAccessToken,
          refresh_token: finalRefreshToken || ''
        });

        if (error) {
          console.error('Error setting recovery session:', error);
          setMessage('This reset link is invalid or has expired. Please request a new one.');
        } else {
          console.log('Recovery session set successfully');
        }
      } else {
        // Check if we already have a valid session
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.log('No valid session found');
          setMessage('Please use a valid password reset link from your email.');
        }
      }
    } catch (error) {
      console.error('Error in reset flow:', error);
      setMessage('An error occurred while processing your reset link. Please try again.');
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    } else if (passwordStrength === 'Too Common' || passwordStrength === 'Weak') {
      newErrors.password = 'Please choose a stronger, more unique password';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getPasswordStrengthColor = () => {
    switch (passwordStrength) {
      case 'Strong': return '#10b981';
      case 'Good': return '#3b82f6';
      case 'Fair': return '#f59e0b';
      case 'Weak': return '#ef4444';
      case 'Too Common': return '#dc2626';
      default: return '#6b7280';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const result = await onUpdatePassword(password);
      
      if (result.success) {
        setMessage('Password updated successfully! Redirecting to login...');
        
        // Clear the URL parameters after successful reset
        window.history.replaceState({}, document.title, window.location.pathname);
        
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      } else {
        setMessage(result.error || 'Failed to update password. Please try again.');
      }
    } catch (error) {
      console.error('Password update error:', error);
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
                  <h2>Set New Password</h2>
                  <p className="login-subtitle">Create your new password</p>
                </div>

                {message && (
                  <div className={message.includes('successfully') ? 'success-message' : 'error-message'}>
                    {message}
                    {message.includes('invalid') || message.includes('expired') ? (
                      <div style={{ marginTop: '10px' }}>
                        <Link to="/forgot-password" className="signup-link">
                          Request New Reset Link
                        </Link>
                      </div>
                    ) : null}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="login-form">
                  <div className="form-group">
                    <label htmlFor="password" className="form-label">New Password</label>
                    <input 
                      type="password" 
                      id="password" 
                      name="password" 
                      className={`form-control ${errors.password ? 'error' : ''}`}
                      placeholder="Enter new password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      minLength="8"
                    />
                    {password && (
                      <div style={{ 
                        marginTop: '5px', 
                        fontSize: '14px',
                        color: getPasswordStrengthColor(),
                        fontWeight: 'bold'
                      }}>
                        Strength: {passwordStrength}
                      </div>
                    )}
                    {errors.password && <div className="field-error">{errors.password}</div>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="confirmPassword" className="form-label">Confirm New Password</label>
                    <input 
                      type="password" 
                      id="confirmPassword" 
                      name="confirmPassword" 
                      className={`form-control ${errors.confirmPassword ? 'error' : ''}`}
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      disabled={isLoading}
                    />
                    {errors.confirmPassword && <div className="field-error">{errors.confirmPassword}</div>}
                  </div>

                  <button 
                    type="submit" 
                    className="btn btn--primary btn--full-width login-btn"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <div className="btn-loading">
                        <div className="btn-spinner"></div>
                        <span className="btn-text">Updating...</span>
                      </div>
                    ) : (
                      <span className="btn-text">Update Password</span>
                    )}
                  </button>
                </form>

                <div className="login-footer">
                  <p>
                    <Link to="/login" className="signup-link">
                      Back to Sign In
                    </Link>
                  </p>
                </div>
              </div>
            </div>

            <div className="login-info">
              <h3>Password Requirements</h3>
              <p>To meet security standards, your password must:</p>
              <ul>
                <li>Be at least 8 characters long (12+ recommended)</li>
                <li>Include uppercase and lowercase letters</li>
                <li>Include numbers and special characters</li>
                <li>Not be a common or easily guessable password</li>
                <li>Not contain common patterns like "123456" or "password"</li>
              </ul>
              
              <div style={{ marginTop: '20px', padding: '12px', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
                <strong>Tip:</strong> Use a unique phrase or combination that's meaningful to you but hard for others to guess.
              </div>

              <div style={{ marginTop: '15px', padding: '12px', backgroundColor: '#e8f5e8', borderRadius: '4px' }}>
                <strong>Example of a strong password:</strong> "Blue@Ocean2024!Ship" or "Winter#Mountain99$Freight"
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

export default ResetPassword;