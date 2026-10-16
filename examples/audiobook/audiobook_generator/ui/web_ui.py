from multiprocessing import Process
from typing import Optional
import os
from datetime import datetime

import gradio as gr
from gradio_log import Log
from audiobook_generator.config.general_config import GeneralConfig
from audiobook_generator.ui.theme import CartesiaTheme, load_css
from audiobook_generator.core.cast import VOICE_POOL, DEFAULT_NARRATOR
from audiobook_generator.tts_providers.cartesia_tts_provider import (
    get_cartesia_supported_languages,
    get_cartesia_supported_models,
    get_cartesia_supported_output_formats,
)
from audiobook_generator.utils.log_handler import generate_unique_log_path
from main import main

running_process: Optional[Process] = None
webui_log_file = None

INPUT_ORDER = [
    "input_file", "output_dir", "worker_count", "log_level", "output_text", "preview",
    "search_and_replace_file", "title_mode", "new_line_mode", "chapter_start", "chapter_end",
    "remove_endnotes", "remove_reference_numbers",
    "model", "voice", "speed", "volume", "output_format", "language", "max_chars",
    "cast_mode", "expressive", "write_timings", "cast_file",
]

def process_ui_form(input_file, output_dir, worker_count, log_level, output_text, preview,
                    search_and_replace_file, title_mode, new_line_mode, chapter_start, chapter_end,
                    remove_endnotes, remove_reference_numbers,
                    model, voice, speed, volume, output_format, language, max_chars,
                    cast_mode, expressive, write_timings, cast_file):

    config = GeneralConfig(None)
    config.input_file = input_file.name if hasattr(input_file, 'name') else input_file
    config.output_folder = output_dir
    config.preview = preview
    config.output_text = output_text
    config.log = log_level
    config.worker_count = int(worker_count)
    config.no_prompt = True

    config.title_mode = title_mode
    config.newline_mode = new_line_mode
    config.chapter_start = int(chapter_start)
    config.chapter_end = int(chapter_end)
    config.remove_endnotes = remove_endnotes
    config.remove_reference_numbers = remove_reference_numbers
    config.search_and_replace_file = search_and_replace_file.name if hasattr(search_and_replace_file, 'name') else search_and_replace_file

    config.tts = "cartesia"
    config.model_name = model
    config.voice_name = voice
    config.speed = speed
    config.cartesia_volume = volume
    config.output_format = output_format
    config.language = language
    config.cartesia_max_chars = int(max_chars)
    config.cast_mode = cast_mode
    config.cartesia_expressive = expressive
    config.write_timings = write_timings
    config.cast_file = cast_file.name if hasattr(cast_file, 'name') else cast_file

    launch_audiobook_generator(config)

def launch_audiobook_generator(config):
    global running_process
    if running_process and running_process.is_alive():
        print("Audiobook generator already running")
        return

    running_process = Process(target=main, args=(config, str(webui_log_file.absolute())))
    running_process.start()

def terminate_audiobook_generator():
    global running_process
    if running_process and running_process.is_alive():
        running_process.terminate()
        running_process = None
        print("Audiobook generator terminated manually")

_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{}</svg>'
_SUN = _ICON.format('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>')
_MOON = _ICON.format('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>')

HEADER_HTML = (
    '<header class="ab-header"><div class="ab-header-inner">'
    '<a class="ab-brand" href="./">Audiobook</a>'
    '<button type="button" class="ab-mode" aria-label="Toggle dark mode" '
    'onclick="document.body.classList.toggle(\'dark\')">'
    f'<span class="ab-sun">{_SUN}</span><span class="ab-moon">{_MOON}</span></button>'
    '</div></header>'
)
PAGE_HEADER_HTML = (
    '<div class="ab-page-header"><h1>Turn an EPUB into an audiobook</h1>'
    '<p>Sonic 3.6 reads each chapter, with its own voice for every speaker.</p></div>'
)

LANGUAGE_NAMES = {
    "en": "English", "fr": "French", "de": "German", "es": "Spanish", "pt": "Portuguese", "zh": "Chinese",
    "ja": "Japanese", "hi": "Hindi", "it": "Italian", "ko": "Korean", "nl": "Dutch", "pl": "Polish",
    "ru": "Russian", "sv": "Swedish", "tr": "Turkish", "tl": "Tagalog", "bg": "Bulgarian", "ro": "Romanian",
    "ar": "Arabic", "cs": "Czech", "el": "Greek", "fi": "Finnish", "hr": "Croatian", "ms": "Malay",
    "sk": "Slovak", "da": "Danish", "ta": "Tamil", "uk": "Ukrainian", "hu": "Hungarian", "no": "Norwegian",
    "vi": "Vietnamese", "bn": "Bengali", "th": "Thai", "he": "Hebrew", "ka": "Georgian", "id": "Indonesian",
    "te": "Telugu", "gu": "Gujarati", "kn": "Kannada", "ml": "Malayalam", "mr": "Marathi", "pa": "Punjabi",
    "or": "Odia", "ur": "Urdu",
}

def _section_head(title, description=None):
    desc = f"<p>{description}</p>" if description else ""
    return f'<div class="ab-section-head"><h2>{title}</h2>{desc}</div>'

def _html(value, cls=None):
    return gr.HTML(value, container=False, padding=False, elem_classes=cls)

def build_ui(default_output_dir):
    """Build the Blocks app. Returns (ui, components) without launching it."""
    with gr.Blocks(theme=CartesiaTheme(), css=load_css(), analytics_enabled=False,
                   title="Ebook to audiobook") as ui:
        _html(HEADER_HTML, "ab-header-wrap")
        _html(PAGE_HEADER_HTML)

        with gr.Column(elem_classes="ab-panel"):
            with gr.Column(elem_classes="ab-section"):
                _html(_section_head("Book", "A DRM-free EPUB. Chapters come out as separate audio files."))
                input_file = gr.File(label="Book", show_label=False, file_types=[".epub"],
                                     file_count="single", interactive=True, elem_classes="ab-dropzone ab-dropzone-epub")
                preview = gr.Checkbox(label="Preview only", value=False,
                                      info="Split the book into chapters and estimate the cost without making audio.")

            with gr.Column(elem_classes="ab-section"):
                with gr.Row(elem_classes="ab-section-top"):
                    _html(_section_head("Voices", "A voice for each speaker, or one narrator for the whole book."))
                    cast_mode = gr.Radio([("Per speaker", "dialogue"), ("One narrator", "narrator")],
                                         value="dialogue", label="Cast mode", show_label=False,
                                         container=False, interactive=True, elem_classes="ab-segmented")
                with gr.Row(elem_classes="ab-grid"):
                    voice = gr.Dropdown(list(VOICE_POOL), value=DEFAULT_NARRATOR, label="Narrator voice",
                                        interactive=True, allow_custom_value=True,
                                        info="A name from the list, or any Cartesia voice id.")
                    language = gr.Dropdown([(LANGUAGE_NAMES.get(c, c), c) for c in get_cartesia_supported_languages()],
                                           value="en", label="Language", interactive=True,
                                           info="Emotion cues only apply to English.")
                expressive = gr.Checkbox(value=True, label="Emotion and laughter cues",
                                         info="English dialogue only. Beta feature of the model.")

            with gr.Accordion("Advanced", open=False, elem_classes="ab-section ab-advanced"):
                _html('<h3 class="ab-subhead">Speech</h3>')
                with gr.Row(elem_classes="ab-grid"):
                    model = gr.Dropdown(get_cartesia_supported_models(), value="sonic-3.6", label="Model",
                                        interactive=True, allow_custom_value=True)
                    output_format = gr.Dropdown([(f.upper(), f) for f in get_cartesia_supported_output_formats()],
                                                value="mp3", label="Output format", interactive=True)
                with gr.Row(elem_classes="ab-grid"):
                    speed = gr.Slider(minimum=0.6, maximum=1.5, step=0.05, value=1.0, label="Speed")
                    volume = gr.Slider(minimum=0.5, maximum=2.0, step=0.05, value=1.0, label="Volume")
                max_chars = gr.Slider(minimum=200, maximum=4000, step=100, value=1500, label="Max characters per request",
                                      info="Longer paragraphs are split on sentence boundaries.")
                cast_file = gr.File(label="Cast file", file_types=[".json"], file_count="single",
                                    interactive=True, elem_classes="ab-dropzone ab-dropzone-labeled ab-dropzone-json")
                _html('<p class="ab-hint">Optional. A JSON table of speakers and their voices.</p>', "ab-hint-wrap")
                write_timings = gr.Checkbox(value=True, label="Write read-along files",
                                            info="Word timestamps (.timings.json) and subtitles (.vtt) next to each chapter.")

                _html('<h3 class="ab-subhead">Book parsing</h3>')
                with gr.Row(elem_classes="ab-grid"):
                    title_mode = gr.Dropdown([("Automatic", "auto"), ("From heading tags", "tag_text"),
                                              ("First few words", "first_few")],
                                             label="Chapter titles", value="auto", interactive=True,
                                             info="How chapter titles are found.")
                    new_line_mode = gr.Dropdown([("Every line break", "single"), ("Blank lines", "double"),
                                                 ("Ignore line breaks", "none")],
                                                label="Paragraphs", value="double", interactive=True,
                                                info="How new paragraphs are detected.")
                with gr.Row(elem_classes="ab-grid"):
                    chapter_start = gr.Slider(minimum=1, maximum=100, step=1, label="First chapter", value=1,
                                              interactive=True)
                    chapter_end = gr.Slider(minimum=-1, maximum=100, step=1, label="Last chapter", value=-1,
                                            interactive=True, info="-1 means the last chapter.")
                search_and_replace_file = gr.File(label="Search and replace file", file_types=[".txt"],
                                                  file_count="single", interactive=True,
                                                  elem_classes="ab-dropzone ab-dropzone-labeled ab-dropzone-txt")
                _html('<p class="ab-hint">Optional. One search==replace rule per line.</p>',
                      "ab-hint-wrap")
                with gr.Column(elem_classes="ab-checks"):
                    remove_endnotes = gr.Checkbox(label="Remove endnotes", value=False)
                    remove_reference_numbers = gr.Checkbox(label="Remove reference numbers", value=False)
                    output_text = gr.Checkbox(label="Also save chapter text", value=False,
                                              info="A plain text file next to each chapter's audio.")

                _html('<h3 class="ab-subhead">Run</h3>')
                output_dir = gr.Textbox(label="Output folder", value=default_output_dir, interactive=True)
                with gr.Row(elem_classes="ab-grid"):
                    log_level = gr.Dropdown([("Info", "INFO"), ("Debug", "DEBUG"), ("Warning", "WARNING"),
                                             ("Error", "ERROR"), ("Critical", "CRITICAL")],
                                            label="Log level", value="INFO", interactive=True)
                    worker_count = gr.Slider(minimum=1, maximum=8, step=1, label="Workers", value=1,
                                             info="More workers can be faster but use more memory.")

            local_vars = locals()
            components = {name: local_vars[name] for name in INPUT_ORDER}
            with gr.Row(elem_classes="ab-footer"):
                _html('<p class="ab-hint">Needs <code>CARTESIA_API_KEY</code> set where this app runs.</p>',
                      "ab-footer-note")
                stop_button = gr.Button("Stop", variant="secondary", scale=0, min_width=96, elem_classes="ab-stop")
                start_button = gr.Button("Make audiobook", variant="primary", scale=0, min_width=160,
                                         elem_classes="ab-start")
            stop_button.click(fn=terminate_audiobook_generator, inputs=None, outputs=None)
            start_button.click(
                fn=process_ui_form,
                inputs=[components[name] for name in INPUT_ORDER],
                outputs=None)

        _html(_section_head("Log", "Progress and errors from the current run."), "ab-log-head")
        global webui_log_file
        webui_log_file = generate_unique_log_path("EtA_WebUI")
        webui_log_file.touch()
        Log(str(webui_log_file.absolute()), dark=False, xterm_font_size=12,
            xterm_font_family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", label="Log", show_label=False,
            elem_classes="ab-log")

    return ui, components

def host_ui(config):
    default_output_dir = os.path.join("audiobook_output", datetime.now().strftime("%Y-%m-%d_%H-%M-%S"))
    print(f"Default audiobook output directory: {default_output_dir}")
    ui, _ = build_ui(default_output_dir)
    ui.launch(server_name=config.host, server_port=config.port)
