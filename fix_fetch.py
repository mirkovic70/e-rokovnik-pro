with open('public/index.html', 'r', encoding='utf-8') as f:
    code = f.read()

# Zamena starog XHR koda sa pouzdanim fetch API-jem
old_script = """    function ucitaj() {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/predmeti', true);
      xhr.onload = function() {
        if (xhr.status === 200) {
          predmetiSvi = JSON.parse(xhr.responseText);
          prikazi();
        }
      };
      xhr.send();
    }"""

new_script = """    function ucitaj() {
      fetch('/api/predmeti')
        .then(res => res.json())
        .then(data => {
          predmetiSvi = data;
          prikazi();
        })
        .catch(err => {
          document.getElementById('predmeti-lista').innerHTML = '<small style="color:red;">Greška pri učitavanju podataka.</small>';
        });
    }"""

if old_script in code:
    code = code.replace(old_script, new_script)
    with open('public/index.html', 'w', encoding='utf-8') as f:
        f.write(code)
    print("✅ Skripta je uspešno ažurirana na Fetch API!")
else:
    print("⚠️ Tekst za zamenu nije pronađen, proverite fajl.")
