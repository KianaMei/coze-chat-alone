import os

from bs4 import BeautifulSoup


def main() -> None:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir = os.path.dirname(script_dir)
    path = os.path.join(base_dir, "coze_docs", "html", "chat_v3.html")
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()
    soup = BeautifulSoup(html, "html.parser")

    print("=== doc-local-nav ===")
    nav = soup.select_one(".doc-local-nav")
    if nav:
        print(nav.prettify()[:2000])
    else:
        print("no .doc-local-nav found")

    print("\n=== search for 'API 介绍' ===")
    for text in soup.find_all(string=lambda s: isinstance(s, str) and "API 介绍" in s):
        el = text.parent
        print("tag:", el.name, "classes:", el.get("class"))
        current = el
        depth = 0
        while current and depth < 4:
            print(f"\n--- ancestor depth {depth}, tag {current.name}, classes={current.get('class')}")
            snippet = current.prettify()
            print(snippet[:600])
            current = current.parent
            depth += 1
        break

    print("\n=== search for '使用指南' ===")
    for text in soup.find_all(string=lambda s: isinstance(s, str) and "使用指南" in s):
        el = text.parent
        print("tag:", el.name, "classes:", el.get("class"))
        print(el.prettify()[:500])
        break

    print("\n=== search for 'API 和 SDK' ===")
    for text in soup.find_all(string=lambda s: isinstance(s, str) and "API 和 SDK" in s):
        el = text.parent
        print("tag:", el.name, "classes:", el.get("class"))
        print(el.prettify()[:500])
        break

    print("\n=== first semi-collapse-item ===")
    item = soup.select_one(".semi-collapse-item")
    if item:
        print(item.prettify()[:1200])
        current = item.parent
        depth = 1
        while current and depth <= 4:
            print(f"\n--- collapse ancestor depth {depth}, tag {current.name}, classes={current.get('class')}")
            snippet = current.prettify()
            print(snippet[:600])
            current = current.parent
            depth += 1
    else:
        print("no .semi-collapse-item found")


if __name__ == "__main__":
    main()
