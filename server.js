const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

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
      CREATE TABLE IF NOT EXISTS predmeti (
        id SERIAL PRIMARY KEY,
        vrsta_predmeta TEXT,
        interni_broj TEXT,
        naziv_predmeta TEXT,
        investor TEXT,
        obradjivac TEXT,
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
    client.release();
    console.log('✅ PostgreSQL baza spremna!');
  } catch (err) {
    console.error('❌ Greška sa bazom:', err);
  }
}

initDb();

// 1. Dohvatanje predmeta
app.get('/api/predmeti', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM predmeti ORDER BY id DESC;');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Greška pri čitanju iz baze' });
  }
});

// 2. Unos ili izmena predmeta
app.post('/api/predmeti', async (req, res) => {
  const b = req.body;
  try {
    if (b.id) {
      // Izmena postojećeg
      const queryText = `
        UPDATE predmeti SET
          vrsta_predmeta=$1, interni_broj=$2, naziv_predmeta=$3, investor=$4,
          obradjivac=$5, potpisnik=$6, datum_prijema=$7, rok_datum=$8, status=$9,
          napomena=$10, slika_base64=$11, ceop_broj=$12, rop_broj=$13, opstina=$14,
          katastarska_opstina=$15, broj_parcele=$16, nadlezni_organ=$17
        WHERE id=$18
        RETURNING *;
      `;
      const values = [
        b.vrsta_predmeta || '', b.interni_broj || '', b.naziv_predmeta || '',
        b.investor || '', b.obradjivac || '', b.potpisnik || '', b.datum_prijema || '',
        b.rok_datum || '', b.status || '', b.napomena || '', b.slika_base64 || '',
        b.ceop_broj || '', b.rop_broj || '', b.opstina || '', b.katastarska_opstina || '',
        b.broj_parcele || '', b.nadlezni_organ || '', b.id
      ];
      const result = await pool.query(queryText, values);
      return res.json({ success: true, item: result.rows[0] });
    } else {
      // Unos novog
      const queryText = `
        INSERT INTO predmeti (
          vrsta_predmeta, interni_broj, naziv_predmeta, investor, obradjivac,
          potpisnik, datum_prijema, rok_datum, status, napomena, slika_base64,
          ceop_broj, rop_broj, opstina, katastarska_opstina, broj_parcele, nadlezni_organ
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *;
      `;
      const values = [
        b.vrsta_predmeta || '', b.interni_broj || '', b.naziv_predmeta || '',
        b.investor || '', b.obradjivac || '', b.potpisnik || '', b.datum_prijema || '',
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

// 3. Brisanje predmeta (prihvata /api/obrisi za kompatibilnost sa frontendom)
app.post('/api/obrisi', async (req, res) => {
  const { id } = req.body;
  try {
    await pool.query('DELETE FROM predmeti WHERE id = $1;', [id]);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Greška pri brisanju' });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server radi na portu ${PORT}`);
});
