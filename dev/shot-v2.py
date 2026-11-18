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


async def mock(page):
    async def health(route):
        await route.fulfill(status=200, content_type="application/json", body=(
            '{"ok":true,"llm":false,"contactEmail":true,'
            '"sources":["openalex","s2","crossref","europepmc","dblp","arxiv"]}'
        ))

    async def empty(route):
        await route.fulfill(status=204, body="")

    await page.route("**/functions/v1/app/health", health)
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
            print(tag, "errors", errs, "console", cons)
            print(tag, "import", summary.replace("\n", " / "), "keyed", keyed_badge, "items", key_items, "cards", cards)
            await pg.close()
        await b.close()

try:
    asyncio.run(main())
finally:
    srv.kill()