import os
import time
import urllib.parse
from collections import deque

from bs4 import BeautifulSoup
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(SCRIPT_DIR)
DOCS_ROOT = os.path.join(BASE_DIR, "coze_docs")

ENV_FILE = os.path.join(SCRIPT_DIR, ".env")


def load_env_from_file(path: str = ENV_FILE) -> None:
    if not os.path.exists(path):
        return
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                stripped = line.strip()
                if not stripped or stripped.startswith("#"):
                    continue
                if "=" not in stripped:
                    continue
                key, value = stripped.split("=", 1)
                key = key.strip()
                if not key:
                    continue
                value = value.strip()
                if key not in os.environ:
                    os.environ[key] = value
    except OSError:
        return


load_env_from_file()


BASE_ORIGIN = "https://www.coze.cn"
BASE_PREFIX = "/open/docs/developer_guides"
START_URL = urllib.parse.urljoin(BASE_ORIGIN, BASE_PREFIX)

TEXT_OUTPUT_DIR = os.path.join(DOCS_ROOT, "txt")
HTML_OUTPUT_DIR = os.path.join(DOCS_ROOT, "html")
SLEEP_SECONDS = 1.0
GOTO_TIMEOUT_MS = 25000
TEXT_TIMEOUT_MS = 15000
MAX_PAGES = int(os.environ.get("COZE_MAX_PAGES", "200"))
# 运行时自动从目录计算总数；COZE_TOTAL_PAGES 仅用于显式覆盖
TOTAL_EXPECTED = int(os.environ.get("COZE_TOTAL_PAGES", "0"))
INITIAL_WAIT_MS = int(os.environ.get("COZE_INITIAL_WAIT_MS", "3000"))
SCROLL_STEP_PX = int(os.environ.get("COZE_SCROLL_STEP_PX", "800"))
SCROLL_WAIT_MS = int(os.environ.get("COZE_SCROLL_WAIT_MS", "300"))
MAX_SCROLL_STEPS = int(os.environ.get("COZE_MAX_SCROLL_STEPS", "40"))


def normalize_url(url: str) -> str:
    if not url:
        return ""
    url = urllib.parse.urljoin(BASE_ORIGIN, url)
    parsed = urllib.parse.urlparse(url)
    if parsed.netloc != urllib.parse.urlparse(BASE_ORIGIN).netloc:
        return ""
    path = parsed.path
    if not path.startswith(BASE_PREFIX):
        return ""
    clean = parsed._replace(query="", fragment="")
    return urllib.parse.urlunparse(clean)


def resolve_relative_path(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    path = parsed.path
    if path.endswith("/"):
        path = path[:-1]
    if path.startswith(BASE_PREFIX):
        relative = path[len(BASE_PREFIX) :]
    else:
        relative = path
    if not relative:
        relative = "/index"
    return relative


def save_text(url: str, text: str) -> None:
    relative = resolve_relative_path(url)
    filename = relative.replace("/", os.sep) + ".txt"
    full_path = os.path.join(TEXT_OUTPUT_DIR, filename.lstrip(os.sep))
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(url + "\n\n")
        f.write(text)


def save_html(url: str, html: str) -> None:
    html = sanitize_html(html)
    relative = resolve_relative_path(url)
    filename = relative.replace("/", os.sep) + ".html"
    full_path = os.path.join(HTML_OUTPUT_DIR, filename.lstrip(os.sep))
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(html)


def sanitize_html(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")

    for script in soup.find_all("script"):
        script.decompose()

    for link in soup.find_all("link"):
        rel = link.get("rel")
        if not rel:
            continue
        rel_values = [r.lower() for r in rel]
        if "preload" in rel_values and link.get("as") == "script":
            link.decompose()

    for tag in soup.find_all(src=True):
        src = tag["src"]
        if src.startswith("/"):
            tag["src"] = urllib.parse.urljoin(BASE_ORIGIN, src)

    for tag in soup.find_all(href=True):
        href = tag["href"]
        absolute = urllib.parse.urljoin(BASE_ORIGIN, href)
        parsed = urllib.parse.urlparse(absolute)
        path = parsed.path or ""
        if path.startswith(BASE_PREFIX):
            relative = path[len(BASE_PREFIX) :].strip("/")
            if not relative:
                relative = "index"
            local_href = relative + ".html"
            tag["href"] = local_href
            continue
        if href.startswith("/"):
            tag["href"] = urllib.parse.urljoin(BASE_ORIGIN, href)

    return str(soup)


def load_full_page(page) -> None:
    if INITIAL_WAIT_MS > 0:
        page.wait_for_timeout(INITIAL_WAIT_MS)

    same_height_steps = 0

    for _ in range(MAX_SCROLL_STEPS):
        current_height = page.evaluate("() => document.body.scrollHeight || 0")
        page.evaluate(
            "(step) => { window.scrollBy(0, step); }", SCROLL_STEP_PX
        )
        page.wait_for_timeout(SCROLL_WAIT_MS)
        new_height = page.evaluate("() => document.body.scrollHeight || 0")

        if new_height <= current_height:
            same_height_steps += 1
            if same_height_steps >= 3:
                break
        else:
            same_height_steps = 0

    page.evaluate("() => { window.scrollTo(0, 0); }")

def crawl() -> None:
    os.makedirs(TEXT_OUTPUT_DIR, exist_ok=True)
    os.makedirs(HTML_OUTPUT_DIR, exist_ok=True)
    visited: set[str] = set()
    queue: deque[str] = deque([START_URL])
    count = 0
    started_at = time.time()
    expected_total: int | None = TOTAL_EXPECTED if TOTAL_EXPECTED > 0 else None

    print(f"[coze-crawler] start from {START_URL}")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        try:
            while queue:
                if MAX_PAGES and count >= MAX_PAGES:
                    break
                url = queue.popleft()
                if url in visited:
                    continue
                visited.add(url)
                page = context.new_page()
                try:
                    page.goto(url, timeout=GOTO_TIMEOUT_MS, wait_until="networkidle")
                    load_full_page(page)
                    html_content = page.content()
                    if html_content:
                        save_html(url, html_content)
                    try:
                        text = page.inner_text("body", timeout=TEXT_TIMEOUT_MS)
                    except PlaywrightTimeoutError:
                        text = ""
                    text = text.strip()
                    if text:
                        save_text(url, text)
                        count += 1
                        if expected_total and expected_total > 0:
                            percent = int(count * 100 / expected_total)
                            print(
                                f"[coze-crawler] saved {count}/{expected_total} "
                                f"({percent}%) : {url}"
                            )
                        else:
                            print(f"[coze-crawler] saved {count}: {url}")
                    anchor_elements = page.query_selector_all("a[href]")
                    if expected_total is None and url == START_URL:
                        expected_urls: set[str] = set()
                        for anchor in anchor_elements:
                            href = anchor.get_attribute("href")
                            normalized = normalize_url(href)
                            if normalized:
                                expected_urls.add(normalized)
                        # 包含入口页本身
                        expected_total = len(expected_urls | {START_URL})
                    for anchor in anchor_elements:
                        href = anchor.get_attribute("href")
                        normalized = normalize_url(href)
                        if not normalized:
                            continue
                        if normalized in visited:
                            continue
                        if normalized not in queue:
                            queue.append(normalized)
                except PlaywrightTimeoutError as e:
                    print(f"[coze-crawler] timeout: {url} ({e})")
                except Exception as e:
                    print(f"[coze-crawler] error: {url} ({e})")
                finally:
                    page.close()
                    time.sleep(SLEEP_SECONDS)
        finally:
            context.close()
            browser.close()
    elapsed = time.time() - started_at
    avg = elapsed / count if count else 0.0
    print(
        f"[coze-crawler] done. visited={len(visited)} saved={count} "
        f"in {elapsed:.1f}s, avg {avg:.2f}s/page"
    )


if __name__ == "__main__":
    crawl()
