import unittest

from audiobook_generator.utils.utils import split_text

class TestSplitText(unittest.TestCase):
    def test_chinese_text_splits_under_the_limit_without_losing_text(self):
        with open("tests/long_text.txt", encoding="utf-8") as f:
            text = f.read()

        max_chars = 400
        chunks = split_text(text, max_chars, "zh-CN")
        self.assertGreater(len(chunks), 3)
        for i, chunk in enumerate(chunks, 1):
            self.assertLessEqual(len(chunk), max_chars, f"chunk {i}")

        original = "".join(c for c in text if not c.isspace())
        joined = "".join(c for c in "".join(chunks) if not c.isspace())
        self.assertEqual(joined, original)

if __name__ == "__main__":
    unittest.main()
