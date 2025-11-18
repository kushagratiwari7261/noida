import { useState, useEffect, useRef } from 'react';
import { useMessages } from '../../hooks/useMessages';
import { useMessageSubscription } from '../../hooks/useMessageSubscription';
import MessageList from './MessageList';
import MessageThread from './MessageThread';
import ComposeMessage from './ComposeMessage';
import GroupComposeMessage from './GroupComposeMessage.jsx';
import MessageSearch from './MessageSearch';
import './Messages.css';

const MessagesMain = ({ user }) => {
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [isComposing, setIsComposing] = useState(false);
  const [isGroupComposing, setIsGroupComposing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all'); // all, unread, sent, received, groups
  const [initialLoading, setInitialLoading] = useState(true);
  
  // Track if component has loaded data before
  const hasLoadedRef = useRef(false);

  const {
    messages,
    conversations,
    loading,
    error,
    unreadCount,
    sendMessage,
    sendGroupMessage,
    createGroup,
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

  // Filter messages and conversations based on selected filter
  const getFilteredMessages = () => {
    if (!messages || messages.length === 0) return [];

    let filtered = [...messages];

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
      case 'groups':
        // Filter group conversations
        filtered = messages.filter(msg => 
          msg.conversation_id && !msg.deleted_at
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
    setSelectedConversation(null);
    setIsComposing(false);
    setIsGroupComposing(false);

    // Mark as read if it's received and unread
    if (message.receiver_id === user?.id && !message.is_read) {
      try {
        await markAsRead(message.id);
      } catch (error) {
        console.error('Error marking message as read:', error);
      }
    }
  };

  const handleConversationSelect = async (conversation) => {
    setSelectedConversation(conversation);
    setSelectedMessage(null);
    setIsComposing(false);
    setIsGroupComposing(false);
  };

  const handleComposeNew = () => {
    setSelectedMessage(null);
    setSelectedConversation(null);
    setIsComposing(true);
    setIsGroupComposing(false);
  };

  const handleGroupComposeNew = () => {
    setSelectedMessage(null);
    setSelectedConversation(null);
    setIsComposing(false);
    setIsGroupComposing(true);
  };

  const handleSendMessage = async (messageData) => {
    try {
      const result = await sendMessage(messageData);
      
      if (!result.error) {
        setIsComposing(false);
        setSelectedMessage(null);
        await refetch();
      }

      return result;
    } catch (error) {
      console.error('Error sending message:', error);
      return { data: null, error: error.message };
    }
  };

  const handleSendGroupMessage = async (messageData) => {
    try {
      const result = await sendGroupMessage(messageData);
      
      if (!result.error) {
        setIsGroupComposing(false);
        setSelectedConversation(null);
        await refetch();
      }

      return result;
    } catch (error) {
      console.error('Error sending group message:', error);
      return { data: null, error: error.message };
    }
  };

  const handleCreateGroup = async (groupData) => {
    try {
      const result = await createGroup(groupData);
      
      if (!result.error) {
        setIsGroupComposing(false);
        await refetch();
      }

      return result;
    } catch (error) {
      console.error('Error creating group:', error);
      return { data: null, error: error.message };
    }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      await deleteMessage(messageId);
      if (selectedMessage?.id === messageId) {
        setSelectedMessage(null);
      }
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
      await refetch();
    }
  };

  const handleBackToList = () => {
    setSelectedMessage(null);
    setSelectedConversation(null);
    setIsComposing(false);
    setIsGroupComposing(false);
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
          <div className="compose-buttons">
            <button 
              onClick={handleComposeNew} 
              className="btn-compose"
              aria-label="Compose new message"
              disabled={loading}
            >
              <span className="icon">✉️</span>
              New Message
            </button>
            <button 
              onClick={handleGroupComposeNew} 
              className="btn-compose-group"
              aria-label="Create group message"
              disabled={loading}
            >
              <span className="icon">👥</span>
              New Group
            </button>
          </div>
        </div>
      </div>

      <div className="messages-content">
        {/* Left sidebar - Message list */}
        <div className={`messages-sidebar ${(selectedMessage || selectedConversation || isComposing || isGroupComposing) ? 'mobile-hidden' : ''}`}>
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
            <button
              className={`filter-btn ${filter === 'groups' ? 'active' : ''}`}
              onClick={() => setFilter('groups')}
              disabled={loading}
            >
              Groups
            </button>
          </div>

          <MessageList
            messages={filteredMessages}
            conversations={conversations}
            selectedMessage={selectedMessage}
            selectedConversation={selectedConversation}
            onSelectMessage={handleMessageSelect}
            onSelectConversation={handleConversationSelect}
            currentUserId={user?.id}
            loading={loading && !hasLoadedRef.current}
            searchQuery={searchQuery}
            filter={filter}
          />
        </div>

        {/* Right panel - Message thread, group thread, or compose */}
        <div className={`messages-main ${!(selectedMessage || selectedConversation || isComposing || isGroupComposing) ? 'mobile-hidden' : ''}`}>
          {isComposing ? (
            <ComposeMessage
              currentUser={user}
              onSend={handleSendMessage}
              onCancel={handleBackToList}
            />
          ) : isGroupComposing ? (
            <GroupComposeMessage
              currentUser={user}
              onSend={handleSendGroupMessage}
              onCreateGroup={handleCreateGroup}
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
          ) : selectedConversation ? (
            <MessageThread
              conversation={selectedConversation}
              currentUser={user}
              onDelete={handleDeleteMessage}
              onBack={handleBackToList}
              onSendReply={handleSendGroupMessage}
              isGroup={true}
            />
          ) : (
            <div className="no-message-selected">
              <div className="empty-state">
                <span className="icon">📬</span>
                <h3>No message selected</h3>
                <p>Select a message from the list or start a new conversation</p>
                <div className="empty-state-actions">
                  <button 
                    onClick={handleComposeNew} 
                    className="btn-primary"
                    disabled={loading}
                  >
                    New Message
                  </button>
                  <button 
                    onClick={handleGroupComposeNew} 
                    className="btn-secondary"
                    disabled={loading}
                  >
                    Create Group
                  </button>
                </div>
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