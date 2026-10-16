import unittest
from unittest.mock import MagicMock

from audiobook_generator.book_parsers.base_book_parser import get_book_parser
from audiobook_generator.book_parsers.epub_book_parser import EpubBookParser
from tests.test_utils import get_cartesia_config

class TestGetBookParser(unittest.TestCase):

    def test_get_epub_book_parser(self):
        config = get_cartesia_config()

        parser = get_book_parser(config)
        self.assertIsInstance(parser, EpubBookParser)
        self.assertEqual(parser.get_book_author(), "Lewis Carroll")
        self.assertEqual(parser.get_book_title(), "Alice's Adventures in Wonderland (excerpts)")
        self.assertEqual(parser._sanitize_title(parser.get_book_title(), " @BRK#"), "Alices_Adventures_in_Wonderland_excerpts")
        chapters = parser.get_chapters(" @BRK#")
        self.assertEqual([title for title, _ in chapters], ["Down_the_RabbitHole", "The_Pool_of_Tears"])
        for _, text in chapters:
            self.assertNotIn("Gutenberg", text)
            self.assertIn("@BRK#", text)

    def test_unsupported_file_format(self):
        config = MagicMock(input_file='book.unsupported')

        with self.assertRaises(NotImplementedError):
            get_book_parser(config)

if __name__ == '__main__':
    unittest.main()
