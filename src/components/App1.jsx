import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import './App1.css';

// Initialize Supabase client for frontend with proper error handling
const getSupabaseClient = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Supabase environment variables are missing');
    console.log('VITE_SUPABASE_URL:', supabaseUrl);
    console.log('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'Set' : 'Not set');
    return null;
  }

  try {
    return createClient(supabaseUrl, supabaseAnonKey);
  } catch (error) {
    console.error('❌ Failed to create Supabase client:', error);
    return null;
  }
};

const supabase = getSupabaseClient();

function App() {
  const [emails, setEmails] = useState([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('date_desc');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedImages, setExpandedImages] = useState({});
  const [fetchStatus, setFetchStatus] = useState('idle');
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const [error, setError] = useState(null);
  const [deletingEmails, setDeletingEmails] = useState({});
  
  // Authentication states
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [emailAccounts, setEmailAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });

  const API_BASE = import.meta.env.VITE_API_BASE || '';

  // Check for existing session on component mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Check authentication status
  const checkAuth = async () => {
    if (!supabase) {
      setError('Supabase client not initialized. Please check environment variables.');
      return;
    }

    try {
      const { data: { session: currentSession }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('❌ Session check error:', error);
        setError('Authentication error: ' + error.message);
        return;
      }

      if (currentSession) {
        console.log('✅ User is authenticated:', currentSession.user.email);
        setSession(currentSession);
        setUser(currentSession.user);
        await loadUserProfile(currentSession);
      } else {
        console.log('ℹ️ No active session found');
      }
    } catch (err) {
      console.error('❌ Auth check error:', err);
      setError('Failed to check authentication status');
    }
  };

  // Load user profile and allowed accounts
  const loadUserProfile = async (currentSession) => {
    if (!currentSession) return;

    try {
      console.log('🔐 Loading user profile with token...');
      const response = await fetch(`${API_BASE}/api/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setEmailAccounts(result.data.allowedAccounts || []);
          console.log('📧 Loaded allowed accounts:', result.data.allowedAccounts);
          
          // Load emails after profile is loaded
          await loadEmails(true, false, currentSession);
        } else {
          console.error('❌ Profile load failed:', result.error);
        }
      } else if (response.status === 401) {
        console.log('🔐 Token expired, signing out...');
        await handleLogout();
        setError('Session expired. Please log in again.');
      } else {
        const errorText = await response.text();
        console.error('❌ Profile load HTTP error:', response.status, errorText);
        setError('Failed to load user profile');
      }
    } catch (err) {
      console.error('❌ Profile load error:', err);
      setError('Failed to load user profile');
    }
  };

  // Login function using Supabase directly (not your backend login)
  const handleLogin = async (e) => {
    e.preventDefault();
    if (loginLoading) return;

    if (!supabase) {
      setError('Supabase client not initialized. Please check environment variables.');
      return;
    }

    setLoginLoading(true);
    setError(null);

    try {
      console.log('🔐 Attempting login with:', loginForm.email);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginForm.email.trim().toLowerCase(),
        password: loginForm.password
      });

      if (error) {
        console.error('❌ Supabase login error:', error);
        setError(error.message || 'Login failed. Please check your credentials.');
        return;
      }

      if (data.session) {
        console.log('✅ Login successful:', data.user.email);
        setSession(data.session);
        setUser(data.user);
        setLoginForm({ email: '', password: '' });
        
        // Load user profile and emails after successful login
        await loadUserProfile(data.session);
      } else {
        setError('Login failed. No session returned.');
      }
    } catch (err) {
      console.error('❌ Login error:', err);
      setError('Login failed: ' + err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  // Logout function
  const handleLogout = async () => {
    try {
      if (supabase) {
        const { error } = await supabase.auth.signOut();
        if (error) {
          console.error('❌ Logout error:', error);
        }
      }
    } catch (err) {
      console.error('❌ Logout error:', err);
    } finally {
      setSession(null);
      setUser(null);
      setEmailAccounts([]);
      setEmails([]);
      setSelectedAccount('all');
      setError(null);
    }
  };

  // Enhanced API call function with authentication
  const makeAuthenticatedRequest = async (url, options = {}) => {
    if (!session) {
      throw new Error('No active session. Please log in again.');
    }

    const config = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        ...options.headers,
      }
    };

    console.log('🌐 Making API request to:', url);
    console.log('🔐 Using token:', session.access_token.substring(0, 20) + '...');

    const response = await fetch(`${API_BASE}${url}`, config);
    
    if (response.status === 401) {
      console.log('🔐 Token expired, logging out...');
      await handleLogout();
      throw new Error('Session expired. Please log in again.');
    }

    if (response.status === 403) {
      const result = await response.json();
      throw new Error(result.error || 'Access denied');
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API request failed:', response.status, errorText);
      throw new Error(`Request failed with status ${response.status}`);
    }

    return response;
  };

  // Test API connection
  const testApiConnection = async () => {
    if (!session) {
      setError('Please log in first');
      return;
    }

    try {
      console.log('🧪 Testing API connection...');
      
      // Test health endpoint
      const healthResponse = await fetch(`${API_BASE}/api/health`);
      const healthData = await healthResponse.json();
      console.log('🏥 Health check:', healthData);

      // Test auth endpoint
      const authResponse = await makeAuthenticatedRequest('/api/test-auth');
      const authData = await authResponse.json();
      console.log('🔐 Auth test:', authData);

      alert('✅ API connection test successful!');
    } catch (err) {
      console.error('❌ API test failed:', err);
      alert('❌ API test failed: ' + err.message);
    }
  };

  // Process email data
  const processEmailData = (email) => {
    const processedEmail = {
      id: email._id || email.id || email.messageId || email.message_id,
      _id: email._id || email.id || email.messageId || email.message_id,
      messageId: email.messageId || email.message_id,
      accountId: email.accountId || email.account_id,
      subject: email.subject || '(No Subject)',
      from: email.from || email.from_text,
      from_text: email.from_text || email.from,
      to: email.to || email.to_text,
      to_text: email.to_text || email.to,
      date: email.date,
      text: email.text || email.text_content,
      text_content: email.text_content || email.text,
      html: email.html || email.html_content,
      html_content: email.html_content || email.html,
      attachments: email.attachments || [],
      hasAttachments: email.hasAttachments || email.has_attachments || false,
      attachmentsCount: email.attachmentsCount || email.attachments_count || 0
    };

    return processedEmail;
  };

  // Load emails with authentication
  const loadEmails = async (showLoading = true, forceRefresh = false, currentSession = null) => {
    const authSession = currentSession || session;
    
    if (!authSession) {
      setError('Please log in to view emails');
      return;
    }

    if (showLoading) setLoading(true);
    setError(null);

    try {
      if (forceRefresh) {
        try {
          await makeAuthenticatedRequest('/api/clear-cache', { method: 'POST' });
        } catch (cacheErr) {
          console.log('⚠️ Cache clear failed, continuing...');
        }
      }

      const queries = [
        `search=${encodeURIComponent(search)}`,
        `sort=${sort}`,
        `page=1`,
        `limit=20`,
        `accountId=${selectedAccount}`,
        `t=${Date.now()}`
      ].join('&');

      console.log('📧 Loading emails with query:', queries);
      const response = await makeAuthenticatedRequest(`/api/emails?${queries}`);

      const data = await response.json();
      console.log('📧 Email API response:', data);
      
      if (data.success && data.emails) {
        const processedEmails = data.emails.map(processEmailData);
        const sortedEmails = processedEmails.sort((a, b) => {
          const dateA = new Date(a.date || 0);
          const dateB = new Date(b.date || 0);
          return dateB - dateA;
        });
        
        setEmails(sortedEmails);
        console.log('✅ Emails loaded:', sortedEmails.length);
      } else {
        setEmails([]);
        if (data.error) {
          setError(data.error);
        }
      }
      
    } catch (err) {
      console.error('❌ Fetch error:', err);
      setError(`Failed to load emails: ${err.message}`);
      setEmails([]);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Fetch emails with authentication
  const fetchEmails = async (mode = 'latest') => {
    if (!session) {
      setError('Please log in to fetch emails');
      return;
    }

    if (fetching) {
      console.log('⏳ Fetch already in progress, skipping...');
      return;
    }

    setFetching(true);
    setFetchStatus('fetching');
    setError(null);

    try {
      console.log('📥 Fetching emails with mode:', mode);
      const response = await makeAuthenticatedRequest('/api/fetch-emails', {
        method: 'POST',
        body: JSON.stringify({
          mode: mode,
          count: 10,
          accountId: selectedAccount
        })
      });

      const result = await response.json();
      console.log('📥 Fetch emails response:', result);
      
      if (result.success) {
        setFetchStatus('success');
        setLastFetchTime(new Date());
        await loadEmails(false, true);
      } else {
        throw new Error(result.error || 'Fetch failed');
      }
    } catch (err) {
      setFetchStatus('error');
      setError(err.message);
    } finally {
      setFetching(false);
    }
  };

  // Delete email with authentication
  const deleteEmail = async (emailId, messageId) => {
    if (!session) {
      setError('Please log in to delete emails');
      return;
    }

    if (!emailId && !messageId) {
      setError('Cannot delete email: Missing identifier');
      return;
    }

    const deleteId = messageId || emailId;

    const confirmed = window.confirm(
      'Are you sure you want to delete this email?\n\nThis will permanently remove the email and all its attachments from the database. This action cannot be undone.'
    );

    if (!confirmed) return;

    setDeletingEmails(prev => ({ ...prev, [emailId]: true }));

    try {
      const response = await makeAuthenticatedRequest(`/api/emails/${deleteId}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        setEmails(prevEmails => prevEmails.filter(email => email.id !== emailId));
        setFetchStatus('success');
        setTimeout(() => setFetchStatus('idle'), 3000);
      } else {
        throw new Error(result.error || 'Failed to delete email');
      }
    } catch (err) {
      console.error('❌ Delete error:', err);
      setError(`Failed to delete email: ${err.message}`);
    } finally {
      setDeletingEmails(prev => ({ ...prev, [emailId]: false }));
    }
  };

  // Individual fetch functions
  const fetchNewEmails = () => fetchEmails('latest');
  const forceFetchEmails = () => fetchEmails('force');

  // Refresh emails
  const forceRefreshEmails = async () => {
    if (fetching) return;

    setFetching(true);
    setFetchStatus('fetching');
    setError(null);

    try {
      await loadEmails(true, true);
      setFetchStatus('success');
      setLastFetchTime(new Date());
    } catch (err) {
      setFetchStatus('error');
      setError(err.message);
    } finally {
      setFetching(false);
    }
  };

  // Download file function
  const downloadFile = async (attachment, filename) => {
    try {
      if (!attachment.url) {
        throw new Error('No URL available for download');
      }

      const link = document.createElement('a');
      link.href = attachment.url;
      link.download = filename;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      console.error('❌ Download error:', error);
      if (attachment.url) {
        window.open(attachment.url, '_blank');
      } else {
        alert(`Download failed: ${error.message}`);
      }
    }
  };

  // File icon function
  const getFileIcon = (mimeType, filename) => {
    if (!mimeType && !filename) return '📎';
    
    const extension = filename?.split('.').pop()?.toLowerCase();
    mimeType = mimeType?.toLowerCase() || '';

    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.includes('excel') || extension === 'xlsx' || extension === 'xls') return '📊';
    if (mimeType.includes('csv') || extension === 'csv') return '📋';
    if (mimeType.includes('word') || extension === 'docx' || extension === 'doc') return '📝';
    if (mimeType.includes('zip') || extension === 'zip' || extension === 'rar' || extension === '7z') return '📦';
    
    return '📎';
  };

  const getFileSize = (bytes) => {
    if (!bytes || bytes === 0) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Attachment rendering
  const renderAttachment = (attachment, index, emailIndex) => {
    const mimeType = attachment.mimeType || attachment.type;
    const filename = attachment.filename || `attachment_${index}`;
    const fileSize = getFileSize(attachment.size);
    const fileIcon = getFileIcon(mimeType, filename);
    const isImage = attachment.isImage || mimeType?.startsWith('image/');
    const isPDF = attachment.isPdf || mimeType === 'application/pdf';
    const isExpanded = expandedImages[`${emailIndex}-${index}`];
    const safeUrl = attachment.url;

    return (
      <div key={attachment.id} className="attachment-item">
        <div className="attachment-header">
          <span className="file-icon">{fileIcon}</span>
          <div className="file-info">
            <span className="filename">{filename}</span>
            {fileSize && <span className="file-size">{fileSize}</span>}
          </div>
          <div className="attachment-actions">
            {isImage && safeUrl && (
              <button 
                className="expand-btn"
                onClick={() => toggleImageExpand(emailIndex, index)}
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? '↗' : '⤢'}
              </button>
            )}
            <button 
              className="download-btn"
              onClick={() => downloadFile(attachment, filename)}
              title={`Download ${filename}`}
              disabled={!safeUrl}
            >
              {safeUrl ? '⬇️' : '🚫'}
            </button>
          </div>
        </div>

        {isImage && safeUrl && (
          <div className={`image-preview ${isExpanded ? 'expanded' : ''}`}>
            <img
              src={safeUrl}
              alt={filename}
              className="attachment-image"
              onClick={() => toggleImageExpand(emailIndex, index)}
              loading="lazy"
            />
            {isExpanded && (
              <div className="image-overlay" onClick={() => toggleImageExpand(emailIndex, index)}>
                <div className="expanded-image-container">
                  <img
                    src={safeUrl}
                    alt={filename}
                    className="expanded-image"
                  />
                  <button 
                    className="close-expanded-btn"
                    onClick={() => toggleImageExpand(emailIndex, index)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const toggleImageExpand = (emailIndex, attachmentIndex) => {
    const key = `${emailIndex}-${attachmentIndex}`;
    setExpandedImages(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // EmailCard component
  const EmailCard = ({ email, index }) => {
    const accountInfo = emailAccounts.find(acc => acc.id === email.accountId);
    
    return (
      <div className="email-card">
        <div className="email-actions-top">
          <button 
            className="delete-email-btn"
            onClick={() => deleteEmail(email.id, email.messageId)}
            disabled={deletingEmails[email.id]}
            title="Permanently delete this email and all attachments"
          >
            {deletingEmails[email.id] ? '🗑️ Deleting...' : '🗑️ Delete'}
          </button>
        </div>

        <div className="email-header">
          <div className="email-subject">
            <h3>{email.subject || '(No Subject)'}</h3>
            {email.hasAttachments && (
              <span className="attachment-badge">
                📎 {email.attachmentsCount}
              </span>
            )}
            {accountInfo && (
              <span className="account-badge" title={`From account: ${accountInfo.email}`}>
                👤 {accountInfo.name}
              </span>
            )}
          </div>
          <span className="email-date">
            {email.date ? new Date(email.date).toLocaleString() : 'No Date'}
          </span>
        </div>

        <div className="email-from">
          <strong>From:</strong> 
          <span className="sender-email">{email.from_text || email.from || 'Unknown'}</span>
        </div>

        <div
          className="email-body"
          dangerouslySetInnerHTML={{
            __html:
              email.html_content || email.html ||
              email.text_content?.replace(/\n/g, '<br/>') ||
              email.text?.replace(/\n/g, '<br/>') ||
              '<p className="no-content">(No Content)</p>',
          }}
        />

        {email.hasAttachments && (
          <div className="attachments-section">
            <div className="attachments-header">
              <h4>📎 Attachments ({email.attachmentsCount})</h4>
            </div>
            <div className="attachments-grid">
              {email.attachments.map((attachment, attachmentIndex) =>
                renderAttachment(attachment, attachmentIndex, index)
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Load emails when dependencies change
  useEffect(() => {
    if (session) {
      const timer = setTimeout(() => {
        loadEmails(true, false);
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [search, sort, selectedAccount, session]);

  // Reset fetch status
  useEffect(() => {
    if (fetchStatus === 'success' || fetchStatus === 'error') {
      const timer = setTimeout(() => {
        setFetchStatus('idle');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [fetchStatus]);

  const getStatusMessage = () => {
    switch (fetchStatus) {
      case 'fetching':
        return { message: '🔄 Fetching latest emails...', type: 'info' };
      case 'success':
        return { message: '✅ Successfully fetched emails!', type: 'success' };
      case 'error':
        return { message: '❌ Failed to fetch emails', type: 'error' };
      default:
        return null;
    }
  };

  const statusMessage = getStatusMessage();

  // Show initialization error
  if (!supabase) {
    return (
      <div className="error-container">
        <h1>❌ Configuration Error</h1>
        <p>Supabase client could not be initialized.</p>
        <p>Please check your environment variables:</p>
        <ul>
          <li>VITE_SUPABASE_URL: {import.meta.env.VITE_SUPABASE_URL ? 'Set' : 'Missing'}</li>
          <li>VITE_SUPABASE_ANON_KEY: {import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Set' : 'Missing'}</li>
        </ul>
        <p>Make sure these variables are set in your .env file.</p>
      </div>
    );
  }

  // Login Form
  if (!session) {
    return (
      <div className="login-container">
        <div className="login-form">
          <h1>📧 Email Archive</h1>
          <p>Please log in to access your emails</p>
          
          {error && (
            <div className="error-banner">
              ❌ {error}
              <button onClick={() => setError(null)} className="close-error">✕</button>
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Email:</label>
              <input
                type="email"
                value={loginForm.email}
                onChange={e => setLoginForm(prev => ({ ...prev, email: e.target.value }))}
                required
                disabled={loginLoading}
                placeholder="Enter your email"
              />
            </div>
            
            <div className="form-group">
              <label>Password:</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={e => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                required
                disabled={loginLoading}
                placeholder="Enter your password"
              />
            </div>

            <button 
              type="submit" 
              disabled={loginLoading}
              className="login-button"
            >
              {loginLoading ? '🔄 Logging in...' : '🔑 Login'}
            </button>
          </form>

          <div className="login-info">
            <h3>Demo Accounts:</h3>
            <ul>
              <li><strong>info@seal.co.in</strong> - Access to Account 1 only</li>
              <li><strong>pankaj.singh@seal.co.in</strong> - Access to Account 2 only</li>
              <li><strong>admin@seal.co.in</strong> - Access to all accounts</li>
            </ul>
            <p><em>Note: You need to create these users in your Supabase Auth first.</em></p>
          </div>
        </div>
      </div>
    );
  }

  // Main App
  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className={`sidebar1 ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <button 
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? '→' : '←'}
          </button>
          {!sidebarCollapsed && <h3>Email Controls</h3>}
        </div>

        <div className="sidebar-content">
          {!sidebarCollapsed && (
            <>
              {/* User Info */}
              <div className="user-info">
                <p><strong>👤 {user.email}</strong></p>
                <button 
                  onClick={handleLogout}
                  className="logout-button"
                >
                  🚪 Logout
                </button>
              </div>

              {/* Account Selection */}
              <div className="account-selector">
                <label>Email Account:</label>
                <select 
                  value={selectedAccount} 
                  onChange={e => setSelectedAccount(e.target.value)}
                  className="account-select"
                >
                  <option value="all">All Accessible Accounts</option>
                  {emailAccounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Test Connection Button */}
              <div className="test-connection">
                <button 
                  onClick={testApiConnection}
                  className="test-button"
                  title="Test API connection"
                >
                  🧪 Test Connection
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <header className="app-header-compact">
          <div className="header-top">
            <h1>📧 Email Archive</h1>
            <div className="header-stats">
              <span className="email-count-badge">📊 {emails.length} emails</span>
              {selectedAccount !== 'all' && (
                <span className="account-filter-badge">
                  👤 {emailAccounts.find(acc => acc.id.toString() === selectedAccount)?.name || 'Account'}
                </span>
              )}
              {lastFetchTime && (
                <span className="last-fetch">Last: {lastFetchTime.toLocaleTimeString()}</span>
              )}
            </div>
          </div>

          <div className="compact-controls">
            <button 
              onClick={fetchNewEmails} 
              disabled={fetching}
              className={`fetch-button ${fetching ? 'fetching' : ''}`}
            >
              {fetching ? '🔄' : '📥'} Fetch Emails
            </button>

            <button 
              onClick={forceFetchEmails} 
              disabled={fetching}
              className="force-fetch-button"
            >
              ⚡ Force Fetch
            </button>

            <button 
              onClick={forceRefreshEmails} 
              disabled={fetching}
              className="force-refresh-button"
            >
              🔄 Refresh
            </button>

            <div className="search-compact">
              <input
                type="text"
                placeholder="🔍 Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="search-input-compact"
              />
              <select value={sort} onChange={e => setSort(e.target.value)} className="sort-select-compact">
                <option value="date_desc">📅 Newest</option>
                <option value="date_asc">📅 Oldest</option>
                <option value="subject_asc">🔤 A-Z</option>
              </select>
            </div>
          </div>
        </header>

        {error && (
          <div className="error-banner">
            ❌ {error}
            <button onClick={() => setError(null)} className="close-error">✕</button>
          </div>
        )}

        {statusMessage && (
          <div className={`status-banner ${statusMessage.type}`}>
            {statusMessage.message}
            {fetchStatus === 'fetching' && (
              <div className="loading-dots">
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </div>
            )}
          </div>
        )}

        <div className="email-content-area">
          {loading && (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading emails...</p>
            </div>
          )}
          
          {!loading && emails.length === 0 && (
            <div className="empty-state">
              <p>📭 No emails found</p>
              <p>Try fetching emails from your inbox</p>
              <div className="empty-actions">
                <button onClick={fetchNewEmails} className="fetch-button">
                  📥 Fetch Emails
                </button>
                <button onClick={testApiConnection} className="test-button">
                  🧪 Test Connection
                </button>
              </div>
            </div>
          )}

          {!loading && emails.length > 0 && (
            <div className="email-list">
              {emails.map((email, index) => (
                <EmailCard key={email.id} email={email} index={index} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;