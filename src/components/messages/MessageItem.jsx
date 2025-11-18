import { useState } from 'react';
import './MessageItem.css';

const MessageItem = ({ message, isSelected, onSelect, currentUserId }) => {
  const [imageError, setImageError] = useState(false);

  const isSender = message.sender_id === currentUserId;
  const otherUser = isSender ? message.receiver : message.sender;
  const isUnread = !message.is_read && message.receiver_id === currentUserId;

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 168) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const handleClick = () => {
    onSelect(message);
  };

  const getPreviewText = (content) => {
    if (!content) return 'No content';
    if (content.length > 100) {
      return content.substring(0, 100) + '...';
    }
    return content;
  };

  const getDisplayName = (user) => {
    if (!user) return 'Unknown User';
    return user.full_name || user.username || 'Unknown User';
  };

  const getInitials = (user) => {
    if (!user) return 'U';
    const name = user.full_name || user.username || 'U';
    return name.charAt(0).toUpperCase();
  };

  return (
    <div 
      className={`message-item ${isSelected ? 'selected' : ''} ${isUnread ? 'unread' : ''}`}
      onClick={handleClick}
    >
      <div className="message-avatar">
        {otherUser?.avatar_url && !imageError ? (
          <img 
            src={otherUser.avatar_url} 
            alt={getDisplayName(otherUser)}
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="avatar-fallback">
            {getInitials(otherUser)}
          </div>
        )}
      </div>

      <div className="message-content">
        <div className="message-header">
          <span className="message-sender">
            {isSender ? 'You' : getDisplayName(otherUser)}
          </span>
          <span className="message-time">
            {formatTime(message.created_at)}
          </span>
        </div>

        {message.subject && (
          <div className="message-subject">
            {message.subject}
          </div>
        )}

        <div className="message-preview">
          {getPreviewText(message.content)}
        </div>

        {message.attachments && message.attachments.length > 0 && (
          <div className="message-attachment-indicator">
            <span className="attachment-icon">📎</span>
            {message.attachments.length} attachment{message.attachments.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {isUnread && (
        <div className="unread-indicator"></div>
      )}
    </div>
  );
};

export default MessageItem;