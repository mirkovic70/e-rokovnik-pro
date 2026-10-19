const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// PostgreSQL Konekcija
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Inicijalizacija baze i kreiranje tabela
async function initDb() {
  try {
    const client = await pool.connect();
    
    // Kreiranje tabele predmeti
    await client.query(`
      CREATE TABLE IF NOT EXISTS predmeti (
        id SERIAL PRIMARY KEY,
        vrsta TEXT,
        oznaka TEXT,
        naziv TEXT,
        stranka TEXT,
        obradivac TEXT,
        faza TEXT,
        status TEXT,
        rok TIMESTAMP,
        podnosilac TEXT,
        napomena TEXT,
        dokument_predmeta TEXT,
        poslednji_fajl TEXT,
        kreirano_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Provera i dodavanje kolona ako baza već postoji
    const alterQueries = [
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS dokument_predmeta TEXT;',
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS poslednji_fajl TEXT;',
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS napomena TEXT;',
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS podnosilac TEXT;'
    ];

    for (let q of alterQueries) {
      await client.query(q).catch(() => {});
    }

    client.release();
    console.log('✅ PostgreSQL baza je uspešno inicijalizovana i tabele su spremne!');
  } catch (err) {
    console.error('❌ Greška pri inicijalizaciji PostgreSQL baze:', err);
  }
}

// Pokreni inicijalizaciju baze
initDb();

// --- API RUTE ---

// 1. Preuzimanje svih predmeta
app.get('/api/predmeti', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM predmeti ORDER BY id DESC;');
    res.json(result.rows);
  } catch (err) {
    console.error('Greška pri čitanju iz baze:', err);
    res.status(500).json({ error: 'Greška u bazi pri preuzimanju predmeta' });
  }
});

// 2. Unos novog predmeta
app.post('/api/predmeti', async (req, res) => {
  const {
    vrsta,
    oznaka,
    naziv,
    stranka,
    obradivac,
    faza,
    status,
    rok,
    podnosilac,
    napomena,
    dokument_predmeta,
    poslednji_fajl
  } = req.body;

  try {
    const queryText = `
      INSERT INTO predmeti (
        vrsta, oznaka, naziv, stranka, obradivac, faza, status, rok, podnosilac, napomena, dokument_predmeta, poslednji_fajl
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;
    `;
    const values = [
      vrsta || '',
      oznaka || '',
      naziv || '',
      stranka || '',
      obradivac || '',
      faza || '',
      status || '',
      rok ? new Date(rok) : null,
      podnosilac || '',
      napomena || '',
      dokument_predmeta || null,
      poslednji_fajl || null
    ];

    const result = await pool.query(queryText, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Greška pri upisu u bazu:', err);
    res.status(500).json({ error: 'Greška u bazi pri čuvanju predmeta: ' + err.message });
  }
});

// 3. Brisanje predmeta
app.delete('/api/predmeti/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM predmeti WHERE id = $1;', [id]);
    res.json({ message: 'Predmet uspešno obrisan' });
  } catch (err) {
    console.error('Greška pri brisanju:', err);
    res.status(500).json({ error: 'Greška pri brisanju predmeta' });
  }
});

// Posluživanje frontend aplikacije (Sigurna opcija za sve ostale rute)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Pokretanje servera
app.listen(PORT, () => {
  console.log(`🚀 SERVER RADI NA PORTU ${PORT} (PostgreSQL Baza Povezana)`);
});
