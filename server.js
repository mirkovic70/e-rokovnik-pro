
"use strict";

const express = require("express");
const { Pool } = require("pg");
const crypto = require("crypto");
const path = require("path");
const nodemailer = require("nodemailer");

const app = express();
const PORT = Number(process.env.PORT || 5000);
const SECRET = process.env.SESSION_SECRET;

if (!process.env.DATABASE_URL) {
  throw new Error("Nedostaje DATABASE_URL.");
}

if (!SECRET || SECRET.length < 32) {
  throw new Error(
    "SESSION_SECRET mora imati najmanje 32 karaktera."
  );
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

const labels = {
  vrsta_predmeta: "Vrsta predmeta",
  interni_broj: "Broj predmeta",
  naziv_predmeta: "Naziv predmeta",
  investor: "Stranka / investitor",
  obradjivac: "Obrađivač",
  potpisnik: "Potpisnik",
  datum_prijema: "Datum prijema",
  rok_datum: "Rok",
  status: "Status",
  napomena: "Napomena",
  ceop_broj: "CEOP broj",
  rop_broj: "ROP broj",
  opstina: "Opština",
  katastarska_opstina: "Katastarska opština",
  broj_parcele: "Broj parcele",
  nadlezni_organ: "Nadležni organ"
};

const dateFields = new Set([
  "datum_prijema",
  "rok_datum"
]);

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
  return res.status(status).json({
    error: message
  });
}

function validId(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0
    ? n
    : null;
}

function normalize(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
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
          throw new Error(
            "Neispravan datum: " + key
          );
        }

        const date = new Date(
          value + "T00:00:00Z"
        );

        if (
          Number.isNaN(date.getTime()) ||
          date.toISOString().slice(0, 10) !== value
        ) {
          throw new Error(
            "Neispravan datum: " + key
          );
        }
      }

      result[key] = value || null;
    } else {
      const limit =
        key === "napomena" ? 20000 : 500;

      if (value.length > limit) {
        throw new Error(
          "Predugačko polje: " + key
        );
      }

      result[key] = value;
    }
  }

  if (
    !result.interni_broj ||
    !result.naziv_predmeta
  ) {
    throw new Error(
      "Broj i naziv predmeta su obavezni."
    );
  }

  if (!result.datum_prijema) {
    throw new Error(
      "Datum prijema je obavezan."
    );
  }

  if (!result.status) {
    result.status = "U radu";
  }

  return result;
}

function passwordHash(password, salt) {
  return crypto
    .scryptSync(password, salt, 64)
    .toString("hex");
}

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);

  return (
    x.length === y.length &&
    crypto.timingSafeEqual(x, y)
  );
}

function createToken(user) {
  const payload = Buffer.from(
    JSON.stringify({
      id: user.id,
      exp: Date.now() + 12 * 60 * 60 * 1000
    })
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("base64url");

  return payload + "." + signature;
}

function verifyToken(token) {
  if (typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const expected = crypto
    .createHmac("sha256", SECRET)
    .update(parts[0])
    .digest("base64url");

  if (!safeEqual(parts[1], expected)) {
    return null;
  }

  try {
    const data = JSON.parse(
      Buffer.from(
        parts[0],
        "base64url"
      ).toString()
    );

    if (
      !validId(data.id) ||
      data.exp <= Date.now()
    ) {
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
    const header =
      req.get("authorization") || "";

    if (!header.startsWith("Bearer ")) {
      return fail(
        res,
        401,
        "Potrebna je prijava."
      );
    }

    const session = verifyToken(
      header.slice(7)
    );

    if (!session) {
      return fail(
        res,
        401,
        "Sesija je istekla."
      );
    }

    const result = await pool.query(
      `SELECT id, username
       FROM rokovnik_v2_users
       WHERE id=$1`,
      [session.id]
    );

    if (!result.rows.length) {
      return fail(
        res,
        401,
        "Korisnik ne postoji."
      );
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

// ============================================
// TRANSAKCIJE I ISTORIJA
// ============================================

async function transaction(fn) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await fn(client);

    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function addHistory(
  client,
  user,
  predmetId,
  action,
  description,
  changes = []
) {
  await client.query(
    `INSERT INTO rokovnik_v2_istorija
      (
        predmet_id,
        user_id,
        username,
        akcija,
        opis,
        promene
      )
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [
      predmetId,
      user.id,
      user.username,
      action,
      description,
      JSON.stringify(changes)
    ]
  );
}

function calculateChanges(before, after) {
  const changes = [];

  for (const key of columns) {
    const oldValue =
      before[key] == null
        ? ""
        : String(before[key]);

    const newValue =
      after[key] == null
        ? ""
        : String(after[key]);

    if (oldValue !== newValue) {
      changes.push({
        polje: key,
        naziv_polja: labels[key],
        stara_vrednost: oldValue,
        nova_vrednost: newValue
      });
    }
  }

  return changes;
}

async function ownedCase(
  client,
  id,
  userId,
  lock = false
) {
  const result = await client.query(
    `SELECT
       ${columns.map(c =>
         dateFields.has(c)
           ? `${c}::text AS ${c}`
           : c
       ).join(", ")},
       id
     FROM rokovnik_v2_predmeti
     WHERE id=$1 AND user_id=$2
     ${lock ? "FOR UPDATE" : ""}`,
    [id, userId]
  );

  return result.rows[0] || null;
}

// ============================================
// FAZA 3 - VALIDACIJA AKTIVNOSTI
// ============================================

const activityTypes = new Set([
  "Službena beleška", "Telefonski razgovor", "Sastanak",
  "Dopis", "Postupanje", "Drugo"
]);

function activityInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Neispravni podaci aktivnosti.");
  }
  const fields = ["vrsta", "datum_aktivnosti", "odgovorno_lice", "opis", "sledeci_korak", "rok_sledeceg_koraka"];
  const data = {};
  for (const field of fields) {
    const value = body[field] == null ? "" : body[field];
    if (typeof value !== "string") throw new Error("Neispravno polje: " + field);
    data[field] = value.trim();
  }
  if (!activityTypes.has(data.vrsta)) throw new Error("Nepoznata vrsta aktivnosti.");
  if (!data.opis || data.opis.length > 10000) throw new Error("Opis je obavezan (do 10000 znakova).");
  if (data.odgovorno_lice.length > 200 || data.sledeci_korak.length > 5000) {
    throw new Error("Predugačko polje aktivnosti.");
  }
  for (const key of ["datum_aktivnosti", "rok_sledeceg_koraka"]) {
    const value = data[key];
    if (key === "datum_aktivnosti" && !value) throw new Error("Datum aktivnosti je obavezan.");
    if (value) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Neispravan datum: " + key);
      const d = new Date(value + "T00:00:00Z");
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
        throw new Error("Neispravan datum: " + key);
      }
    }
  }
  data.rok_sledeceg_koraka ||= null;
  return data;
}

const activityFields = ["vrsta", "datum_aktivnosti", "odgovorno_lice", "opis", "sledeci_korak", "rok_sledeceg_koraka"];
const activityLabels = {
  vrsta: "Vrsta aktivnosti", datum_aktivnosti: "Datum aktivnosti",
  odgovorno_lice: "Odgovorno lice", opis: "Opis",
  sledeci_korak: "Sledeći korak", rok_sledeceg_koraka: "Rok sledećeg koraka"
};
const activitySelect = `a.id, a.predmet_id, a.vrsta,
  a.datum_aktivnosti::text AS datum_aktivnosti, a.odgovorno_lice,
  a.opis, a.sledeci_korak,
  a.rok_sledeceg_koraka::text AS rok_sledeceg_koraka,
  a.created_by, a.created_by_username, a.created_at, a.updated_at`;

// ============================================
// INICIJALIZACIJA BAZE
// ============================================

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

  // Nova tabela. Postojeće tabele se ne brišu.
  // Namerno nema FK ka predmetu:
  // zapis o brisanju mora ostati sačuvan.

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rokovnik_v2_istorija (
      id BIGSERIAL PRIMARY KEY,
      predmet_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      username TEXT NOT NULL,
      akcija TEXT NOT NULL,
      opis TEXT NOT NULL,
      promene JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS rokovnik_v2_user_idx
      ON rokovnik_v2_predmeti(user_id);

    CREATE INDEX IF NOT EXISTS rokovnik_v2_rok_idx
      ON rokovnik_v2_predmeti(rok_datum);

    CREATE INDEX IF NOT EXISTS rokovnik_v2_istorija_idx
      ON rokovnik_v2_istorija
      (predmet_id, user_id, created_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rokovnik_v2_aktivnosti (
      id BIGSERIAL PRIMARY KEY,
      predmet_id BIGINT NOT NULL REFERENCES rokovnik_v2_predmeti(id) ON DELETE CASCADE,
      vrsta TEXT NOT NULL,
      datum_aktivnosti DATE NOT NULL,
      odgovorno_lice TEXT NOT NULL DEFAULT '',
      opis TEXT NOT NULL,
      sledeci_korak TEXT NOT NULL DEFAULT '',
      rok_sledeceg_koraka DATE,
      created_by BIGINT NOT NULL,
      created_by_username TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS rokovnik_v2_aktivnosti_predmet_idx
      ON rokovnik_v2_aktivnosti(predmet_id, datum_aktivnosti DESC, id DESC);
  `);

  const count = await pool.query(
    `SELECT COUNT(*)::int AS broj
     FROM rokovnik_v2_users`
  );

  if (count.rows[0].broj === 0) {
    const password =
      process.env.ADMIN_PASSWORD;

    if (
      !password ||
      password.length < 12
    ) {
      throw new Error(
        "Podesi ADMIN_PASSWORD od najmanje 12 karaktera."
      );
    }

    const salt = crypto
      .randomBytes(24)
      .toString("hex");

    await pool.query(
      `INSERT INTO rokovnik_v2_users
       (username, password_hash, password_salt)
       VALUES ($1,$2,$3)`,
      [
        "admin",
        passwordHash(password, salt),
        salt
      ]
    );
  }

  console.log(
    "Rokovnik Pro 2.0 i istorija su spremni."
  );
}

// ============================================
// OSNOVNI API
// ============================================

app.get(
  "/api/health",
  asyncRoute(async (req, res) => {
    await pool.query("SELECT 1");

    res.json({
      ok: true,
      app: "Rokovnik Pro 2.0",
      istorija: true,
      aktivnosti: true,
      rokovi: true,
      gmail: true
    });
  })
);

app.post(
  "/api/login",
  asyncRoute(async (req, res) => {
    const { username, password } =
      req.body || {};

    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      username.length > 100 ||
      password.length > 1000
    ) {
      return fail(
        res,
        400,
        "Neispravni podaci."
      );
    }

    const result = await pool.query(
      `SELECT *
       FROM rokovnik_v2_users
       WHERE username=$1`,
      [username.trim()]
    );

    const user = result.rows[0];

    if (
      !user ||
      !safeEqual(
        passwordHash(
          password,
          user.password_salt
        ),
        user.password_hash
      )
    ) {
      return fail(
        res,
        401,
        "Pogrešno korisničko ime ili lozinka."
      );
    }

    res.json({
      success: true,
      token: createToken(user),
      username: user.username
    });
  })
);

app.get("/api/me", auth, (req, res) => {
  res.json({ user: req.user });
});

// ============================================
// KORISNICI
// ============================================

app.post(
  "/api/users",
  auth,
  asyncRoute(async (req, res) => {
    if (req.user.username !== "admin") {
      return fail(
        res,
        403,
        "Samo administrator dodaje korisnike."
      );
    }

    const { username, password } =
      req.body || {};

    if (
      typeof username !== "string" ||
      !/^[a-zA-Z0-9_.-]{3,50}$/.test(username)
    ) {
      return fail(
        res,
        400,
        "Neispravno korisničko ime."
      );
    }

    if (
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 1000
    ) {
      return fail(
        res,
        400,
        "Lozinka mora imati najmanje 12 karaktera."
      );
    }

    const salt = crypto
      .randomBytes(24)
      .toString("hex");

    try {
      const result = await pool.query(
        `INSERT INTO rokovnik_v2_users
         (username, password_hash, password_salt)
         VALUES ($1,$2,$3)
         RETURNING id, username`,
        [
          username,
          passwordHash(password, salt),
          salt
        ]
      );

      res.status(201).json({
        success: true,
        user: result.rows[0]
      });
    } catch (err) {
      if (err.code === "23505") {
        return fail(
          res,
          409,
          "Korisničko ime već postoji."
        );
      }

      throw err;
    }
  })
);

app.get(
  "/api/users",
  auth,
  asyncRoute(async (req, res) => {
    if (req.user.username !== "admin") {
      return fail(
        res,
        403,
        "Pristup nije dozvoljen."
      );
    }

    const result = await pool.query(
      `SELECT id, username, created_at
       FROM rokovnik_v2_users
       ORDER BY username`
    );

    res.json(result.rows);
  })
);

// ============================================
// PREDMETI
// ============================================

app.get(
  "/api/predmeti",
  auth,
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT ${selectColumns}
       FROM rokovnik_v2_predmeti p
       WHERE p.user_id=$1
       ORDER BY p.created_at DESC, p.id DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  })
);

app.get(
  "/api/predmeti/:id",
  auth,
  asyncRoute(async (req, res) => {
    const id = validId(req.params.id);

    if (!id) {
      return fail(
        res,
        400,
        "Neispravan ID."
      );
    }

    const result = await pool.query(
      `SELECT ${selectColumns}
       FROM rokovnik_v2_predmeti p
       WHERE p.id=$1 AND p.user_id=$2`,
      [id, req.user.id]
    );

    if (!result.rows.length) {
      return fail(
        res,
        404,
        "Predmet nije pronađen."
      );
    }

    res.json(result.rows[0]);
  })
);

// ============================================
// NOVI PREDMET + ISTORIJA
// ============================================

app.post(
  "/api/predmeti",
  auth,
  asyncRoute(async (req, res) => {
    let p;

    try {
      p = normalize(req.body);
    } catch (err) {
      return fail(
        res,
        400,
        err.message
      );
    }

    const id = await transaction(
      async client => {
        const values = [
          ...columns.map(c => p[c]),
          req.user.id
        ];

        const placeholders = values
          .map((_, i) => "$" + (i + 1))
          .join(",");

        const result = await client.query(
          `INSERT INTO rokovnik_v2_predmeti
           (${columns.join(",")}, user_id)
           VALUES (${placeholders})
           RETURNING id`,
          values
        );

        const predmetId = result.rows[0].id;

        await addHistory(
          client,
          req.user,
          predmetId,
          "KREIRANJE",
          "Kreiran je novi predmet.",
          []
        );

        return predmetId;
      }
    );

    res.status(201).json({
      success: true,
      id
    });
  })
);

// ============================================
// IZMENA PREDMETA + ISTORIJA
// ============================================

app.put(
  "/api/predmeti/:id",
  auth,
  asyncRoute(async (req, res) => {
    const id = validId(req.params.id);

    if (!id) {
      return fail(
        res,
        400,
        "Neispravan ID."
      );
    }

    let p;

    try {
      p = normalize(req.body);
    } catch (err) {
      return fail(
        res,
        400,
        err.message
      );
    }

    const result = await transaction(
      async client => {
        const before = await ownedCase(
          client,
          id,
          req.user.id,
          true
        );

        if (!before) {
          return null;
        }

        const changes = calculateChanges(
          before,
          p
        );

        if (!changes.length) {
          return {
            changed: false
          };
        }

        const assignments = columns
          .map((c, i) => `${c}=$${i + 1}`)
          .join(",");

        await client.query(
          `UPDATE rokovnik_v2_predmeti
           SET ${assignments},
               updated_at=NOW()
           WHERE id=$${columns.length + 1}
             AND user_id=$${columns.length + 2}`,
          [
            ...columns.map(c => p[c]),
            id,
            req.user.id
          ]
        );

        const changedNames = changes
          .map(c => c.naziv_polja)
          .join(", ");

        await addHistory(
          client,
          req.user,
          id,
          "IZMENA",
          "Izmenjena polja: " + changedNames,
          changes
        );

        return {
          changed: true,
          changes: changes.length
        };
      }
    );

    if (!result) {
      return fail(
        res,
        404,
        "Predmet nije pronađen."
      );
    }

    res.json({
      success: true,
      ...result
    });
  })
);

// ============================================
// BRISANJE PREDMETA + ISTORIJA
// ============================================

app.delete(
  "/api/predmeti/:id",
  auth,
  asyncRoute(async (req, res) => {
    const id = validId(req.params.id);

    if (!id) {
      return fail(
        res,
        400,
        "Neispravan ID."
      );
    }

    const deleted = await transaction(
      async client => {
        const predmet = await ownedCase(
          client,
          id,
          req.user.id,
          true
        );

        if (!predmet) {
          return false;
        }

        await addHistory(
          client,
          req.user,
          id,
          "BRISANJE",
          `Obrisan predmet: ${predmet.interni_broj} — ${predmet.naziv_predmeta}`,
          []
        );

        await client.query(
          `DELETE FROM rokovnik_v2_predmeti
           WHERE id=$1 AND user_id=$2`,
          [id, req.user.id]
        );

        return true;
      }
    );

    if (!deleted) {
      return fail(
        res,
        404,
        "Predmet nije pronađen."
      );
    }

    res.json({
      success: true
    });
  })
);

// ============================================
// NOVI API - ISTORIJA PREDMETA
// ============================================

app.get(
  "/api/predmeti/:id/istorija",
  auth,
  asyncRoute(async (req, res) => {
    const id = validId(req.params.id);

    if (!id) {
      return fail(
        res,
        400,
        "Neispravan ID."
      );
    }

    const exists = await pool.query(
      `SELECT id
       FROM rokovnik_v2_predmeti
       WHERE id=$1 AND user_id=$2`,
      [id, req.user.id]
    );

    if (!exists.rows.length) {
      return fail(
        res,
        404,
        "Predmet nije pronađen."
      );
    }

    const result = await pool.query(
      `SELECT
         id,
         predmet_id,
         username,
         akcija,
         opis,
         promene,
         created_at
       FROM rokovnik_v2_istorija
       WHERE predmet_id=$1 AND user_id=$2
       ORDER BY created_at DESC, id DESC`,
      [id, req.user.id]
    );

    res.json(result.rows);
  })
);

// ============================================
// FAZA 3 - TOK POSTUPANJA / SLUŽBENE BELEŠKE
// ============================================

app.get("/api/predmeti/:id/aktivnosti", auth, asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return fail(res, 400, "Neispravan ID predmeta.");
  const exists = await pool.query(
    "SELECT id FROM rokovnik_v2_predmeti WHERE id=$1 AND user_id=$2",
    [id, req.user.id]
  );
  if (!exists.rows.length) return fail(res, 404, "Predmet nije pronađen.");
  const result = await pool.query(
    `SELECT ${activitySelect} FROM rokovnik_v2_aktivnosti a
     WHERE a.predmet_id=$1 ORDER BY a.datum_aktivnosti DESC, a.id DESC`,
    [id]
  );
  res.json(result.rows);
}));

app.post("/api/predmeti/:id/aktivnosti", auth, asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return fail(res, 400, "Neispravan ID predmeta.");
  let data;
  try { data = activityInput(req.body); }
  catch (err) { return fail(res, 400, err.message); }
  const result = await transaction(async client => {
    const predmet = await ownedCase(client, id, req.user.id, true);
    if (!predmet) return null;
    const inserted = await client.query(
      `INSERT INTO rokovnik_v2_aktivnosti
       (predmet_id, ${activityFields.join(",")}, created_by, created_by_username)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [id, ...activityFields.map(f => data[f]), req.user.id, req.user.username]
    );
    const activityId = inserted.rows[0].id;
    await addHistory(client, req.user, id, "DODATA_AKTIVNOST",
      `Dodata aktivnost #${activityId}: ${data.vrsta}`,
      activityFields.map(f => ({ polje: f, naziv_polja: activityLabels[f], stara_vrednost: "", nova_vrednost: data[f] || "" })));
    return activityId;
  });
  if (!result) return fail(res, 404, "Predmet nije pronađen.");
  res.status(201).json({ success: true, id: result });
}));

app.put("/api/aktivnosti/:id", auth, asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return fail(res, 400, "Neispravan ID aktivnosti.");
  let data;
  try { data = activityInput(req.body); }
  catch (err) { return fail(res, 400, err.message); }
  const result = await transaction(async client => {
    const found = await client.query(
      `SELECT a.*, a.datum_aktivnosti::text AS datum_aktivnosti_text,
              a.rok_sledeceg_koraka::text AS rok_sledeceg_koraka_text
       FROM rokovnik_v2_aktivnosti a
       JOIN rokovnik_v2_predmeti p ON p.id=a.predmet_id
       WHERE a.id=$1 AND p.user_id=$2 FOR UPDATE OF p, a`,
      [id, req.user.id]
    );
    if (!found.rows.length) return null;
    const before = found.rows[0];
    const changes = activityFields.flatMap(f => {
      const oldValue = f === "datum_aktivnosti" ? before.datum_aktivnosti_text
        : f === "rok_sledeceg_koraka" ? before.rok_sledeceg_koraka_text : before[f];
      const oldText = String(oldValue ?? "");
      const newText = String(data[f] ?? "");
      return oldText === newText ? [] : [{
        polje: f, naziv_polja: activityLabels[f],
        stara_vrednost: oldText, nova_vrednost: newText
      }];
    });
    if (!changes.length) return { changed: false };
    await client.query(
      `UPDATE rokovnik_v2_aktivnosti SET
       ${activityFields.map((f, i) => `${f}=$${i + 1}`).join(",")}, updated_at=NOW()
       WHERE id=$${activityFields.length + 1}`,
      [...activityFields.map(f => data[f]), id]
    );
    await addHistory(client, req.user, before.predmet_id, "IZMENA_AKTIVNOSTI",
      `Izmenjena aktivnost #${id}: ${data.vrsta}`, changes);
    return { changed: true, changes: changes.length };
  });
  if (!result) return fail(res, 404, "Aktivnost nije pronađena.");
  res.json({ success: true, ...result });
}));

app.delete("/api/aktivnosti/:id", auth, asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return fail(res, 400, "Neispravan ID aktivnosti.");
  const deleted = await transaction(async client => {
    const found = await client.query(
      `SELECT a.*, a.datum_aktivnosti::text AS datum_aktivnosti_text,
              a.rok_sledeceg_koraka::text AS rok_sledeceg_koraka_text
       FROM rokovnik_v2_aktivnosti a
       JOIN rokovnik_v2_predmeti p ON p.id=a.predmet_id
       WHERE a.id=$1 AND p.user_id=$2 FOR UPDATE OF p, a`,
      [id, req.user.id]
    );
    if (!found.rows.length) return false;
    const before = found.rows[0];
    const snapshot = activityFields.map(f => ({
      polje: f, naziv_polja: activityLabels[f],
      stara_vrednost: String((f === "datum_aktivnosti" ? before.datum_aktivnosti_text
        : f === "rok_sledeceg_koraka" ? before.rok_sledeceg_koraka_text : before[f]) ?? ""),
      nova_vrednost: ""
    }));
    await addHistory(client, req.user, before.predmet_id, "BRISANJE_AKTIVNOSTI",
      `Obrisana aktivnost #${id}: ${before.vrsta}`, snapshot);
    await client.query("DELETE FROM rokovnik_v2_aktivnosti WHERE id=$1", [id]);
    return true;
  });
  if (!deleted) return fail(res, 404, "Aktivnost nije pronađena.");
  res.json({ success: true });
}));

// ============================================
// LISTA DOKUMENATA
// ============================================

app.get(
  "/api/predmeti/:id/prilozi",
  auth,
  asyncRoute(async (req, res) => {
    const id = validId(req.params.id);

    if (!id) {
      return fail(
        res,
        400,
        "Neispravan ID."
      );
    }

    const result = await pool.query(
      `SELECT
         d.id,
         d.naziv,
         d.mime_type,
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

// ============================================
// DODAVANJE DOKUMENTA + ISTORIJA
// ============================================

app.post(
  "/api/predmeti/:id/prilozi",
  auth,
  asyncRoute(async (req, res) => {
    const id = validId(req.params.id);

    if (!id) {
      return fail(
        res,
        400,
        "Neispravan ID."
      );
    }

    const {
      naziv,
      mime_type,
      data_base64
    } = req.body || {};

    if (
      typeof naziv !== "string" ||
      !naziv.trim() ||
      naziv.length > 200 ||
      typeof mime_type !== "string" ||
      typeof data_base64 !== "string"
    ) {
      return fail(
        res,
        400,
        "Neispravan dokument."
      );
    }

    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowed.includes(mime_type)) {
      return fail(
        res,
        400,
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
      return fail(
        res,
        400,
        "Neispravan format dokumenta."
      );
    }

    const bytes = Buffer.from(
      raw,
      "base64"
    );

    if (
      !bytes.length ||
      bytes.length > 7 * 1024 * 1024
    ) {
      return fail(
        res,
        400,
        "Dokument mora biti do 7 MB."
      );
    }

    const pdf =
      bytes.subarray(0, 5).toString() ===
      "%PDF-";

    const jpg =
      bytes.length >= 3 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255;

    const png = bytes
      .subarray(0, 8)
      .equals(
        Buffer.from([
          137, 80, 78, 71,
          13, 10, 26, 10
        ])
      );

    const webp =
      bytes.subarray(0, 4).toString() ===
        "RIFF" &&
      bytes.subarray(8, 12).toString() ===
        "WEBP";

    const validType = {
      "application/pdf": pdf,
      "image/jpeg": jpg,
      "image/png": png,
      "image/webp": webp
    };

    if (!validType[mime_type]) {
      return fail(
        res,
        400,
        "Sadržaj dokumenta nije ispravan."
      );
    }

    const result = await transaction(
      async client => {
        const predmet = await ownedCase(
          client,
          id,
          req.user.id,
          true
        );

        if (!predmet) {
          return null;
        }

        const inserted = await client.query(
          `INSERT INTO rokovnik_v2_prilozi
           (
             predmet_id,
             naziv,
             mime_type,
             sadrzaj
           )
           VALUES ($1,$2,$3,$4)
           RETURNING id`,
          [
            id,
            naziv.trim(),
            mime_type,
            bytes
          ]
        );

        await addHistory(
          client,
          req.user,
          id,
          "DODAT_DOKUMENT",
          "Dodat dokument: " + naziv.trim(),
          []
        );

        return inserted.rows[0].id;
      }
    );

    if (!result) {
      return fail(
        res,
        404,
        "Predmet nije pronađen."
      );
    }

    res.status(201).json({
      success: true,
      id: result
    });
  })
);

// ============================================
// PREUZIMANJE DOKUMENTA
// ============================================

app.get(
  "/api/prilozi/:id",
  auth,
  asyncRoute(async (req, res) => {
    const id = validId(req.params.id);

    if (!id) {
      return fail(
        res,
        400,
        "Neispravan ID."
      );
    }

    const result = await pool.query(
      `SELECT
         d.naziv,
         d.mime_type,
         d.sadrzaj
       FROM rokovnik_v2_prilozi d
       JOIN rokovnik_v2_predmeti p
         ON p.id=d.predmet_id
       WHERE d.id=$1 AND p.user_id=$2`,
      [id, req.user.id]
    );

    if (!result.rows.length) {
      return fail(
        res,
        404,
        "Dokument nije pronađen."
      );
    }

    const file = result.rows[0];

    res.set(
      "Content-Type",
      file.mime_type
    );

    res.set(
      "Content-Disposition",
      `attachment; filename="prilog-${id}"`
    );

    res.set(
      "X-Content-Type-Options",
      "nosniff"
    );

    res.send(file.sadrzaj);
  })
);

// ============================================
// BRISANJE DOKUMENTA + ISTORIJA
// ============================================

app.delete(
  "/api/prilozi/:id",
  auth,
  asyncRoute(async (req, res) => {
    const id = validId(req.params.id);

    if (!id) {
      return fail(
        res,
        400,
        "Neispravan ID."
      );
    }

    const deleted = await transaction(
      async client => {
        const result = await client.query(
          `SELECT
             d.id,
             d.naziv,
             d.predmet_id
           FROM rokovnik_v2_prilozi d
           JOIN rokovnik_v2_predmeti p
             ON p.id=d.predmet_id
           WHERE d.id=$1 AND p.user_id=$2
           FOR UPDATE OF p, d`,
          [id, req.user.id]
        );

        if (!result.rows.length) {
          return false;
        }

        const file = result.rows[0];

        await client.query(
          `DELETE FROM rokovnik_v2_prilozi
           WHERE id=$1`,
          [id]
        );

        await addHistory(
          client,
          req.user,
          file.predmet_id,
          "OBRISAN_DOKUMENT",
          "Obrisan dokument: " + file.naziv,
          []
        );

        return true;
      }
    );

    if (!deleted) {
      return fail(
        res,
        404,
        "Dokument nije pronađen."
      );
    }

    res.json({
      success: true
    });
  })
);

// ============================================
// FAZA 4: PREGLED ROKOVA I GMAIL
// ============================================

const zavrseniStatusi = ["Završeno / Odobreno", "Arhivirano"];

app.get("/api/rokovi/pregled", auth, asyncRoute(async (req, res) => {
  const predmeti = await pool.query(
    `SELECT id, interni_broj, naziv_predmeta, status,
            rok_datum::text AS datum, 'predmet'::text AS izvor,
            NULL::bigint AS aktivnost_id, NULL::text AS sledeci_korak
     FROM rokovnik_v2_predmeti
     WHERE user_id=$1 AND rok_datum IS NOT NULL
       AND status <> ALL($2::text[])`,
    [req.user.id, zavrseniStatusi]
  );
  const aktivnosti = await pool.query(
    `SELECT p.id, p.interni_broj, p.naziv_predmeta, p.status,
            a.rok_sledeceg_koraka::text AS datum,
            'aktivnost'::text AS izvor, a.id AS aktivnost_id,
            a.sledeci_korak
     FROM rokovnik_v2_aktivnosti a
     JOIN rokovnik_v2_predmeti p ON p.id=a.predmet_id
     WHERE p.user_id=$1 AND a.rok_sledeceg_koraka IS NOT NULL
       AND p.status <> ALL($2::text[])`,
    [req.user.id, zavrseniStatusi]
  );
  const today = new Date().toLocaleDateString("en-CA", {timeZone: "Europe/Belgrade"});
  const todayMs = Date.parse(today + "T00:00:00Z");
  const stavke = [...predmeti.rows, ...aktivnosti.rows].map(x => {
    const dana = Math.round((Date.parse(x.datum + "T00:00:00Z") - todayMs) / 86400000);
    return {...x, dana, kategorija: dana < 0 ? "istekao" : dana === 0 ? "danas" : dana <= 7 ? "uskoro" : "kasnije"};
  }).sort((x,y) => x.datum.localeCompare(y.datum));
  const ukupno = await pool.query(
    `SELECT COUNT(*)::int AS broj FROM rokovnik_v2_predmeti WHERE user_id=$1`,
    [req.user.id]
  );
  res.json({
    danas: today,
    ukupno_predmeta: ukupno.rows[0].broj,
    isteklo: stavke.filter(x => x.kategorija === "istekao").length,
    danas_broj: stavke.filter(x => x.kategorija === "danas").length,
    uskoro: stavke.filter(x => x.kategorija === "uskoro").length,
    stavke
  });
}));

const emailAttempts = new Map();
app.post("/api/email/posalji", auth, asyncRoute(async (req, res) => {
  const { primalac, tip, predmet_id } = req.body || {};
  if (typeof primalac !== "string" || primalac.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primalac)) {
    return fail(res, 400, "Unesite ispravnu e-mail adresu primaoca.");
  }
  if (!["pregled", "predmet"].includes(tip)) {
    return fail(res, 400, "Nepoznata vrsta poruke.");
  }
  const now = Date.now();
  const last = emailAttempts.get(req.user.id) || 0;
  if (now - last < 30000) return fail(res, 429, "Sačekajte 30 sekundi pre novog slanja.");
  const gmailUser = process.env.GMAIL_USER;
  const gmailPassword = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPassword) {
    return fail(res, 503, "Gmail nije podešen na serveru.");
  }
  let subject, body;
  if (tip === "predmet") {
    const id = validId(predmet_id);
    if (!id) return fail(res, 400, "Neispravan ID predmeta.");
    const result = await pool.query(
      `SELECT ${columns.join(", ")} FROM rokovnik_v2_predmeti
       WHERE id=$1 AND user_id=$2`, [id, req.user.id]
    );
    if (!result.rows.length) return fail(res, 404, "Predmet nije pronađen.");
    const x = result.rows[0];
    subject = `Rokovnik Pro – predmet ${x.interni_broj}`;
    body = columns.map(c => `${labels[c]}: ${x[c] instanceof Date ? x[c].toISOString().slice(0,10) : (x[c] ?? "")}`).join("\n");
  } else {
    const result = await pool.query(
      `SELECT interni_broj, naziv_predmeta, status, rok_datum::text AS rok_datum
       FROM rokovnik_v2_predmeti WHERE user_id=$1 ORDER BY rok_datum ASC NULLS LAST, id DESC`,
      [req.user.id]
    );
    subject = "Rokovnik Pro – pregled predmeta";
    body = result.rows.length ? result.rows.map(x =>
      `${x.interni_broj} – ${x.naziv_predmeta}\nStatus: ${x.status}\nRok: ${x.rok_datum || "—"}`
    ).join("\n\n") : "Nema evidentiranih predmeta.";
  }
  emailAttempts.set(req.user.id, now);
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail", auth: {user: gmailUser, pass: gmailPassword}
    });
    await transporter.sendMail({
      from: gmailUser, to: primalac, subject, text: body
    });
    res.json({success: true, message: "E-mail je prihvaćen za slanje."});
  } catch (err) {
    console.error("Gmail slanje:", err.message);
    return fail(res, 502, "Gmail nije prihvatio poruku. Proverite App Password i Render logove.");
  }
}));

// ============================================
// ANALITIKA
// ============================================

app.get(
  "/api/analitika",
  auth,
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT
         COUNT(*)::int AS ukupno,

         COUNT(*) FILTER (
           WHERE status='U radu'
         )::int AS u_radu,

         COUNT(*) FILTER (
           WHERE rok_datum < CURRENT_DATE
             AND status NOT IN (
               'Završeno / Odobreno',
               'Arhivirano'
             )
         )::int AS isteklo,

         COUNT(*) FILTER (
           WHERE status='Završeno / Odobreno'
         )::int AS zavrseno

       FROM rokovnik_v2_predmeti
       WHERE user_id=$1`,
      [req.user.id]
    );

    res.json(result.rows[0]);
  })
);

// ============================================
// OBRADA GRESAKA
// ============================================

app.use((err, req, res, next) => {
  console.error(
    "Server error:",
    err.message
  );

  if (!res.headersSent) {
    fail(
      res,
      500,
      "Greška na serveru."
    );
  }
});

// ============================================
// POKRETANJE
// ============================================

init()
  .then(() => {
    app.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          "Univerzalni Rokovnik Pro 2.0 radi na portu " +
          PORT
        );
      }
    );
  })
  .catch(err => {
    console.error(
      "Pokretanje nije uspelo:",
      err.message
    );

    process.exit(1);
  });
