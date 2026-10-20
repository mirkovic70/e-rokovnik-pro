
"use strict";

// UNIVERZALNI ROKOVNIK PRO 2.0
// PostgreSQL / Render / vise korisnika

let token = sessionStorage.getItem("rokovnik_token") || "";
let predmetiSvi = [];
let trenutniDokumenti = [];
let trenutniKorisnik = null;

const $ = id => document.getElementById(id);

function danas() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dan = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dan}`;
}

function datumTekst(v) {
  if (!v) return "Nije definisan";
  const s = String(v).slice(0, 10);
  const p = s.split("-");
  return p.length === 3
    ? `${p[2]}.${p[1]}.${p[0]}.`
    : s;
}

function escapeHTML(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearMessage() {
  $("app-message")?.classList.add("hidden");
}

function loginError(message) {
  const el = $("login-error");
  if (!el) return;
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

  const name = $("current-user");
  if (name) {
    name.textContent = trenutniKorisnik?.username || "";
  }

  const adminTab = $("admin-tab");
  if (adminTab) {
    adminTab.classList.toggle(
      "hidden",
      trenutniKorisnik?.username !== "admin"
    );
  }
}

function logout() {
  token = "";
  sessionStorage.removeItem("rokovnik_token");
  predmetiSvi = [];
  trenutniDokumenti = [];
  trenutniKorisnik = null;

  if ($("password")) $("password").value = "";

  showLogin();
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
    throw new Error(
      "Nema veze sa serverom. Proveri internet."
    );
  }

  if (response.status === 401 && url !== "/api/login") {
    logout();
    throw new Error(
      "Sesija je istekla. Prijavi se ponovo."
    );
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

async function login(e) {
  e.preventDefault();

  $("login-error")?.classList.add("hidden");

  const btn = $("login-form").querySelector("button");
  btn.disabled = true;
  btn.textContent = "Prijavljivanje...";

  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("username").value.trim(),
        password: $("password").value
      })
    });

    if (!data.token) {
      throw new Error("Server nije vratio sesiju.");
    }

    token = data.token;
    sessionStorage.setItem("rokovnik_token", token);

    trenutniKorisnik = {
      username: data.username
    };

    $("password").value = "";

    showApp();
    await refreshAll();

  } catch (err) {
    loginError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "🔐 Prijavi se";
  }
}

// POKRETANJE

document.addEventListener("DOMContentLoaded", async () => {
  $("login-form")?.addEventListener("submit", login);
  $("logout-btn")?.addEventListener("click", logout);

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

  document.querySelectorAll(".tab-btn").forEach(btn => {
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

      if (action === "edit") editPredmet(id);
      if (action === "delete") await deletePredmet(id);
      if (action === "mail") sendPredmetMail(id);

      if (action === "documents") {
        const select = $("dokument-predmet");
        if (select) select.value = String(id);

        const tab = document.querySelector(
          '[data-tab="tab-dokumenti"]'
        );

        openTab("tab-dokumenti", tab);
        await loadDocuments();
      }
    }
  );

  $("dokumenti-lista")?.addEventListener(
    "click",
    async e => {
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
});

// KARTICE

function openTab(tabId, btn) {
  document.querySelectorAll(".tab-content").forEach(el => {
    el.classList.add("hidden");
  });

  document.querySelectorAll(".tab-btn").forEach(el => {
    el.classList.remove("active");
  });

  $(tabId)?.classList.remove("hidden");
  btn?.classList.add("active");

  if (tabId === "tab-rokovi") renderCalendar();
  if (tabId === "tab-analitika") renderAnalytics();

  if (tabId === "tab-dokumenti") {
    populatePredmetSelect();
  }

  if (tabId === "tab-admin") {
    loadUsers();
  }
}

function showCeopFields() {
  const ceop =
    $("vrsta_predmeta")?.value ===
    "CEOP i Građevinski postupak";

  $("ceop-modul")?.classList.toggle(
    "hidden",
    !ceop
  );
}

// UCITAVANJE PREDMETA

async function refreshAll() {
  const data = await api("/api/predmeti");

  if (!Array.isArray(data)) {
    throw new Error("Neispravan odgovor servera.");
  }

  predmetiSvi = data;

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

// PODACI IZ OBRASCA

function formData() {
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

  const data = {};

  fields.forEach(key => {
    data[key] = $(key)?.value || "";
  });

  return data;
}

// CUVANJE PREDMETA I DOKUMENATA

async function savePredmet(e) {
  e.preventDefault();

  const id = $("edit-id")?.value || "";
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
  btn.disabled = true;
  btn.textContent = "Čuvanje...";

  try {
    let predmetId;

    if (id) {
      await api(`/api/predmeti/${id}`, {
        method: "PUT",
        body: JSON.stringify(predmet)
      });

      predmetId = id;

    } else {
      const result = await api("/api/predmeti", {
        method: "POST",
        body: JSON.stringify(predmet)
      });

      predmetId = result.id;
    }

    let success = 0;
    const errors = [];

    for (const file of files) {
      try {
        await uploadSingleDocument(predmetId, file);
        success++;
      } catch (err) {
        errors.push(`${file.name}: ${err.message}`);
      }
    }

    resetForm();
    await refreshAll();

    if (errors.length) {
      showMessage(
        `Predmet je sačuvan. Dodato dokumenata: ${success}. ` +
        `Neuspešno: ${errors.join("; ")}`,
        true
      );
    } else {
      showMessage(
        `Predmet je uspešno sačuvan. ` +
        `Dodato dokumenata: ${success}.`
      );
    }

  } catch (err) {
    showMessage(
      "Čuvanje nije uspelo: " + err.message,
      true
    );
  } finally {
    btn.disabled = false;
    btn.textContent = "💾 Sačuvaj predmet";
  }
}

// REGISTAR

function renderPredmeti() {
  const el = $("predmeti-lista");
  if (!el) return;

  const q = ($("search")?.value || "")
    .trim()
    .toLowerCase();

  const vrsta = $("filter-vrsta")?.value || "";
  const status = $("filter-status")?.value || "";

  const filtered = predmetiSvi.filter(p => {
    const searchText = [
      p.interni_broj,
      p.naziv_predmeta,
      p.investor,
      p.obradjivac,
      p.ceop_broj,
      p.rop_broj,
      p.broj_parcele
    ].join(" ").toLowerCase();

    return (
      searchText.includes(q) &&
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

  const today = danas();

  el.innerHTML = filtered.map(p => {
    const id = Number(p.id);
    const count = Number(
      p.broj_dokumenata ?? p.broj_priloga ?? 0
    );

    const expired =
      p.rok_datum &&
      String(p.rok_datum).slice(0, 10) < today &&
      !["Završeno / Odobreno", "Arhivirano"]
        .includes(p.status);

    return `
      <article class="predmet">
        <div style="
          display:flex;
          justify-content:space-between;
          gap:10px;
          flex-wrap:wrap
        ">
          <h3>${escapeHTML(p.naziv_predmeta)}</h3>

          <span class="badge ${
            expired ? "badge-danger" : ""
          }">
            ${escapeHTML(p.status)}
          </span>
        </div>

        <p><b>Broj:</b>
          ${escapeHTML(p.interni_broj)}
        </p>

        <p><b>Vrsta:</b>
          ${escapeHTML(p.vrsta_predmeta)}
        </p>

        <p><b>Stranka:</b>
          ${escapeHTML(p.investor || "/")}
        </p>

        <p><b>Obrađivač:</b>
          ${escapeHTML(p.obradjivac || "/")}
        </p>

        <p><b>Prijem:</b>
          ${datumTekst(p.datum_prijema)}
        </p>

        <p><b>Rok:</b>
          ${datumTekst(p.rok_datum)}
        </p>

        <p>
          <b>📎 Dokumenti:</b>
          <strong>${count}</strong>
        </p>

        ${p.napomena ? `
          <p><b>Napomena:</b>
            ${escapeHTML(p.napomena)}
          </p>
        ` : ""}

        <div class="actions">
          <button class="btn btn-secondary btn-small"
                  data-action="edit"
                  data-id="${id}">
            ✏️ Izmeni
          </button>

          <button class="btn btn-secondary btn-small"
                  data-action="documents"
                  data-id="${id}">
            📎 Dokumenti (${count})
          </button>

          <button class="btn btn-secondary btn-small"
                  data-action="mail"
                  data-id="${id}">
            ✉️ E-mail
          </button>

          <button class="btn btn-danger btn-small"
                  data-action="delete"
                  data-id="${id}">
            🗑️ Obriši
          </button>
        </div>
      </article>
    `;
  }).join("");
}

// IZMENA

function editPredmet(id) {
  const p = findPredmet(id);
  if (!p) return;

  $("edit-id").value = p.id;

  const fields = Object.keys(formData());

  fields.forEach(key => {
    if ($(key)) {
      $(key).value = p[key] || "";
    }
  });

  showCeopFields();

  $("form-title").textContent = "✏️ Izmena predmeta";
  $("cancel-btn")?.classList.remove("hidden");

  openTab(
    "tab-predmeti",
    document.querySelector(
      '[data-tab="tab-predmeti"]'
    )
  );

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetForm() {
  $("predmet-form")?.reset();

  if ($("edit-id")) $("edit-id").value = "";
  if ($("datum_prijema")) {
    $("datum_prijema").value = danas();
  }

  if ($("form-title")) {
    $("form-title").textContent = "➕ Novi predmet";
  }

  $("cancel-btn")?.classList.add("hidden");

  updateFileCount();
  showCeopFields();
}

// BRISANJE

async function deletePredmet(id) {
  const p = findPredmet(id);
  if (!p) return;

  if (!confirm(
    `Trajno obrisati predmet "${p.naziv_predmeta}" ` +
    "i sve njegove dokumente?"
  )) {
    return;
  }

  try {
    await api(`/api/predmeti/${id}`, {
      method: "DELETE"
    });

    await refreshAll();
    showMessage("Predmet je obrisan.");
  } catch (err) {
    showMessage(err.message, true);
  }
}

// DOKUMENTI

function updateFileCount() {
  const files = $("files-new")?.files;
  const label = $("files-count");

  if (!label) return;

  label.textContent = files?.length
    ? `Izabrano dokumenata: ${files.length}`
    : "Nema izabranih dokumenata.";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(
      new Error("Dokument ne može da se pročita.")
    );

    reader.readAsDataURL(file);
  });
}

async function uploadSingleDocument(predmetId, file) {
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
      "Dokument ne sme biti veći od 7 MB."
    );
  }

  const data = await fileToBase64(file);

  return api(`/api/predmeti/${predmetId}/prilozi`, {
    method: "POST",
    body: JSON.stringify({
      naziv: file.name,
      mime_type: file.type,
      data_base64: data
    })
  });
}

function populatePredmetSelect() {
  const select = $("dokument-predmet");
  if (!select) return;

  const previous = select.value;
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
    previous &&
    predmetiSvi.some(p => String(p.id) === previous)
  ) {
    select.value = previous;
  }
}

async function loadDocuments() {
  const predmetId = $("dokument-predmet")?.value;
  const el = $("dokumenti-lista");

  if (!el) return;

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
      el.textContent = "Nema dokumenata.";
      return;
    }

    el.innerHTML = trenutniDokumenti.map(f => `
      <div class="file-item">
        <strong>${escapeHTML(f.naziv)}</strong>

        <p>
          ${escapeHTML(f.mime_type)}
          —
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
    el.textContent = err.message;
  }
}

async function uploadDocumentsFromTab() {
  const predmetId = $("dokument-predmet")?.value;
  const files = Array.from(
    $("dokument-file")?.files || []
  );

  if (!predmetId) {
    showMessage("Izaberi predmet.", true);
    return;
  }

  if (!files.length) {
    showMessage("Izaberi dokumente.", true);
    return;
  }

  const btn = $("upload-btn");
  btn.disabled = true;
  btn.textContent = "Slanje...";

  let success = 0;
  const errors = [];

  try {
    for (const file of files) {
      try {
        await uploadSingleDocument(predmetId, file);
        success++;
      } catch (err) {
        errors.push(`${file.name}: ${err.message}`);
      }
    }

    $("dokument-file").value = "";

    await loadDocuments();
    await refreshAll();

    showMessage(
      `Dodato dokumenata: ${success}.` +
      (errors.length
        ? ` Greške: ${errors.join("; ")}`
        : ""),
      errors.length > 0
    );

  } finally {
    btn.disabled = false;
    btn.textContent = "📤 Sačuvaj dokument";
  }
}

async function downloadDocument(id) {
  try {
    const response = await fetch(
      `/api/prilozi/${id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (response.status === 401) {
      logout();
      throw new Error("Sesija je istekla.");
    }

    if (!response.ok) {
      throw new Error("Preuzimanje nije uspelo.");
    }

    const blob = await response.blob();

    const f = trenutniDokumenti.find(
      x => Number(x.id) === id
    );

    const name = f?.naziv || `prilog-${id}`;

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
  if (!confirm("Trajno obrisati dokument?")) {
    return;
  }

  try {
    await api(`/api/prilozi/${id}`, {
      method: "DELETE"
    });

    await loadDocuments();
    await refreshAll();

    showMessage("Dokument je obrisan.");

  } catch (err) {
    showMessage(err.message, true);
  }
}

// ROKOVI

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
    el.textContent = "Nema predmeta sa rokom.";
    return;
  }

  el.innerHTML = list.map(p => `
    <div class="predmet">
      <strong>${datumTekst(p.rok_datum)}</strong>
      <h3>${escapeHTML(p.naziv_predmeta)}</h3>
      <p>Broj: ${escapeHTML(p.interni_broj)}</p>
      <p>Status: ${escapeHTML(p.status)}</p>
      <p>Obrađivač: ${escapeHTML(p.obradjivac || "/")}</p>
    </div>
  `).join("");
}

// ANALITIKA

function renderAnalytics() {
  const today = danas();

  const expired = predmetiSvi.filter(p =>
    p.rok_datum &&
    String(p.rok_datum).slice(0, 10) < today &&
    !["Završeno / Odobreno", "Arhivirano"]
      .includes(p.status)
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

  Object.entries(values).forEach(([id, value]) => {
    if ($(id)) $(id).textContent = value;
  });
}

// ADMINISTRACIJA KORISNIKA

async function loadUsers() {
  const el = $("users-list");
  if (!el) return;

  if (trenutniKorisnik?.username !== "admin") {
    el.textContent = "Pristup nije dozvoljen.";
    return;
  }

  try {
    const users = await api("/api/users");

    el.innerHTML = users.map(u => `
      <div class="file-item">
        <strong>👤 ${escapeHTML(u.username)}</strong>
        <p>ID: ${escapeHTML(u.id)}</p>
      </div>
    `).join("");

  } catch (err) {
    el.textContent = err.message;
  }
}

async function createUser(e) {
  e.preventDefault();

  const username = $("new-username")?.value.trim();
  const password = $("new-password")?.value;

  if (!username || !password) {
    showMessage("Unesi korisničko ime i lozinku.", true);
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

    $("new-user-form").reset();

    await loadUsers();
    showMessage(
      `Korisnik "${username}" je uspešno kreiran.`
    );

  } catch (err) {
    showMessage(err.message, true);
  }
}

// CSV IZVOZ

function csvCell(v) {
  let s = String(v == null ? "" : v);

  if (/^\s*[=+\-@]/.test(s)) {
    s = "'" + s;
  }

  return `"${s.replace(/"/g, '""')}"`;
}

function exportCSV() {
  if (!predmetiSvi.length) {
    showMessage("Nema predmeta za izvoz.", true);
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

  setTimeout(
    () => URL.revokeObjectURL(url),
    60000
  );
}

// E-MAIL

function sendPredmetMail(id) {
  const p = findPredmet(id);
  if (!p) return;

  const address = prompt("E-mail primaoca:", "");
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
    `Datum prijema: ${datumTekst(p.datum_prijema)}`,
    `Rok: ${datumTekst(p.rok_datum)}`,
    `Status: ${p.status}`,
    `Napomena: ${p.napomena || "/"}`
  ].join("\n");

  window.location.href =
    `mailto:${encodeURIComponent(address)}` +
    `?subject=${encodeURIComponent(
      `Predmet ${p.interni_broj}: ${p.naziv_predmeta}`
    )}` +
    `&body=${encodeURIComponent(text)}`;
}

function sendSummaryMail() {
  if (!predmetiSvi.length) {
    showMessage("Nema predmeta.", true);
    return;
  }

  const address = prompt("E-mail primaoca:", "");
  if (!address) return;

  const text = [
    "ZBIRNI IZVEŠTAJ ROKOVNIKA",
    `Datum: ${datumTekst(danas())}`,
    `Ukupno: ${predmetiSvi.length}`,
    "",
    ...predmetiSvi.map((p, i) =>
      `${i + 1}. ${p.interni_broj} — ${p.naziv_predmeta}\n` +
      `Status: ${p.status}\n` +
      `Rok: ${datumTekst(p.rok_datum)}\n`
    )
  ].join("\n");

  window.location.href =
    `mailto:${encodeURIComponent(address)}` +
    "?subject=" +
    encodeURIComponent("Zbirni izveštaj Rokovnika") +
    "&body=" +
    encodeURIComponent(text);
}
