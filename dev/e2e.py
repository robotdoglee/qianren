# 本地端到端冒烟：python3 dev/e2e.py [base_url]  （默认起本地静态服务）
import sys, subprocess, time, os, json
from playwright.sync_api import sync_playwright
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
base = sys.argv[1] if len(sys.argv) > 1 else None
srv = None
if not base:
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '-d', os.path.join(root, 'web')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1); base = 'http://127.0.0.1:8765/'
out = os.path.join(root, 'dev', 'shots'); os.makedirs(out, exist_ok=True)
errs = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, vp in [('desktop', {'width': 1280, 'height': 900}), ('mobile', {'width': 390, 'height': 844})]:
        pg = b.new_page(viewport=vp)
        pg.on('console', lambda m: m.type == 'error' and errs.append(f'{name}: {m.text}'))
        pg.on('pageerror', lambda e: errs.append(f'{name} pageerror: {e}'))
        pg.goto(base, wait_until='networkidle')
        btns = pg.locator('#demo-wrap button')
        n = btns.count(); print(name, 'demo buttons', n)
        for i in range(n):
            btns.nth(i).click()
            pg.wait_for_selector('#panel-result:not([hidden])', timeout=15000)
            time.sleep(3.5)
            rows = pg.locator('#panel-result table tbody tr').count()
            cards = pg.locator('#panel-result .card, #panel-result [class*=cluster], #panel-result [class*=approach]').count()
            txt = pg.inner_text('#panel-result')
            print(f'  demo{i}: rows={rows} cards={cards} len={len(txt)} missing={txt.count("摘要未提及")}')
            pg.screenshot(path=os.path.join(out, f'{name}-demo{i}.png'), full_page=False)
            if i == 0 and name == 'desktop':
                pg.screenshot(path=os.path.join(out, f'{name}-demo{i}-full.png'), full_page=True)
        pg.close()
    b.close()
if srv: srv.terminate()
print('errors:', json.dumps(errs[:20], ensure_ascii=False))
