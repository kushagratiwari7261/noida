import { useState } from 'react';
import { Link } from 'react-router-dom';
import sealLogo from '../seal.png';
import './Login.css';


const ForgotPassword = ({ onResetPassword }) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState({});

  const isValidEmail = (em) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);

  const validateForm = () => {
    const newErrors = {};
    if (!email) { newErrors.email = 'Email is required'; }
    else if (!isValidEmail(email)) { newErrors.email = 'Please enter a valid email address'; }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    if (!validateForm()) return;
    setIsLoading(true);
    try {
      const result = await onResetPassword(email);
      if (result.success) {
        setSent(true);
        setMessage('Reset instructions sent! Check your inbox.');
      } else {
        setMessage(result.error || 'Failed to send reset email. Please try again.');
      }
    } catch (err) {
      console.error('Password reset error:', err);
      setMessage('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Animated background orbs — same as Login */}
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />

      <div className="login-center-wrap">
        {/* Logo */}
        <div className="login-top-logo">
          <img src={sealLogo} alt="Seal Freight" className="login-logo-img" />
          <span className="login-logo-brand">Seal Freight</span>
        </div>

        {/* Card */}
        <div className="login-card">
          <div className="login-card-header">
            <div className="login-card-avatar" style={{ background: sent ? 'linear-gradient(135deg,#059669,#34d399)' : undefined }}>
              {sent ? (
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              )}
            </div>
            <h2>{sent ? 'Email Sent!' : 'Reset Password'}</h2>
            <p className="login-card-subtitle">
              {sent
                ? 'Check your inbox for reset instructions'
                : 'Enter your email and we\'ll send you a reset link'}
            </p>
          </div>

          {message && (
            <div className={`login-msg ${sent ? 'success' : 'error'}`}>
              {sent ? '✓' : '⚠'} {message}
            </div>
          )}

          {!sent ? (
            <form className="lf-form" onSubmit={handleSubmit}>
              <div className="lf-group">
                <label htmlFor="fp-email" className="lf-label">Email Address</label>
                <div className="lf-input-wrap">
                  <span className="lf-input-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                  </span>
                  <input
                    type="email"
                    id="fp-email"
                    className="lf-input"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    autoComplete="email"
                  />
                </div>
                {errors.email && <div className="lf-field-err">{errors.email}</div>}
              </div>

              {/* Authorized users hint */}
              <div style={{
                background: 'rgba(99,102,241,0.06)',
                border: '1px solid rgba(99,102,241,0.12)',
                borderRadius: 12,
                padding: '12px 14px',
                marginBottom: 20,
                fontSize: 12.5,
                color: '#64748b',
                lineHeight: 1.7,
              }}>
                <strong style={{ color: '#6366f1', display: 'block', marginBottom: 4 }}>Authorized accounts:</strong>
                info@seal.co.in · pankaj.singh@seal.co.in<br />
                anshuman.singh@seal.co.in · transport@seal.co.in
              </div>

              <button type="submit" className="lf-submit" disabled={isLoading}>
                {isLoading ? (
                  <span className="lf-spinner-wrap">
                    <span className="lf-spinner" />
                    Sending…
                  </span>
                ) : (
                  'Send Reset Link →'
                )}
              </button>
            </form>
          ) : (
            /* Success state */
            <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
              <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.7, marginBottom: 20 }}>
                Didn't receive it? Check your spam folder or try again with a different address.
              </p>
              <button
                className="lf-submit"
                onClick={() => { setSent(false); setMessage(''); setEmail(''); }}
                style={{ marginBottom: 0 }}
              >
                Try Again
              </button>
            </div>
          )}

          <div className="login-card-footer">
            <p>
              Remember your password?{' '}
              <Link to="/login" className="lf-contact-link">Back to Sign In</Link>
            </p>
          </div>
        </div>

        <p className="login-copyright">© 2025 Seal Freight. All rights reserved.</p>
      </div>
    </div>
  );
};

export default ForgotPassword;