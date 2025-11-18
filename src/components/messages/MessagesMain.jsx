import { useState, useEffect, useRef } from 'react';
import { useMessages } from '../../hooks/useMessages';
import { useMessageSubscription } from '../../hooks/useMessageSubscription';
import MessageList from './MessageList';
import MessageThread from './MessageThread';
import ComposeMessage from './ComposeMessage';
import MessageSearch from './MessageSearch';
import './Messages.css';

const MessagesMain = ({ user }) => {
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [isComposing, setIsComposing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all'); // all, unread, sent, received
  const [initialLoading, setInitialLoading] = useState(true);
  
  // Track if component has loaded data before
  const hasLoadedRef = useRef(false);

  const {
    messages,
    loading,
    error,
    unreadCount,
    sendMessage,
    markAsRead,
    deleteMessage,
    searchMessages,
    refetch
  } = useMessages(user?.id);

  // Track initial loading state - only show spinner on first load
  useEffect(() => {
    if ((messages.length > 0 || (!loading && messages.length === 0)) && !hasLoadedRef.current) {
      setInitialLoading(false);
      hasLoadedRef.current = true;
    }
  }, [messages, loading]);

  // Real-time subscription for new messages
  useMessageSubscription(user?.id, (payload) => {
    console.log('New message received:', payload);
    refetch(); // Refresh messages when new message arrives
  });

  // Filter messages based on selected filter
  const getFilteredMessages = () => {
    if (!messages || messages.length === 0) return [];

    let filtered = [...messages]; // Create a copy to avoid mutating original

    switch (filter) {
      case 'unread':
        filtered = messages.filter(msg => 
          !msg.is_read && msg.receiver_id === user?.id && !msg.deleted_at
        );
        break;
      case 'sent':
        filtered = messages.filter(msg => 
          msg.sender_id === user?.id && !msg.deleted_at
        );
        break;
      case 'received':
        filtered = messages.filter(msg => 
          msg.receiver_id === user?.id && !msg.deleted_at
        );
        break;
      case 'all':
      default:
        filtered = messages.filter(msg => !msg.deleted_at);
        break;
    }

    return filtered;
  };

  const handleMessageSelect = async (message) => {
    // Don't select deleted messages
    if (message.deleted_at) return;

    setSelectedMessage(message);
    setIsComposing(false);

    // Mark as read if it's received and unread
    if (message.receiver_id === user?.id && !message.is_read) {
      try {
        await markAsRead(message.id);
      } catch (error) {
        console.error('Error marking message as read:', error);
      }
    }
  };

  const handleComposeNew = () => {
    setSelectedMessage(null);
    setIsComposing(true);
  };

  const handleSendMessage = async (messageData) => {
    try {
      const result = await sendMessage(messageData);
      
      if (!result.error) {
        setIsComposing(false);
        setSelectedMessage(null);
        // Refetch to get the latest messages with proper relationships
        await refetch();
      }

      return result;
    } catch (error) {
      console.error('Error sending message:', error);
      return { data: null, error: error.message };
    }
  };
const handleDeleteMessage = async (messageId) => {
  try {
    await deleteMessage(messageId);
    if (selectedMessage?.id === messageId) {
      setSelectedMessage(null);
    }
    // NO refetch() here - deleteMessage handles everything
  } catch (error) {
    console.error('Error deleting message:', error);
  }
};
  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (query.trim()) {
      try {
        await searchMessages(query);
      } catch (error) {
        console.error('Error searching messages:', error);
      }
    } else {
      // If search is cleared, refetch all messages
      await refetch();
    }
  };

  const handleBackToList = () => {
    setSelectedMessage(null);
    setIsComposing(false);
  };

  const handleRetry = async () => {
    try {
      await refetch();
    } catch (error) {
      console.error('Error retrying:', error);
    }
  };

  // Show initial loading state ONLY on first load
  if (initialLoading && loading && !hasLoadedRef.current) {
    return (
      <div className="messages-container">
        <div className="messages-loading">
          <div className="spinner"></div>
          <p>Loading messages...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error && messages.length === 0 && !hasLoadedRef.current) {
    return (
      <div className="messages-container">
        <div className="messages-error">
          <p>Error loading messages: {error}</p>
          <button onClick={handleRetry} className="btn-retry">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const filteredMessages = getFilteredMessages();

  return (
    <div className="messages-container">
      <div className="messages-header">
        <h1>Messages</h1>
        <div className="messages-header-actions">
          <button 
            onClick={handleComposeNew} 
            className="btn-compose"
            aria-label="Compose new message"
            disabled={loading}
          >
            <span className="icon">✉️</span>
            Compose
          </button>
        </div>
      </div>

      <div className="messages-content">
        {/* Left sidebar - Message list */}
        <div className={`messages-sidebar ${(selectedMessage || isComposing) ? 'mobile-hidden' : ''}`}>
          <MessageSearch 
            onSearch={handleSearch}
            searchQuery={searchQuery}
            disabled={loading}
          />

          <div className="message-filters">
            <button
              className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
              disabled={loading}
            >
              All
            </button>
            <button
              className={`filter-btn ${filter === 'unread' ? 'active' : ''}`}
              onClick={() => setFilter('unread')}
              disabled={loading}
            >
              Unread
              {unreadCount > 0 && (
                <span className="badge">{unreadCount}</span>
              )}
            </button>
            <button
              className={`filter-btn ${filter === 'received' ? 'active' : ''}`}
              onClick={() => setFilter('received')}
              disabled={loading}
            >
              Received
            </button>
            <button
              className={`filter-btn ${filter === 'sent' ? 'active' : ''}`}
              onClick={() => setFilter('sent')}
              disabled={loading}
            >
              Sent
            </button>
          </div>

          <MessageList
            messages={filteredMessages}
            selectedMessage={selectedMessage}
            onSelectMessage={handleMessageSelect}
            currentUserId={user?.id}
            loading={loading && !hasLoadedRef.current}
            searchQuery={searchQuery}
          />
        </div>

        {/* Right panel - Message thread or compose */}
        <div className={`messages-main ${!(selectedMessage || isComposing) ? 'mobile-hidden' : ''}`}>
          {isComposing ? (
            <ComposeMessage
              currentUser={user}
              onSend={handleSendMessage}
              onCancel={handleBackToList}
            />
          ) : selectedMessage ? (
            <MessageThread
              message={selectedMessage}
              currentUser={user}
              onDelete={handleDeleteMessage}
              onBack={handleBackToList}
              onSendReply={handleSendMessage}
            />
          ) : (
            <div className="no-message-selected">
              <div className="empty-state">
                <span className="icon">📬</span>
                <h3>No message selected</h3>
                <p>Select a message from the list or compose a new one</p>
                <button 
                  onClick={handleComposeNew} 
                  className="btn-primary"
                  disabled={loading}
                >
                  Compose Message
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Global loading overlay for operations - only after initial load */}
      {loading && hasLoadedRef.current && (
        <div className="global-loading-overlay">
          <div className="loading-spinner"></div>
        </div>
      )}
    </div>
  );
};

export default MessagesMain;