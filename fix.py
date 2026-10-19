import os

os.makedirs('public', exist_ok=True)

server_code = '''const express = require('express'), path = require('path'), fs = require('fs'), app = express();
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({extended: true, limit: '50mb'}));
app.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); next(); });

const DATA_FILE = path.join(__dirname, 'data.json');
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8');

app.get('/api/predmeti', (req, res) => {
  try { res.json(JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8') || '[]')); }
  catch(e) { res.json([]); }
});

app.post('/api/predmeti', (req, res) => {
  try {
    let list = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8') || '[]');
    let p = req.body;
    if (p.id) {
      let i = list.findIndex(x => x.id == p.id);
      if (i !== -1) list[i] = p; else list.push(p);
    } else {
      p.id = Date.now();
      list.push(p);
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf-8');
    res.json({success: true});
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/api/obrisi', (req, res) => {
  try {
    let list = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8') || '[]');
    list = list.filter(x => x.id != req.body.id);
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf-8');
    res.json({success: true});
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.use(express.static(path.join(__dirname, 'public')));
app.listen(5000, () => console.log('🚀 SERVER RADI NA PORTU 5000'));'''

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(server_code)

print("✅ Server generisan uspesno!")
