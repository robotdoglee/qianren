import asyncio,subprocess,time
from playwright.async_api import async_playwright
srv=subprocess.Popen(["python3","-m","http.server","8765","-d","web"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    for w,h,tag in [(1280,800,"pc"),(390,844,"m")]:
      pg=await b.new_page(viewport={"width":w,"height":h})
      errs=[];pg.on("pageerror",lambda e:errs.append(str(e)))
      await pg.goto("http://localhost:8765/");await pg.wait_for_timeout(800)
      await pg.screenshot(path=f"dev/shots/v2-{tag}-home.png")
      btn=pg.locator("[data-demo]").first
      if await btn.count(): await btn.click()
      await pg.wait_for_timeout(2800)
      await pg.screenshot(path=f"dev/shots/v2-{tag}-result.png",full_page=False)
      await pg.screenshot(path=f"dev/shots/v2-{tag}-full.png",full_page=True)
      card=pg.locator(".paper-card, [data-paper]").first
      if await card.count(): await card.click(); await pg.wait_for_timeout(700)
      await pg.screenshot(path=f"dev/shots/v2-{tag}-detail.png")
      print(tag,"errors",errs, pg.url)
    await b.close()
asyncio.run(main());srv.kill()
