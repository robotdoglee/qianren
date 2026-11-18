import sys, subprocess, time, os
from playwright.sync_api import sync_playwright
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
srv=subprocess.Popen([sys.executable,'-m','http.server','8766','-d',os.path.join(root,'web')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
q=sys.argv[1] if len(sys.argv)>1 else '基于扩散模型的低剂量CT图像去噪'
with sync_playwright() as p:
    import urllib.parse as up; u=up.urlparse(os.environ.get('HTTPS_PROXY','')); px={'server':f'http://{u.hostname}:{u.port}','username':up.unquote(u.username or ''),'password':up.unquote(u.password or ''),'bypass':'127.0.0.1,localhost'} if u.hostname else None
    b=p.chromium.launch(proxy=px) if px else p.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':900})
    pg.goto('http://127.0.0.1:8766/',wait_until='networkidle')
    pg.fill('#main-input',q); t=time.time(); pg.click('#run-btn')
    for _ in range(70):
        time.sleep(1)
        if not pg.locator('#panel-result').is_hidden() or 'failed' in (pg.inner_text('#panel-progress') or ''): break
    time.sleep(2)
    print('elapsed',round(time.time()-t,1)); print(pg.inner_text('#panel-progress')[:1200]); print('RESULT:',pg.inner_text('#panel-result')[:600] if not pg.locator('#panel-result').is_hidden() else 'hidden'); print('ERR:',pg.inner_text('#errors') if not pg.locator('#errors').is_hidden() else '')
    pg.screenshot(path=os.path.join(root,'dev/shots/live.png'))
    b.close()
srv.terminate()
