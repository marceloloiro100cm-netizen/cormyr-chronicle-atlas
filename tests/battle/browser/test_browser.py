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
                " viteResponse="+repr(page.request.get(BASE.replace("harness.html","harness.tsx")).text()[:2400])+
                " body="+repr(page.locator("body").inner_text()[:700])+
                " html="+repr(page.content()[:1400])
            ) from exc
        self.assertEqual(errors,[],f"Browser page errors: {errors}")
        return page


    def test_battle_home_buttons_and_text_are_readable(self):
        for width,height in ((1440,900),(390,844)):
            with self.subTest(viewport=width):
                page=self.open_page(width,height,touch=width<600)
                sample=page.locator("#battle-legibility-probe")
                self.assertTrue(sample.get_by_role("heading",name="Laboratório de batalha").is_visible())
                data=sample.evaluate("""root=>{
                  const css=(el)=>getComputedStyle(el);
                  const color=s=>{
                    const nums=(s.match(/[\\d.]+/g)||[]).slice(0,3).map(Number);
                    return nums.map(v=>v/255);
                  };
                  const lum=rgb=>rgb.map(v=>v<=.04045?v/12.92:
                    Math.pow((v+.055)/1.055,2.4))
                    .reduce((acc,v,i)=>acc+v*[.2126,.7152,.0722][i],0);
                  const contrast=(a,b)=>{
                    const l1=lum(color(a)),l2=lum(color(b));
                    return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
                  };
                  const disabled=root.querySelector('button:disabled');
                  const outline=Array.from(root.querySelectorAll('button'))
                    .find(b=>b.textContent.includes('Criar batalha visual'));
                  return {
                    body:parseFloat(css(root).fontSize),
                    description:parseFloat(css(root.querySelector('p')).fontSize),
                    heading:parseFloat(css(root.querySelector('h2')).fontSize),
                    outlineText:css(outline).color,
                    outlineBackground:css(outline).backgroundColor,
                    outlineRatio:contrast(css(outline).color,css(outline).backgroundColor),
                    disabledOpacity:parseFloat(css(disabled).opacity),
                    disabledRatio:contrast(css(disabled).color,css(disabled).backgroundColor),
                    disabledBackground:css(disabled).backgroundColor,
                  };
                }""")
                self.assertGreaterEqual(data["body"],16,data)
                self.assertGreaterEqual(data["description"],16,data)
                self.assertGreaterEqual(data["heading"],23,data)
                self.assertGreaterEqual(data["outlineRatio"],4.5,data)
                self.assertGreaterEqual(data["disabledRatio"],4.5,data)
                self.assertEqual(data["disabledOpacity"],1,data)
                self.assertLessEqual(page.evaluate(
                    "document.documentElement.scrollWidth-window.innerWidth"),4)

    def test_square_maps_render_and_legacy_hex_remains_available(self):
        page=self.open_page(1440,900)
        page.get_by_role("button",name="Abrir arena V3").click()
        page.get_by_role("button",name="Batalhar",exact=True).click()
        dialog=page.get_by_role("dialog",name="Batalha em tela ampliada")
        dialog.wait_for(timeout=15000)
        v3=dialog.get_by_role("group",name="Mapa quadrado com 11 colunas por 9 linhas")
        self.assertEqual(v3.locator('[data-battle-cell-shape="square"]').count(),99)
        self.assertEqual(v3.locator('[data-battle-cell-shape="hex"]').count(),0)
        dialog.get_by_role("button",name="Sair da tela ampliada").click()
        page.get_by_role("button",name="Abrir arena CRZ").click()
        crz_field=page.get_by_label("Formato da malha CRZ")
        try:
            crz_field.wait_for(timeout=12000)
        except Exception as exc:
            raise AssertionError(
                "CRZ nao montou apos alternar V3: "+
                repr(page.locator("#v4-visual-acceptance").inner_text()[:1800])+
                " body="+repr(page.locator("body").inner_text()[:500])
            ) from exc
        self.assertEqual(crz_field.input_value(),"square")
        page.get_by_role("button",name="Iniciar treinamento CRZ").click()
        dialog=page.get_by_role("dialog",name="Batalha em tela ampliada")
        dialog.wait_for(timeout=15000)
        self.assertEqual(dialog.locator('[data-crz-cell-shape="square"]').count(),99)
        self.assertEqual(dialog.locator('[data-crz-cell-shape="hex"]').count(),0)
        # Lote 1: reiniciar uma batalha ativa exige confirmação explícita.
        page.once("dialog",lambda prompt:prompt.accept())
        dialog.locator(".battle-crz-utilities > summary").click()
        dialog.get_by_role("button",name="Novo treino").click()
        self.assertEqual(page.get_by_label("Formato da malha CRZ").input_value(),"square")
        self.assertEqual(page.get_by_label("Formato da malha CRZ").locator('option[value="hex"]').count(),0)

    def test_v4_battle_panels_keep_readable_font_sizing(self):
        page=self.open_page(1440,900)
        page.get_by_role("button",name="Abrir arena V3").click()
        page.get_by_role("button",name="Batalhar",exact=True).click()
        dialog=page.get_by_role("dialog",name="Batalha em tela ampliada")
        dialog.wait_for(timeout=15000)
        v3=dialog.evaluate("""root=>({
          base:parseFloat(getComputedStyle(root.querySelector('.crusade-v4-stage')).fontSize),
          turn:parseFloat(getComputedStyle(root.querySelector('.crusade-v4-turn-card strong')).fontSize),
          action:parseFloat(getComputedStyle(root.querySelector('.crusade-v4-commands button')).fontSize)
        })""")
        self.assertGreaterEqual(v3["base"],16,v3)
        self.assertGreaterEqual(v3["turn"],15,v3)
        self.assertGreaterEqual(v3["action"],15,v3)
        dialog.get_by_role("button",name="Sair da tela ampliada").click()
        page.get_by_role("button",name="Abrir arena CRZ").click()
        page.get_by_role("button",name="Iniciar treinamento CRZ").click()
        alert=page.locator(".crz-alert")
        if alert.count() and alert.first.is_visible():
            self.fail("CRZ setup rejeitou a malha: "+alert.first.inner_text())
        crz=page.get_by_role("dialog",name="Batalha em tela ampliada")
        crz.wait_for(timeout=15000)
        sizes=crz.evaluate("""root=>({
          base:parseFloat(getComputedStyle(root.querySelector('.crz-battle-stage')).fontSize),
          turn:parseFloat(getComputedStyle(root.querySelector('.crz-turn-card strong')).fontSize),
          action:parseFloat(getComputedStyle(root.querySelector('.crz-command-footer button')).fontSize)
        })""")
        self.assertGreaterEqual(sizes["base"],16,sizes)
        self.assertGreaterEqual(sizes["turn"],15,sizes)
        self.assertGreaterEqual(sizes["action"],15,sizes)

    def test_desktop_editor_mouse_keyboard_undo_and_15_by_11(self):
        page=self.open_page()
        edit=page.locator("#map-editor")
        board=page.locator("#interactive-board")
        cell=edit.locator(".battle-hex--interactive").first
        shape=cell.locator('[data-battle-cell-shape="square"]')
        self.assertEqual(shape.get_attribute("fill"),"#d4c69e")
        edit.get_by_role("button",name="Floresta",exact=True).click()
        cell.click()
        self.assertEqual(shape.get_attribute("fill"),"#66886b")
        edit.get_by_role("button",name="Desfazer pincel").click()
        self.assertEqual(shape.get_attribute("fill"),"#d4c69e")
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
        status=replay.locator('p[role="status"]').first
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

    def test_v4_desktop_integrated_general_map_order_and_direct_move(self):
        page=self.open_page(1440,900)
        page.get_by_role("button",name="Abrir arena V3").click()
        page.get_by_role("button",name="Batalhar",exact=True).click()
        dialog=page.get_by_role("dialog",name="Batalha em tela ampliada")
        dialog.wait_for(timeout=15000)
        box=dialog.bounding_box()
        self.assertLessEqual(abs(box["x"]),2)
        self.assertGreaterEqual(box["width"],1438)
        self.assertGreaterEqual(box["height"],898)
        self.assertEqual(page.evaluate("document.body.style.overflow"),"hidden")
        stage=page.get_by_role("region",name="Arena V4 unificada")
        stage.wait_for(timeout=15000)
        general=stage.locator(".crusade-v4-general").bounding_box()
        field=stage.locator(".crusade-v4-battlefield").bounding_box()
        latest=stage.locator(".crusade-v4-history").bounding_box()
        turns=stage.locator(".crusade-v4-turns").bounding_box()
        self.assertIsNotNone(general)
        self.assertIsNotNone(field)
        self.assertIsNotNone(latest)
        self.assertIsNotNone(turns)
        self.assertLess(general["x"],field["x"])
        self.assertLess(field["x"],latest["x"])
        self.assertLess(turns["y"],field["y"])
        portrait=stage.locator(".crusade-v4-general .battle-commander-portrait img").first
        self.assertTrue(portrait.is_visible())
        portrait.evaluate("(img) => img.decode()")
        self.assertGreater(portrait.evaluate("(img) => img.naturalWidth"),100)
        self.assertEqual(stage.get_by_role("button",name="Mover",exact=True).count(),0)
        self.assertEqual(stage.get_by_role("button",name="Atacar",exact=True).count(),0)
        board=stage.locator(".battle-board-svg--cormyr")
        rail=stage.locator(".crusade-v4-turn-card")
        self.assertGreaterEqual(rail.count(),6)
        rail.nth(1).hover()
        self.assertEqual(board.locator("[data-battle-hover-ring]").count(),1)
        rail.nth(1).focus()
        self.assertEqual(board.locator("[data-battle-hover-ring]").count(),1)
        rail.first.click()
        legal=board.locator('[role="button"][aria-label*="movimento permitido"]')
        self.assertGreater(legal.count(),0)
        legal.first.click()
        self.assertIn("Marcha",stage.locator(".crusade-v4-history").inner_text())
        self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth-window.innerWidth"),4)

    def test_v4_escape_restores_site_without_abandoning_battle(self):
        page=self.open_page(1280,780)
        page.get_by_role("button",name="Abrir arena V3").click()
        page.get_by_role("button",name="Batalhar",exact=True).click()
        dialog=page.get_by_role("dialog",name="Batalha em tela ampliada")
        dialog.wait_for(timeout=15000)
        self.assertTrue(dialog.get_by_role("heading",name="Ordem de combate").is_visible())
        self.assertEqual(dialog.get_by_role("button",name="Ajustes",exact=True).count(),0)
        page.keyboard.press("Escape")
        self.assertEqual(page.get_by_role("dialog",name="Batalha em tela ampliada").count(),0)
        self.assertEqual(page.evaluate("document.body.style.overflow"),"")
        self.assertTrue(page.get_by_role("region",name="Arena V4 unificada").is_visible())
        page.get_by_role("button",name="Ampliar batalha").click()
        dialog.wait_for(timeout=15000)
        dialog.get_by_role("button",name="Sair da tela ampliada").click()
        self.assertEqual(page.get_by_role("dialog",name="Batalha em tela ampliada").count(),0)

    def test_v4_mobile_touch_zoom_and_single_screen_layout(self):
        page=self.open_page(390,844,touch=True)
        page.get_by_role("button",name="Abrir arena V3").tap()
        page.get_by_role("button",name="Batalhar",exact=True).tap()
        dialog=page.get_by_role("dialog",name="Batalha em tela ampliada")
        dialog.wait_for(timeout=15000)
        self.assertGreaterEqual(dialog.bounding_box()["width"],388)
        stage=page.get_by_role("region",name="Arena V4 unificada")
        stage.wait_for(timeout=15000)
        self.assertEqual(stage.locator(".crusade-v4-turn-card").count(),8)
        self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth-window.innerWidth"),4)
        stage.get_by_role("button",name="Ampliar zoom do mapa").tap()
        self.assertIn("150%",stage.locator(".battle-zoom-controls").inner_text())
        self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth-window.innerWidth"),4)
        stage.locator(".crusade-v4-turn-card").first.tap()
        legal=stage.locator('.battle-board-svg--cormyr [role="button"][aria-label*="movimento permitido"]')
        self.assertGreater(legal.count(),0)
        legal.first.tap()
        self.assertIn("Marcha",stage.locator(".crusade-v4-history").inner_text())
        stage.get_by_role("button",name="Sair da tela ampliada").tap()
        self.assertEqual(page.get_by_role("dialog",name="Batalha em tela ampliada").count(),0)
        self.assertIn("Marcha",page.locator(".crusade-v4-history").inner_text())
        page.get_by_role("button",name="Abrir arena CRZ").tap()
        page.get_by_role("button",name="Iniciar treinamento CRZ").tap()
        alert=page.locator(".crz-alert")
        if alert.count() and alert.first.is_visible():
            self.fail("CRZ mobile rejeitou a malha: "+alert.first.inner_text())
        page.get_by_role("dialog",name="Batalha em tela ampliada").wait_for(timeout=15000)
        crz=page.get_by_role("region",name="Arena e comandos CRZ")
        crz.wait_for(timeout=15000)
        self.assertTrue(crz.get_by_role("heading",name="Ordem de combate").is_visible())
        portrait=crz.locator(".crz-general-deck .battle-commander-portrait img").first
        self.assertTrue(portrait.is_visible())
        portrait.evaluate("(img) => img.decode()")
        self.assertGreater(portrait.evaluate("(img) => img.naturalWidth"),100)
        self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth-window.innerWidth"),4)
        crz.get_by_role("button",name="Ampliar zoom CRZ").tap()
        self.assertIn("150%",crz.get_by_label("Zoom do mapa CRZ").inner_text())
        self.assertLessEqual(page.evaluate("document.documentElement.scrollWidth-window.innerWidth"),4)


    def test_mobile_all_three_modes_got_next_phase_dnd_summary_and_adapted_undo(self):
        # Dados fictícios e sem autenticação: cobertura de regressão móvel, NÃO prova RLS.
        got=self.open_page(390,844,touch=True)
        got.get_by_role("button",name="Abrir arena GOT").tap()
        got.get_by_role("button",name="Batalhar agora").tap()
        dock=got.get_by_role("region",name="Próxima decisão")
        dock.wait_for(timeout=15000)
        self.assertIn("Agora",dock.inner_text())
        next_button=dock.locator("button")
        self.assertGreaterEqual(next_button.evaluate("el=>el.getBoundingClientRect().height"),44)
        next_button.tap()
        self.assertEqual(got.locator("#got-battle-orders, #got-personal-actions, #got-after-action").count()>=1,True)
        self.assertLessEqual(got.evaluate("document.documentElement.scrollWidth-window.innerWidth"),4)

        dnd=self.open_page(390,844,touch=True)
        dnd.get_by_role("button",name="Abrir arena D&D").tap()
        dnd.get_by_text("Montar exércitos e ajustar cenário").tap()
        summary=dnd.get_by_role("region",name="Resumo do confronto D&D")
        summary.wait_for(timeout=15000)
        self.assertIn("PV estimados",summary.inner_text())
        self.assertIn("CA média",summary.inner_text())
        self.assertIn("não",summary.inner_text())
        self.assertEqual(summary.locator(".dnd-encounter-metric").count(),2)
        dnd.get_by_role("button",name="Batalhar agora").tap()
        dnd.get_by_role("dialog",name="Batalha em tela ampliada").wait_for(timeout=15000)
        self.assertLessEqual(dnd.evaluate("document.documentElement.scrollWidth-window.innerWidth"),4)

        adapted=self.open_page(390,844,touch=True)
        adapted.get_by_role("button",name="Abrir arena Adaptado").tap()
        dialog=adapted.get_by_role("dialog",name="Batalha em tela ampliada")
        dialog.wait_for(timeout=15000)
        legal=dialog.locator('[data-battle-hex][aria-label*="movimento permitido"]')
        self.assertGreater(legal.count(),0)
        legal.first.tap()
        undo=dialog.get_by_role("button",name="Desfazer última ação")
        undo.wait_for(timeout=10000)
        self.assertGreaterEqual(undo.evaluate("el=>el.getBoundingClientRect().height"),44)
        undo.tap()
        self.assertIn("Última ação desfeita",dialog.inner_text())
        self.assertLessEqual(adapted.evaluate(
            "document.documentElement.scrollWidth-window.innerWidth"),4)

    def test_mobile_save_destinations_and_scope_are_explicit(self):
        page=self.open_page(390,844,touch=True)
        page.get_by_role("button",name="Abrir arena GOT").tap()
        page.get_by_text("Salvar ou retomar",exact=True).tap()
        self.assertIn("Este navegador",page.get_by_role(
            "note").first.inner_text())
        page.get_by_role("button",name="Batalhar agora").tap()
        self.assertTrue(page.get_by_role("button",name="Salvar batalha").is_visible())


if __name__=="__main__":
    unittest.main()
