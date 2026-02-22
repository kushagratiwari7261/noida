import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { createClient } from '@supabase/supabase-js'

import './Settings.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = supabaseUrl && supabaseKey && supabaseUrl.startsWith('https://')
    ? createClient(supabaseUrl, supabaseKey)
    : null

/* ── Accent colour presets ─────────────────────────────────── */
const ACCENTS = [
    { id: 'indigo', label: 'Indigo', dot: '#6366f1', gradient: 'linear-gradient(135deg,#4f46e5,#6366f1,#818cf8)', glow: 'rgba(99,102,241,0.35)' },
    { id: 'sky', label: 'Sky', dot: '#0ea5e9', gradient: 'linear-gradient(135deg,#0284c7,#0ea5e9,#38bdf8)', glow: 'rgba(14,165,233,0.3)' },
    { id: 'emerald', label: 'Emerald', dot: '#10b981', gradient: 'linear-gradient(135deg,#059669,#10b981,#34d399)', glow: 'rgba(16,185,129,0.3)' },
    { id: 'violet', label: 'Violet', dot: '#8b5cf6', gradient: 'linear-gradient(135deg,#7c3aed,#8b5cf6,#a78bfa)', glow: 'rgba(139,92,246,0.3)' },
    { id: 'rose', label: 'Rose', dot: '#f43f5e', gradient: 'linear-gradient(135deg,#e11d48,#f43f5e,#fb7185)', glow: 'rgba(244,63,94,0.3)' },
    { id: 'amber', label: 'Amber', dot: '#f59e0b', gradient: 'linear-gradient(135deg,#d97706,#f59e0b,#fbbf24)', glow: 'rgba(245,158,11,0.3)' },
    { id: 'teal', label: 'Teal', dot: '#14b8a6', gradient: 'linear-gradient(135deg,#0d9488,#14b8a6,#2dd4bf)', glow: 'rgba(20,184,166,0.3)' },
    { id: 'orange', label: 'Orange', dot: '#f97316', gradient: 'linear-gradient(135deg,#ea580c,#f97316,#fb923c)', glow: 'rgba(249,115,22,0.3)' },
]

function applyAccent(accentId) {
    const a = ACCENTS.find(x => x.id === accentId) ?? ACCENTS[0]
    const root = document.documentElement
    root.style.setProperty('--brand-primary', a.dot)
    root.style.setProperty('--brand-gradient', a.gradient)
    root.style.setProperty('--brand-glow', a.glow)
}

function applyColorMode(mode) {
    const html = document.documentElement
    if (mode === 'system') {
        html.setAttribute('data-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    } else {
        html.setAttribute('data-theme', mode)
    }
}

const Settings = ({ user }) => {
    const [colorMode, setColorMode] = useState('dark')
    const [accentColor, setAccentColor] = useState('indigo')
    const [sidebarCompact, setSidebarCompact] = useState(false)
    const [emailNotif, setEmailNotif] = useState(true)
    const [pushNotif, setPushNotif] = useState(false)
    const [saving, setSaving] = useState(false)
    const [savedMsg, setSavedMsg] = useState('')
    const [loading, setLoading] = useState(true)

    const loadPrefs = useCallback(async () => {
        const lm = localStorage.getItem('sf_color_mode') ?? 'dark'
        const la = localStorage.getItem('sf_accent_color') ?? 'indigo'
        const lsc = localStorage.getItem('sf_sidebar_compact') === 'true'
        const le = localStorage.getItem('sf_email_notif') !== 'false'
        const lp = localStorage.getItem('sf_push_notif') === 'true'
        setColorMode(lm); setAccentColor(la); setSidebarCompact(lsc)
        setEmailNotif(le); setPushNotif(lp)
        applyColorMode(lm); applyAccent(la)

        if (supabase && user?.id) {
            const { data } = await supabase.from('user_settings').select('*').eq('user_id', user.id).single()
            if (data) {
                const m = data.theme ?? lm
                const a = data.accent_color ?? la
                setColorMode(m); setAccentColor(a)
                setEmailNotif(data.email_notifications ?? le)
                setPushNotif(data.push_notifications ?? lp)
                applyColorMode(m); applyAccent(a)
            }
        }
        setLoading(false)
    }, [user])

    useEffect(() => { loadPrefs() }, [loadPrefs])

    const savePrefs = async () => {
        setSaving(true)
        localStorage.setItem('sf_color_mode', colorMode)
        localStorage.setItem('sf_accent_color', accentColor)
        localStorage.setItem('sf_sidebar_compact', String(sidebarCompact))
        localStorage.setItem('sf_email_notif', String(emailNotif))
        localStorage.setItem('sf_push_notif', String(pushNotif))

        if (supabase && user?.id) {
            await supabase.from('user_settings').upsert({
                user_id: user.id,
                theme: colorMode,
                accent_color: accentColor,
                email_notifications: emailNotif,
                push_notifications: pushNotif,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' })
        }
        setSaving(false)
        setSavedMsg('Saved!')
        setTimeout(() => setSavedMsg(''), 2500)
    }

    const handleMode = (m) => { setColorMode(m); applyColorMode(m) }
    const handleAccent = (id) => { setAccentColor(id); applyAccent(id) }

    const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : 'SF'
    const currentAccent = ACCENTS.find(a => a.id === accentColor) ?? ACCENTS[0]

    if (loading) return (
        <div className="settings-loading"><div className="settings-spinner" /></div>
    )

    return (
        <div className="settings-page page-enter">

            {/* Top bar */}
            <div className="settings-topbar">
                <div>
                    <h1 className="settings-title">Settings</h1>
                    <p className="settings-subtitle">Manage your workspace and preferences</p>
                </div>
                <button className="settings-save-btn" onClick={savePrefs} disabled={saving}>
                    {saving ? <><span className="settings-btn-spinner" />Saving…</> : <><CheckIcon />Save</>}
                </button>
            </div>

            {savedMsg && (
                <div className="settings-toast"><CheckIcon /> {savedMsg}</div>
            )}

            <div className="settings-layout">

                {/* LEFT */}
                <div className="settings-col">

                    {/* Profile */}
                    <div className="s-card">
                        <div className="s-card-head">
                            <span className="s-card-icon" style={{ background: 'linear-gradient(135deg,#4f46e5,#818cf8)' }}><UserIcon /></span>
                            <div><h3 className="s-card-title">Profile</h3><p className="s-card-desc">Your account information</p></div>
                        </div>
                        <div className="s-profile-row">
                            <div className="s-avatar" style={{ background: currentAccent.gradient }}>{initials}</div>
                            <div>
                                <p className="s-profile-email">{user?.email ?? '—'}</p>
                                <p className="s-profile-role">Freight Administrator</p>
                            </div>
                        </div>
                        <Link to="/change-password" className="s-link-btn"><LockIcon /> Change Password</Link>

                    </div>

                    {/* Appearance */}
                    <div className="s-card">
                        <div className="s-card-head">
                            <span className="s-card-icon" style={{ background: 'linear-gradient(135deg,#0891b2,#22d3ee)' }}><MoonIcon /></span>
                            <div><h3 className="s-card-title">Appearance</h3><p className="s-card-desc">Theme and display settings</p></div>
                        </div>

                        {/* Color mode */}
                        <p className="s-field-label">Color Mode</p>
                        <div className="s-mode-row">
                            {[
                                { id: 'dark', label: 'Dark', emoji: '🌙', desc: 'Easy on eyes' },
                                { id: 'light', label: 'Light', emoji: '☀️', desc: 'Bright & clean' },
                                { id: 'system', label: 'System', emoji: '💻', desc: 'Auto-detect' },
                            ].map(m => (
                                <button key={m.id} className={`s-mode-btn ${colorMode === m.id ? 'active' : ''}`} onClick={() => handleMode(m.id)}>
                                    <span className="s-mode-emoji">{m.emoji}</span>
                                    <span className="s-mode-label">{m.label}</span>
                                    <span className="s-mode-desc">{m.desc}</span>
                                </button>
                            ))}
                        </div>

                        {/* Accent colour */}
                        <p className="s-field-label" style={{ marginTop: 20 }}>Accent Colour</p>
                        <div className="s-accent-grid">
                            {ACCENTS.map(a => (
                                <button
                                    key={a.id}
                                    className={`s-accent-btn ${accentColor === a.id ? 'active' : ''}`}
                                    onClick={() => handleAccent(a.id)}
                                    title={a.label}
                                >
                                    <span className="s-accent-dot" style={{ background: a.gradient }} />
                                    <span className="s-accent-label">{a.label}</span>
                                    {accentColor === a.id && <span className="s-accent-check"><CheckIcon /></span>}
                                </button>
                            ))}
                        </div>

                        {/* Compact sidebar */}
                        <div className="s-toggle-row" style={{ marginTop: 16 }}>
                            <div>
                                <p className="s-toggle-label">Compact Sidebar</p>
                                <p className="s-toggle-desc">Smaller navigation, more content space</p>
                            </div>
                            <Toggle on={sidebarCompact} onToggle={() => setSidebarCompact(v => !v)} />
                        </div>
                    </div>
                </div>

                {/* RIGHT */}
                <div className="settings-col">

                    {/* Notifications */}
                    <div className="s-card">
                        <div className="s-card-head">
                            <span className="s-card-icon" style={{ background: 'linear-gradient(135deg,#d97706,#fbbf24)' }}><BellIcon /></span>
                            <div><h3 className="s-card-title">Notifications</h3><p className="s-card-desc">Control how we reach you</p></div>
                        </div>
                        <div className="s-toggle-row">
                            <div><p className="s-toggle-label">Email Notifications</p><p className="s-toggle-desc">Shipment updates, invoices, alerts</p></div>
                            <Toggle on={emailNotif} onToggle={() => setEmailNotif(v => !v)} />
                        </div>
                        <div className="s-toggle-row" style={{ borderBottom: 'none' }}>
                            <div><p className="s-toggle-label">Push Notifications</p><p className="s-toggle-desc">Browser and desktop alerts</p></div>
                            <Toggle on={pushNotif} onToggle={() => setPushNotif(v => !v)} />
                        </div>
                    </div>

                    {/* Account & Security */}
                    <div className="s-card">
                        <div className="s-card-head">
                            <span className="s-card-icon" style={{ background: 'linear-gradient(135deg,#059669,#34d399)' }}><ShieldIcon /></span>
                            <div><h3 className="s-card-title">Account & Security</h3><p className="s-card-desc">Manage your account settings</p></div>
                        </div>
                        <div className="s-info-row">
                            <span className="s-info-label">Account status</span>
                            <span className="s-info-badge active">Active</span>
                        </div>
                        <div className="s-info-row">
                            <span className="s-info-label">Two-factor auth</span>
                            <span className="s-info-badge muted">Not set up</span>
                        </div>
                        <div className="s-info-row" style={{ borderBottom: 'none' }}>
                            <span className="s-info-label">Last session</span>
                            <span className="s-info-value">Just now</span>
                        </div>
                    </div>

                    {/* Danger */}
                    <div className="s-card s-card-danger">
                        <div className="s-card-head">
                            <span className="s-card-icon" style={{ background: 'linear-gradient(135deg,#991b1b,#f87171)' }}><WarnIcon /></span>
                            <div><h3 className="s-card-title" style={{ color: 'var(--danger)' }}>Danger Zone</h3><p className="s-card-desc">These actions cannot be undone</p></div>
                        </div>
                        <button className="s-danger-btn"><TrashIcon /> Delete Account</button>
                    </div>
                </div>
            </div>
        </div>
    )
}

const Toggle = ({ on, onToggle }) => (
    <button className={`s-toggle ${on ? 'on' : ''}`} onClick={onToggle} type="button" aria-label="toggle">
        <span className="s-toggle-thumb" />
    </button>
)

const CheckIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
const UserIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" /></svg>
const LockIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
const MoonIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" /></svg>
const BellIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" /></svg>
const ShieldIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" /></svg>
const WarnIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" /></svg>
const TrashIcon = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>

export default Settings
