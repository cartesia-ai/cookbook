import unittest

from audiobook_generator.tts_providers.base_tts_provider import (
    get_supported_tts_providers,
    get_tts_provider,
)
from tests.test_utils import get_cartesia_config

class TestBaseTtsProvider(unittest.TestCase):

    def test_only_cartesia_is_supported(self):
        self.assertEqual(get_supported_tts_providers(), ['cartesia'])

    def test_get_tts_provider_invalid(self):
        config = get_cartesia_config()
        config.tts = 'invalid_tts_provider'
        with self.assertRaises(ValueError):
            get_tts_provider(config)

if __name__ == '__main__':
    unittest.main()
