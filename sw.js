/* یادآور چادرملو — Service Worker
   مجتمع معدنی و صنعتی چادرملو · طراحی و توسعه: یاسین مظفری */
const VERSION = 'yadavar-v1';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
const SHARE = 'yadavar-share';
const scoped = p => new URL(p, self.registration.scope).href;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== SHARE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method === 'POST' && url.searchParams.has('share')) {
    e.respondWith(handleShare(req));
    return;
  }
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put('./index.html', copy));
      return res;
    }).catch(() => caches.match('./index.html').then(r => r || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(req, copy));
    }
    return res;
  })));
});

async function handleShare(req) {
  try {
    const form = await req.formData();
    const cache = await caches.open(SHARE);
    const metaURL = scoped('__share/meta');
    const old = await cache.match(metaURL);
    const list = old ? await old.json() : [];
    const files = [];
    for (const f of form.getAll('files')) {
      if (!(f instanceof File) || !f.size) continue;
      const key = scoped('__share/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
      await cache.put(key, new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream' } }));
      files.push({ key, name: f.name, type: f.type });
    }
    const text = [form.get('text'), form.get('url')].filter(Boolean).join('\n');
    list.push({ title: form.get('title') || '', text, files });
    await cache.put(metaURL, new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json' } }));
  } catch (_) {}
  return Response.redirect(scoped('./?share=1'), 303);
}

self.addEventListener('notificationclick', e => {
  const n = e.notification, d = n.data || {};
  n.close();
  const msg = { type: 'notif', kind: d.kind, id: d.id, action: e.action || 'open' };
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = all.find(c => c.url.startsWith(self.registration.scope));
    if (win) {
      try { await win.focus(); } catch (_) {}
      win.postMessage(msg);
    } else {
      const q = new URLSearchParams({ notif: msg.kind || '', id: msg.id ?? '', action: msg.action });
      await self.clients.openWindow(scoped('./?' + q));
    }
  })());
});

self.addEventListener('periodicsync', e => {
  if (e.tag === 'digest') e.waitUntil(digest());
});

function readData() {
  return new Promise(ok => {
    const r = indexedDB.open('yadavar', 1);
    r.onerror = () => ok(null);
    r.onupgradeneeded = () => { r.transaction.abort(); ok(null); };
    r.onsuccess = () => {
      try {
        const g = r.result.transaction('kv').objectStore('kv').get('data');
        g.onsuccess = () => ok(g.result || null);
        g.onerror = () => ok(null);
      } catch (_) { ok(null); }
    };
  });
}

async function digest() {
  const D = await readData();
  if (!D || !D.settings || !D.settings.digest) return;
  const all = await self.clients.matchAll({ type: 'window' });
  if (all.length) return;
  const undone = (D.notes || []).filter(n => !n.done);
  if (!undone.length) return;
  const fa = s => String(s).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const late = undone.filter(n => n.at && n.at < Date.now()).length;
  await self.registration.showNotification(
    fa(undone.length) + ' کار انجام‌نشده' + (late ? ' (' + fa(late) + ' عقب‌افتاده)' : ''), {
      body: undone.slice(0, 5).map(n => '• ' + (n.title || n.text || 'بدون عنوان').slice(0, 50)).join('\n'),
      tag: 'digest-0', dir: 'rtl', lang: 'fa', icon: 'icon-192.png', data: { kind: 'digest', id: 0 }
    });
}
