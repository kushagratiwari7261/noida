import { useState, useRef } from 'react';
import { useFileUpload } from '../../hooks/useFileUpload';
import UserSearch from './UserSearch';
import './ComposeMessage.css';

const ComposeMessage = ({ currentUser, onSend, onCancel }) => {
  const [recipient, setRecipient] = useState(null);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef(null);
  
  const { uploadFile, uploading, progress } = useFileUpload();

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
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!recipient || (!content.trim() && attachments.length === 0)) return;

    setSending(true);
    
    const messageData = {
      receiver_id: recipient.id,
      subject: subject.trim(),
      content: content.trim(),
      attachments: attachments
    };

    const result = await onSend(messageData);
    
    if (!result.error) {
      // Reset form
      setRecipient(null);
      setSubject('');
      setContent('');
      setAttachments([]);
    }
    
    setSending(false);
  };

  const isFormValid = recipient && (content.trim() || attachments.length > 0);

  return (
    <div className="compose-message">
      <div className="compose-header">
        <h2>Compose Message</h2>
        <div className="compose-actions">
          <button onClick={onCancel} className="btn-cancel">
            Cancel
          </button>
          <button 
            onClick={handleSend}
            disabled={!isFormValid || sending || uploading}
            className="btn-send"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>

      <div className="compose-form">
        <div className="form-group">
          <label htmlFor="recipient">To:</label>
          <UserSearch
            onUserSelect={setRecipient}
            selectedUser={recipient}
            currentUserId={currentUser?.id}
          />
        </div>

        <div className="form-group">
          <label htmlFor="subject">Subject:</label>
          <input
            id="subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Optional subject..."
          />
        </div>

        <div className="form-group">
          <label htmlFor="content">Message:</label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type your message..."
            rows="8"
          />
        </div>

        {attachments.length > 0 && (
          <div className="form-group">
            <label>Attachments:</label>
            <div className="attachments-list">
              {attachments.map((attachment, index) => (
                <div key={index} className="attachment-item">
                  <span className="attachment-name">{attachment.name}</span>
                  <button 
                    onClick={() => removeAttachment(index)}
                    className="remove-attachment"
                    aria-label="Remove attachment"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {uploading && (
          <div className="upload-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <span>Uploading... {Math.round(progress)}%</span>
          </div>
        )}

        <div className="compose-footer">
          <div className="attachment-actions">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn-attach"
              disabled={uploading}
            >
              📎 Attach Files
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComposeMessage;