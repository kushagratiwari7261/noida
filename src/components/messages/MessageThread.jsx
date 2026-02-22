import { useState, useRef, useEffect } from 'react';
import { useFileUpload } from '../../hooks/useFileUpload';
import './MessageThread.css';

/* ── Timestamp helper ── */
const fmtTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const fmtDate = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = (now - d) / 86400000;
  if (diff < 1) return 'Today';
  if (diff < 2) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};

/* ── Avatar ── */
const Avatar = ({ user, size = 36 }) => {
  const initials = (user?.full_name || user?.username || 'U').charAt(0).toUpperCase();
  return user?.avatar_url ? (
    <img className="wa-avatar" src={user.avatar_url} alt={initials} style={{ width: size, height: size }} />
  ) : (
    <div className="wa-avatar wa-avatar-fallback" style={{ width: size, height: size }}>
      {initials}
    </div>
  );
};

/* ── File icon by type ── */
const fileIcon = (type = '') => {
  if (type.startsWith('image/')) return '🖼️';
  if (type.startsWith('video/')) return '🎬';
  if (type.includes('pdf')) return '📄';
  if (type.includes('sheet') || type.includes('excel')) return '📊';
  if (type.includes('word') || type.includes('document')) return '📝';
  return '📎';
};

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
const MessageThread = ({ message, conversation, currentUser, onDelete, onBack, onSendReply, isGroup, fetchConversationMessages }) => {
  const [replyContent, setReplyContent] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const fileInputRef = useRef(null);
  const bottomRef = useRef(null);
  const { uploadFile, getFileUrl, getSignedUrl, uploading, progress, uploadError } = useFileUpload();

  /* ── Load group messages ── */
  useEffect(() => {
    if (isGroup && conversation?.id) {
      setLoadingChat(true);
      fetchConversationMessages(conversation.id).then(msgs => {
        setChatMessages(msgs);
        setLoadingChat(false);
      });
    } else if (message) {
      // For DM: build a simple 2-message view (original + any replies)
      // We just show the single message for now; group is the full thread
      setChatMessages([]);
    }
  }, [isGroup, conversation?.id, message?.id]);

  /* ── Auto-scroll to bottom ── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  /* ── File select ── */
  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      try {
        const uploaded = await uploadFile(file, currentUser.id);
        setAttachments(prev => [...prev, uploaded]);
      } catch (err) {
        console.error('Upload error:', err);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /* ── Send ── */
  const handleSend = async () => {
    if (!replyContent.trim() && attachments.length === 0) return;

    const msgData = isGroup
      ? { conversation_id: conversation?.id, content: replyContent, attachments }
      : {
        receiver_id: message?.sender_id === currentUser?.id ? message?.receiver_id : message?.sender_id,
        content: replyContent,
        parent_message_id: message?.id,
        attachments,
      };

    const result = await onSendReply(msgData);
    if (!result?.error) {
      setReplyContent('');
      setAttachments([]);
      // Refresh group chat
      if (isGroup && conversation?.id) {
        const msgs = await fetchConversationMessages(conversation.id);
        setChatMessages(msgs);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ── Download attachment ── */
  const downloadAttachment = async (attachment) => {
    try {
      const filePath = attachment.storage_path || attachment.path;
      // Try public URL first; fall back to signed URL (private bucket)
      let url = getFileUrl(filePath);
      if (!url) url = await getSignedUrl(filePath);
      if (!url) { console.error('Could not get download URL'); return; }
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.file_name || attachment.name || 'download';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  /* ── Header info ── */
  const headerTitle = isGroup
    ? (conversation?.title || 'Group')
    : (message?.sender_id === currentUser?.id
      ? (message?.receiver?.full_name || message?.receiver?.username || 'Unknown')
      : (message?.sender?.full_name || message?.sender?.username || 'Unknown'));

  const headerSub = isGroup
    ? `${conversation?.participants?.length || 0} members`
    : '';

  /* ── Render a single message bubble ── */
  const renderBubble = (msg, idx, arr) => {
    const isMine = msg.sender_id === currentUser?.id;
    const prevMsg = arr[idx - 1];
    const showDateDivider = !prevMsg || fmtDate(prevMsg.created_at) !== fmtDate(msg.created_at);
    const showAvatar = isGroup && !isMine && (idx === arr.length - 1 || arr[idx + 1]?.sender_id !== msg.sender_id);

    return (
      <div key={msg.id || idx}>
        {showDateDivider && (
          <div className="wa-date-divider">
            <span>{fmtDate(msg.created_at)}</span>
          </div>
        )}
        <div className={`wa-bubble-row ${isMine ? 'mine' : 'theirs'}`}>
          {isGroup && !isMine && (
            <div className="wa-bubble-avatar">
              {showAvatar ? <Avatar user={msg.sender} size={32} /> : <div style={{ width: 32 }} />}
            </div>
          )}
          <div className={`wa-bubble ${isMine ? 'wa-bubble-mine' : 'wa-bubble-theirs'}`}>
            {isGroup && !isMine && showAvatar && (
              <div className="wa-bubble-sender">
                {msg.sender?.full_name || msg.sender?.username || 'Unknown'}
              </div>
            )}
            {msg.content && <div className="wa-bubble-text">{msg.content}</div>}

            {/* Attachments inside bubble */}
            {msg.attachments?.length > 0 && (
              <div className="wa-attachments">
                {msg.attachments.map((att, i) => (
                  <button
                    key={i}
                    className="wa-attachment-chip"
                    onClick={() => downloadAttachment(att)}
                  >
                    <span className="wa-att-icon">{fileIcon(att.file_type)}</span>
                    <span className="wa-att-name">{att.file_name || att.name}</span>
                    {att.file_size && (
                      <span className="wa-att-size">{(att.file_size / 1024).toFixed(0)} KB</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="wa-bubble-meta">
              <span className="wa-time">{fmtTime(msg.created_at)}</span>
              {isMine && <span className="wa-tick">{msg.is_read ? '✓✓' : '✓'}</span>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ── For DM: show single message as a bubble ── */
  const dmBubbles = message ? [message] : [];

  return (
    <div className="wa-thread">
      {/* Header */}
      <div className="wa-header">
        <button className="wa-back" onClick={onBack}>←</button>
        <div className="wa-header-avatar">
          {isGroup
            ? <div className="wa-avatar wa-avatar-group">👥</div>
            : <Avatar user={message?.sender_id === currentUser?.id ? message?.receiver : message?.sender} size={40} />}
        </div>
        <div className="wa-header-info">
          <div className="wa-header-name">{headerTitle}</div>
          {headerSub && <div className="wa-header-sub">{headerSub}</div>}
        </div>
        {!isGroup && message && (
          <button className="wa-delete-btn" onClick={() => onDelete(message.id)} title="Delete">🗑️</button>
        )}
      </div>

      {/* Chat area */}
      <div className="wa-chat-area">
        {loadingChat ? (
          <div className="wa-loading"><div className="wa-spinner" /></div>
        ) : isGroup ? (
          chatMessages.length === 0
            ? <div className="wa-empty">No messages yet. Say hello! 👋</div>
            : chatMessages.map((msg, i, arr) => renderBubble(msg, i, arr))
        ) : (
          dmBubbles.map((msg, i, arr) => renderBubble(msg, i, arr))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Upload error */}
      {uploadError && (
        <div className="wa-upload-error">⚠️ Upload failed: {uploadError}</div>
      )}

      {/* Staged attachments */}
      {attachments.length > 0 && (
        <div className="wa-staged-attachments">
          {attachments.map((att, i) => (
            <div key={i} className="wa-staged-chip">
              <span>{fileIcon(att.type)} {att.name}</span>
              <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="wa-upload-bar">
          <div className="wa-upload-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Input bar */}
      <div className="wa-input-bar">
        <button className="wa-attach-btn" onClick={() => fileInputRef.current?.click()} title="Attach file">
          📎
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          multiple
          style={{ display: 'none' }}
        />
        <textarea
          className="wa-input"
          value={replyContent}
          onChange={e => setReplyContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={1}
        />
        <button
          className="wa-send-btn"
          onClick={handleSend}
          disabled={(!replyContent.trim() && attachments.length === 0) || uploading}
        >
          ➤
        </button>
      </div>
    </div>
  );
};

export default MessageThread;