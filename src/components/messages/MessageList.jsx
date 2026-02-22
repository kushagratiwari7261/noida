import { useState } from 'react';
import MessageItem from './MessageItem';
import './MessageList.css';

/* ── Format time for conversation preview ── */
const fmtTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = (now - d) / 86400000;
  if (diff < 1) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};

/* ── Group conversation item ── */
const GroupItem = ({ conversation, isSelected, onSelect, currentUserId }) => {
  const lastMsg = conversation.last_message;
  const memberCount = conversation.participants?.length || 0;
  const preview = lastMsg?.content || 'No messages yet';

  return (
    <div
      className={`message-item group-item ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(conversation)}
    >
      <div className="message-avatar">
        <div className="avatar-fallback group-avatar">👥</div>
      </div>
      <div className="message-content">
        <div className="message-header">
          <span className="message-sender">{conversation.title || 'Group'}</span>
          {lastMsg && <span className="message-time">{fmtTime(lastMsg.created_at)}</span>}
        </div>
        <div className="message-preview group-preview">
          {preview.length > 80 ? preview.substring(0, 80) + '…' : preview}
        </div>
        <div className="group-member-count">{memberCount} members</div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════ */
const MessageList = ({
  messages,
  conversations,
  selectedMessage,
  selectedConversation,
  onSelectMessage,
  onSelectConversation,
  currentUserId,
  loading,
  searchQuery,
  filter,
}) => {
  const showGroups = filter === 'all' || filter === 'groups';
  const showDMs = filter !== 'groups';

  const groupConversations = (conversations || []).filter(c => c.is_group);
  const dmMessages = (messages || []).filter(msg => !msg.conversation_id);

  if (loading && messages.length === 0 && groupConversations.length === 0) {
    return (
      <div className="message-list">
        <div className="message-list-loading">
          <div className="spinner" />
          <p>Loading messages…</p>
        </div>
      </div>
    );
  }

  const hasContent = (showGroups && groupConversations.length > 0) || (showDMs && dmMessages.length > 0);

  if (!hasContent) {
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
      {/* Group conversations section */}
      {showGroups && groupConversations.length > 0 && (
        <>
          {filter === 'all' && (
            <div className="list-section-label">Groups</div>
          )}
          {groupConversations.map(conv => (
            <GroupItem
              key={conv.id}
              conversation={conv}
              isSelected={selectedConversation?.id === conv.id}
              onSelect={onSelectConversation}
              currentUserId={currentUserId}
            />
          ))}
          {showDMs && dmMessages.length > 0 && (
            <div className="list-section-label">Direct Messages</div>
          )}
        </>
      )}

      {/* DM messages */}
      {showDMs && dmMessages.map(msg => (
        <MessageItem
          key={msg.id}
          message={msg}
          isSelected={selectedMessage?.id === msg.id}
          onSelect={onSelectMessage}
          currentUserId={currentUserId}
        />
      ))}
    </div>
  );
};

export default MessageList;