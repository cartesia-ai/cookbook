import unittest
import logging
from audiobook_generator.utils.utils import split_text

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

class TestSplitText(unittest.TestCase):
    def test_input_file(self):
        """Test input file."""
        input_file = "tests/long_text.txt"
        with open(input_file, "r") as f:
            text = f.read()

        max_chars = 400
        chunks = split_text(text, max_chars, "zh-CN")
        for i, chunk in enumerate(chunks, 1):
            print(f"Chunk {i} of {len(chunks)}, length={len(chunk)}, text=[{chunk}]")
            print("-"*100)
            assert len(chunk) <= max_chars, f"Chunk {i} length {len(chunk)} exceeds max_chars {max_chars}"

        original_sans_whitespace = ''.join(c for c in text if not c.isspace())
        chunks_sans_whitespace = ''.join(c for c in ''.join(chunks) if not c.isspace())

        assert len(chunks_sans_whitespace) == len(original_sans_whitespace), "Content might be lost during splitting"

if __name__ == "__main__":
    unittest.main()

