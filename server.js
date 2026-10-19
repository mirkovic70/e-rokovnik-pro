const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'rokovnik_tajni_kljuc_12345';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDb() {
  try {
    const client = await pool.connect();
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        ime TEXT,
        kreirano_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS predmeti (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        vrsta_predmeta TEXT,
        interni_broj TEXT,
        naziv_predmeta TEXT,
        investor TEXT,
        obradivac TEXT,
        potpisnik TEXT,
        datum_prijema TEXT,
        rok_datum TEXT,
        status TEXT,
        napomena TEXT,
        slika_base64 TEXT,
        ceop_broj TEXT,
        rop_broj TEXT,
        opstina TEXT,
        katastarska_opstina TEXT,
        broj_parcele TEXT,
        nadlezni_organ TEXT,
        kreirano_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const alterQueries = [
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS user_id INTEGER;',
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS vrsta_predmeta TEXT;',
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS interni_broj TEXT;',
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS naziv_predmeta TEXT;',
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS investor TEXT;',
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS obradivac TEXT;',
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS potpisnik TEXT;',
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS datum_prijema TEXT;',
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS rok_datum TEXT;',
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS status TEXT;',
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS napomena TEXT;',
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS slika_base64 TEXT;',
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS ceop_broj TEXT;',
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS rop_broj TEXT;',
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS opstina TEXT;',
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS katastarska_opstina TEXT;',
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS broj_parcele TEXT;',
      'ALTER TABLE predmeti ADD COLUMN IF NOT EXISTS nadlezni_organ TEXT;'
    ];

    for (let q of alterQueries) {
      await client.query(q).catch(() => {});
    }

    client.release();
    console.log('✅ PostgreSQL baza je sinhronizovana!');
  } catch (err) {
    console.error('❌ Greška sa bazom:', err);
  }
}

initDb();

function authMiddleware(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) {
    return res.status(401).json({ success: false, error: 'Niste prijavljeni.' });
  }

  try {
    const rawToken = token.startsWith('Bearer ') ? token.slice(7) : token;
    const decoded = jwt.verify(rawToken, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, error: 'Sesija je istekla.' });
  }
}

app.post('/api/register', async (req, res) => {
  const { email, password, ime } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'E-mail i lozinka su obavezni.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password, ime) VALUES ($1, $2, $3) RETURNING id, email, ime;',
      [email.toLowerCase().trim(), hashedPassword, ime || '']
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    res.json({ success: true, user, token });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ success: false, error: 'Korisnik sa tim e-mailom već postoji.' });
    }
    res.status(500).json({ success: false, error: 'Greška pri registraciji: ' + err.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Unesite e-mail i lozinku.' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1;', [email.toLowerCase().trim()]);
    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Pogrešan e-mail ili lozinka.' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ success: false, error: 'Pogrešan e-mail ili lozinka.' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, ime: user.ime }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Greška pri prijavi: ' + err.message });
  }
});

app.get('/api/predmeti', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM predmeti WHERE user_id = $1 OR user_id IS NULL ORDER BY id DESC;',
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Greška pri čitanju iz baze' });
  }
});

app.post('/api/predmeti', authMiddleware, async (req, res) => {
  const b = req.body;
  const userId = req.user.userId;

  try {
    if (b.id) {
      const queryText = `
        UPDATE predmeti SET
          vrsta_predmeta=$1, interni_broj=$2, naziv_predmeta=$3, investor=$4,
          obradivac=$5, potpisnik=$6, datum_prijema=$7, rok_datum=$8, status=$9,
          napomena=$10, slika_base64=$11, ceop_broj=$12, rop_broj=$13, opstina=$14,
          katastarska_opstina=$15, broj_parcele=$16, nadlezni_organ=$17
        WHERE id=$18 AND (user_id=$19 OR user_id IS NULL)
        RETURNING *;
      `;
      const values = [
        b.vrsta_predmeta || '', b.interni_broj || '', b.naziv_predmeta || '',
        b.investor || '', b.obradivac || '', b.potpisnik || '', b.datum_prijema || '',
        b.rok_datum || '', b.status || '', b.napomena || '', b.slika_base64 || '',
        b.ceop_broj || '', b.rop_broj || '', b.opstina || '', b.katastarska_opstina || '',
        b.broj_parcele || '', b.nadlezni_organ || '', b.id, userId
      ];
      const result = await pool.query(queryText, values);
      return res.json({ success: true, item: result.rows[0] });
    } else {
      const queryText = `
        INSERT INTO predmeti (
          user_id, vrsta_predmeta, interni_broj, naziv_predmeta, investor, obradivac,
          potpisnik, datum_prijema, rok_datum, status, napomena, slika_base64,
          ceop_broj, rop_broj, opstina, katastarska_opstina, broj_parcele, nadlezni_organ
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING *;
      `;
      const values = [
        userId,
        b.vrsta_predmeta || '', b.interni_broj || '', b.naziv_predmeta || '',
        b.investor || '', b.obradivac || '', b.potpisnik || '', b.datum_prijema || '',
        b.rok_datum || '', b.status || '', b.napomena || '', b.slika_base64 || '',
        b.ceop_broj || '', b.rop_broj || '', b.opstina || '', b.katastarska_opstina || '',
        b.broj_parcele || '', b.nadlezni_organ || ''
      ];
      const result = await pool.query(queryText, values);
      return res.json({ success: true, item: result.rows[0] });
    }
  } catch (err) {
    console.error('Greška pri čuvanju:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/obrisi', authMiddleware, async (req, res) => {
  const { id } = req.body;
  try {
    await pool.query('DELETE FROM predmeti WHERE id = $1 AND (user_id = $2 OR user_id IS NULL);', [id, req.user.userId]);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Greška pri brisanju' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server radi na portu ${PORT}`);
});
