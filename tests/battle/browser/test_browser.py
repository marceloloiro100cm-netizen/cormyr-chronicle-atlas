"""Browser-only acceptance: real Chromium viewport, mouse, keyboard, touch and integrity.
No campaign credentials, no production URL and no real HouseState are used.
"""
import json
import os
import unittest
from playwright.sync_api import sync_playwright

BASE=os.getenv("BATTLE_E2E_URL","http://127.0.0.1:4173/tests/battle/browser/harness.html")

class TacticalBrowserAcceptance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._pw=sync_playwright().start()
        cls.browser=cls._pw.chromium.launch(headless=True, args=["--no-sandbox"])
    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls._pw.stop()

    def open_page(self, width=1280, height=860, touch=False):
        ctx=self.browser.new_context(
            viewport={"width":width,"height":height},
            is_mobile=touch,has_touch=touch,device_scale_factor=1,
        )
        self.addCleanup(ctx.close)
        page=ctx.new_page()
        errors=[]
        browser_console=[]
        failures=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.on("console",lambda m:browser_console.append(m.text) if m.type=="error" else None)
        page.on("requestfailed",lambda req:failures.append(req.url))
        page.goto(BASE,wait_until="domcontentloaded",timeout=60000)
        try:
            page.get_by_text("Somente dados fictícios.",exact=False).wait_for(timeout=8000)
        except Exception as exc:
            raise AssertionError(
                "Harness failed to mount; URL="+page.url+
                " errors="+repr(errors)+
                " console="+repr(browser_console[-6:])+
                " failedRequests="+repr(failures[-6:])+
                " body="+repr(page.locator("body").inner_text()[:700])+
                " html="+repr(page.content()[:1400])
            ) from exc
        self.assertEqual(errors,[],f"Browser page errors: {errors}")
        return page

    def test_desktop_editor_mouse_keyboard_undo_and_15_by_11(self):
        page=self.open_page()
        edit=page.locator("#map-editor")
        board=page.locator("#interactive-board")
        cell=edit.locator(".battle-hex--interactive").first
        polygon=cell.locator("polygon")
        self.assertEqual(polygon.get_attribute("fill"),"#d4c69e")
        edit.get_by_role("button",name="Floresta",exact=True).click()
        cell.click()
        self.assertEqual(polygon.get_attribute("fill"),"#66886b")
        edit.get_by_role("button",name="Desfazer pincel").click()
        self.assertEqual(polygon.get_attribute("fill"),"#d4c69e")
        selected=board.get_by_test_id("selected-hex")
        bcell=board.locator(".battle-hex--interactive").first
        bcell.focus()
        page.keyboard.press("Enter")
        self.assertIn("0,0",selected.inner_text())
        edit.get_by_label("Dimensões do mapa").select_option("15")
        self.assertIn("15 colunas por 11 linhas",
            edit.locator("svg[aria-label]").first.get_attribute("aria-label"))
        self.assertEqual(edit.locator(".battle-hex--interactive").count(),165)

    def test_mobile_touch_and_inner_zoom_do_not_expand_page(self):
        page=self.open_page(390,844,touch=True)
        board=page.locator("#interactive-board")
        board.locator(".battle-hex--interactive").first.tap()
        self.assertIn("0,0",board.get_by_test_id("selected-hex").inner_text())
        board.get_by_role("button",name="Ampliar zoom do mapa").tap()
        board.get_by_role("button",name="Ampliar zoom do mapa").tap()
        self.assertEqual(board.locator(".battle-zoom-controls output").inner_text(),"200%")
        self.assertLessEqual(page.evaluate(
            "document.documentElement.scrollWidth - window.innerWidth"),4)
        board.get_by_role("button",name="Restaurar zoom do mapa").tap()
        self.assertEqual(board.locator(".battle-zoom-controls output").inner_text(),"100%")
        edit=page.locator("#map-editor")
        edit.get_by_label("Dimensões do mapa").select_option("15")
        self.assertEqual(edit.locator(".battle-hex--interactive").count(),165)
        edit.get_by_role("button",name="Ampliar zoom do mapa").tap()
        edit.locator(".battle-hex--interactive").first.tap()
        self.assertLessEqual(page.evaluate(
            "document.documentElement.scrollWidth - window.innerWidth"),4)

    def test_replay_turns_and_reject_tampered_json(self):
        page=self.open_page()
        replay=page.locator("#verified-replay")
        self.assertIn("SHA-256 verificado",replay.inner_text())
        status=replay.get_by_role("status")
        self.assertIn("Comando 0 de",status.inner_text())
        replay.get_by_role("button",name="Próximo").click()
        self.assertIn("Comando 1 de",status.inner_text())
        valid_json=page.evaluate("window.__battleE2eReplay")
        self.assertTrue(valid_json)
        raw=json.loads(valid_json)
        raw["finalStateHash"]="0"*64
        uploader=page.locator("#replay-import").get_by_label("Importar arquivo de replay")
        uploader.set_input_files({
            "name":"tampered.json","mimeType":"application/json",
            "buffer":json.dumps(raw).encode("utf-8"),
        })
        page.locator("#replay-import").get_by_role("alert").wait_for()
        self.assertIn("Integridade não confirmada",
            page.locator("#replay-import").get_by_role("alert").inner_text())
        uploader.set_input_files({
            "name":"verified.json","mimeType":"application/json",
            "buffer":valid_json.encode("utf-8"),
        })
        page.locator("#replay-import").get_by_role(
            "status",name=None).filter(has_text="Integridade confirmada").wait_for()
        self.assertEqual(page.locator("#replay-import").get_by_role("alert").count(),0)

if __name__=="__main__":
    unittest.main()
