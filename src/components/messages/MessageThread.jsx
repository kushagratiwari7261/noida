import { useState, useRef, useEffect } from 'react';
import { useFileUpload } from '../../hooks/useFileUpload';
import './MessageThread.css';

const MessageThread = ({ message, currentUser, onDelete, onBack, onSendReply }) => {
  const [replyContent, setReplyContent] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [showAttachments, setShowAttachments] = useState(false);
  const fileInputRef = useRef(null);
  const { uploadFile, getFileUrl, uploading, progress } = useFileUpload();

  const isSender = message.sender_id === currentUser?.id;

  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files);
    
    try {
      for (const file of files) {
        const uploadedFile = await uploadFile(file, currentUser.id);
        setAttachments(prev => [...prev, uploadedFile]);
      }
    } catch (error) {
      console.error('Error uploading files:', error);
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSendReply = async () => {
    if (!replyContent.trim() && attachments.length === 0) return;

    const messageData = {
      receiver_id: isSender ? message.receiver_id : message.sender_id,
      content: replyContent,
      parent_message_id: message.id,
      attachments: attachments
    };

    const result = await onSendReply(messageData);
    
    if (!result.error) {
      setReplyContent('');
      setAttachments([]);
      setShowAttachments(false);
    }
  };

  const downloadAttachment = async (attachment) => {
    try {
      const url = getFileUrl(attachment.storage_path);
      const response = await fetch(url);
      const blob = await response.blob();
      
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = attachment.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  };

  return (
    <div className="message-thread">
      <div className="thread-header">
        <button onClick={onBack} className="btn-back" aria-label="Back to messages">
          ← Back
        </button>
        
        <div className="thread-actions">
          <button 
            onClick={() => onDelete(message.id)}
            className="btn-delete"
            aria-label="Delete message"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="original-message">
        <div className="message-header">
          <div className="sender-info">
            <div className="sender-avatar">
              {message.sender?.avatar_url ? (
                <img src={message.sender.avatar_url} alt={message.sender.full_name} />
              ) : (
                <div className="avatar-fallback">
                  {(message.sender?.full_name || message.sender?.username || 'U').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="sender-details">
              <div className="sender-name">
                {isSender ? 'You' : message.sender?.full_name || message.sender?.username}
              </div>
              <div className="message-time">
                {new Date(message.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {message.subject && (
          <div className="message-subject">
            {message.subject}
          </div>
        )}

        <div className="message-content">
          {message.content}
        </div>

        {message.attachments && message.attachments.length > 0 && (
          <div className="message-attachments">
            <h4>Attachments ({message.attachments.length})</h4>
            <div className="attachments-list">
              {message.attachments.map((attachment) => (
                <div key={attachment.id} className="attachment-item">
                  <button 
                    onClick={() => downloadAttachment(attachment)}
                    className="attachment-link"
                  >
                    <span className="attachment-icon">📎</span>
                    {attachment.file_name}
                    <span className="file-size">
                      ({(attachment.file_size / 1024).toFixed(1)} KB)
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="reply-section">
        <div className="reply-input">
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="Type your reply..."
            rows="4"
          />
          
          {showAttachments && (
            <div className="attachments-preview">
              {attachments.map((attachment, index) => (
                <div key={index} className="attachment-preview">
                  <span>{attachment.name}</span>
                  <button 
                    onClick={() => removeAttachment(index)}
                    className="remove-attachment"
                  >
                    ×
                  </button>
                </div>
              ))}
              {uploading && (
                <div className="upload-progress">
                  <div 
                    className="progress-bar" 
                    style={{ width: `${progress}%` }}
                  ></div>
                  <span>Uploading... {Math.round(progress)}%</span>
                </div>
              )}
            </div>
          )}

          <div className="reply-actions">
            <div className="attachment-actions">
              <button
                onClick={() => setShowAttachments(!showAttachments)}
                className="btn-attachment"
                aria-label="Attach files"
              >
                📎 Attach
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                multiple
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn-browse"
              >
                Browse Files
              </button>
            </div>
            
            <button
              onClick={handleSendReply}
              disabled={(!replyContent.trim() && attachments.length === 0) || uploading}
              className="btn-send-reply"
            >
              Send Reply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageThread;