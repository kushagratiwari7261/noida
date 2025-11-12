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
  
  // Track which email is expanded and its content
  const [expandedEmailId, setExpandedEmailId] = useState(null);
  const [emailContent, setEmailContent] = useState({});
  const [loadingContent, setLoadingContent] = useState({});

  // Fetch progress tracking
  const [fetchProgress, setFetchProgress] = useState(null);

  // Prevent duplicate requests
  const loadEmailsInProgress = useRef(false);
  const fetchEmailsInProgress = useRef(false);

  // ============ STATE PERSISTENCE ============
  useEffect(() => {
    const savedExpandedEmail = sessionStorage.getItem('expanded_email');
    
    if (savedExpandedEmail) {
      try {
        const state = JSON.parse(savedExpandedEmail);
        setExpandedEmailId(state.emailId);
        setEmailContent(state.emailContent || {});
        console.log('✅ Restored expanded email state');
      } catch (e) {
        console.error('❌ Error restoring state:', e);
        sessionStorage.removeItem('expanded_email');
      }
    }
  }, []);

  useEffect(() => {
    if (expandedEmailId) {
      sessionStorage.setItem('expanded_email', JSON.stringify({
        emailId: expandedEmailId,
        emailContent: emailContent
      }));
    } else {
      sessionStorage.removeItem('expanded_email');
    }
  }, [expandedEmailId, emailContent]);

  useEffect(() => {
    if (!expandedEmailId) return;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    const keepAlive = setInterval(() => {
      document.title = document.title;
    }, 30000);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(keepAlive);
    };
  }, [expandedEmailId]);

  // ============ API CONFIGURATION ============
  const getApiBaseUrl = () => {
    if (window.location.hostname.includes('.vercel.app')) {
      return 'https://seal-freight.vercel.app/';
    }
    return 'http://localhost:3001/';
  };

  const API_BASE = getApiBaseUrl();

  // ============ AUTHENTICATION ============
  const getAuthToken = useCallback(async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('❌ Auth session error:', error);
        throw new Error('Authentication failed: ' + error.message);
      }
      
      if (session?.access_token) {
        return session.access_token;
      }
      
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError) {
        console.error('❌ Session refresh failed:', refreshError);
        throw new Error('Session expired. Please log in again.');
      }
      
      if (refreshedSession?.access_token) {
        return refreshedSession.access_token;
      }
      
      throw new Error('No active session found. Please log in.');
    } catch (error) {
      console.error('❌ Error getting auth token:', error);
      throw error;
    }
  }, []);

  const fetchWithAuth = useCallback(async (url, options = {}) => {
    try {
      const token = await getAuthToken();

      if (!token) {
        throw new Error('No authentication token found. Please log in again.');
      }

      let fullUrl = url;
      if (!url.startsWith('http')) {
        const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
        fullUrl = `${base}/api${url.startsWith('/') ? '' : '/'}${url}`;
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      };

      console.log('🔐 Making authenticated request to:', fullUrl);
      
      const response = await fetch(fullUrl, {
        ...options,
        headers,
      });

      if (response.status === 401) {
        try {
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
        } catch (refreshErr) {
          throw new Error('Authentication failed. Please log in again.');
        }
      }

      if (!response.ok) {
        let errorDetails = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorDetails = errorData.error || errorData.message || errorDetails;
          if (errorData.details) {
            errorDetails += ` (${errorData.details})`;
          }
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

  // ============ LOAD EMAIL CONTENT (LAZY) ============
  const loadEmailContent = useCallback(async (messageId) => {
    if (emailContent[messageId]) {
      console.log('✅ Email content already cached');
      return emailContent[messageId];
    }

    setLoadingContent(prev => ({ ...prev, [messageId]: true }));

    try {
      console.log(`📧 Loading full content for: ${messageId}`);
      
      const response = await fetchWithAuth(`/emails/${messageId}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to load email content');
      }
      
      console.log('✅ Email content loaded successfully');
      
      const content = {
        text: data.email.text,
        html: data.email.html,
        attachments: data.email.attachments || []
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

  // ============ TOGGLE EMAIL EXPANSION ============
  const toggleEmailExpansion = useCallback(async (email) => {
    const emailId = email.id || email.messageId;
    
    if (expandedEmailId === emailId) {
      setExpandedEmailId(null);
      sessionStorage.removeItem('expanded_email');
    } else {
      setExpandedEmailId(emailId);
      
      if (!emailContent[email.messageId]) {
        await loadEmailContent(email.messageId);
      }
    }
  }, [expandedEmailId, emailContent, loadEmailContent]);

  // ============ FETCH USER ACCOUNTS ============
  const fetchUserAccounts = useCallback(async () => {
    try {
      console.log('👤 Fetching user accounts...');
      const response = await fetchWithAuth('/user-accounts');
      const data = await response.json();
      
      if (data.success && data.accounts) {
        console.log('✅ User accounts:', data.accounts);
        setUserAccounts(data.accounts);
        
        if (data.accounts.length === 1) {
          setSelectedAccount(data.accounts[0].id.toString());
        }
      }
    } catch (error) {
      console.error('❌ Failed to fetch user accounts:', error);
    }
  }, [fetchWithAuth]);

  // ============ TEST BACKEND CONNECTION ============
  const testBackendConnection = useCallback(async () => {
    try {
      setError(null);
      console.log('🧪 Testing backend connection...');
      
      const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
      const testUrl = `${base}/api/health`;
      console.log('Testing URL:', testUrl);
      
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('🏥 Backend health:', data);
      
      if (data.status === 'healthy' || data.status === 'degraded') {
        setError(`✅ Backend is ${data.status}! Cache: ${data.cache?.size || 0} items`);
        setTimeout(() => setError(null), 3000);
        return true;
      } else {
        setError(`⚠️ Backend status: ${data.status}`);
        return false;
      }
    } catch (err) {
      console.error('❌ Backend connection failed:', err);
      let errorMessage = `Cannot connect to backend: ${err.message}`;
      
      if (err.message.includes('Failed to fetch')) {
        errorMessage = `Network error: Cannot reach backend at ${API_BASE}`;
      }
      
      setError(`❌ ${errorMessage}`);
      return false;
    }
  }, [API_BASE]);

  // ============ PROCESS ATTACHMENT URL ============
  const processAttachmentUrl = useCallback((attachment) => {
    if (attachment.url && attachment.url.startsWith('http')) {
      return attachment.url;
    }

    if (attachment.path) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (supabaseUrl) {
        return `${supabaseUrl}/storage/v1/object/public/attachments/${attachment.path}`;
      }
    }

    return null;
  }, []);

  // ============ LOAD EMAILS (LIST ONLY) ============
  const loadEmails = useCallback(async (showLoading = true, forceRefresh = false) => {
    if (loadEmailsInProgress.current) {
      console.log('⚠️ Load emails already in progress, skipping...');
      return;
    }

    loadEmailsInProgress.current = true;

    if (showLoading) setLoading(true);
    setError(null);

    try {
      console.log('🔄 Loading emails from backend...', forceRefresh ? '(FORCE REFRESH)' : '');

      if (forceRefresh) {
        try {
          await fetchWithAuth('/clear-cache', { method: 'POST' });
          console.log('🗑️ Cache cleared');
        } catch (cacheErr) {
          console.log('⚠️ Cache clear failed, continuing...');
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

      const response = await fetchWithAuth(`/emails?${queries}`);
      const data = await response.json();
      
      console.log('📧 Backend response:', data);
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to load emails from server');
      }
      
      const emailsToProcess = data.emails || [];
      console.log('📧 Loaded emails:', emailsToProcess.length);
      
      // Process emails - keep minimal data for list view
      const processedEmails = emailsToProcess.map(email => ({
        id: email.messageId,
        messageId: email.messageId,
        subject: email.subject || '(No Subject)',
        from: email.from,
        to: email.to,
        date: email.date,
        hasAttachments: email.hasAttachments || false,
        attachmentsCount: email.attachmentsCount || 0,
        account_id: email.account_id
      }));
      
      setEmails(processedEmails);
      console.log('✅ Emails set in state:', processedEmails.length);
      
    } catch (err) {
      console.error('❌ Load emails error:', err);
      setEmails([]);
      
      let errorMessage = `Failed to load emails: ${err.message}`;
      
      if (err.message.includes('Authentication failed')) {
        errorMessage = 'Authentication failed. Please log in again.';
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      }
      
      setError(errorMessage);
      
    } finally {
      if (showLoading) setLoading(false);
      loadEmailsInProgress.current = false;
    }
  }, [fetchWithAuth, search, sort, selectedAccount]);

  // ============ FETCH EMAILS FROM IMAP ============
  const fetchEmails = useCallback(async (count = 50) => {
    if (fetchEmailsInProgress.current || fetching) {
      console.log('⚠️ Fetch emails already in progress, skipping...');
      return;
    }

    fetchEmailsInProgress.current = true;
    setFetching(true);
    setFetchStatus('fetching');
    setError(null);
    setFetchProgress({ message: 'Starting email fetch...', stage: 'init' });

    try {
      console.log(`🚀 Starting fetch of ${count} emails...`);
      
      setFetchProgress({ message: 'Connecting to email server...', stage: 'connect' });
      
      const body = {
        count: parseInt(count),
        accountId: selectedAccount,
        mode: 'latest'
      };

      const response = await fetchWithAuth('/fetch-emails', {
        method: 'POST',
        body: JSON.stringify(body)
      });

      setFetchProgress({ message: 'Processing server response...', stage: 'process' });

      const result = await response.json();
      console.log(`📨 Fetch result:`, result);
      
      if (response.ok && result.success) {
        const { summary } = result;
        const totalProcessed = summary?.totalProcessed || 0;
        const totalTime = summary?.totalTimeMs || 0;
        const emailsPerSecond = totalTime > 0 ? (totalProcessed / (totalTime / 1000)).toFixed(2) : 0;
        
        setFetchProgress({ 
          message: `✅ Processed ${totalProcessed} emails in ${(totalTime / 1000).toFixed(2)}s (${emailsPerSecond} emails/s)`, 
          stage: 'success' 
        });
        
        setFetchStatus('success');
        setLastFetchTime(new Date());
        
        setFetchProgress({ message: 'Refreshing email list...', stage: 'reload' });
        await loadEmails(false, true);
        
        setFetchProgress(null);
      } else {
        setFetchStatus('error');
        setError(result.error || 'Failed to fetch emails');
        setFetchProgress(null);
        console.error('❌ Fetch failed:', result.error);
      }
    } catch (err) {
      setFetchStatus('error');
      setError(err.message);
      setFetchProgress(null);
      console.error('❌ Fetch failed:', err);
      
      if (err.message.includes('Authentication failed')) {
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      }
    } finally {
      setFetching(false);
      fetchEmailsInProgress.current = false;
      setTimeout(() => setFetchProgress(null), 3000);
    }
  }, [fetchWithAuth, fetching, selectedAccount, loadEmails]);

  const forceRefreshEmails = useCallback(async () => {
    if (fetchEmailsInProgress.current || fetching) {
      console.log('⚠️ Refresh already in progress, skipping...');
      return;
    }

    fetchEmailsInProgress.current = true;
    setFetching(true);
    setFetchStatus('fetching');
    setError(null);

    try {
      console.log('🔄 Force refreshing emails...');
      await loadEmails(true, true);
      setFetchStatus('success');
      setLastFetchTime(new Date());
      console.log('✅ Force refresh completed');
    } catch (err) {
      setFetchStatus('error');
      setError(err.message);
      console.error('❌ Force refresh failed:', err);
    } finally {
      setFetching(false);
      fetchEmailsInProgress.current = false;
    }
  }, [fetching, loadEmails]);

  // ============ FILE HELPERS ============
  const getFileIcon = useCallback((mimeType, filename) => {
    if (!mimeType && !filename) return '📎';
    
    const extension = filename?.split('.').pop()?.toLowerCase();
    mimeType = mimeType?.toLowerCase() || '';

    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.includes('excel') || extension === 'xlsx' || extension === 'xls') return '📊';
    if (mimeType.includes('csv') || extension === 'csv') return '📋';
    if (mimeType.includes('word') || extension === 'docx' || extension === 'doc') return '📝';
    
    return '📎';
  }, []);

  const getFileSize = useCallback((bytes) => {
    if (!bytes || bytes === 0) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }, []);

  const downloadFile = useCallback(async (attachment, filename) => {
    try {
      console.log('⬇️ Downloading attachment:', { filename, url: attachment.url });

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
  }, []);

  const toggleImageExpand = useCallback((emailIndex, attachmentIndex) => {
    const key = `${emailIndex}-${attachmentIndex}`;
    setExpandedImages(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  }, []);

  // ============ RENDER ATTACHMENT ============
  const renderAttachment = useCallback((attachment, index, emailIndex) => {
    const mimeType = attachment.mimeType || attachment.contentType || attachment.type;
    const filename = attachment.filename || `attachment_${index}`;
    const fileSize = getFileSize(attachment.size);
    const fileIcon = getFileIcon(mimeType, filename);
    const isImage = mimeType?.startsWith('image/');
    const isPDF = mimeType === 'application/pdf';
    const isExpanded = expandedImages[`${emailIndex}-${index}`];
    const safeUrl = processAttachmentUrl(attachment);

    return (
      <div key={attachment.id || index} className="attachment-item">
        <div className="attachment-header">
          <span className="file-icon">{fileIcon}</span>
          <div className="file-info">
            <span className="filename">{filename}</span>
            {fileSize && <span className="file-size">{fileSize}</span>}
          </div>
          <div className="attachment-actions">
            {(isImage || isPDF) && safeUrl && (
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
              crossOrigin="anonymous"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          </div>
        )}
      </div>
    );
  }, [downloadFile, expandedImages, getFileIcon, getFileSize, toggleImageExpand, processAttachmentUrl]);

  // ============ DELETE EMAIL ============
  const deleteEmail = useCallback(async (emailId, messageId) => {
    if (!emailId && !messageId) {
      console.error('❌ No email ID or message ID provided for deletion');
      setError('Cannot delete email: Missing identifier');
      return;
    }

    const confirmed = window.confirm(
      'Are you sure you want to delete this email?\n\nThis will permanently remove the email and all its attachments. This action cannot be undone.'
    );

    if (!confirmed) return;

    setDeletingEmails(prev => ({ ...prev, [emailId]: true }));

    try {
      console.log('🗑️ Deleting email:', { emailId, messageId });
      const response = await fetchWithAuth(`/emails/${messageId}`, {
        method: 'DELETE',
      });

      const result = await response.json();
      console.log('🗑️ Delete response:', result);

      if (response.ok && result.success) {
        setEmails(prevEmails => prevEmails.filter(email => email.id !== emailId));
        console.log('✅ Email deleted successfully');
        setFetchStatus('success');
        
        if (expandedEmailId === emailId) {
          setExpandedEmailId(null);
          sessionStorage.removeItem('expanded_email');
        }
        
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
  }, [fetchWithAuth, expandedEmailId]);

  // ============ EMAIL CARD COMPONENT ============
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
            title="Permanently delete this email and all attachments"
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
          <span className="sender-email">{email.from || 'Unknown'}</span>
        </div>

        {isExpanded && (
          <div className="email-content-section">
            {isLoadingContent ? (
              <div className="loading-content">
                <div className="spinner-small"></div>
                <p>Loading email content...</p>
              </div>
            ) : content ? (
              <>
                <div
                  className="email-body"
                  dangerouslySetInnerHTML={{
                    __html:
                      content.html ||
                      content.text?.replace(/\n/g, '<br/>') ||
                      '<p className="no-content">(No Content)</p>',
                  }}
                />

                {content.attachments && content.attachments.length > 0 && (
                  <div className="attachments-section">
                    <div className="attachments-header">
                      <h4>📎 Attachments ({content.attachments.length})</h4>
                    </div>
                    <div className="attachments-grid">
                      {content.attachments.map((attachment, attachmentIndex) =>
                        renderAttachment(attachment, attachmentIndex, index)
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="no-content">
                <p>(No Content Available)</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  });

  // ============ EFFECTS ============
  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
        console.log('👤 Current user:', user?.email);
        
        if (user) {
          await fetchUserAccounts();
        }
      } catch (error) {
        console.error('❌ Error getting user:', error);
      }
    };
    getUser();
  }, [fetchUserAccounts]);

  useEffect(() => {
    console.log('🎯 Component mounted, loading emails...');
    const timer = setTimeout(() => {
      loadEmails(true, true);
    }, 100);
    
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (loadEmailsInProgress.current) {
        console.log('⚠️ Load already in progress, skipping search/sort update');
        return;
      }
      loadEmails(true, false);
    }, 500);
    
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, sort, selectedAccount]);

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
        return { message: '🔄 Fetching latest emails from server...', type: 'info' };
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
                <p>Logged in as: <strong>{user?.email}</strong></p>
                {userAccounts.length > 0 && (
                  <div className="account-selector">
                    <label>Email Account:</label>
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
                  title="Test backend connection"
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
        {/* Compact Header */}
        <header className="app-header-compact">
          <div className="header-top">
            <h1>📧 Email Inbox</h1>
            <div className="header-stats">
              <span className="email-count-badge">📊 {emails.length} emails</span>
              {lastFetchTime && (
                <span className="last-fetch">Last: {lastFetchTime.toLocaleTimeString()}</span>
              )}
              {user && (
                <span className="user-email">User: {user.email}</span>
              )}
            </div>
          </div>

          {/* Compact Controls */}
          <div className="compact-controls">
            <button 
              onClick={() => fetchEmails(50)} 
              disabled={fetching}
              className={`fetch-button ${fetching ? 'fetching' : ''}`}
              title="Fetch 50 latest emails from IMAP"
            >
              {fetching ? '🔄' : '📥'} Fetch 50 Latest
            </button>

            <button 
              onClick={() => fetchEmails(100)} 
              disabled={fetching}
              className="force-fetch-button"
              title="Fetch 100 latest emails from IMAP"
            >
              ⚡ Fetch 100 Latest
            </button>

            <button 
              onClick={forceRefreshEmails} 
              disabled={fetching}
              className="force-refresh-button"
              title="Refresh email list from database"
            >
              🔄 Refresh List
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

        {/* Error Display */}
        {error && (
          <div className="error-banner">
            {error}
            <button onClick={() => setError(null)} className="close-error">✕</button>
          </div>
        )}

        {/* Fetch Progress Banner */}
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

        {/* Status Banner */}
        {statusMessage && !fetchProgress && (
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

        {/* Email List */}
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
                <p>Selected account: {userAccounts.find(a => a.id.toString() === selectedAccount)?.name}</p>
              )}
              <p>Try fetching emails from your inbox</p>
              <div className="empty-actions">
                <button onClick={() => fetchEmails(50)} className="fetch-button">
                  📥 Fetch 50 Latest
                </button>
                <button onClick={() => fetchEmails(100)} className="force-fetch-button">
                  ⚡ Fetch 100 Latest
                </button>
                <button onClick={testBackendConnection} className="test-connection-btn">
                  🧪 Test Connection
                </button>
              </div>
            </div>
          )}

          {!loading && emails.length > 0 && (
            <div className="email-list">
              <div className="email-list-hint">
                <p>💡 Click on email headers to expand and view content</p>
                <p>⚡ Content and attachments load on-demand for better performance</p>
                <p>🔄 Your expanded email state is preserved when switching tabs</p>
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
            <summary>Debug Info (Performance)</summary>
            <div className="debug-content">
              <p><strong>Backend:</strong> {API_BASE}</p>
              <p><strong>User:</strong> {user?.email}</p>
              <p><strong>Accounts:</strong> {userAccounts.map(a => a.name).join(', ') || 'None'}</p>
              <p><strong>Selected Account:</strong> {selectedAccount}</p>
              <p><strong>Current Emails:</strong> {emails.length}</p>
              <p><strong>Expanded Email:</strong> {expandedEmailId || 'None'}</p>
              <p><strong>Cached Content:</strong> {Object.keys(emailContent).length} emails</p>
              <p><strong>Loading:</strong> {loading ? 'Yes' : 'No'}</p>
              <p><strong>Fetching:</strong> {fetching ? 'Yes' : 'No'}</p>
              <p><strong>Fetch Status:</strong> {fetchStatus}</p>
              <p><strong>Last Fetch:</strong> {lastFetchTime ? lastFetchTime.toLocaleTimeString() : 'Never'}</p>
              <p><strong>Environment:</strong> {window.location.hostname.includes('vercel.app') ? 'Production' : 'Development'}</p>
              {fetchProgress && <p><strong>Fetch Progress:</strong> {fetchProgress.message}</p>}
              {error && <p style={{color: 'red'}}><strong>Error:</strong> {error}</p>}
              
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #ccc' }}>
                <p><strong>Backend Features:</strong></p>
                <ul style={{ fontSize: '12px', marginLeft: '20px' }}>
                  <li>✅ Parallel email parsing (10 concurrent)</li>
                  <li>✅ Batch duplicate checking</li>
                  <li>✅ Concurrent attachment uploads (3 at a time)</li>
                  <li>✅ Batch database saves (15 at a time)</li>
                  <li>✅ LRU cache with TTL (2000 items, 5min)</li>
                  <li>✅ IMAP connection pooling</li>
                  <li>✅ User-based account access control</li>
                </ul>
              </div>

              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #ccc' }}>
                <p><strong>Frontend Features:</strong></p>
                <ul style={{ fontSize: '12px', marginLeft: '20px' }}>
                  <li>✅ Lazy content loading (loads on expand)</li>
                  <li>✅ Smart caching with sessionStorage</li>
                  <li>✅ Tab switch state recovery</li>
                  <li>📎 On-demand attachment loading</li>
                  <li>🔐 Automatic token refresh</li>
                  <li>⚡ Debounced search/sort</li>
                  <li>🛡️ Duplicate request prevention</li>
                </ul>
              </div>
              
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #ccc' }}>
                <p><strong>Session Storage:</strong></p>
                <ul style={{ fontSize: '12px', marginLeft: '20px' }}>
                  <li>Expanded Email: {sessionStorage.getItem('expanded_email') ? 'Saved ✅' : 'None'}</li>
                  <li>Storage Size: {new Blob([sessionStorage.getItem('expanded_email') || '']).size} bytes</li>
                  <li>Content Items: {Object.keys(emailContent).length}</li>
                </ul>
              </div>

              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #ccc' }}>
                <p><strong>Performance Metrics:</strong></p>
                <ul style={{ fontSize: '12px', marginLeft: '20px' }}>
                  <li>Emails in state: {emails.length}</li>
                  <li>Content cached: {Object.keys(emailContent).length}</li>
                  <li>Images expanded: {Object.keys(expandedImages).length}</li>
                  <li>Loading content: {Object.values(loadingContent).filter(Boolean).length}</li>
                  <li>Deleting emails: {Object.values(deletingEmails).filter(Boolean).length}</li>
                </ul>
              </div>

              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #ccc' }}>
                <p><strong>How It Works:</strong></p>
                <ol style={{ fontSize: '11px', marginLeft: '20px', lineHeight: '1.6' }}>
                  <li><strong>Initial Load:</strong> Fetches email list (metadata only) from <code>/api/emails</code> - fast!</li>
                  <li><strong>Expand Email:</strong> Click header → loads full content + attachments from <code>/api/emails/:messageId</code></li>
                  <li><strong>View Attachments:</strong> Downloads or previews from Supabase storage</li>
                  <li><strong>Fetch New:</strong> Button fetches latest from IMAP via <code>/api/fetch-emails</code> → auto-refreshes list</li>
                  <li><strong>Switch Tabs:</strong> State preserved in sessionStorage, content cached in memory</li>
                </ol>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

export default App;