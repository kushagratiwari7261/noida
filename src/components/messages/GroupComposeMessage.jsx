import { useState, useRef } from 'react';
import { useFileUpload } from '../../hooks/useFileUpload';
import UserSearch from './UserSearch';
import './GroupComposeMessage.css';

const GroupComposeMessage = ({ currentUser, onSend, onCreateGroup, onCancel }) => {
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
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

  const handleAddUser = (user) => {
    if (!selectedUsers.find(u => u.id === user.id)) {
      setSelectedUsers(prev => [...prev, user]);
    }
  };

  const handleRemoveUser = (userId) => {
    setSelectedUsers(prev => prev.filter(user => user.id !== userId));
  };

  const handleCreateAndSend = async () => {
    if (!groupName.trim() || selectedUsers.length === 0 || (!content.trim() && attachments.length === 0)) return;

    setIsCreatingGroup(true);
    setSending(true);
    
    const groupData = {
      title: groupName.trim(),
      participant_ids: selectedUsers.map(user => user.id),
      created_by: currentUser.id
    };

    const messageData = {
      conversation_id: null, // Will be set after group creation
      subject: subject.trim(),
      content: content.trim(),
      attachments: attachments
    };

    try {
      // First create the group
      const groupResult = await onCreateGroup(groupData);
      
      if (!groupResult.error && groupResult.data) {
        // Then send the initial message to the group
        messageData.conversation_id = groupResult.data.id;
        const messageResult = await onSend(messageData);
        
        if (!messageResult.error) {
          // Reset form
          setGroupName('');
          setSelectedUsers([]);
          setSubject('');
          setContent('');
          setAttachments([]);
        }
      }
    } catch (error) {
      console.error('Error creating group:', error);
    } finally {
      setIsCreatingGroup(false);
      setSending(false);
    }
  };

  const handleSendToExistingGroup = async () => {
    if (!content.trim() && attachments.length === 0) return;

    setSending(true);
    
    const messageData = {
      conversation_id: selectedConversation?.id,
      subject: subject.trim(),
      content: content.trim(),
      attachments: attachments
    };

    const result = await onSend(messageData);
    
    if (!result.error) {
      setSubject('');
      setContent('');
      setAttachments([]);
    }
    
    setSending(false);
  };

  const isFormValid = selectedUsers.length > 0 && (content.trim() || attachments.length > 0) && groupName.trim();

  return (
    <div className="group-compose-message">
      <div className="compose-header">
        <h2>Create Group Message</h2>
        <div className="compose-actions">
          <button onClick={onCancel} className="btn-cancel">
            Cancel
          </button>
          <button 
            onClick={handleCreateAndSend}
            disabled={!isFormValid || sending || uploading || isCreatingGroup}
            className="btn-send"
          >
            {sending || isCreatingGroup ? 'Creating...' : 'Create Group & Send'}
          </button>
        </div>
      </div>

      <div className="compose-form">
        <div className="form-group">
          <label htmlFor="groupName">Group Name:</label>
          <input
            id="groupName"
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Enter group name..."
            className="group-name-input"
          />
        </div>

        <div className="form-group">
          <label>Add Participants:</label>
          <UserSearch
            onUserSelect={handleAddUser}
            selectedUser={null}
            currentUserId={currentUser?.id}
            placeholder="Search users to add to group..."
          />
          
          {selectedUsers.length > 0 && (
            <div className="selected-users">
              <h4>Group Members ({selectedUsers.length + 1})</h4>
              <div className="users-list">
                {/* Include current user */}
                <div className="user-chip current-user">
                  <span className="user-name">You</span>
                </div>
                
                {/* Selected users */}
                {selectedUsers.map(user => (
                  <div key={user.id} className="user-chip">
                    <span className="user-name">{user.full_name || user.username}</span>
                    <button 
                      onClick={() => handleRemoveUser(user.id)}
                      className="remove-user"
                      aria-label={`Remove ${user.full_name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="subject">Subject (Optional):</label>
          <input
            id="subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Group message subject..."
          />
        </div>

        <div className="form-group">
          <label htmlFor="content">Message:</label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type your group message..."
            rows="6"
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

export default GroupComposeMessage;