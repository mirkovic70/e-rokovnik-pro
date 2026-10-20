
"use strict";

// UNIVERZALNI ROKOVNIK PRO 2.0
// PostgreSQL API - Render

let token = sessionStorage.getItem("rokovnik_token") || "";
let predmetiSvi = [];
let trenutniDokumenti = [];

const $ = id => document.getElementById(id);

function poruka(tekst, greska = false) {
  const el = $("app-message");

  if (!el) return;

  el.textContent = tekst;
  el.classList.remove("hidden");
  el.classList.toggle("error", greska);

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function sakrijPoruku() {
  $("app-message").classList.add("hidden");
}

function loginGreska(tekst) {
  const el = $("login-error");
  el.textContent = tekst;
  el.classList.remove("hidden");
}

function prikaziPrijavu() {
  $("login-screen").classList.remove("hidden");
  $("app-screen").classList.add("hidden");
}

function prikaziAplikaciju() {
  $("login-screen").classList.add("hidden");
  $("app-screen").classList.remove("hidden");
}

function odjava() {
  token = "";
  sessionStorage.removeItem("rokovnik_token");
  predmetiSvi = [];
  trenutniDokumenti = [];
  $("password").value = "";
  prikaziPrijavu();
}

async function api(url, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  let response;

  try {
    response = await fetch(url, {
      ...options,
      headers,
      cache: "no-store"
    });
  } catch {
    throw new Error("Nema veze sa serverom. Proveri internet.");
  }

  if (response.status === 401 && url !== "/api/login") {
    odjava();
    throw new Error("Sesija je istekla. Prijavi se ponovo.");
  }

  const type = response.headers.get("content-type") || "";

  let data;

  if (type.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    throw new Error(
      data && data.error
        ? data.error
        : `Greška servera (${response.status})`
    );
  }

  return data;
}

// PRIJAVA

async function prijaviSe(e) {
  e.preventDefault();

  const username = $("username").value.trim();
  const password = $("password").value;

  $("login-error").classList.add("hidden");

  const dugme = $("login-form").querySelector("button");
  dugme.disabled = true;
  dugme.textContent = "Prijavljivanje...";

  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });

    token = data.token;
    sessionStorage.setItem("rokovnik_token", token);

    $("password").value = "";

    prikaziAplikaciju();
    await osvezi();

  } catch (err) {
    loginGreska(err.message);
  } finally {
    dugme.disabled = false;
    dugme.textContent = "🔐 Prijavi se";
  }
}

// POKRETANJE

document.addEventListener("DOMContentLoaded", async () => {
  $("login-form").addEventListener("submit", prijaviSe);
  $("logout-btn").addEventListener("click", odjava);

  $("predmet-form").addEventListener("submit", sacuvajPredmet);
  $("cancel-btn").addEventListener("click", resetForm);

  $("refresh-btn").addEventListener("click", async () => {
    try {
      await osvezi();
      poruka("Podaci su osveženi.");
    } catch (err) {
      poruka(err.message, true);
    }
  });

  $("search").addEventListener("input", prikaziPredmete);
  $("filter-vrsta").addEventListener("change", prikaziPredmete);
  $("filter-status").addEventListener("change", prikaziPredmete);

  $("vrsta_predmeta").addEventListener(
    "change",
    prikaziModulPolja
  );

  $("excel-btn").addEventListener("click", izveziCSV);
  $("mail-btn").addEventListener("click", posaljiZbirniMail);

  $("upload-btn").addEventListener("click", uploadDokumenta);

  $("documents-refresh-btn").addEventListener(
    "click",
    ucitajDokumente
  );

  $("dokument-predmet").addEventListener(
    "change",
    ucitajDokumente
  );

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      otvoriTab(btn.dataset.tab, btn);
    });
  });

  $("predmeti-lista").addEventListener("click", async e => {
    const btn = e.target.closest("button[data-action]");

    if (!btn) return;

    const id = Number(btn.dataset.id);
    const action = btn.dataset.action;

    if (action === "edit") izmeni(id);
    if (action === "delete") await obrisi(id);
    if (action === "mail") posaljiPredmetMail(id);

    if (action === "documents") {
      $("dokument-predmet").value = String(id);

      const tab = document.querySelector(
        '[data-tab="tab-dokumenti"]'
      );

      otvoriTab("tab-dokumenti", tab);
      await ucitajDokumente();
    }
  });

  $("dokumenti-lista").addEventListener("click", async e => {
    const btn = e.target.closest("button[data-action]");

    if (!btn) return;

    const id = Number(btn.dataset.id);

    if (btn.dataset.action === "download") {
      await preuzmiDokument(id);
    }

    if (btn.dataset.action === "delete") {
      await obrisiDokument(id);
    }
  });

  $("datum_prijema").value = danasnjiDatum();
  prikaziModulPolja();

  if (token) {
    try {
      await api("/api/me");
      prikaziAplikaciju();
      await osvezi();
    } catch {
      odjava();
    }
  } else {
    prikaziPrijavu();
  }
});

// POMOĆNE FUNKCIJE

function danasnjiDatum() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}`;
}

function datumTekst(value) {
  if (!value) return "Nije definisan";

  const s = String(value).slice(0, 10);
  const parts = s.split("-");

  if (parts.length !== 3) return s;

  return `${parts[2]}.${parts[1]}.${parts[0]}.`;
}

function escapeHTML(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function predmetPoId(id) {
  return predmetiSvi.find(p => Number(p.id) === Number(id));
}

function vrednost(id) {
  return $(id).value;
}

function otvoriTab(tabId, btn) {
  document.querySelectorAll(".tab-content").forEach(el => {
    el.classList.add("hidden");
  });

  document.querySelectorAll(".tab-btn").forEach(el => {
    el.classList.remove("active");
  });

  $(tabId).classList.remove("hidden");

  if (btn) btn.classList.add("active");

  if (tabId === "tab-rokovi") prikaziKalendar();
  if (tabId === "tab-analitika") prikaziAnalitiku();
  if (tabId === "tab-dokumenti") {
    popuniIzborPredmeta();
  }
}

function prikaziModulPolja() {
  const vrsta = vrednost("vrsta_predmeta");

  $("ceop-modul").classList.toggle(
    "hidden",
    vrsta !== "CEOP i Građevinski postupak"
  );
}

// UČITAVANJE IZ POSTGRESQL BAZE

async function osvezi() {
  predmetiSvi = await api("/api/predmeti");

  prikaziPredmete();
  prikaziKalendar();
  prikaziAnalitiku();
  popuniIzborPredmeta();
}

// ČUVANJE PREDMETA

function podaciIzForme() {
  return {
    vrsta_predmeta: vrednost("vrsta_predmeta"),
    interni_broj: vrednost("interni_broj").trim(),
    naziv_predmeta: vrednost("naziv_predmeta").trim(),
    investor: vrednost("investor"),
    obradjivac: vrednost("obradjivac"),
    potpisnik: vrednost("potpisnik"),
    datum_prijema: vrednost("datum_prijema"),
    rok_datum: vrednost("rok_datum"),
    status: vrednost("status"),
    napomena: vrednost("napomena"),
    ceop_broj: vrednost("ceop_broj"),
    rop_broj: vrednost("rop_broj"),
    opstina: vrednost("opstina"),
    katastarska_opstina: vrednost("katastarska_opstina"),
    broj_parcele: vrednost("broj_parcele"),
    nadlezni_organ: vrednost("nadlezni_organ")
  };
}

async function sacuvajPredmet(e) {
  e.preventDefault();

  const id = vrednost("edit-id");
  const p = podaciIzForme();

  if (!p.interni_broj || !p.naziv_predmeta) {
    poruka("Unesi broj i naziv predmeta.", true);
    return;
  }

  const dugme = $("save-btn");
  dugme.disabled = true;
  dugme.textContent = "Čuvanje...";

  try {
    if (id) {
      await api(`/api/predmeti/${id}`, {
        method: "PUT",
        body: JSON.stringify(p)
      });
    } else {
      await api("/api/predmeti", {
        method: "POST",
        body: JSON.stringify(p)
      });
    }

    resetForm();
    await osvezi();

    poruka(
      id
        ? "Predmet je uspešno izmenjen."
        : "Predmet je uspešno sačuvan u PostgreSQL bazi."
    );

  } catch (err) {
    poruka("Čuvanje nije uspelo: " + err.message, true);
  } finally {
    dugme.disabled = false;
    dugme.textContent = "💾 Sačuvaj predmet";
  }
}

// REGISTAR PREDMETA

function prikaziPredmete() {
  const el = $("predmeti-lista");

  const q = vrednost("search").trim().toLowerCase();
  const vrsta = vrednost("filter-vrsta");
  const status = vrednost("filter-status");

  const lista = predmetiSvi.filter(p => {
    const tekst = [
      p.interni_broj,
      p.naziv_predmeta,
      p.investor,
      p.obradjivac,
      p.ceop_broj,
      p.rop_broj,
      p.broj_parcele
    ].join(" ").toLowerCase();

    return (
      tekst.includes(q) &&
      (!vrsta || p.vrsta_predmeta === vrsta) &&
      (!status || p.status === status)
    );
  });

  if (!lista.length) {
    el.textContent = predmetiSvi.length
      ? "Nema predmeta koji odgovaraju pretrazi."
      : "Nema unetih predmeta u PostgreSQL bazi.";
    return;
  }

  const danas = danasnjiDatum();

  el.innerHTML = lista.map(p => {
    const isteklo =
      p.rok_datum &&
      p.rok_datum < danas &&
      p.status !== "Završeno / Odobreno" &&
      p.status !== "Arhivirano";

    const id = Number(p.id);

    return `
      <article class="predmet">
        <div style="display:flex;justify-content:space-between;
                    gap:10px;flex-wrap:wrap">
          <h3>${escapeHTML(p.naziv_predmeta)}</h3>
          <span class="badge ${isteklo ? "badge-danger" : ""}">
            ${escapeHTML(p.status)}
          </span>
        </div>

        <p><b>Broj:</b> ${escapeHTML(p.interni_broj)}</p>
        <p><b>Vrsta:</b> ${escapeHTML(p.vrsta_predmeta)}</p>
        <p><b>Stranka:</b> ${escapeHTML(p.investor || "/")}</p>
        <p><b>Obrađivač:</b> ${escapeHTML(p.obradjivac || "/")}</p>
        <p><b>Potpisnik:</b> ${escapeHTML(p.potpisnik || "/")}</p>
        <p><b>Prijem:</b> ${datumTekst(p.datum_prijema)}</p>
        <p><b>Rok:</b> ${datumTekst(p.rok_datum)}</p>

        ${p.ceop_broj ? `
          <p><b>CEOP:</b> ${escapeHTML(p.ceop_broj)}</p>
        ` : ""}

        ${p.rop_broj ? `
          <p><b>ROP:</b> ${escapeHTML(p.rop_broj)}</p>
        ` : ""}

        ${p.napomena ? `
          <p><b>Napomena:</b> ${escapeHTML(p.napomena)}</p>
        ` : ""}

        <div class="actions">
          <button class="btn btn-secondary btn-small"
                  data-action="edit" data-id="${id}">
            ✏️ Izmeni
          </button>

          <button class="btn btn-secondary btn-small"
                  data-action="documents" data-id="${id}">
            📎 Dokumenti
          </button>

          <button class="btn btn-secondary btn-small"
                  data-action="mail" data-id="${id}">
            ✉️ E-mail
          </button>

          <button class="btn btn-danger btn-small"
                  data-action="delete" data-id="${id}">
            🗑️ Obriši
          </button>
        </div>
      </article>
    `;
  }).join("");
}

// IZMENA

function izmeni(id) {
  const p = predmetPoId(id);

  if (!p) return;

  const fields = [
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

  $("edit-id").value = p.id;

  fields.forEach(key => {
    if ($(key)) $(key).value = p[key] || "";
  });

  prikaziModulPolja();

  $("form-title").textContent = "✏️ Izmena predmeta";
  $("cancel-btn").classList.remove("hidden");

  const tab = document.querySelector(
    '[data-tab="tab-predmeti"]'
  );

  otvoriTab("tab-predmeti", tab);

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// BRISANJE

async function obrisi(id) {
  const p = predmetPoId(id);

  if (!p) return;

  if (!confirm(
    `Trajno obrisati predmet "${p.naziv_predmeta}" i sve priloge?`
  )) {
    return;
  }

  try {
    await api(`/api/predmeti/${id}`, {
      method: "DELETE"
    });

    await osvezi();
    poruka("Predmet je obrisan.");

  } catch (err) {
    poruka(err.message, true);
  }
}

// RESET FORME

function resetForm() {
  $("predmet-form").reset();
  $("edit-id").value = "";
  $("datum_prijema").value = danasnjiDatum();

  $("form-title").textContent = "➕ Novi predmet";
  $("cancel-btn").classList.add("hidden");

  prikaziModulPolja();
}

// KALENDAR ROKOVA

function prikaziKalendar() {
  const el = $("kalendar-lista");
  const danas = danasnjiDatum();

  const lista = predmetiSvi
    .filter(p => p.rok_datum)
    .sort((a, b) => a.rok_datum.localeCompare(b.rok_datum));

  if (!lista.length) {
    el.textContent = "Nema predmeta sa definisanim rokom.";
    return;
  }

  el.innerHTML = lista.map(p => {
    const isteklo =
      p.rok_datum < danas &&
      p.status !== "Završeno / Odobreno" &&
      p.status !== "Arhivirano";

    return `
      <div class="predmet">
        <span class="badge ${isteklo ? "badge-danger" : ""}">
          ${datumTekst(p.rok_datum)}
        </span>

        <h3 style="margin-top:12px">
          ${escapeHTML(p.naziv_predmeta)}
        </h3>

        <p>Broj: ${escapeHTML(p.interni_broj)}</p>
        <p>Status: ${escapeHTML(p.status)}</p>
        <p>Obrađivač: ${escapeHTML(p.obradjivac || "/")}</p>
      </div>
    `;
  }).join("");
}

// ANALITIKA

function prikaziAnalitiku() {
  const danas = danasnjiDatum();

  $("st-ukupno").textContent = predmetiSvi.length;

  $("st-uradu").textContent = predmetiSvi.filter(
    p => p.status === "U radu"
  ).length;

  $("st-isteklo").textContent = predmetiSvi.filter(
    p =>
      p.rok_datum &&
      p.rok_datum < danas &&
      p.status !== "Završeno / Odobreno" &&
      p.status !== "Arhivirano"
  ).length;

  $("st-zavrseno").textContent = predmetiSvi.filter(
    p => p.status === "Završeno / Odobreno"
  ).length;
}

// IZBOR PREDMETA ZA DOKUMENTE

function popuniIzborPredmeta() {
  const select = $("dokument-predmet");
  const selected = select.value;

  select.innerHTML = "";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Izaberi predmet...";
  select.appendChild(empty);

  predmetiSvi.forEach(p => {
    const option = document.createElement("option");
    option.value = p.id;
    option.textContent =
      `${p.interni_broj} — ${p.naziv_predmeta}`;

    select.appendChild(option);
  });

  if (
    selected &&
    predmetiSvi.some(p => String(p.id) === selected)
  ) {
    select.value = selected;
  }
}

// UČITAVANJE DOKUMENATA

async function ucitajDokumente() {
  const predmetId = vrednost("dokument-predmet");
  const el = $("dokumenti-lista");

  if (!predmetId) {
    trenutniDokumenti = [];
    el.textContent = "Izaberi predmet.";
    return;
  }

  el.textContent = "Učitavanje dokumenata...";

  try {
    trenutniDokumenti = await api(
      `/api/predmeti/${predmetId}/prilozi`
    );

    if (!trenutniDokumenti.length) {
      el.textContent = "Nema priloženih dokumenata.";
      return;
    }

    el.innerHTML = trenutniDokumenti.map(f => `
      <div class="file-item">
        <strong>${escapeHTML(f.naziv)}</strong>

        <p>
          ${escapeHTML(f.mime_type)} —
          ${Math.round(Number(f.velicina) / 1024)} KB
        </p>

        <div class="actions">
          <button class="btn btn-secondary btn-small"
                  data-action="download"
                  data-id="${Number(f.id)}">
            ⬇️ Preuzmi
          </button>

          <button class="btn btn-danger btn-small"
                  data-action="delete"
                  data-id="${Number(f.id)}">
            🗑️ Obriši
          </button>
        </div>
      </div>
    `).join("");

  } catch (err) {
    el.textContent = "Greška: " + err.message;
  }
}

// UPLOAD DOKUMENTA

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(
      new Error("Ne mogu da pročitam dokument.")
    );

    reader.readAsDataURL(file);
  });
}

async function uploadDokumenta() {
  const predmetId = vrednost("dokument-predmet");
  const file = $("dokument-file").files[0];

  if (!predmetId) {
    poruka("Prvo izaberi predmet.", true);
    return;
  }

  if (!file) {
    poruka("Izaberi fotografiju ili dokument.", true);
    return;
  }

  const allowed = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!allowed.includes(file.type)) {
    poruka("Dozvoljeni su PDF, JPG, PNG i WEBP.", true);
    return;
  }

  if (file.size > 7 * 1024 * 1024) {
    poruka("Dokument ne sme biti veći od 7 MB.", true);
    return;
  }

  const btn = $("upload-btn");
  btn.disabled = true;
  btn.textContent = "Slanje dokumenta...";

  try {
    const data = await fileToBase64(file);

    await api(`/api/predmeti/${predmetId}/prilozi`, {
      method: "POST",
      body: JSON.stringify({
        naziv: file.name,
        mime_type: file.type,
        data_base64: data
      })
    });

    $("dokument-file").value = "";
    await ucitajDokumente();

    poruka("Dokument je sačuvan u PostgreSQL bazi.");

  } catch (err) {
    poruka("Dokument nije sačuvan: " + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "📤 Sačuvaj dokument";
  }
}

// PREUZIMANJE DOKUMENTA

async function preuzmiDokument(id) {
  try {
    const response = await fetch(`/api/prilozi/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (response.status === 401) {
      odjava();
      throw new Error("Sesija je istekla.");
    }

    if (!response.ok) {
      throw new Error("Preuzimanje nije uspelo.");
    }

    const blob = await response.blob();

    const f = trenutniDokumenti.find(
      x => Number(x.id) === id
    );

    const naziv = f ? f.naziv : `prilog-${id}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = naziv;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 60000);

  } catch (err) {
    poruka(err.message, true);
  }
}

// BRISANJE DOKUMENTA

async function obrisiDokument(id) {
  if (!confirm("Trajno obrisati dokument?")) return;

  try {
    await api(`/api/prilozi/${id}`, {
      method: "DELETE"
    });

    await ucitajDokumente();
    poruka("Dokument je obrisan.");

  } catch (err) {
    poruka(err.message, true);
  }
}

// CSV IZVOZ

function csvCell(value) {
  let s = String(value == null ? "" : value);

  // Sprečavanje izvršavanja formula u Excelu.
  if (/^[\s]*[=+\-@]/.test(s)) {
    s = "'" + s;
  }

  return `"${s.replace(/"/g, '""')}"`;
}

function izveziCSV() {
  if (!predmetiSvi.length) {
    poruka("Nema predmeta za izvoz.", true);
    return;
  }

  const fields = [
    ["interni_broj", "Broj"],
    ["naziv_predmeta", "Naziv"],
    ["vrsta_predmeta", "Vrsta"],
    ["investor", "Stranka"],
    ["obradjivac", "Obrađivač"],
    ["potpisnik", "Potpisnik"],
    ["datum_prijema", "Datum prijema"],
    ["rok_datum", "Rok"],
    ["status", "Status"],
    ["ceop_broj", "CEOP"],
    ["rop_broj", "ROP"],
    ["opstina", "Opština"],
    ["katastarska_opstina", "K.O."],
    ["broj_parcele", "Parcela"],
    ["nadlezni_organ", "Nadležni organ"],
    ["napomena", "Napomena"]
  ];

  const rows = [
    fields.map(f => csvCell(f[1])).join(";"),
    ...predmetiSvi.map(p =>
      fields.map(f => csvCell(p[f[0]])).join(";")
    )
  ];

  const blob = new Blob(
    ["\uFEFF" + rows.join("\r\n")],
    { type: "text/csv;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = "rokovnik_predmeti.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// E-MAIL JEDNOG PREDMETA

function posaljiPredmetMail(id) {
  const p = predmetPoId(id);

  if (!p) return;

  const adresa = prompt("E-mail primaoca:", "");
  if (!adresa) return;

  const subject = encodeURIComponent(
    `Predmet ${p.interni_broj}: ${p.naziv_predmeta}`
  );

  const tekst = [
    "PREGLED PREDMETA",
    "",
    `Broj: ${p.interni_broj}`,
    `Naziv: ${p.naziv_predmeta}`,
    `Vrsta: ${p.vrsta_predmeta}`,
    `Stranka: ${p.investor || "/"}`,
    `Obrađivač: ${p.obradjivac || "/"}`,
    `Potpisnik: ${p.potpisnik || "/"}`,
    `Datum prijema: ${datumTekst(p.datum_prijema)}`,
    `Rok: ${datumTekst(p.rok_datum)}`,
    `Status: ${p.status}`,
    `CEOP: ${p.ceop_broj || "/"}`,
    `ROP: ${p.rop_broj || "/"}`,
    `Napomena: ${p.napomena || "/"}`
  ].join("\n");

  window.location.href =
    `mailto:${encodeURIComponent(adresa)}` +
    `?subject=${subject}` +
    `&body=${encodeURIComponent(tekst)}`;
}

// ZBIRNI E-MAIL

function posaljiZbirniMail() {
  if (!predmetiSvi.length) {
    poruka("Nema predmeta za izveštaj.", true);
    return;
  }

  const adresa = prompt("E-mail primaoca:", "");
  if (!adresa) return;

  const tekst = [
    "ZBIRNI IZVEŠTAJ ROKOVNIKA",
    `Datum: ${datumTekst(danasnjiDatum())}`,
    `Ukupno predmeta: ${predmetiSvi.length}`,
    "",
    ...predmetiSvi.map((p, i) =>
      `${i + 1}. ${p.interni_broj} — ${p.naziv_predmeta}\n` +
      `Status: ${p.status}\n` +
      `Rok: ${datumTekst(p.rok_datum)}\n`
    )
  ].join("\n");

  window.location.href =
    `mailto:${encodeURIComponent(adresa)}` +
    "?subject=" +
    encodeURIComponent("Zbirni izveštaj Rokovnika Pro 2.0") +
    "&body=" +
    encodeURIComponent(tekst);
}
