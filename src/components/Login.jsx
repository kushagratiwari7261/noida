import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

import sealLogo from '../seal.png';
import loadingImage from './image.png';
import './Login.css';

// ===== SUPABASE CONFIGURATION =====
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

let supabase = null;
if (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('https://')) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 3000);
    checkUser();
    return () => clearTimeout(timer);
  }, []);

  const checkUser = async () => {
    if (!supabase) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && session.user && onLogin) {
        onLogin(session.user.email, session.access_token);
      }
    } catch (err) {
      console.error('Error checking user session:', err);
    }
  };

  const isValidEmail = (em) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);

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
    if (!validateForm()) return;
    if (!supabase) {
      setMessage('Supabase is not configured. Please add your credentials.');
      return;
    }
    setIsLoggingIn(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      if (data.session && data.user) {
        setMessage('Login successful! Redirecting to dashboard...');
        if (rememberMe) {
          localStorage.setItem('rememberMe', 'true');
          localStorage.setItem('userEmail', email);
        }
        await supabase.auth.getSession();
        setTimeout(() => { window.location.href = '/dashboard'; }, 1000);
      } else {
        throw new Error('No session data received');
      }
    } catch (err) {
      console.error('Login error:', err);
      const msg = err.message || '';
      if (msg.includes('Invalid login credentials')) {
        setMessage('Invalid email or password. Please try again.');
      } else if (msg.includes('Email not confirmed')) {
        setMessage('Please verify your email address before logging in.');
      } else if (msg.includes('User not found')) {
        setMessage('No account found with this email address.');
      } else if (msg.includes('rate limit')) {
        setMessage('Too many login attempts. Please try again in a few minutes.');
      } else {
        setMessage('An error occurred during login. Please try again.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isLoggingIn) handleSubmit(e);
  };

  // ── Loading screen ────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="login-screen-loading">
        <div className="login-loading-inner">
          <img src={loadingImage} alt="Loading" className="login-loading-logo" />
          <p className="login-loading-text">Loading your workspace…</p>
          <div className="login-loading-bar">
            <div className="login-loading-fill" />
          </div>
        </div>
      </div>
    );
  }

  // ── Main login (centered) ─────────────────────────────────────
  return (
    <div className="login-page">
      {/* Animated background orbs */}
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />

      <div className="login-center-wrap">

        {/* Logo above card */}
        <div className="login-top-logo">
          <img src={sealLogo} alt="Seal Freight" className="login-logo-img" />
          <span className="login-logo-brand">Seal Freight</span>
        </div>

        {/* Login card */}
        <div className="login-card">
          <div className="login-card-header">
            <div className="login-card-avatar">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <h2>Welcome Back</h2>
            <p className="login-card-subtitle">Sign in to your Seal Freight account</p>
          </div>

          {message && (
            <div className={`login-msg ${message.includes('successful') ? 'success' : 'error'}`}>
              {message.includes('successful') ? '✓' : '⚠'} {message}
            </div>
          )}

          <form className="lf-form" onSubmit={handleSubmit} onKeyPress={handleKeyPress}>
            {/* Email */}
            <div className="lf-group">
              <label htmlFor="email" className="lf-label">Email Address</label>
              <div className="lf-input-wrap">
                <span className="lf-input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </span>
                <input
                  type="email"
                  id="email"
                  name="email"
                  className="lf-input"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoggingIn}
                  autoComplete="email"
                />
              </div>
              {errors.email && <div className="lf-field-err">{errors.email}</div>}
            </div>

            {/* Password */}
            <div className="lf-group">
              <label htmlFor="password" className="lf-label">Password</label>
              <div className="lf-input-wrap lf-pw-wrap">
                <span className="lf-input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  className="lf-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoggingIn}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="lf-pw-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoggingIn}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {errors.password && <div className="lf-field-err">{errors.password}</div>}
            </div>

            <div className="lf-options">
              <label className="lf-remember">
                <input
                  type="checkbox"
                  id="remember"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={isLoggingIn}
                />
                Remember me
              </label>
              <a
                href="#"
                className="lf-forgot"
                onClick={(e) => { e.preventDefault(); window.location.href = '/forgot-password'; }}
              >
                Forgot Password?
              </a>
            </div>

            <button type="submit" className="lf-submit" disabled={isLoggingIn}>
              {isLoggingIn ? (
                <span className="lf-spinner-wrap">
                  <span className="lf-spinner" />
                  Signing In…
                </span>
              ) : (
                'Sign In →'
              )}
            </button>
          </form>

          <div className="login-card-footer">
            <p>
              Don&apos;t have an account?{' '}
              <a
                href="#"
                className="lf-contact-link"
                onClick={(e) => {
                  e.preventDefault();
                  alert('To create a new account, please contact your system administrator.');
                }}
              >
                Contact Administrator
              </a>
            </p>
          </div>
        </div>

        <p className="login-copyright">© 2025 Seal Freight. All rights reserved.</p>
      </div>
    </div>
  );
};

export default Login;
