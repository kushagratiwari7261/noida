import React, { useState, useEffect } from 'react';
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
  const [searching, setSearching] = useState(false);
  const [emailStats, setEmailStats] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreEmails, setHasMoreEmails] = useState(false);
  const [totalEmails, setTotalEmails] = useState(0);
  const [allEmailsLoaded, setAllEmailsLoaded] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);

  const API_BASE = 'http://localhost:3001';

  // Enhanced authentication
  const getAuthHeaders = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        throw new Error('Authentication required. Please log in again.');
      }
      return {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      };
    } catch (error) {
      throw new Error('Authentication failed');
    }
  };

  // ✅ FIXED: Enhanced API error handler that clones response for multiple reads
  const handleApiError = async (response, defaultMessage = 'API request failed') => {
    if (response.status === 401) {
      setError('Authentication expired. Please log in again.');
      throw new Error('Authentication expired');
    }
    
    if (!response.ok) {
      let errorText = defaultMessage;
      
      try {
        // Clone the response to read it multiple times if needed
        const responseClone = response.clone();
        const errorData = await responseClone.json().catch(() => null);
        
        if (errorData) {
          errorText = errorData.error || errorData.message || defaultMessage;
        } else {
          // If JSON parsing fails, try text
          const text = await response.text().catch(() => defaultMessage);
          errorText = text || defaultMessage;
        }
      } catch {
        // If all else fails, use default message
        errorText = defaultMessage;
      }
      
      throw new Error(errorText);
    }
    
    // For successful responses, parse the original response
    return response.json();
  };

  // Get user info
  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        setUser(user);
        console.log('✅ User loaded:', user?.email);
        await loadEmailStats();
        await loadDebugState();
      } catch (error) {
        setError('Failed to load user information');
      }
    };
    getUser();
  }, []);

  // ✅ NEW: Load debug state
  const loadDebugState = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE}/api/debug-state`, {
        headers: headers
      });

      const result = await handleApiError(response, 'Failed to load debug state');
      
      if (result.success) {
        setDebugInfo(result.data);
        console.log('🐛 Debug state loaded:', result.data);
      }
    } catch (err) {
      console.error('Failed to load debug state:', err);
    }
  };

  // ✅ ENHANCED: Load email statistics
  const loadEmailStats = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE}/api/email-stats`, {
        headers: headers
      });

      const result = await handleApiError(response, 'Failed to load email statistics');
      
      if (result.success) {
        setEmailStats(result.data);
        setTotalEmails(result.data.totalEmails);
        console.log('📊 Email stats loaded - Total emails:', result.data.totalEmails);
      }
    } catch (err) {
      console.error('Failed to load email stats:', err);
    }
  };

  // ✅ ENHANCED: Load ALL emails using the new /api/all-emails endpoint
  const loadAllEmails = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);

    try {
      console.log(`📧 Loading ALL emails from Supabase (using all-emails endpoint)...`);
      
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE}/api/all-emails?limit=10000&t=${Date.now()}`, {
        headers: headers
      });

      const data = await handleApiError(response, 'Failed to load emails');
      console.log('📧 All-emails response - Total:', data.total, 'Emails loaded:', data.emails?.length);

      const processedEmails = data.emails.map(processEmailData);

      // Set ALL emails at once
      setEmails(processedEmails);
      setAllEmailsLoaded(true);
      setHasMoreEmails(false);
      setCurrentPage(1);
      setTotalEmails(data.total || processedEmails.length);
      
      console.log(`✅ Loaded ALL ${processedEmails.length} emails from Supabase`);

      // Refresh debug state
      await loadDebugState();

    } catch (err) {
      console.error('Load all error:', err);
      setError(`Failed to load emails: ${err.message}`);
      
      // Fallback to paginated endpoint
      console.log('🔄 Falling back to paginated endpoint...');
      await loadEmailsPaginated(1, showLoading);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // ✅ FALLBACK: Load emails with pagination
  const loadEmailsPaginated = async (page = 1, showLoading = true, append = false) => {
    if (showLoading) setLoading(true);
    setError(null);

    try {
      console.log(`📧 Loading emails from Supabase - Page ${page}`);
      
      const queries = [
        `search=${encodeURIComponent(search)}`,
        `sort=${sort}`,
        `page=${page}`,
        `limit=1000`,
        `t=${Date.now()}`
      ].join('&');

      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE}/api/emails?${queries}`, {
        headers: headers
      });

      const data = await handleApiError(response, 'Failed to load emails');
      console.log('📧 Paginated response - Total:', data.total, 'HasMore:', data.hasMore);

      const processedEmails = data.emails.map(processEmailData);

      if (page === 1 || !append) {
        setEmails(processedEmails);
        setAllEmailsLoaded(false);
      } else {
        setEmails(prevEmails => {
          const existingIds = new Set(prevEmails.map(email => email.id));
          const newEmails = processedEmails.filter(email => !existingIds.has(email.id));
          return [...prevEmails, ...newEmails];
        });
      }
      
      setHasMoreEmails(data.hasMore);
      setCurrentPage(page);
      setTotalEmails(data.total || 0);
      
      if (!data.hasMore) {
        setAllEmailsLoaded(true);
        console.log('✅ All emails loaded via pagination');
      }
      
      console.log(`✅ Loaded ${processedEmails.length} emails (page ${page}, total: ${data.total})`);

    } catch (err) {
      console.error('Pagination load error:', err);
      setError(`Failed to load emails: ${err.message}`);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // ✅ ENHANCED: Load more emails with duplicate prevention
  const loadMoreEmails = async () => {
    if (loading || !hasMoreEmails || allEmailsLoaded) return;
    
    const nextPage = currentPage + 1;
    await loadEmailsPaginated(nextPage, false, true);
  };

  // ✅ ENHANCED: Search ALL emails in Supabase
  const searchAllEmails = async (searchTerm) => {
    if (searching) return;
    
    setSearching(true);
    setError(null);

    try {
      console.log(`🔍 Searching ALL emails for: "${searchTerm}"`);
      
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE}/api/search-emails`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          search: searchTerm,
          limit: 10000,
          page: 1
        })
      });

      const result = await handleApiError(response, 'Failed to search emails');
      
      if (result.success) {
        const processedEmails = result.data.emails.map(processEmailData);
        
        setEmails(processedEmails);
        setHasMoreEmails(false);
        setCurrentPage(1);
        setTotalEmails(result.data.total);
        setAllEmailsLoaded(true);
        
        console.log(`✅ Search completed: Found ${processedEmails.length} emails for "${searchTerm}"`);
      } else {
        throw new Error(result.error || 'Search failed');
      }
    } catch (err) {
      console.error('Search error:', err);
      setError(`Search failed: ${err.message}`);
    } finally {
      setSearching(false);
    }
  };

  // ✅ ENHANCED: Fetch new emails from IMAP with force option
  const fetchNewEmails = async (force = false) => {
    if (fetching) return;

    setFetching(true);
    setFetchStatus('fetching');
    setError(null);

    try {
      console.log(`🔄 ${force ? 'Force ' : ''}Fetching new emails from IMAP...`);
      
      const headers = await getAuthHeaders();
      const endpoint = force ? '/api/force-refresh' : '/api/fetch-emails';
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          count: 100,
          force: force
        })
      });

      const result = await handleApiError(response, 'Failed to fetch emails');
      
      if (result.success) {
        setFetchStatus('success');
        setLastFetchTime(new Date());
        
        // Reload ALL emails to include newly fetched ones
        await loadAllEmails(false);
        await loadEmailStats();
        await loadDebugState();
        
        console.log(`✅ ${force ? 'Force ' : ''}Fetched ${result.data?.processed || 0} new emails`);
      } else {
        throw new Error(result.error || 'Failed to fetch emails');
      }
    } catch (err) {
      setFetchStatus('error');
      setError(err.message);
      console.error('Fetch failed:', err);
    } finally {
      setFetching(false);
    }
  };

  // ✅ NEW: Force refresh function
  const forceRefreshEmails = async () => {
    await fetchNewEmails(true);
  };

  // ✅ NEW: Clear cache function
  const clearCache = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE}/api/clear-cache`, {
        method: 'POST',
        headers: headers
      });

      const result = await handleApiError(response, 'Failed to clear cache');
      
      if (result.success) {
        console.log('🗑️ Cache cleared successfully');
        // Reload emails to get fresh data
        await loadAllEmails(true);
      }
    } catch (err) {
      console.error('Failed to clear cache:', err);
      setError(`Failed to clear cache: ${err.message}`);
    }
  };

  // Process email data
  const processEmailData = (email) => {
    const processedEmail = {
      id: email._id || email.id || email.messageId || email.message_id,
      _id: email._id || email.id || email.messageId || email.message_id,
      messageId: email.messageId || email.message_id,
      subject: email.subject || '(No Subject)',
      from: email.from || email.from_text,
      from_text: email.from_text || email.from,
      to: email.to || email.to_text,
      to_text: email.to_text || email.to,
      date: email.date || email.created_at,
      text: email.text || email.text_content,
      text_content: email.text_content || email.text,
      html: email.html || email.html_content,
      html_content: email.html_content || email.html,
      attachments: [],
      hasAttachments: email.has_attachments || email.hasAttachments || false,
      attachmentsCount: email.attachments_count || email.attachmentsCount || 0,
      user_id: email.user_id,
      user_email: email.user_email,
      read: email.read || false,
      starred: email.starred || false,
      created_at: email.created_at,
      updated_at: email.updated_at
    };

    // Process attachments
    if (Array.isArray(email.attachments) && email.attachments.length > 0) {
      processedEmail.attachments = email.attachments.map((att, index) => {
        const attachmentUrl = att.url || att.publicUrl || att.downloadUrl;
        const mimeType = att.type || att.contentType || att.mimeType || 'application/octet-stream';
        const filename = att.filename || att.name || att.originalFilename || `attachment-${index}`;

        return {
          id: att.id || `att-${processedEmail.id}-${index}-${Math.random().toString(36).substr(2, 9)}`,
          filename: filename,
          name: att.name || filename,
          originalFilename: att.originalFilename || filename,
          url: attachmentUrl,
          publicUrl: att.publicUrl || attachmentUrl,
          downloadUrl: att.downloadUrl || attachmentUrl,
          previewUrl: att.previewUrl || attachmentUrl,
          type: mimeType,
          contentType: mimeType,
          mimeType: mimeType,
          size: att.size || 0,
          extension: att.extension || filename.split('.').pop() || 'bin',
          isImage: att.isImage || mimeType.startsWith('image/'),
          isPdf: att.isPdf || mimeType === 'application/pdf',
          isText: att.isText || mimeType.startsWith('text/'),
          isAudio: att.isAudio || mimeType.startsWith('audio/'),
          isVideo: att.isVideo || mimeType.startsWith('video/'),
          isCSV: filename.toLowerCase().endsWith('.csv'),
          path: att.path,
          displayName: att.displayName || filename,
          originalData: att
        };
      }).filter(att => att.filename && att.url);

      processedEmail.hasAttachments = processedEmail.attachments.length > 0;
      processedEmail.attachmentsCount = processedEmail.attachments.length;
    }

    return processedEmail;
  };

  // Enhanced delete email function
  const deleteEmail = async (emailId, messageId) => {
    if (!emailId && !messageId) {
      setError('Cannot delete email: Missing identifier');
      return;
    }

    const confirmed = window.confirm(
      'Are you sure you want to delete this email?\n\nThis will permanently remove the email and all its attachments from the database. This action cannot be undone.'
    );

    if (!confirmed) return;

    setDeletingEmails(prev => ({ ...prev, [emailId]: true }));

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE}/api/emails/${messageId}`, {
        method: 'DELETE',
        headers: headers
      });

      const result = await handleApiError(response, 'Failed to delete email');

      if (result.success) {
        setEmails(prevEmails => prevEmails.filter(email => email.id !== emailId));
        setFetchStatus('success');
        
        // Update stats
        if (emailStats) {
          setEmailStats(prev => ({
            ...prev,
            totalEmails: prev.totalEmails - 1
          }));
          setTotalEmails(prev => prev - 1);
        }
        
        // Refresh debug state
        await loadDebugState();
        
      } else {
        throw new Error(result.error || 'Failed to delete email');
      }
    } catch (err) {
      setError(`Failed to delete email: ${err.message}`);
    } finally {
      setDeletingEmails(prev => ({ ...prev, [emailId]: false }));
    }
  };

  // Keep your existing attachment rendering functions
  const renderAttachment = (attachment, index, emailIndex) => {
    return (
      <div key={attachment.id} className="attachment-item">
        <div className="attachment-header">
          <span className="file-icon">📎</span>
          <div className="file-info">
            <span className="filename">{attachment.filename}</span>
            <span className="file-size">{attachment.size ? Math.round(attachment.size / 1024) + ' KB' : 'Unknown size'}</span>
          </div>
          <div className="attachment-actions">
            <button 
              className="download-btn"
              onClick={() => window.open(attachment.url, '_blank')}
              title={`Download ${attachment.filename}`}
            >
              ⬇️
            </button>
          </div>
        </div>
      </div>
    );
  };

  const EmailCard = ({ email, index }) => (
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

  // ✅ UPDATED: Load ALL emails on component mount using new endpoint
  useEffect(() => {
    console.log('🎯 Component mounted, loading ALL emails...');
    loadAllEmails(true);
  }, []);

  // ✅ UPDATED: Search handler - search ALL emails
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim().length > 0) {
        searchAllEmails(search);
      } else {
        // When search is cleared, load ALL emails again
        loadAllEmails(true);
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [search, sort]);

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
              {user && (
                <div className="user-info-sidebar">
                  <p><strong>Logged in as:</strong></p>
                  <p className="user-email">{user.email}</p>
                </div>
              )}

              {/* Debug Information */}
              {debugInfo && (
                <div className="debug-info-sidebar">
                  <h4>🐛 Debug Info</h4>
                  <div className="debug-item">
                    <span className="debug-label">Latest Email:</span>
                    <span className="debug-value">
                      {debugInfo.database?.latestEmail?.date 
                        ? new Date(debugInfo.database.latestEmail.date).toLocaleDateString()
                        : 'None'
                      }
                    </span>
                  </div>
                  <div className="debug-item">
                    <span className="debug-label">Cache Size:</span>
                    <span className="debug-value">{debugInfo.cache?.size || 0} items</span>
                  </div>
                  <div className="debug-item">
                    <span className="debug-label">Email Config:</span>
                    <span className={`debug-value ${debugInfo.config?.emailConfigured ? 'success' : 'error'}`}>
                      {debugInfo.config?.emailConfigured ? '✅' : '❌'}
                    </span>
                  </div>
                </div>
              )}

              {/* Email Statistics */}
              {emailStats && (
                <div className="email-stats-sidebar">
                  <h4>📊 Email Statistics</h4>
                  <div className="stat-item">
                    <span className="stat-label">Total Emails:</span>
                    <span className="stat-value">{emailStats.totalEmails.toLocaleString()}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">With Attachments:</span>
                    <span className="stat-value">{emailStats.emailsWithAttachments.toLocaleString()}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Currently Showing:</span>
                    <span className="stat-value">{emails.length} emails</span>
                  </div>
                  {allEmailsLoaded && (
                    <div className="stat-item success">
                      <span className="stat-label">Status:</span>
                      <span className="stat-value">✅ All emails loaded</span>
                    </div>
                  )}
                </div>
              )}

              {/* Quick Actions */}
              <div className="quick-actions-sidebar">
                <h4>🚀 Quick Actions</h4>
                <button 
                  onClick={loadAllEmails}
                  disabled={loading}
                  className="sidebar-button"
                >
                  🔄 Refresh All
                </button>
                <button 
                  onClick={() => fetchNewEmails(false)}
                  disabled={fetching}
                  className="sidebar-button"
                >
                  📥 Fetch New
                </button>
                <button 
                  onClick={forceRefreshEmails}
                  disabled={fetching}
                  className="sidebar-button force-button"
                >
                  ⚡ Force Refresh
                </button>
                <button 
                  onClick={clearCache}
                  className="sidebar-button cache-button"
                >
                  🗑️ Clear Cache
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
            <h1>📧 Email Inbox - ALL Emails</h1>
            <div className="header-stats">
              <span className="email-count-badge">
                📊 {emails.length} of {totalEmails.toLocaleString()} emails
                {allEmailsLoaded && ' ✅'}
              </span>
              {user && (
                <span className="user-badge">👤 {user.email}</span>
              )}
            </div>
          </div>

          <div className="compact-controls">
            <button 
              onClick={() => fetchNewEmails(false)} 
              disabled={fetching}
              className={`fetch-button ${fetching ? 'fetching' : ''}`}
            >
              {fetching ? '🔄' : '📥'} Fetch New
            </button>

            <button 
              onClick={forceRefreshEmails} 
              disabled={fetching}
              className="force-refresh-button"
            >
              ⚡ Force Refresh
            </button>

            <button 
              onClick={loadAllEmails} 
              disabled={loading}
              className="refresh-button"
            >
              🔄 Refresh All
            </button>

            <button 
              onClick={clearCache}
              className="clear-cache-button"
            >
              🗑️ Clear Cache
            </button>

            <div className="search-compact">
              <input
                type="text"
                placeholder="🔍 Search ALL emails..."
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

        {/* Status Banner */}
        {statusMessage && (
          <div className={`status-banner ${statusMessage.type}`}>
            {statusMessage.message}
          </div>
        )}

        {/* Email List */}
        <div className="email-content-area">
          {loading && !searching && (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading ALL emails from database...</p>
              <p className="loading-subtext">This may take a moment if you have many emails</p>
            </div>
          )}
          
          {searching && (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Searching through {totalEmails.toLocaleString()} emails...</p>
            </div>
          )}
          
          {!loading && !searching && emails.length === 0 && (
            <div className="empty-state">
              <p>📭 No emails found</p>
              <p>Try fetching emails from your inbox or using different search terms</p>
              <div className="empty-state-actions">
                <button onClick={() => fetchNewEmails(false)} className="fetch-button">
                  📥 Fetch New Emails
                </button>
                <button onClick={forceRefreshEmails} className="force-refresh-button">
                  ⚡ Force Refresh
                </button>
              </div>
            </div>
          )}

          {!loading && !searching && emails.length > 0 && (
            <div className="email-list">
              <div className="email-list-header">
                <h3>📨 All Emails ({emails.length.toLocaleString()})</h3>
                {allEmailsLoaded && (
                  <span className="all-loaded-badge">✅ All emails loaded</span>
                )}
                {debugInfo && (
                  <span className="debug-badge">
                    🐛 Latest: {debugInfo.database?.latestEmail?.date 
                      ? new Date(debugInfo.database.latestEmail.date).toLocaleDateString() 
                      : 'N/A'
                    }
                  </span>
                )}
              </div>
              
              {emails.map((email, index) => (
                <EmailCard key={email.id} email={email} index={index} />
              ))}
              
              {/* Show load more button if there are more emails */}
              {hasMoreEmails && !allEmailsLoaded && (
                <div className="load-more-section">
                  <button 
                    onClick={loadMoreEmails} 
                    disabled={loading}
                    className="load-more-button"
                  >
                    {loading ? '🔄 Loading...' : `📥 Load More (${totalEmails - emails.length} remaining)`}
                  </button>
                </div>
              )}

              {/* Show message when all emails are loaded */}
              {allEmailsLoaded && emails.length > 0 && (
                <div className="all-loaded-message">
                  ✅ Successfully loaded all {emails.length.toLocaleString()} emails from database
                  {debugInfo?.database?.latestEmail && (
                    <span className="latest-email-info">
                      {' '}• Latest email: {new Date(debugInfo.database.latestEmail.date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;