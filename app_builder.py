import os

os.makedirs('public', exist_ok=True)
if os.path.exists('public/sw.js'): 
    os.remove('public/sw.js')

server_code = """const express = require('express'), path = require('path'), app = express();
app.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); next(); });
app.use(express.static(path.join(__dirname, 'public')));
app.listen(5000, () => console.log('🚀 SERVER RADI NA PORTU 5000'));"""

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(server_code)

print("✅ Server uspostavljen!")
