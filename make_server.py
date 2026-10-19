import os, json

os.makedirs('public', exist_ok=True)

manifest = {
  "name": "Univerzalni Rokovnik Pro",
  "short_name": "Rokovnik",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a365d",
  "theme_color": "#2b6cb0"
}
with open('public/manifest.json', 'w', encoding='utf-8') as f:
    json.dump(manifest, f)

sw_code = "self.addEventListener('install', e => e.waitUntil(caches.open('v1').then(c => c.addAll(['/', '/index.html', '/app.js', '/styles.css'])))); self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));"
with open('public/sw.js', 'w', encoding='utf-8') as f:
    f.write(sw_code)

server_code = "const express = require('express'), path = require('path'), app = express(); app.use(express.static(path.join(__dirname, 'public'))); app.listen(5000, () => console.log('🚀 SERVER RADI NA PORTU 5000'));"
with open('server.js', 'w', encoding='utf-8') as f:
    f.write(server_code)

print('✅ Korak 1 uspešan!')
