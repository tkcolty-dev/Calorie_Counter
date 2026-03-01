import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export function markMessagesRead() {
  api.post('/sharing/mark-messages-read').catch(() => {});
}

export function useNewMessages() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const prevCount = useRef(0);
  const [toastMessage, setToastMessage] = useState(null);

  const { data } = useQuery({
    queryKey: ['new-messages'],
    queryFn: () => api.get('/sharing/new-messages').then(r => r.data),
    enabled: !!user,
    refetchInterval: 5000,
    staleTime: 2000,
  });

  const count = data?.count || 0;
  const latestMsg = data?.messages?.[0] || null;

  // When a new message arrives, show toast
  useEffect(() => {
    if (count > prevCount.current && prevCount.current >= 0 && latestMsg) {
      setToastMessage(latestMsg);
    }
    prevCount.current = count;
  }, [count, latestMsg]);

  const clearCount = useCallback(() => {
    markMessagesRead();
    queryClient.invalidateQueries({ queryKey: ['new-messages'] });
  }, [queryClient]);

  return { newMessageCount: count, latestMessage: toastMessage, clearCount };
}
