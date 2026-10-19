import os

os.makedirs('public', exist_ok=True)

# 1. KOD ZA SERVER (server.js)
server_code = """const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({extended: true, limit: '50mb'}));

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});

const DATA_FILE = path.join(__dirname, 'data.json');
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
}

app.get('/api/predmeti', (req, res) => {
  try {
    const content = fs.readFileSync(DATA_FILE, 'utf-8');
    res.json(JSON.parse(content || '[]'));
  } catch (e) {
    res.json([]);
  }
});

app.post('/api/predmeti', (req, res) => {
  try {
    let list = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8') || '[]');
    let p = req.body;
    if (p.id) {
      let idx = list.findIndex(x => x.id == p.id);
      if (idx !== -1) list[idx] = p;
      else list.push(p);
    } else {
      p.id = Date.now();
      list.push(p);
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf-8');
    res.json({success: true});
  } catch (e) {
    res.status(500).json({error: e.message});
  }
});

app.post('/api/obrisi', (req, res) => {
  try {
    let list = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8') || '[]');
    list = list.filter(x => x.id != req.body.id);
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf-8');
    res.json({success: true});
  } catch (e) {
    res.status(500).json({error: e.message});
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(5000, () => {
  console.log('🚀 SERVER RADI NA PORTU 5000');
});
"""

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(server_code)

# 2. KOD ZA FRONTEND (public/index.html)
html_code = """<!DOCTYPE html>
<html lang="sr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Univerzalni Rokovnik Pro</title>
  <style>
    :root { --primary: #1a365d; --accent: #2b6cb0; --bg: #f0f2f5; --card: #ffffff; --text: #1a202c; --danger: #e53e3e; --warn: #dd6b20; --purple: #805ad5; }
    body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 10px; }
    header { background: var(--primary); color: white; padding: 12px 16px; border-radius: 8px; margin-bottom: 12px; }
    h1 { font-size: 1.2rem; margin: 0; }
    .card { background: var(--card); padding: 16px; border-radius: 8px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h2 { font-size: 1rem; margin-top: 0; border-bottom: 2px solid #edf2f7; padding-bottom: 6px; }
    label { font-size: 12px; font-weight: bold; color: #4a5568; display: block; margin-top: 8px; }
    input, select, textarea, button { width: 100%; padding: 10px; border: 1px solid #cbd5e0; border-radius: 6px; box-sizing: border-box; font-size: 14px; margin-top: 4px; }
    button { background: var(--accent); color: white; font-weight: bold; border: none; cursor: pointer; border-radius: 6px; }
    .btn-sec { background: #4a5568; } .btn-danger { background: var(--danger); } .btn-warning { background: var(--warn); } .btn-mail { background: var(--purple); }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    .item { background: white; border-left: 5px solid var(--accent); padding: 12px; border-radius: 6px; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; background: #e2e8f0; }
    .ceop-section { background: #ebf8ff; border: 1px solid #bee3f8; padding: 10px; border-radius: 6px; margin-top: 8px; }
    img.preview { max-width: 100%; max-height: 160px; border-radius: 6px; margin-top: 8px; object-fit: cover; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <header><h1>📋 Univerzalni Rokovnik Pro</h1></header>

  <div class="card">
    <h2 id="form-title">➕ Unos Novog Predmeta</h2>
    <form id="predmet-form">
      <input type="hidden" id="edit-id">
      <div class="grid-2">
        <div>
          <label>Vrsta predmeta *</label>
          <select id="vrsta_predmeta" onchange="prikaziCEOP()">
            <option value="Opšti predmet / Zadatak">Opšti predmet / Zadatak</option>
            <option value="CEOP i Građevinski postupak">CEOP i Građevinski postupak</option>
            <option value="Katastar i Parcele">Katastar i Parcele</option>
            <option value="Ugovor / Pravni predmet">Ugovor / Pravni predmet</option>
            <option value="Sastanak / Podsetnik">Sastanak / Podsetnik</option>
            <option value="Privatno">Privatno</option>
          </select>
        </div>
        <div><label>Oznaka / Broj *</label><input type="text" id="interni_broj" required placeholder="INT-2026-01"></div>
      </div>
      <div><label>Naziv predmeta *</label><input type="text" id="naziv_predmeta" required placeholder="Unesite naziv"></div>
      <div class="grid-2">
        <div><label>Stranka / Investitor</label><input type="text" id="investor"></div>
        <div><label>Obrađivač</label><input type="text" id="obradjivac"></div>
      </div>
      <div class="grid-2">
        <div><label>Datum otvaranja *</label><input type="date" id="datum_prijema" required></div>
        <div><label>Krajnji rok</label><input type="date" id="rok_datum"></div>
      </div>
      <div class="grid-2">
        <div>
          <label>Status</label>
          <select id="status">
            <option value="U radu">U radu</option>
            <option value="Čeka dopunu">Čeka dopunu</option>
            <option value="Završeno / Odobreno">Završeno / Odobreno</option>
            <option value="Odbijeno">Odbijeno</option>
          </select>
        </div>
        <div><label>Potpisnik</label><input type="text" id="potpisnik"></div>
      </div>

      <div id="ceop-modul" class="ceop-section hidden">
        <h3 style="margin-top:0;">🏗️ CEOP Podaci</h3>
        <div class="grid-2">
          <div><label>CEOP Broj</label><input type="text" id="ceop_broj"></div>
          <div><label>ROP Broj</label><input type="text" id="rop_broj"></div>
        </div>
        <div class="grid-2">
          <div><label>Opština</label><input type="text" id="opstina" value="Novi Sad"></div>
          <div><label>KO</label><input type="text" id="katastarska_opstina"></div>
        </div>
        <div class="grid-2">
          <div><label>Broj parcele</label><input type="text" id="broj_parcele"></div>
          <div><label>Nadležni organ</label><input type="text" id="nadlezni_organ" value="Gradska uprava za urbanizam"></div>
        </div>
      </div>

      <div><label>Napomene</label><textarea id="napomena" rows="2"></textarea></div>

      <div class="grid-2" style="margin-top:10px;">
        <div><label>📷 US slikaj kamerom</label><input type="file" id="camera-input" accept="image/*" capture="environment"></div>
        <div><label>📁 Priloži dokument</label><input type="file" id="file-input" accept="image/*,.pdf,.doc,.docx"></div>
      </div>

      <input type="hidden" id="slika_base64">
      <img id="img-preview" class="preview hidden">

      <div class="grid-2" style="margin-top:12px;">
        <button type="submit">💾 Sačuvaj Predmet</button>
        <button type="button" id="cancel-btn" onclick="resetForm()" class="btn-sec hidden">Odustani</button>
      </div>
    </form>
  </div>

  <div class="card">
    <h2>📂 Registar Predmeta</h2>
    <div id="predmeti-lista">Učitavanje...</div>
  </div>

  <script>
    let predmetiSvi = [];

    function prikaziCEOP() {
      const v = document.getElementById('vrsta_predmeta').value;
      const el = document.getElementById('ceop-modul');
      if (v === 'CEOP i Građevinski postupak') {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }

    async function ucitaj() {
      try {
        const res = await fetch('/api/predmeti');
        predmetiSvi = await res.json();
        prikazi();
      } catch (err) {
        document.getElementById('predmeti-lista').innerHTML = '<span style="color:red;">Greška pri povezivanju sa serverom.</span>';
      }
    }

    function prikazi() {
      const el = document.getElementById('predmeti-lista');
      if (!predmetiSvi || predmetiSvi.length === 0) {
        el.innerHTML = '<small style="color:#718096;">Nema unetih predmeta u bazi.</small>';
        return;
      }
      let html = '';
      for (let p of predmetiSvi) {
        const isImg = p.slika_base64 && p.slika_base64.startsWith('data:image');
        const isDoc = p.slika_base64 && !p.slika_base64.startsWith('data:image');
        html += `
          <div class="item">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong>${p.naziv_predmeta}</strong>
              <span class="badge">${p.status}</span>
            </div>
            <small><b>Oznaka:</b> ${p.interni_broj} | <b>Vrsta:</b> ${p.vrsta_predmeta}</small><br>
            <small><b>Stranka:</b> ${p.investor || '/'} | <b>Obrađivač:</b> ${p.obradjivac || '/'}</small><br>
            <small><b>Datum:</b> ${p.datum_prijema} | <b>Rok:</b> ${p.rok_datum || 'Nema'}</small>
            ${(p.ceop_broj || p.broj_parcele) ? `<br><small style="color:#2b6cb0;"><b>CEOP:</b> ${p.ceop_broj\vert{}\vert{}'/'} \vert{} <b>ROP:</b>${p.rop_broj||'/'} | <b>Parcela:</b> ${p.broj_parcele\vert{}\vert{}'/'} (${p.katastarska_opstina||'/'})</small>` : ''}
            ${p.napomena ? `<br><small style="color:#4a5568;"><b>Napomena:</b> ${p.napomena}</small>` : ''}
            ${isImg ? `<br><img src="${p.slika_base64}" class="preview">` : ''}
            ${isDoc ? `<br><small style="color:#38a169;"><b>📁 Dokument priložen</b></small>` : ''}
            <div class="grid-3" style="margin-top:10px;">
              <button class="btn-warning" onclick="izmeni(${p.id})">✏️ Izmeni</button>
              <button class="btn-mail" onclick="posaljiMail(${p.id})">✉️ Mail</button>
              <button class="btn-danger" onclick="obrisi(${p.id})">🗑️ Obriši</button>
            </div>
          </div>`;
      }
      el.innerHTML = html;
    }

    function obradiFajl(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(e) {
        document.getElementById('slika_base64').value = e.target.result;
        if (file.type.startsWith('image/')) {
          const img = document.getElementById('img-preview');
          img.src = e.target.result;
          img.classList.remove('hidden');
        } else {
          document.getElementById('img-preview').classList.add('hidden');
          alert('Priložen dokument: ' + file.name);
        }
      };
      reader.readAsDataURL(file);
    }

    window.onload = function() {
      document.getElementById('datum_prijema').valueAsDate = new Date();
      ucitaj();

      document.getElementById('camera-input').addEventListener('change', e => obradiFajl(e.target.files[0]));
      document.getElementById('file-input').addEventListener('change', e => obradiFajl(e.target.files[0]));

      document.getElementById('predmet-form').onsubmit = async function(e) {
        e.preventDefault();
        const idVal = document.getElementById('edit-id').value;
        const payload = {
          id: idVal ? parseInt(idVal) : null,
          vrsta_predmeta: document.getElementById('vrsta_predmeta').value,
          interni_broj: document.getElementById('interni_broj').value,
          naziv_predmeta: document.getElementById('naziv_predmeta').value,
          investor: document.getElementById('investor').value,
          obradjivac: document.getElementById('obradjivac').value,
          potpisnik: document.getElementById('potpisnik').value,
          datum_prijema: document.getElementById('datum_prijema').value,
          rok_datum: document.getElementById('rok_datum').value,
          status: document.getElementById('status').value,
          napomena: document.getElementById('napomena').value,
          slika_base64: document.getElementById('slika_base64').value,
          ceop_broj: document.getElementById('ceop_broj').value,
          rop_broj: document.getElementById('rop_broj').value,
          opstina: document.getElementById('opstina').value,
          katastarska_opstina: document.getElementById('katastarska_opstina').value,
          broj_parcele: document.getElementById('broj_parcele').value,
          nadlezni_organ: document.getElementById('nadlezni_organ').value
        };

        const res = await fetch('/api/predmeti', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          resetForm();
          ucitaj();
        } else {
          alert('Greška pri čuvanju!');
        }
      };
    };

    function resetForm() {
      document.getElementById('predmet-form').reset();
      document.getElementById('edit-id').value = '';
      document.getElementById('slika_base64').value = '';
      document.getElementById('img-preview').classList.add('hidden');
      document.getElementById('cancel-btn').classList.add('hidden');
      document.getElementById('form-title').innerText = '➕ Unos Novog Predmeta';
      document.getElementById('datum_prijema').valueAsDate = new Date();
      prikaziCEOP();
    }

    async function obrisi(id) {
      if (confirm('Obriši ovaj predmet?')) {
        const res = await fetch('/api/obrisi', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({id})
        });
        if (res.ok) ucitaj();
      }
    }

    function izmeni(id) {
      const p = predmetiSvi.find(x => x.id == id);
      if (!p) return;
      document.getElementById('edit-id').value = p.id;
      document.getElementById('vrsta_predmeta').value = p.vrsta_predmeta;
      document.getElementById('interni_broj').value = p.interni_broj;
      document.getElementById('naziv_predmeta').value = p.naziv_predmeta;
      document.getElementById('investor').value = p.investor || '';
      document.getElementById('obradjivac').value = p.obradjivac || '';
      document.getElementById('potpisnik').value = p.potpisnik || '';
      document.getElementById('datum_prijema').value = p.datum_prijema;
      document.getElementById('rok_datum').value = p.rok_datum || '';
      document.getElementById('status').value = p.status;
      document.getElementById('napomena').value = p.napomena || '';
      document.getElementById('slika_base64').value = p.slika_base64 || '';
      document.getElementById('ceop_broj').value = p.ceop_broj || '';
      document.getElementById('rop_broj').value = p.rop_broj || '';
      document.getElementById('opstina').value = p.opstina || 'Novi Sad';
      document.getElementById('katastarska_opstina').value = p.katastarska_opstina || '';
      document.getElementById('broj_parcele').value = p.broj_parcele || '';
      document.getElementById('nadlezni_organ').value = p.nadlezni_organ || '';

      if (p.slika_base64 && p.slika_base64.startsWith('data:image')) {
        const img = document.getElementById('img-preview');
        img.src = p.slika_base64;
        img.classList.remove('hidden');
      }

      prikaziCEOP();
      document.getElementById('form-title').innerText = '✏️ Izmena Predmeta';
      document.getElementById('cancel-btn').classList.remove('hidden');
      window.scrollTo(0,0);
    }

    function posaljiMail(id) {
      const p = predmetiSvi.find(x => x.id == id);
      if (!p) return;
      const addr = prompt('E-mail adresa:', 'mirkovic70@gmail.com');
      if (!addr) return;
      const sub = encodeURIComponent('Predmet [' + p.interni_broj + ']: ' + p.naziv_predmeta);
      let body = 'Pregled predmeta:\n\n' +
        '• Oznaka: ' + p.interni_broj + '\n' +
        '• Vrsta: ' + p.vrsta_predmeta + '\n' +
        '• Naziv: ' + p.naziv_predmeta + '\n' +
        '• Stranka: ' + (p.investor || '/') + '\n' +
        '• Obrađivač: ' + (p.obradjivac || '/') + '\n' +
        '• Status: ' + p.status + '\n' +
        '• Datum: ' + p.datum_prijema + '\n' +
        '• Rok: ' + (p.rok_datum || 'Nema') + '\n';
      if (p.napomena) body += '\nNapomena: ' + p.napomena + '\n';
      window.location.href = 'mailto:' + addr + '?subject=' + sub + '&body=' + encodeURIComponent(body);
    }
  </script>
</body>
</html>
"""

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html_code)

print("✅ Svi fajlovi generisani potpuno bez greške!")
