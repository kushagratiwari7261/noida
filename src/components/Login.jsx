import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';

// Import images - adjust the path based on your folder structure
// If images are in the same folder as this component:
import sealLogo from './seal.png';
import loadingImage from './image.png';

// OR if they're in a different folder, adjust the path:
// import sealLogo from '../assets/seal.png';
// import loadingImage from '../assets/image.png';

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
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 3000);
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
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const validUsers = [
        'info@seal.co.in',
        'pankaj.singh@seal.co.in',
        'anshuman.singh@seal.co.in',
        'transport@seal.co.in'
      ];

      if (validUsers.includes(email.toLowerCase()) && password.length >= 6) {
        setMessage('Login successful! Redirecting to dashboard...');
        
        if (rememberMe) {
          localStorage.setItem('rememberMe', 'true');
          localStorage.setItem('userEmail', email);
        }
        
        if (onLogin) {
          setTimeout(() => {
            onLogin(email, password);
          }, 1000);
        } else {
          setTimeout(() => {
            alert('Login successful! Dashboard would load here.');
          }, 1000);
        }
      } else {
        setMessage('Invalid email or password. Please try again.');
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
      <div className="loading-screen">
        <div className="loading-container">
          <div className="loading-content">
            <div className="loading-image-container">
              <img 
                src={loadingImage}
                alt="Loading" 
                className="loading-main-image"
              />
            </div>
            <p className="loading-text-large">Loading your workspace...</p>
            <div className="loading-progress">
              <div className="loading-progress-bar"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content">
      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        .loading-screen {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #0d6efd 0%, #0056b3 50%, #21808d 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
        }

        .loading-container {
          text-align: center;
          color: white;
          padding: 20px;
          width: 100%;
          max-width: 400px;
        }

        .loading-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 30px;
        }

        .loading-image-container {
          margin-bottom: 30px;
          animation: float 3s ease-in-out infinite;
        }

        .loading-main-image {
          width: 280px;
          max-width: 90vw;
          height: auto;
          border-radius: 20px;
          box-shadow: 
            0 20px 60px rgba(0, 0, 0, 0.3),
            0 0 0 1px rgba(255, 255, 255, 0.1);
          border: 3px solid rgba(255, 255, 255, 0.15);
        }

        .loading-text-large {
          font-size: 20px;
          font-weight: 600;
          color: white;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          letter-spacing: 0.5px;
        }

        .loading-progress {
          width: 100%;
          max-width: 200px;
          height: 4px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 2px;
          overflow: hidden;
        }

        .loading-progress-bar {
          height: 100%;
          background: linear-gradient(90deg, #fff, #e3f2fd);
          border-radius: 2px;
          animation: progress 3s ease-out forwards;
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes progress {
          0% { width: 0%; }
          100% { width: 100%; }
        }

        .main-content {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: linear-gradient(135deg, 
            rgba(13, 110, 253, 0.05) 0%, 
            rgba(108, 117, 125, 0.03) 50%, 
            rgba(33, 128, 141, 0.08) 100%);
        }

        .header {
          background-color: rgba(255, 255, 255, 0.98);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid rgba(222, 226, 230, 0.8);
          padding: 16px 0;
          box-shadow: 0 2px 20px rgba(0, 0, 0, 0.08);
        }

        .container {
          width: 100%;
          max-width: 1280px;
          margin: 0 auto;
          padding: 0 20px;
        }

        .logo-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo-image {
          height: 50px;
          width: auto;
          max-width: 200px;
        }

        .main-section {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 0;
          position: relative;
          overflow: hidden;
        }

        .background-pattern {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: 
            radial-gradient(circle at 20% 80%, rgba(13, 110, 253, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(33, 128, 141, 0.06) 0%, transparent 50%);
          pointer-events: none;
        }

        .login-wrapper {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          width: 100%;
          max-width: 1100px;
          align-items: center;
          position: relative;
          z-index: 1;
        }

        .login-card {
          background: rgba(255, 255, 255, 0.98);
          backdrop-filter: blur(20px);
          box-shadow: 
            0 20px 60px rgba(0, 0, 0, 0.12),
            0 0 0 1px rgba(255, 255, 255, 0.2);
          border: none;
          border-radius: 20px;
          max-width: 480px;
          width: 100%;
          justify-self: end;
          position: relative;
          overflow: hidden;
        }

        .login-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, #0d6efd, #21808d);
        }

        .card-body {
          padding: 40px 32px;
        }

        .login-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .login-header h2 {
          color: #212529;
          margin-bottom: 8px;
          font-weight: 700;
          font-size: 28px;
          letter-spacing: -0.5px;
        }

        .login-subtitle {
          color: #6c757d;
          margin: 0;
          font-size: 14px;
          font-weight: 400;
        }

        .success-message,
        .error-message {
          padding: 12px 16px;
          border-radius: 10px;
          margin-bottom: 20px;
          text-align: center;
          font-size: 14px;
          font-weight: 500;
          backdrop-filter: blur(10px);
          animation: slideIn 0.3s ease-out;
        }

        .success-message {
          background: rgba(25, 135, 84, 0.12);
          color: #198754;
          border: 1px solid rgba(25, 135, 84, 0.25);
        }

        .error-message {
          background: rgba(220, 53, 69, 0.12);
          color: #dc3545;
          border: 1px solid rgba(220, 53, 69, 0.25);
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .login-form {
          margin-bottom: 28px;
        }

        .form-group {
          margin-bottom: 20px;
          position: relative;
        }

        .form-label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          font-size: 14px;
          color: #212529;
          letter-spacing: -0.2px;
        }

        .form-control {
          display: block;
          width: 100%;
          padding: 12px 14px;
          font-size: 15px;
          line-height: 1.5;
          color: #212529;
          background-color: #ffffff;
          border: 2px solid #e9ecef;
          border-radius: 10px;
          transition: all 0.2s ease;
          font-weight: 400;
        }

        .form-control::placeholder {
          color: #adb5bd;
          opacity: 1;
        }

        .form-control:focus {
          border-color: #0d6efd;
          box-shadow: 0 0 0 4px rgba(13, 110, 253, 0.12);
          background: #ffffff;
          color: #212529;
          outline: none;
        }

        .form-control:disabled {
          background-color: #f8f9fa;
          cursor: not-allowed;
          opacity: 0.7;
        }

        .password-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .password-input-wrapper .form-control {
          padding-right: 48px;
        }

        .password-toggle {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          padding: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #6c757d;
          transition: all 0.2s ease;
          border-radius: 6px;
          z-index: 2;
        }

        .password-toggle:hover {
          color: #0d6efd;
          background: rgba(13, 110, 253, 0.08);
        }

        .password-toggle:focus {
          outline: 2px solid rgba(13, 110, 253, 0.4);
          outline-offset: 2px;
        }

        .password-toggle:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .field-error {
          color: #dc3545;
          font-size: 13px;
          margin-top: 6px;
          display: flex;
          align-items: center;
          gap: 4px;
          font-weight: 500;
        }

        .field-error::before {
          content: '⚠';
          font-size: 13px;
        }

        .form-options {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          gap: 12px;
        }

        .checkbox-container {
          display: flex;
          align-items: center;
          cursor: pointer;
          font-size: 14px;
          color: #495057;
          transition: color 0.2s ease;
          user-select: none;
        }

        .checkbox-container:hover {
          color: #212529;
        }

        .checkbox-container input {
          display: none;
        }

        .checkmark {
          width: 20px;
          height: 20px;
          border: 2px solid #dee2e6;
          border-radius: 5px;
          margin-right: 8px;
          position: relative;
          transition: all 0.3s ease;
          background: #ffffff;
          flex-shrink: 0;
        }

        .checkbox-container:hover .checkmark {
          border-color: #0d6efd;
        }

        .checkbox-container input:checked + .checkmark {
          background-color: #0d6efd;
          border-color: #0d6efd;
        }

        .checkbox-container input:checked + .checkmark::after {
          content: '';
          position: absolute;
          left: 6px;
          top: 2px;
          width: 5px;
          height: 10px;
          border: solid white;
          border-width: 0 2.5px 2.5px 0;
          transform: rotate(45deg);
        }

        .forgot-password {
          color: #0d6efd;
          font-size: 14px;
          text-decoration: none;
          transition: all 0.2s ease;
          font-weight: 500;
          white-space: nowrap;
        }

        .forgot-password:hover {
          color: #0056b3;
          text-decoration: underline;
        }

        .login-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          position: relative;
          background: linear-gradient(135deg, #0d6efd, #21808d);
          border: none;
          font-weight: 600;
          font-size: 16px;
          color: white;
          transition: all 0.3s ease;
          border-radius: 10px;
          padding: 14px;
          overflow: hidden;
          cursor: pointer;
          letter-spacing: 0.3px;
        }

        .login-btn::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
          transition: left 0.5s ease;
        }

        .login-btn:hover::before {
          left: 100%;
        }

        .login-btn:hover {
          transform: translateY(-2px);
          box-shadow: 
            0 12px 35px rgba(13, 110, 253, 0.4),
            0 0 0 1px rgba(255, 255, 255, 0.1);
        }

        .login-btn:active {
          transform: translateY(0);
        }

        .login-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none !important;
        }

        .btn-loading {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .btn-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top: 2px solid white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .login-footer {
          text-align: center;
          color: #6c757d;
          font-size: 14px;
          padding-top: 20px;
          border-top: 1px solid rgba(222, 226, 230, 0.6);
        }

        .signup-link {
          color: #0d6efd;
          text-decoration: none;
          font-weight: 600;
          transition: all 0.2s ease;
        }

        .signup-link:hover {
          color: #0056b3;
          text-decoration: underline;
        }

        .login-info {
          justify-self: start;
          padding: 32px;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          border-radius: 20px;
          box-shadow: 
            0 10px 40px rgba(0, 0, 0, 0.1),
            0 0 0 1px rgba(255, 255, 255, 0.2);
        }

        .login-info h3 {
          color: #212529;
          margin-bottom: 16px;
          font-size: 24px;
          font-weight: 700;
          letter-spacing: -0.5px;
        }

        .login-info p {
          color: #6c757d;
          margin-bottom: 24px;
          line-height: 1.6;
          font-size: 14px;
        }

        .feature-list {
          list-style: none;
          padding: 0;
          margin: 0 0 28px 0;
        }

        .feature-list li {
          color: #495057;
          margin-bottom: 12px;
          position: relative;
          padding-left: 28px;
          font-size: 14px;
          font-weight: 500;
        }

        .feature-list li::before {
          content: '✓';
          position: absolute;
          left: 0;
          color: #0d6efd;
          font-weight: bold;
          background: rgba(13, 110, 253, 0.12);
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
        }

        .user-accounts-info {
          background: linear-gradient(135deg, rgba(13, 110, 253, 0.08), rgba(33, 128, 141, 0.12));
          padding: 16px;
          border-radius: 12px;
          border-left: 3px solid #0d6efd;
        }

        .user-accounts-info h4 {
          color: #212529;
          margin-bottom: 10px;
          font-size: 14px;
          font-weight: 700;
        }

        .user-accounts-info p {
          color: #495057;
          margin-bottom: 5px;
          font-size: 12px;
          font-family: 'Courier New', monospace;
          font-weight: 500;
          word-break: break-all;
        }

        .footer {
          background-color: rgba(255, 255, 255, 0.98);
          backdrop-filter: blur(10px);
          border-top: 1px solid rgba(222, 226, 230, 0.8);
          padding: 20px 0;
          margin-top: auto;
        }

        .footer-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: #6c757d;
          font-size: 14px;
        }

        .footer-links {
          display: flex;
          gap: 20px;
        }

        .footer-links a {
          color: #6c757d;
          text-decoration: none;
          transition: color 0.2s ease;
          font-weight: 500;
        }

        .footer-links a:hover {
          color: #0d6efd;
        }

        /* Tablet and below */
        @media (max-width: 968px) {
          .login-wrapper {
            grid-template-columns: 1fr;
            gap: 32px;
            max-width: 520px;
          }

          .login-card {
            justify-self: center;
            max-width: 100%;
          }

          .login-info {
            justify-self: center;
            order: -1;
            max-width: 100%;
          }

          .main-section {
            padding: 32px 0;
          }
        }

        /* Mobile devices */
        @media (max-width: 640px) {
          .container {
            padding: 0 16px;
          }

          .header {
            padding: 12px 0;
          }

          .logo-image {
            height: 40px;
          }

          .main-section {
            padding: 24px 0;
          }

          .card-body {
            padding: 28px 20px;
          }

          .login-info {
            padding: 24px 20px;
          }

          .login-header h2 {
            font-size: 24px;
          }

          .login-subtitle {
            font-size: 13px;
          }

          .login-info h3 {
            font-size: 20px;
          }

          .login-info p {
            font-size: 13px;
          }

          .feature-list li {
            font-size: 13px;
            padding-left: 26px;
          }

          .form-control {
            padding: 11px 12px;
            font-size: 14px;
          }

          .form-label {
            font-size: 13px;
          }

          .form-options {
            flex-direction: column;
            gap: 12px;
            align-items: flex-start;
            margin-bottom: 20px;
          }

          .checkbox-container {
            font-size: 13px;
          }

          .forgot-password {
            font-size: 13px;
          }

          .login-btn {
            padding: 12px;
            font-size: 15px;
          }

          .footer-content {
            flex-direction: column;
            gap: 12px;
            text-align: center;
            font-size: 13px;
          }

          .footer-links {
            flex-direction: column;
            gap: 8px;
            align-items: center;
          }

          .user-accounts-info {
            padding: 14px;
          }

          .user-accounts-info h4 {
            font-size: 13px;
          }

          .user-accounts-info p {
            font-size: 11px;
          }

          .success-message,
          .error-message {
            font-size: 13px;
            padding: 10px 14px;
          }

          .loading-text-large {
            font-size: 18px;
          }

          .loading-main-image {
            width: 200px;
          }
        }

        /* Extra small devices */
        @media (max-width: 380px) {
          .card-body {
            padding: 24px 16px;
          }

          .login-info {
            padding: 20px 16px;
          }

          .login-header h2 {
            font-size: 22px;
          }

          .form-control {
            padding: 10px;
            font-size: 14px;
          }

          .password-input-wrapper .form-control {
            padding-right: 44px;
          }

          .login-btn {
            padding: 11px;
            font-size: 14px;
          }
        }

        /* Landscape mode for mobile */
        @media (max-width: 968px) and (max-height: 600px) {
          .main-section {
            padding: 20px 0;
          }

          .login-wrapper {
            gap: 20px;
          }

          .card-body {
            padding: 24px 20px;
          }

          .login-header {
            margin-bottom: 20px;
          }

          .form-group {
            margin-bottom: 16px;
          }

          .form-options {
            margin-bottom: 16px;
          }

          .login-form {
            margin-bottom: 20px;
          }
        }
      `}</style>

      <header className="header">
        <div className="container">
          <div className="logo-header">
            <img src={sealLogo} alt="Seal Freight Logo" className="logo-image" />
          </div>
        </div>
      </header>

      <main className="main-section">
        <div className="background-pattern"></div>
        <div className="container">
          <div className="login-wrapper">
            <div className="login-card">
              <div className="card-body">
                <div className="login-header">
                  <h2>Welcome Back</h2>
                  <p className="login-subtitle">Sign in to your Seal Freight account</p>
                </div>

                {message && (
                  <div className={message.includes('successful') ? 'success-message' : 'error-message'}>
                    {message}
                  </div>
                )}

                <form className="login-form" onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label htmlFor="email" className="form-label">Email Address</label>
                    <input 
                      type="email" 
                      id="email" 
                      name="email" 
                      className="form-control"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoggingIn}
                    />
                    {errors.email && <div className="field-error">{errors.email}</div>}
                  </div>

                  <div className="form-group">
                    <label htmlFor="password" className="form-label">Password</label>
                    <div className="password-input-wrapper">
                      <input 
                        type={showPassword ? "text" : "password"}
                        id="password" 
                        name="password" 
                        className="form-control"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoggingIn}
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={isLoggingIn}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
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
                    <a href="#" className="forgot-password" onClick={(e) => e.preventDefault()}>
                      Forgot Password?
                    </a>
                  </div>

                  <button 
                    type="submit"
                    className="login-btn"
                    disabled={isLoggingIn}
                  >
                    {isLoggingIn ? (
                      <div className="btn-loading">
                        <div className="btn-spinner"></div>
                        <span>Signing In...</span>
                      </div>
                    ) : (
                      <span>Sign In</span>
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
              <p>Streamline your logistics operations with our comprehensive freight forwarding platform. Track shipments, manage documentation, and optimize your supply chain all in one place.</p>
              <ul className="feature-list">
                <li>Real-time shipment tracking</li>
                <li>Automated documentation</li>
                <li>Global network coverage</li>
                <li>24/7 customer support</li>
              </ul>
              
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