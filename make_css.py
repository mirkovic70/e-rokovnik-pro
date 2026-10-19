css_code = """
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
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
.grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.item { background: white; border-left: 5px solid var(--accent); padding: 10px; border-radius: 6px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.item.isteklo { border-left-color: var(--danger); background: #fff5f5; }
.badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; background: #e2e8f0; }
.ceop-section { background: #ebf8ff; border: 1px solid #bee3f8; padding: 8px; border-radius: 6px; margin-top: 6px; }
img.preview { max-width: 100%; max-height: 120px; border-radius: 6px; margin-top: 6px; object-fit: cover; }
.hidden { display: none; }
.stat-box { text-align: center; background: #edf2f7; padding: 10px; border-radius: 6px; }
.stat-num { font-size: 1.4rem; font-weight: bold; color: var(--primary); }
.stat-label { font-size: 10px; color: #718096; font-weight: bold; }
"""
with open('public/styles.css', 'w', encoding='utf-8') as f:
    f.write(css_code)

print('✅ Korak 2 uspešan!')
