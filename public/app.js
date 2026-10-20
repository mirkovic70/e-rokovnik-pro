
"use strict";

/*
 * UNIVERZALNI ROKOVNIK PRO 2.0
 * FAZA 1 - KOMPLETAN DOSIJE PREDMETA
 *
 * PostgreSQL / Render
 * Vise korisnickih naloga
 * Privatni predmeti i dokumenti
 */

let token = sessionStorage.getItem("rokovnik_token") || "";
let predmetiSvi = [];
let trenutniDokumenti = [];
let trenutniKorisnik = null;
let aktivniDosijeId = null;
let aktivniTabPreDosijea = "tab-registar";

const $ = id => document.getElementById(id);

const POLJA = [
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

function danas() {
  const d = new Date();

  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0")
  ].join("-");
}

function datumTekst(value) {
  if (!value) return "Nije definisan";

  const parts = String(value)
    .slice(0, 10)
    .split("-");

  if (parts.length !== 3) return String(value);

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

function formatSize(bytes) {
  const n = Number(bytes) || 0;

  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }

  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function brojDokumenata(p) {
  return Number(
    p.broj_dokumenata ?? p.broj_priloga ?? 0
  );
}

function zavrsenPredmet(p) {
  return [
    "Završeno / Odobreno",
    "Arhivirano"
  ].includes(p.status);
}

function stanjeRoka(p) {
  if (!p.rok_datum) {
    return {
      tekst: "Rok nije određen",
      klasa: "neutral"
    };
  }

  if (zavrsenPredmet(p)) {
    return {
      tekst: "Predmet je završen",
      klasa: "success"
    };
  }

  const rok = String(p.rok_datum).slice(0, 10);
  const today = danas();

  if (rok < today) {
    return {
      tekst: "Rok je istekao",
      klasa: "danger"
    };
  }

  if (rok === today) {
    return {
      tekst: "Rok ističe danas",
      klasa: "warning"
    };
  }

  const diff = Math.round(
    (
      Date.parse(rok + "T00:00:00Z") -
      Date.parse(today + "T00:00:00Z")
    ) / 86400000
  );

  return {
    tekst: `Preostalo dana: ${diff}`,
    klasa: diff <= 7 ? "warning" : "success"
  };
}

function showMessage(message, isError = false) {
  const el = $("app-message");

  if (!el) {
    alert(message);
    return;
  }

  el.textContent = message;
  el.classList.remove("hidden");
  el.classList.toggle("error", isError);

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function clearMessage() {
  $("app-message")?.classList.add("hidden");
}

function loginError(message) {
  const el = $("login-error");

  if (!el) {
    alert(message);
    return;
  }

  el.textContent = message;
  el.classList.remove("hidden");
}

function showLogin() {
  $("login-screen")?.classList.remove("hidden");
  $("app-screen")?.classList.add("hidden");
}

function showApp() {
  $("login-screen")?.classList.add("hidden");
  $("app-screen")?.classList.remove("hidden");

  if ($("current-user")) {
    $("current-user").textContent =
      trenutniKorisnik?.username || "";
  }

  $("admin-tab")?.classList.toggle(
    "hidden",
    trenutniKorisnik?.username !== "admin"
  );
}

function logout() {
  token = "";
  sessionStorage.removeItem("rokovnik_token");

  predmetiSvi = [];
  trenutniDokumenti = [];
  trenutniKorisnik = null;
  aktivniDosijeId = null;

  if ($("password")) {
    $("password").value = "";
  }

  showLogin();
}

async function api(url, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (
    options.body &&
    !(options.body instanceof FormData)
  ) {
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
    throw new Error(
      "Nema veze sa serverom. Proveri internet."
    );
  }

  if (
    response.status === 401 &&
    url !== "/api/login"
  ) {
    logout();

    throw new Error(
      "Sesija je istekla. Prijavi se ponovo."
    );
  }

  const type =
    response.headers.get("content-type") || "";

  let data;

  if (type.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      `Greška servera (${response.status})`
    );
  }

  return data;
}

// ==================================================
// PRIJAVA
// ==================================================

async function login(e) {
  e.preventDefault();

  $("login-error")?.classList.add("hidden");

  const btn = $("login-form")?.querySelector(
    'button[type="submit"]'
  );

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Prijavljivanje...";
  }

  try {
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("username").value.trim(),
        password: $("password").value
      })
    });

    if (!result.token) {
      throw new Error(
        "Server nije vratio podatke o prijavi."
      );
    }

    token = result.token;

    sessionStorage.setItem(
      "rokovnik_token",
      token
    );

    trenutniKorisnik = {
      username: result.username
    };

    $("password").value = "";

    showApp();
    await refreshAll();

  } catch (err) {
    loginError(err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🔐 Prijavi se";
    }
  }
}

// ==================================================
// POKRETANJE APLIKACIJE
// ==================================================

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    $("login-form")?.addEventListener(
      "submit",
      login
    );

    $("logout-btn")?.addEventListener(
      "click",
      logout
    );

    $("predmet-form")?.addEventListener(
      "submit",
      savePredmet
    );

    $("cancel-btn")?.addEventListener(
      "click",
      resetForm
    );

    $("vrsta_predmeta")?.addEventListener(
      "change",
      showCeopFields
    );

    $("search")?.addEventListener(
      "input",
      renderPredmeti
    );

    $("filter-vrsta")?.addEventListener(
      "change",
      renderPredmeti
    );

    $("filter-status")?.addEventListener(
      "change",
      renderPredmeti
    );

    $("refresh-btn")?.addEventListener(
      "click",
      async () => {
        try {
          await refreshAll();
          showMessage("Podaci su osveženi.");
        } catch (err) {
          showMessage(err.message, true);
        }
      }
    );

    $("excel-btn")?.addEventListener(
      "click",
      exportCSV
    );

    $("mail-btn")?.addEventListener(
      "click",
      sendSummaryMail
    );

    $("upload-btn")?.addEventListener(
      "click",
      uploadDocumentsFromTab
    );

    $("documents-refresh-btn")?.addEventListener(
      "click",
      loadDocuments
    );

    $("dokument-predmet")?.addEventListener(
      "change",
      loadDocuments
    );

    $("new-user-form")?.addEventListener(
      "submit",
      createUser
    );

    $("files-new")?.addEventListener(
      "change",
      updateFileCount
    );

    document.querySelectorAll(
      ".tab-btn"
    ).forEach(btn => {
      btn.addEventListener("click", () => {
        openTab(btn.dataset.tab, btn);
      });
    });

    $("predmeti-lista")?.addEventListener(
      "click",
      async e => {
        const btn = e.target.closest(
          "button[data-action]"
        );

        if (!btn) return;

        const id = Number(btn.dataset.id);
        const action = btn.dataset.action;

        if (action === "view") {
          await openDosije(id);
        }

        if (action === "edit") {
          editPredmet(id);
        }

        if (action === "delete") {
          await deletePredmet(id);
        }

        if (action === "mail") {
          sendPredmetMail(id);
        }

        if (action === "documents") {
          await openDocumentsTab(id);
        }
      }
    );

    $("dokumenti-lista")?.addEventListener(
      "click",
      handleDocumentClick
    );

    $("dosije-sadrzaj")?.addEventListener(
      "click",
      handleDosijeClick
    );

    $("dosije-nazad")?.addEventListener(
      "click",
      closeDosije
    );

    if ($("datum_prijema")) {
      $("datum_prijema").value = danas();
    }

    showCeopFields();

    if (token) {
      try {
        const result = await api("/api/me");

        trenutniKorisnik = result.user;

        showApp();
        await refreshAll();

      } catch {
        logout();
      }
    } else {
      showLogin();
    }
  }
);

// ==================================================
// NAVIGACIJA
// ==================================================

function openTab(tabId, btn) {
  if (!tabId || !$(tabId)) return;

  document.querySelectorAll(
    ".tab-content"
  ).forEach(el => {
    el.classList.add("hidden");
  });

  document.querySelectorAll(
    ".tab-btn"
  ).forEach(el => {
    el.classList.remove("active");
  });

  $(tabId).classList.remove("hidden");

  btn?.classList.add("active");

  if (tabId !== "tab-dosije") {
    aktivniTabPreDosijea = tabId;
  }

  if (tabId === "tab-rokovi") {
    renderCalendar();
  }

  if (tabId === "tab-analitika") {
    renderAnalytics();
  }

  if (tabId === "tab-dokumenti") {
    populatePredmetSelect();
  }

  if (tabId === "tab-admin") {
    loadUsers();
  }
}

function showCeopFields() {
  const isCeop =
    $("vrsta_predmeta")?.value ===
    "CEOP i Građevinski postupak";

  $("ceop-modul")?.classList.toggle(
    "hidden",
    !isCeop
  );
}

// ==================================================
// UCITAVANJE
// ==================================================

async function refreshAll() {
  const result = await api("/api/predmeti");

  if (!Array.isArray(result)) {
    throw new Error(
      "Server nije vratio ispravnu listu predmeta."
    );
  }

  predmetiSvi = result;

  renderPredmeti();
  renderCalendar();
  renderAnalytics();
  populatePredmetSelect();
}

function findPredmet(id) {
  return predmetiSvi.find(
    p => Number(p.id) === Number(id)
  );
}

// ==================================================
// UNOS I CUVANJE PREDMETA
// ==================================================

function formData() {
  const result = {};

  POLJA.forEach(key => {
    result[key] = $(key)?.value || "";
  });

  return result;
}

async function savePredmet(e) {
  e.preventDefault();

  const editId = $("edit-id")?.value || "";
  const predmet = formData();

  if (
    !predmet.interni_broj.trim() ||
    !predmet.naziv_predmeta.trim()
  ) {
    showMessage(
      "Unesi broj i naziv predmeta.",
      true
    );
    return;
  }

  const files = Array.from(
    $("files-new")?.files || []
  );

  const btn = $("save-btn");

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Čuvanje...";
  }

  try {
    let predmetId;

    if (editId) {
      await api(`/api/predmeti/${editId}`, {
        method: "PUT",
        body: JSON.stringify(predmet)
      });

      predmetId = editId;
    } else {
      const result = await api(
        "/api/predmeti",
        {
          method: "POST",
          body: JSON.stringify(predmet)
        }
      );

      predmetId = result.id;
    }

    let uploaded = 0;
    const errors = [];

    for (const file of files) {
      try {
        await uploadSingleDocument(
          predmetId,
          file
        );

        uploaded++;
      } catch (err) {
        errors.push(
          `${file.name}: ${err.message}`
        );
      }
    }

    resetForm();
    await refreshAll();

    showMessage(
      errors.length
        ? (
          `Predmet je sačuvan. ` +
          `Dodato dokumenata: ${uploaded}. ` +
          `Greške: ${errors.join("; ")}`
        )
        : (
          `Predmet je uspešno sačuvan. ` +
          `Dodato dokumenata: ${uploaded}.`
        ),
      errors.length > 0
    );

  } catch (err) {
    showMessage(
      "Čuvanje nije uspelo: " +
      err.message,
      true
    );
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "💾 Sačuvaj predmet";
    }
  }
}

// ==================================================
// REGISTAR PREDMETA
// ==================================================

function renderPredmeti() {
  const el = $("predmeti-lista");
  if (!el) return;

  const q = (
    $("search")?.value || ""
  ).trim().toLowerCase();

  const vrsta =
    $("filter-vrsta")?.value || "";

  const status =
    $("filter-status")?.value || "";

  const filtered = predmetiSvi.filter(p => {
    const text = [
      p.interni_broj,
      p.naziv_predmeta,
      p.investor,
      p.obradjivac,
      p.potpisnik,
      p.ceop_broj,
      p.rop_broj,
      p.broj_parcele,
      p.nadlezni_organ
    ].join(" ").toLowerCase();

    return (
      text.includes(q) &&
      (!vrsta || p.vrsta_predmeta === vrsta) &&
      (!status || p.status === status)
    );
  });

  if (!filtered.length) {
    el.textContent = predmetiSvi.length
      ? "Nema rezultata pretrage."
      : "Nema unetih predmeta.";

    return;
  }

  el.innerHTML = filtered.map(p => {
    const id = Number(p.id);
    const count = brojDokumenata(p);
    const rok = stanjeRoka(p);

    return `
      <article class="predmet">

        <div style="
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          flex-wrap:wrap;
          gap:10px;
        ">
          <h3>
            ${escapeHTML(p.naziv_predmeta)}
          </h3>

          <span class="badge ${
            rok.klasa === "danger"
              ? "badge-danger"
              : ""
          }">
            ${escapeHTML(p.status)}
          </span>
        </div>

        <p>
          <b>Broj:</b>
          ${escapeHTML(p.interni_broj)}
        </p>

        <p>
          <b>Vrsta:</b>
          ${escapeHTML(p.vrsta_predmeta)}
        </p>

        <p>
          <b>Stranka:</b>
          ${escapeHTML(p.investor || "/")}
        </p>

        <p>
          <b>Obrađivač:</b>
          ${escapeHTML(p.obradjivac || "/")}
        </p>

        <p>
          <b>Prijem:</b>
          ${datumTekst(p.datum_prijema)}
        </p>

        <p>
          <b>Rok:</b>
          ${datumTekst(p.rok_datum)}
        </p>

        <p>
          <b>📎 Dokumenti:</b>
          <strong>${count}</strong>
        </p>

        <div class="actions">

          <button
            type="button"
            class="btn btn-primary btn-small"
            data-action="view"
            data-id="${id}"
          >
            📂 Pregled
          </button>

          <button
            type="button"
            class="btn btn-secondary btn-small"
            data-action="edit"
            data-id="${id}"
          >
            ✏️ Izmeni
          </button>

          <button
            type="button"
            class="btn btn-secondary btn-small"
            data-action="documents"
            data-id="${id}"
          >
            📎 Dokumenti (${count})
          </button>

          <button
            type="button"
            class="btn btn-secondary btn-small"
            data-action="mail"
            data-id="${id}"
          >
            ✉️ E-mail
          </button>

          <button
            type="button"
            class="btn btn-danger btn-small"
            data-action="delete"
            data-id="${id}"
          >
            🗑️ Obriši
          </button>

        </div>

      </article>
    `;
  }).join("");
}

// ==================================================
// FAZA 1 - DOSIJE PREDMETA
// ==================================================

function dosijePolje(label, value) {
  return `
    <div class="dosije-polje">
      <span class="dosije-label">
        ${escapeHTML(label)}
      </span>

      <strong class="dosije-value">
        ${escapeHTML(value || "Nije uneto")}
      </strong>
    </div>
  `;
}

function dosijeSekcija(title, content) {
  return `
    <section class="dosije-sekcija">
      <h3>${escapeHTML(title)}</h3>
      <div class="dosije-grid">
        ${content}
      </div>
    </section>
  `;
}

function dosijeDokumentiHTML(files) {
  if (!files.length) {
    return `
      <p class="dosije-prazno">
        Uz ovaj predmet trenutno nema
        priloženih dokumenata.
      </p>
    `;
  }

  return files.map(f => {
    const id = Number(f.id);

    return `
      <div class="dosije-dokument">

        <div class="dosije-dokument-info">
          <strong>
            📄 ${escapeHTML(f.naziv)}
          </strong>

          <span>
            ${formatSize(f.velicina)}
            ·
            ${escapeHTML(f.mime_type)}
          </span>
        </div>

        <button
          type="button"
          class="btn btn-secondary btn-small"
          data-dosije-action="download"
          data-id="${id}"
        >
          ⬇️ Preuzmi
        </button>

      </div>
    `;
  }).join("");
}

function renderDosije(p, files) {
  const el = $("dosije-sadrzaj");
  if (!el) return;

  const rok = stanjeRoka(p);
  const id = Number(p.id);

  const osnovni = [
    dosijePolje(
      "Broj predmeta",
      p.interni_broj
    ),
    dosijePolje(
      "Vrsta predmeta",
      p.vrsta_predmeta
    ),
    dosijePolje(
      "Stranka / investitor",
      p.investor
    ),
    dosijePolje(
      "Nadležni organ",
      p.nadlezni_organ
    ),
    dosijePolje(
      "Obrađivač",
      p.obradjivac
    ),
    dosijePolje(
      "Potpisnik",
      p.potpisnik
    )
  ].join("");

  const datumi = [
    dosijePolje(
      "Datum prijema",
      datumTekst(p.datum_prijema)
    ),
    dosijePolje(
      "Rok za postupanje",
      datumTekst(p.rok_datum)
    ),
    dosijePolje(
      "Status predmeta",
      p.status
    ),
    dosijePolje(
      "Stanje roka",
      rok.tekst
    )
  ].join("");

  const imaCeop = Boolean(
    p.ceop_broj ||
    p.rop_broj ||
    p.opstina ||
    p.katastarska_opstina ||
    p.broj_parcele ||
    p.vrsta_predmeta ===
      "CEOP i Građevinski postupak"
  );

  const ceop = [
    dosijePolje(
      "CEOP broj",
      p.ceop_broj
    ),
    dosijePolje(
      "ROP broj",
      p.rop_broj
    ),
    dosijePolje(
      "Grad / opština",
      p.opstina
    ),
    dosijePolje(
      "Katastarska opština",
      p.katastarska_opstina
    ),
    dosijePolje(
      "Broj parcele",
      p.broj_parcele
    )
  ].join("");

  el.innerHTML = `
    <div class="dosije-zaglavlje">

      <div>
        <p class="dosije-putanja">
          ROKOVNIK PRO / DOSIJE PREDMETA
        </p>

        <h2>
          ${escapeHTML(p.naziv_predmeta)}
        </h2>

        <p>
          Predmet:
          <strong>
            ${escapeHTML(p.interni_broj)}
          </strong>
        </p>
      </div>

      <span class="badge ${
        rok.klasa === "danger"
          ? "badge-danger"
          : ""
      }">
        ${escapeHTML(p.status)}
      </span>

    </div>

    ${dosijeSekcija(
      "Osnovni podaci",
      osnovni
    )}

    ${dosijeSekcija(
      "Datumi, status i rokovi",
      datumi
    )}

    ${
      imaCeop
        ? dosijeSekcija(
            "CEOP i podaci o lokaciji",
            ceop
          )
        : ""
    }

    <section class="dosije-sekcija">

      <h3>Napomene i tok postupka</h3>

      <div class="dosije-napomena">
        ${
          p.napomena
            ? escapeHTML(p.napomena)
            : "Nema unetih napomena."
        }
      </div>

    </section>

    <section class="dosije-sekcija">

      <div class="dosije-sekcija-header">
        <h3>
          📎 Dokumentacija
          (${files.length})
        </h3>
      </div>

      <div class="dosije-dokumenti">
        ${dosijeDokumentiHTML(files)}
      </div>

    </section>

    <div class="dosije-komande">

      <button
        type="button"
        class="btn btn-secondary"
        data-dosije-action="back"
      >
        ← Nazad na registar
      </button>

      <button
        type="button"
        class="btn btn-primary"
        data-dosije-action="edit"
        data-id="${id}"
      >
        ✏️ Izmeni predmet
      </button>

      <button
        type="button"
        class="btn btn-secondary"
        data-dosije-action="documents"
        data-id="${id}"
      >
        📎 Dokumenti
      </button>

      <button
        type="button"
        class="btn btn-secondary"
        data-dosije-action="mail"
        data-id="${id}"
      >
        ✉️ E-mail
      </button>

    </div>
  `;
}

async function openDosije(id) {
  const tab = $("tab-dosije");
  const content = $("dosije-sadrzaj");

  if (!tab || !content) {
    showMessage(
      "Potrebno je postaviti novi index.html " +
      "sa ekranom dosijea predmeta.",
      true
    );
    return;
  }

  aktivniDosijeId = id;

  document.querySelectorAll(
    ".tab-content"
  ).forEach(el => {
    el.classList.add("hidden");
  });

  document.querySelectorAll(
    ".tab-btn"
  ).forEach(el => {
    el.classList.remove("active");
  });

  tab.classList.remove("hidden");

  content.innerHTML = `
    <div class="card">
      Učitavanje dosijea predmeta...
    </div>
  `;

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  try {
    const [p, files] = await Promise.all([
      api(`/api/predmeti/${id}`),
      api(`/api/predmeti/${id}/prilozi`)
    ]);

    if (aktivniDosijeId !== id) {
      return;
    }

    trenutniDokumenti = files;

    renderDosije(p, files);

  } catch (err) {
    content.innerHTML = `
      <div class="card">
        <p>
          ${escapeHTML(err.message)}
        </p>
      </div>
    `;
  }
}

function closeDosije() {
  aktivniDosijeId = null;

  openTab(
    "tab-registar",
    document.querySelector(
      '[data-tab="tab-registar"]'
    )
  );

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

async function handleDosijeClick(e) {
  const btn = e.target.closest(
    "button[data-dosije-action]"
  );

  if (!btn) return;

  const action = btn.dataset.dosijeAction;
  const id = Number(btn.dataset.id);

  if (action === "back") {
    closeDosije();
  }

  if (action === "edit") {
    aktivniDosijeId = null;
    editPredmet(id);
  }

  if (action === "documents") {
    aktivniDosijeId = null;
    await openDocumentsTab(id);
  }

  if (action === "mail") {
    sendPredmetMail(id);
  }

  if (action === "download") {
    await downloadDocument(id);
  }
}

// ==================================================
// IZMENA PREDMETA
// ==================================================

function editPredmet(id) {
  const p = findPredmet(id);

  if (!p) {
    showMessage(
      "Predmet nije pronađen.",
      true
    );
    return;
  }

  if ($("edit-id")) {
    $("edit-id").value = p.id;
  }

  POLJA.forEach(key => {
    if ($(key)) {
      $(key).value = p[key] || "";
    }
  });

  showCeopFields();

  if ($("form-title")) {
    $("form-title").textContent =
      "✏️ Izmena predmeta";
  }

  $("cancel-btn")?.classList.remove(
    "hidden"
  );

  openTab(
    "tab-predmeti",
    document.querySelector(
      '[data-tab="tab-predmeti"]'
    )
  );

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function resetForm() {
  $("predmet-form")?.reset();

  if ($("edit-id")) {
    $("edit-id").value = "";
  }

  if ($("datum_prijema")) {
    $("datum_prijema").value = danas();
  }

  if ($("form-title")) {
    $("form-title").textContent =
      "➕ Novi predmet";
  }

  $("cancel-btn")?.classList.add(
    "hidden"
  );

  updateFileCount();
  showCeopFields();
}

// ==================================================
// BRISANJE PREDMETA
// ==================================================

async function deletePredmet(id) {
  const p = findPredmet(id);
  if (!p) return;

  const confirmed = confirm(
    `Trajno obrisati predmet ` +
    `"${p.naziv_predmeta}" ` +
    "i sve njegove dokumente?"
  );

  if (!confirmed) return;

  try {
    await api(`/api/predmeti/${id}`, {
      method: "DELETE"
    });

    await refreshAll();

    showMessage(
      "Predmet je uspešno obrisan."
    );

  } catch (err) {
    showMessage(err.message, true);
  }
}

// ==================================================
// DOKUMENTACIJA
// ==================================================

function updateFileCount() {
  const count =
    $("files-new")?.files?.length || 0;

  if ($("files-count")) {
    $("files-count").textContent = count
      ? `Izabrano dokumenata: ${count}`
      : "Nema izabranih dokumenata.";
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(
        new Error(
          "Dokument ne može da se pročita."
        )
      );
    };

    reader.readAsDataURL(file);
  });
}

async function uploadSingleDocument(
  predmetId,
  file
) {
  const allowed = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!allowed.includes(file.type)) {
    throw new Error(
      "Dozvoljeni su PDF, JPG, PNG i WEBP."
    );
  }

  if (file.size > 7 * 1024 * 1024) {
    throw new Error(
      "Dokument je veći od 7 MB."
    );
  }

  const base64 = await fileToBase64(file);

  return api(
    `/api/predmeti/${predmetId}/prilozi`,
    {
      method: "POST",
      body: JSON.stringify({
        naziv: file.name,
        mime_type: file.type,
        data_base64: base64
      })
    }
  );
}

function populatePredmetSelect() {
  const select = $("dokument-predmet");
  if (!select) return;

  const previous = select.value;

  select.innerHTML = "";

  const empty = document.createElement(
    "option"
  );

  empty.value = "";
  empty.textContent = "Izaberi predmet...";

  select.appendChild(empty);

  predmetiSvi.forEach(p => {
    const option = document.createElement(
      "option"
    );

    option.value = p.id;

    option.textContent =
      `${p.interni_broj} — ` +
      p.naziv_predmeta;

    select.appendChild(option);
  });

  if (
    predmetiSvi.some(
      p => String(p.id) === previous
    )
  ) {
    select.value = previous;
  }
}

async function openDocumentsTab(id) {
  openTab(
    "tab-dokumenti",
    document.querySelector(
      '[data-tab="tab-dokumenti"]'
    )
  );

  const select = $("dokument-predmet");

  if (select) {
    select.value = String(id);
  }

  await loadDocuments();
}

async function loadDocuments() {
  const predmetId =
    $("dokument-predmet")?.value;

  const el = $("dokumenti-lista");

  if (!el) return;

  if (!predmetId) {
    trenutniDokumenti = [];
    el.textContent = "Izaberi predmet.";
    return;
  }

  el.textContent =
    "Učitavanje dokumenata...";

  try {
    const files = await api(
      `/api/predmeti/${predmetId}/prilozi`
    );

    trenutniDokumenti = files;

    if (!files.length) {
      el.textContent =
        "Nema priloženih dokumenata.";
      return;
    }

    el.innerHTML = files.map(f => `
      <div class="file-item">

        <strong>
          📄 ${escapeHTML(f.naziv)}
        </strong>

        <p>
          ${formatSize(f.velicina)}
          ·
          ${escapeHTML(f.mime_type)}
        </p>

        <div class="actions">

          <button
            type="button"
            class="btn btn-secondary btn-small"
            data-action="download"
            data-id="${Number(f.id)}"
          >
            ⬇️ Preuzmi
          </button>

          <button
            type="button"
            class="btn btn-danger btn-small"
            data-action="delete"
            data-id="${Number(f.id)}"
          >
            🗑️ Obriši
          </button>

        </div>

      </div>
    `).join("");

  } catch (err) {
    el.textContent = err.message;
  }
}

async function handleDocumentClick(e) {
  const btn = e.target.closest(
    "button[data-action]"
  );

  if (!btn) return;

  const id = Number(btn.dataset.id);

  if (btn.dataset.action === "download") {
    await downloadDocument(id);
  }

  if (btn.dataset.action === "delete") {
    await deleteDocument(id);
  }
}

async function uploadDocumentsFromTab() {
  const predmetId =
    $("dokument-predmet")?.value;

  const files = Array.from(
    $("dokument-file")?.files || []
  );

  if (!predmetId) {
    showMessage(
      "Izaberi predmet.",
      true
    );
    return;
  }

  if (!files.length) {
    showMessage(
      "Izaberi dokumente.",
      true
    );
    return;
  }

  const btn = $("upload-btn");

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Slanje...";
  }

  let success = 0;
  const errors = [];

  try {
    for (const file of files) {
      try {
        await uploadSingleDocument(
          predmetId,
          file
        );

        success++;
      } catch (err) {
        errors.push(
          `${file.name}: ${err.message}`
        );
      }
    }

    if ($("dokument-file")) {
      $("dokument-file").value = "";
    }

    await loadDocuments();
    await refreshAll();

    showMessage(
      `Dodato dokumenata: ${success}.` +
      (
        errors.length
          ? ` Greške: ${errors.join("; ")}`
          : ""
      ),
      errors.length > 0
    );

  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent =
        "📤 Sačuvaj dokument";
    }
  }
}

async function downloadDocument(id) {
  try {
    const response = await fetch(
      `/api/prilozi/${id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        cache: "no-store"
      }
    );

    if (response.status === 401) {
      logout();

      throw new Error(
        "Sesija je istekla."
      );
    }

    if (!response.ok) {
      throw new Error(
        "Preuzimanje nije uspelo."
      );
    }

    const blob = await response.blob();

    const file = trenutniDokumenti.find(
      f => Number(f.id) === Number(id)
    );

    const name =
      file?.naziv || `prilog-${id}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = name;

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(
      () => URL.revokeObjectURL(url),
      60000
    );

  } catch (err) {
    showMessage(err.message, true);
  }
}

async function deleteDocument(id) {
  if (!confirm(
    "Trajno obrisati dokument?"
  )) {
    return;
  }

  try {
    await api(`/api/prilozi/${id}`, {
      method: "DELETE"
    });

    await loadDocuments();
    await refreshAll();

    showMessage(
      "Dokument je obrisan."
    );

  } catch (err) {
    showMessage(err.message, true);
  }
}

// ==================================================
// ROKOVI
// ==================================================

function renderCalendar() {
  const el = $("kalendar-lista");
  if (!el) return;

  const list = predmetiSvi
    .filter(p => p.rok_datum)
    .sort((a, b) =>
      String(a.rok_datum).localeCompare(
        String(b.rok_datum)
      )
    );

  if (!list.length) {
    el.textContent =
      "Nema predmeta sa definisanim rokom.";
    return;
  }

  el.innerHTML = list.map(p => {
    const stanje = stanjeRoka(p);

    return `
      <div class="predmet">

        <div style="
          display:flex;
          justify-content:space-between;
          gap:10px;
          flex-wrap:wrap;
        ">

          <h3>
            ${escapeHTML(p.naziv_predmeta)}
          </h3>

          <span class="badge ${
            stanje.klasa === "danger"
              ? "badge-danger"
              : ""
          }">
            ${escapeHTML(stanje.tekst)}
          </span>

        </div>

        <p>
          <b>Broj:</b>
          ${escapeHTML(p.interni_broj)}
        </p>

        <p>
          <b>Rok:</b>
          ${datumTekst(p.rok_datum)}
        </p>

        <p>
          <b>Status:</b>
          ${escapeHTML(p.status)}
        </p>

      </div>
    `;
  }).join("");
}

// ==================================================
// ANALITIKA
// ==================================================

function renderAnalytics() {
  const expired = predmetiSvi.filter(
    p => stanjeRoka(p).klasa === "danger"
  ).length;

  const values = {
    "st-ukupno": predmetiSvi.length,

    "st-uradu": predmetiSvi.filter(
      p => p.status === "U radu"
    ).length,

    "st-isteklo": expired,

    "st-zavrseno": predmetiSvi.filter(
      p => p.status === "Završeno / Odobreno"
    ).length
  };

  Object.entries(values).forEach(
    ([id, value]) => {
      if ($(id)) {
        $(id).textContent = value;
      }
    }
  );
}

// ==================================================
// ADMINISTRACIJA KORISNIKA
// ==================================================

async function loadUsers() {
  const el = $("users-list");
  if (!el) return;

  if (
    trenutniKorisnik?.username !== "admin"
  ) {
    el.textContent =
      "Pristup nije dozvoljen.";
    return;
  }

  try {
    const users = await api("/api/users");

    el.innerHTML = users.map(u => `
      <div class="file-item">

        <strong>
          👤 ${escapeHTML(u.username)}
        </strong>

        <p>
          ID: ${escapeHTML(u.id)}
        </p>

      </div>
    `).join("");

  } catch (err) {
    el.textContent = err.message;
  }
}

async function createUser(e) {
  e.preventDefault();

  const username =
    $("new-username")?.value.trim();

  const password =
    $("new-password")?.value;

  if (!username || !password) {
    showMessage(
      "Unesi korisničko ime i lozinku.",
      true
    );
    return;
  }

  try {
    await api("/api/users", {
      method: "POST",
      body: JSON.stringify({
        username,
        password
      })
    });

    $("new-user-form")?.reset();

    await loadUsers();

    showMessage(
      `Korisnik "${username}" je kreiran.`
    );

  } catch (err) {
    showMessage(err.message, true);
  }
}

// ==================================================
// CSV IZVOZ
// ==================================================

function csvCell(value) {
  let s = String(
    value == null ? "" : value
  );

  if (/^\s*[=+\-@]/.test(s)) {
    s = "'" + s;
  }

  return `"${s.replace(/"/g, '""')}"`;
}

function exportCSV() {
  if (!predmetiSvi.length) {
    showMessage(
      "Nema predmeta za izvoz.",
      true
    );
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
    ["napomena", "Napomena"],
    ["ceop_broj", "CEOP broj"],
    ["rop_broj", "ROP broj"],
    ["opstina", "Opština"],
    [
      "katastarska_opstina",
      "Katastarska opština"
    ],
    ["broj_parcele", "Parcela"],
    ["nadlezni_organ", "Nadležni organ"]
  ];

  const rows = [
    fields.map(
      f => csvCell(f[1])
    ).join(";"),

    ...predmetiSvi.map(p =>
      fields.map(
        f => csvCell(p[f[0]])
      ).join(";")
    )
  ];

  const blob = new Blob(
    ["\uFEFF" + rows.join("\r\n")],
    {
      type: "text/csv;charset=utf-8"
    }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = "rokovnik_predmeti.csv";

  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(
    () => URL.revokeObjectURL(url),
    60000
  );
}

// ==================================================
// E-MAIL
// ==================================================

function sendPredmetMail(id) {
  const p = findPredmet(id);
  if (!p) return;

  const address = prompt(
    "E-mail primaoca:",
    ""
  );

  if (!address) return;

  const text = [
    "PREGLED PREDMETA",
    "",
    `Broj: ${p.interni_broj}`,
    `Naziv: ${p.naziv_predmeta}`,
    `Vrsta: ${p.vrsta_predmeta}`,
    `Stranka: ${p.investor || "/"}`,
    `Obrađivač: ${p.obradjivac || "/"}`,
    `Potpisnik: ${p.potpisnik || "/"}`,
    `Prijem: ${datumTekst(p.datum_prijema)}`,
    `Rok: ${datumTekst(p.rok_datum)}`,
    `Status: ${p.status}`,
    `Napomena: ${p.napomena || "/"}`
  ].join("\n");

  window.location.href =
    `mailto:${encodeURIComponent(address)}` +
    `?subject=${encodeURIComponent(
      `Predmet ${p.interni_broj}: ` +
      p.naziv_predmeta
    )}` +
    `&body=${encodeURIComponent(text)}`;
}

function sendSummaryMail() {
  if (!predmetiSvi.length) {
    showMessage(
      "Nema predmeta.",
      true
    );
    return;
  }

  const address = prompt(
    "E-mail primaoca:",
    ""
  );

  if (!address) return;

  const text = [
    "ZBIRNI IZVEŠTAJ ROKOVNIKA",
    "",
    `Datum: ${datumTekst(danas())}`,
    `Ukupno: ${predmetiSvi.length}`,
    "",
    ...predmetiSvi.map((p, i) =>
      `${i + 1}. ` +
      `${p.interni_broj} — ` +
      `${p.naziv_predmeta}\n` +
      `Status: ${p.status}\n` +
      `Rok: ${datumTekst(p.rok_datum)}\n`
    )
  ].join("\n");

  window.location.href =
    `mailto:${encodeURIComponent(address)}` +
    "?subject=" +
    encodeURIComponent(
      "Zbirni izveštaj Rokovnika"
    ) +
    "&body=" +
    encodeURIComponent(text);
}
