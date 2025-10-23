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

  // ✅ FIXED: Enhanced authentication with better error handling
  const getAuthHeaders = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        console.error('❌ No session found:', error);
        throw new Error('Authentication required. Please log in again.');
      }
      
      console.log('🔑 Session found, token:', session.access_token ? 'Present' : 'Missing');
      return {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      };
    } catch (error) {
      console.error('❌ Auth header error:', error);
      throw new Error('Authentication failed');
    }
  };

  // ✅ FIXED: Enhanced API error handler with better status handling
  const handleApiError = async (response, defaultMessage = 'API request failed') => {
    console.log(`🔍 API Response Status: ${response.status} ${response.statusText}`);
    
    if (response.status === 401) {
      setError('Authentication expired. Please log in again.');
      throw new Error('Authentication expired');
    }
    
    if (response.status === 404) {
      setError('API endpoint not found. Please check the server.');
      throw new Error('API endpoint not found');
    }
    
    if (!response.ok) {
      let errorText = defaultMessage;
      
      try {
        // Try to parse error as JSON first
        const errorData = await response.json().catch(() => null);
        
        if (errorData) {
          errorText = errorData.error || errorData.message || defaultMessage;
        } else {
          // If JSON parsing fails, try text
          const text = await response.text().catch(() => defaultMessage);
          errorText = text || defaultMessage;
        }
      } catch (parseError) {
        console.error('❌ Error parsing error response:', parseError);
        errorText = defaultMessage;
      }
      
      throw new Error(errorText);
    }
    
    // For successful responses
    return response.json();
  };

  // ✅ FIXED: Safe API call wrapper
  const makeApiCall = async (endpoint, options = {}) => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE}${endpoint}`, {
        headers,
        ...options
      });
      return await handleApiError(response, `Failed to call ${endpoint}`);
    } catch (error) {
      console.error(`❌ API call failed for ${endpoint}:`, error);
      throw error;
    }
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
        console.error('❌ Failed to load user:', error);
        setError('Failed to load user information');
      }
    };
    getUser();
  }, []);

  // ✅ FIXED: Load debug state with fallback
  const loadDebugState = async () => {
    try {
      const result = await makeApiCall('/api/debug-state');
      
      if (result.success) {
        setDebugInfo(result.data);
        console.log('🐛 Debug state loaded:', result.data);
      }
    } catch (err) {
      console.warn('⚠️ Failed to load debug state, using fallback:', err.message);
      // Set minimal debug info
      setDebugInfo({
        user: { email: user?.email },
        database: { totalEmails: emails.length },
        config: { emailConfigured: true, supabaseEnabled: true },
        cache: { size: 0 }
      });
    }
  };

  // ✅ FIXED: Load email statistics with fallback
  const loadEmailStats = async () => {
    try {
      const result = await makeApiCall('/api/email-stats');
      
      if (result.success) {
        setEmailStats(result.data);
        setTotalEmails(result.data.totalEmails);
        console.log('📊 Email stats loaded - Total emails:', result.data.totalEmails);
      }
    } catch (err) {
      console.warn('⚠️ Failed to load email stats, using fallback:', err.message);
      // Set fallback stats
      const fallbackStats = {
        totalEmails: emails.length,
        emailsWithAttachments: emails.filter(e => e.hasAttachments).length,
        dateRange: { oldest: null, latest: null }
      };
      setEmailStats(fallbackStats);
      setTotalEmails(emails.length);
    }
  };

  // ✅ FIXED: Enhanced load ALL emails with multiple fallbacks
  const loadAllEmails = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);

    try {
      console.log(`📧 Loading ALL emails from Supabase...`);
      
      // Try the all-emails endpoint first
      try {
        const result = await makeApiCall(`/api/all-emails?limit=10000&t=${Date.now()}`);
        console.log('📧 All-emails response - Total:', result.total, 'Emails loaded:', result.emails?.length);

        const processedEmails = result.emails.map(processEmailData);

        // Set ALL emails at once
        setEmails(processedEmails);
        setAllEmailsLoaded(true);
        setHasMoreEmails(false);
        setCurrentPage(1);
        setTotalEmails(result.total || processedEmails.length);
        
        console.log(`✅ Loaded ALL ${processedEmails.length} emails from Supabase`);

        // Refresh stats and debug
        await loadEmailStats();
        await loadDebugState();
        return;

      } catch (allEmailsError) {
        console.warn('⚠️ All-emails endpoint failed, trying paginated:', allEmailsError.message);
        
        // Fallback to paginated endpoint
        await loadEmailsPaginated(1, false);
        
        // If we have emails but pagination says there are more, try to load more
        if (hasMoreEmails && emails.length > 0) {
          console.log('🔄 Loading additional pages...');
          // Load up to 5 more pages or until no more
          for (let page = 2; page <= 6 && hasMoreEmails; page++) {
            await loadEmailsPaginated(page, false, true);
          }
        }
      }

    } catch (err) {
      console.error('❌ Load all error:', err);
      setError(`Failed to load emails: ${err.message}`);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // ✅ FIXED: Load emails with pagination
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

      const result = await makeApiCall(`/api/emails?${queries}`);
      console.log('📧 Paginated response - Total:', result.total, 'HasMore:', result.hasMore);

      const processedEmails = result.emails.map(processEmailData);

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
      
      setHasMoreEmails(result.hasMore);
      setCurrentPage(page);
      setTotalEmails(result.total || 0);
      
      if (!result.hasMore) {
        setAllEmailsLoaded(true);
        console.log('✅ All emails loaded via pagination');
      }
      
      console.log(`✅ Loaded ${processedEmails.length} emails (page ${page}, total: ${result.total})`);

    } catch (err) {
      console.error('❌ Pagination load error:', err);
      setError(`Failed to load emails: ${err.message}`);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // ✅ FIXED: Load more emails
  const loadMoreEmails = async () => {
    if (loading || !hasMoreEmails || allEmailsLoaded) return;
    
    const nextPage = currentPage + 1;
    await loadEmailsPaginated(nextPage, false, true);
  };

  // ✅ FIXED: Search emails with fallback
  const searchAllEmails = async (searchTerm) => {
    if (searching) return;
    
    setSearching(true);
    setError(null);

    try {
      console.log(`🔍 Searching ALL emails for: "${searchTerm}"`);
      
      // Try the search endpoint first
      try {
        const result = await makeApiCall('/api/search-emails', {
          method: 'POST',
          body: JSON.stringify({
            search: searchTerm,
            limit: 10000,
            page: 1
          })
        });
        
        if (result.success) {
          const processedEmails = result.data.emails.map(processEmailData);
          
          setEmails(processedEmails);
          setHasMoreEmails(false);
          setCurrentPage(1);
          setTotalEmails(result.data.total);
          setAllEmailsLoaded(true);
          
          console.log(`✅ Search completed: Found ${processedEmails.length} emails for "${searchTerm}"`);
          return;
        }
      } catch (searchError) {
        console.warn('⚠️ Search endpoint failed, using client-side search:', searchError.message);
      }

      // Fallback to client-side search
      const searchLower = searchTerm.toLowerCase();
      const filteredEmails = emails.filter(email => 
        email.subject?.toLowerCase().includes(searchLower) ||
        email.from_text?.toLowerCase().includes(searchLower) ||
        email.text_content?.toLowerCase().includes(searchLower)
      );
      
      setEmails(filteredEmails);
      setHasMoreEmails(false);
      setAllEmailsLoaded(true);
      console.log(`✅ Client-side search found ${filteredEmails.length} emails`);

    } catch (err) {
      console.error('❌ Search error:', err);
      setError(`Search failed: ${err.message}`);
    } finally {
      setSearching(false);
    }
  };

  // ✅ FIXED: Fetch new emails from IMAP
  const fetchNewEmails = async (force = false) => {
    if (fetching) return;

    setFetching(true);
    setFetchStatus('fetching');
    setError(null);

    try {
      console.log(`🔄 ${force ? 'Force ' : ''}Fetching new emails from IMAP...`);
      
      const endpoint = force ? '/api/force-refresh' : '/api/fetch-emails';
      const result = await makeApiCall(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          count: 100,
          force: force
        })
      });
      
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
      console.error('❌ Fetch failed:', err);
    } finally {
      setFetching(false);
    }
  };

  // ✅ FIXED: Force refresh function
  const forceRefreshEmails = async () => {
    await fetchNewEmails(true);
  };

  // ✅ FIXED: Clear cache function
  const clearCache = async () => {
    try {
      const result = await makeApiCall('/api/clear-cache', {
        method: 'POST'
      });
      
      if (result.success) {
        console.log('🗑️ Cache cleared successfully');
        // Reload emails to get fresh data
        await loadAllEmails(true);
      }
    } catch (err) {
      console.error('❌ Failed to clear cache:', err);
      setError(`Failed to clear cache: ${err.message}`);
    }
  };

  // ✅ FIXED: Delete email function
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
      const result = await makeApiCall(`/api/emails/${messageId}`, {
        method: 'DELETE'
      });

      if (result.success) {
        setEmails(prevEmails => prevEmails.filter(email => email.id !== emailId));
        setFetchStatus('success');
        
        // Update stats
        if (emailStats) {
          setEmailStats(prev => ({
            ...prev,
            totalEmails: Math.max(0, prev.totalEmails - 1)
          }));
          setTotalEmails(prev => Math.max(0, prev - 1));
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

  // Process email data (keep your existing function)
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

  // Keep your existing renderAttachment function
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

  // Keep your existing EmailCard component
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

  // ✅ FIXED: Load emails on component mount
  useEffect(() => {
    console.log('🎯 Component mounted, loading ALL emails...');
    loadAllEmails(true);
  }, []);

  // ✅ FIXED: Search handler with improved logic
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