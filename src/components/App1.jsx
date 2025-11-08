import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App1.css';
import { supabase } from '../lib/supabaseClient';

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
  const [user, setUser] = useState(null);
  const [userAccounts, setUserAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('all');
  
  const [expandedEmailId, setExpandedEmailId] = useState(null);
  const [emailContent, setEmailContent] = useState({});
  const [loadingContent, setLoadingContent] = useState({});
  const [fetchProgress, setFetchProgress] = useState(null);

  const loadEmailsInProgress = useRef(false);
  const fetchEmailsInProgress = useRef(false);

  // Dynamic API URL
  const getApiBaseUrl = () => {
    if (window.location.hostname.includes('.vercel.app')) {
      return 'https://seal-freight.vercel.app';
    }
    return process.env.REACT_APP_API_URL || 'http://localhost:3001';
  };

  const API_BASE = getApiBaseUrl();

  // Get auth token
  const getAuthToken = useCallback(async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        throw new Error('Authentication failed: ' + error.message);
      }
      
      if (session?.access_token) {
        return session.access_token;
      }
      
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError || !refreshedSession?.access_token) {
        throw new Error('Session expired. Please log in again.');
      }
      
      return refreshedSession.access_token;
    } catch (error) {
      console.error('❌ Error getting auth token:', error);
      throw error;
    }
  }, []);

  // Fetch with authentication
  const fetchWithAuth = useCallback(async (url, options = {}) => {
    try {
      const token = await getAuthToken();
      
      if (!token) {
        throw new Error('No authentication token. Please log in again.');
      }

      let fullUrl = url;
      if (!url.startsWith('http')) {
        fullUrl = `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      };

      const response = await fetch(fullUrl, {
        ...options,
        headers,
      });

      if (response.status === 401) {
        const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !session?.access_token) {
          throw new Error('Authentication failed. Please log in again.');
        }
        
        headers.Authorization = `Bearer ${session.access_token}`;
        const retryResponse = await fetch(fullUrl, { ...options, headers });
        
        if (!retryResponse.ok) {
          throw new Error(`HTTP error! status: ${retryResponse.status}`);
        }
        return retryResponse;
      }

      if (!response.ok) {
        let errorDetails = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorDetails = errorData.error || errorData.message || errorDetails;
        } catch (e) {
          errorDetails = response.statusText || errorDetails;
        }
        throw new Error(errorDetails);
      }

      return response;
    } catch (error) {
      console.error('❌ Fetch with auth failed:', error);
      throw error;
    }
  }, [getAuthToken, API_BASE]);

  // Load email content
  const loadEmailContent = useCallback(async (messageId) => {
    if (emailContent[messageId]) {
      return emailContent[messageId];
    }

    setLoadingContent(prev => ({ ...prev, [messageId]: true }));

    try {
      const response = await fetchWithAuth(`/api/emails/${messageId}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to load email content');
      }
      
      const content = {
        text: data.email.text || data.email.text_content,
        html: data.email.html || data.email.html_content
      };
      
      setEmailContent(prev => ({
        ...prev,
        [messageId]: content
      }));
      
      return content;
      
    } catch (error) {
      console.error('❌ Error loading email content:', error);
      setError(`Failed to load email content: ${error.message}`);
      return null;
    } finally {
      setLoadingContent(prev => ({ ...prev, [messageId]: false }));
    }
  }, [fetchWithAuth, emailContent]);

  // Toggle email expansion
  const toggleEmailExpansion = useCallback(async (email) => {
    const emailId = email.id || email.messageId;
    
    if (expandedEmailId === emailId) {
      setExpandedEmailId(null);
    } else {
      setExpandedEmailId(emailId);
      if (!emailContent[email.messageId]) {
        await loadEmailContent(email.messageId);
      }
    }
  }, [expandedEmailId, emailContent, loadEmailContent]);

  // Fetch user accounts
  const fetchUserAccounts = useCallback(async () => {
    try {
      const response = await fetchWithAuth('/api/user-accounts');
      const data = await response.json();
      
      if (data.success && data.accounts) {
        setUserAccounts(data.accounts);
        if (data.accounts.length === 1) {
          setSelectedAccount(data.accounts[0].id.toString());
        }
      }
    } catch (error) {
      console.error('❌ Failed to fetch user accounts:', error);
    }
  }, [fetchWithAuth]);

  // Test backend connection
  const testBackendConnection = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(`${API_BASE}/api/health`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'healthy') {
        setError('✅ Backend is healthy!');
        setTimeout(() => setError(null), 3000);
        return true;
      } else {
        setError(`⚠️ Backend status: ${data.status}`);
        return false;
      }
    } catch (err) {
      setError(`❌ Cannot connect to backend: ${err.message}`);
      return false;
    }
  }, [API_BASE]);

  // Process attachment URL
  const processAttachmentUrl = useCallback((attachment) => {
    if (attachment.url && attachment.url.startsWith('http')) {
      return attachment.url;
    }

    if (attachment.path) {
      const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
      if (supabaseUrl) {
        return `${supabaseUrl}/storage/v1/object/public/attachments/${attachment.path}`;
      }
    }

    return attachment.publicUrl || null;
  }, []);

  // Process email data
  const processEmailData = useCallback((email) => {
    const processedEmail = {
      id: email._id || email.id || email.messageId || email.message_id,
      _id: email._id || email.id || email.messageId || email.message_id,
      messageId: email.messageId || email.message_id,
      subject: email.subject || '(No Subject)',
      from: email.from || email.from_text,
      from_text: email.from_text || email.from,
      to: email.to || email.to_text,
      to_text: email.to_text || email.to,
      date: email.date,
      text: null,
      text_content: null,
      html: null,
      html_content: null,
      attachments: [],
      hasAttachments: email.hasAttachments || false,
      attachmentsCount: email.attachmentsCount || 0,
      account_id: email.account_id
    };

    if (Array.isArray(email.attachments) && email.attachments.length > 0) {
      processedEmail.attachments = email.attachments.map((att, index) => {
        const attachmentUrl = processAttachmentUrl(att);
        const mimeType = att.type || att.contentType || att.mimeType || 'application/octet-stream';
        const filename = att.filename || att.name || `attachment-${index}`;
        const isImage = mimeType.startsWith('image/');
        const isPDF = mimeType === 'application/pdf';

        return {
          id: att.id || `att-${processedEmail.id}-${index}`,
          filename: filename,
          url: attachmentUrl,
          type: mimeType,
          contentType: mimeType,
          size: att.size || 0,
          isImage: isImage,
          isPdf: isPDF,
          path: att.path
        };
      }).filter(att => att.filename && att.url);

      processedEmail.hasAttachments = processedEmail.attachments.length > 0;
      processedEmail.attachmentsCount = processedEmail.attachments.length;
    }

    return processedEmail;
  }, [processAttachmentUrl]);

  // ✅ OPTIMIZED: Load emails from backend
  const loadEmails = useCallback(async (showLoading = true, forceRefresh = false) => {
    if (loadEmailsInProgress.current) {
      console.log('⚠️ Load already in progress, skipping...');
      return;
    }

    loadEmailsInProgress.current = true;
    if (showLoading) setLoading(true);
    setError(null);

    try {
      console.log('🔄 Loading emails...', forceRefresh ? '(FORCE)' : '');

      if (forceRefresh) {
        try {
          await fetchWithAuth('/api/clear-cache', { method: 'POST' });
        } catch (err) {
          console.log('⚠️ Cache clear failed');
        }
      }

      const queries = [
        `search=${encodeURIComponent(search)}`,
        `sort=${sort}`,
        `page=1`,
        `limit=100`,
        `accountId=${selectedAccount}`,
        `t=${Date.now()}`
      ].join('&');

      const response = await fetchWithAuth(`/api/emails?${queries}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to load emails');
      }

      const emailsToProcess = data.emails || [];
      const processedEmails = emailsToProcess.map(processEmailData);

      // Sort by date (newest first)
      const sortedEmails = processedEmails.sort((a, b) => {
        const dateA = new Date(a.date || 0);
        const dateB = new Date(b.date || 0);
        return dateB - dateA;
      });

      setEmails(sortedEmails);
      console.log(`✅ Loaded ${sortedEmails.length} emails`);

    } catch (err) {
      console.error('❌ Load emails error:', err);
      setEmails([]);

      if (err.message.includes('Authentication failed')) {
        setError('Authentication failed. Please log in again.');
        setTimeout(() => window.location.href = '/login', 2000);
      } else {
        setError(`Failed to load emails: ${err.message}`);
      }

    } finally {
      if (showLoading) setLoading(false);
      loadEmailsInProgress.current = false;
    }
  }, [fetchWithAuth, search, sort, selectedAccount, processEmailData]);

  // ✅ OPTIMIZED: Fetch emails from server
  const fetchEmails = useCallback(async (mode = 'latest', fetchAll = false) => {
    if (fetchEmailsInProgress.current || fetching) {
      console.log('⚠️ Fetch already in progress...');
      return;
    }

    fetchEmailsInProgress.current = true;
    setFetching(true);
    setFetchStatus('fetching');
    setError(null);
    setFetchProgress({ message: 'Starting email fetch...', stage: 'init' });

    try {
      console.log(`🚀 Starting ${mode} fetch (${fetchAll ? 'ALL EMAILS' : 'limited'})...`);
      
      setFetchProgress({ message: 'Connecting to email server...', stage: 'connect' });
      
      const response = await fetchWithAuth('/api/fetch-emails', {
        method: 'POST',
        body: JSON.stringify({
          mode: mode,
          count: fetchAll ? 'all' : (mode === 'force' ? 200 : 100),
          accountId: selectedAccount
        })
      });

      setFetchProgress({ message: 'Processing...', stage: 'process' });

      const result = await response.json();
      
      if (response.ok && result.success) {
        const { totalProcessed, totalTimeMs } = result.summary || {};
        const emailsPerSec = totalTimeMs > 0 ? (totalProcessed / (totalTimeMs / 1000)).toFixed(2) : 0;
        
        setFetchProgress({ 
          message: `✅ Processed ${totalProcessed} emails in ${(totalTimeMs / 1000).toFixed(2)}s (${emailsPerSec}/s)`, 
          stage: 'success' 
        });
        
        setFetchStatus('success');
        setLastFetchTime(new Date());
        
        // ✅ IMMEDIATE RELOAD
        setFetchProgress({ message: 'Loading latest emails...', stage: 'reload' });
        await loadEmails(false, true);
        
        setFetchProgress({ message: '✅ Done!', stage: 'complete' });
        setTimeout(() => setFetchProgress(null), 2000);
      } else {
        setFetchStatus('error');
        setError(result.error || 'Failed to fetch emails');
        setFetchProgress(null);
      }
    } catch (err) {
      setFetchStatus('error');
      setError(err.message);
      setFetchProgress(null);
      
      if (err.message.includes('Authentication failed')) {
        setTimeout(() => window.location.href = '/login', 2000);
      }
    } finally {
      setFetching(false);
      fetchEmailsInProgress.current = false;
    }
  }, [fetchWithAuth, fetching, selectedAccount, loadEmails]);

  const fetchNewEmails = useCallback(() => fetchEmails('latest', false), [fetchEmails]);
  const forceFetchEmails = useCallback(() => fetchEmails('force', false), [fetchEmails]);
  const fetchAllEmails = useCallback(() => fetchEmails('force', true), [fetchEmails]);

  // File helpers
  const getFileIcon = useCallback((mimeType, filename) => {
    if (!mimeType && !filename) return '📎';
    
    const ext = filename?.split('.').pop()?.toLowerCase();
    mimeType = mimeType?.toLowerCase() || '';

    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.includes('excel') || ext === 'xlsx' || ext === 'xls') return '📊';
    if (mimeType.includes('csv') || ext === 'csv') return '📋';
    if (mimeType.includes('word') || ext === 'docx' || ext === 'doc') return '📝';
    
    return '📎';
  }, []);

  const getFileSize = useCallback((bytes) => {
    if (!bytes || bytes === 0) return 'Unknown';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }, []);

  // Download file
  const downloadFile = useCallback(async (attachment, filename) => {
    try {
      if (!attachment.url) {
        throw new Error('No URL available');
      }

      const link = document.createElement('a');
      link.href = attachment.url;
      link.download = filename;
      link.target = '_blank';
      
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
  }, []);

  // Toggle image expand
  const toggleImageExpand = useCallback((emailIndex, attachmentIndex) => {
    const key = `${emailIndex}-${attachmentIndex}`;
    setExpandedImages(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  }, []);

  // Render attachment
  const renderAttachment = useCallback((attachment, index, emailIndex) => {
    const mimeType = attachment.mimeType || attachment.type;
    const filename = attachment.filename || `attachment_${index}`;
    const fileSize = getFileSize(attachment.size);
    const fileIcon = getFileIcon(mimeType, filename);
    const isImage = attachment.isImage || mimeType?.startsWith('image/');
    const isPDF = attachment.isPdf || mimeType === 'application/pdf';
    const isExpanded = expandedImages[`${emailIndex}-${index}`];
    const url = attachment.url;

    return (
      <div key={attachment.id} className="attachment-item">
        <div className="attachment-header">
          <span className="file-icon">{fileIcon}</span>
          <div className="file-info">
            <span className="filename">{filename}</span>
            {fileSize && <span className="file-size">{fileSize}</span>}
          </div>
          <div className="attachment-actions">
            {(isImage || isPDF) && url && (
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
              disabled={!url}
            >
              {url ? '⬇️' : '🚫'}
            </button>
          </div>
        </div>

        {isImage && url && (
          <div className={`image-preview ${isExpanded ? 'expanded' : ''}`}>
            <img
              src={url}
              alt={filename}
              className="attachment-image"
              onClick={() => toggleImageExpand(emailIndex, index)}
              loading="lazy"
              crossOrigin="anonymous"
              onError={(e) => e.target.style.display = 'none'}
            />
          </div>
        )}
      </div>
    );
  }, [downloadFile, expandedImages, getFileIcon, getFileSize, toggleImageExpand]);

  // Delete email
  const deleteEmail = useCallback(async (emailId, messageId) => {
    if (!emailId && !messageId) {
      setError('Cannot delete email: Missing identifier');
      return;
    }

    const confirmed = window.confirm(
      'Are you sure you want to delete this email?\n\nThis will permanently remove the email and attachments.'
    );

    if (!confirmed) return;

    setDeletingEmails(prev => ({ ...prev, [emailId]: true }));

    try {
      const response = await fetchWithAuth(`/api/emails/${messageId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setEmails(prevEmails => prevEmails.filter(email => email.id !== emailId));
        setFetchStatus('success');
        setTimeout(() => setFetchStatus('idle'), 3000);
      } else {
        throw new Error(result.error || 'Failed to delete email');
      }
    } catch (err) {
      setError(`Failed to delete: ${err.message}`);
    } finally {
      setDeletingEmails(prev => ({ ...prev, [emailId]: false }));
    }
  }, [fetchWithAuth]);

  // Email Card component
  const EmailCard = React.memo(({ email, index }) => {
    const isExpanded = expandedEmailId === email.id;
    const content = emailContent[email.messageId];
    const isLoadingContent = loadingContent[email.messageId];

    return (
      <div className="email-card">
        <div className="email-actions-top">
          <button 
            className="delete-email-btn"
            onClick={() => deleteEmail(email.id, email.messageId)}
            disabled={deletingEmails[email.id]}
            title="Delete email"
          >
            {deletingEmails[email.id] ? '🗑️ Deleting...' : '🗑️ Delete'}
          </button>
        </div>

        <div 
          className="email-header clickable" 
          onClick={() => toggleEmailExpansion(email)}
          style={{ cursor: 'pointer' }}
        >
          <div className="email-subject">
            <h3>
              {isExpanded ? '▼' : '▶'} {email.subject || '(No Subject)'}
            </h3>
            {email.hasAttachments && (
              <span className="attachment-badge">
                📎 {email.attachmentsCount}
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

        {isExpanded && (
          <div className="email-content-section">
            {isLoadingContent ? (
              <div className="loading-content">
                <div className="spinner-small"></div>
                <p>Loading content...</p>
              </div>
            ) : content ? (
              <div
                className="email-body"
                dangerouslySetInnerHTML={{
                  __html:
                    content.html ||
                    content.text?.replace(/\n/g, '<br/>') ||
                    '<p className="no-content">(No Content)</p>',
                }}
              />
            ) : (
              <div className="no-content">
                <p>(No Content Available)</p>
              </div>
            )}

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
        )}
      </div>
    );
  });

  // Get user on mount
  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
        
        if (user) {
          await fetchUserAccounts();
        }
      } catch (error) {
        console.error('❌ Error getting user:', error);
      }
    };
    getUser();
  }, [fetchUserAccounts]);

  // Load emails on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      loadEmails(true, true);
    }, 100);

    return () => clearTimeout(timer);
  }, [loadEmails]);

  // Debounce search/sort changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!loadEmailsInProgress.current) {
        loadEmails(true, false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [search, sort, selectedAccount, loadEmails]);

  // Reset fetch status
  useEffect(() => {
    if (fetchStatus === 'success' || fetchStatus === 'error') {
      const timer = setTimeout(() => setFetchStatus('idle'), 5000);
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

  if (error && error.includes('Authentication failed')) {
    return (
      <div className="error-container">
        <h2>Authentication Required</h2>
        <p>{error}</p>
        <button onClick={() => window.location.href = '/login'}>
          Go to Login
        </button>
      </div>
    );
  }

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
              <div className="user-info">
                <p>User: <strong>{user?.email}</strong></p>
                {userAccounts.length > 0 && (
                  <div className="account-selector">
                    <label>Account:</label>
                    <select 
                      value={selectedAccount} 
                      onChange={(e) => setSelectedAccount(e.target.value)}
                      className="account-select"
                    >
                      <option value="all">All Accounts</option>
                      {userAccounts.map(account => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="sidebar-actions">
                <button 
                  onClick={testBackendConnection}
                  className="test-connection-btn"
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
            <h1>📧 Email Inbox</h1>
            <div className="header-stats">
              <span className="email-count-badge">📊 {emails.length}</span>
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
              {fetching ? '🔄' : '📥'} Smart Fetch
            </button>

            <button 
              onClick={forceFetchEmails} 
              disabled={fetching}
              className="force-fetch-button"
            >
              ⚡ Force Fetch
            </button>

            <button 
              onClick={() => loadEmails(true, true)} 
              disabled={fetching || loading}
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

        {fetchProgress && (
          <div className={`progress-banner ${fetchProgress.stage}`}>
            <div className="progress-content">
              <span className="progress-message">{fetchProgress.message}</span>
              {fetchProgress.stage === 'fetching' && (
                <div className="progress-spinner">
                  <div className="spinner-small"></div>
                </div>
              )}
            </div>
          </div>
        )}

        {statusMessage && !fetchProgress && (
          <div className={`status-banner ${statusMessage.type}`}>
            {statusMessage.message}
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
              {selectedAccount !== 'all' && (
                <p>Account: {userAccounts.find(a => a.id.toString() === selectedAccount)?.name}</p>
              )}
              <p>Try fetching emails from your inbox</p>
              <div className="empty-actions">
                <button onClick={fetchNewEmails} className="fetch-button">
                  📥 Smart Fetch
                </button>
                <button onClick={forceFetchEmails} className="force-fetch-button">
                  ⚡ Force Fetch
                </button>
              </div>
            </div>
          )}

          {!loading && emails.length > 0 && (
            <div className="email-list">
              <div className="email-list-hint">
                <p>💡 Click email headers to expand • ⚡ {emails.length} emails (newest first)</p>
                <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                  📬 Latest emails at top • Click "Smart Fetch" for newest from server
                </p>
              </div>
              {emails.map((email, index) => (
                <EmailCard key={email.id} email={email} index={index} />
              ))}
            </div>
          )}
        </div>

        {/* Debug Info */}
        <div className="debug-info">
          <details>
            <summary>Debug Info</summary>
            <div className="debug-content">
              <p><strong>Backend:</strong> {API_BASE}</p>
              <p><strong>User:</strong> {user?.email}</p>
              <p><strong>Accounts:</strong> {userAccounts.map(a => a.name).join(', ') || 'None'}</p>
              <p><strong>Selected:</strong> {selectedAccount}</p>
              <p><strong>Emails:</strong> {emails.length}</p>
              <p><strong>Expanded:</strong> {expandedEmailId || 'None'}</p>
              <p><strong>Cached Content:</strong> {Object.keys(emailContent).length}</p>
              <p><strong>Loading:</strong> {loading ? 'Yes' : 'No'}</p>
              <p><strong>Fetching:</strong> {fetching ? 'Yes' : 'No'}</p>
              <p><strong>Status:</strong> {fetchStatus}</p>
              <p><strong>Last Fetch:</strong> {lastFetchTime ? lastFetchTime.toLocaleTimeString() : 'Never'}</p>
              {fetchProgress && <p><strong>Progress:</strong> {fetchProgress.message}</p>}
              {error && <p style={{color: 'red'}}><strong>Error:</strong> {error}</p>}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

export default App;