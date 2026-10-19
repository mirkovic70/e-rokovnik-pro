const fs = require('fs');

const serverContent = `const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const db = new Pool({
  database: 'e_rokovnik',
  port: 5432
});

app.get('/api/predmeti', async (req, res) => {
  try {
    const result = await db.query("SELECT p.*, COALESCE(s.naziv, 'Nov predmet') as status_naziv FROM predmeti p LEFT JOIN statusi_predmeta s ON p.status_id = s.id ORDER BY p.datum_poslednje_izmene DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ greska: err.message });
  }
});

app.post('/api/predmeti', async (req, res) => {
  const b = req.body;
  try {
    const q = "INSERT INTO predmeti (interni_broj, ceop_broj, rop_broj, naziv_predmeta, investor, opstina, katastarska_opstina, broj_parcele, nadlezni_organ, datum_prijema, status_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *";
    const v = [b.interni_broj, b.ceop_broj || null, b.rop_broj || null, b.naziv_predmeta, b.investor, b.opstina, b.katastarska_opstina, b.broj_parcele, b.nadlezni_organ, b.datum_prijema, b.status_id || 1];
    const result = await db.query(q, v);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ greska: err.message });
  }
});

app.get('/', (req, res) => {
  res.send(\`<!DOCTYPE html>
<html lang="sr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Elektronski Rokovnik</title>
  <style>
    body { font-family: sans-serif; padding: 15px; background: #f0f2f5; margin: 0; }
    .card { background: #fff; padding: 15px; border-radius: 8px; margin-bottom: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1, h2 { color: #1a365d; margin-top: 0; }
    label { font-size: 12px; font-weight: bold; display: block; margin-top: 8px; }
    input, button { width: 100%; padding: 10px; margin: 4px 0 10px; border: 1px solid #ccc; border-radius: 5px; box-sizing: border-box; }
    button { background: #2b6cb0; color: #fff; font-weight: bold; border: none; cursor: pointer; font-size: 15px; }
    .item { background: #e2e8f0; padding: 10px; border-left: 4px solid #2b6cb0; margin-bottom: 8px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>📋 Elektronski Rokovnik (CEOP)</h1>
  <div class="card">
    <h2>➕ Unos novog predmeta</h2>
    <form id="f">
      <label>Interni broj *</label><input type="text" id="ib" placeholder="INT-2026-001" required>
      <label>CEOP broj</label><input type="text" id="cb" placeholder="ROP-BGDS-1234-CPI-1/2026">
      <label>Naziv predmeta *</label><input type="text" id="np" placeholder="Izgradnja..." required>
      <label>Investitor *</label><input type="text" id="inv" placeholder="Ime i prezime" required>
      <label>Opstina *</label><input type="text" id="op" value="Novi Sad" required>
      <label>Katastarska opstina *</label><input type="text" id="ko" placeholder="Novi Sad II" required>
      <label>Broj parcele *</label><input type="text" id="bp" placeholder="1234/5" required>
      <label>Nadlezni organ *</label><input type="text" id="no" value="Gradska upravna za urbanizam" required>
      <label>Datum prijema *</label><input type="date" id="dp" required>
      <button type="submit">💾 Sacuvaj predmet</button>
    </form>
  </div>
  <div class="card">
    <h2>📂 Pregled predmeta</h2>
    <div id="l">Ucitavanje...</div>
  </div>
  <script>
    document.getElementById("dp").valueAsDate = new Date();
    function ucitaj() {
      fetch("/api/predmeti")
        .then(r => r.json())
        .then(d => {
          const el = document.getElementById("l");
          if (!d || !d.length) { el.innerHTML = "Nema unetih predmeta u bazi."; return; }
          el.innerHTML = d.map(p => '<div class="item"><strong>' + p.naziv_predmeta + '</strong><br><small>Interni: ' + p.interni_broj + ' | CEOP: ' + (p.ceop_broj || '/') + '</small><br><small>Investitor: ' + p.investor + ' | KO: ' + p.katastarska_opstina + ', parc. ' + p.broj_parcele + '</small></div>').join("");
        });
    }
    document.getElementById("f").onsubmit = function(e) {
      e.preventDefault();
      const body = {
        interni_broj: document.getElementById("ib").value,
        ceop_broj: document.getElementById("cb").value,
        naziv_predmeta: document.getElementById("np").value,
        investor: document.getElementById("inv").value,
        opstina: document.getElementById("op").value,
        katastarska_opstina: document.getElementById("ko").value,
        broj_parcele: document.getElementById("bp").value,
        nadlezni_organ: document.getElementById("no").value,
        datum_prijema: document.getElementById("dp").value
      };
      fetch("/api/predmeti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }).then(r => {
        if (r.ok) {
          alert("Uspesno sacuvano!");
          document.getElementById("f").reset();
          document.getElementById("dp").valueAsDate = new Date();
          ucitaj();
        } else {
          r.json().then(e => alert("Greska: " + e.greska));
        }
      });
    };
    ucitaj();
  </script>
</body>
</html>\`);
});

app.listen(5000, () => {
  console.log('🚀 SERVER JE POKRENUT NA PORTU 5000!');
});
`;

fs.writeFileSync('server.js', serverContent);
console.log('✅ server.js uspešno generisan!');
