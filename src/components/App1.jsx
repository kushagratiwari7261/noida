import React, { useState, useEffect } from 'react';
import './App1.css';
import { supabase } from '../lib/supabaseClient'; // Import Supabase client

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
  const [user, setUser] = useState(null); // Add user state

  const API_BASE = 'http://localhost:3001'; // Update with your backend URL

  // Get authentication token
  const getAuthToken = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        return session.access_token;
      }
      return null;
    } catch (error) {
      console.error('❌ Error getting auth token:', error);
      return null;
    }
  };

  // Enhanced fetch with authentication
  const fetchWithAuth = async (url, options = {}) => {
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

    if (response.status === 401) {
      throw new Error('Authentication failed. Please log in again.');
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response;
  };

  // Enhanced attachment URL processor with better CSV handling
  const processAttachmentUrl = (attachment) => {
    // Try multiple URL properties from backend
    const url = attachment.url || attachment.publicUrl || attachment.downloadUrl;
    
    if (!url) {
      console.warn('❌ No URL found for attachment:', attachment);
      return null;
    }

    // Ensure URL is properly formatted
    let processedUrl = url;
    
    // If URL is relative, make it absolute (shouldn't happen with Supabase)
    if (processedUrl.startsWith('/')) {
      processedUrl = `${window.location.origin}${processedUrl}`;
    }

    console.log('🔗 Processed attachment URL:', {
      original: url,
      processed: processedUrl,
      filename: attachment.filename
    });

    return processedUrl;
  };

  // Enhanced process email data with better attachment handling and CSV protection
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
      date: email.date,
      text: email.text || email.text_content,
      text_content: email.text_content || email.text,
      html: email.html || email.html_content,
      html_content: email.html_content || email.html,
      attachments: [],
      hasAttachments: email.hasAttachments || false,
      attachmentsCount: email.attachmentsCount || 0
    };

    // Process attachments - handle both direct attachments and enhanced structure
    if (Array.isArray(email.attachments) && email.attachments.length > 0) {
      processedEmail.attachments = email.attachments.map((att, index) => {
        // Use the enhanced URL processor
        const attachmentUrl = processAttachmentUrl(att);
        
        // Determine file type and properties
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

        console.log('📎 Enhanced attachment processed:', {
          filename: processedAtt.filename,
          url: processedAtt.url,
          type: processedAtt.type,
          size: processedAtt.size,
          isImage: processedAtt.isImage,
          isPdf: processedAtt.isPdf,
          isCSV: processedAtt.isCSV
        });

        return processedAtt;
      }).filter(att => att.filename && att.url); // Only keep attachments with filename and URL

      processedEmail.hasAttachments = processedEmail.attachments.length > 0;
      processedEmail.attachmentsCount = processedEmail.attachments.length;
    }

    return processedEmail;
  };

  // NEW: Delete email function with authentication
  const deleteEmail = async (emailId, messageId) => {
    if (!emailId && !messageId) {
      console.error('❌ No email ID or message ID provided for deletion');
      setError('Cannot delete email: Missing identifier');
      return;
    }

    // Confirm deletion
    const confirmed = window.confirm(
      'Are you sure you want to delete this email?\n\nThis will permanently remove the email and all its attachments from the database. This action cannot be undone.'
    );

    if (!confirmed) {
      return;
    }

    // Set deleting state for this email
    setDeletingEmails(prev => ({ ...prev, [emailId]: true }));

    try {
      console.log('🗑️ Deleting email:', { emailId, messageId });

      const response = await fetchWithAuth(`${API_BASE}/api/emails/${messageId}`, {
        method: 'DELETE',
      });

      const result = await response.json();
      console.log('🗑️ Delete response:', result);

      if (response.ok && result.success) {
        // Remove email from local state immediately
        setEmails(prevEmails => prevEmails.filter(email => email.id !== emailId));
        console.log('✅ Email deleted successfully');
        
        // Show success message
        setFetchStatus('success');
        setTimeout(() => setFetchStatus('idle'), 3000);
      } else {
        throw new Error(result.error || 'Failed to delete email');
      }
    } catch (err) {
      console.error('❌ Delete error:', err);
      setError(`Failed to delete email: ${err.message}`);
    } finally {
      // Clear deleting state
      setDeletingEmails(prev => ({ ...prev, [emailId]: false }));
    }
  };

  // Enhanced load emails function with proper sorting and authentication
  const loadEmails = async (showLoading = true, forceRefresh = false) => {
    if (showLoading) setLoading(true);
    setError(null);

    try {
      console.log('🔄 Loading emails from backend...', forceRefresh ? '(FORCE REFRESH)' : '');

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
      
      let emailsToProcess = [];
      
      // Handle response structure
      if (data.emails && Array.isArray(data.emails)) {
        emailsToProcess = data.emails;
      } else if (Array.isArray(data)) {
        emailsToProcess = data;
      } else {
        console.log('❌ No emails found in response');
        setEmails([]);
        return;
      }
      
      console.log('📧 Loaded emails:', emailsToProcess.length);
      
      const processedEmails = emailsToProcess.map(processEmailData);
      
      // Sort emails by date to ensure latest first
      const sortedEmails = processedEmails.sort((a, b) => {
        const dateA = new Date(a.date || 0);
        const dateB = new Date(b.date || 0);
        return dateB - dateA; // Descending (newest first)
      });
      
      // Log attachment information
      const totalAttachments = sortedEmails.reduce((sum, email) => sum + email.attachments.length, 0);
      console.log('📎 Total attachments found:', totalAttachments);
      
      setEmails(sortedEmails);
      console.log('✅ Emails set in state:', sortedEmails.length);
      
    } catch (err) {
      console.error('❌ Fetch error:', err);
      setEmails([]);
      setError(`Failed to load emails: ${err.message}`);
      
      // If authentication failed, redirect to login
      if (err.message.includes('Authentication failed')) {
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Enhanced fetch function with authentication
  const fetchEmails = async (mode = 'latest') => {
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
      
      // If authentication failed, redirect to login
      if (err.message.includes('Authentication failed')) {
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      }
    } finally {
      setFetching(false);
    }
  };

  // Individual fetch functions for backward compatibility
  const fetchNewEmails = () => fetchEmails('latest');
  const forceFetchEmails = () => fetchEmails('force');
  const simpleFetchEmails = () => fetchEmails('simple');

  // Refresh emails - force reload from database
  const forceRefreshEmails = async () => {
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
  };

  // Fast fetch from Supabase only (remove if endpoint doesn't exist)
  const fastFetchEmails = async () => {
    setError('Fast fetch endpoint not available. Use Smart Fetch instead.');
    return;
  };

  // Enhanced download function with CSV protection and better error handling
  const downloadFile = async (attachment, filename) => {
    try {
      console.log('⬇️ Downloading attachment:', {
        filename,
        url: attachment.url,
        type: attachment.type,
        isCSV: attachment.isCSV
      });

      // Extra protection for CSV files - require user confirmation
      if (attachment.isCSV) {
        const confirmed = window.confirm(
          `Are you sure you want to download the CSV file "${filename}"?\n\n` +
          `This will save the file to your downloads folder.`
        );
        
        if (!confirmed) {
          console.log('❌ CSV download cancelled by user');
          return;
        }
      }

      if (!attachment.url) {
        throw new Error('No URL available for download');
      }

      // Use download attribute for direct download
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
      // Fallback: Open in new tab
      if (attachment.url) {
        window.open(attachment.url, '_blank');
      } else {
        alert(`Download failed: ${error.message}`);
      }
    }
  };

  // Enhanced file icon function
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
    if (mimeType.includes('text') || extension === 'txt') return '📄';
    if (mimeType.includes('audio') || extension === 'mp3' || extension === 'wav' || extension === 'ogg') return '🎵';
    if (mimeType.includes('video') || extension === 'mp4' || extension === 'avi' || extension === 'mov') return '🎬';
    if (mimeType.includes('presentation') || extension === 'ppt' || extension === 'pptx') return '📊';
    if (extension === 'exe' || extension === 'msi') return '⚙️';
    if (extension === 'js' || extension === 'html' || extension === 'css') return '💻';
    
    return '📎';
  };

  const getFileSize = (bytes) => {
    if (!bytes || bytes === 0) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Enhanced attachment rendering with better CSV handling and fixed button positioning
  const renderAttachment = (attachment, index, emailIndex) => {
    const mimeType = attachment.mimeType || attachment.type;
    const filename = attachment.filename || `attachment_${index}`;
    const fileSize = getFileSize(attachment.size);
    const fileIcon = getFileIcon(mimeType, filename);
    const isImage = attachment.isImage || mimeType?.startsWith('image/');
    const isPDF = attachment.isPdf || mimeType === 'application/pdf';
    const isText = attachment.isText || mimeType?.startsWith('text/');
    const isAudio = attachment.isAudio || mimeType?.startsWith('audio/');
    const isVideo = attachment.isVideo || mimeType?.startsWith('video/');
    const isCSV = attachment.isCSV || filename.toLowerCase().endsWith('.csv');
    const isExpandable = isImage || isPDF;
    const isExpanded = expandedImages[`${emailIndex}-${index}`];
    
    // Enhanced problematic file detection
    const isProblematicFile = 
      attachment.url?.includes('godaddy') || 
      attachment.url?.includes('tracking') ||
      attachment.url?.includes('pixel') ||
      attachment.url?.includes('beacon') ||
      attachment.url?.includes('analytics') ||
      attachment.url?.includes('gem.') ||
      filename.match(/\.(gif)$/i) ||
      filename.match(/track|pixel|beacon|analytics|spacer|forward/i) ||
      (isImage && filename.match(/\.gif$/i)) ||
      (filename === 'native_forward.gif') ||
      (attachment.url && attachment.url.match(/native_forward\.gif$/i));

    const safeUrl = attachment.url;

    // For problematic files, show minimal info and block loading
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
                onClick={() => {
                  console.log('Blocked tracking pixel:', filename, attachment.url);
                  alert('Tracking pixels are blocked for privacy and performance reasons.');
                }}
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
            {isExpandable && safeUrl && (
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

        {/* Image Preview */}
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
              onLoad={(e) => {
                console.log('✅ Image loaded successfully:', safeUrl);
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
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.parentElement.innerHTML = '<div class="error-message">Failed to load image</div>';
                    }}
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

        {/* PDF Preview */}
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

        {/* Text File Preview */}
        {isText && safeUrl && !isCSV && (
          <div className="text-preview">
            <div className="text-preview-content">
              <h5>Text File Preview:</h5>
              <iframe
                src={safeUrl}
                title={filename}
                className="text-iframe"
                loading="lazy"
              />
              <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="full-view-link">
                📄 Open full text
              </a>
            </div>
          </div>
        )}

        {/* CSV File Preview - Limited to prevent auto-download */}
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

        {/* Audio Preview */}
        {isAudio && safeUrl && (
          <div className="audio-preview">
            <div className="audio-player">
              <audio controls className="audio-element">
                <source src={safeUrl} type={mimeType} />
                Your browser does not support the audio element.
              </audio>
              <a href={safeUrl} download={filename} className="download-audio">
                💾 Download Audio
              </a>
            </div>
          </div>
        )}

        {/* Video Preview */}
        {isVideo && safeUrl && (
          <div className="video-preview">
            <div className="video-player">
              <video controls className="video-element" preload="metadata">
                <source src={safeUrl} type={mimeType} />
                Your browser does not support the video element.
              </video>
              <a href={safeUrl} download={filename} className="download-video">
                💾 Download Video
              </a>
            </div>
          </div>
        )}

        {/* Generic file info for non-previewable files */}
        {!isImage && !isPDF && !isText && !isAudio && !isVideo && !isCSV && safeUrl && (
          <div className="file-preview">
            <div className="file-info-detailed">
              <p><strong>Type:</strong> {mimeType || 'Unknown'}</p>
              <p><strong>Size:</strong> {fileSize || 'Unknown'}</p>
              <div className="file-actions">
                <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="direct-link">
                  🔗 Open directly
                </a>
                <button 
                  onClick={() => downloadFile(attachment, filename)}
                  className="download-direct"
                >
                  💾 Download
                </button>
              </div>
            </div>
          </div>
        )}

        {/* No URL available */}
        {!safeUrl && (
          <div className="no-url-warning">
            <p>⚠️ No download URL available for this attachment</p>
            <p><small>Filename: {filename}</small></p>
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

  // Enhanced EmailCard component with delete button and better attachment layout
  const EmailCard = ({ email, index }) => (
    <div className="email-card">
      {/* Delete Button - Top Right */}
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

  // Get current user on component mount
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      console.log('👤 Current user:', user?.email);
    };
    getUser();
  }, []);

  // Load emails when component mounts
  useEffect(() => {
    console.log('🎯 Component mounted, loading emails...');
    loadEmails(true, true);
  }, []);

  // Load emails when search or sort changes
  useEffect(() => {
    const timer = setTimeout(() => {
      loadEmails(true, false);
    }, 500);
    
    return () => clearTimeout(timer);
  }, [search, sort]);

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