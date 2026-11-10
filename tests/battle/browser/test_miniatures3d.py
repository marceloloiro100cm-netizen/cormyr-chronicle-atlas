"""Real Chromium + software-WebGL2 acceptance of isolated Cormyr 3D figurines.

Runs only against the synthetic test harness. A software GPU in CI is NOT a
physical Android GPU benchmark or production authenticated acceptance.
"""
import hashlib
import io
import os
from pathlib import Path
import unittest

from PIL import Image
from playwright.sync_api import sync_playwright

BASE = os.getenv("BATTLE_E2E_URL", "http://127.0.0.1:4173/tests/battle/browser/harness.html")
OUTPUT = Path(os.getenv("MINIATURE_SCREENSHOT_DIR", "/tmp/cormyr-miniatures-3d"))


class RigidMiniatureChromiumAcceptance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        OUTPUT.mkdir(parents=True, exist_ok=True)
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(headless=True, args=[
            "--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader",
            "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader",
            "--disable-dev-shm-usage",
        ])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()

    def page(self, *, mobile=False, deny_webgl=False):
        context = self.browser.new_context(
            viewport={"width": 390 if mobile else 1280, "height": 844 if mobile else 900},
            device_scale_factor=1, has_touch=mobile, is_mobile=mobile,
        )
        self.addCleanup(context.close)
        if deny_webgl:
            context.add_init_script("""
                const original = HTMLCanvasElement.prototype.getContext;
                HTMLCanvasElement.prototype.getContext = function(type, ...args) {
                    if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl')
                        return null;
                    return original.call(this, type, ...args);
                };
            """)
        page = context.new_page()
        page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
        page.locator("#miniatures-3d-acceptance").wait_for(timeout=15000)
        return page

    def showcase(self, page, *, mobile=False):
        section = page.locator("#miniatures-3d-acceptance")
        trigger = section.get_by_role("button", name="Ver protótipo 3D")
        trigger.tap() if mobile else trigger.click()
        return section

    def assert_scene_ready(self, section):
        section.locator('.miniatures3d[data-scene-ready="1"]').wait_for(timeout=25000)
        canvas = section.locator(".miniatures3d-viewport canvas")
        self.assertEqual(canvas.count(), 1)
        self.assertGreater(canvas.bounding_box()["width"], 200)
        return canvas

    def snapshot(self, canvas, file_name):
        png = canvas.screenshot(timeout=15000)
        (OUTPUT / file_name).write_bytes(png)
        # Screenshot must contain actual rendered geometry, not a uniform black canvas.
        with Image.open(io.BytesIO(png)) as image:
            reduced = image.convert("RGB").resize((64, 40))
            palette = set(reduced.getdata())
        self.assertGreater(len(palette), 25, f"3D canvas appears blank: {file_name}, colors={len(palette)}")
        return hashlib.sha256(png).hexdigest(), len(palette)

    def test_desktop_real_webgl2_four_and_seventeen_rigid_figures(self):
        page = self.page()
        page_errors = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        section = self.showcase(page)
        canvas = self.assert_scene_ready(section)
        gl = canvas.evaluate("""el => {
            const gl = el.getContext('webgl2');
            return gl ? {version: gl.getParameter(gl.VERSION),
              renderer: gl.getParameter(gl.RENDERER)} : null;
        }""")
        self.assertIsNotNone(gl, "SwiftShader browser did not create a real WebGL2 context")
        self.assertIn("WebGL", gl["version"])
        self.assertEqual(section.locator(".miniatures3d").get_attribute("data-token-count"), "4")
        self.assertIn("Infantaria", section.locator(".miniatures3d-selected").inner_text())
        # Counts are native WebGL sprites; no per-token HTML portal is mounted.
        self.assertEqual(section.locator(".miniatures3d-label").count(), 0)
        self.assertLessEqual(section.locator(".miniatures3d-selected").bounding_box()["height"], 65)
        base_hash, colors = self.snapshot(canvas, "desktop-four-isometric.png")
        self.assertGreater(colors, 25)
        # Detect regression where the isometric board uses only a tiny patch of desktop space.
        with Image.open(OUTPUT / "desktop-four-isometric.png") as screenshot:
            rgb = screenshot.convert("RGB")
            w, h = rgb.size
            lit = [(x, y) for y in range(0, h, 6) for x in range(0, w, 6)
                   if sum(rgb.getpixel((x, y))) > 400]
            self.assertGreater(len(lit), 50)
            width_fraction = (max(x for x, _ in lit) - min(x for x, _ in lit)) / w
            height_fraction = (max(y for _, y in lit) - min(y for _, y in lit)) / h
            self.assertGreaterEqual(width_fraction, .38, width_fraction)
            self.assertGreaterEqual(height_fraction, .60, height_fraction)

        section.get_by_role("button", name="Superior").click()
        page.wait_for_timeout(500)
        top_hash, _ = self.snapshot(canvas, "desktop-four-top.png")
        self.assertNotEqual(top_hash, base_hash, "Camera view change did not alter canvas")

        section.get_by_role("button", name="Isométrica").click()
        section.get_by_role("button", name="Mover peça").click()
        page.wait_for_timeout(750)
        moved_hash, _ = self.snapshot(canvas, "desktop-four-moved.png")
        self.assertNotEqual(moved_hash, base_hash, "Rigid figure movement did not alter canvas")

        section.get_by_role("button", name="17 unidades").click()
        page.wait_for_function(
            "() => document.querySelector('#miniatures-3d-acceptance .miniatures3d')?.dataset.tokenCount === '17'",
            timeout=10000,
        )
        self.assertEqual(section.locator(".miniatures3d").get_attribute("data-token-count"), "17")
        self.assertIn("Apoio", section.locator(".miniatures3d-selected").inner_text())
        self.assertEqual(section.locator(".miniatures3d-label").count(), 0)
        self.snapshot(canvas, "desktop-seventeen.png")
        (OUTPUT / "desktop-seventeen-ui.png").write_bytes(section.screenshot())
        self.assertEqual(page_errors, [], f"Unexpected browser exception: {page_errors}")

    def test_mobile_touch_camera_and_responsive_labels(self):
        page = self.page(mobile=True)
        section = self.showcase(page, mobile=True)
        canvas = self.assert_scene_ready(section)
        section.get_by_role("button", name="Ampliar zoom 3D").tap()
        section.get_by_role("button", name="Superior").tap()
        page.wait_for_timeout(500)
        self.snapshot(canvas, "mobile-top-zoom.png")
        (OUTPUT / "mobile-ui.png").write_bytes(section.screenshot())
        self.assertIn("Infantaria",section.locator(".miniatures3d-selected").inner_text())
        self.assertLessEqual(section.locator(".miniatures3d-sr-only").bounding_box()["width"], 1)
        self.assertEqual(section.locator(".miniatures3d-label").count(), 0)
        self.assertLessEqual(section.locator(".miniatures3d-selected").bounding_box()["height"], 65)
        self.assertLessEqual(
            page.evaluate("document.documentElement.scrollWidth - window.innerWidth"), 5
        )
        controls = section.locator(".miniatures3d-toolbar button")
        for button in controls.all():
            box = button.bounding_box()
            self.assertGreaterEqual(box["height"], 43)
        section.get_by_role("button", name="Centralizar câmera 3D").tap()
        self.assertTrue(section.get_by_role("button", name="Isométrica").is_visible())

    def test_lot5_creatures_coast_and_fortress_scenes(self):
        page = self.page()
        page_errors = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        section = self.showcase(page)
        self.assert_scene_ready(section)
        canvas = section.locator(".miniatures3d-viewport canvas")

        section.get_by_role("button", name="25 famílias de monstros").click()
        page.wait_for_function(
            "() => document.querySelector('#miniatures-3d-acceptance .miniatures3d')?.dataset.tokenCount === '25'"
        )
        self.assertIn("Goblin", section.locator(".miniatures3d-selected").inner_text())
        self.snapshot(canvas, "lot5-creature-families.png")

        section.get_by_role("button", name="Costa e navios").click()
        page.wait_for_function(
            "() => document.querySelector('#miniatures-3d-acceptance .miniatures3d')?.dataset.tokenCount === '5'"
        )
        self.assertIn("sem movimento", section.locator(".miniatures3d-scenic-note").inner_text())
        self.assertIn("Navio militar I", section.locator(".miniatures3d-selected").inner_text())
        self.snapshot(canvas, "lot5-coastal-naval-visual.png")

        section.get_by_role("button", name="Ponte e fortaleza").click()
        page.wait_for_function(
            "() => document.querySelector('#miniatures-3d-acceptance .miniatures3d')?.dataset.tokenCount === '4'"
        )
        self.assertIn("Guarda da ponte", section.locator(".miniatures3d-selected").inner_text())
        self.snapshot(canvas, "lot5-ruined-fortress.png")
        self.assertEqual(page_errors, [], f"3D scene switching should not throw: {page_errors}")

    def test_lot5_scenic_no_webgl_has_readonly_2d_grid(self):
        page = self.page(deny_webgl=True)
        section = self.showcase(page)
        section.get_by_role("button", name="Costa e navios").click()
        section.get_by_text("3D indisponível neste dispositivo.", exact=False).wait_for()
        cells = section.locator(".miniatures3d-fallback-grid button")
        self.assertEqual(cells.count(), 165)
        self.assertGreaterEqual(cells.filter(has_text="●").count(), 5)
        self.assertIn("Navio militar I", section.locator(".miniatures3d-selected").inner_text())

    def test_80_rigid_tokens_load_without_webgl_crash(self):
        page = self.page()
        section = page.locator("#miniatures-3d-load")
        section.get_by_role("button", name="Testar 80 miniaturas").click()
        section.locator('.miniatures3d[data-scene-ready="1"]').wait_for(timeout=30000)
        self.assertEqual(section.locator(".miniatures3d").get_attribute("data-token-count"), "80")
        canvas = section.locator(".miniatures3d-viewport canvas")
        self.snapshot(canvas, "desktop-eighty-tokens.png")
        self.assertIn("Apoio", section.locator(".miniatures3d-selected").inner_text())
        section.get_by_role("button", name="Encerrar carga 3D").click()
        self.assertEqual(section.locator(".miniatures3d-viewport canvas").count(), 0)

    def test_no_webgl_preserves_accessible_2d_fallback(self):
        page = self.page(deny_webgl=True)
        section = self.showcase(page)
        section.get_by_text("3D indisponível neste dispositivo.", exact=False).wait_for(timeout=15000)
        self.assertEqual(section.locator(".miniatures3d-viewport canvas").count(), 0)
        self.assertGreater(section.locator("svg").count(), 0)


if __name__ == "__main__":
    unittest.main()
