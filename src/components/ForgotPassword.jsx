// src/components/ForgotPassword.jsx
import { useState } from 'react'
import { Link } from 'react-router-dom'

const ForgotPassword = ({ onForgotPassword }) => {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    setSuccess(false)

    const result = await onForgotPassword(email)
    
    if (result.success) {
      setSuccess(true)
    } else {
      setError(result.error)
    }
    
    setIsLoading(false)
  }

  return (
    <div className="login-container">
      <form onSubmit={handleSubmit} className="login-form">
        <h2>Reset Your Password</h2>
        
        {success ? (
          <div className="success-message">
            <p>Password reset email sent!</p>
            <p>Check your email for instructions to reset your password.</p>
            <Link to="/login" className="back-to-login">
              Back to Login
            </Link>
          </div>
        ) : (
          <>
            {error && <div className="error-message">{error}</div>}
            <p>Enter your email address and we'll send you a link to reset your password.</p>
            
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            
            <button type="submit" disabled={isLoading}>
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </button>
            
            <div className="login-link">
              <Link to="/login">Back to Login</Link>
            </div>
          </>
        )}
      </form>
    </div>
  )
}

export default ForgotPassword