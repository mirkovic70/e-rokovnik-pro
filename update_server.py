server_code = """const express = require('express'), path = require('path'), fs = require('fs'), app = express();
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({extended: true, limit: '50mb'}));
app.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); next(); });

const DATA_FILE = path.join(__dirname, 'data.json');
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8');

app.get('/api/predmeti', (req, res) => {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    res.json(JSON.parse(data || '[]'));
  } catch(e) { res.json([]); }
});

app.post('/api/predmeti', (req, res) => {
  try {
    let predmeti = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8') || '[]');
    let p = req.body;
    if (p.id) {
      let idx = predmeti.findIndex(x => x.id == p.id);
      if (idx !== -1) predmeti[idx] = p; else predmeti.push(p);
    } else {
      p.id = Date.now();
      predmeti.push(p);
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(predmeti, null, 2), 'utf-8');
    res.json({success: true, predmeti});
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/api/obrisi', (req, res) => {
  try {
    let predmeti = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8') || '[]');
    predmeti = predmeti.filter(x => x.id != req.body.id);
    fs.writeFileSync(DATA_FILE, JSON.stringify(predmeti, null, 2), 'utf-8');
    res.json({success: true, predmeti});
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.use(express.static(path.join(__dirname, 'public')));
app.listen(5000, () => console.log('🚀 SERVER RADI NA PORTU 5000'));"""

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(server_code)

print("✅ Server osvežen!")
