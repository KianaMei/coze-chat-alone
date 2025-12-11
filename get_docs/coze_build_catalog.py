import os
import urllib.parse

from bs4 import BeautifulSoup


BASE_ORIGIN = "https://www.coze.cn"
BASE_PREFIX = "/open/docs/developer_guides"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(SCRIPT_DIR)
DOCS_ROOT = os.path.join(BASE_DIR, "coze_docs")

HTML_DIR = os.path.join(DOCS_ROOT, "html")
SOURCE_HTML = os.path.join(HTML_DIR, "chat_v3.html")
OUTPUT_MD = os.path.join(DOCS_ROOT, "coze_developer_guides_catalog.md")


def href_to_slug(href: str) -> str | None:
    if not href:
        return None
    url = urllib.parse.urljoin(BASE_ORIGIN, href)
    parsed = urllib.parse.urlparse(url)
    if parsed.netloc and parsed.netloc != urllib.parse.urlparse(BASE_ORIGIN).netloc:
        return None
    path = parsed.path
    if not path.startswith(BASE_PREFIX):
        return None
    relative = path[len(BASE_PREFIX) :].strip("/")
    if not relative:
        relative = "index"
    return relative


def build_catalog() -> list[dict]:
    with open(SOURCE_HTML, "r", encoding="utf-8") as f:
        html = f.read()
    soup = BeautifulSoup(html, "html.parser")

    roots = soup.select("div[class^=playground-sub-menu--]")
    menu_root = None
    for candidate in roots:
        if candidate.select_one(".semi-collapse-item"):
            menu_root = candidate
            break
    if not menu_root:
        print("menu_root not found")
        return []

    all_items = soup.select(".semi-collapse-item")
    root_items = menu_root.select(".semi-collapse-item")
    print(f"total collapse items: {len(all_items)}, under chosen menu_root: {len(root_items)}")

    catalog: list[dict] = []
    for item in root_items:
        header = item.select_one(".semi-collapse-header")
        if not header:
            continue
        group_title = header.get_text(strip=True)
        entries: list[dict] = []
        for link in item.select(".semi-collapse-content-wrapper a[href]"):
            href = link.get_attribute_list("href")[0]
            slug = href_to_slug(href)
            if not slug:
                continue
            title = link.get_text(strip=True)
            local_html = os.path.join(HTML_DIR, f"{slug}.html")
            entries.append(
                {
                    "title": title,
                    "slug": slug,
                    "href": href,
                    "local_html": local_html.replace("\\", "/"),
                }
            )
        if entries:
            catalog.append({"group": group_title, "items": entries})

    return catalog


def write_markdown(catalog: list[dict]) -> None:
    lines: list[str] = []
    for group in catalog:
        lines.append(f"- {group['group']}")
        for item in group["items"]:
            lines.append(f"  - [{item['title']}]({item['local_html']})")
    content = "\n".join(lines) + "\n"
    with open(OUTPUT_MD, "w", encoding="utf-8") as f:
        f.write(content)


def main() -> None:
    catalog = build_catalog()
    print(f"groups: {len(catalog)}")
    write_markdown(catalog)


if __name__ == "__main__":
    main()
