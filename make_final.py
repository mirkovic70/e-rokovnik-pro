html_code = """<!DOCTYPE html>
<html lang="sr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Univerzalni Rokovnik Pro</title>
  <style>
    :root { --primary: #1a365d; --accent: #2b6cb0; --bg: #f0f2f5; --card: #ffffff; --text: #1a202c; --danger: #e53e3e; --warn: #dd6b20; --success: #38a169; --purple: #805ad5; }
    body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 10px; }
    header { display: flex; justify-content: space-between; align-items: center; background: var(--primary); color: white; padding: 10px 14px; border-radius: 8px; margin-bottom: 10px; }
    h1 { font-size: 1.1rem; margin: 0; }
    .nav-tabs { display: flex; gap: 4px; overflow-x: auto; margin-bottom: 10px; padding-bottom: 4px; }
    .tab-btn { background: #e2e8f0; color: #4a5568; border: none; padding: 8px 12px; border-radius: 6px; font-weight: bold; font-size: 12px; cursor: pointer; white-space: nowrap; }
    .tab-btn.active { background: var(--accent); color: white; }
    .card { background: var(--card); padding: 14px; border-radius: 8px; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h2 { font-size: 0.95rem; color: #2d3748; margin-top: 0; border-bottom: 2px solid #edf2f7; padding-bottom: 4px; }
    label { font-size: 11px; font-weight: bold; color: #4a5568; display: block; margin-top: 6px; }
    input, select, textarea, button { width: 100%; padding: 8px; border: 1px solid #cbd5e0; border-radius: 6px; box-sizing: border-box; font-size: 13px; margin-top: 2px; }
    button { background: var(--accent); color: white; font-weight: bold; border: none; cursor: pointer; }
    .btn-sec { background: #4a5568; } .btn-danger { background: var(--danger); } .btn-warning { background: var(--warn); } .btn-success { background: var(--success); } .btn-mail { background: var(--purple); }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; } .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; } .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .item { background: white; border-left: 5px solid var(--accent); padding: 10px; border-radius: 6px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .item.isteklo { border-left-color: var(--danger); background: #fff5f5; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; background: #e2e8f0; }
    .ceop-section { background: #ebf8ff; border: 1px solid #bee3f8; padding: 8px; border-radius: 6px; margin-top: 6px; }
    img.preview { max-width: 100%; max-height: 120px; border-radius: 6px; margin-top: 6px; object-fit: cover; }
    .hidden { display: none; }
    .stat-box { text-align: center; background: #edf2f7; padding: 10px; border-radius: 6px; }
    .stat-num { font-size: 1.4rem; font-weight: bold; color: var(--primary); }
    .stat-label { font-size: 10px; color: #718096; font-weight: bold; }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
</head>
<body>
  <header>
    <h1>📋 Univerzalni Rokovnik Pro</h1>
    <button onclick="prikaziBackupModal()" class="btn-sec" style="width:auto; padding:5px 10px; font-size:11px;">💾 Backup</button>
  </header>

  <div class="nav-tabs">
    <button class="tab-btn active" onclick="otvoriTab('tab-predmeti', this)">📂 Predmeti & Unos</button>
    <button class="tab-btn" onclick="otvoriTab('tab-kalendar', this)">📅 Rokovi</button>
    <button class="tab-btn" onclick="otvoriTab('tab-analitika', this)">📊 Analitika</button>
    <button class="tab-btn" onclick="otvoriTab('tab-izvoz', this)">📄 Izvoz / Mail</button>
  </div>

  <div id="tab-predmeti" class="tab-content">
    <div class="card">
      <h2 id="form-title">➕ Unos Novog Predmeta</h2>
      <form id="predmet-form">
        <input type="hidden" id="edit-id">
        <div class="grid-2">
          <div>
            <label>Vrsta predmeta *</label>
            <select id="vrsta_predmeta" onchange="prikaziModulPolja()">
              <option value="Opšti predmet / Zadatak">Opšti predmet / Zadatak</option>
              <option value="CEOP i Građevinski postupak">CEOP i Građevinski postupak</option>
              <option value="Katastar i Parcele">Katastar i Parcele</option>
              <option value="Ugovor / Pravni predmet">Ugovor / Pravni predmet</option>
              <option value="Sastanak / Podsetnik">Sastanak / Podsetnik</option>
              <option value="Privatno">Privatno</option>
            </select>
          </div>
          <div><label>Oznaka / Broj *</label><input type="text" id="interni_broj" required placeholder="INT-2026-01"></div>
        </div>
        <div><label>Naziv predmeta *</label><input type="text" id="naziv_predmeta" required placeholder="Unesite naziv"></div>
        <div class="grid-2">
          <div><label>Stranka / Investitor</label><input type="text" id="investor"></div>
          <div><label>Obrađivač</label><input type="text" id="obradjivac"></div>
        </div>
        <div class="grid-2">
          <div><label>Datum otvaranja *</label><input type="date" id="datum_prijema" required></div>
          <div><label>Krajnji rok</label><input type="date" id="rok_datum"></div>
        </div>
        <div class="grid-2">
          <div>
            <label>Status</label>
            <select id="status">
              <option value="U radu">U radu</option>
              <option value="Čeka dopunu">Čeka dopunu</option>
              <option value="Završeno / Odobreno">Završeno / Odobreno</option>
              <option value="Odbijeno">Odbijeno</option>
            </select>
          </div>
          <div><label>Potpisnik</label><input type="text" id="potpisnik"></div>
        </div>

        <div id="ceop-modul" class="ceop-section hidden">
          <h3>🏗️ CEOP Podaci</h3>
          <div class="grid-2">
            <div><label>CEOP Broj</label><input type="text" id="ceop_broj"></div>
            <div><label>ROP Broj</label><input type="text" id="rop_broj"></div>
          </div>
          <div class="grid-2">
            <div><label>Opština</label><input type="text" id="opstina" value="Novi Sad"></div>
            <div><label>KO</label><input type="text" id="katastarska_opstina"></div>
          </div>
          <div class="grid-2">
            <div><label>Broj parcele</label><input type="text" id="broj_parcele"></div>
            <div><label>Nadležni organ</label><input type="text" id="nadlezni_organ" value="Gradska uprava za urbanizam"></div>
          </div>
        </div>

        <div><label>Napomene</label><textarea id="napomena" rows="2"></textarea></div>

        <div class="grid-2" style="margin-top:8px;">
          <div>
            <label>📷 Us slikaj kamerom</label>
            <input type="file" id="camera-input" accept="image/*" capture="environment">
          </div>
          <div>
            <label>📁 Priloži dokument / galeriju</label>
            <input type="file" id="file-input" accept="image/*,.pdf,.doc,.docx">
          </div>
        </div>

        <input type="hidden" id="slika_base64">
        <img id="img-preview" class="preview hidden">

        <div class="grid-2" style="margin-top:10px;">
          <button type="submit" id="submit-btn">💾 Sačuvaj Predmet</button>
          <button type="button" id="cancel-btn" onclick="resetForm()" class="btn-sec hidden">Odustani</button>
        </div>
      </form>
    </div>

    <div class="card">
      <h2>📂 Registar Predmeta</h2>
      <div class="grid-2">
        <input type="text" id="search" placeholder="🔍 Pretraga..." oninput="prikaziPredmete()">
        <select id="filter-vrsta" onchange="prikaziPredmete()">
          <option value="">Sve vrste</option>
          <option value="Opšti predmet / Zadatak">Opšti predmet / Zadatak</option>
          <option value="CEOP i Građevinski postupak">CEOP i Građevinski postupak</option>
          <option value="Katastar i Parcele">Katastar i Parcele</option>
          <option value="Ugovor / Pravni predmet">Ugovor / Pravni predmet</option>
          <option value="Sastanak / Podsetnik">Sastanak / Podsetnik</option>
          <option value="Privatno">Privatno</option>
        </select>
      </div>
      <div id="predmeti-lista" style="margin-top:10px;">Inicijalizacija...</div>
    </div>
  </div>

  <div id="tab-kalendar" class="tab-content hidden">
    <div class="card">
      <h2>📅 Isticanje Rokova i Obaveze</h2>
      <div id="kalendar-lista"></div>
    </div>
  </div>

  <div id="tab-analitika" class="tab-content hidden">
    <div class="card">
      <h2>📊 Statistički Pregled</h2>
      <div class="grid-4">
        <div class="stat-box"><div class="stat-num" id="st-ukupno">0</div><div class="stat-label">UKUPNO</div></div>
        <div class="stat-box"><div class="stat-num" style="color:var(--warn);" id="st-uradu">0</div><div class="stat-label">U RADU</div></div>
        <div class="stat-box"><div class="stat-num" style="color:var(--danger);" id="st-isteklo">0</div><div class="stat-label">ISTEKLO</div></div>
        <div class="stat-box"><div class="stat-num" style="color:var(--success);" id="st-zavrseno">0</div><div class="stat-label">ZAVRŠENO</div></div>
      </div>
    </div>
  </div>

  <div id="tab-izvoz" class="tab-content hidden">
    <div class="card">
      <h2>📄 Izvoz Podataka i Slanje Na E-mail</h2>
      <p style="font-size:12px; color:#4a5568;">Izvozite izveštaje ili pošaljite zbirni pregled na e-mail.</p>
      <div class="grid-3">
        <button class="btn-success" onclick="generisiPDF()">📥 PDF</button>
        <button class="btn-warning" onclick="generisiExcel()">📊 Excel</button>
        <button class="btn-mail" onclick="posaljiZbirniMail()">✉️ E-mail</button>
      </div>
    </div>
  </div>

  <div id="backup-modal" class="card hidden">
    <h2>💾 Backup Podataka</h2>
    <div class="grid-2">
      <button onclick="izveziPodatke()">📥 Preuzmi Backup</button>
      <div>
        <label>📤 Učitaj Backup</label>
        <input type="file" id="import-file" accept=".json" onchange="uveziPodatke(event)">
      </div>
    </div>
    <button onclick="zatvoriBackupModal()" class="btn-sec" style="margin-top:10px;">Zatvori</button>
  </div>

  <script>
    let predmetiSvi = [];

    function ucitajSveStorage() {
      try {
        let data = localStorage.getItem("rokovnik_predmeti_v1");
        return data ? JSON.parse(data) : [];
      } catch(e) {
        return [];
      }
    }

    function sacuvajStorage(list) {
      try {
        localStorage.setItem("rokovnik_predmeti_v1", JSON.stringify(list));
        return true;
      } catch(e) {
        return false;
      }
    }

    window.addEventListener("DOMContentLoaded", () => {
      document.getElementById("datum_prijema").valueAsDate = new Date();
      document.getElementById("camera-input").addEventListener("change", e => obradiFajl(e.target.files[0]));
      document.getElementById("file-input").addEventListener("change", e => obradiFajl(e.target.files[0]));

      document.getElementById("predmet-form").onsubmit = function(e) {
        e.preventDefault();
        let idVal = document.getElementById("edit-id").value;
        let p = {
          id: idVal ? parseInt(idVal) : Date.now(),
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

        if (idVal) {
          let idx = predmetiSvi.findIndex(x => x.id === p.id);
          if (idx !== -1) predmetiSvi[idx] = p;
          else predmetiSvi.push(p);
        } else {
          predmetiSvi.push(p);
        }

        sacuvajStorage(predmetiSvi);
        resetForm();
        osvezi();
        alert("Sačuvano!");
      };

      osvezi();
    });

    function osvezi() {
      predmetiSvi = ucitajSveStorage();
      prikaziPredmete();
    }

    function prikaziPredmete() {
      let el = document.getElementById("predmeti-lista");
      if (!el) return;

      if (!predmetiSvi.length) {
        el.innerHTML = "<small style='color:#718096;'>Nema unetih predmeta u bazi.</small>";
        return;
      }

      let q = (document.getElementById("search").value || "").toLowerCase();
      let fV = document.getElementById("filter-vrsta").value;

      let filt = predmetiSvi.filter(p => {
        let mText = (p.naziv_predmeta || "").toLowerCase().includes(q) || (p.interni_broj || "").toLowerCase().includes(q);
        let mVrsta = fV ? p.vrsta_predmeta === fV : true;
        return mText && mVrsta;
      });

      if (!filt.length) {
        el.innerHTML = "<small style='color:#718096;'>Nema poklapanja.</small>";
        return;
      }

      el.innerHTML = filt.map(p => {
        let danas = new Date().toISOString().split('T')[0];
        let jeIsteklo = p.rok_datum && p.rok_datum < danas && p.status !== 'Završeno / Odobreno';
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
      let p = predmetiSvi.find(i => i.id === id);
      if (!p) return;
      let a = prompt("E-mail adresa:", "mirkovic70@gmail.com");
      if (!a) return;

      let n = encodeURIComponent(`Predmet [${p.interni_broj}]: ${p.naziv_predmeta}`);
      let t = `Pregled predmeta:\\n\\n`;
      t += `• Oznaka: ${p.interni_broj}\\n`;
      t += `• Vrsta: ${p.vrsta_predmeta}\\n`;
      t += `• Naziv: ${p.naziv_predmeta}\\n`;
      t += `• Stranka: ${p.investor || '/'}\\n`;
      t += `• Obrađivač: ${p.obradjivac || '/'}\\n`;
      t += `• Status: ${p.status}\\n`;
      t += `• Datum: ${p.datum_prijema}\\n`;
      t += `• Rok: ${p.rok_datum || 'Nema'}\\n`;

      if (p.vrsta_predmeta === 'CEOP i Građevinski postupak') {
        t += `\\n--- CEOP PODACI ---\\n`;
        t += `• CEOP: ${p.ceop_broj || '/'}\\n`;
        t += `• ROP: ${p.rop_broj || '/'}\\n`;
        t += `• KO: ${p.katastarska_opstina || '/'}\\n`;
        t += `• Parcela: ${p.broj_parcele || '/'}\\n`;
      }

      if (p.napomena) t += `\\nNapomena: ${p.napomena}\\n`;
      window.location.href = `mailto:${a}?subject=${n}&body=${encodeURIComponent(t)}`;
    }

    function posaljiZbirniMail() {
      if (!predmetiSvi.length) return alert("Baza je prazna.");
      let a = prompt("E-mail za zbirni izveštaj:", "mirkovic70@gmail.com");
      if (!a) return;

      let n = encodeURIComponent(`Zbirni Izveštaj (${new Date().toLocaleDateString('sr-RS')})`);
      let t = `ZBIRNI PREGLED PREDMETA (${predmetiSvi.length}):\\n\\n`;
      predmetiSvi.forEach((p, i) => {
        t += `${i + 1}. [${p.interni_broj}] ${p.naziv_predmeta} (${p.status})\\n`;
      });
      window.location.href = `mailto:${a}?subject=${n}&body=${encodeURIComponent(t)}`;
    }

    function otvoriTab(t, b) {
      document.querySelectorAll(".tab-content").forEach(e => e.classList.add("hidden"));
      document.querySelectorAll(".tab-btn").forEach(e => e.classList.remove("active"));
      document.getElementById(t).classList.remove("hidden");
      b.classList.add("active");
      if (t === 'tab-kalendar') prikaziKalendar();
      if (t === 'tab-analitika') prikaziAnalitiku();
    }

    function prikaziModulPolja() {
      let v = document.getElementById("vrsta_predmeta").value;
      document.getElementById("ceop-modul").classList.toggle("hidden", v !== "CEOP i Građevinski postupak");
    }

    function obradiFajl(f) {
      if (f) {
        let r = new FileReader();
        r.onload = e => {
          document.getElementById("slika_base64").value = e.target.result;
          if (f.type.startsWith("image/")) {
            document.getElementById("img-preview").src = e.target.result;
            document.getElementById("img-preview").classList.remove("hidden");
          } else {
            document.getElementById("img-preview").classList.add("hidden");
            alert("Dokument priložen: " + f.name);
          }
        };
        r.readAsDataURL(f);
      }
    }

    function prikaziKalendar() {
      let el = document.getElementById("kalendar-lista");
      let saR = predmetiSvi.filter(p => p.rok_datum).sort((a,b) => a.rok_datum.localeCompare(b.rok_datum));
      if (!saR.length) { el.innerHTML = "<small>Nema rokova.</small>"; return; }
      el.innerHTML = saR.map(p => `<div class="item"><strong>${p.rok_datum}</strong> - ${p.naziv_predmeta} (${p.interni_broj})</div>`).join("");
    }

    function prikaziAnalitiku() {
      let d = new Date().toISOString().split('T')[0];
      document.getElementById("st-ukupno").innerText = predmetiSvi.length;
      document.getElementById("st-uradu").innerText = predmetiSvi.filter(p => p.status === 'U radu').length;
      document.getElementById("st-isteklo").innerText = predmetiSvi.filter(p => p.rok_datum && p.rok_datum < d && p.status !== 'Završeno / Odobreno').length;
      document.getElementById("st-zavrseno").innerText = predmetiSvi.filter(p => p.status === 'Završeno / Odobreno').length;
    }

    function generisiPDF() {
      let { jsPDF } = window.jspdf;
      let doc = new jsPDF();
      doc.text("Izvestaj Predmeta", 14, 15);
      doc.save("izvestaj.pdf");
    }

    function generisiExcel() {
      let ws = XLSX.utils.json_to_sheet(predmetiSvi);
      let wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Predmeti");
      XLSX.writeFile(wb, "predmeti.xlsx");
    }

    function izmeni(id) {
      let p = predmetiSvi.find(i => i.id === id);
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
      prikaziModulPolja();
      document.getElementById("form-title").innerText = "✏️ Izmena";
      document.getElementById("cancel-btn").classList.remove("hidden");
      window.scrollTo(0,0);
    }

    function obrisi(id) {
      if (confirm("Obriši predmet?")) {
        predmetiSvi = predmetiSvi.filter(x => x.id !== id);
        sacuvajStorage(predmetiSvi);
        osvezi();
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

    function izveziPodatke() {
      let b = new Blob([JSON.stringify(predmetiSvi, null, 2)], { type: "application/json" });
      let a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = "backup.json";
      a.click();
    }

    function uveziPodatke(e) {
      let f = e.target.files[0];
      if (!f) return;
      let r = new FileReader();
      r.onload = evt => {
        try {
          let u = JSON.parse(evt.target.result);
          if (Array.isArray(u)) {
            predmetiSvi = u;
            sacuvajStorage(predmetiSvi);
            osvezi();
            alert("Uvezeno!");
            zatvoriBackupModal();
          }
        } catch(err) {
          alert("Greška!");
        }
      };
      r.readAsText(f);
    }
  </script>
</body>
</html>"""

with open('public/index.html', 'w', encoding='utf-8') as f:
    f.write(html_code)

print("✅ Uspešno spakovana cela PWA stranica sa skriptama!")
