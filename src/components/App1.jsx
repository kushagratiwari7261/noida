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
  
  // ✅ Track which email is expanded and its content
  const [expandedEmailId, setExpandedEmailId] = useState(null);
  const [emailContent, setEmailContent] = useState({});
  const [loadingContent, setLoadingContent] = useState({});

  // ✅ NEW: Fetch progress tracking
  const [fetchProgress, setFetchProgress] = useState(null);
  
  // ✅ NEW: Auto-refresh feature
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(300000); // 5 minutes default
  const autoRefreshTimerRef = useRef(null);

  // ✅ Prevent duplicate requests
  const loadEmailsInProgress = useRef(false);
  const fetchEmailsInProgress = useRef(false);

  // ✅ Dynamic API base URL
  const getApiBaseUrl = () => {
    if (window.location.hostname.includes('.vercel.app')) {
      return 'https://seal-freight.vercel.app';
    }
    return process.env.REACT_APP_API_URL || '/api';
  };

  const API_BASE = getApiBaseUrl();

  // Get authentication token
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

  // Enhanced fetch with auth
  const fetchWithAuth = useCallback(async (url, options = {}) => {
    try {
      const token = await getAuthToken();
      
      if (!token) {
        throw new Error('No authentication token found. Please log in again.');
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

  // ✅ Load full email content when user clicks on an email
  const loadEmailContent = useCallback(async (messageId) => {
    if (emailContent[messageId]) {
      console.log('✅ Email content already loaded from cache');
      return emailContent[messageId];
    }

    setLoadingContent(prev => ({ ...prev, [messageId]: true }));

    try {
      console.log(`📧 Loading full content for email: ${messageId}`);
      
      const response = await fetchWithAuth(`/api/emails/${messageId}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to load email content');
      }
      
      console.log('✅ Email content loaded successfully');
      
      const content = {
        text: data.email.text || data.email.text_content,
        html: data.email.html || data.email.html_content
      };
      
      // Cache the content
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

  // ✅ Toggle email expansion and load content
  const toggleEmailExpansion = useCallback(async (email) => {
    const emailId = email.id || email.messageId;
    
    if (expandedEmailId === emailId) {
      // Collapse
      setExpandedEmailId(null);
    } else {
      // Expand and load content
      setExpandedEmailId(emailId);
      
      // Load content if not already loaded
      if (!emailContent[email.messageId]) {
        await loadEmailContent(email.messageId);
      }
    }
  }, [expandedEmailId, emailContent, loadEmailContent]);

  // ✅ Fetch user accounts
  const fetchUserAccounts = useCallback(async () => {
    try {
      console.log('👤 Fetching user accounts...');
      const response = await fetchWithAuth('/api/user-accounts');
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

  // Test backend connection
  const testBackendConnection = useCallback(async () => {
    try {
      setError(null);
      console.log('🧪 Testing backend connection...');
      
      const testUrl = `${API_BASE}/api/health`;
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
      
      if (data.status === 'healthy') {
        setError('✅ Backend is healthy and running!');
        setTimeout(() => setError(null), 3000);
        return true;
      } else {
        setError(`⚠️ Backend status: ${data.status}. Check server logs.`);
        return false;
      }
    } catch (err) {
      console.error('❌ Backend connection failed:', err);
      let errorMessage = `Cannot connect to backend: ${err.message}`;
      
      if (err.message.includes('Failed to fetch')) {
        errorMessage = `Network error: Cannot reach backend at ${API_BASE}. Check if the backend is deployed and CORS is configured.`;
      }
      
      setError(`❌ ${errorMessage}`);
      return false;
    }
  }, [API_BASE]);

  // ✅ Process attachment URLs
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

    if (attachment.publicUrl) {
      return attachment.publicUrl;
    }

    return null;
  }, []);

  // ✅ Process email data - WITHOUT content
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

    // Process attachments
    if (Array.isArray(email.attachments) && email.attachments.length > 0) {
      processedEmail.attachments = email.attachments.map((att, index) => {
        const attachmentUrl = processAttachmentUrl(att);
        const mimeType = att.type || att.contentType || att.mimeType || 'application/octet-stream';
        const filename = att.filename || att.name || att.originalFilename || `attachment-${index}`;
        const isImage = att.isImage || mimeType.startsWith('image/');
        const isPDF = att.isPdf || mimeType === 'application/pdf';

        return {
          id: att.id || `att-${processedEmail.id}-${index}`,
          filename: filename,
          url: attachmentUrl,
          type: mimeType,
          contentType: mimeType,
          mimeType: mimeType,
          size: att.size || 0,
          isImage: isImage,
          isPdf: isPDF,
          isCSV: filename.toLowerCase().endsWith('.csv'),
          isExcel: filename.toLowerCase().match(/\.(xlsx|xls)$/),
          isWord: filename.toLowerCase().match(/\.(docx|doc)$/),
          path: att.path
        };
      }).filter(att => att.filename && att.url);

      processedEmail.hasAttachments = processedEmail.attachments.length > 0;
      processedEmail.attachmentsCount = processedEmail.attachments.length;
    }

    return processedEmail;
  }, [processAttachmentUrl]);

  // ✅ Load emails function - loads list without content
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
      console.log('🌐 Using API base:', API_BASE);

      const healthResponse = await fetch(`${API_BASE}/api/health`);
      if (!healthResponse.ok) {
        throw new Error(`Backend health check failed: ${healthResponse.status}`);
      }
      const healthData = await healthResponse.json();
      console.log('🏥 Backend health:', healthData.status);

      if (forceRefresh) {
        try {
          await fetchWithAuth('/api/clear-cache', { method: 'POST' });
          console.log('🗑️ Cache cleared');
        } catch (cacheErr) {
          console.log('⚠️ Cache clear failed, continuing...');
        }
      }

      const queries = [
        `search=${encodeURIComponent(search)}`,
        `sort=${sort}`,
        `page=1`,
        `limit=50`,
        `accountId=${selectedAccount}`,
        `t=${Date.now()}`
      ].join('&');

      const response = await fetchWithAuth(`/api/emails?${queries}`);
      const data = await response.json();
      
      console.log('📧 Backend response:', data);
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to load emails from server');
      }
      
      let emailsToProcess = [];
      
      if (data.emails && Array.isArray(data.emails)) {
        emailsToProcess = data.emails;
      } else if (Array.isArray(data)) {
        emailsToProcess = data;
      } else {
        console.log('ℹ️ No emails found in response');
        setEmails([]);
        return;
      }
      
      console.log('📧 Loaded emails:', emailsToProcess.length);
      
      const processedEmails = emailsToProcess.map(processEmailData);
      
      const sortedEmails = processedEmails.sort((a, b) => {
        const dateA = new Date(a.date || 0);
        const dateB = new Date(b.date || 0);
        return dateB - dateA;
      });
      
      setEmails(sortedEmails);
      console.log('✅ Emails set in state:', sortedEmails.length);
      
    } catch (err) {
      console.error('❌ Load emails error:', err);
      setEmails([]);
      
      let errorMessage = `Failed to load emails: ${err.message}`;
      
      if (err.message.includes('Authentication failed')) {
        errorMessage = 'Authentication failed. Please log in again.';
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else if (err.message.includes('Backend server is not responding')) {
        errorMessage = `Backend server is not responding at ${API_BASE}. Please check if the server is deployed.`;
      }
      
      setError(errorMessage);
      
    } finally {
      if (showLoading) setLoading(false);
      loadEmailsInProgress.current = false;
    }
  }, [API_BASE, fetchWithAuth, search, sort, selectedAccount, processEmailData]);

  // ✅ OPTIMIZED: Fetch emails with progress tracking and auto-refresh
  const fetchEmails = useCallback(async (mode = 'latest') => {
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
      console.log(`🚀 Starting ${mode} fetch...`);
      
      setFetchProgress({ message: 'Connecting to email server...', stage: 'connect' });
      
      const response = await fetchWithAuth('/api/fetch-emails', {
        method: 'POST',
        body: JSON.stringify({
          mode: mode,
          // ✅ INCREASED: Fetch more emails to ensure latest ones are included
          count: mode === 'force' ? 200 : 100, // Increased from 50/30 to 200/100
          accountId: selectedAccount
        })
      });

      setFetchProgress({ message: 'Processing server response...', stage: 'process' });

      const result = await response.json();
      console.log(`📨 ${mode} fetch result:`, result);
      
      if (response.ok && result.success) {
        // ✅ Display detailed timing information
        if (result.summary) {
          const { totalProcessed, totalTimeMs } = result.summary;
          const emailsPerSecond = totalTimeMs > 0 ? (totalProcessed / (totalTimeMs / 1000)).toFixed(2) : 0;
          
          setFetchProgress({ 
            message: `✅ Processed ${totalProcessed} emails in ${(totalTimeMs / 1000).toFixed(2)}s (${emailsPerSecond} emails/s)`, 
            stage: 'success' 
          });
        }
        
        setFetchStatus('success');
        setLastFetchTime(new Date());
        
        // ✅ IMMEDIATE REFRESH: Reload emails immediately to show new data
        setFetchProgress({ message: 'Loading latest emails...', stage: 'reload' });
        await loadEmails(false, true);
        
        setFetchProgress({ message: '✅ Done! Latest emails loaded', stage: 'complete' });
        
        // Clear progress after showing success message
        setTimeout(() => setFetchProgress(null), 2000);
      } else {
        setFetchStatus('error');
        setError(result.error || `Failed to ${mode} fetch emails`);
        setFetchProgress(null);
        console.error(`❌ ${mode} fetch failed:`, result.error);
      }
    } catch (err) {
      setFetchStatus('error');
      setError(err.message);
      setFetchProgress(null);
      console.error(`❌ ${mode} fetch failed:`, err);
      
      if (err.message.includes('Authentication failed')) {
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      }
    } finally {
      setFetching(false);
      fetchEmailsInProgress.current = false;
    }
  }, [fetchWithAuth, fetching, selectedAccount, loadEmails]);

  const fetchNewEmails = useCallback(() => fetchEmails('latest'), [fetchEmails]);
  const forceFetchEmails = useCallback(() => fetchEmails('force'), [fetchEmails]);

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

  // File icon helper
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

  // File size helper
  const getFileSize = useCallback((bytes) => {
    if (!bytes || bytes === 0) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }, []);

  // Download file
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

  // Toggle image expand
  const toggleImageExpand = useCallback((emailIndex, attachmentIndex) => {
    const key = `${emailIndex}-${attachmentIndex}`;
    setExpandedImages(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  }, []);

  // ✅ Render attachment
  const renderAttachment = useCallback((attachment, index, emailIndex) => {
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
  }, [downloadFile, expandedImages, getFileIcon, getFileSize, toggleImageExpand]);

  // Delete email
  const deleteEmail = useCallback(async (emailId, messageId) => {
    if (!emailId && !messageId) {
      console.error('❌ No email ID or message ID provided for deletion');
      setError('Cannot delete email: Missing identifier');
      return;
    }

    const confirmed = window.confirm(
      'Are you sure you want to delete this email?\n\nThis will permanently remove the email and all its attachments from the database. This action cannot be undone.'
    );

    if (!confirmed) return;

    setDeletingEmails(prev => ({ ...prev, [emailId]: true }));

    try {
      console.log('🗑️ Deleting email:', { emailId, messageId });
      const response = await fetchWithAuth(`/api/emails/${messageId}`, {
        method: 'DELETE',
      });

      const result = await response.json();
      console.log('🗑️ Delete response:', result);

      if (response.ok && result.success) {
        setEmails(prevEmails => prevEmails.filter(email => email.id !== emailId));
        console.log('✅ Email deleted successfully');
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
  }, [fetchWithAuth]);

  // ✅ EmailCard component with expandable content
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

        {/* ✅ Clickable header to expand/collapse */}
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

        {/* ✅ Only show content when expanded */}
        {isExpanded && (
          <div className="email-content-section">
            {isLoadingContent ? (
              <div className="loading-content">
                <div className="spinner-small"></div>
                <p>Loading email content...</p>
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

  // Get current user on component mount
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

  // ✅ Load emails once when component mounts
  useEffect(() => {
    console.log('🎯 Component mounted, loading emails...');
    const timer = setTimeout(() => {
      loadEmails(true, true);
    }, 100);
    
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Debounce search and sort changes
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

  // Reset fetch status after 5 seconds
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

  // Add error boundary fallback
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

        {/* Error Display */}
        {error && (
          <div className="error-banner">
            ❌ {error}
            <button onClick={() => setError(null)} className="close-error">✕</button>
          </div>
        )}

        {/* ✅ NEW: Fetch Progress Banner */}
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
                <button onClick={fetchNewEmails} className="fetch-button">
                  📥 Smart Fetch
                </button>
                <button onClick={forceFetchEmails} className="force-fetch-button">
                  ⚡ Force Fetch
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
                <p>💡 Click on email headers to expand and view content • ⚡ Showing {emails.length} emails (sorted by newest first)</p>
                <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                  📬 Latest emails appear at the top • Click "Smart Fetch" or "Force Fetch" to get newest emails from server
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
                <p><strong>Performance Features:</strong></p>
                <ul style={{ fontSize: '12px', marginLeft: '20px' }}>
                  <li>✅ Parallel email parsing</li>
                  <li>✅ Batch duplicate checking</li>
                  <li>✅ Concurrent attachment uploads (3 at a time)</li>
                  <li>✅ Batch database saves (10 at a time)</li>
                  <li>✅ Lazy content loading (on expand)</li>
                  <li>✅ Smart caching</li>
                </ul>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

export default App;