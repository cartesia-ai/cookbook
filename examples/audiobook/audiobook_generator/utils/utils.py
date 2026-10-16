import logging
from typing import List
import tempfile
import os
import io
from pydub import AudioSegment
from mutagen.id3._frames import TIT2, TPE1, TALB, TRCK
from mutagen.id3 import ID3, ID3NoHeaderError
from typing import List
from sentencex import segment
import os

logger = logging.getLogger(__name__)

def split_text(text: str, max_chars: int, language: str) -> List[str]:
    """
    Split text into chunks, where each chunk is as close to max_chars as possible.

    Args:
        text: The text to split
        max_chars: The maximum number of characters per chunk
        language: The language of the text

    Returns:
        A list of text chunks
    """
    if not text:
        return []
    if max_chars <= 0:
        raise ValueError("max_chars must be positive")

    sentences = list(segment(language, text))

    chunks = []
    current_chunk = ""

    for sentence in sentences:
        space = " " if current_chunk else ""
        if len(current_chunk) + len(space) + len(sentence) <= max_chars:
            current_chunk += space + sentence
        elif len(sentence) > max_chars:
            if current_chunk:
                chunks.append(current_chunk)
                current_chunk = ""

            sentence_chunks = split_long_sentence(sentence, max_chars)

            chunks.extend(sentence_chunks[:-1])

            current_chunk = sentence_chunks[-1]
        else:
            if current_chunk:
                chunks.append(current_chunk)
            current_chunk = sentence

    if current_chunk:
        chunks.append(current_chunk)

    return chunks

def split_long_sentence(sentence: str, max_chars: int) -> List[str]:
    """
    Split a long sentence into smaller parts based on punctuation and spaces.

    Args:
        sentence: The sentence to split
        max_chars: The maximum number of characters per part

    Returns:
        A list of sentence parts
    """
    if max_chars < 5:
        return [sentence[i:i+max_chars] for i in range(0, len(sentence), max_chars)]

    punctuations = [
        '。', '！', '？',
        '. ', '! ', '? ',
        '；', ';',
        '，', ',',
        '：', ':',
        '）', ')', ']', '】', '}', '」', '』',
        '、',
        '—', '-', '–',
        ' ',
    ]

    parts = []
    remaining = sentence

    while remaining:
        if len(remaining) <= max_chars:
            parts.append(remaining)
            break

        best_split_idx = -1

        for punctuation in punctuations:
            split_idx = remaining[:max_chars].rfind(punctuation)

            if split_idx != -1:
                if punctuation != ' ':
                    split_idx += len(punctuation)
                else:
                    split_idx += 1

                best_split_idx = split_idx
                break

        if best_split_idx == -1:
            best_split_idx = max_chars

        parts.append(remaining[:best_split_idx])
        remaining = remaining[best_split_idx:]

    return parts

def set_audio_tags(output_file, audio_tags):
    try:
        try:
            tags = ID3(output_file)
            logger.debug(f"tags: {tags}")
        except ID3NoHeaderError:
            logger.debug(f"handling ID3NoHeaderError: {output_file}")
            tags = ID3()
        tags.add(TIT2(encoding=3, text=audio_tags.title))
        tags.add(TPE1(encoding=3, text=audio_tags.author))
        tags.add(TALB(encoding=3, text=audio_tags.book_title))
        tags.add(TRCK(encoding=3, text=str(audio_tags.idx)))
        tags.save(output_file)
    except Exception as e:
        logger.error(f"Error while setting audio tags: {e}, {output_file}")
        raise e

def is_special_char(char: str) -> bool:
    ord_char = ord(char)
    result = (
        (ord_char >= 33 and ord_char <= 126)
        or (char in "。，、？！：；“”‘’（）《》【】…—～·「」『』〈〉〖〗〔〕")
        or (char in "∶")
    )
    logger.debug(f"is_special_char> char={char}, ord={ord_char}, result={result}")
    return result

def save_segment_tmp(segment: io.BytesIO, output_format: str, prefix: str = None) -> str:
    """
    Save audio segment to a temporary file

    Args:
        segment: Audio segment (io.BytesIO)
        output_format: Audio file format
        prefix: Optional prefix for the temporary filename

    Returns:
        Path to the temporary file
    """
    kwargs = {"delete": False, "suffix": f".{output_format}"}
    if prefix:
        kwargs["prefix"] = f"{prefix}_"

    with tempfile.NamedTemporaryFile(**kwargs) as tmp_file:
        segment.seek(0)
        tmp_file.write(segment.read())
        logger.debug(f"Audio segment written to temporary file: {tmp_file.name}")
        return tmp_file.name

def pydub_merge_audio_segments(tmp_files: List[str], output_file: str, output_format: str) -> None:
    """
    Merge multiple audio segments into one and set audio tags

    Args:
        tmp_files: List of temporary file paths
        output_file: Path to the final output file
        output_format: Audio file format
    """
    if not tmp_files:
        logger.warning("No temporary files to merge")
        return

    combined = AudioSegment.empty()
    for tmp_file in tmp_files:
        logger.debug(f"Loading chunk from temporary file: {tmp_file}")
        segment = AudioSegment.from_file(tmp_file)
        combined += segment

    logger.debug(f"Exporting to final output file: {output_file}")
    combined.export(output_file, format=output_format)
    logger.debug(f"Final output file exported: {output_file}")

    for tmp_file in tmp_files:
        os.remove(tmp_file)
    logger.debug(f"Temporary files deleted: {tmp_files}")

def direct_merge_audio_segments(audio_segments: List[io.BytesIO], output_file: str) -> None:
    """
    Directly write multiple audio segments into one file without using pydub

    Args:
        audio_segments: List of audio segments in memory
        output_file: Path to the final output file
    """
    if not audio_segments:
        logger.warning("No audio segments to write")
        return

    logger.debug(f"Writing audio segments directly to file: {output_file}")
    with open(output_file, "wb") as outfile:
        for segment in audio_segments:
            segment.seek(0)
            outfile.write(segment.read())
    logger.debug(f"Direct writing completed: {output_file}")

def merge_audio_segments(audio_segments: List[io.BytesIO], output_file: str, output_format: str,
                          chunk_ids: List[str], use_pydub_merge: bool) -> None:
    """
    Merge audio segments using either pydub or direct write method based on configuration

    Args:
        audio_segments: List of audio segments (BytesIO objects)
        output_file: Path to the final output file
        output_format: Audio file format
        chunk_ids: List of IDs for each audio chunk
        use_pydub_merge: Whether to use pydub for merging (True) or direct write (False)
    """
    if use_pydub_merge:
        logger.info(f"Using pydub to merge audio segments: {chunk_ids}")
        tmp_files = []
        for i, segment in enumerate(audio_segments):
            tmp_file_path = save_segment_tmp(segment, output_format, chunk_ids[i])
            tmp_files.append(tmp_file_path)

        pydub_merge_audio_segments(tmp_files, output_file, output_format)
    else:
        logger.info(f"Using direct write to merge audio segments: {chunk_ids}")
        direct_merge_audio_segments(audio_segments, output_file)