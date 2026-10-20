
"use strict";

const express = require("express");
const { Pool } = require("pg");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 5000);
const secret = process.env.SESSION_SECRET;

if (!process.env.DATABASE_URL) {
  throw new Error("Nedostaje DATABASE_URL.");
}

if (!secret || secret.length < 32) {
  throw new Error("SESSION_SECRET mora imati najmanje 32 karaktera.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "require"
    ? { rejectUnauthorized: true }
    : undefined
});

app.disable("x-powered-by");
app.use(express.json({ limit: "10mb" }));
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

const dates = new Set(["datum_prijema", "rok_datum"]);

const selectColumns = `
  id,
  ${columns.map(c =>
    dates.has(c) ? `${c}::text AS ${c}` : c
  ).join(", ")},
  created_at,
  updated_at
`;

function error(res, status, message) {
  return res.status(status).json({ error: message });
}

function idOf(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function normalize(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Neispravan zahtev.");
  }

  const p = {};

  for (const key of columns) {
    let v = body[key];

    if (v == null) v = "";

    if (typeof v !== "string") {
      throw new Error(`Neispravno polje: ${key}`);
    }

    v = v.trim();

    if (dates.has(key)) {
      if (v) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          throw new Error(`Neispravan datum: ${key}`);
        }

        const d = new Date(v + "T00:00:00Z");

        if (
          Number.isNaN(d.getTime()) ||
          d.toISOString().slice(0, 10) !== v
        ) {
          throw new Error(`Neispravan datum: ${key}`);
        }
      }

      p[key] = v || null;
    } else {
      const max = key === "napomena" ? 20000 : 500;

      if (v.length > max) {
        throw new Error(`Predugačko polje: ${key}`);
      }

      p[key] = v;
    }
  }

  if (!p.interni_broj || !p.naziv_predmeta) {
    throw new Error("Broj i naziv predmeta su obavezni.");
  }

  if (!p.datum_prijema) {
    throw new Error("Datum prijema je obavezan.");
  }

  if (!p.status) p.status = "U radu";

  return p;
}

function hash(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function equal(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);

  return x.length === y.length &&
    crypto.timingSafeEqual(x, y);
}

function sign(payload) {
  const data = Buffer.from(
    JSON.stringify(payload)
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64url");

  return `${data}.${signature}`;
}

function verify(token) {
  if (typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(parts[0])
    .digest("base64url");

  if (!equal(parts[1], expected)) return null;

  try {
    const data = JSON.parse(
      Buffer.from(parts[0], "base64url").toString()
    );

    if (
      !data.id ||
      !Number.isFinite(data.exp) ||
      data.exp <= Date.now()
    ) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

function route(fn) {
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
      return error(res, 401, "Potrebna je prijava.");
    }

    const session = verify(header.slice(7));

    if (!session) {
      return error(res, 401, "Sesija je istekla.");
    }

    const result = await pool.query(
      "SELECT id, username FROM rokovnik_v2_users WHERE id=$1",
      [session.id]
    );

    if (!result.rows.length) {
      return error(res, 401, "Korisnik nije pronađen.");
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rokovnik_v2_prilozi (
      id BIGSERIAL PRIMARY KEY,
      predmet_id BIGINT NOT NULL
        REFERENCES rokovnik_v2_predmeti(id)
        ON DELETE CASCADE,
      naziv TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      sadrzaj BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS rokovnik_v2_rok_idx
      ON rokovnik_v2_predmeti(rok_datum);
  `);

  const result = await pool.query(
    "SELECT COUNT(*)::int AS broj FROM rokovnik_v2_users"
  );

  if (result.rows[0].broj === 0) {
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
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      ["admin", hash(password, salt), salt]
    );
  }

  console.log("PostgreSQL baza Rokovnika 2.0 je spremna.");
}

// PROVERA SERVERA

app.get("/api/health", route(async (req, res) => {
  await pool.query("SELECT 1");

  res.json({
    ok: true,
    app: "Univerzalni Rokovnik Pro 2.0"
  });
}));

// PRIJAVA

app.post("/api/login", route(async (req, res) => {
  const { username, password } = req.body || {};

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username.length > 100 ||
    password.length > 1000
  ) {
    return error(res, 400, "Neispravni podaci.");
  }

  const result = await pool.query(
    "SELECT * FROM rokovnik_v2_users WHERE username=$1",
    [username]
  );

  const user = result.rows[0];

  if (
    !user ||
    !equal(hash(password, user.password_salt), user.password_hash)
  ) {
    return error(res, 401, "Pogrešno korisničko ime ili lozinka.");
  }

  const token = sign({
    id: user.id,
    exp: Date.now() + 12 * 3600000
  });

  res.json({
    success: true,
    token,
    username: user.username
  });
}));

app.get("/api/me", auth, (req, res) => {
  res.json({ user: req.user });
});

// REGISTAR PREDMETA

app.get("/api/predmeti", auth, route(async (req, res) => {
  const result = await pool.query(
    `SELECT ${selectColumns}
     FROM rokovnik_v2_predmeti
     ORDER BY created_at DESC, id DESC`
  );

  res.json(result.rows);
}));

app.get("/api/predmeti/:id", auth, route(async (req, res) => {
  const id = idOf(req.params.id);

  if (!id) return error(res, 400, "Neispravan ID.");

  const result = await pool.query(
    `SELECT ${selectColumns}
     FROM rokovnik_v2_predmeti
     WHERE id=$1`,
    [id]
  );

  if (!result.rows.length) {
    return error(res, 404, "Predmet nije pronađen.");
  }

  res.json(result.rows[0]);
}));

// NOVI PREDMET

app.post("/api/predmeti", auth, route(async (req, res) => {
  let p;

  try {
    p = normalize(req.body);
  } catch (err) {
    return error(res, 400, err.message);
  }

  const values = columns.map(c => p[c]);
  const placeholders = columns
    .map((_, i) => `$${i + 1}`)
    .join(",");

  const result = await pool.query(
    `INSERT INTO rokovnik_v2_predmeti
     (${columns.join(",")})
     VALUES (${placeholders})
     RETURNING id`,
    values
  );

  res.status(201).json({
    success: true,
    id: result.rows[0].id
  });
}));

// IZMENA PREDMETA

app.put("/api/predmeti/:id", auth, route(async (req, res) => {
  const id = idOf(req.params.id);

  if (!id) return error(res, 400, "Neispravan ID.");

  let p;

  try {
    p = normalize(req.body);
  } catch (err) {
    return error(res, 400, err.message);
  }

  const assignments = columns
    .map((c, i) => `${c}=$${i + 1}`)
    .join(",");

  const values = [
    ...columns.map(c => p[c]),
    id
  ];

  const result = await pool.query(
    `UPDATE rokovnik_v2_predmeti
     SET ${assignments}, updated_at=NOW()
     WHERE id=$${columns.length + 1}
     RETURNING id`,
    values
  );

  if (!result.rows.length) {
    return error(res, 404, "Predmet nije pronađen.");
  }

  res.json({ success: true });
}));

// BRISANJE PREDMETA

app.delete("/api/predmeti/:id", auth, route(async (req, res) => {
  const id = idOf(req.params.id);

  if (!id) return error(res, 400, "Neispravan ID.");

  const result = await pool.query(
    `DELETE FROM rokovnik_v2_predmeti
     WHERE id=$1 RETURNING id`,
    [id]
  );

  if (!result.rows.length) {
    return error(res, 404, "Predmet nije pronađen.");
  }

  res.json({ success: true });
}));

// SPISAK DOKUMENATA

app.get(
  "/api/predmeti/:id/prilozi",
  auth,
  route(async (req, res) => {
    const id = idOf(req.params.id);

    if (!id) return error(res, 400, "Neispravan ID.");

    const result = await pool.query(
      `SELECT id, naziv, mime_type,
       octet_length(sadrzaj) AS velicina,
       created_at
       FROM rokovnik_v2_prilozi
       WHERE predmet_id=$1
       ORDER BY id DESC`,
      [id]
    );

    res.json(result.rows);
  })
);

// DODAVANJE DOKUMENTA

app.post(
  "/api/predmeti/:id/prilozi",
  auth,
  route(async (req, res) => {
    const id = idOf(req.params.id);

    if (!id) return error(res, 400, "Neispravan ID.");

    const { naziv, mime_type, data_base64 } = req.body || {};

    if (
      typeof naziv !== "string" ||
      !naziv.trim() ||
      naziv.length > 200 ||
      typeof mime_type !== "string" ||
      typeof data_base64 !== "string"
    ) {
      return error(res, 400, "Neispravan prilog.");
    }

    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowed.includes(mime_type)) {
      return error(
        res, 400,
        "Dozvoljeni su PDF, JPG, PNG i WEBP."
      );
    }

    const raw = data_base64.replace(
      /^data:[^,]+,/,
      ""
    );

    if (
      !/^[A-Za-z0-9+/]*={0,2}$/.test(raw) ||
      raw.length % 4 === 1
    ) {
      return error(res, 400, "Neispravan format dokumenta.");
    }

    const bytes = Buffer.from(raw, "base64");

    if (!bytes.length || bytes.length > 7 * 1024 * 1024) {
      return error(
        res, 400,
        "Dokument mora biti manji od 7 MB."
      );
    }

    const pdf =
      bytes.subarray(0, 5).toString() === "%PDF-";

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
      return error(
        res, 400,
        "Sadržaj ne odgovara tipu dokumenta."
      );
    }

    const exists = await pool.query(
      "SELECT id FROM rokovnik_v2_predmeti WHERE id=$1",
      [id]
    );

    if (!exists.rows.length) {
      return error(res, 404, "Predmet nije pronađen.");
    }

    const result = await pool.query(
      `INSERT INTO rokovnik_v2_prilozi
       (predmet_id, naziv, mime_type, sadrzaj)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [id, naziv.trim(), mime_type, bytes]
    );

    res.status(201).json({
      success: true,
      id: result.rows[0].id
    });
  })
);

// PREUZIMANJE DOKUMENTA

app.get("/api/prilozi/:id", auth, route(async (req, res) => {
  const id = idOf(req.params.id);

  if (!id) return error(res, 400, "Neispravan ID.");

  const result = await pool.query(
    `SELECT naziv, mime_type, sadrzaj
     FROM rokovnik_v2_prilozi
     WHERE id=$1`,
    [id]
  );

  if (!result.rows.length) {
    return error(res, 404, "Prilog nije pronađen.");
  }

  const f = result.rows[0];

  res.set("Content-Type", f.mime_type);
  res.set(
    "Content-Disposition",
    `attachment; filename="prilog-${id}"`
  );
  res.set("X-Content-Type-Options", "nosniff");
  res.send(f.sadrzaj);
}));

// BRISANJE DOKUMENTA

app.delete("/api/prilozi/:id", auth, route(async (req, res) => {
  const id = idOf(req.params.id);

  if (!id) return error(res, 400, "Neispravan ID.");

  const result = await pool.query(
    `DELETE FROM rokovnik_v2_prilozi
     WHERE id=$1 RETURNING id`,
    [id]
  );

  if (!result.rows.length) {
    return error(res, 404, "Prilog nije pronađen.");
  }

  res.json({ success: true });
}));

// ANALITIKA

app.get("/api/analitika", auth, route(async (req, res) => {
  const result = await pool.query(`
    SELECT
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
  `);

  res.json(result.rows[0]);
}));

// OBRADA GREŠAKA

app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  if (!res.headersSent) {
    error(res, 500, "Greška na serveru.");
  }
});

// POKRETANJE

init()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(
        `Univerzalni Rokovnik Pro 2.0 radi na portu ${PORT}`
      );
    });
  })
  .catch(err => {
    console.error(
      "Pokretanje nije uspelo:",
      err.message
    );
    process.exit(1);
  });
