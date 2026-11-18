# 用真实缓存的 OpenAlex 记录回放网络，验证实时模式（免 key 规则引擎）整条管线：检索→去重→排序→抽取→聚类→渲染→导出
import sys, subprocess, time, os, json
from playwright.sync_api import sync_playwright
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cache=json.load(open(os.path.join(root,'data-gen/works-cache.json')))
ids=json.load(open(os.path.join(root,'data-gen/ids.json')))
def inv(t):
    d={}
    for i,w in enumerate((t or '').split()): d.setdefault(w,[]).append(i)
    return d or None
def works(demo):
    out=[];seen=set()
    for l in ids[demo]['ids']:
        for w in l:
            if w in seen or w not in cache: continue
            seen.add(w); c=cache[w]
            out.append({'id':c['openalex'],'doi':('https://doi.org/'+c['doi']) if c['doi'] else None,'title':c['title'],'publication_year':c['year'],'cited_by_count':c['citations'],
              'abstract_inverted_index':inv(c['abstract']),'authorships':[{'author':{'display_name':a}} for a in c['authors']],'primary_location':{'source':{'display_name':c['venue']}}})
    return out
demo=sys.argv[1]; q=sys.argv[2]; mode=sys.argv[3] if len(sys.argv)>3 else 'idea'
W=works(demo)
srv=subprocess.Popen([sys.executable,'-m','http.server','8767','-d',os.path.join(root,'web')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':900})
    pg.route('**/api.openalex.org/**', lambda r: r.fulfill(status=200, headers={'access-control-allow-origin':'*','content-type':'application/json'}, body=json.dumps({'meta':{'count':len(W)},'results':W})))
    pg.route('**/api.semanticscholar.org/**', lambda r: r.fulfill(status=429, headers={'access-control-allow-origin':'*'}, body='{}'))
    pg.goto('http://127.0.0.1:8767/',wait_until='networkidle')
    if mode=='problem': pg.locator('#mode-tabs button').nth(1).click()
    pg.fill('#main-input',q); t=time.time(); pg.click('#run-btn')
    pg.wait_for_selector('#panel-result:not([hidden])',timeout=60000); time.sleep(1)
    print('elapsed',round(time.time()-t,1))
    print(pg.inner_text('#panel-progress')[:900])
    txt=pg.inner_text('#panel-result'); print('rows',pg.locator('#panel-result table tbody tr').count(),'len',len(txt)); print(txt[:1500])
    pg.screenshot(path=os.path.join(root,f'dev/shots/replay-{demo}.png'),full_page=True)
    b.close()
srv.terminate()
