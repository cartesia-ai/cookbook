"""Voices and text segments for a chapter.

A chapter becomes a list of Segment objects (text plus the voice and the
emotion it should be read with), which are then merged into chunks small
enough for one Cartesia request.

In dialogue mode the text is split on quotation marks, each quote is attributed
to a speaker with a few English patterns ("said Alice", "the Rabbit asked"),
and each speaker gets a voice from VOICE_POOL. This is a heuristic. It is wrong
on plenty of real novels, which is why the speaker to voice table is a plain
JSON file you can edit (see Cast).
"""
import json
import os
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from audiobook_generator.utils.utils import split_text

PARAGRAPH_BREAK = " @BRK#"

NARRATOR = "narrator"

VOICE_POOL: Dict[str, str] = {
    "Archie": "ef191366-f52f-447a-a398-ed8c0f2943a1",
    "Maya": "cbaf8084-f009-4838-a096-07ee2e6612b1",
    "Leo": "0834f3df-e650-4766-a20c-5a93a43aa6e3",
    "Marian": "26403c37-80c1-4a1a-8692-540551ca2ae5",
    "Kyle": "c961b81c-a935-4c17-bfb3-ba2239de8c2f",
    "Tessa": "6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
    "Jace": "6776173b-fd72-460d-89b3-d85812ee518d",
    "Gemma": "62ae83ad-4f6a-430b-af41-a9bede9286ca",
    "Gavin": "f4a3a8e4-694c-4c45-9ca0-27caf97901b5",
    "Dana": "cc00e582-ed66-4004-8336-0175b85c85f6",
}
DEFAULT_NARRATOR = "Archie"
OTHER_VOICE = "Dana"

_UUID = re.compile(r"^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$")

def resolve_voice(name_or_id: str) -> str:
    """Turn a pool name (case-insensitive) or a raw voice id into a voice id."""
    for pool_name, voice_id in VOICE_POOL.items():
        if name_or_id.lower() == pool_name.lower():
            return voice_id
    if _UUID.match(name_or_id):
        return name_or_id
    raise ValueError(
        f"Unknown voice '{name_or_id}'. Use a Cartesia voice id or one of: "
        + ", ".join(VOICE_POOL)
    )

@dataclass(frozen=True)
class Segment:
    text: str
    speaker: str
    voice_id: str
    emotion: Optional[str] = None
    paragraph: int = 0

def split_paragraphs(text: str) -> List[str]:
    parts = [p.strip() for p in text.split(PARAGRAPH_BREAK.strip())]
    return [p for p in parts if p]

def narrator_segments(text: str, narrator_voice_id: str, emotion: Optional[str] = None) -> List[Segment]:
    """The whole chapter in one voice, one segment per paragraph."""
    return [
        Segment(p, NARRATOR, narrator_voice_id, emotion, i)
        for i, p in enumerate(split_paragraphs(text))
    ]

def chunk_segments(segments: List[Segment], max_chars: int, language: str) -> List[Segment]:
    """Merge neighbouring segments into request-sized chunks.

    Segments merge when they share paragraph, voice and emotion and the
    result fits in max_chars. A segment longer than max_chars is split on
    sentence boundaries. A chunk never spans two paragraphs, so the caller can
    put a pause between paragraphs.
    """
    pieces: List[Segment] = []
    for seg in segments:
        if len(seg.text) <= max_chars:
            pieces.append(seg)
        else:
            for part in split_text(seg.text, max_chars, language):
                pieces.append(Segment(part, seg.speaker, seg.voice_id, seg.emotion, seg.paragraph))

    chunks: List[Segment] = []
    for seg in pieces:
        last = chunks[-1] if chunks else None
        if (
            last is not None
            and last.paragraph == seg.paragraph
            and last.voice_id == seg.voice_id
            and last.emotion == seg.emotion
            and len(last.text) + 1 + len(seg.text) <= max_chars
        ):
            chunks[-1] = Segment(last.text + " " + seg.text, last.speaker, last.voice_id, last.emotion, last.paragraph)
        else:
            chunks.append(seg)
    return chunks

CAST_FILE_NAME = "cast.json"
UNKNOWN_SPEAKER = "Unknown"

_DOUBLE_MARKS = '“”"'
_CURLY_SINGLE_OPEN = "‘"
_CURLY_SINGLE_CLOSE = "’"

@dataclass
class Piece:
    kind: str
    text: str

def split_quotes(paragraph: str) -> Tuple[List[Piece], bool]:
    """Split one paragraph into narration and quote pieces.

    Quote marks are removed from the text. Returns the pieces and whether the
    paragraph ends inside an open quote (a quote that continues in the next
    paragraph). Handles curly and straight double quotes, nested single quotes
    inside them, and curly single quotes when the paragraph has no double ones.
    Straight single quotes are never treated as quote marks, they are
    apostrophes too often.
    """
    pieces: List[Piece] = []
    buf: List[str] = []
    in_quote = False
    depth = 0

    def flush(kind):
        text = "".join(buf).strip()
        buf.clear()
        if text:
            pieces.append(Piece(kind, text))

    has_double = any(ch in paragraph for ch in _DOUBLE_MARKS)
    if has_double:
        for ch in paragraph:
            if ch == "“":
                if in_quote:
                    depth += 1
                    buf.append(ch)
                else:
                    flush("narration")
                    in_quote = True
            elif ch == "”":
                if in_quote and depth > 0:
                    depth -= 1
                    buf.append(ch)
                elif in_quote:
                    flush("quote")
                    in_quote = False
                else:
                    buf.append(ch)
            elif ch == '"':
                if in_quote:
                    flush("quote")
                    in_quote = False
                else:
                    flush("narration")
                    in_quote = True
            else:
                buf.append(ch)
    elif _CURLY_SINGLE_OPEN in paragraph:
        for i, ch in enumerate(paragraph):
            prev = paragraph[i - 1] if i else " "
            nxt = paragraph[i + 1] if i + 1 < len(paragraph) else " "
            if ch == _CURLY_SINGLE_OPEN and not in_quote and not prev.isalnum():
                flush("narration")
                in_quote = True
            elif ch == _CURLY_SINGLE_CLOSE and in_quote and not nxt.isalnum():
                flush("quote")
                in_quote = False
            else:
                buf.append(ch)
    else:
        buf.append(paragraph)

    ended_open = in_quote
    flush("quote" if in_quote else "narration")
    return pieces, ended_open

_SPEECH_VERBS = {
    "said", "asked", "replied", "cried", "shouted", "whispered", "exclaimed", "answered",
    "murmured", "sobbed", "wept", "roared", "gasped", "trembled", "called", "continued",
    "added", "remarked", "observed", "inquired", "interrupted", "muttered", "sighed",
    "laughed", "chuckled", "giggled", "declared", "began", "thought", "wondered",
    "saying", "muttering",
}
_NOT_NAMES = {
    "he", "she", "it", "they", "we", "i", "you", "then", "and", "but", "so", "now", "at",
    "when", "as", "while", "soon", "presently", "suddenly", "after", "before", "this", "that",
    "there", "here", "what", "who", "once", "still", "just", "again", "however", "next",
}
_TITLES = {"mr", "mrs", "ms", "dr", "miss", "sir", "lady", "lord", "captain", "professor"}
_TOKEN = re.compile(r"[\w’'-]+|[^\w\s]", re.UNICODE)

_EMOTION_CUES = [
    (re.compile(r"\b(whispered|murmured)\b", re.I), "calm"),
    (re.compile(r"\b(sobbed|wept)\b", re.I), "sad"),
    (re.compile(r"\b(shouted|roared)\b", re.I), "angry"),
    (re.compile(r"\b(cried out|exclaimed)\b", re.I), "excited"),
    (re.compile(r"\b(trembled|gasped)\b", re.I), "scared"),
]
_ASKED = re.compile(r"\basked\b", re.I)
_LAUGH = re.compile(r"\b(laughed|chuckled|giggled|burst out laughing)\b", re.I)

def _is_cap(token: str) -> bool:
    return token[:1].isalpha() and token[:1].isupper()

def _name_before(tokens: List[str], verb_idx: int) -> Optional[str]:
    """Capitalised words just before the verb: 'the White Rabbit said'."""
    i = verb_idx - 1
    if i >= 0 and tokens[i].lower().endswith("ly"):
        i -= 1
    end = i + 1
    while i >= 0 and (_is_cap(tokens[i]) or tokens[i].lower() in _TITLES or tokens[i] == ".") \
            and tokens[i].lower() not in _NOT_NAMES:
        i -= 1
    words = [t for t in tokens[i + 1:end] if t != "."]
    if not words:
        return None
    return " ".join(words)

def _name_after(tokens: List[str], verb_idx: int) -> Optional[str]:
    """'said Alice', 'said the Queen', 'said the king.'"""
    i = verb_idx + 1
    if i >= len(tokens):
        return None
    had_the = False
    if tokens[i].lower() == "the":
        had_the = True
        i += 1
    words = []
    while i < len(tokens) and (_is_cap(tokens[i]) or tokens[i].lower() in _TITLES or tokens[i] == ".") \
            and tokens[i].lower() not in _NOT_NAMES:
        if tokens[i] != ".":
            words.append(tokens[i])
        i += 1
    if words:
        return " ".join(words)
    if had_the and i < len(tokens) and tokens[i].isalpha():
        nxt = tokens[i + 1] if i + 1 < len(tokens) else ""
        if nxt == "" or not nxt[0].isalnum():
            return tokens[i].capitalize()
    return None

def _clean_name(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    words = name.split()
    while words and (words[0].lower() == "the" or words[0].lower() in _NOT_NAMES):
        words.pop(0)
    return " ".join(words) or None

def find_speaker(cue: str) -> Optional[str]:
    """Return a speaker name from a dialogue tag, or None."""
    tokens = _TOKEN.findall(cue)
    for idx, tok in enumerate(tokens):
        if tok.lower() in _SPEECH_VERBS:
            name = _clean_name(_name_after(tokens, idx)) or _clean_name(_name_before(tokens, idx))
            if name:
                return name
    return None

def emotion_for(cue: str, quote: str) -> Optional[str]:
    for pattern, emotion in _EMOTION_CUES:
        if pattern.search(cue):
            return emotion
    if _ASKED.search(cue) and quote.rstrip().endswith("?"):
        return "curious"
    return None

_SENTENCE_END = re.compile(r"[.!?]+\s+")

def _sentence_ends(text: str) -> List[int]:
    """Offsets just after each sentence end. 'Mr. Darcy' does not end a sentence."""
    ends = []
    for m in _SENTENCE_END.finditer(text):
        words = text[: m.start()].split()
        if m.group().startswith(".") and words and words[-1].lower().strip("\u201c\"(") in _TITLES:
            continue
        ends.append(m.end())
    return ends

def _first_sentence(text: str) -> str:
    ends = _sentence_ends(text)
    return text[: ends[0]] if ends else text

def _tag_clause(text: str) -> str:
    """The dialogue tag at the start of a post-quote narration: up to the first
    comma, semicolon, colon or bracket. In '"No," said Alice, "and no again,"
    said Bob' this keeps the tag of the first quote apart from the second."""
    sentence = _first_sentence(text)
    m = re.search(r"[,;:(]", sentence[1:])
    return sentence[: m.start() + 1] if m else sentence

def _last_sentence(text: str) -> str:
    ends = _sentence_ends(text)
    return text[ends[-1]:] if ends else text

@dataclass(frozen=True)
class Utterance:
    text: str
    speaker: str
    emotion: Optional[str]
    paragraph: int

def detect_utterances(text: str, expressive: bool = True) -> List[Utterance]:
    """Split a chapter (paragraphs joined by PARAGRAPH_BREAK) into utterances.

    expressive turns on emotion and laughter cues. Pass False for languages
    other than English. The result depends only on the text, so every worker
    process gets the same speakers.
    """
    out: List[Utterance] = []
    history: List[str] = []
    last_quote_paragraph = -10
    carry_speaker: Optional[str] = None
    prev_open = False

    for p_idx, paragraph in enumerate(split_paragraphs(text)):
        pieces, ends_open = split_quotes(paragraph)
        continued = prev_open and bool(pieces) and pieces[0].kind == "quote" \
            and paragraph.lstrip()[:1] in ("“", '"', "‘")
        prev_open = ends_open

        tag_len: Dict[int, int] = {}
        for i, piece in enumerate(pieces):
            if piece.kind == "narration" and i > 0 and pieces[i - 1].kind == "quote":
                first = piece.text[:1]
                quote_end = pieces[i - 1].text.rstrip()[-1:]
                if first == "," or first.islower() or not first.isalnum() or quote_end in ",!?":
                    tag_len[i] = len(_tag_clause(piece.text))

        for i, piece in enumerate(pieces):
            if piece.kind == "narration":
                out.append(Utterance(piece.text, NARRATOR, None, p_idx))
                continue
            if not any(ch.isalnum() for ch in piece.text):
                continue
            after = ""
            if i + 1 < len(pieces) and pieces[i + 1].kind == "narration" and (i + 1) in tag_len:
                after = pieces[i + 1].text[: tag_len[i + 1]]
            before = ""
            if i > 0 and pieces[i - 1].kind == "narration":
                prev_text = pieces[i - 1].text[tag_len.get(i - 1, 0):]
                before = _last_sentence(prev_text)
            cue = f"{before} {after}".strip()

            speaker = find_speaker(after) or find_speaker(before)
            if speaker is None:
                if continued and i == 0 and carry_speaker:
                    speaker = carry_speaker
                elif history and last_quote_paragraph == p_idx:
                    speaker = history[-1]
                elif (history and last_quote_paragraph == p_idx - 1 and len(set(history)) >= 2
                      and len(pieces) == 1):
                    speaker = next(h for h in reversed(history) if h != history[-1])
                elif history:
                    speaker = history[-1]
                else:
                    speaker = UNKNOWN_SPEAKER
            history.append(speaker)
            last_quote_paragraph = p_idx
            carry_speaker = speaker

            emotion = emotion_for(cue, piece.text) if expressive else None
            quote_text = piece.text
            if expressive and _LAUGH.search(cue):
                quote_text = "[laughter] " + quote_text
            out.append(Utterance(quote_text, speaker, emotion, p_idx))
    return out

def speakers_in_order(utterances: List[Utterance]) -> List[str]:
    seen: List[str] = []
    for u in utterances:
        if u.speaker != NARRATOR and u.speaker not in seen:
            seen.append(u.speaker)
    return seen

class Cast:
    """Maps speaker names to voice ids. Plain data, safe to rebuild in a worker.

    File format (cast.json):
        {"narrator": "Archie", "speakers": {"Alice": "Maya", "White Rabbit": "Leo"}}
    Values are pool names or Cartesia voice ids.
    """

    def __init__(self, narrator: str = DEFAULT_NARRATOR, speakers: Optional[Dict[str, str]] = None):
        self.narrator = narrator
        self.speakers: Dict[str, str] = dict(speakers or {})
        self.validate()

    def validate(self) -> None:
        resolve_voice(self.narrator)
        for value in self.speakers.values():
            resolve_voice(value)

    def narrator_voice_id(self) -> str:
        return resolve_voice(self.narrator)

    def assign(self, name: str) -> str:
        """Voice for a speaker, handing out the next unused pool voice if new."""
        if name not in self.speakers and name == UNKNOWN_SPEAKER:
            self.speakers[name] = OTHER_VOICE
        if name not in self.speakers:
            narrator_id = self.narrator_voice_id()
            pool = [n for n, vid in VOICE_POOL.items() if vid != narrator_id and n != OTHER_VOICE]
            used = {resolve_voice(v) for v in self.speakers.values()}
            free = [n for n in pool if VOICE_POOL[n] not in used]
            choice = free[0] if free else pool[len(self.speakers) % len(pool)]
            self.speakers[name] = choice
        return resolve_voice(self.speakers[name])

    def voice_for(self, speaker: str) -> str:
        return self.narrator_voice_id() if speaker == NARRATOR else self.assign(speaker)

    def to_dict(self) -> dict:
        return {"narrator": self.narrator, "speakers": dict(self.speakers)}

    @classmethod
    def from_dict(cls, data: dict) -> "Cast":
        return cls(data.get("narrator") or DEFAULT_NARRATOR, data.get("speakers") or {})

    @classmethod
    def load(cls, path: str) -> "Cast":
        with open(path, encoding="utf-8") as f:
            return cls.from_dict(json.load(f))

    def save(self, path: str) -> None:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, indent=2, ensure_ascii=False)
            f.write("\n")

def cast_path(output_folder: Optional[str]) -> Optional[str]:
    return os.path.join(output_folder, CAST_FILE_NAME) if output_folder else None

def load_cast(config) -> Cast:
    """Build the cast for a run: output/cast.json first (so reruns keep their
    voices), then the user's --cast_file on top, then --voice_name for the narrator."""
    cast = Cast()
    saved = cast_path(getattr(config, "output_folder", None))
    if saved and os.path.isfile(saved):
        cast = Cast.load(saved)
    user_file = getattr(config, "cast_file", None)
    if user_file:
        with open(user_file, encoding="utf-8") as f:
            user = json.load(f)
        cast.speakers.update(user.get("speakers") or {})
        if user.get("narrator"):
            cast.narrator = user["narrator"]
    if getattr(config, "voice_name", None):
        cast.narrator = config.voice_name
    cast.validate()
    return cast

def build_segments(text: str, cast: Cast, mode: str = "dialogue", expressive: bool = True,
                   narrator_emotion: Optional[str] = None) -> List[Segment]:
    """Chapter text to Segments with voices. mode is 'narrator' or 'dialogue'."""
    if mode == "narrator":
        return narrator_segments(text, cast.narrator_voice_id(), narrator_emotion)
    segments = []
    for u in detect_utterances(text, expressive=expressive):
        emotion = narrator_emotion if u.speaker == NARRATOR else u.emotion
        segments.append(Segment(u.text, u.speaker, cast.voice_for(u.speaker), emotion, u.paragraph))
    return segments

def scan_speakers(chapters, expressive: bool = True) -> List[str]:
    """Speakers across (title, text) chapters, in order of first appearance."""
    seen: List[str] = []
    for _title, text in chapters:
        for name in speakers_in_order(detect_utterances(text, expressive=expressive)):
            if name not in seen:
                seen.append(name)
    return seen

