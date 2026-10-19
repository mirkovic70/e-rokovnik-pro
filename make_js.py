js_code = """
let db, predmetiSvi = [];
const DB_NAME = "UniverzalniRokovnikDB", DB_VERSION = 1;

function otvoriBazu() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      db = e.target.result;
      if (!db.objectStoreNames.contains("predmeti")) db.createObjectStore("predmeti", { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = e => reject(e.target.error);
  });
}

async function sacuvajUBazu(p) {
  return new Promise((resolve) => {
    const tx = db.transaction("predmeti", "readwrite");
    tx.objectStore("predmeti").put(p).onsuccess = () => resolve();
  });
}

async function ucitajSve() {
  return new Promise((resolve) => {
    const tx = db.transaction("predmeti", "readonly");
    tx.objectStore("predmeti").getAll().onsuccess = e => resolve(e.target.result || []);
  });
}

async function obrisiIzBaze(id) {
  return new Promise((resolve) => {
    const tx = db.transaction("predmeti", "readwrite");
    tx.objectStore("predmeti").delete(id).onsuccess = () => resolve();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("datum_prijema").valueAsDate = new Date();
  document.getElementById("camera-input").addEventListener("change", e => obradiFajl(e.target.files[0]));
  document.getElementById("file-input").addEventListener("change", e => obradiFajl(e.target.files[0]));

  document.getElementById("predmet-form").onsubmit = async function(e) {
    e.preventDefault();
    const idVal = document.getElementById("edit-id").value;
    const predmet = {
      vrsta_predmeta: document.getElementById("vrsta_predmeta").value,
      interni_broj: document.getElementById("interni_broj").value,
      naziv_predmeta: document.getElementById("naziv_predmeta").value,
      investor: document.getElementById("investor").value,
      obradjivac: document.getElementById("obradjivac").value,
      potpisnik: document.getElementById("potpisnik").value,
      datum_prijema: document.getElementById("datum_prijema").value,
      rok_datum: document.getElementById("rok_datum").value,
      status: document.getElementById("status").value,
      napomena: document.getElementById("napomena").value,
      slika_base64: document.getElementById("slika_base64").value,
      ceop_broj: document.getElementById("ceop_broj").value,
      rop_broj: document.getElementById("rop_broj").value,
      opstina: document.getElementById("opstina").value,
      katastarska_opstina: document.getElementById("katastarska_opstina").value,
      broj_parcele: document.getElementById("broj_parcele").value,
      nadlezni_organ: document.getElementById("nadlezni_organ").value
    };
    if (idVal) predmet.id = parseInt(idVal);
    await sacuvajUBazu(predmet);
    resetForm();
    await osvezi();
    alert("Uspešno sačuvano u lokalnoj bazi!");
  };

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  otvoriBazu().then(() => osvezi());
});

function otvoriTab(tabId, btn) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
  document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));
  document.getElementById(tabId).classList.remove("hidden");
  btn.classList.add("active");
  if (tabId === 'tab-kalendar') prikaziKalendar();
  if (tabId === 'tab-analitika') prikaziAnalitiku();
}

function prikaziModulPolja() {
  const v = document.getElementById("vrsta_predmeta").value;
  document.getElementById("ceop-modul").classList.toggle("hidden", v !== "CEOP i Građevinski postupak");
}

function obradiFajl(file) {
  if (file) {
    const r = new FileReader();
    r.onload = function(evt) {
      document.getElementById("slika_base64").value = evt.target.result;
      if (file.type.startsWith("image/")) {
        document.getElementById("img-preview").src = evt.target.result;
        document.getElementById("img-preview").classList.remove("hidden");
      } else {
        document.getElementById("img-preview").classList.add("hidden");
        alert("Priložen je dokument: " + file.name);
      }
    };
    r.readAsDataURL(file);
  }
}

async function osvezi() {
  predmetiSvi = await ucitajSve();
  prikaziPredmete();
}

function prikaziPredmete() {
  const q = document.getElementById("search").value.toLowerCase();
  const fV = document.getElementById("filter-vrsta").value;
  const el = document.getElementById("predmeti-lista");

  const filt = predmetiSvi.filter(p => {
    const mText = p.naziv_predmeta.toLowerCase().includes(q) || p.interni_broj.toLowerCase().includes(q);
    const mVrsta = fV ? p.vrsta_predmeta === fV : true;
    return mText && mVrsta;
  });

  if (!filt.length) { el.innerHTML = "<small style='color:#718096;'>Nema unetih predmeta u bazi.</small>"; return; }

  el.innerHTML = filt.map(p => {
    const danas = new Date().toISOString().split('T')[0];
    const jeIsteklo = p.rok_datum && p.rok_datum < danas && p.status !== 'Završeno / Odobreno';
    return `
      <div class="item ${jeIsteklo ? 'isteklo' : ''}">
        <div style="display:flex; justify-content:space-between;">
          <strong>${p.naziv_predmeta}</strong>
          <span class="badge">${p.status}</span>
        </div>
        <small><b>Oznaka:</b> ${p.interni_broj} | <b>Vrsta:</b> ${p.vrsta_predmeta}</small><br>
        <small><b>Stranka:</b> ${p.investor || '/'} | <b>Obrađivač:</b> ${p.obradjivac || '/'}</small><br>
        <small><b>Datum:</b> ${p.datum_prijema} | <b>Rok:</b> ${p.rok_datum || 'Nema'}</small>
        ${p.ceop_broj ? `<br><small><b>CEOP:</b> ${p.ceop_broj} | <b>Parc:</b> ${p.broj_parcele \vert{}\vert{} '/'} (${p.katastarska_opstina || '/'})</small>` : ''}
        ${p.napomena ? `<br><small style="color:#4a5568;"><b>Napomena:</b> ${p.napomena}</small>` : ''}
        ${p.slika_base64 && p.slika_base64.startsWith('data:image') ? `<br><img src="${p.slika_base64}" class="preview">` : ''}
        <div class="grid-3" style="margin-top:8px;">
          <button class="btn-warning" onclick="izmeni(${p.id})">✏️ Izmeni</button>
          <button class="btn-mail" onclick="posaljiPredmetMail(${p.id})">✉️ E-mail</button>
          <button class="btn-danger" onclick="obrisi(${p.id})">🗑️ Obriši</button>
        </div>
      </div>
    `;
  }).join("");
}

function posaljiPredmetMail(id) {
  const p = predmetiSvi.find(item => item.id === id);
  if (!p) return;

  const adresa = prompt("Unesite e-mail adresu za slanje:", "mirkovic70@gmail.com");
  if (!adresa) return;

  const naslov = encodeURIComponent(`Predmet [${p.interni_broj}]: ${p.naziv_predmeta}`);
  let tekst = `Pregled predmeta / zadatka:\n\n`;
  tekst += `• Oznaka / Broj: ${p.interni_broj}\n`;
  tekst += `• Vrsta: ${p.vrsta_predmeta}\n`;
  tekst += `• Naziv: ${p.naziv_predmeta}\n`;
  tekst += `• Stranka / Investitor: ${p.investor || '/'}\n`;
  tekst += `• Obrađivač: ${p.obradjivac || '/'}\n`;
  tekst += `• Status: ${p.status}\n`;
  tekst += `• Datum prijema: ${p.datum_prijema}\n`;
  tekst += `• Krajnji rok: ${p.rok_datum || 'Nije definisan'}\n`;

  if (p.vrsta_predmeta === 'CEOP i Građevinski postupak') {
    tekst += `\n--- CEOP PODACI ---\n`;
    tekst += `• CEOP broj: ${p.ceop_broj || '/'}\n`;
    tekst += `• ROP broj: ${p.rop_broj || '/'}\n`;
    tekst += `• Opština: ${p.opstina || '/'}\n`;
    tekst += `• Katastarska opština: ${p.katastarska_opstina || '/'}\n`;
    tekst += `• Broj parcele: ${p.broj_parcele || '/'}\n`;
  }

  if (p.napomena) {
    tekst += `\nNapomena: ${p.napomena}\n`;
  }

  window.location.href = `mailto:${adresa}?subject=${naslov}&body=${encodeURIComponent(tekst)}`;
}

function posaljiZbirniMail() {
  if (!predmetiSvi.length) { alert("Nema predmeta u bazi za slanje."); return; }
  const adresa = prompt("Unesite e-mail adresu za zbirni izveštaj:", "mirkovic70@gmail.com");
  if (!adresa) return;

  const naslov = encodeURIComponent(`Zbirni Izveštaj - Univerzalni Rokovnik Pro (${new Date().toLocaleDateString('sr-RS')})`);
  let tekst = `ZBIRNI PREGLED PREDMETA (${predmetiSvi.length}):\n\n`;

  predmetiSvi.forEach((p, idx) => {
    tekst += `${idx + 1}. [${p.interni_broj}] ${p.naziv_predmeta}\n`;
    tekst += `   Vrsta: ${p.vrsta_predmeta} | Status: ${p.status}\n`;
    tekst += `   Rok: ${p.rok_datum || 'Nema'} | Obrađivač: ${p.obradjivac || '/'}\n\n`;
  });

  window.location.href = `mailto:${adresa}?subject=${naslov}&body=${encodeURIComponent(tekst)}`;
}

function prikaziKalendar() {
  const el = document.getElementById("kalendar-lista");
  const saRokom = predmetiSvi.filter(p => p.rok_datum).sort((a,b) => a.rok_datum.localeCompare(b.rok_datum));
  if (!saRokom.length) { el.innerHTML = "<small>Nema predmeta sa rokom.</small>"; return; }
  el.innerHTML = saRokom.map(p => `
    <div class="item">
      <strong>${p.rok_datum}</strong> - ${p.naziv_predmeta} (${p.interni_broj})
      <br><small>Status: ${p.status} | Obrađivač: ${p.obradjivac || '/'}</small>
    </div>
  `).join("");
}

function prikaziAnalitiku() {
  const danas = new Date().toISOString().split('T')[0];
  document.getElementById("st-ukupno").innerText = predmetiSvi.length;
  document.getElementById("st-uradu").innerText = predmetiSvi.filter(p => p.status === 'U radu').length;
  document.getElementById("st-isteklo").innerText = predmetiSvi.filter(p => p.rok_datum && p.rok_datum < danas && p.status !== 'Završeno / Odobreno').length;
  document.getElementById("st-zavrseno").innerText = predmetiSvi.filter(p => p.status === 'Završeno / Odobreno').length;
}

function generisiPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.text("Izvestaj Registra Predmeta", 14, 15);
  const rows = predmetiSvi.map(p => [p.interni_broj, p.naziv_predmeta, p.vrsta_predmeta, p.datum_prijema, p.rok_datum || '/', p.status]);
  doc.autoTable({ head: [['Broj', 'Naziv', 'Vrsta', 'Datum', 'Rok', 'Status']], body: rows, startY: 20 });
  doc.save("izvestaj_rokovnik.pdf");
}

function generisiExcel() {
  const ws = XLSX.utils.json_to_sheet(predmetiSvi);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Predmeti");
  XLSX.writeFile(wb, "rokovnik_predmeti.xlsx");
}

function izmeni(id) {
  const p = predmetiSvi.find(item => item.id === id);
  if (!p) return;
  document.getElementById("edit-id").value = p.id;
  document.getElementById("vrsta_predmeta").value = p.vrsta_predmeta;
  document.getElementById("interni_broj").value = p.interni_broj;
  document.getElementById("naziv_predmeta").value = p.naziv_predmeta;
  document.getElementById("investor").value = p.investor || "";
  document.getElementById("obradjivac").value = p.obradjivac || "";
  document.getElementById("potpisnik").value = p.potpisnik || "";
  document.getElementById("datum_prijema").value = p.datum_prijema;
  document.getElementById("rok_datum").value = p.rok_datum || "";
  document.getElementById("status").value = p.status;
  document.getElementById("napomena").value = p.napomena || "";
  document.getElementById("slika_base64").value = p.slika_base64 || "";
  document.getElementById("ceop_broj").value = p.ceop_broj || "";
  document.getElementById("rop_broj").value = p.rop_broj || "";
  document.getElementById("opstina").value = p.opstina || "Novi Sad";
  document.getElementById("katastarska_opstina").value = p.katastarska_opstina || "";
  document.getElementById("broj_parcele").value = p.broj_parcele || "";
  document.getElementById("nadlezni_organ").value = p.nadlezni_organ || "";

  if (p.slika_base64 && p.slika_base64.startsWith("data:image")) {
    document.getElementById("img-preview").src = p.slika_base64;
    document.getElementById("img-preview").classList.remove("hidden");
  }
  prikaziModulPolja();
  document.getElementById("form-title").innerText = "✏️ Izmena Predmeta";
  document.getElementById("cancel-btn").classList.remove("hidden");
  window.scrollTo(0,0);
}

async function obrisi(id) {
  if (confirm("Obriši predmet iz lokalne baze?")) {
    await obrisiIzBaze(id);
    await osvezi();
  }
}

function resetForm() {
  document.getElementById("edit-id").value = "";
  document.getElementById("predmet-form").reset();
  document.getElementById("datum_prijema").valueAsDate = new Date();
  document.getElementById("slika_base64").value = "";
  document.getElementById("img-preview").classList.add("hidden");
  document.getElementById("form-title").innerText = "➕ Unos Novog Predmeta";
  document.getElementById("cancel-btn").classList.add("hidden");
  prikaziModulPolja();
}

function prikaziBackupModal() { document.getElementById("backup-modal").classList.remove("hidden"); }
function zatvoriBackupModal() { document.getElementById("backup-modal").classList.add("hidden"); }

async function izveziPodatke() {
  const sve = await ucitajSve();
  const blob = new Blob([JSON.stringify(sve, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "rokovnik_backup.json";
  a.click();
}

async function uveziPodatke(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = async function(evt) {
    const uvezani = JSON.parse(evt.target.result);
    if (Array.isArray(uvezani)) {
      for (let item of uvezani) {
        delete item.id;
        await sacuvajUBazu(item);
      }
      await osvezi();
      alert("Backup uspešno uvezen!");
      zatvoriBackupModal();
    }
  };
  r.readAsText(file);
}
"""
with open('public/app.js', 'w', encoding='utf-8') as f:
    f.write(js_code)

print('✅ Korak 4 uspešan! Pokrećem server...')
