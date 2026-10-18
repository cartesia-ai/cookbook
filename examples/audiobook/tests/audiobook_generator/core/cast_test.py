import json
import os
import tempfile
import unittest

from audiobook_generator.core import cast
from audiobook_generator.core.cast import (
    NARRATOR, PARAGRAPH_BREAK, Cast, detect_utterances, split_quotes,
)
from tests.test_utils import get_cartesia_config

def para(*parts):
    return PARAGRAPH_BREAK.join(parts)

def speakers(text, **kw):
    return [(u.speaker, u.text, u.emotion) for u in detect_utterances(text, **kw)]

class TestSplitQuotes(unittest.TestCase):

    def test_curly_and_straight_quotes(self):
        for text in ['He said “Hello there” and left.', 'He said "Hello there" and left.']:
            pieces, open_ = split_quotes(text)
            self.assertEqual([(p.kind, p.text) for p in pieces],
                             [("narration", "He said"), ("quote", "Hello there"), ("narration", "and left.")])
            self.assertFalse(open_)

    def test_no_quotes(self):
        pieces, open_ = split_quotes("Just narration here, with it's apostrophes and don’t.")
        self.assertEqual(len(pieces), 1)
        self.assertEqual(pieces[0].kind, "narration")
        self.assertFalse(open_)

    def test_empty_quotes_make_no_piece(self):
        pieces, _ = split_quotes('He said "" and nothing more.')
        self.assertEqual([p.kind for p in pieces], ["narration", "narration"])

    def test_nested_quotes_stay_in_the_outer_quote(self):
        pieces, _ = split_quotes('She said “He told me “go away” twice” and sighed.')
        quotes = [p.text for p in pieces if p.kind == "quote"]
        self.assertEqual(len(quotes), 1)
        self.assertIn("go away", quotes[0])

    def test_quote_open_at_paragraph_end(self):
        pieces, open_ = split_quotes('Alice said “This goes on and on')
        self.assertTrue(open_)
        self.assertEqual(pieces[-1].kind, "quote")

    def test_curly_single_quotes_when_no_double_quotes(self):
        pieces, _ = split_quotes("‘Well, I never,’ said Alice, who didn’t care.")
        self.assertEqual(pieces[0].kind, "quote")
        self.assertEqual(pieces[0].text, "Well, I never,")
        self.assertIn("didn’t", pieces[1].text)

    def test_straight_apostrophes_are_not_quotes(self):
        pieces, _ = split_quotes("It's Alice's turn, isn't it?")
        self.assertEqual(len(pieces), 1)

class TestAttribution(unittest.TestCase):

    def test_said_name_after_quote(self):
        out = speakers('“Hello,” said Alice.')
        self.assertEqual(out[0][:2], ("Alice", "Hello,"))

    def test_name_then_verb_before_quote(self):
        out = speakers('The White Rabbit asked, “Who is there?”')
        quote = [o for o in out if o[0] != NARRATOR][0]
        self.assertEqual(quote[0], "White Rabbit")

    def test_the_noun_form(self):
        out = speakers('“Off with her head!” said the Queen.')
        self.assertEqual(out[0][0], "Queen")
        out = speakers('“Quiet,” said the king.')
        self.assertEqual(out[0][0], "King")

    def test_pronoun_is_not_a_name(self):
        out = speakers('“Hello,” she said.')
        self.assertEqual(out[0][0], cast.UNKNOWN_SPEAKER)

    def test_two_people_alternate(self):
        text = para(
            '“Hello,” said Alice.',
            '“Hello,” said Tom.',
            '“How are you?”',
            '“Fine.”',
        )
        who = [o[0] for o in speakers(text) if o[0] != NARRATOR]
        self.assertEqual(who, ["Alice", "Tom", "Alice", "Tom"])

    def test_same_paragraph_continuation_keeps_speaker(self):
        text = '“First,” said Alice, “and second.”'
        who = [o[0] for o in speakers(text) if o[0] != NARRATOR]
        self.assertEqual(who, ["Alice", "Alice"])

    def test_quote_continues_across_paragraphs(self):
        text = para('Alice began “This is a long speech', '“that goes on for two paragraphs.”')
        who = [o[0] for o in speakers(text) if o[0] != NARRATOR]
        self.assertEqual(who, ["Alice", "Alice"])

    def test_non_ascii_names(self):
        out = speakers('“Bonjour,” said Élodie.')
        self.assertEqual(out[0][0], "Élodie")

    def test_title_names(self):
        out = speakers('“Good day,” said Mr. Darcy.')
        self.assertEqual(out[0][0], "Mr Darcy")

    def test_thought_counts_as_a_tag(self):
        out = speakers('\u201cand what is the use of a book,\u201d thought Alice \u201cwithout pictures?\u201d')
        self.assertEqual([o[0] for o in out], ["Alice", "narrator", "Alice"])

    def test_tag_of_one_quote_does_not_leak_into_the_next(self):
        text = '\u201cNo,\u201d said Alice, and the Mouse said, \u201cYes.\u201d'
        who = [o[0] for o in speakers(text) if o[0] != NARRATOR]
        self.assertEqual(who, ["Alice", "Mouse"])

    def test_unknown_speaker_gets_the_neutral_voice(self):
        c = Cast()
        self.assertEqual(c.assign(cast.UNKNOWN_SPEAKER), cast.VOICE_POOL[cast.OTHER_VOICE])
        self.assertNotEqual(c.assign("Alice"), cast.VOICE_POOL[cast.OTHER_VOICE])

    def test_punctuation_only_narration_is_skipped(self):
        out = speakers("“Hi,” said Alice. “Run!” ... “Now!”")
        self.assertTrue(all(any(ch.isalnum() for ch in o[1]) for o in out))
        self.assertNotIn("...", [o[1] for o in out])

    def test_text_with_no_quotes_is_all_narrator(self):
        out = speakers("It was a quiet evening. Nothing happened.")
        self.assertTrue(all(o[0] == NARRATOR for o in out))

    def test_speakers_in_order(self):
        text = '“A,” said Bob. “B,” said Alice. “C,” said Bob.'
        self.assertEqual(cast.speakers_in_order(detect_utterances(text)), ["Bob", "Alice"])

class TestEmotionAndLaughter(unittest.TestCase):

    def test_emotion_table(self):
        cases = {
            "whispered": "calm", "murmured": "calm", "sobbed": "sad", "wept": "sad",
            "shouted": "angry", "roared": "angry", "exclaimed": "excited",
            "trembled": "scared", "gasped": "scared",
        }
        for verb, emotion in cases.items():
            out = speakers(f'“No!” {verb} Alice.')
            self.assertEqual(out[0][2], emotion, verb)

    def test_cried_out(self):
        self.assertEqual(speakers('“Stop!” Alice cried out.')[0][2], "excited")
        self.assertIsNone(speakers('“Stop,” cried Alice.')[0][2])

    def test_asked_with_question_mark_is_curious(self):
        self.assertEqual(speakers('“Who is there?” asked Alice.')[0][2], "curious")
        self.assertIsNone(speakers('“Who is there.” asked Alice.')[0][2])

    def test_no_cue_no_emotion(self):
        self.assertIsNone(speakers('“Hello,” said Alice.')[0][2])

    def test_narration_never_gets_emotion(self):
        out = speakers('She whispered something sad. “Hello,” said Alice.')
        narration = [o for o in out if o[0] == NARRATOR]
        self.assertTrue(all(o[2] is None for o in narration))

    def test_laughter_tag_once_per_quote(self):
        out = speakers('“Oh, very good,” Alice laughed.')
        self.assertTrue(out[0][1].startswith("[laughter] "))
        self.assertEqual(out[0][1].count("[laughter]"), 1)

    def test_burst_out_laughing(self):
        out = speakers('Tom burst out laughing. “That is absurd!”')
        quote = [o for o in out if o[0] != NARRATOR][0]
        self.assertTrue(quote[1].startswith("[laughter] "))

    def test_non_english_disables_cues(self):
        out = speakers('“Non!” shouted Alice, who laughed.', expressive=False)
        self.assertIsNone(out[0][2])
        self.assertNotIn("[laughter]", out[0][1])

    def test_narrator_mode_has_no_laughter(self):
        segs = cast.build_segments('“Ha,” Alice laughed.', Cast(), mode="narrator")
        self.assertTrue(all("[laughter]" not in s.text for s in segs))
        self.assertEqual({s.speaker for s in segs}, {NARRATOR})

class TestCast(unittest.TestCase):

    def test_assignment_is_stable_and_skips_the_narrator_voice(self):
        names = ["Alice", "Rabbit", "Queen"]
        a, b = Cast(), Cast()
        voices_a = [a.assign(n) for n in names]
        voices_b = [b.assign(n) for n in names]
        self.assertEqual(voices_a, voices_b)
        self.assertEqual(len(set(voices_a)), 3)
        self.assertNotIn(cast.VOICE_POOL["Archie"], voices_a)

    def test_pool_wraps_when_exhausted(self):
        c = Cast()
        for i in range(len(cast.VOICE_POOL) + 5):
            c.assign(f"Person {i}")
        self.assertEqual(len(c.speakers), len(cast.VOICE_POOL) + 5)

    def test_round_trip(self):
        c = Cast("Maya", {"Alice": "Leo"})
        c.assign("Bob")
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "cast.json")
            c.save(path)
            again = Cast.load(path)
        self.assertEqual(again.to_dict(), c.to_dict())

    def test_bad_voice_is_rejected(self):
        with self.assertRaises(ValueError):
            Cast("Nobody")
        with self.assertRaises(ValueError):
            Cast("Archie", {"Alice": "not-a-voice"})

    def test_user_cast_file_overrides_saved_and_voice_name_wins_for_narrator(self):
        with tempfile.TemporaryDirectory() as tmp:
            Cast("Archie", {"Alice": "Maya", "Tom": "Kyle"}).save(os.path.join(tmp, "cast.json"))
            user = os.path.join(tmp, "mine.json")
            with open(user, "w") as f:
                json.dump({"narrator": "Gemma", "speakers": {"Alice": "Dana"}}, f)
            config = get_cartesia_config(output_folder=tmp, cast_file=user)
            c = cast.load_cast(config)
            self.assertEqual(c.speakers, {"Alice": "Dana", "Tom": "Kyle"})
            self.assertEqual(c.narrator, "Gemma")
            config = get_cartesia_config(output_folder=tmp, cast_file=user, voice_name="Leo")
            self.assertEqual(cast.load_cast(config).narrator, "Leo")

    def test_build_segments_assigns_voices(self):
        text = '“Hi,” said Alice. “Hello,” said Tom.'
        segs = cast.build_segments(text, Cast())
        voices = {s.speaker: s.voice_id for s in segs}
        self.assertEqual(len(set(voices.values())), 3)

    def test_two_providers_agree_on_voices(self):
        from audiobook_generator.tts_providers.cartesia_tts_provider import CartesiaTTSProvider
        chapters = [("One", '“Hi,” said Alice.'), ("Two", '“Hey,” said Tom. “Hi,” said Alice.')]
        with tempfile.TemporaryDirectory() as tmp:
            first = CartesiaTTSProvider(get_cartesia_config(output_folder=tmp))
            first.prepare_run(chapters)
            self.assertTrue(os.path.isfile(os.path.join(tmp, "cast.json")))
            worker_a = CartesiaTTSProvider(get_cartesia_config(output_folder=tmp))
            worker_b = CartesiaTTSProvider(get_cartesia_config(output_folder=tmp))
            for name in ("Alice", "Tom"):
                self.assertEqual(worker_a.cast.voice_for(name), worker_b.cast.voice_for(name))
                self.assertEqual(worker_a.cast.voice_for(name), first.cast.voice_for(name))
            self.assertEqual(list(first.cast.speakers), ["Alice", "Tom"])

class TestChunking(unittest.TestCase):

    def test_adjacent_same_voice_merge_but_not_across_paragraphs(self):
        v = "x"
        segs = [cast.Segment("One.", NARRATOR, v, None, 0), cast.Segment("Two.", NARRATOR, v, None, 0),
                cast.Segment("Three.", NARRATOR, v, None, 1)]
        chunks = cast.chunk_segments(segs, 1500, "en")
        self.assertEqual([c.text for c in chunks], ["One. Two.", "Three."])

    def test_different_voice_or_emotion_do_not_merge(self):
        segs = [cast.Segment("One.", "a", "v1", None, 0), cast.Segment("Two.", "b", "v2", None, 0),
                cast.Segment("Three.", "b", "v2", "sad", 0)]
        self.assertEqual(len(cast.chunk_segments(segs, 1500, "en")), 3)

    def test_oversized_segment_is_split_under_the_limit(self):
        text = "This is a sentence of moderate length. " * 40
        chunks = cast.chunk_segments([cast.Segment(text, NARRATOR, "v", None, 0)], 300, "en")
        self.assertGreater(len(chunks), 3)
        self.assertTrue(all(len(c.text) <= 300 for c in chunks))

if __name__ == "__main__":
    unittest.main()
