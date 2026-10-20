
"use strict";

const express = require("express");
const { Pool } = require("pg");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 5000);
const SECRET = process.env.SESSION_SECRET;

if (!process.env.DATABASE_URL) {
  throw new Error("Nedostaje DATABASE_URL.");
}

if (!SECRET || SECRET.length < 32) {
  throw new Error("SESSION_SECRET mora imati najmanje 32 karaktera.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "require"
    ? { rejectUnauthorized: true }
    : undefined
});

app.disable("x-powered-by");
app.use(express.json({ limit: "11mb" }));
app.use(express.static(path.join(__dirname, "public")));

const columns = [
  "vrsta_predmeta",
  "interni_broj",
  "naziv_predmeta",
  "investor",
  "obradjivac",
  "potpisnik",
  "datum_prijema",
  "rok_datum",
  "status",
  "napomena",
  "ceop_broj",
  "rop_broj",
  "opstina",
  "katastarska_opstina",
  "broj_parcele",
  "nadlezni_organ"
];

const dateFields = new Set(["datum_prijema", "rok_datum"]);

const selectColumns = `
  p.id,
  ${columns.map(c =>
    dateFields.has(c)
      ? `p.${c}::text AS ${c}`
      : `p.${c}`
  ).join(", ")},
  p.created_at,
  p.updated_at,
  (
    SELECT COUNT(*)::int
    FROM rokovnik_v2_prilozi d
    WHERE d.predmet_id = p.id
  ) AS broj_dokumenata
`;

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

function validId(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function normalize(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Neispravan zahtev.");
  }

  const result = {};

  for (const key of columns) {
    let value = body[key];

    if (value == null) value = "";

    if (typeof value !== "string") {
      throw new Error("Neispravno polje: " + key);
    }

    value = value.trim();

    if (dateFields.has(key)) {
      if (value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          throw new Error("Neispravan datum: " + key);
        }

        const date = new Date(value + "T00:00:00Z");

        if (
          Number.isNaN(date.getTime()) ||
          date.toISOString().slice(0, 10) !== value
        ) {
          throw new Error("Neispravan datum: " + key);
        }
      }

      result[key] = value || null;
    } else {
      const limit = key === "napomena" ? 20000 : 500;

      if (value.length > limit) {
        throw new Error("Predugačko polje: " + key);
      }

      result[key] = value;
    }
  }

  if (!result.interni_broj || !result.naziv_predmeta) {
    throw new Error("Broj i naziv predmeta su obavezni.");
  }

  if (!result.datum_prijema) {
    throw new Error("Datum prijema je obavezan.");
  }

  if (!result.status) result.status = "U radu";

  return result;
}

function passwordHash(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);

  return x.length === y.length &&
    crypto.timingSafeEqual(x, y);
}

function createToken(user) {
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    exp: Date.now() + 12 * 60 * 60 * 1000
  })).toString("base64url");

  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("base64url");

  return payload + "." + signature;
}

function verifyToken(token) {
  if (typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(parts[0])
    .digest("base64url");

  if (!safeEqual(parts[1], expected)) return null;

  try {
    const data = JSON.parse(
      Buffer.from(parts[0], "base64url").toString()
    );

    if (!validId(data.id) || data.exp <= Date.now()) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

function asyncRoute(fn) {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => fn(req, res))
      .catch(next);
  };
}

async function auth(req, res, next) {
  try {
    const header = req.get("authorization") || "";

    if (!header.startsWith("Bearer ")) {
      return fail(res, 401, "Potrebna je prijava.");
    }

    const session = verifyToken(header.slice(7));

    if (!session) {
      return fail(res, 401, "Sesija je istekla.");
    }

    const result = await pool.query(
      `SELECT id, username
       FROM rokovnik_v2_users
       WHERE id=$1`,
      [session.id]
    );

    if (!result.rows.length) {
      return fail(res, 401, "Korisnik ne postoji.");
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rokovnik_v2_users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rokovnik_v2_predmeti (
      id BIGSERIAL PRIMARY KEY,
      vrsta_predmeta TEXT NOT NULL DEFAULT '',
      interni_broj TEXT NOT NULL,
      naziv_predmeta TEXT NOT NULL,
      investor TEXT NOT NULL DEFAULT '',
      obradjivac TEXT NOT NULL DEFAULT '',
      potpisnik TEXT NOT NULL DEFAULT '',
      datum_prijema DATE NOT NULL,
      rok_datum DATE,
      status TEXT NOT NULL DEFAULT 'U radu',
      napomena TEXT NOT NULL DEFAULT '',
      ceop_broj TEXT NOT NULL DEFAULT '',
      rop_broj TEXT NOT NULL DEFAULT '',
      opstina TEXT NOT NULL DEFAULT '',
      katastarska_opstina TEXT NOT NULL DEFAULT '',
      broj_parcele TEXT NOT NULL DEFAULT '',
      nadlezni_organ TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rokovnik_v2_prilozi (
      id BIGSERIAL PRIMARY KEY,
      predmet_id BIGINT NOT NULL
        REFERENCES rokovnik_v2_predmeti(id)
        ON DELETE CASCADE,
      naziv TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      sadrzaj BYTEA NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE rokovnik_v2_predmeti
    ADD COLUMN IF NOT EXISTS user_id BIGINT
      REFERENCES rokovnik_v2_users(id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS rokovnik_v2_user_idx
    ON rokovnik_v2_predmeti(user_id);

    CREATE INDEX IF NOT EXISTS rokovnik_v2_rok_idx
    ON rokovnik_v2_predmeti(rok_datum);
  `);

  const count = await pool.query(
    "SELECT COUNT(*)::int AS broj FROM rokovnik_v2_users"
  );

  if (count.rows[0].broj === 0) {
    const password = process.env.ADMIN_PASSWORD;

    if (!password || password.length < 12) {
      throw new Error(
        "Podesi ADMIN_PASSWORD od najmanje 12 karaktera."
      );
    }

    const salt = crypto.randomBytes(24).toString("hex");

    await pool.query(
      `INSERT INTO rokovnik_v2_users
       (username, password_hash, password_salt)
       VALUES ($1,$2,$3)`,
      ["admin", passwordHash(password, salt), salt]
    );
  }

  console.log("PostgreSQL Rokovnik Pro 2.0 je spreman.");
}

app.get("/api/health", asyncRoute(async (req, res) => {
  await pool.query("SELECT 1");
  res.json({ ok: true, app: "Rokovnik Pro 2.0" });
}));

app.post("/api/login", asyncRoute(async (req, res) => {
  const { username, password } = req.body || {};

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username.length > 100 ||
    password.length > 1000
  ) {
    return fail(res, 400, "Neispravni podaci.");
  }

  const result = await pool.query(
    "SELECT * FROM rokovnik_v2_users WHERE username=$1",
    [username.trim()]
  );

  const user = result.rows[0];

  if (
    !user ||
    !safeEqual(
      passwordHash(password, user.password_salt),
      user.password_hash
    )
  ) {
    return fail(res, 401, "Pogrešno korisničko ime ili lozinka.");
  }

  res.json({
    success: true,
    token: createToken(user),
    username: user.username
  });
}));

app.get("/api/me", auth, (req, res) => {
  res.json({ user: req.user });
});

// REGISTRACIJA NOVOG KORISNIKA
// Samo admin može da otvara naloge.

app.post("/api/users", auth, asyncRoute(async (req, res) => {
  if (req.user.username !== "admin") {
    return fail(res, 403, "Samo administrator dodaje korisnike.");
  }

  const { username, password } = req.body || {};

  if (
    typeof username !== "string" ||
    !/^[a-zA-Z0-9_.-]{3,50}$/.test(username)
  ) {
    return fail(res, 400, "Neispravno korisničko ime.");
  }

  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 1000
  ) {
    return fail(res, 400, "Lozinka mora imati najmanje 12 karaktera.");
  }

  const salt = crypto.randomBytes(24).toString("hex");

  try {
    const result = await pool.query(
      `INSERT INTO rokovnik_v2_users
       (username, password_hash, password_salt)
       VALUES ($1,$2,$3)
       RETURNING id, username`,
      [username, passwordHash(password, salt), salt]
    );

    res.status(201).json({
      success: true,
      user: result.rows[0]
    });
  } catch (err) {
    if (err.code === "23505") {
      return fail(res, 409, "Korisničko ime već postoji.");
    }
    throw err;
  }
}));

app.get("/api/users", auth, asyncRoute(async (req, res) => {
  if (req.user.username !== "admin") {
    return fail(res, 403, "Pristup nije dozvoljen.");
  }

  const result = await pool.query(
    `SELECT id, username, created_at
     FROM rokovnik_v2_users
     ORDER BY username`
  );

  res.json(result.rows);
}));

// SAMO PREDMETI PRIJAVLJENOG KORISNIKA

app.get("/api/predmeti", auth, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT ${selectColumns}
     FROM rokovnik_v2_predmeti p
     WHERE p.user_id=$1
     ORDER BY p.created_at DESC, p.id DESC`,
    [req.user.id]
  );

  res.json(result.rows);
}));

app.get("/api/predmeti/:id", auth, asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return fail(res, 400, "Neispravan ID.");

  const result = await pool.query(
    `SELECT ${selectColumns}
     FROM rokovnik_v2_predmeti p
     WHERE p.id=$1 AND p.user_id=$2`,
    [id, req.user.id]
  );

  if (!result.rows.length) {
    return fail(res, 404, "Predmet nije pronađen.");
  }

  res.json(result.rows[0]);
}));

app.post("/api/predmeti", auth, asyncRoute(async (req, res) => {
  let p;

  try {
    p = normalize(req.body);
  } catch (err) {
    return fail(res, 400, err.message);
  }

  const values = [...columns.map(c => p[c]), req.user.id];

  const placeholders = values
    .map((_, i) => "$" + (i + 1))
    .join(",");

  const result = await pool.query(
    `INSERT INTO rokovnik_v2_predmeti
     (${columns.join(",")}, user_id)
     VALUES (${placeholders})
     RETURNING id`,
    values
  );

  res.status(201).json({
    success: true,
    id: result.rows[0].id
  });
}));

app.put("/api/predmeti/:id", auth, asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return fail(res, 400, "Neispravan ID.");

  let p;

  try {
    p = normalize(req.body);
  } catch (err) {
    return fail(res, 400, err.message);
  }

  const assignments = columns
    .map((c, i) => `${c}=$${i + 1}`)
    .join(",");

  const result = await pool.query(
    `UPDATE rokovnik_v2_predmeti
     SET ${assignments}, updated_at=NOW()
     WHERE id=$${columns.length + 1}
       AND user_id=$${columns.length + 2}
     RETURNING id`,
    [...columns.map(c => p[c]), id, req.user.id]
  );

  if (!result.rows.length) {
    return fail(res, 404, "Predmet nije pronađen.");
  }

  res.json({ success: true });
}));

app.delete("/api/predmeti/:id", auth, asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return fail(res, 400, "Neispravan ID.");

  const result = await pool.query(
    `DELETE FROM rokovnik_v2_predmeti
     WHERE id=$1 AND user_id=$2
     RETURNING id`,
    [id, req.user.id]
  );

  if (!result.rows.length) {
    return fail(res, 404, "Predmet nije pronađen.");
  }

  res.json({ success: true });
}));

// DOKUMENTI

app.get(
  "/api/predmeti/:id/prilozi",
  auth,
  asyncRoute(async (req, res) => {
    const id = validId(req.params.id);
    if (!id) return fail(res, 400, "Neispravan ID.");

    const result = await pool.query(
      `SELECT d.id, d.naziv, d.mime_type,
              octet_length(d.sadrzaj) AS velicina,
              d.created_at
       FROM rokovnik_v2_prilozi d
       JOIN rokovnik_v2_predmeti p
         ON p.id=d.predmet_id
       WHERE p.id=$1 AND p.user_id=$2
       ORDER BY d.id DESC`,
      [id, req.user.id]
    );

    res.json(result.rows);
  })
);

app.post(
  "/api/predmeti/:id/prilozi",
  auth,
  asyncRoute(async (req, res) => {
    const id = validId(req.params.id);
    if (!id) return fail(res, 400, "Neispravan ID.");

    const { naziv, mime_type, data_base64 } = req.body || {};

    if (
      typeof naziv !== "string" ||
      !naziv.trim() ||
      naziv.length > 200 ||
      typeof mime_type !== "string" ||
      typeof data_base64 !== "string"
    ) {
      return fail(res, 400, "Neispravan dokument.");
    }

    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowed.includes(mime_type)) {
      return fail(res, 400, "Dozvoljeni su PDF, JPG, PNG i WEBP.");
    }

    const raw = data_base64.replace(/^data:[^,]+,/, "");

    if (
      !/^[A-Za-z0-9+/]*={0,2}$/.test(raw) ||
      raw.length % 4 === 1
    ) {
      return fail(res, 400, "Neispravan format dokumenta.");
    }

    const bytes = Buffer.from(raw, "base64");

    if (!bytes.length || bytes.length > 7 * 1024 * 1024) {
      return fail(res, 400, "Dokument mora biti do 7 MB.");
    }

    const pdf = bytes.subarray(0, 5).toString() === "%PDF-";

    const jpg =
      bytes.length >= 3 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255;

    const png = bytes.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );

    const webp =
      bytes.subarray(0, 4).toString() === "RIFF" &&
      bytes.subarray(8, 12).toString() === "WEBP";

    const validType = {
      "application/pdf": pdf,
      "image/jpeg": jpg,
      "image/png": png,
      "image/webp": webp
    };

    if (!validType[mime_type]) {
      return fail(res, 400, "Sadržaj dokumenta nije ispravan.");
    }

    const exists = await pool.query(
      `SELECT id FROM rokovnik_v2_predmeti
       WHERE id=$1 AND user_id=$2`,
      [id, req.user.id]
    );

    if (!exists.rows.length) {
      return fail(res, 404, "Predmet nije pronađen.");
    }

    const result = await pool.query(
      `INSERT INTO rokovnik_v2_prilozi
       (predmet_id, naziv, mime_type, sadrzaj)
       VALUES ($1,$2,$3,$4)
       RETURNING id`,
      [id, naziv.trim(), mime_type, bytes]
    );

    res.status(201).json({
      success: true,
      id: result.rows[0].id
    });
  })
);

app.get("/api/prilozi/:id", auth, asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return fail(res, 400, "Neispravan ID.");

  const result = await pool.query(
    `SELECT d.naziv, d.mime_type, d.sadrzaj
     FROM rokovnik_v2_prilozi d
     JOIN rokovnik_v2_predmeti p
       ON p.id=d.predmet_id
     WHERE d.id=$1 AND p.user_id=$2`,
    [id, req.user.id]
  );

  if (!result.rows.length) {
    return fail(res, 404, "Dokument nije pronađen.");
  }

  const file = result.rows[0];

  res.set("Content-Type", file.mime_type);
  res.set(
    "Content-Disposition",
    `attachment; filename="prilog-${id}"`
  );
  res.set("X-Content-Type-Options", "nosniff");
  res.send(file.sadrzaj);
}));

app.delete("/api/prilozi/:id", auth, asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return fail(res, 400, "Neispravan ID.");

  const result = await pool.query(
    `DELETE FROM rokovnik_v2_prilozi d
     USING rokovnik_v2_predmeti p
     WHERE d.id=$1
       AND d.predmet_id=p.id
       AND p.user_id=$2
     RETURNING d.id`,
    [id, req.user.id]
  );

  if (!result.rows.length) {
    return fail(res, 404, "Dokument nije pronađen.");
  }

  res.json({ success: true });
}));

// ANALITIKA SAMO ZA KORISNIKA

app.get("/api/analitika", auth, asyncRoute(async (req, res) => {
  const result = await pool.query(
    `SELECT
       COUNT(*)::int AS ukupno,
       COUNT(*) FILTER (
         WHERE status='U radu'
       )::int AS u_radu,
       COUNT(*) FILTER (
         WHERE rok_datum < CURRENT_DATE
           AND status <> 'Završeno / Odobreno'
       )::int AS isteklo,
       COUNT(*) FILTER (
         WHERE status='Završeno / Odobreno'
       )::int AS zavrseno
     FROM rokovnik_v2_predmeti
     WHERE user_id=$1`,
    [req.user.id]
  );

  res.json(result.rows[0]);
}));

app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  if (!res.headersSent) {
    fail(res, 500, "Greška na serveru.");
  }
});

init()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(
        "Univerzalni Rokovnik Pro 2.0 radi na portu " + PORT
      );
    });
  })
  .catch(err => {
    console.error("Pokretanje nije uspelo:", err.message);
    process.exit(1);
  });
