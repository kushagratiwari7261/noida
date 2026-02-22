import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient'; // Fixed import path

export const useMessageSubscription = (userId, callback) => {
  useEffect(() => {
    if (!userId) return;

    console.log('Setting up message subscription for user:', userId);

    const channel = supabase
      .channel(`messages-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId}`
        },
        (payload) => {
          console.log('New message received:', payload);
          callback(payload);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId}`
        },
        (payload) => {
          console.log('Message updated:', payload);
          callback(payload);
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
      });

    // Cleanup function
    return () => {
      console.log('Cleaning up message subscription');
      supabase.removeChannel(channel);
    };
  }, [userId, callback]);
};

export default useMessageSubscription;