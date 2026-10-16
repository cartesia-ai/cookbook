import unittest
from unittest.mock import patch
from main import handle_args

class TestHandleArgs(unittest.TestCase):

    @patch('sys.argv', ['program', 'input_file.epub', 'output_folder', '--tts', 'cartesia'])
    def test_cartesia_args(self):
        config = handle_args()
        self.assertEqual(config.tts, 'cartesia')

    @patch('sys.argv', ['program', 'input_file.epub', 'output_folder'])
    def test_cartesia_is_the_default(self):
        config = handle_args()
        self.assertEqual(config.tts, 'cartesia')

    @patch('sys.argv', ['program', 'input_file.epub', 'output_folder'])
    def test_cartesia_defaults(self):
        config = handle_args()
        self.assertEqual(config.cast_mode, 'dialogue')
        self.assertTrue(config.cartesia_expressive)
        self.assertIsNone(config.cast_file)
        self.assertTrue(config.write_timings)
        self.assertIsNone(config.break_duration)

    @patch('sys.argv', ['program', 'input_file.epub', 'output_folder', '--cast_mode', 'narrator',
                        '--cast_file', 'cast.json', '--no_expressive', '--no_timings', '--cartesia_max_chars', '900',
                        '--cartesia_volume', '1.2', '--cartesia_emotion', 'calm', '--speed', '0.9'])
    def test_cartesia_flags(self):
        config = handle_args()
        self.assertEqual(config.cast_mode, 'narrator')
        self.assertEqual(config.cast_file, 'cast.json')
        self.assertFalse(config.cartesia_expressive)
        self.assertFalse(config.write_timings)
        self.assertEqual(config.cartesia_max_chars, 900)
        self.assertEqual(config.cartesia_volume, 1.2)
        self.assertEqual(config.cartesia_emotion, 'calm')
        self.assertEqual(config.speed, 0.9)

    def test_yes_flag_skips_the_prompt(self):
        for flag in ('-y', '--yes', '--no_prompt'):
            with patch('sys.argv', ['program', 'input_file.epub', 'output_folder', flag]):
                self.assertTrue(handle_args().no_prompt)
        with patch('sys.argv', ['program', 'input_file.epub', 'output_folder']):
            self.assertFalse(handle_args().no_prompt)

    @patch('sys.argv', ['program', 'input_file.epub', 'output_folder', '--cast_mode', 'llm'])
    def test_llm_cast_mode_is_not_offered(self):
        with self.assertRaises(SystemExit):
            handle_args()

    @patch('sys.argv', ['program', 'input_file.epub', 'output_folder', '--tts', 'unsupported_tts'])
    def test_unsupported_tts(self):
        with self.assertRaises(SystemExit):
            handle_args()

    @patch('sys.argv', ['program', 'output_folder', '--tts', 'cartesia'])
    def test_missing_input_file(self):
        with self.assertRaises(SystemExit):
            handle_args()

    @patch('sys.argv', ['program', 'input_file.epub', 'output_folder', '--log', 'INVALID_LOG_LEVEL'])
    def test_invalid_log_level(self):
        with self.assertRaises(SystemExit):
            handle_args()

if __name__ == '__main__':
    unittest.main()
