
"use strict";

/*
  UNIVERZALNI ROKOVNIK PRO 2.0
  FAZA 3 - DOSIJE, ISTORIJA I TOK POSTUPANJA

  Backend:
  Node.js / Express / PostgreSQL

  Frontend:
  public/index.html
  public/app.js
*/

const API = "/api";

let token = sessionStorage.getItem("rokovnik_token") || "";
let predmetiSvi = [];
let trenutniDokumenti = [];
let dosijeDokumenti = [];
let dosijeAktivnosti = [];
let aktivnostUObradi = false;
let trenutniKorisnik = null;
let aktivniDosijeId = null;
let aktivniTabPreDosijea = "tab-registar";
let zauzet = false;

const polja = [
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

const naziviPolja = {
  vrsta_predmeta: "Vrsta predmeta",
  interni_broj: "Broj predmeta",
  naziv_predmeta: "Naziv predmeta",
  investor: "Stranka / investitor",
  obradjivac: "Obrađivač",
  potpisnik: "Potpisnik",
  datum_prijema: "Datum prijema",
  rok_datum: "Rok za postupanje",
  status: "Status",
  napomena: "Napomena",
  ceop_broj: "CEOP broj",
  rop_broj: "ROP broj",
  opstina: "Grad / opština",
  katastarska_opstina: "Katastarska opština",
  broj_parcele: "Broj parcele",
  nadlezni_organ: "Nadležni organ"
};

const $ = id => document.getElementById(id);

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function datum(value) {
  if (!value) return "—";

  const text = String(value).slice(0, 10);
  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (match) {
    return (
      match[3] + "." +
      match[2] + "." +
      match[1] + "."
    );
  }

  const d = new Date(value);

  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString("sr-RS");
}

function datumVreme(value) {
  if (!value) return "—";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return String(value);
  }

  return d.toLocaleString("sr-RS", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function prikazVrednosti(value, key = "") {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  if (
    key === "datum_prijema" ||
    key === "rok_datum"
  ) {
    return datum(value);
  }

  return String(value);
}

function todayISO() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(
    now.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    now.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function message(text, error = false) {
  const el = $("app-message");

  if (!el) return;

  el.textContent = text;
  el.classList.remove("hidden");
  el.classList.toggle("error", error);

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function clearMessage() {
  const el = $("app-message");

  if (el) {
    el.classList.add("hidden");
    el.textContent = "";
  }
}

async function api(url, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = "Bearer " + token;
  }

  if (
    options.body !== undefined &&
    !headers["Content-Type"]
  ) {
    headers["Content-Type"] =
      "application/json";
  }

  let response;

  try {
    response = await fetch(API + url, {
      ...options,
      headers
    });
  } catch {
    throw new Error(
      "Nema veze sa serverom. Proveri internet."
    );
  }

  if (response.status === 401) {
    logout(false);
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
      "Server je vratio grešku " +
      response.status
    );
  }

  return data;
}

function showApp(user) {
  trenutniKorisnik = user;

  $("login-screen")?.classList.add("hidden");
  $("app-screen")?.classList.remove("hidden");

  if ($("current-user")) {
    $("current-user").textContent =
      user?.username || "";
  }

  $("admin-tab")?.classList.toggle(
    "hidden",
    user?.username !== "admin"
  );

  switchTab("tab-registar");
}

function logout(showNotice = true) {
  token = "";
  trenutniKorisnik = null;
  predmetiSvi = [];
  trenutniDokumenti = [];
  dosijeDokumenti = [];
  dosijeAktivnosti = [];
  aktivniDosijeId = null;

  sessionStorage.removeItem("rokovnik_token");

  $("app-screen")?.classList.add("hidden");
  $("login-screen")?.classList.remove("hidden");

  const error = $("login-error");

  if (error) {
    error.textContent = showNotice
      ? ""
      : "Prijavi se ponovo.";

    error.classList.toggle(
      "hidden",
      showNotice
    );
  }
}

async function login(event) {
  event.preventDefault();

  const username = $("username")?.value.trim();
  const password = $("password")?.value;

  const error = $("login-error");

  if (error) {
    error.classList.add("hidden");
  }

  try {
    const result = await api("/login", {
      method: "POST",
      body: JSON.stringify({
        username,
        password
      })
    });

    token = result.token;
    sessionStorage.setItem(
      "rokovnik_token",
      token
    );

    const me = await api("/me");

    showApp(me.user);

    if ($("password")) {
      $("password").value = "";
    }

    await refreshAll();
  } catch (err) {
    if (error) {
      error.textContent = err.message;
      error.classList.remove("hidden");
    }
  }
}

function switchTab(id) {
  document.querySelectorAll(
    ".tab-content"
  ).forEach(section => {
    section.classList.toggle(
      "hidden",
      section.id !== id
    );
  });

  document.querySelectorAll(
    ".tab-btn"
  ).forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.tab === id
    );
  });

  clearMessage();

  if (id === "tab-rokovi") {
    renderCalendar();
  }

  if (id === "tab-analitika") {
    renderAnalytics();
  }

  if (id === "tab-dokumenti") {
    populateDocumentSelect();
  }

  if (id === "tab-admin") {
    loadUsers();
  }
}

async function refreshAll() {
  try {
    const result = await api("/predmeti");

    predmetiSvi = Array.isArray(result)
      ? result
      : [];

    renderPredmeti();
    populateDocumentSelect();
    renderCalendar();
    renderAnalytics();
  } catch (err) {
    message(err.message, true);
  }
}

function findPredmet(id) {
  return predmetiSvi.find(
    p => String(p.id) === String(id)
  );
}

function getFormData() {
  const data = {};

  for (const key of polja) {
    data[key] = $(key)?.value ?? "";
  }

  return data;
}

function setFormData(predmet) {
  for (const key of polja) {
    if ($(key)) {
      $(key).value =
        predmet[key] == null
          ? ""
          : String(predmet[key]).slice(
              0,
              key === "datum_prijema" ||
              key === "rok_datum"
                ? 10
                : undefined
            );
    }
  }

  updateCeop();
}

function updateCeop() {
  const vrsta =
    $("vrsta_predmeta")?.value || "";

  const ceop = /CEOP|građevinsk/i.test(
    vrsta
  );

  $("ceop-modul")?.classList.toggle(
    "hidden",
    !ceop
  );
}

function resetForm() {
  $("predmet-form")?.reset();

  if ($("edit-id")) {
    $("edit-id").value = "";
  }

  if ($("form-title")) {
    $("form-title").textContent =
      "➕ Novi predmet";
  }

  if ($("save-btn")) {
    $("save-btn").textContent =
      "💾 Sačuvaj predmet";
  }

  $("cancel-btn")?.classList.add("hidden");

  if ($("datum_prijema")) {
    $("datum_prijema").value = todayISO();
  }

  if ($("files-count")) {
    $("files-count").textContent =
      "Nema izabranih dokumenata.";
  }

  updateCeop();
}

function editPredmet(id) {
  const predmet = findPredmet(id);

  if (!predmet) {
    message("Predmet nije pronađen.", true);
    return;
  }

  setFormData(predmet);

  $("edit-id").value = predmet.id;

  $("form-title").textContent =
    "✏️ Izmena predmeta";

  $("save-btn").textContent =
    "💾 Sačuvaj izmene";

  $("cancel-btn")?.classList.remove("hidden");

  switchTab("tab-predmeti");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const value = String(reader.result);
      resolve(value.split(",")[1] || "");
    };

    reader.onerror = () => {
      reject(new Error(
        "Neuspešno čitanje dokumenta."
      ));
    };

    reader.readAsDataURL(file);
  });
}

function validateFile(file) {
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

  if (
    file.size === 0 ||
    file.size > 7 * 1024 * 1024
  ) {
    throw new Error(
      "Dokument mora biti do 7 MB."
    );
  }
}

async function uploadFile(predmetId, file) {
  validateFile(file);

  const data = await fileToBase64(file);

  return api(
    `/predmeti/${predmetId}/prilozi`,
    {
      method: "POST",
      body: JSON.stringify({
        naziv: file.name,
        mime_type: file.type,
        data_base64: data
      })
    }
  );
}

async function savePredmet(event) {
  event.preventDefault();

  if (zauzet) return;

  const editId = $("edit-id")?.value;
  const data = getFormData();

  if (
    !data.interni_broj.trim() ||
    !data.naziv_predmeta.trim() ||
    !data.datum_prijema
  ) {
    message(
      "Popuni broj, naziv i datum prijema.",
      true
    );
    return;
  }

  const files = Array.from(
    $("files-new")?.files || []
  );

  try {
    files.forEach(validateFile);
  } catch (err) {
    message(err.message, true);
    return;
  }

  zauzet = true;

  if ($("save-btn")) {
    $("save-btn").disabled = true;
  }

  try {
    const result = await api(
      editId
        ? `/predmeti/${editId}`
        : "/predmeti",
      {
        method: editId ? "PUT" : "POST",
        body: JSON.stringify(data)
      }
    );

    const predmetId = editId || result.id;

    let uploaded = 0;
    let failed = 0;

    for (const file of files) {
      try {
        await uploadFile(predmetId, file);
        uploaded++;
      } catch (err) {
        failed++;
        console.error(
          "Greška pri slanju dokumenta:",
          err
        );
      }
    }

    await refreshAll();
    resetForm();
    switchTab("tab-registar");

    if (failed) {
      message(
        `Predmet je sačuvan. Dokumenti: ${uploaded} uspešno, ${failed} neuspešno. Proveri dokumentaciju.`,
        true
      );
    } else {
      message(
        editId
          ? "Izmene su sačuvane i evidentirane u istoriji."
          : "Predmet je uspešno kreiran."
      );
    }
  } catch (err) {
    message(err.message, true);
  } finally {
    zauzet = false;

    if ($("save-btn")) {
      $("save-btn").disabled = false;
    }
  }
}

async function deletePredmet(id) {
  const p = findPredmet(id);

  if (!p) return;

  const confirmed = confirm(
    `Trajno obrisati predmet "${p.naziv_predmeta}"?\n\nBiće obrisani i svi dokumenti. Ostaće samo zapis o brisanju u istoriji baze.`
  );

  if (!confirmed) return;

  try {
    await api(
      `/predmeti/${id}`,
      { method: "DELETE" }
    );

    if (
      String(aktivniDosijeId) === String(id)
    ) {
      aktivniDosijeId = null;
    }

    await refreshAll();
    switchTab("tab-registar");

    message("Predmet je obrisan.");
  } catch (err) {
    message(err.message, true);
  }
}

// ========================================
// PREGLED PREDMETA
// ========================================

function filteredPredmeti() {
  const search = (
    $("search")?.value || ""
  ).trim().toLowerCase();

  const vrsta =
    $("filter-vrsta")?.value || "";

  const status =
    $("filter-status")?.value || "";

  return predmetiSvi.filter(p => {
    if (
      vrsta &&
      p.vrsta_predmeta !== vrsta
    ) {
      return false;
    }

    if (
      status &&
      p.status !== status
    ) {
      return false;
    }

    if (!search) return true;

    return polja.some(key =>
      String(p[key] ?? "")
        .toLowerCase()
        .includes(search)
    );
  });
}

function renderPredmeti() {
  const container = $("predmeti-lista");

  if (!container) return;

  const items = filteredPredmeti();

  if (!items.length) {
    container.innerHTML = `
      <div class="card">
        Nema predmeta za prikaz.
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(p => {
    const expired =
      p.rok_datum &&
      p.rok_datum < todayISO() &&
      ![
        "Završeno / Odobreno",
        "Arhivirano"
      ].includes(p.status);

    return `
      <article class="predmet">
        <h3>${escapeHTML(p.naziv_predmeta)}</h3>

        <p>
          <b>Broj:</b>
          ${escapeHTML(p.interni_broj)}
        </p>

        <p>
          <b>Vrsta:</b>
          ${escapeHTML(p.vrsta_predmeta || "—")}
        </p>

        <p>
          <b>Stranka:</b>
          ${escapeHTML(p.investor || "—")}
        </p>

        <p>
          <b>Rok:</b>
          ${escapeHTML(datum(p.rok_datum))}
        </p>

        <p>
          <span class="badge ${expired ? "badge-danger" : ""}">
            ${escapeHTML(p.status || "U radu")}
          </span>
          ${expired
            ? '<span class="badge badge-danger">Istekao rok</span>'
            : ""}
        </p>

        <p>
          <b>Dokumenti:</b>
          ${Number(p.broj_dokumenata) || 0}
        </p>

        <div class="actions">
          <button
            type="button"
            class="btn btn-primary btn-small"
            data-action="dosije"
            data-id="${escapeHTML(p.id)}"
          >
            📂 Pregled / Dosije
          </button>

          <button
            type="button"
            class="btn btn-secondary btn-small"
            data-action="edit"
            data-id="${escapeHTML(p.id)}"
          >
            ✏️ Izmeni
          </button>

          <button
            type="button"
            class="btn btn-danger btn-small"
            data-action="delete"
            data-id="${escapeHTML(p.id)}"
          >
            🗑 Obriši
          </button>
        </div>
      </article>
    `;
  }).join("");
}

// ========================================
// DOSIJE PREDMETA
// ========================================

function dosijePolje(key, value) {
  return `
    <div class="dosije-polje">
      <span class="dosije-label">
        ${escapeHTML(naziviPolja[key] || key)}
      </span>

      <span class="dosije-value">
        ${escapeHTML(prikazVrednosti(value, key))}
      </span>
    </div>
  `;
}

function dosijeSekcija(title, keys, p) {
  return `
    <section class="dosije-sekcija">
      <h3>${escapeHTML(title)}</h3>

      <div class="dosije-grid">
        ${keys.map(key =>
          dosijePolje(key, p[key])
        ).join("")}
      </div>
    </section>
  `;
}

async function openDosije(id) {
  aktivniDosijeId = id;
  aktivniTabPreDosijea = "tab-registar";

  switchTab("tab-dosije");

  const container = $("dosije-sadrzaj");

  if (container) {
    container.innerHTML =
      "<p>Učitavanje dosijea i istorije...</p>";
  }

  try {
    const [predmet, dokumenti, istorija, aktivnosti] =
      await Promise.all([
        api(`/predmeti/${id}`),
        api(`/predmeti/${id}/prilozi`),
        api(`/predmeti/${id}/istorija`),
        api(`/predmeti/${id}/aktivnosti`)
      ]);

    if (
      String(aktivniDosijeId) !== String(id)
    ) {
      return;
    }

    dosijeDokumenti = Array.isArray(dokumenti) ? dokumenti : [];
    dosijeAktivnosti = Array.isArray(aktivnosti) ? aktivnosti : [];
    renderDosije(
      predmet,
      dosijeDokumenti,
      istorija,
      dosijeAktivnosti
    );
  } catch (err) {
    if (container) {
      container.textContent =
        "Greška: " + err.message;
    }
  }
}

function renderDosije(
  p,
  dokumenti = [],
  istorija = [],
  aktivnosti = []
) {
  const container = $("dosije-sadrzaj");

  if (!container) return;

  const osnovna = [
    "vrsta_predmeta",
    "interni_broj",
    "investor",
    "nadlezni_organ",
    "obradjivac",
    "potpisnik"
  ];

  const rokovi = [
    "datum_prijema",
    "rok_datum",
    "status"
  ];

  const ceop = [
    "ceop_broj",
    "rop_broj",
    "opstina",
    "katastarska_opstina",
    "broj_parcele"
  ];

  const hasCeop = ceop.some(
    key => p[key]
  );

  container.innerHTML = `
    <div class="dosije-zaglavlje">
      <div>
        <p class="dosije-putanja">
          ELEKTRONSKI DOSIJE PREDMETA
        </p>

        <h2>
          ${escapeHTML(p.naziv_predmeta)}
        </h2>

        <p>
          Broj:
          <strong>
            ${escapeHTML(p.interni_broj)}
          </strong>
        </p>
      </div>

      <span class="badge">
        ${escapeHTML(p.status)}
      </span>
    </div>

    ${dosijeSekcija(
      "1. Osnovni podaci",
      osnovna,
      p
    )}

    ${dosijeSekcija(
      "2. Status i rokovi",
      rokovi,
      p
    )}

    ${hasCeop
      ? dosijeSekcija(
          "3. CEOP i katastarski podaci",
          ceop,
          p
        )
      : ""}

    <section class="dosije-sekcija">
      <h3>📝 Napomene i tok postupka</h3>

      <div class="dosije-napomena">
        ${escapeHTML(p.napomena || "Nema napomena.")}
      </div>
    </section>

    <section class="dosije-sekcija" id="tok-postupanja">
      <div class="aktivnosti-heading">
        <h3>📋 Tok postupanja (${aktivnosti.length})</h3>
        <button type="button" class="btn btn-primary btn-small"
          data-action="aktivnost-nova">+ Dodaj aktivnost</button>
      </div>
      <p class="hint">Službene beleške, razgovori, sastanci, dopisi i sledeći koraci.</p>
      <div id="aktivnost-obrazac" class="hidden"></div>
      <div id="aktivnosti-lista">${renderAktivnosti(aktivnosti)}</div>
    </section>

    <section class="dosije-sekcija">
      <h3>
        📎 Dokumentacija
        (${dokumenti.length})
      </h3>

      <div class="dosije-dokumenti">
        ${renderDosijeDokumenti(dokumenti)}
      </div>

      <div class="actions">
        <button
          type="button"
          class="btn btn-secondary btn-small"
          data-action="documents"
          data-id="${escapeHTML(p.id)}"
        >
          + Dodaj dokument
        </button>
      </div>
    </section>

    <section class="dosije-sekcija">
      <h3>
        🕘 Istorija aktivnosti
        (${istorija.length})
      </h3>

      <p class="hint">
        Evidencija promena od aktiviranja
        funkcije istorije.
      </p>

      <div class="dosije-istorija">
        ${renderIstorija(istorija)}
      </div>
    </section>

    <div class="dosije-komande">
      <button
        type="button"
        class="btn btn-primary"
        data-action="edit"
        data-id="${escapeHTML(p.id)}"
      >
        ✏️ Izmeni predmet
      </button>

      <button
        type="button"
        class="btn btn-secondary"
        data-action="mail"
        data-id="${escapeHTML(p.id)}"
      >
        ✉️ Pošalji podatke
      </button>

      <button
        type="button"
        class="btn btn-secondary"
        data-action="print"
      >
        🖨 Štampaj dosije
      </button>

      <button
        type="button"
        class="btn btn-danger"
        data-action="delete"
        data-id="${escapeHTML(p.id)}"
      >
        🗑 Obriši predmet
      </button>
    </div>
  `;
}

function renderDosijeDokumenti(dokumenti) {
  if (!dokumenti.length) {
    return `
      <p class="dosije-prazno">
        Nema priloženih dokumenata.
      </p>
    `;
  }

  return dokumenti.map(d => `
    <div class="dosije-dokument">
      <div class="dosije-dokument-info">
        <strong>
          📄 ${escapeHTML(d.naziv)}
        </strong>

        <span>
          ${escapeHTML(datumVreme(d.created_at))}
          · ${formatBytes(d.velicina)}
        </span>
      </div>

      <button
        type="button"
        class="btn btn-secondary btn-small"
        data-action="download"
        data-id="${escapeHTML(d.id)}"
      >
        Preuzmi
      </button>
    </div>
  `).join("");
}

// ========================================
// FAZA 2 - ISTORIJA IZMENA
// ========================================

function historyActionName(action) {
  const names = {
    KREIRANJE: "Kreiranje predmeta",
    IZMENA: "Izmena podataka",
    BRISANJE: "Brisanje predmeta",
    DODAT_DOKUMENT: "Dodat dokument",
    OBRISAN_DOKUMENT: "Obrisan dokument",
    DODATA_AKTIVNOST: "Dodata službena aktivnost",
    IZMENA_AKTIVNOSTI: "Izmena službene aktivnosti",
    BRISANJE_AKTIVNOSTI: "Brisanje službene aktivnosti"
  };

  return names[action] || action;
}

function historyIcon(action) {
  const icons = {
    KREIRANJE: "➕",
    IZMENA: "✏️",
    BRISANJE: "🗑",
    DODAT_DOKUMENT: "📎",
    OBRISAN_DOKUMENT: "❌",
    DODATA_AKTIVNOST: "📋",
    IZMENA_AKTIVNOSTI: "✍️",
    BRISANJE_AKTIVNOSTI: "🗑"
  };

  return icons[action] || "🕘";
}

function renderIstorija(items) {
  if (!Array.isArray(items) || !items.length) {
    return `
      <p class="dosije-prazno">
        Još nema evidentiranih aktivnosti
        za ovaj predmet.
      </p>
    `;
  }

  return items.map(item => {
    const changes = Array.isArray(item.promene)
      ? item.promene
      : [];

    const changesHTML = changes.map(change => `
      <div class="istorija-promena">
        <strong>
          ${escapeHTML(
            change.naziv_polja ||
            naziviPolja[change.polje] ||
            change.polje
          )}
        </strong>

        <div class="istorija-vrednosti">
          <div>
            <small>Prethodno</small>
            <div class="istorija-staro">
              ${escapeHTML(
                prikazVrednosti(
                  change.stara_vrednost,
                  change.polje
                )
              )}
            </div>
          </div>

          <div>
            <small>Novo</small>
            <div class="istorija-novo">
              ${escapeHTML(
                prikazVrednosti(
                  change.nova_vrednost,
                  change.polje
                )
              )}
            </div>
          </div>
        </div>
      </div>
    `).join("");

    return `
      <article class="istorija-stavka">
        <div class="istorija-vrh">
          <strong>
            ${historyIcon(item.akcija)}
            ${escapeHTML(
              historyActionName(item.akcija)
            )}
          </strong>

          <span>
            ${escapeHTML(
              datumVreme(item.created_at)
            )}
          </span>
        </div>

        <div class="istorija-korisnik">
          👤 ${escapeHTML(item.username)}
        </div>

        <p>
          ${escapeHTML(item.opis)}
        </p>

        ${changes.length
          ? `
            <details class="istorija-detalji">
              <summary>
                Prikaži promene
                (${changes.length})
              </summary>

              ${changesHTML}
            </details>
          `
          : ""}
      </article>
    `;
  }).join("");
}

function injectHistoryStyles() {
  if ($("istorija-stil")) return;

  const style = document.createElement("style");
  style.id = "istorija-stil";

  style.textContent = `
    .istorija-stavka {
      padding: 17px;
      margin: 13px 0;
      border: 1px solid #dce4ec;
      border-left: 4px solid #2867a4;
      border-radius: 10px;
      background: #f9fbfd;
      overflow-wrap: anywhere;
    }

    .istorija-vrh {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      flex-wrap: wrap;
    }

    .istorija-vrh strong {
      color: #152b45;
      font-size: 14px;
    }

    .istorija-vrh span {
      font-size: 12px;
      color: #69798c;
    }

    .istorija-korisnik {
      color: #2867a4;
      font-size: 12px;
      font-weight: 700;
      margin-top: 7px;
    }

    .istorija-stavka p {
      margin: 9px 0 0;
      color: #34465b;
    }

    .istorija-detalji {
      margin-top: 13px;
      border-top: 1px solid #dce4ec;
      padding-top: 12px;
    }

    .istorija-detalji summary {
      color: #2867a4;
      font-weight: 700;
      cursor: pointer;
    }

    .istorija-promena {
      border-bottom: 1px solid #e0e7ef;
      padding: 13px 0;
    }

    .istorija-promena:last-child {
      border-bottom: none;
    }

    .istorija-promena > strong {
      display: block;
      margin-bottom: 9px;
      color: #152b45;
    }

    .istorija-vrednosti {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .istorija-vrednosti small {
      color: #69798c;
      display: block;
      margin-bottom: 5px;
    }

    .istorija-staro,
    .istorija-novo {
      padding: 10px;
      border-radius: 7px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font-size: 13px;
    }

    .istorija-staro {
      background: #fff0f0;
      color: #8b2929;
    }

    .istorija-novo {
      background: #eaf7ee;
      color: #176534;
    }

    @media (max-width: 600px) {
      .istorija-vrednosti {
        grid-template-columns: 1fr;
      }

      .istorija-stavka {
        padding: 13px;
      }
    }

    @media print {
      .app-header,
      .tabs,
      .dosije-toolbar,
      .dosije-komande,
      .footer {
        display: none !important;
      }

      body {
        background: white;
      }

      .main {
        max-width: none;
        padding: 0;
      }

      .dosije-kartica {
        border: none;
        box-shadow: none;
      }

      .dosije-sekcija {
        break-inside: avoid;
      }
    }
  `;

  document.head.appendChild(style);
}

function closeDosije() {
  aktivniDosijeId = null;
  switchTab(aktivniTabPreDosijea);
}


// ========================================
// FAZA 3 - TOK POSTUPANJA
// ========================================

const vrsteAktivnosti = [
  "Službena beleška", "Telefonski razgovor", "Sastanak",
  "Dopis", "Postupanje", "Drugo"
];

function renderAktivnosti(items) {
  if (!Array.isArray(items) || !items.length) {
    return '<p class="dosije-prazno">Nema evidentiranih aktivnosti.</p>';
  }

  return items.map(a => `
    <article class="aktivnost-kartica">
      <div class="aktivnost-vrh">
        <strong>${escapeHTML(a.vrsta)}</strong>
        <span>${escapeHTML(datum(a.datum_aktivnosti))}</span>
      </div>
      <p><b>Odgovorno lice:</b> ${escapeHTML(a.odgovorno_lice || "—")}</p>
      <p class="aktivnost-opis">${escapeHTML(a.opis)}</p>
      ${a.sledeci_korak ? `<p><b>Sledeći korak:</b> ${escapeHTML(a.sledeci_korak)}</p>` : ""}
      ${a.rok_sledeceg_koraka ? `<p><b>Rok sledećeg koraka:</b> ${escapeHTML(datum(a.rok_sledeceg_koraka))}</p>` : ""}
      <p class="aktivnost-meta">Uneo: ${escapeHTML(a.created_by_username || "—")} · ${escapeHTML(datumVreme(a.created_at))}</p>
      <div class="actions">
        <button type="button" class="btn btn-secondary btn-small"
          data-action="aktivnost-izmeni" data-id="${escapeHTML(a.id)}">✏️ Izmeni</button>
        <button type="button" class="btn btn-danger btn-small"
          data-action="aktivnost-obrisi" data-id="${escapeHTML(a.id)}">🗑 Obriši</button>
      </div>
    </article>
  `).join("");
}

function prikaziObrazacAktivnosti(id = null) {
  const container = $("aktivnost-obrazac");
  if (!container || !aktivniDosijeId) return;
  const a = id == null ? null : dosijeAktivnosti.find(
    x => String(x.id) === String(id)
  );
  if (id != null && !a) {
    message("Aktivnost nije pronađena.", true);
    return;
  }

  container.classList.remove("hidden");
  container.innerHTML = `
    <form id="aktivnost-form" class="aktivnost-form">
      <h4>${a ? "Izmena aktivnosti" : "Nova aktivnost"}</h4>
      <div class="aktivnost-grid">
        <label>Vrsta aktivnosti
          <select name="vrsta" required>
            ${vrsteAktivnosti.map(v => `<option value="${escapeHTML(v)}" ${v === (a?.vrsta || "Službena beleška") ? "selected" : ""}>${escapeHTML(v)}</option>`).join("")}
          </select>
        </label>
        <label>Datum aktivnosti
          <input name="datum_aktivnosti" type="date" required
            value="${escapeHTML(a?.datum_aktivnosti?.slice(0,10) || todayISO())}">
        </label>
        <label>Odgovorno lice
          <input name="odgovorno_lice" maxlength="200"
            value="${escapeHTML(a?.odgovorno_lice || "")}" placeholder="Ime i prezime">
        </label>
        <label>Rok sledećeg koraka
          <input name="rok_sledeceg_koraka" type="date"
            value="${escapeHTML(a?.rok_sledeceg_koraka?.slice(0,10) || "")}">
        </label>
      </div>
      <label>Opis postupanja *
        <textarea name="opis" required maxlength="10000" rows="5"
          placeholder="Šta je urađeno, sa kim je razgovarano, koji je zaključak...">${escapeHTML(a?.opis || "")}</textarea>
      </label>
      <label>Sledeći korak
        <textarea name="sledeci_korak" maxlength="5000" rows="3"
          placeholder="Šta je potrebno preduzeti...">${escapeHTML(a?.sledeci_korak || "")}</textarea>
      </label>
      <div class="actions">
        <button type="submit" class="btn btn-primary" id="aktivnost-sacuvaj">
          💾 ${a ? "Sačuvaj izmene" : "Sačuvaj aktivnost"}
        </button>
        <button type="button" class="btn btn-secondary"
          data-action="aktivnost-otkazi">Otkaži</button>
      </div>
    </form>
  `;
  container.dataset.editId = a ? String(a.id) : "";
  container.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function sacuvajAktivnost(event) {
  event.preventDefault();
  if (aktivnostUObradi || !aktivniDosijeId) return;
  const form = event.target;
  const container = $("aktivnost-obrazac");
  const editId = container?.dataset.editId;
  const predmetId = aktivniDosijeId;
  const formData = new FormData(form);
  const data = {};
  for (const key of [
    "vrsta", "datum_aktivnosti", "odgovorno_lice", "opis",
    "sledeci_korak", "rok_sledeceg_koraka"
  ]) {
    data[key] = String(formData.get(key) || "").trim();
  }
  if (!data.opis || !data.datum_aktivnosti) {
    message("Datum i opis aktivnosti su obavezni.", true);
    return;
  }

  aktivnostUObradi = true;
  const saveButton = $("aktivnost-sacuvaj");
  if (saveButton) saveButton.disabled = true;
  try {
    await api(editId ? `/aktivnosti/${editId}` : `/predmeti/${predmetId}/aktivnosti`, {
      method: editId ? "PUT" : "POST",
      body: JSON.stringify(data)
    });
    await openDosije(predmetId);
    message(editId ? "Aktivnost je izmenjena i evidentirana u istoriji." :
      "Aktivnost je sačuvana i evidentirana u istoriji.");
  } catch (err) {
    message(err.message, true);
  } finally {
    aktivnostUObradi = false;
    if (saveButton?.isConnected) saveButton.disabled = false;
  }
}

async function obrisiAktivnost(id) {
  if (!aktivniDosijeId) return;
  const a = dosijeAktivnosti.find(x => String(x.id) === String(id));
  if (!a) return;
  if (!confirm(`Obrisati aktivnost "${a.vrsta}"?\nPrethodni sadržaj ostaje u istoriji.`)) return;
  const predmetId = aktivniDosijeId;
  try {
    await api(`/aktivnosti/${id}`, { method: "DELETE" });
    await openDosije(predmetId);
    message("Aktivnost je obrisana. Zapis je sačuvan u istoriji.");
  } catch (err) {
    message(err.message, true);
  }
}

function injectActivityStyles() {
  if ($("aktivnosti-stil")) return;
  const style = document.createElement("style");
  style.id = "aktivnosti-stil";
  style.textContent = `
    .aktivnosti-heading, .aktivnost-vrh { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
    .aktivnost-kartica { padding:17px; margin:12px 0; border:1px solid #dce4ec; border-left:4px solid #1b887a; border-radius:10px; background:#f9fcfb; overflow-wrap:anywhere; }
    .aktivnost-kartica p { margin:10px 0; }
    .aktivnost-vrh strong { color:#163d46; }
    .aktivnost-vrh span, .aktivnost-meta { color:#64748b; font-size:12px; }
    .aktivnost-opis { white-space:pre-wrap; }
    .aktivnost-form { padding:20px; margin:15px 0; border:1px solid #dce4ec; border-radius:12px; background:#f5f9fc; }
    .aktivnost-form label { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; font-weight:600; }
    .aktivnost-form input, .aktivnost-form select, .aktivnost-form textarea { width:100%; box-sizing:border-box; padding:11px; border:1px solid #bac8d5; border-radius:7px; font:inherit; background:white; color:#1b2d3e; }
    .aktivnost-form textarea { resize:vertical; }
    .aktivnost-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 14px; }
    @media(max-width:650px) { .aktivnost-grid { grid-template-columns:1fr; } .aktivnost-form { padding:13px; } }
    @media print { .aktivnosti-heading button, .aktivnost-kartica .actions, #aktivnost-obrazac { display:none!important; } }
  `;
  document.head.appendChild(style);
}

// ========================================
// DOKUMENTI
// ========================================

function formatBytes(bytes) {
  const size = Number(bytes) || 0;

  if (size < 1024) {
    return size + " B";
  }

  if (size < 1024 * 1024) {
    return (size / 1024).toFixed(1) + " KB";
  }

  return (
    size / (1024 * 1024)
  ).toFixed(2) + " MB";
}

function populateDocumentSelect() {
  const select = $("dokument-predmet");

  if (!select) return;

  const selected = select.value;

  select.innerHTML = `
    <option value="">
      Izaberi predmet...
    </option>

    ${predmetiSvi.map(p => `
      <option value="${escapeHTML(p.id)}">
        ${escapeHTML(p.interni_broj)}
        —
        ${escapeHTML(p.naziv_predmeta)}
      </option>
    `).join("")}
  `;

  if (
    predmetiSvi.some(
      p => String(p.id) === selected
    )
  ) {
    select.value = selected;
  }
}

async function loadDocuments() {
  const id = $("dokument-predmet")?.value;
  const container = $("dokumenti-lista");

  if (!container) return;

  if (!id) {
    trenutniDokumenti = [];
    container.textContent =
      "Izaberi predmet.";
    return;
  }

  container.textContent =
    "Učitavanje dokumenata...";

  try {
    const files = await api(
      `/predmeti/${id}/prilozi`
    );

    if ($("dokument-predmet")?.value !== id) {
      return;
    }

    trenutniDokumenti = files;

    if (!files.length) {
      container.textContent =
        "Nema dokumenata.";
      return;
    }

    container.innerHTML = files.map(d => `
      <div class="file-item">
        <strong>
          📄 ${escapeHTML(d.naziv)}
        </strong>

        <p>
          ${escapeHTML(datumVreme(d.created_at))}
          · ${formatBytes(d.velicina)}
        </p>

        <div class="actions">
          <button
            type="button"
            class="btn btn-primary btn-small"
            data-action="download"
            data-id="${escapeHTML(d.id)}"
          >
            Preuzmi
          </button>

          <button
            type="button"
            class="btn btn-danger btn-small"
            data-action="delete-file"
            data-id="${escapeHTML(d.id)}"
          >
            Obriši
          </button>
        </div>
      </div>
    `).join("");
  } catch (err) {
    container.textContent =
      "Greška: " + err.message;
  }
}

async function uploadDocuments() {
  const id = $("dokument-predmet")?.value;
  const files = Array.from(
    $("dokument-file")?.files || []
  );

  if (!id) {
    message("Prvo izaberi predmet.", true);
    return;
  }

  if (!files.length) {
    message("Izaberi dokument.", true);
    return;
  }

  try {
    files.forEach(validateFile);

    let uploaded = 0;
    let failed = 0;

    for (const file of files) {
      try {
        await uploadFile(id, file);
        uploaded++;
      } catch (err) {
        failed++;
        console.error(err);
      }
    }

    if ($("dokument-file")) {
      $("dokument-file").value = "";
    }

    await refreshAll();
    await loadDocuments();

    message(
      `Dodato dokumenata: ${uploaded}. Neuspešno: ${failed}.`,
      failed > 0
    );
  } catch (err) {
    message(err.message, true);
  }
}

async function downloadDocument(id) {
  try {
    const response = await fetch(
      `${API}/prilozi/${id}`,
      {
        headers: {
          Authorization: "Bearer " + token
        }
      }
    );

    if (response.status === 401) {
      logout(false);
      throw new Error("Sesija je istekla.");
    }

    if (!response.ok) {
      throw new Error(
        "Dokument nije moguće preuzeti."
      );
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    const file = [...dosijeDokumenti, ...trenutniDokumenti].find(
      d => String(d.id) === String(id)
    );

    const link = document.createElement("a");
    link.href = url;

    link.download = file?.naziv ||
      `prilog-${id}`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(
      () => URL.revokeObjectURL(url),
      60000
    );
  } catch (err) {
    message(err.message, true);
  }
}

async function deleteDocument(id) {
  if (!confirm(
    "Trajno obrisati ovaj dokument?"
  )) {
    return;
  }

  try {
    await api(
      `/prilozi/${id}`,
      { method: "DELETE" }
    );

    await refreshAll();
    await loadDocuments();

    message(
      "Dokument je obrisan. Aktivnost je evidentirana u istoriji."
    );
  } catch (err) {
    message(err.message, true);
  }
}

// ========================================
// ROKOVI
// ========================================

function renderCalendar() {
  const container = $("kalendar-lista");

  if (!container) return;

  const items = predmetiSvi
    .filter(p => p.rok_datum)
    .sort((a, b) =>
      String(a.rok_datum).localeCompare(
        String(b.rok_datum)
      )
    );

  if (!items.length) {
    container.innerHTML = `
      <div class="card">
        Nema evidentiranih rokova.
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(p => {
    const expired =
      p.rok_datum < todayISO() &&
      ![
        "Završeno / Odobreno",
        "Arhivirano"
      ].includes(p.status);

    return `
      <div class="card">
        <h3>
          ${escapeHTML(p.naziv_predmeta)}
        </h3>

        <p>
          <b>Broj:</b>
          ${escapeHTML(p.interni_broj)}
        </p>

        <p>
          <b>Rok:</b>
          ${escapeHTML(datum(p.rok_datum))}
        </p>

        <p>
          <b>Status:</b>
          ${escapeHTML(p.status)}
        </p>

        ${expired
          ? '<span class="badge badge-danger">Rok je istekao</span>'
          : ""}

        <div class="actions">
          <button
            type="button"
            class="btn btn-primary btn-small"
            data-action="dosije"
            data-id="${escapeHTML(p.id)}"
          >
            Otvori dosije
          </button>
        </div>
      </div>
    `;
  }).join("");
}

// ========================================
// ANALITIKA
// ========================================

async function renderAnalytics() {
  try {
    if (!token) return;

    const stats = await api("/analitika");

    const values = {
      "st-ukupno": stats.ukupno,
      "st-uradu": stats.u_radu,
      "st-isteklo": stats.isteklo,
      "st-zavrseno": stats.zavrseno
    };

    for (const [id, value] of Object.entries(values)) {
      if ($(id)) {
        $(id).textContent =
          Number(value) || 0;
      }
    }
  } catch (err) {
    console.error(
      "Analitika:",
      err.message
    );
  }
}

// ========================================
// KORISNICI
// ========================================

async function loadUsers() {
  if (
    trenutniKorisnik?.username !== "admin"
  ) {
    return;
  }

  const container = $("users-list");

  if (!container) return;

  try {
    const users = await api("/users");

    container.innerHTML = users.map(user => `
      <div class="file-item">
        <strong>
          👤 ${escapeHTML(user.username)}
        </strong>

        <p>
          Kreiran:
          ${escapeHTML(
            datumVreme(user.created_at)
          )}
        </p>
      </div>
    `).join("");
  } catch (err) {
    container.textContent = err.message;
  }
}

async function createUser(event) {
  event.preventDefault();

  const username =
    $("new-username")?.value.trim();

  const password =
    $("new-password")?.value;

  try {
    await api("/users", {
      method: "POST",
      body: JSON.stringify({
        username,
        password
      })
    });

    $("new-user-form")?.reset();

    await loadUsers();

    message(
      "Korisnički nalog je kreiran."
    );
  } catch (err) {
    message(err.message, true);
  }
}

// ========================================
// CSV / EXCEL
// ========================================

function csvValue(value) {
  const text = String(value ?? "");

  return '"' +
    text.replace(/"/g, '""') +
    '"';
}

function exportCSV() {
  const headers = polja.map(
    key => naziviPolja[key] || key
  );

  const rows = filteredPredmeti().map(
    p => polja.map(
      key => csvValue(p[key])
    ).join(";")
  );

  const content = [
    headers.map(csvValue).join(";"),
    ...rows
  ].join("\r\n");

  const blob = new Blob(
    ["\uFEFF" + content],
    {
      type: "text/csv;charset=utf-8"
    }
  );

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download =
    `rokovnik-predmeti-${todayISO()}.csv`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(
    () => URL.revokeObjectURL(url),
    60000
  );
}

// ========================================
// EMAIL
// ========================================

function sendPredmetMail(id) {
  const p = findPredmet(id);

  if (!p) {
    message("Predmet nije pronađen.", true);
    return;
  }

  const subject =
    `Predmet ${p.interni_broj} - ${p.naziv_predmeta}`;

  const body = polja.map(key =>
    `${naziviPolja[key]}: ${prikazVrednosti(p[key], key)}`
  ).join("\n");

  window.location.href =
    "mailto:?subject=" +
    encodeURIComponent(subject) +
    "&body=" +
    encodeURIComponent(body);
}

function sendSummaryMail() {
  const items = filteredPredmeti();

  const subject =
    "Rokovnik Pro - pregled predmeta";

  const body = items.map(p =>
    [
      p.interni_broj,
      p.naziv_predmeta,
      "Status: " + p.status,
      "Rok: " + datum(p.rok_datum)
    ].join("\n")
  ).join("\n\n");

  window.location.href =
    "mailto:?subject=" +
    encodeURIComponent(subject) +
    "&body=" +
    encodeURIComponent(body);
}

// ========================================
// DOGADJAJI
// ========================================

async function handleAction(event) {
  const button = event.target.closest(
    "[data-action]"
  );

  if (!button) return;

  const action = button.dataset.action;
  const id = button.dataset.id;

  switch (action) {
    case "dosije":
      await openDosije(id);
      break;

    case "aktivnost-nova":
      prikaziObrazacAktivnosti();
      break;

    case "aktivnost-izmeni":
      prikaziObrazacAktivnosti(id);
      break;

    case "aktivnost-obrisi":
      await obrisiAktivnost(id);
      break;

    case "aktivnost-otkazi":
      if ($("aktivnost-obrazac")) {
        $("aktivnost-obrazac").classList.add("hidden");
        $("aktivnost-obrazac").innerHTML = "";
      }
      break;

    case "edit":
      editPredmet(id);
      break;

    case "delete":
      await deletePredmet(id);
      break;

    case "download":
      await downloadDocument(id);
      break;

    case "delete-file":
      await deleteDocument(id);
      break;

    case "documents":
      switchTab("tab-dokumenti");

      if ($("dokument-predmet")) {
        $("dokument-predmet").value = id;
      }

      await loadDocuments();
      break;

    case "mail":
      sendPredmetMail(id);
      break;

    case "print":
      window.print();
      break;
  }
}

function initEvents() {
  $("login-form")?.addEventListener(
    "submit",
    login
  );

  $("logout-btn")?.addEventListener(
    "click",
    () => logout()
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
    updateCeop
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
    refreshAll
  );

  $("excel-btn")?.addEventListener(
    "click",
    exportCSV
  );

  $("mail-btn")?.addEventListener(
    "click",
    sendSummaryMail
  );

  $("dokument-predmet")?.addEventListener(
    "change",
    loadDocuments
  );

  $("upload-btn")?.addEventListener(
    "click",
    uploadDocuments
  );

  $("documents-refresh-btn")?.addEventListener(
    "click",
    loadDocuments
  );

  $("new-user-form")?.addEventListener(
    "submit",
    createUser
  );

  $("dosije-nazad")?.addEventListener(
    "click",
    closeDosije
  );

  $("files-new")?.addEventListener(
    "change",
    () => {
      const count =
        $("files-new")?.files.length || 0;

      if ($("files-count")) {
        $("files-count").textContent =
          count
            ? `Izabrano dokumenata: ${count}`
            : "Nema izabranih dokumenata.";
      }
    }
  );

  document.querySelectorAll(
    ".tab-btn"
  ).forEach(button => {
    button.addEventListener(
      "click",
      () => switchTab(button.dataset.tab)
    );
  });

  document.addEventListener(
    "click",
    handleAction
  );

  document.addEventListener("submit", event => {
    if (event.target?.id === "aktivnost-form") {
      sacuvajAktivnost(event);
    }
  });
}

// ========================================
// POKRETANJE APLIKACIJE
// ========================================

async function initApp() {
  injectHistoryStyles();
  injectActivityStyles();
  initEvents();
  resetForm();

  if (!token) {
    logout();
    return;
  }

  try {
    const result = await api("/me");

    showApp(result.user);
    await refreshAll();
  } catch (err) {
    console.error(
      "Pokretanje aplikacije:",
      err.message
    );

    logout(false);
  }
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initApp
  );
} else {
  initApp();
}
