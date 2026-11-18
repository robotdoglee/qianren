import json,urllib.request,time,sys
ids=json.load(open('ids.json'))
def dec(inv):
    if not inv: return None
    pos=[(p,w) for w,ps in inv.items() for p in ps]; pos.sort(); return ' '.join(w for _,w in pos)
cache={}
try: cache=json.load(open('works-cache.json'))
except: pass
for demo,d in ids.items():
    for lst in d['ids']:
        for w in lst:
            if w in cache: continue
            url=f'https://api.openalex.org/works/{w}?select=id,doi,title,publication_year,cited_by_count,abstract_inverted_index,authorships,primary_location,ids,type'
            try:
                j=json.load(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'qianren-demo'}),timeout=30))
            except Exception as e:
                print('fail',w,e); continue
            pl=j.get('primary_location') or {}
            src=(pl.get('source') or {}).get('display_name')
            cache[w]=dict(openalex=j['id'],doi=(j.get('doi') or '').replace('https://doi.org/','') or None,title=j['title'],year=j['publication_year'],
              citations=j.get('cited_by_count'),abstract=dec(j.get('abstract_inverted_index')),
              authors=[a['author']['display_name'] for a in j.get('authorships',[])],venue=src,
              landing=pl.get('landing_page_url'),type=j.get('type'))
            time.sleep(0.2)
json.dump(cache,open('works-cache.json','w'),ensure_ascii=False,indent=1)
print(len(cache), sum(1 for v in cache.values() if v['abstract']))
