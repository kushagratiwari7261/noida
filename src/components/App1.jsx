import React, { useState, useEffect } from 'react';
import './App1.css';

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

  const API_BASE = '';

  // Simple attachment URL processor
  const processAttachmentUrl = (attachment) => {
    // Return the URL as-is since backend provides full URLs
    return attachment.url;
  };

  // Fixed process email data with direct attachment handling
  const processEmailData = (email) => {
    const processedEmail = {
      id: email._id || email.id,
      _id: email._id || email.id,
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
      attachments: []
    };

    // Process attachments - handle both direct attachments and recentEmailsWithAttachments structure
    if (Array.isArray(email.attachments) && email.attachments.length > 0) {
      processedEmail.attachments = email.attachments.map((att, index) => {
        // Use the direct URL from the backend response
        const attachmentUrl = processAttachmentUrl(att);
        
        const processedAtt = {
          id: att.id || att.filename || `att-${email.id}-${index}-${Math.random().toString(36).substr(2, 9)}`,
          filename: att.filename || `attachment-${index}`,
          url: attachmentUrl, // Use the direct URL
          type: att.type || att.contentType || att.mimeType || 'application/octet-stream',
          size: att.size || 0,
          mimeType: att.type || att.contentType || att.mimeType || 'application/octet-stream',
          originalData: att
        };

        console.log('📎 Processed attachment:', {
          filename: processedAtt.filename,
          url: processedAtt.url,
          type: processedAtt.type,
          size: processedAtt.size
        });

        return processedAtt;
      }).filter(att => att.filename && att.url);
    }

    return processedEmail;
  };

  // Enhanced load emails function to handle different response structures
  const loadEmails = async (showLoading = true, forceRefresh = false) => {
    if (showLoading) setLoading(true);
    setError(null);
    
    try {
      console.log('🔄 Loading emails from backend...', forceRefresh ? '(FORCE REFRESH)' : '');
      
      // Clear cache first if force refresh
      if (forceRefresh) {
        try {
          await fetch(`${API_BASE}/api/clear-cache`, { method: 'POST' });
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
        `includeAttachments=true`,
        `t=${Date.now()}` // Cache busting parameter
      ].join('&');

      const response = await fetch(`${API_BASE}/api/emails?${queries}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('📧 Backend response:', data);
      
      let emailsToProcess = [];
      
      // Handle different response structures
      if (data.recentEmailsWithAttachments && Array.isArray(data.recentEmailsWithAttachments)) {
        console.log('📧 Using recentEmailsWithAttachments structure');
        emailsToProcess = data.recentEmailsWithAttachments;
      } else if (data.emails && Array.isArray(data.emails)) {
        console.log('📧 Using emails structure');
        emailsToProcess = data.emails;
      } else {
        console.log('❌ No emails found in response');
        setEmails([]);
        return;
      }
      
      console.log('📧 Loaded emails:', emailsToProcess.length);
      
      const processedEmails = emailsToProcess.map(processEmailData);
      
      // Log attachment information
      const totalAttachments = processedEmails.reduce((sum, email) => sum + email.attachments.length, 0);
      console.log('📎 Total attachments found:', totalAttachments);
      
      processedEmails.forEach((email, index) => {
        if (email.attachments.length > 0) {
          console.log(`Email ${index} attachments:`, email.attachments.map(att => ({
            filename: att.filename,
            url: att.url,
            type: att.type,
            size: att.size
          })));
        }
      });
      
      setEmails(processedEmails);
      console.log('✅ Emails set in state:', processedEmails.length);
      
    } catch (err) {
      console.error('❌ Fetch error:', err);
      setEmails([]);
      setError(`Failed to load emails: ${err.message}`);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Fetch new emails - NO DATABASE RELOAD
  const fetchNewEmails = async () => {
    if (fetching) return;
    
    setFetching(true);
    setFetchStatus('fetching');
    setError(null);
    
    try {
      console.log('🔄 Starting smart fetch...');
      const response = await fetch(`${API_BASE}/api/fetch-latest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();
      console.log('📨 Fetch result:', result);
      
      if (response.ok && result.success) {
        setFetchStatus('success');
        setLastFetchTime(new Date());
        
        // ONLY immediate update - no database reload
        if (result.emails && result.emails.length > 0) {
          console.log('🚀 Immediately updating with', result.emails.length, 'new emails');
          const processedNewEmails = result.emails.map(processEmailData);
          
          setEmails(prevEmails => {
            const existingIds = new Set(prevEmails.map(email => email.messageId));
            const uniqueNewEmails = processedNewEmails.filter(email => !existingIds.has(email.messageId));
            return [...uniqueNewEmails, ...prevEmails];
          });
        }
        
      } else {
        setFetchStatus('error');
        setError(result.error || 'Failed to fetch emails');
        console.error('❌ Fetch failed:', result.error);
      }
    } catch (err) {
      setFetchStatus('error');
      setError(err.message);
      console.error('❌ Fetch failed:', err);
    } finally {
      setFetching(false);
    }
  };

  // Force fetch emails - NO DATABASE RELOAD
  const forceFetchEmails = async () => {
    if (fetching) return;
    
    setFetching(true);
    setFetchStatus('fetching');
    setError(null);
    
    try {
      console.log('⚡ Starting force fetch...');
      const response = await fetch(`${API_BASE}/api/force-fetch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();
      console.log('📨 Force fetch result:', result);
      
      if (response.ok && result.success) {
        setFetchStatus('success');
        setLastFetchTime(new Date());
        
        // ONLY immediate update - no database reload
        if (result.emails && result.emails.length > 0) {
          console.log('🚀 Immediately updating with', result.emails.length, 'new emails');
          const processedNewEmails = result.emails.map(processEmailData);
          
          setEmails(prevEmails => {
            const existingIds = new Set(prevEmails.map(email => email.messageId));
            const uniqueNewEmails = processedNewEmails.filter(email => !existingIds.has(email.messageId));
            return [...uniqueNewEmails, ...prevEmails];
          });
        }
        
      } else {
        setFetchStatus('error');
        setError(result.error || 'Failed to force fetch emails');
        console.error('❌ Force fetch failed:', result.error);
      }
    } catch (err) {
      setFetchStatus('error');
      setError(err.message);
      console.error('❌ Force fetch failed:', err);
    } finally {
      setFetching(false);
    }
  };

  // Simple fetch emails - NO DATABASE RELOAD
  const simpleFetchEmails = async () => {
    if (fetching) return;
    
    setFetching(true);
    setFetchStatus('fetching');
    setError(null);
    
    try {
      console.log('🚀 Starting simple fetch...');
      const response = await fetch(`${API_BASE}/api/simple-fetch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();
      console.log('📨 Simple fetch result:', result);
      
      if (response.ok && result.success) {
        setFetchStatus('success');
        setLastFetchTime(new Date());
        
        // ONLY immediate update - no database reload
        if (result.emails && result.emails.length > 0) {
          console.log('🚀 Immediately updating with', result.emails.length, 'new emails');
          const processedNewEmails = result.emails.map(processEmailData);
          
          setEmails(prevEmails => {
            const existingIds = new Set(prevEmails.map(email => email.messageId));
            const uniqueNewEmails = processedNewEmails.filter(email => !existingIds.has(email.messageId));
            return [...uniqueNewEmails, ...prevEmails];
          });
        }
        
      } else {
        setFetchStatus('error');
        setError(result.error || 'Failed to simple fetch emails');
        console.error('❌ Simple fetch failed:', result.error);
      }
    } catch (err) {
      setFetchStatus('error');
      setError(err.message);
      console.error('❌ Simple fetch failed:', err);
    } finally {
      setFetching(false);
    }
  };

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

  // Enhanced download function for all attachment types
  const downloadFile = async (attachment, filename) => {
    try {
      console.log('⬇️ Downloading attachment:', {
        filename,
        url: attachment.url,
        type: attachment.type
      });

      if (!attachment.url) {
        throw new Error('No URL available for download');
      }

      // For all file types, create a download link
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

  // Enhanced attachment rendering with support for all file types
  const renderAttachment = (attachment, index, emailIndex) => {
    const mimeType = attachment.mimeType || attachment.type;
    const filename = attachment.filename || `attachment_${index}`;
    const fileSize = getFileSize(attachment.size);
    const fileIcon = getFileIcon(mimeType, filename);
    const isImage = mimeType?.startsWith('image/');
    const isPDF = mimeType === 'application/pdf';
    const isText = mimeType?.startsWith('text/');
    const isAudio = mimeType?.startsWith('audio/');
    const isVideo = mimeType?.startsWith('video/');
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
        {isText && safeUrl && (
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
        {!isImage && !isPDF && !isText && !isAudio && !isVideo && safeUrl && (
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

  const EmailCard = ({ email, index }) => (
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
  );

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

        {/* Email List - Takes full remaining space */}
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
                <EmailCard key={email._id || email.id || index} email={email} index={index} />
              ))}
            </div>
          )}
        </div>

        {/* Debug Info - Collapsible at bottom */}
        <div className="debug-info">
          <details>
            <summary>Debug Info</summary>
            <div className="debug-content">
              <p>Backend: {API_BASE}</p>
              <p>Current emails: {emails.length}</p>
              <p>Loading: {loading ? 'Yes' : 'No'}</p>
              <p>Fetching: {fetching ? 'Yes' : 'No'}</p>
              <p>Fetch Status: {fetchStatus}</p>
              <p>Last Fetch: {lastFetchTime ? lastFetchTime.toLocaleTimeString() : 'Never'}</p>
              {error && <p>Error: {error}</p>}
              <div className="attachments-debug">
                <h4>Attachments Debug:</h4>
                {emails.map((email, idx) => (
                  email.attachments.length > 0 && (
                    <div key={idx}>
                      <p>Email {idx}: {email.attachments.length} attachments</p>
                      {email.attachments.map((att, attIdx) => (
                        <div key={attIdx} style={{marginLeft: '20px', fontSize: '12px'}}>
                          {att.filename} - {att.url ? '✅ URL' : '❌ No URL'} - {att.type}
                        </div>
                      ))}
                    </div>
                  )
                ))}
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

export default App;