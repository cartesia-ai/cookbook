import json
import unittest

from audiobook_generator.core import readalong

def words(n, step=0.5, text="word"):
    return [{"w": f"{text}{i}", "s": i * step, "e": i * step + 0.4, "speaker": "narrator"} for i in range(n)]

class TestReadalong(unittest.TestCase):

    def test_vtt_time(self):
        self.assertEqual(readalong.vtt_time(0), "00:00:00.000")
        self.assertEqual(readalong.vtt_time(3661.5), "01:01:01.500")
        self.assertEqual(readalong.vtt_time(0.0004), "00:00:00.000")
        self.assertEqual(readalong.vtt_time(59.9996), "00:01:00.000")

    def test_cues_of_eight_words(self):
        cues = readalong.group_cues(words(20))
        self.assertEqual([len(c["text"].split()) for c in cues], [8, 8, 4])
        self.assertEqual(cues[0]["start"], 0)
        self.assertEqual(cues[1]["start"], 4.0)

    def test_cues_end_at_sentence_end(self):
        ws = words(5)
        ws[2]["w"] = "done."
        ws[3]["w"] = "done!\u201d"
        cues = readalong.group_cues(ws)
        self.assertEqual([c["text"].split()[-1] for c in cues], ["done.", "done!\u201d", "word4"])

    def test_vtt_format(self):
        vtt = readalong.render_vtt(words(3))
        lines = vtt.splitlines()
        self.assertEqual(lines[0], "WEBVTT")
        self.assertRegex(lines[2], r"^\d\d:\d\d:\d\d\.\d{3} --> \d\d:\d\d:\d\d\.\d{3}$")
        self.assertEqual(lines[3], "word0 word1 word2")

    def test_empty_words(self):
        self.assertEqual(readalong.render_vtt([]).strip(), "WEBVTT")

    def test_sidecar_paths(self):
        p = readalong.sidecar_paths("/out/001_Down_the_Rabbit_Hole.mp3")
        self.assertEqual(p["json"], "/out/001_Down_the_Rabbit_Hole.timings.json")
        self.assertEqual(p["vtt"], "/out/001_Down_the_Rabbit_Hole.vtt")

    def test_json_schema(self):
        import os, tempfile
        timings = readalong.build_timings(3, "Title \u00e9", "sonic-3.6", 44100, 12.3456, words(2))
        with tempfile.TemporaryDirectory() as tmp:
            audio = os.path.join(tmp, "c.mp3")
            paths = readalong.write_sidecars(audio, timings)
            with open(paths["json"], encoding="utf-8") as f:
                data = json.load(f)
        self.assertEqual(set(data), {"chapter", "title", "model", "sample_rate", "duration", "words"})
        self.assertEqual(data["duration"], 12.346)
        self.assertEqual(set(data["words"][0]), {"w", "s", "e", "speaker"})
        self.assertEqual(data["title"], "Title \u00e9")

if __name__ == "__main__":
    unittest.main()
