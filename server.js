require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});

// PostgreSQL Konekcija
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || 'rokovnik',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || ''
});

// Inicijalizacija Baze - Kreiranje tabele ako ne postoji
async function initDB() {
  const query = `
    CREATE TABLE IF NOT EXISTS predmeti (
      id BIGINT PRIMARY KEY,
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(query);
    console.log("✅ PostgreSQL Tabela 'predmeti' je spremna.");
  } catch (err) {
    console.error("❌ Greška pri inicijalizaciji PostgreSQL baze:", err.message);
  }
}

initDB();

// API 1: Učitavanje svih predmeta
app.get('/api/predmeti', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM predmeti ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error("Greška /api/predmeti:", err.message);
    res.status(500).json({ error: "Greška pri čitanju iz baze: " + err.message });
  }
});

// API 2: Čuvanje ili Ažuriranje predmeta (Sprečavanje dupliranja)
app.post('/api/predmeti', async (req, res) => {
  try {
    const p = req.body;
    const id = p.id ? parseInt(p.id) : Date.now();

    const insertOrUpdateQuery = `
      INSERT INTO predmeti (
        id, vrsta_predmeta, interni_broj, naziv_predmeta, investor, obradjivac, potpisnik,
        datum_prijema, rok_datum, status, napomena, slika_base64, ceop_broj, rop_broj,
        opstina, katastarska_opstina, broj_parcele, nadlezni_organ
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (id) DO UPDATE SET
        vrsta_predmeta = EXCLUDED.vrsta_predmeta,
        interni_broj = EXCLUDED.interni_broj,
        naziv_predmeta = EXCLUDED.naziv_predmeta,
        investor = EXCLUDED.investor,
        obradjivac = EXCLUDED.obradjivac,
        potpisnik = EXCLUDED.potpisnik,
        datum_prijema = EXCLUDED.datum_prijema,
        rok_datum = EXCLUDED.rok_datum,
        status = EXCLUDED.status,
        napomena = EXCLUDED.napomena,
        slika_base64 = EXCLUDED.slika_base64,
        ceop_broj = EXCLUDED.ceop_broj,
        rop_broj = EXCLUDED.rop_broj,
        opstina = EXCLUDED.opstina,
        katastarska_opstina = EXCLUDED.katastarska_opstina,
        broj_parcele = EXCLUDED.broj_parcele,
        nadlezni_organ = EXCLUDED.nadlezni_organ;
    `;

    const values = [
      id, p.vrsta_predmeta, p.interni_broj, p.naziv_predmeta, p.investor, p.obradjivac, p.potpisnik,
      p.datum_prijema, p.rok_datum, p.status, p.napomena, p.slika_base64, p.ceop_broj, p.rop_broj,
      p.opstina, p.katastarska_opstina, p.broj_parcele, p.nadlezni_organ
    ];

    await pool.query(insertOrUpdateQuery, values);
    res.json({ success: true, id: id });
  } catch (err) {
    console.error("Greška pri čuvanju:", err.message);
    res.status(500).json({ error: "Greška u bazi: " + err.message });
  }
});

// API 3: Brisanje predmeta
app.post('/api/obrisi', async (req, res) => {
  try {
    const { id } = req.body;
    await pool.query('DELETE FROM predmeti WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Greška pri brisanju:", err.message);
    res.status(500).json({ error: "Greška pri brisanju: " + err.message });
  }
});

// API 4: Slanje E-maila (Nodemailer sa provera SMTP parametara)
app.post('/api/send-email', async (req, res) => {
  const { to, subject, bodyText, attachmentBase64, filename } = req.body;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return res.status(400).json({
      error: "SMTP nije konfigurisan. Dodajte SMTP_USER i SMTP_PASS u .env fajl!"
    });
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const mailOptions = {
    from: process.env.SMTP_USER,
    to: to,
    subject: subject,
    text: bodyText,
    attachments: []
  };

  if (attachmentBase64 && attachmentBase64.includes('base64,')) {
    const base64Data = attachmentBase64.split('base64,')[1];
    mailOptions.attachments.push({
      filename: filename || 'prilog.png',
      content: Buffer.from(base64Data, 'base64')
    });
  }

  try {
    let info = await transporter.sendMail(mailOptions);
    console.log("E-mail poslat:", info.response);
    res.json({ success: true, message: "E-mail uspešno poslat!" });
  } catch (err) {
    console.error("Greška pri slanju e-maila:", err.message);
    res.status(500).json({ error: "Slanje nije uspelo: " + err.message });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 SERVER RADI NA PORTU ${PORT} (PostgreSQL Baza Povezana)`);
});
