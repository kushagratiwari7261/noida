import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export const useMessages = (userId) => {
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Debug function to check database state
  const debugDatabase = async () => {
    try {
      console.log('=== DATABASE DEBUG INFO ===');
      
      // Check messages table
      const { data: allMessages, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .limit(10);

      console.log('All messages in database:', allMessages);
      console.log('Messages error:', messagesError);

      // Check profiles table
      const { data: allProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, username, full_name')
        .limit(10);

      console.log('All profiles in database:', allProfiles);
      console.log('Profiles error:', profilesError);

      // Check conversations table
      const { data: allConversations, error: convError } = await supabase
        .from('conversations')
        .select('*')
        .limit(10);

      console.log('All conversations in database:', allConversations);
      console.log('Conversations error:', convError);

      // Check current user profile
      if (userId) {
        const { data: currentProfile, error: userError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        console.log('Current user profile:', currentProfile);
        console.log('Current user error:', userError);
      }

      console.log('=== END DEBUG INFO ===');
    } catch (debugError) {
      console.error('Debug error:', debugError);
    }
  };

  // Fetch conversations for the user
// Fetch conversations for the user - FIXED VERSION
const fetchConversations = async () => {
  try {
    if (!userId) return [];

    // Get conversations where user is a participant
    const { data: participantData, error: participantError } = await supabase
      .from('conversation_participants')
      .select(`
        conversation_id,
        conversations (
          id,
          title,
          created_by,
          is_group,
          created_at,
          updated_at
        )
      `)
      .eq('user_id', userId);

    if (participantError) throw participantError;

    const conversationsWithDetails = await Promise.all(
      (participantData || []).map(async (participant) => {
        const conversation = participant.conversations;
        
        // FIXED: Get participants without embedded profiles
        const { data: participants, error: partError } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', conversation.id);

        if (partError) console.error('Error fetching participants:', partError);

        // FIXED: Fetch profile details separately
        const participantsWithProfiles = await Promise.all(
          (participants || []).map(async (part) => {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, username, full_name, avatar_url')
              .eq('id', part.user_id)
              .single();
            
            return {
              user_id: part.user_id,
              profile: profile || { id: part.user_id, username: 'unknown', full_name: 'Unknown User' }
            };
          })
        );

        // Get last message in conversation
        const { data: lastMessage, error: msgError } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (mesgError && msgError.code !== 'PGRST116'){
          console.error('Error fetching last message:', msgError);
        }

        return {
          ...conversation,
          participants: participantsWithProfiles,
          last_message: lastMessage,
          unread_count: 0
        };
      })
    );

    setConversations(conversationsWithDetails);
    return conversationsWithDetails;
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return [];
  }
};
  // Simple fetch without complex joins - optimized version
  const fetchMessages = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Fetching messages for user:', userId);

      // Run debug first to see database state
      await debugDatabase();

      // Fetch conversations
      await fetchConversations();

      // FIXED: Filter out deleted messages (deleted_at IS NULL)
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .is('deleted_at', null) // Only get non-deleted messages
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching messages:', error);
        throw error;
      }

      console.log('Raw messages data:', data);

      // If no messages, create a welcome message
      if (!data || data.length === 0) {
        console.log('No messages found. Creating welcome message...');
        
        // Create a welcome message
        const welcomeMessage = {
          id: 'welcome-' + Date.now(),
          sender_id: 'system',
          receiver_id: userId,
          subject: 'Welcome to Messages',
          content: 'This is your messages dashboard. Start conversations with your team members by clicking the "Compose" button above.',
          is_read: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          sender: {
            username: 'system',
            full_name: 'System',
            avatar_url: null
          },
          receiver: {
            username: 'user',
            full_name: 'You',
            avatar_url: null
          },
          attachments: [],
          is_welcome_message: true // Flag to identify welcome message
        };

        setMessages([welcomeMessage]);
        setUnreadCount(1);
        return;
      }

      // For real messages, fetch user profiles
      const messagesWithProfiles = await Promise.all(
        data.map(async (message) => {
          try {
            let sender = { username: 'Unknown', full_name: 'Unknown User', avatar_url: null };
            let receiver = { username: 'Unknown', full_name: 'Unknown User', avatar_url: null };

            // Only fetch profiles for non-system users
            if (message.sender_id !== 'system') {
              const { data: senderData } = await supabase
                .from('profiles')
                .select('username, full_name, avatar_url')
                .eq('id', message.sender_id)
                .single();
              
              if (senderData) sender = senderData;
            } else {
              sender = { username: 'system', full_name: 'System', avatar_url: null };
            }

            if (message.receiver_id !== 'system') {
              const { data: receiverData } = await supabase
                .from('profiles')
                .select('username, full_name, avatar_url')
                .eq('id', message.receiver_id)
                .single();
              
              if (receiverData) receiver = receiverData;
            } else {
              receiver = { username: 'system', full_name: 'System', avatar_url: null };
            }

            // Fetch attachments
            const { data: attachments } = await supabase
              .from('message_attachments')
              .select('*')
              .eq('message_id', message.id);

            return {
              ...message,
              sender,
              receiver,
              attachments: attachments || []
            };
          } catch (err) {
            console.warn('Error enriching message:', err);
            return {
              ...message,
              sender: { username: 'Unknown', full_name: 'Unknown Sender', avatar_url: null },
              receiver: { username: 'Unknown', full_name: 'Unknown Receiver', avatar_url: null },
              attachments: []
            };
          }
        })
      );

      setMessages(messagesWithProfiles);
      
      // Calculate unread count (excluding deleted and welcome messages)
      const unread = messagesWithProfiles.filter(msg => 
        msg.receiver_id === userId && 
        !msg.is_read && 
        !msg.is_welcome_message &&
        !msg.deleted_at
      ).length;
      setUnreadCount(unread);
      
      console.log('Final messages with profiles:', messagesWithProfiles);
      
    } catch (err) {
      console.error('Error in fetchMessages:', err);
      setError(err.message);
      
      // Even on error, show welcome message
      const welcomeMessage = {
        id: 'error-' + Date.now(),
        sender_id: 'system',
        receiver_id: userId,
        subject: 'Welcome to Messages',
        content: 'This is your messages dashboard. You can start conversations with your team members here.',
        is_read: false,
        created_at: new Date().toISOString(),
        deleted_at: null,
        sender: { username: 'system', full_name: 'System', avatar_url: null },
        receiver: { username: 'user', full_name: 'You', avatar_url: null },
        attachments: [],
        is_welcome_message: true
      };
      
      setMessages([welcomeMessage]);
      setUnreadCount(1);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (messageData) => {
    try {
      console.log('Sending message:', messageData);

      // Don't send if it's a demo/welcome message
      if (messageData.is_welcome_message) {
        console.log('Skipping welcome message send');
        return { data: null, error: 'Cannot send welcome messages' };
      }

      const { data, error } = await supabase
        .from('messages')
        .insert([{
          sender_id: userId,
          receiver_id: messageData.receiver_id,
          subject: messageData.subject,
          content: messageData.content,
          parent_message_id: messageData.parent_message_id,
          deleted_at: null // Explicitly set as not deleted
        }])
        .select()
        .single();

      if (error) {
        console.error('Error sending message:', error);
        throw error;
      }

      console.log('Message sent successfully:', data);

      // Handle attachments if any
      if (messageData.attachments && messageData.attachments.length > 0) {
        console.log('Processing attachments:', messageData.attachments);
        
        for (const attachment of messageData.attachments) {
          const { error: attachmentError } = await supabase
            .from('message_attachments')
            .insert({
              message_id: data.id,
              file_name: attachment.name,
              file_size: attachment.size,
              file_type: attachment.type,
              storage_path: attachment.path,
              uploaded_by: userId
            });

          if (attachmentError) {
            console.error('Error saving attachment:', attachmentError);
          }
        }
        console.log('All attachments processed');
      }

      // Refresh messages after sending
      await fetchMessages();

      return { data, error: null };
    } catch (err) {
      console.error('Error in sendMessage:', err);
      return { data: null, error: err.message };
    }
  };

// Send group message - FIXED VERSION
const sendGroupMessage = async (messageData) => {
  try {
    console.log('Sending group message:', messageData);

    const { data, error } = await supabase
      .from('messages')
      .insert([{
        sender_id: userId,
        conversation_id: messageData.conversation_id,
        subject: messageData.subject || '',
        content: messageData.content,
        parent_message_id: messageData.parent_message_id,
        is_group_message: true,
        // Don't set receiver_id for group messages
        deleted_at: null
      }])
      .select()
      .single();

    if (error) {
      console.error('Error sending group message:', error);
      throw error;
    }

    console.log('Group message sent successfully:', data);

    // Handle attachments if any
    if (messageData.attachments && messageData.attachments.length > 0) {
      console.log('Processing attachments for group message:', messageData.attachments);
      
      for (const attachment of messageData.attachments) {
        const { error: attachmentError } = await supabase
          .from('message_attachments')
          .insert({
            message_id: data.id,
            file_name: attachment.name,
            file_size: attachment.size,
            file_type: attachment.type,
            storage_path: attachment.path,
            uploaded_by: userId
          });

        if (attachmentError) {
          console.error('Error saving group attachment:', attachmentError);
        }
      }
      console.log('All group attachments processed');
    }

    // Refresh messages after sending
    await fetchMessages();

    return { data, error: null };
  } catch (err) {
    console.error('Error in sendGroupMessage:', err);
    return { data: null, error: err.message };
  }
};
  // Create new group conversation
  const createGroup = async (groupData) => {
    try {
      console.log('Creating new group:', groupData);

      // Create conversation
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .insert([{
          title: groupData.title,
          created_by: groupData.created_by,
          is_group: true
        }])
        .select()
        .single();

      if (convError) {
        console.error('Error creating conversation:', convError);
        throw convError;
      }

      console.log('Conversation created:', conversation);

      // Add participants (including creator)
      const participants = [
        ...groupData.participant_ids.map(pid => ({
          conversation_id: conversation.id,
          user_id: pid
        })),
        {
          conversation_id: conversation.id,
          user_id: groupData.created_by
        }
      ];

      const { error: partError } = await supabase
        .from('conversation_participants')
        .insert(participants);

      if (partError) {
        console.error('Error adding participants:', partError);
        throw partError;
      }

      console.log('Group created successfully with participants:', participants);

      // Refresh conversations
      await fetchConversations();

      return { data: conversation, error: null };
    } catch (err) {
      console.error('Error in createGroup:', err);
      return { data: null, error: err.message };
    }
  };

  const markAsRead = async (messageId) => {
    try {
      console.log('Marking message as read:', messageId);

      // Don't mark welcome messages as read in database
      const message = messages.find(msg => msg.id === messageId);
      if (message && message.is_welcome_message) {
        console.log('Skipping welcome message mark as read');
        // Still update UI state
        setMessages(prev => prev.map(msg => 
          msg.id === messageId ? { ...msg, is_read: true } : msg
        ));
        setUnreadCount(prev => Math.max(0, prev - 1));
        return;
      }

      const { error } = await supabase
        .from('messages')
        .update({ 
          is_read: true,
          read_at: new Date().toISOString()
        })
        .eq('id', messageId)
        .eq('receiver_id', userId)
        .is('deleted_at', null); // Only update non-deleted messages

      if (error) {
        console.error('Error marking message as read:', error);
        throw error;
      }

      // Update local state
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, is_read: true, read_at: new Date().toISOString() } : msg
      ));

      // Update unread count
      setUnreadCount(prev => Math.max(0, prev - 1));
      
      console.log('Message marked as read successfully');
      
    } catch (err) {
      console.error('Error in markAsRead:', err);
    }
  };

  const deleteMessage = async (messageId) => {
    try {
      console.log('🗑️ DIRECT DATABASE DELETE:', messageId);

      // Don't delete welcome messages from database
      const message = messages.find(msg => msg.id === messageId);
      if (message && message.is_welcome_message) {
        console.log('Removing welcome message from UI only');
        setMessages(prev => prev.filter(msg => msg.id !== messageId));
        return;
      }

      // DIRECT HARD DELETE - permanently remove from database
      const { data, error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId)
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .select();

      console.log('📊 Direct delete result:', { data, error });

      if (error) {
        console.error('❌ Database delete error:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.error('❌ No rows deleted from database');
        throw new Error('Delete operation did not affect any rows');
      }

      console.log('✅ Message PERMANENTLY deleted from database. Deleted rows:', data);

      // Update local state
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      
    } catch (err) {
      console.error('❌ Error in deleteMessage:', err);
    }
  };

  const searchMessages = async (query) => {
    try {
      setLoading(true);
      console.log('Searching messages for:', query);

      // FIXED: Filter out deleted messages in search too
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .is('deleted_at', null) // Only search non-deleted messages
        .or(`content.ilike.%${query}%,subject.ilike.%${query}%`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error searching messages:', error);
        throw error;
      }

      console.log('Search results:', data);

      if (!data || data.length === 0) {
        setMessages([]);
        return;
      }

      // Enrich search results with user profiles
      const enrichedMessages = await Promise.all(
        data.map(async (message) => {
          const { data: sender } = await supabase
            .from('profiles')
            .select('username, full_name, avatar_url')
            .eq('id', message.sender_id)
            .single();

          const { data: receiver } = await supabase
            .from('profiles')
            .select('username, full_name, avatar_url')
            .eq('id', message.receiver_id)
            .single();

          const { data: attachments } = await supabase
            .from('message_attachments')
            .select('*')
            .eq('message_id', message.id);

          return {
            ...message,
            sender: sender || { username: 'Unknown', full_name: 'Unknown Sender', avatar_url: null },
            receiver: receiver || { username: 'Unknown', full_name: 'Unknown Receiver', avatar_url: null },
            attachments: attachments || []
          };
        })
      );

      setMessages(enrichedMessages);
      
    } catch (err) {
      console.error('Error in searchMessages:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchMessages();
    } else {
      setMessages([]);
      setConversations([]);
      setLoading(false);
    }
  }, [userId]);

  return {
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
    refetch: fetchMessages
  };
};