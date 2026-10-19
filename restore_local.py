with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Dodajemo automatsku migraciju iz localStorage u data.json pri učitavanju
old_script = "window.addEventListener('DOMContentLoaded', () => {"
new_script = """window.addEventListener('DOMContentLoaded', async () => {
  // Automatsko preuzimanje i spajanje starih predmeta iz localStorage
  try {
    let localData = localStorage.getItem('rokovnik_predmeti_v1');
    if (localData) {
      let stariPredmeti = JSON.parse(localData);
      if (Array.isArray(stariPredmeti) && stariPredmeti.length > 0) {
        for (let p of stariPredmeti) {
          await fetch('/api/predmeti', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(p)
          });
        }
        localStorage.removeItem('rokovnik_predmeti_v1');
      }
    }
  } catch(e) {}"""

if old_script in html:
    html = html.replace(old_script, new_script)
    with open('public/index.html', 'w', encoding='utf-8') as f:
        f.write(html)
    print("✅ Automatsko spajanje starih predmeta aktivirano!")
else:
    print("⚠️ Skripta je već pripremljena.")

