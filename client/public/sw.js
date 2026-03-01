self.addEventListener('push', (event) => {
  let data = { title: 'Bitewise', body: 'You have a notification' };
  try {
    data = event.data.json();
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Bitewise', {
      body: data.body || '',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: data.url || '/',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
