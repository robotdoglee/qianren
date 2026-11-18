import json, sys, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET, os
UA={'User-Agent':'qianren-demo-gen/0.1 (student project)'}
def get(url, tries=12, wait=15):
    for i in range(tries):
        try:
            r=urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=45)
            return r.read()
        except urllib.error.HTTPError as e:
            print('HTTP',e.code,url[:90],file=sys.stderr)
            if e.code==429: time.sleep(wait+5*i); continue
            return None
        except Exception as e:
            print('ERR',e,file=sys.stderr); time.sleep(3)
    return None
def arxiv(q,n=12):
    b=get('https://export.arxiv.org/api/query?'+urllib.parse.urlencode({'search_query':'all:'+q,'max_results':n,'sortBy':'relevance'}))
    if not b: return []
    ns={'a':'http://www.w3.org/2005/Atom','x':'http://arxiv.org/schemas/atom'}
    out=[]
    for e in ET.fromstring(b).findall('a:entry',ns):
        aid=e.find('a:id',ns).text.split('/abs/')[-1]
        out.append(dict(source='arxiv',title=' '.join(e.find('a:title',ns).text.split()),abstract=' '.join(e.find('a:summary',ns).text.split()),
          year=int(e.find('a:published',ns).text[:4]),authors=[a.find('a:name',ns).text for a in e.findall('a:author',ns)],
          arxiv=aid.split('v')[0] if 'v' in aid else aid,url='https://arxiv.org/abs/'+aid.split('v')[0],
          doi=(e.find('x:doi',ns).text if e.find('x:doi',ns) is not None else None),venue='arXiv'))
    return out
def s2(q,n=15):
    b=get('https://api.semanticscholar.org/graph/v1/paper/search?'+urllib.parse.urlencode({'query':q,'limit':n,'fields':'title,abstract,year,authors,venue,externalIds,url,citationCount'}))
    if not b: return []
    out=[]
    for p in json.loads(b).get('data',[]):
        ex=p.get('externalIds') or {}
        out.append(dict(source='s2',title=p['title'],abstract=p.get('abstract'),year=p.get('year'),authors=[a['name'] for a in p.get('authors',[])],
          doi=ex.get('DOI'),arxiv=ex.get('ArXiv'),url=p.get('url'),venue=p.get('venue'),citations=p.get('citationCount')))
    return out
demo=sys.argv[1]; qs=sys.argv[2:]
res={'queries':qs,'arxiv':[], 's2':[]}
for q in qs:
    res['arxiv']+= [dict(r,query=q) for r in arxiv(q)]; time.sleep(3.5)
    res['s2']+= [dict(r,query=q) for r in s2(q)]; time.sleep(4)
json.dump(res,open(f'raw-{demo}.json','w'),ensure_ascii=False,indent=1)
print(demo,'arxiv',len(res['arxiv']),'s2',len(res['s2']))
