import os
import urllib.parse

from bs4 import BeautifulSoup
import html2text


BASE_ORIGIN = "https://www.coze.cn"
BASE_PREFIX = "/open/docs/developer_guides"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(SCRIPT_DIR)
DOCS_ROOT = os.path.join(BASE_DIR, "coze_docs")

HTML_DIR = os.path.join(DOCS_ROOT, "html")
MD_DIR = os.path.join(DOCS_ROOT, "md")


def slug_to_url(slug: str) -> str:
    if slug == "index":
        path = BASE_PREFIX
    else:
        path = f"{BASE_PREFIX}/{slug}"
    return urllib.parse.urljoin(BASE_ORIGIN, path)


def html_to_markdown(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    body = soup.body or soup

    for tag in body.find_all(["script", "style"]):
        tag.decompose()

    converter = html2text.HTML2Text()
    converter.body_width = 0
    converter.unicode_snob = True
    converter.ignore_links = False
    converter.ignore_images = False
    converter.single_line_break = True

    markdown = converter.handle(str(body))
    return markdown.strip()


def convert_file(path: str, out_root: str) -> None:
    filename = os.path.basename(path)
    slug, _ = os.path.splitext(filename)
    url = slug_to_url(slug)

    with open(path, "r", encoding="utf-8") as f:
        html = f.read()

    markdown = html_to_markdown(html)
    rel_path = f"{slug}.md"
    out_path = os.path.join(out_root, rel_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(url + "\n\n")
        f.write(markdown)


def main() -> None:
    os.makedirs(MD_DIR, exist_ok=True)
    html_files = [
        os.path.join(HTML_DIR, name)
        for name in os.listdir(HTML_DIR)
        if name.lower().endswith(".html")
    ]
    html_files.sort()
    total = len(html_files)
    for idx, path in enumerate(html_files, start=1):
        convert_file(path, MD_DIR)
        print(f"[coze-html2md] {idx}/{total}: {os.path.basename(path)}")


if __name__ == "__main__":
    main()
