import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { createClient } from '@supabase/supabase-js'
import './ChangePassword.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = supabaseUrl && supabaseKey && supabaseUrl.startsWith('https://')
    ? createClient(supabaseUrl, supabaseKey)
    : null

const ChangePassword = () => {
    const navigate = useNavigate()
    const [current, setCurrent] = useState('')
    const [newPass, setNewPass] = useState('')
    const [confirm, setConfirm] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)

    /* ── Validation ── */
    const validate = () => {
        if (!current) return 'Please enter your current password.'
        if (newPass.length < 8) return 'New password must be at least 8 characters.'
        if (newPass === current) return 'New password must be different from your current password.'
        if (newPass !== confirm) return 'Passwords do not match.'
        return null
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        const err = validate()
        if (err) { setError(err); return }

        setLoading(true)
        try {
            if (supabase) {
                /*
                 * Supabase Auth — updateUser changes the password for the
                 * currently authenticated user. The user must have a valid
                 * session (i.e. be logged in).
                 *
                 * Supabase internally verifies the JWT and applies the change
                 * through the auth.users table in PostgreSQL.
                 *
                 * For re-authentication before the update you can call
                 * supabase.auth.signInWithPassword({ email, password: current })
                 * and only proceed if successful.
                 */
                const { error: authError } = await supabase.auth.updateUser({
                    password: newPass,
                })
                if (authError) throw authError
            } else {
                // Dev fallback — no Supabase configured
                await new Promise(r => setTimeout(r, 800))
            }
            setSuccess(true)
        } catch (err) {
            setError(err.message ?? 'Something went wrong. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    /* ── Strength meter ── */
    const strength = (() => {
        if (!newPass) return 0
        let s = 0
        if (newPass.length >= 8) s++
        if (/[A-Z]/.test(newPass)) s++
        if (/[0-9]/.test(newPass)) s++
        if (/[^A-Za-z0-9]/.test(newPass)) s++
        return s
    })()
    const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strength]
    const strengthClass = ['', 'weak', 'fair', 'good', 'strong'][strength]

    if (success) return (
        <div className="cp-page">
            <div className="cp-card">
                <div className="cp-success-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                </div>
                <h2 className="cp-title">Password Updated</h2>
                <p className="cp-sub">Your password has been changed successfully.</p>
                <button className="cp-btn" onClick={() => navigate('/settings')}>
                    Back to Settings
                </button>
            </div>
        </div>
    )

    return (
        <div className="cp-page">
            <div className="cp-card">

                {/* Back link */}
                <Link to="/settings" className="cp-back">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                    Settings
                </Link>

                {/* Icon */}
                <div className="cp-icon-wrap">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                </div>

                <h2 className="cp-title">Change Password</h2>
                <p className="cp-sub">Choose a strong password you haven't used before.</p>

                <form className="cp-form" onSubmit={handleSubmit} autoComplete="off">

                    {/* Current password */}
                    <div className="cp-field">
                        <label className="cp-label">Current Password</label>
                        <input
                            type="password"
                            className="cp-input"
                            placeholder="Enter current password"
                            value={current}
                            onChange={e => setCurrent(e.target.value)}
                            autoComplete="current-password"
                            required
                        />
                    </div>

                    {/* New password + strength */}
                    <div className="cp-field">
                        <label className="cp-label">New Password</label>
                        <input
                            type="password"
                            className="cp-input"
                            placeholder="Min. 8 characters"
                            value={newPass}
                            onChange={e => setNewPass(e.target.value)}
                            autoComplete="new-password"
                            required
                        />
                        {newPass && (
                            <div className="cp-strength">
                                <div className="cp-strength-bars">
                                    {[1, 2, 3, 4].map(i => (
                                        <div key={i} className={`cp-bar ${strength >= i ? strengthClass : ''}`} />
                                    ))}
                                </div>
                                <span className={`cp-strength-label ${strengthClass}`}>{strengthLabel}</span>
                            </div>
                        )}
                    </div>

                    {/* Confirm */}
                    <div className="cp-field">
                        <label className="cp-label">Confirm New Password</label>
                        <input
                            type="password"
                            className={`cp-input ${confirm && confirm !== newPass ? 'cp-input-error' : ''}`}
                            placeholder="Repeat new password"
                            value={confirm}
                            onChange={e => setConfirm(e.target.value)}
                            autoComplete="new-password"
                            required
                        />
                        {confirm && confirm !== newPass && (
                            <p className="cp-inline-error">Passwords don't match</p>
                        )}
                    </div>

                    {/* Requirements */}
                    <ul className="cp-requirements">
                        <li className={newPass.length >= 8 ? 'met' : ''}>At least 8 characters</li>
                        <li className={/[A-Z]/.test(newPass) ? 'met' : ''}>One uppercase letter</li>
                        <li className={/[0-9]/.test(newPass) ? 'met' : ''}>One number</li>
                        <li className={/[^A-Za-z0-9]/.test(newPass) ? 'met' : ''}>One special character</li>
                    </ul>

                    {error && <div className="cp-error">{error}</div>}

                    <button type="submit" className="cp-btn" disabled={loading}>
                        {loading
                            ? <><span className="cp-spinner" />Updating…</>
                            : 'Update Password'
                        }
                    </button>
                </form>
            </div>
        </div>
    )
}

export default ChangePassword
