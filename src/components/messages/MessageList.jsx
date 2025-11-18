import { useState } from 'react';
import MessageItem from './MessageItem';
import './MessageList.css';

const MessageList = ({ messages, selectedMessage, onSelectMessage, currentUserId, loading }) => {
  const [selectedItems, setSelectedItems] = useState(new Set());

  const handleSelectMessage = (message) => {
    onSelectMessage(message);
  };

  const toggleSelectItem = (messageId) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  if (loading && messages.length === 0) {
    return (
      <div className="message-list">
        <div className="message-list-loading">
          <div className="spinner"></div>
          <p>Loading messages...</p>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="message-list">
        <div className="empty-messages">
          <span className="icon">📭</span>
          <h3>No messages found</h3>
          <p>Your messages will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="message-list">
      <div className="message-list-header">
        <span>{messages.length} message{messages.length !== 1 ? 's' : ''}</span>
      </div>
      
      <div className="message-items">
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            isSelected={selectedMessage?.id === message.id}
            onSelect={handleSelectMessage}
            currentUserId={currentUserId}
          />
        ))}
      </div>
    </div>
  );
};

export default MessageList;