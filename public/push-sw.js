// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Wattómetro (public/push-sw.js). Imported by the service worker that
// vite-plugin-pwa generates (vite.config.ts, workbox.importScripts).
//
// The daily alert (src/worker/alerts.ts) carries a list of items, each with its own title and
// text. One is shown at a time, with "Comido", "Deitado fora" and "Ainda tenho": the answer is
// sent without opening the app (CLAUDE.md, principle 3), and the next item takes its place.

const ICON = '/pwa-192x192.png';
const BADGE = '/pwa-64x64.png';
const ACTIONS = [
  { action: 'consumido', title: 'Comido' },
  { action: 'deitado_fora', title: 'Deitado fora' },
  { action: 'ainda', title: 'Ainda tenho' },
];

function showItem(alert, index) {
  const item = alert.items[index];
  if (!item) return Promise.resolve();
  return self.registration.showNotification(item.title, {
    body: item.body,
    tag: alert.tag || 'validades',
    renotify: index > 0,
    icon: ICON,
    badge: BADGE,
    actions: ACTIONS,
    data: { alert, index, url: alert.url || '/' },
  });
}

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  if (data.kind === 'expiry' && Array.isArray(data.items) && data.items.length) {
    event.waitUntil(showItem(data, 0));
    return;
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Validómetro', {
      body: data.body || '',
      tag: data.tag || 'validometro',
      icon: ICON,
      badge: BADGE,
      data: { url: data.url || '/' },
    }),
  );
});

/** Tells open windows to fetch the change (src/app/sync.ts). */
function tellWindows() {
  return self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((windows) => windows.forEach((client) => client.postMessage({ type: 'items-changed' })));
}

function openApp(url) {
  const target = new URL(url || '/', self.location.origin).href;
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    for (const client of windows) {
      if ('focus' in client) {
        if ('navigate' in client) client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  });
}

async function answer(alert, index, status) {
  const item = alert.items[index];
  const res = await fetch(`/api/items/${encodeURIComponent(item.id)}/status`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  // 404: already marked (on another phone, or in the app): nothing left to do.
  if (!res.ok && res.status !== 404) throw new Error(String(res.status));
  await tellWindows();
}

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  event.notification.close();
  const { alert, index } = data;
  if (!alert || !event.action) {
    event.waitUntil(openApp(data.url));
    return;
  }
  const next = () => showItem(alert, index + 1);
  if (event.action === 'ainda') {
    event.waitUntil(next());
    return;
  }
  event.waitUntil(
    answer(alert, index, event.action)
      .then(next)
      .catch(() =>
        self.registration.showNotification('Não foi possível registar', {
          body: 'Abre o Validómetro para marcar o que comeste ou deitaste fora.',
          tag: alert.tag || 'validades',
          icon: ICON,
          badge: BADGE,
          data: { url: '/' },
        }),
      ),
  );
});

// "Partilhar com o Validómetro" (manifest share_target, vite.config.ts): a receipt photo or
// screenshot shared from another app (the supermarket's digital receipt, the gallery). The
// image waits in this phone's cache only until the add screen reads it (QuickEntry.tsx),
// which deletes it at once; it never goes anywhere but the one reading request.
const SHARE_CACHE = 'validometro-partilha';

function shareRedirect(result) {
  return Response.redirect(
    new URL(`/adicionar?partilha=${result}`, self.location.origin).href,
    303,
  );
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST' || url.pathname !== '/partilhar') return;
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const file = form
          .getAll('talao')
          .find((entry) => typeof entry !== 'string' && entry.type.startsWith('image/'));
        if (!file) return shareRedirect('vazia');
        const cache = await caches.open(SHARE_CACHE);
        await cache.put(
          '/partilha/talao',
          new Response(file, { headers: { 'content-type': file.type } }),
        );
        return shareRedirect('talao');
      } catch {
        return shareRedirect('erro');
      }
    })(),
  );
});
