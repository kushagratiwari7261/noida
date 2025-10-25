import React, { useState, useEffect, useCallback } from 'react';
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

  // Use environment variable for API base URL with fallback
  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001';

  // Get authentication token with retry logic
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
      
      // If no session, try to refresh
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

  // Enhanced fetch with authentication and better error handling
  const fetchWithAuth = useCallback(async (url, options = {}) => {
    try {
      const token = await getAuthToken();
      
      if (!token) {
        throw new Error('No authentication token found. Please log in again.');
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      };

      console.log('🔐 Making authenticated request to:', url);
      
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle authentication errors
      if (response.status === 401) {
        // Try to refresh token once
        try {
          const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError || !session?.access_token) {
            throw new Error('Authentication failed. Please log in again.');
          }
          
          // Retry the request with new token
          headers.Authorization = `Bearer ${session.access_token}`;
          const retryResponse = await fetch(url, { ...options, headers });
          
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
  }, [getAuthToken]);

  // Enhanced load emails function with better error handling
  const loadEmails = useCallback(async (showLoading = true, forceRefresh = false) => {
    if (showLoading) setLoading(true);
    setError(null);

    try {
      console.log('🔄 Loading emails from backend...', forceRefresh ? '(FORCE REFRESH)' : '');

      // Test backend connection first
      try {
        const healthResponse = await fetch(`${API_BASE}/api/health`);
        if (!healthResponse.ok) {
          throw new Error(`Backend health check failed: ${healthResponse.status}`);
        }
        const healthData = await healthResponse.json();
        console.log('🏥 Backend health:', healthData.status);
        
        if (healthData.status === 'unhealthy') {
          throw new Error('Backend server is unhealthy. Please check server logs.');
        }
      } catch (healthErr) {
        console.error('❌ Backend health check failed:', healthErr);
        throw new Error('Backend server is not responding. Please check if the server is running.');
      }

      // Clear cache first if force refresh
      if (forceRefresh) {
        try {
          await fetchWithAuth(`${API_BASE}/api/clear-cache`, { method: 'POST' });
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
        `includeAttachments=true`,
        `t=${Date.now()}` // Cache busting parameter
      ].join('&');

      const response = await fetchWithAuth(`${API_BASE}/api/emails?${queries}`);
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
      
      // Sort emails by date to ensure latest first
      const sortedEmails = processedEmails.sort((a, b) => {
        const dateA = new Date(a.date || 0);
        const dateB = new Date(b.date || 0);
        return dateB - dateA;
      });
      
      const totalAttachments = sortedEmails.reduce((sum, email) => sum + email.attachments.length, 0);
      console.log('📎 Total attachments found:', totalAttachments);
      
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
        errorMessage = 'Backend server is not responding. Please check if the server is running on port 3001.';
      } else if (err.message.includes('Failed to load emails from server')) {
        errorMessage = `Server error: ${err.message}`;
      }
      
      setError(errorMessage);
      
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [API_BASE, fetchWithAuth, search, sort]);

  // Enhanced fetch function with better error handling
  const fetchEmails = useCallback(async (mode = 'latest') => {
    if (fetching) return;

    setFetching(true);
    setFetchStatus('fetching');
    setError(null);

    try {
      console.log(`🔄 Starting ${mode} fetch...`);
      
      const response = await fetchWithAuth(`${API_BASE}/api/fetch-emails`, {
        method: 'POST',
        body: JSON.stringify({
          mode: mode,
          count: mode === 'force' ? 20 : 30
        })
      });

      const result = await response.json();
      console.log(`📨 ${mode} fetch result:`, result);
      
      if (response.ok && result.success) {
        setFetchStatus('success');
        setLastFetchTime(new Date());
        
        // Refresh the email list after fetch
        await loadEmails(false, true);
        
      } else {
        setFetchStatus('error');
        setError(result.error || `Failed to ${mode} fetch emails`);
        console.error(`❌ ${mode} fetch failed:`, result.error);
      }
    } catch (err) {
      setFetchStatus('error');
      setError(err.message);
      console.error(`❌ ${mode} fetch failed:`, err);
      
      if (err.message.includes('Authentication failed')) {
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      }
    } finally {
      setFetching(false);
    }
  }, [API_BASE, fetchWithAuth, fetching, loadEmails]);

  // Individual fetch functions
  const fetchNewEmails = useCallback(() => fetchEmails('latest'), [fetchEmails]);
  const forceFetchEmails = useCallback(() => fetchEmails('force'), [fetchEmails]);

  // Refresh emails - force reload from database
  const forceRefreshEmails = useCallback(async () => {
    if (fetching) return;

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
    }
  }, [fetching, loadEmails]);

  // Test backend connection
  const testBackendConnection = useCallback(async () => {
    try {
      setError(null);
      console.log('🧪 Testing backend connection...');
      
      const response = await fetch(`${API_BASE}/api/health`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('🏥 Backend health:', data);
      
      if (data.status === 'healthy') {
        setError('✅ Backend is healthy and running!');
        setTimeout(() => setError(null), 3000);
      } else {
        setError(`⚠️ Backend status: ${data.status}. Check server logs.`);
      }
    } catch (err) {
      setError(`❌ Cannot connect to backend: ${err.message}`);
    }
  }, [API_BASE]);

  // Process attachment URL
  const processAttachmentUrl = useCallback((attachment) => {
    const url = attachment.url || attachment.publicUrl || attachment.downloadUrl;
    
    if (!url) {
      console.warn('❌ No URL found for attachment:', attachment);
      return null;
    }

    let processedUrl = url;
    
    if (processedUrl.startsWith('/')) {
      processedUrl = `${window.location.origin}${processedUrl}`;
    }

    console.log('🔗 Processed attachment URL:', {
      original: url,
      processed: processedUrl,
      filename: attachment.filename
    });

    return processedUrl;
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
      text: email.text || email.text_content,
      text_content: email.text_content || email.text,
      html: email.html || email.html_content,
      html_content: email.html_content || email.html,
      attachments: [],
      hasAttachments: email.hasAttachments || false,
      attachmentsCount: email.attachmentsCount || 0
    };

    if (Array.isArray(email.attachments) && email.attachments.length > 0) {
      processedEmail.attachments = email.attachments.map((att, index) => {
        const attachmentUrl = processAttachmentUrl(att);
        const mimeType = att.type || att.contentType || att.mimeType || 'application/octet-stream';
        const filename = att.filename || att.name || att.originalFilename || `attachment-${index}`;
        const isImage = att.isImage || mimeType.startsWith('image/');
        const isPDF = att.isPdf || mimeType === 'application/pdf';
        const isText = att.isText || mimeType.startsWith('text/');
        const isAudio = att.isAudio || mimeType.startsWith('audio/');
        const isVideo = att.isVideo || mimeType.startsWith('video/');
        const isCSV = filename.toLowerCase().endsWith('.csv') || mimeType.includes('csv');

        const processedAtt = {
          id: att.id || `att-${processedEmail.id}-${index}-${Math.random().toString(36).substr(2, 9)}`,
          filename: filename,
          name: att.name || filename,
          originalFilename: att.originalFilename || filename,
          url: attachmentUrl,
          publicUrl: att.publicUrl || attachmentUrl,
          downloadUrl: att.downloadUrl || attachmentUrl,
          previewUrl: att.previewUrl || (isImage ? attachmentUrl : null),
          type: mimeType,
          contentType: mimeType,
          mimeType: mimeType,
          size: att.size || 0,
          extension: att.extension || filename.split('.').pop() || 'bin',
          isImage: isImage,
          isPdf: isPDF,
          isText: isText,
          isAudio: isAudio,
          isVideo: isVideo,
          isCSV: isCSV,
          path: att.path,
          displayName: att.displayName || filename,
          originalData: att
        };

        return processedAtt;
      }).filter(att => att.filename && att.url);

      processedEmail.hasAttachments = processedEmail.attachments.length > 0;
      processedEmail.attachmentsCount = processedEmail.attachments.length;
    }

    return processedEmail;
  }, [processAttachmentUrl]);

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
      const response = await fetchWithAuth(`${API_BASE}/api/emails/${messageId}`, {
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
  }, [API_BASE, fetchWithAuth]);

  // Download file
  const downloadFile = useCallback(async (attachment, filename) => {
    try {
      console.log('⬇️ Downloading attachment:', { filename, url: attachment.url, type: attachment.type });

      if (attachment.isCSV) {
        const confirmed = window.confirm(
          `Are you sure you want to download the CSV file "${filename}"?\n\nThis will save the file to your downloads folder.`
        );
        if (!confirmed) {
          console.log('❌ CSV download cancelled by user');
          return;
        }
      }

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
    if (mimeType.includes('zip') || extension === 'zip' || extension === 'rar' || extension === '7z') return '📦';
    if (mimeType.includes('text') || extension === 'txt') return '📄';
    if (mimeType.includes('audio') || extension === 'mp3' || extension === 'wav' || extension === 'ogg') return '🎵';
    if (mimeType.includes('video') || extension === 'mp4' || extension === 'avi' || extension === 'mov') return '🎬';
    if (mimeType.includes('presentation') || extension === 'ppt' || extension === 'pptx') return '📊';
    if (extension === 'exe' || extension === 'msi') return '⚙️';
    if (extension === 'js' || extension === 'html' || extension === 'css') return '💻';
    
    return '📎';
  }, []);

  // File size helper
  const getFileSize = useCallback((bytes) => {
    if (!bytes || bytes === 0) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }, []);

  // Render attachment
  const renderAttachment = useCallback((attachment, index, emailIndex) => {
    const mimeType = attachment.mimeType || attachment.type;
    const filename = attachment.filename || `attachment_${index}`;
    const fileSize = getFileSize(attachment.size);
    const fileIcon = getFileIcon(mimeType, filename);
    const isImage = attachment.isImage || mimeType?.startsWith('image/');
    const isPDF = attachment.isPdf || mimeType === 'application/pdf';
    const isCSV = attachment.isCSV || filename.toLowerCase().endsWith('.csv');
    const isExpanded = expandedImages[`${emailIndex}-${index}`];
    const safeUrl = attachment.url;

    const isProblematicFile = 
      attachment.url?.includes('godaddy') || 
      attachment.url?.includes('tracking') ||
      attachment.url?.includes('pixel') ||
      filename.match(/track|pixel|beacon|analytics|spacer|forward/i);

    if (isProblematicFile) {
      return (
        <div key={attachment.id} className="attachment-item blocked-attachment">
          <div className="attachment-header">
            <span className="file-icon">🚫</span>
            <div className="file-info">
              <span className="filename">{filename}</span>
              {fileSize && <span className="file-size">{fileSize}</span>}
              <div className="tracking-warning">
                <small>Tracking pixel blocked for privacy</small>
              </div>
            </div>
            <div className="attachment-actions">
              <button 
                className="download-btn blocked"
                onClick={() => alert('Tracking pixels are blocked for privacy and performance reasons.')}
                title="Blocked - Tracking Pixel"
                disabled
              >
                🚫
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div key={attachment.id} className="attachment-item">
        <div className="attachment-header">
          <span className="file-icon">{fileIcon}</span>
          <div className="file-info">
            <span className="filename">{filename}</span>
            {fileSize && <span className="file-size">{fileSize}</span>}
            <div className="file-type">
              <small>{mimeType || 'Unknown type'}</small>
              {isCSV && <span className="csv-badge">CSV</span>}
            </div>
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
                console.error('❌ Image failed to load:', safeUrl);
                e.target.style.display = 'none';
                const fallback = e.target.parentElement.querySelector('.image-fallback');
                if (fallback) fallback.style.display = 'block';
              }}
            />
            <div className="image-fallback" style={{display: 'none'}}>
              🖼️ Image not available - <a href={safeUrl} target="_blank" rel="noopener noreferrer">Open in new tab</a>
            </div>
            {isExpanded && (
              <div className="image-overlay" onClick={() => toggleImageExpand(emailIndex, index)}>
                <div className="expanded-image-container">
                  <img
                    src={safeUrl}
                    alt={filename}
                    className="expanded-image"
                    crossOrigin="anonymous"
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

        {isPDF && safeUrl && (
          <div className={`pdf-preview ${isExpanded ? 'expanded' : ''}`}>
            {isExpanded ? (
              <div className="pdf-full-view">
                <button 
                  className="close-pdf-btn"
                  onClick={() => toggleImageExpand(emailIndex, index)}
                >
                  ✕ Close PDF
                </button>
                <iframe
                  src={safeUrl}
                  title={filename}
                  className="pdf-iframe"
                  loading="lazy"
                />
              </div>
            ) : (
              <div className="pdf-thumbnail" onClick={() => toggleImageExpand(emailIndex, index)}>
                <div className="pdf-icon">📄</div>
                <span className="pdf-filename">{filename}</span>
                <button className="view-pdf-btn">View PDF</button>
              </div>
            )}
          </div>
        )}

        {isCSV && safeUrl && (
          <div className="csv-preview">
            <div className="csv-preview-content">
              <h5>📋 CSV File</h5>
              <div className="csv-warning">
                <p>⚠️ CSV files may contain data that could be automatically processed.</p>
                <p>Click download to save this file to your computer.</p>
              </div>
              <div className="csv-actions">
                <button 
                  className="download-csv-btn"
                  onClick={() => downloadFile(attachment, filename)}
                >
                  💾 Download CSV
                </button>
                <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="view-csv-link">
                  🔗 Open in new tab
                </a>
              </div>
            </div>
          </div>
        )}

        {!safeUrl && (
          <div className="no-url-warning">
            <p>⚠️ No download URL available for this attachment</p>
            <p><small>Filename: {filename}</small></p>
          </div>
        )}
      </div>
    );
  }, [downloadFile, expandedImages, getFileIcon, getFileSize]);

  const toggleImageExpand = useCallback((emailIndex, attachmentIndex) => {
    const key = `${emailIndex}-${attachmentIndex}`;
    setExpandedImages(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  }, []);

  // Enhanced EmailCard component
  const EmailCard = React.memo(({ email, index }) => (
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
  ));

  // Get current user on component mount
  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
        console.log('👤 Current user:', user?.email);
      } catch (error) {
        console.error('❌ Error getting user:', error);
      }
    };
    getUser();
  }, []);

  // Load emails when component mounts
  useEffect(() => {
    console.log('🎯 Component mounted, loading emails...');
    loadEmails(true, true);
  }, [loadEmails]);

  // Load emails when search or sort changes
  useEffect(() => {
    const timer = setTimeout(() => {
      loadEmails(true, false);
    }, 500);
    
    return () => clearTimeout(timer);
  }, [search, sort, loadEmails]);

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
              <p>Backend: {API_BASE}</p>
              <p>Current user: {user?.email}</p>
              <p>Current emails: {emails.length}</p>
              <p>Loading: {loading ? 'Yes' : 'No'}</p>
              <p>Fetching: {fetching ? 'Yes' : 'No'}</p>
              <p>Fetch Status: {fetchStatus}</p>
              <p>Last Fetch: {lastFetchTime ? lastFetchTime.toLocaleTimeString() : 'Never'}</p>
              {error && <p>Error: {error}</p>}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

export default App;