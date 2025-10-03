import React, { useEffect, useState, useCallback, useRef } from 'react';
import './App1.css';

function App() {
  const [emails, setEmails] = useState([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('date_desc');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [expandedImages, setExpandedImages] = useState({});
  const [fetchStatus, setFetchStatus] = useState('idle');
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [newEmailCount, setNewEmailCount] = useState(0);
  const [processingLogs, setProcessingLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const LIMIT = 20;
  const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
  const searchTimeoutRef = useRef(null);
  const refreshIntervalRef = useRef(null);
  const emailsRef = useRef(emails);
  const isFetchingRef = useRef(false);

  // Update ref when emails change
  useEffect(() => {
    emailsRef.current = emails;
  }, [emails]);

  // Add log entry
  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setProcessingLogs(prev => [...prev.slice(-49), { 
      id: Date.now(), 
      message, 
      type, 
      timestamp 
    }]);
  }, []);

  // Debounced search function
  const debouncedSearch = useCallback((value) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 500);
  }, []);

  // Optimized email fetching
  const loadEmails = useCallback(async (overridePage, showLoading = true, forceRefresh = false) => {
    if (showLoading) setLoading(true);
    const pageToLoad = overridePage || page;
    
    try {
      const cacheBuster = forceRefresh ? `&_=${Date.now()}` : '';
      const queries = [
        `search=${encodeURIComponent(search)}`,
        `sort=${sort}`,
        `page=${pageToLoad}`,
        `limit=${LIMIT}`
      ].join('&') + cacheBuster;

      let response;
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        response = await fetch(`${API_BASE}/api/emails?${queries}`, {
          signal: controller.signal,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error('MongoDB endpoint failed');
      } catch (mongoError) {
        if (mongoError.name !== 'AbortError') {
          console.log('MongoDB endpoint failed, trying Supabase...');
        }
        response = await fetch(`${API_BASE}/api/supabase/emails?${queries}`, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      console.log('📧 Loaded emails:', data.emails?.length || 0);
      
      if (data.emails && Array.isArray(data.emails)) {
        if (showLoading) {
          setEmails(data.emails);
        } else {
          setEmails(prev => pageToLoad === 1 ? data.emails : [...prev, ...data.emails]);
        }
        setHasMore(data.hasMore);
        setError('');
      } else {
        setError('Invalid data format from server');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Fetch error:', err);
        setError('Failed to fetch emails. Make sure backend is running.');
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [API_BASE, search, sort, page, LIMIT]);

  // Check for new email count
  const checkForNewEmails = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/check-new-emails`);
      if (response.ok) {
        const data = await response.json();
        return data.newEmails || data.total || 0;
      }
      return 0;
    } catch (error) {
      console.error('Error checking new emails:', error);
      return 0;
    }
  };

  // Force fetch emails
  const forceFetchEmails = async () => {
    if (isFetchingRef.current) return;
    
    isFetchingRef.current = true;
    setFetching(true);
    setFetchStatus('fetching');
    setError('');
    
    try {
      addLog('⚡ Starting force fetch...', 'info');
      
      const response = await fetch(`${API_BASE}/api/force-fetch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        setFetchStatus('success');
        setLastFetchTime(new Date());
        const addedCount = result.added || result.count || result.newEmails || 0;
        setNewEmailCount(addedCount);
        addLog(`✅ Force fetch successful: ${addedCount} emails processed`, 'success');
        
        setTimeout(() => {
          setPage(1);
          loadEmails(1, true);
        }, 1500);
        
      } else {
        setFetchStatus('error');
        setError(result.error || 'Force fetch failed');
      }
    } catch (err) {
      setFetchStatus('error');
      setError(`Force fetch failed: ${err.message}`);
    } finally {
      setFetching(false);
      isFetchingRef.current = false;
    }
  };

  // Simple fetch emails
  const simpleFetchEmails = async () => {
    if (isFetchingRef.current) return;
    
    isFetchingRef.current = true;
    setFetching(true);
    setFetchStatus('fetching');
    setError('');
    
    try {
      addLog('🚀 Starting simple fetch...', 'info');
      
      const response = await fetch(`${API_BASE}/api/simple-fetch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        setFetchStatus('success');
        setLastFetchTime(new Date());
        const addedCount = result.added || result.count || result.newEmails || 0;
        setNewEmailCount(addedCount);
        addLog(`✅ Simple fetch successful: ${addedCount} emails processed`, 'success');
        
        setTimeout(() => {
          setPage(1);
          loadEmails(1, true, true);
        }, 1000);
        
      } else {
        setFetchStatus('error');
        setError(result.error || 'Simple fetch failed');
      }
    } catch (err) {
      setFetchStatus('error');
      setError(`Simple fetch failed: ${err.message}`);
    } finally {
      setFetching(false);
      isFetchingRef.current = false;
    }
  };

  // Fetch new emails
  const fetchNewEmails = async () => {
    if (isFetchingRef.current) return;
    
    isFetchingRef.current = true;
    setFetching(true);
    setFetchStatus('fetching');
    setError('');
    
    try {
      addLog('🔄 Starting smart fetch...', 'info');
      
      const response = await fetch(`${API_BASE}/api/fetch-latest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        setFetchStatus('success');
        setLastFetchTime(new Date());
        const addedCount = result.added || result.count || result.newEmails || 0;
        const duplicateCount = result.duplicates || 0;
        setNewEmailCount(addedCount);
        
        addLog(`✅ Smart fetch successful: ${addedCount} new emails added`, 'success');
        addLog(`📊 Duplicates skipped: ${duplicateCount}`, 'info');
        
        setTimeout(() => {
          setPage(1);
          loadEmails(1, true, true);
        }, 2000);
        
      } else {
        setFetchStatus('error');
        setError(result.error || 'Failed to fetch new emails');
      }
    } catch (err) {
      setFetchStatus('error');
      setError(`Fetch failed: ${err.message}`);
    } finally {
      setFetching(false);
      isFetchingRef.current = false;
    }
  };

  // Force refresh emails
  const forceRefreshEmails = async () => {
    if (isFetchingRef.current) return;
    
    isFetchingRef.current = true;
    setFetching(true);
    setFetchStatus('fetching');
    setError('');
    
    try {
      await fetch(`${API_BASE}/api/clear-cache`, { method: 'POST' });
      setPage(1);
      await loadEmails(1, true);
      setFetchStatus('success');
      setLastFetchTime(new Date());
      setNewEmailCount(0);
    } catch (err) {
      setFetchStatus('error');
      setError(`Force refresh failed: ${err.message}`);
    } finally {
      setFetching(false);
      isFetchingRef.current = false;
    }
  };

  // Auto-refresh functionality
  const startAutoRefresh = () => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }
    
    refreshIntervalRef.current = setInterval(async () => {
      try {
        const newEmailCount = await checkForNewEmails();
        if (newEmailCount > 0) {
          await fetchNewEmails();
        }
      } catch (error) {
        console.error('Auto-refresh error:', error);
      }
    }, 30000);
  };

  const stopAutoRefresh = () => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
  };

  const toggleAutoRefresh = () => {
    if (autoRefresh) {
      stopAutoRefresh();
      setAutoRefresh(false);
    } else {
      startAutoRefresh();
      setAutoRefresh(true);
    }
  };

  // Load emails on search/sort/page changes
  useEffect(() => {
    loadEmails();
  }, [search, sort, page, loadEmails]);

  // Initialize auto-refresh on component mount
  useEffect(() => {
    startAutoRefresh();
    setAutoRefresh(true);
    return () => stopAutoRefresh();
  }, []);

  // Reset fetch status after 3 seconds
  useEffect(() => {
    if (fetchStatus === 'success' || fetchStatus === 'error') {
      const timer = setTimeout(() => {
        setFetchStatus('idle');
        if (fetchStatus === 'success') {
          setTimeout(() => setNewEmailCount(0), 5000);
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [fetchStatus]);

  const handlePrev = () => {
    if (page > 1) setPage(prev => prev - 1);
  };

  const handleNext = () => {
    if (hasMore) setPage(prev => prev + 1);
  };

  const toggleImageExpand = (emailIndex, attachmentIndex) => {
    const key = `${emailIndex}-${attachmentIndex}`;
    setExpandedImages(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const getFileIcon = (mimeType, filename) => {
    const extension = filename?.split('.').pop()?.toLowerCase();
    
    if (mimeType?.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType?.includes('excel') || extension === 'xlsx' || extension === 'xls') return '📊';
    if (mimeType?.includes('csv') || extension === 'csv') return '📋';
    if (mimeType?.includes('word') || extension === 'docx' || extension === 'doc') return '📝';
    if (mimeType?.includes('zip') || extension === 'zip' || extension === 'rar') return '📦';
    if (mimeType?.includes('text') || extension === 'txt') return '📄';
    
    return '📎';
  };

  const downloadFile = async (attachment, filename) => {
    try {
      if (attachment.url) {
        window.open(attachment.url, '_blank');
        return;
      }

      if (attachment.filename) {
        const response = await fetch(`${API_BASE}/api/download/${encodeURIComponent(attachment.filename)}`);
        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        } else {
          throw new Error('Download failed');
        }
      }
    } catch (error) {
      if (attachment.url) {
        window.open(attachment.url, '_blank');
      }
    }
  };

  const getFileSize = (bytes) => {
    if (!bytes) return '';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const renderAttachment = React.useCallback((attachment, index, emailIndex) => {
    const mimeType = attachment.mimeType || attachment.type || attachment.contentType;
    const filename = attachment.filename || attachment.name || `attachment_${index}`;
    const fileSize = getFileSize(attachment.size);
    const fileIcon = getFileIcon(mimeType, filename);
    const isImage = mimeType?.startsWith('image/');
    const isPDF = mimeType === 'application/pdf';
    const isExcel = mimeType?.includes('excel') || filename.endsWith('.xlsx') || filename.endsWith('.xls');
    const isCSV = mimeType?.includes('csv') || filename.endsWith('.csv');
    const isExpandable = isImage || isPDF;
    const isExpanded = expandedImages[`${emailIndex}-${index}`];

    return (
      <div key={attachment.id || attachment.url || index} className="attachment-item">
        <div className="attachment-header">
          <span className="file-icon">{fileIcon}</span>
          <div className="file-info">
            <span className="filename">{filename}</span>
            {fileSize && <span className="file-size">{fileSize}</span>}
          </div>
          <div className="attachment-actions">
            {isExpandable && (
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
              title="Download"
            >
              ⬇️
            </button>
          </div>
        </div>

        {isImage && attachment.url && (
          <div className={`image-preview ${isExpanded ? 'expanded' : ''}`}>
            <img
              src={attachment.url}
              alt={filename}
              className="attachment-image"
              onClick={() => toggleImageExpand(emailIndex, index)}
              loading="lazy"
            />
            {isExpanded && (
              <div className="image-overlay" onClick={() => toggleImageExpand(emailIndex, index)}>
                <img
                  src={attachment.url}
                  alt={filename}
                  className="expanded-image"
                />
              </div>
            )}
          </div>
        )}

        {isPDF && attachment.url && (
          <div className={`pdf-preview ${isExpanded ? 'expanded' : ''}`}>
            <iframe
              src={attachment.url}
              title={filename}
              className="pdf-iframe"
              loading="lazy"
            />
            {!isExpanded && (
              <div className="preview-overlay" onClick={() => toggleImageExpand(emailIndex, index)}>
                <span>Click to expand PDF preview</span>
              </div>
            )}
          </div>
        )}

        {(isExcel || isCSV) && (
          <div className="spreadsheet-info">
            <p>📊 Spreadsheet file - {filename}</p>
            <button 
              className="download-primary"
              onClick={() => downloadFile(attachment, filename)}
            >
              Download {isExcel ? 'Excel' : 'CSV'} File
            </button>
          </div>
        )}

        {!isImage && !isPDF && !isExcel && !isCSV && (
          <div className="generic-file">
            <p>File type: {mimeType || 'Unknown'}</p>
            <button 
              className="download-primary"
              onClick={() => downloadFile(attachment, filename)}
            >
              Download File
            </button>
          </div>
        )}
      </div>
    );
  }, [expandedImages, API_BASE]);

  const EmailCard = React.memo(({ email, index }) => (
    <div className="email-card">
      <div className="email-header">
        <div className="email-subject">
          <h3>{email.subject || '(No Subject)'}</h3>
          {email.attachments?.length > 0 && (
            <span className="attachment-badge">
              📎 {email.attachments.length}
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

      {email.attachments?.length > 0 && (
        <div className="attachments-section">
          <div className="attachments-header">
            <h4>📎 Attachments ({email.attachments.length})</h4>
          </div>
          <div className="attachments-grid">
            {email.attachments.map((attachment, attachmentIndex) =>
              renderAttachment(attachment, attachmentIndex, index)
            )}
          </div>
        </div>
      )}
    </div>
  ));

  const getStatusMessage = () => {
    switch (fetchStatus) {
      case 'fetching':
        return { message: '🔄 Fetching latest emails from server...', type: 'info' };
      case 'success':
        return { 
          message: `✅ Successfully fetched ${newEmailCount > 0 ? `${newEmailCount} new emails` : 'emails'}!`, 
          type: 'success' 
        };
      case 'error':
        return { message: `❌ ${error}`, type: 'error' };
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
              <div className="sidebar-section">
                <label>Search Emails</label>
                <input
                  type="text"
                  placeholder="🔍 Search emails..."
                  defaultValue={search}
                  onChange={e => debouncedSearch(e.target.value)}
                  className="search-input"
                />
              </div>

              <div className="sidebar-section">
                <label>Sort By</label>
                <select value={sort} onChange={e => setSort(e.target.value)} className="sort-select">
                  <option value="date_desc">📅 Newest First</option>
                  <option value="date_asc">📅 Oldest First</option>
                  <option value="subject_asc">🔤 A-Z</option>
                  <option value="subject_desc">🔤 Z-A</option>
                </select>
              </div>

              <div className="sidebar-section">
                <h4>Auto Refresh</h4>
                <button 
                  onClick={toggleAutoRefresh}
                  className={`auto-refresh-btn ${autoRefresh ? 'active' : ''}`}
                >
                  {autoRefresh ? '⏸️ Auto-Refresh ON' : '▶️ Auto-Refresh OFF'}
                </button>
              </div>

              <div className="sidebar-section">
                <h4>Connection Status</h4>
                <div className="status-info">
                  <small>Backend: {API_BASE}</small>
                  {lastFetchTime && (
                    <small>Last fetch: {lastFetchTime.toLocaleTimeString()}</small>
                  )}
                  {newEmailCount > 0 && (
                    <small className="new-email-count">New: {newEmailCount}</small>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <header className="app-header">
          <h1>📧 Email Inbox Viewer</h1>
          <p>Modern email client with advanced attachment handling</p>
        </header>

        {/* Horizontal Controls */}
        <div className="horizontal-controls">
          <div className="controls-grid">
            <div className="controls-left">
              <button 
                onClick={fetchNewEmails} 
                disabled={fetching}
                className={`fetch-button ${fetching ? 'fetching' : ''}`}
              >
                {fetching ? '🔄 Checking...' : '📥 Smart Fetch'}
              </button>

              <button 
                onClick={forceFetchEmails} 
                disabled={fetching}
                className="force-fetch-button"
              >
                ⚡ Force Fetch
              </button>

              <button 
                onClick={simpleFetchEmails} 
                disabled={fetching}
                className="simple-fetch-button"
              >
                🚀 Simple Fetch
              </button>

              <button 
                onClick={forceRefreshEmails} 
                disabled={fetching}
                className="force-refresh-button"
              >
                🔄 Refresh All
              </button>
            </div>
          </div>
        </div>

        {/* Status Banner */}
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

        {/* Processing Logs */}
        {processingLogs.length > 0 && (
          <div className="logs-container">
            <div className="logs-header">
              <h3>📋 Processing Logs</h3>
              <button 
                onClick={() => setShowLogs(!showLogs)}
                className="toggle-logs-btn"
              >
                {showLogs ? 'Hide' : 'Show'} Logs ({processingLogs.length})
              </button>
            </div>
            {showLogs && (
              <div className="logs-content">
                {processingLogs.slice(-20).map(log => (
                  <div key={log.id} className={`log-entry ${log.type}`}>
                    <span className="log-time">{log.timestamp}</span>
                    <span className="log-message">{log.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Email List */}
        {loading && (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading emails...</p>
          </div>
        )}
        
        {error && fetchStatus !== 'fetching' && (
          <div className="error-state">
            <p>❌ {error}</p>
            <div className="error-actions">
              <button onClick={() => loadEmails()} className="retry-button">
                Retry
              </button>
              <button onClick={fetchNewEmails} className="retry-button">
                Smart Fetch
              </button>
            </div>
          </div>
        )}
        
        {!loading && emails.length === 0 && !error && (
          <div className="empty-state">
            <p>📭 No emails found</p>
            <p>Try adjusting your search or fetch latest emails</p>
            <div className="empty-actions">
              <button onClick={fetchNewEmails} className="fetch-button">
                📥 Smart Fetch
              </button>
            </div>
          </div>
        )}

        <div className="email-list">
          {emails.map((email, index) => (
            <EmailCard key={email._id || email.id || index} email={email} index={index} />
          ))}
        </div>

        {emails.length > 0 && (
          <div className="pagination">
            <button 
              onClick={handlePrev} 
              disabled={page === 1 || loading}
              className="pagination-btn"
            >
              ⬅ Previous
            </button>
            <span className="page-info">Page {page}</span>
            <button 
              onClick={handleNext} 
              disabled={!hasMore || loading}
              className="pagination-btn"
            >
              Next ➡
            </button>
          </div>
        )}

        {import.meta.env.DEV && (
          <div className="debug-info">
            <details>
              <summary>Debug Info</summary>
              <div className="debug-content">
                <p>Backend: {API_BASE}</p>
                <p>Current emails: {emails.length}</p>
                <p>New email count: {newEmailCount}</p>
                <p>Page: {page}</p>
                <p>Search: "{search}"</p>
                <p>Sort: {sort}</p>
                <p>Fetch Status: {fetchStatus}</p>
                <p>Auto-refresh: {autoRefresh ? 'ON' : 'OFF'}</p>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;