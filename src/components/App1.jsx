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
  const [loadAllProgress, setLoadAllProgress] = useState(null);

  const API_BASE = '';

  // Enhanced authentication with better error handling
  const getAuthHeaders = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        console.error('❌ Authentication error:', error);
        throw new Error('Authentication required. Please log in again.');
      }
      return {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      };
    } catch (error) {
      console.error('❌ Authentication error:', error);
      throw new Error('Authentication failed');
    }
  };

  // Enhanced API error handler
  const handleApiError = async (response, defaultMessage = 'API request failed') => {
    if (response.status === 401) {
      setError('Authentication expired. Please log in again.');
      throw new Error('Authentication expired');
    }
    
    if (!response.ok) {
      let errorText;
      try {
        const errorData = await response.json();
        errorText = errorData.error || errorData.message || defaultMessage;
      } catch {
        errorText = await response.text() || defaultMessage;
      }
      console.error('❌ API Error:', errorText);
      throw new Error(errorText);
    }
    
    return response.json();
  };

  // Get user info on component mount
  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        setUser(user);
        console.log('✅ User loaded:', user?.email);
      } catch (error) {
        console.error('❌ Failed to get user:', error);
        setError('Failed to load user information');
      }
    };
    getUser();
  }, []);

  // NEW: Load ALL emails function
  const loadAllEmails = async () => {
    if (fetching) return;

    const confirmed = window.confirm(
      `🚀 LOAD ALL EMAILS\n\nThis will load ALL emails from your inbox. This may take several minutes for large inboxes.\n\n` +
      `• All emails will be processed and saved to the database\n` +
      `• Duplicates will be automatically skipped\n` +
      `• Progress will be shown during the process\n\n` +
      `Are you sure you want to continue?`
    );

    if (!confirmed) return;

    setFetching(true);
    setFetchStatus('fetching');
    setLoadAllProgress({ processed: 0, duplicates: 0, totalInInbox: 0, userEmail: user?.email });
    setError(null);

    try {
      console.log('🚀 Starting load all emails...');
      
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE}/api/load-all-emails`, {
        method: 'POST',
        headers: headers
      });

      const result = await handleApiError(response, 'Failed to load all emails');
      console.log('🚀 Load all result:', result);
      
      if (result.success) {
        setFetchStatus('success');
        setLastFetchTime(new Date());
        setLoadAllProgress(result.data);
        
        // Refresh the email list to show newly loaded emails
        await loadEmails(false, true);
        
        console.log('✅ Load all completed successfully');
      } else {
        throw new Error(result.error || 'Failed to load all emails');
      }
    } catch (err) {
      setFetchStatus('error');
      setError(err.message);
      console.error('❌ Load all failed:', err);
    } finally {
      setFetching(false);
      setTimeout(() => setLoadAllProgress(null), 5000);
    }
  };

  // Enhanced attachment URL processor
  const processAttachmentUrl = (attachment) => {
    const url = attachment.url || attachment.publicUrl || attachment.downloadUrl;
    
    if (!url) {
      console.warn('❌ No URL found for attachment:', attachment);
      return null;
    }

    let processedUrl = url;
    
    // If URL is relative, make it absolute
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

  // Enhanced process email data for new server structure
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
      read: email.read || false
    };

    // Process attachments - handle both direct attachments and enhanced structure
    if (Array.isArray(email.attachments) && email.attachments.length > 0) {
      processedEmail.attachments = email.attachments.map((att, index) => {
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
      }).filter(att => att.filename && att.url);

      processedEmail.hasAttachments = processedEmail.attachments.length > 0;
      processedEmail.attachmentsCount = processedEmail.attachments.length;
    }

    return processedEmail;
  };

  // Enhanced delete email function
  const deleteEmail = async (emailId, messageId) => {
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

      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE}/api/emails/${messageId}`, {
        method: 'DELETE',
        headers: headers
      });

      const result = await handleApiError(response, 'Failed to delete email');
      console.log('🗑️ Delete response:', result);

      if (result.success) {
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
  };

  // Enhanced load emails function
  const loadEmails = async (showLoading = true, forceRefresh = false) => {
    if (showLoading) setLoading(true);
    setError(null);

    try {
      console.log('🔄 Loading emails from backend...', forceRefresh ? '(FORCE REFRESH)' : '');

      // Clear cache first if force refresh
      if (forceRefresh) {
        try {
          const headers = await getAuthHeaders();
          await fetch(`${API_BASE}/api/clear-cache`, { 
            method: 'POST',
            headers: headers
          });
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
        `t=${Date.now()}`
      ].join('&');

      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE}/api/emails?${queries}`, {
        headers: headers
      });

      const data = await handleApiError(response, 'Failed to load emails');
      console.log('📧 Backend response:', data);
      
      let emailsToProcess = [];
      
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
        return dateB - dateA;
      });
      
      // Log attachment information
      const totalAttachments = sortedEmails.reduce((sum, email) => sum + email.attachments.length, 0);
      console.log('📎 Total attachments found:', totalAttachments);
      
      sortedEmails.forEach((email, index) => {
        if (email.attachments.length > 0) {
          console.log(`Email ${index} attachments:`, email.attachments.map(att => ({
            filename: att.filename,
            url: att.url,
            type: att.type,
            isImage: att.isImage,
            isCSV: att.isCSV,
            size: att.size
          })));
        }
      });
      
      setEmails(sortedEmails);
      console.log('✅ Emails set in state:', sortedEmails.length);
      
    } catch (err) {
      console.error('❌ Fetch error:', err);
      setEmails([]);
      setError(`Failed to load emails: ${err.message}`);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Enhanced fetch function using the new unified endpoint
  const fetchEmails = async (mode = 'latest') => {
    if (fetching) return;

    setFetching(true);
    setFetchStatus('fetching');
    setError(null);

    try {
      console.log(`🔄 Starting ${mode} fetch...`);
      
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE}/api/fetch-emails`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          mode: mode,
          count: mode === 'force' ? 20 : 30
        })
      });

      const result = await handleApiError(response, `Failed to ${mode} fetch emails`);
      console.log(`📨 ${mode} fetch result:`, result);
      
      if (result.success) {
        setFetchStatus('success');
        setLastFetchTime(new Date());
        
        if (result.data && result.data.emails && result.data.emails.length > 0) {
          console.log('🚀 Immediately updating with', result.data.emails.length, 'new emails');
          const processedNewEmails = result.data.emails.map(processEmailData);
          
          const sortedNewEmails = processedNewEmails.sort((a, b) => {
            const dateA = new Date(a.date || 0);
            const dateB = new Date(b.date || 0);
            return dateB - dateA;
          });
          
          setEmails(prevEmails => {
            const existingIds = new Set(prevEmails.map(email => email.messageId));
            const uniqueNewEmails = sortedNewEmails.filter(email => !existingIds.has(email.messageId));
            
            const allEmails = [...uniqueNewEmails, ...prevEmails];
            const finalSortedEmails = allEmails.sort((a, b) => {
              const dateA = new Date(a.date || 0);
              const dateB = new Date(b.date || 0);
              return dateB - dateA;
            });
            
            console.log(`🔄 Email state updated: ${uniqueNewEmails.length} new, ${finalSortedEmails.length} total`);
            return finalSortedEmails;
          });
        } else {
          console.log('🔄 No new emails, refreshing list to ensure proper order...');
          await loadEmails(false, true);
        }
        
      } else {
        throw new Error(result.error || `Failed to ${mode} fetch emails`);
      }
    } catch (err) {
      setFetchStatus('error');
      setError(err.message);
      console.error(`❌ ${mode} fetch failed:`, err);
    } finally {
      setFetching(false);
    }
  };

  // Individual fetch functions
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

  // Fast fetch from Supabase only
  const fastFetchEmails = async () => {
    if (fetching) return;

    setFetching(true);
    setFetchStatus('fetching');
    setError(null);

    try {
      console.log('🚀 Fast fetching emails from Supabase...');
      
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE}/api/fast-fetch`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          mode: 'fast',
          count: 100
        })
      });

      const result = await handleApiError(response, 'Failed to fast fetch emails');
      console.log('🚀 Fast fetch result:', result);
      
      if (result.success) {
        setFetchStatus('success');
        setLastFetchTime(new Date());
        
        if (result.data && result.data.emails && result.data.emails.length > 0) {
          console.log('🚀 Immediately updating with', result.data.emails.length, 'emails from Supabase');
          const processedEmails = result.data.emails.map(processEmailData);
          
          const sortedEmails = processedEmails.sort((a, b) => {
            const dateA = new Date(a.date || 0);
            const dateB = new Date(b.date || 0);
            return dateB - dateA;
          });
          
          setEmails(sortedEmails);
          console.log('✅ Fast fetch completed:', sortedEmails.length, 'emails loaded');
        } else {
          console.log('🔄 No emails found in fast fetch');
          setEmails([]);
        }
        
      } else {
        throw new Error(result.error || 'Failed to fast fetch emails');
      }
    } catch (err) {
      setFetchStatus('error');
      setError(err.message);
      console.error('❌ Fast fetch failed:', err);
    } finally {
      setFetching(false);
    }
  };

  // Enhanced download function
  const downloadFile = async (attachment, filename) => {
    try {
      console.log('⬇️ Downloading attachment:', {
        filename,
        url: attachment.url,
        type: attachment.type,
        isCSV: attachment.isCSV
      });

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

      // Test if URL is accessible
      try {
        const testResponse = await fetch(attachment.url, { method: 'HEAD' });
        if (!testResponse.ok) {
          console.warn('⚠️ URL might not be directly accessible, opening in new tab');
          window.open(attachment.url, '_blank');
          return;
        }
      } catch (testError) {
        console.warn('⚠️ URL test failed, opening in new tab:', testError);
        window.open(attachment.url, '_blank');
        return;
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

  // Enhanced attachment rendering
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

        {/* CSV File Preview */}
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

  // Enhanced EmailCard component
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
              {/* User Info */}
              {user && (
                <div className="user-info-sidebar">
                  <p><strong>Logged in as:</strong></p>
                  <p className="user-email">{user.email}</p>
                </div>
              )}
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
              {user && (
                <span className="user-badge">👤 {user.email}</span>
              )}
              {lastFetchTime && (
                <span className="last-fetch">Last: {lastFetchTime.toLocaleTimeString()}</span>
              )}
            </div>
          </div>

          {/* Compact Controls */}
          <div className="compact-controls">
            {/* Load All Emails Button */}
            <button 
              onClick={loadAllEmails} 
              disabled={fetching}
              className="load-all-button"
              title="Load ALL emails from your inbox (may take several minutes)"
            >
              🚀 Load All
            </button>

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

            {/* Fast Fetch Button */}
            <button 
              onClick={fastFetchEmails} 
              disabled={fetching}
              className="fast-fetch-button"
              title="Quickly load emails from database"
            >
              🚀 Fast Fetch
            </button>

            <button 
              onClick={simpleFetchEmails} 
              disabled={fetching}
              className="simple-fetch-button"
            >
              📨 Simple Fetch
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

        {/* Load All Progress Display */}
        {loadAllProgress && (
          <div className="load-all-progress">
            <div className="progress-header">
              <h4>🚀 Loading All Emails</h4>
              <span className="progress-stats">
                {loadAllProgress.processed} new • {loadAllProgress.duplicates} duplicates • {loadAllProgress.totalInInbox} total in inbox
              </span>
            </div>
            {fetchStatus === 'fetching' && (
              <div className="progress-bar-container">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ 
                      width: `${loadAllProgress.totalInInbox > 0 ? 
                        ((loadAllProgress.processed + loadAllProgress.duplicates) / loadAllProgress.totalInInbox) * 100 : 0}%` 
                    }}
                  ></div>
                </div>
                <div className="progress-text">
                  Processing emails... ({loadAllProgress.processed + loadAllProgress.duplicates} / {loadAllProgress.totalInInbox})
                </div>
              </div>
            )}
            {fetchStatus === 'success' && (
              <div className="progress-complete">
                ✅ Successfully loaded {loadAllProgress.processed} new emails!
              </div>
            )}
          </div>
        )}

        {/* Status Banner */}
        {statusMessage && !loadAllProgress && (
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
                <button onClick={loadAllEmails} className="load-all-button">
                  🚀 Load All Emails
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
              <p>Current emails: {emails.length}</p>
              <p>Loading: {loading ? 'Yes' : 'No'}</p>
              <p>Fetching: {fetching ? 'Yes' : 'No'}</p>
              <p>Fetch Status: {fetchStatus}</p>
              <p>Last Fetch: {lastFetchTime ? lastFetchTime.toLocaleTimeString() : 'Never'}</p>
              {user && <p>User: {user.email}</p>}
              {error && <p>Error: {error}</p>}
              {loadAllProgress && (
                <div className="load-all-debug">
                  <h4>Load All Progress:</h4>
                  <p>Processed: {loadAllProgress.processed}</p>
                  <p>Duplicates: {loadAllProgress.duplicates}</p>
                  <p>Total in Inbox: {loadAllProgress.totalInInbox}</p>
                  <p>User: {loadAllProgress.userEmail}</p>
                </div>
              )}
              <div className="attachments-debug">
                <h4>Attachments Debug:</h4>
                {emails.slice(0, 3).map((email, idx) => (
                  email.hasAttachments && (
                    <div key={idx}>
                      <p>Email {idx}: {email.attachmentsCount} attachments</p>
                      {email.attachments.map((att, attIdx) => (
                        <div key={attIdx} style={{marginLeft: '20px', fontSize: '12px'}}>
                          {att.filename} - {att.url ? '✅ URL' : '❌ No URL'} - {att.type} - {att.isImage ? '🖼️' : '📎'} - {att.isCSV ? '📋 CSV' : ''}
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