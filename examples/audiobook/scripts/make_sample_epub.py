import html
import os
import re

from ebooklib import epub

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "..", "samples", "alice_ch1_2.txt")
TARGET = os.path.join(HERE, "..", "samples", "alice_sample.epub")

def read_chapters(path):
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    parts = re.split(r"^=== (.+) ===\s*$", raw, flags=re.M)
    return [(parts[i], [p.strip() for p in parts[i + 1].split("\n\n") if p.strip()]) for i in range(1, len(parts), 2)]

def build(chapters):
    book = epub.EpubBook()
    book.set_identifier("alice-sample-gutenberg-11")
    book.set_title("Alice's Adventures in Wonderland (excerpts)")
    book.set_language("en")
    book.add_author("Lewis Carroll")
    book.add_metadata("DC", "description", "Two excerpts for the Cartesia audiobook example. "
                      "Text from Project Gutenberg ebook #11; public domain in the United States.")
    items = []
    for i, (title, paragraphs) in enumerate(chapters, start=1):
        item = epub.EpubHtml(title=title, file_name=f"chapter{i}.xhtml", lang="en")
        body = "\n".join(f"<p>\n\n{html.escape(p, quote=False)}\n\n</p>" for p in paragraphs)
        item.content = f"<h1>{html.escape(title)}</h1>\n\n{body}\n"
        book.add_item(item)
        items.append(item)
    book.toc = tuple(items)
    book.add_item(epub.EpubNcx())
    book.spine = items
    return book

if __name__ == "__main__":
    epub.write_epub(TARGET, build(read_chapters(SOURCE)))
    print(f"wrote {os.path.normpath(TARGET)}")
