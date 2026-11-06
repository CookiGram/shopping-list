"""Chromium E2E for CookiList SW cache refresh (test fixture, no deployment).

Exercises the actual sw.js checked out in the PR, with a synthetic small app
shell and catalog versions hosted on one localhost origin. The legacy SW is
identical except for a simulated previous catalog version.
"""
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
SOURCE = (ROOT / "sw.js").read_bytes()
CATALOG = json.loads((ROOT / "data/cookigram-catalog.json").read_text(encoding="utf-8"))
REF = CATALOG["meta"]["source"]["ref"]
assert re.fullmatch(r"[0-9a-f]{40}", REF)
TOKEN = REF[:7]
OLD_TOKEN = "0000000" if TOKEN != "0000000" else "1111111"
OLD_REF = OLD_TOKEN + "0" * 33
MARKER = ('const CATALOG_REF7 = "%s";' % TOKEN).encode("ascii")
assert SOURCE.count(MARKER) == 1, "Current SW token must match catalog source ref"
OLD_SOURCE = SOURCE.replace(MARKER, ('const CATALOG_REF7 = "%s";' % OLD_TOKEN).encode("ascii"))
assert OLD_SOURCE != SOURCE

HTML = b'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>CookiList SW update E2E</title></head>
<body><h1>CookiList SW lifecycle fixture</h1><script>
window.swRegistration = navigator.serviceWorker.register('/sw.js', {updateViaCache:'none'});
</script></body></html>'''
state = {"phase": "old"}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        phase = state["phase"]
        if path == "/sw.js":
            body, kind = (SOURCE if phase == "new" else OLD_SOURCE), "text/javascript"
        elif path in ("/", "/index.html"):
            body, kind = HTML, "text/html"
        elif path == "/data/cookigram-catalog.json":
            ref = OLD_REF if phase == "old" else REF
            body = json.dumps({"meta": {"source": {"ref": ref}}, "ingredients": [{"slug": ref[:7]}]}).encode()
            kind = "application/json"
        elif path == "/manifest.webmanifest":
            body = b'{"name":"CookiList test","short_name":"CookiList","start_url":"/","scope":"/","display":"standalone"}'
            kind = "application/manifest+json"
        elif path.endswith(".svg"):
            body, kind = b'<svg xmlns="http://www.w3.org/2000/svg"/>', "image/svg+xml"
        elif path.endswith(".png"):
            body, kind = b"test-image", "image/png"
        elif path.endswith(".json"):
            body, kind = b"{}", "application/json"
        elif path.endswith(".css"):
            body, kind = b"/* fixture */", "text/css"
        else:
            body, kind = b"// fixture", "text/javascript"
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def fetch_ref(page):
    return page.evaluate("""async () => {
      const response = await fetch('/data/cookigram-catalog.json');
      return (await response.json()).meta.source.ref;
    }""")


def cache_keys(page):
    return page.evaluate("() => caches.keys()")


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    listener = threading.Thread(target=server.serve_forever, daemon=True)
    listener.start()
    address = "http://127.0.0.1:%d/" % server.server_address[1]
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            context = browser.new_context(service_workers="allow")
            page = context.new_page()
            page.goto(address, wait_until="domcontentloaded")
            page.evaluate("() => window.swRegistration")
            page.wait_for_function("() => !!navigator.serviceWorker.controller", timeout=20000)
            page.wait_for_function(
                "() => caches.keys().then(keys => keys.includes('shopping-list-%s'))" % OLD_TOKEN,
                timeout=20000,
            )
            assert fetch_ref(page) == OLD_REF, "old catalog must be pre-cached"
            assert "shopping-list-" + OLD_TOKEN in cache_keys(page)
            print("PASS: old SW installed and old catalog cached")

            page.evaluate("() => caches.open('cookigram-fixture-cache')")
            state["phase"] = "changed-without-worker-update"
            page.evaluate("() => navigator.serviceWorker.ready.then(reg => reg.update())")
            assert "shopping-list-" + OLD_TOKEN in cache_keys(page)
            assert fetch_ref(page) == OLD_REF, "unchanged SW must initially serve stale snapshot"
            print("PASS: reproduced stale cache without SW token bump")

            state["phase"] = "new"
            page.evaluate("() => navigator.serviceWorker.ready.then(reg => reg.update())")
            page.wait_for_function("""async () => {
              const names = await caches.keys();
              return names.includes('shopping-list-%s') && !names.includes('shopping-list-%s');
            }""" % (TOKEN, OLD_TOKEN), timeout=20000)
            names = cache_keys(page)
            assert "cookigram-fixture-cache" in names, "CookiGram cache must survive SW update"
            assert fetch_ref(page) == REF, "new catalog not served after SW upgrade"
            print("PASS: new SW activated, old CookiList cache purged, foreign cache preserved")

            context.set_offline(True)
            page.reload(wait_until="domcontentloaded", timeout=15000)
            assert page.title() == "CookiList SW update E2E", "app shell did not load offline"
            assert fetch_ref(page) == REF, "new catalog unavailable offline"
            print("PASS: offline navigation and updated catalog snapshot")
            context.set_offline(False)
            context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
