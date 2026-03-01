import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export function markSharesSeen() {
  api.post('/sharing/mark-shares-seen').catch(() => {});
}

export function useNewShares() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: sharingData } = useQuery({
    queryKey: ['sharing'],
    queryFn: () => api.get('/sharing').then(r => r.data),
    enabled: !!user,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const { data: seenData } = useQuery({
    queryKey: ['shares-seen'],
    queryFn: () => api.get('/sharing/shares-seen').then(r => r.data),
    enabled: !!user,
    staleTime: 10000,
  });

  const sharedWithMe = sharingData?.sharedWithMe || [];
  const pendingCount = sharedWithMe.filter(s => s.status === 'pending').length;
  const seenAt = seenData?.seenAt ? new Date(seenData.seenAt) : null;
  const unseenCount = seenAt
    ? sharedWithMe.filter(s => new Date(s.created_at) > seenAt).length
    : 0;
  const newCount = Math.max(pendingCount, unseenCount);

  return { newCount, sharedWithMe };
}
