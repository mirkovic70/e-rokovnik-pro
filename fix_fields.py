import re

with open('public/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Proširujemo HTML template za karticu predmeta da prikazuje napomenu, sliku i CEOP
old_card = '<small><b>Datum:</b> ${p.datum_prijema} \vert{} <b>Rok:</b>${p.rok_datum||\'Nema\'}</small>'
new_card = '''<small><b>Datum:</b> ${p.datum_prijema} | <b>Rok:</b> ${p.rok_datum\vert{}\vert{}'Nema'}</small>${p.napomena ? `<br><small style="color:#4a5568;"><b>Napomena:</b> ${p.napomena}</small>` : ''}
${p.slika_base64 && p.slika_base64.startsWith('data:image') ? `<br><img src="${p.slika_base64}" style="max-width:100%; max-height:120px; border-radius:6px; margin-top:6px; object-fit:cover;">` : ''}
${p.slika_base64 && !p.slika_base64.startsWith('data:image') ? `<br><small style="color:#2b6cb0;"><b>Priložen dokument:</b> DA</small>` : ''}'''

if old_card in html:
    html = html.replace(old_card, new_card)
    with open('public/index.html', 'w', encoding='utf-8') as f:
        f.write(html)
    print("✅ Prikaz napomena i priloga uspešno aktiviran!")
else:
    print("⚠️ Šablon je već ažuriran ili ima drugačiji format.")

