import asyncio, subprocess, time
from playwright.async_api import async_playwright

PORT = 8765
BASE = f"http://localhost:{PORT}"
RIS = """TY  - JOUR
TI  - Retrieval-Augmented Generation for Clinical Question Answering
AU  - Li, Ming
PY  - 2024
JO  - Journal of Clinical AI
DO  - 10.9999/example.2024.1
AB  - We study RAG for clinical QA to reduce hallucination.
ER  -
"""

srv = subprocess.Popen(
    ["python3", "-m", "http.server", str(PORT), "-d", "web"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)


def js(data):
    import json
    return json.dumps(data, ensure_ascii=False)


BEYOND_MOCKS = [
    ("**/openlibrary.org/**", {"docs": [{
        "key": "/works/OL1W", "title": "Retrieval-Augmented Generation for Knowledge-Intensive NLP",
        "first_publish_year": 2020, "edition_count": 2, "subject": ["RAG", "NLP", "hallucination"]
    }]}),
    ("**googleapis.com/books/**", {"items": [{
        "volumeInfo": {
            "title": "Knowledge Graphs and LLMs", "authors": ["A. Researcher"],
            "publishedDate": "2023-06-01", "description": "A book on grounding language models with retrieved evidence.",
            "infoLink": "https://books.google.com/books?id=demo"
        }
    }]}),
    ("**/zh.wikipedia.org/**", {"pages": [{
        "key": "检索增强生成", "title": "检索增强生成",
        "excerpt": "<b>检索增强生成</b>（RAG）把外部检索结果加入大模型上下文，以降低幻觉。",
        "description": "一种结合检索与生成的方法"
    }]}),
    ("**/en.wikipedia.org/**", {"pages": [{
        "key": "Retrieval-augmented_generation", "title": "Retrieval-augmented generation",
        "excerpt": "Retrieval-augmented generation combines a retriever with a generator."
    }]}),
    ("**/functions/v1/app/beyond**", {"items": [{
        "full_name": "demo/rag-clinical", "html_url": "https://github.com/demo/rag-clinical",
        "description": "Reference implementation for clinical RAG.", "stargazers_count": 128, "language": "Python"
    }]}),
    ("**/huggingface.co/api/models**", [{
        "id": "demo/clinical-rag", "downloads": 5200, "likes": 41,
        "pipeline_tag": "text-generation", "tags": ["rag", "medical"]
    }]),
    ("**/huggingface.co/api/datasets**", [{
        "id": "demo/clinical-qa", "downloads": 1800, "likes": 12, "tags": ["question-answering", "medical"]
    }]),
    ("**/api.stackexchange.com/**", {"items": [{
        "title": "How to reduce hallucination in RAG?",
        "link": "https://stackoverflow.com/questions/1/rag-hallucination",
        "score": 23, "answer_count": 4, "is_answered": True, "tags": ["python", "rag", "llm"]
    }]}),
    ("**/hn.algolia.com/**", {"hits": [{
        "title": "Ask HN: Has RAG actually reduced hallucinations for you?",
        "url": "https://news.ycombinator.com/item?id=1", "objectID": "1",
        "points": 44, "num_comments": 18
    }]}),
    ("**/dev.to/api/**", [{
        "title": "Evaluating RAG pipelines in practice", "url": "https://dev.to/demo/rag",
        "description": "Metrics and failure modes when grounding answers.", "tag_list": ["rag", "llm"],
        "positive_reactions_count": 37
    }]),
]

SYNTHESIS = """论文证据表明，把检索到的外部证据加入上下文能减少医学问答中的幻觉 [P1]，但效果仍取决于检索质量与证据覆盖 [P2]。
辅助资料给出了同一思路的定义与工程实践 [R1][R2]，GitHub 与模型库可以作为复现起点 [R3][R4]。
这些资源未经同行评审，只能作为线索；若要评估临床场景，证据不足的部分需要回到论文原文与受控实验核对 [P1][R1]。"""


async def mock(page):
    async def health(route):
        await route.fulfill(status=200, content_type="application/json", body=(
            '{"ok":true,"llm":true,"contactEmail":true,'
            '"sources":["openalex","s2","crossref","europepmc","dblp","arxiv","github"]}'
        ))

    async def empty(route):
        await route.fulfill(status=204, body="")

    async def llm(route):
        await route.fulfill(status=200, content_type="application/json", body=js({
            "choices": [{"message": {"role": "assistant", "content": SYNTHESIS}}]
        }))

    await page.route("**/functions/v1/app/health", health)
    await page.route("**/functions/v1/app/llm", llm)
    for pattern, payload in BEYOND_MOCKS:
        async def handler(route, request=None, data=payload):
            await route.fulfill(
                status=200, content_type="application/json", body=js(data),
                headers={"Access-Control-Allow-Origin": "*"}
            )
        await page.route(pattern, handler)
    await page.route("**/favicon.ico", empty)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for w, h, tag in [(1280, 800, "pc"), (390, 844, "m")]:
            pg = await b.new_page(viewport={"width": w, "height": h})
            errs, cons = [], []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.on("console", lambda m: cons.append(m.text) if m.type == "error" else None)
            await mock(pg)
            await pg.goto(BASE + "/")
            await pg.wait_for_timeout(900)
            await pg.screenshot(path=f"dev/shots/v2-{tag}-home.png")

            # v2.2 文件导入（本地解析，不发请求）
            await pg.set_input_files("#import-input", {
                "name": "sample.ris", "mimeType": "text/plain", "buffer": RIS.encode()
            })
            await pg.wait_for_timeout(400)
            await pg.screenshot(path=f"dev/shots/v22-{tag}-import.png")
            summary = await pg.locator("#import-summary").inner_text()

            # v2.2 自带凭证设置
            await pg.click("#open-settings")
            await pg.wait_for_timeout(500)
            await pg.fill("#uk-s2", "test-s2-key")
            await pg.fill("#uk-scopus", "test-scopus-key")
            await pg.click("#save-settings")
            await pg.wait_for_timeout(300)
            keyed_badge = await pg.locator("#keyed-badge").inner_text()
            key_items = await pg.locator(".key-item").count()
            await pg.locator("#settings-dialog").evaluate(
                "el => { el.scrollTop = el.querySelector('#user-key-list').offsetTop - 80; }"
            )
            await pg.screenshot(path=f"dev/shots/v22-{tag}-settings.png")

            # 演示结果：只读取本地 JSON，不发真实检索
            await pg.click("#close-settings")
            await pg.wait_for_timeout(300)
            btn = pg.locator("[data-demo]").first
            if await btn.count():
                await btn.click()
            await pg.wait_for_timeout(2800)
            await pg.screenshot(path=f"dev/shots/v2-{tag}-result.png")
            await pg.screenshot(path=f"dev/shots/v2-{tag}-full.png", full_page=True)
            cards = await pg.locator(".paper-card, [data-paper]").count()
            card = pg.locator(".paper-card, [data-paper]").first
            if await card.count():
                await card.click()
                await pg.wait_for_timeout(700)
            await pg.screenshot(path=f"dev/shots/v2-{tag}-detail.png")

            # v2.3 论文之外（手动触发，所有上游与 /llm 均已模拟）
            await pg.keyboard.press("Escape")
            await pg.wait_for_timeout(300)
            expand = pg.get_by_role("button", name="拓展到书籍与社区")
            if await expand.count():
                await expand.scroll_into_view_if_needed()
                await expand.click()
            await pg.wait_for_timeout(2600)
            beyond_count = await pg.locator(".beyond-card").count()
            synth = pg.locator(".synthesis-box")
            synth_text = await synth.inner_text() if await synth.count() else ""
            if await synth.count():
                await synth.scroll_into_view_if_needed()
            else:
                await pg.locator(".beyond-block").scroll_into_view_if_needed()
            await pg.wait_for_timeout(300)
            await pg.screenshot(path=f"dev/shots/v23-{tag}-beyond.png")
            await pg.screenshot(path=f"dev/shots/v23-{tag}-beyond-full.png", full_page=True)
            print(tag, "errors", errs, "console", cons)
            print(tag, "import", summary.replace("\n", " / "), "keyed", keyed_badge, "items", key_items, "cards", cards)
            print(tag, "beyond", beyond_count, "synthesis", synth_text.replace("\n", " / ")[:80])
            await pg.close()
        await b.close()

try:
    asyncio.run(main())
finally:
    srv.kill()