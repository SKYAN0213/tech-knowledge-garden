"""Isolated browser; every HTTP request is fulfilled by the parent safe fetcher."""
import asyncio
import hashlib
import json
from pathlib import Path
import sys
from worker import checked_path
from playwright.async_api import async_playwright


async def main():
    initial = json.loads(sys.stdin.readline())
    root = Path(initial["root"]).absolute()
    pending = {}

    async def consume():
        while True:
            line = await asyncio.to_thread(sys.stdin.readline)
            if not line:
                break
            message = json.loads(line)
            future = pending.pop(message.get("request_id"), None)
            if future:
                future.set_result(message)

    reader = asyncio.create_task(consume())
    counter = 0
    failures = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--disable-background-networking", "--disable-sync", "--disable-features=WebRtcHideLocalIpsWithMdns"])
        context = await browser.new_context(service_workers="block", accept_downloads=False)
        await context.route_web_socket("**/*", lambda route: route.close())

        async def intercept(route):
            nonlocal counter
            request = route.request
            if request.method != "GET" or request.resource_type in ("image", "media", "font") or not request.url.startswith(("http://", "https://")):
                await route.abort()
                return
            counter += 1
            if counter > initial.get("request_limit", 80):
                failures.append("request-budget")
                await route.abort()
                return
            request_id = f"browser-{counter}"
            future = asyncio.get_running_loop().create_future()
            pending[request_id] = future
            print(json.dumps({"type": "fetch", "request_id": request_id, "url": request.url}), flush=True)
            try:
                response = await asyncio.wait_for(future, timeout=30)
                if response.get("status") != "captured":
                    failures.append(response.get("error", "resource-unavailable"))
                    await route.abort()
                    return
                file = checked_path(root, response["body_path"])
                data = file.read_bytes()
                if hashlib.sha256(data).hexdigest() != response["body_sha256"]:
                    raise ValueError("Browser resource hash mismatch")
                await route.fulfill(status=200, body=data, content_type=response.get("mime_type") or "application/octet-stream")
            except Exception as error:
                failures.append(str(error))
                await route.abort()

        await context.route("**/*", intercept)
        page = await context.new_page()
        await page.goto(initial["url"], wait_until="domcontentloaded", timeout=45000)
        if initial.get("wait_selector"):
            await page.wait_for_selector(initial["wait_selector"], timeout=10000)
        else:
            try:
                await page.wait_for_load_state("networkidle", timeout=5000)
            except Exception:
                failures.append("network-idle-timeout")
        result = {"type": "result", "html": await page.content(), "url": page.url, "requests": counter, "resource_failures": failures}
        print(json.dumps(result), flush=True)
        await context.close()
        await browser.close()
    reader.cancel()
    # No waiting for an outstanding stdin read when the parent has the result.


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        print(json.dumps({"type": "error", "error": str(error)}), flush=True)
        sys.exit(1)
