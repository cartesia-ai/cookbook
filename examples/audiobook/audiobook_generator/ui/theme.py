"""Gradio theme in the look of the cookbook kit: shadcn/ui-style neutral
surfaces, Cartesia Verdant accents, Inter for all text, hairline borders.

Token values are copied from packages/kit/theme.css (light and dark). Gradio
themes only reach so far: colours, fonts, radii and spacing presets work, the
kit's own components and icons do not.
"""
import os

import gradio as gr
from gradio.themes.utils import colors

_NEUTRAL = colors.Color(
    name="cartesia_neutral",
    c50="#fefefe", c100="#f9f9f8", c200="#f3f2ef", c300="#f0efe9", c400="#e4e3db",
    c500="#c5c2bc", c600="#a7a6a2", c700="#787672", c800="#525150", c900="#1e1c1a", c950="#111010",
)
_GREEN = colors.Color(
    name="cartesia_green",
    c50="#f4faef", c100="#e2f5da", c200="#ceecbf", c300="#abd49e", c400="#5db368",
    c500="#309d4b", c600="#227a38", c700="#1a6b2e", c800="#125c25", c900="#004e23", c950="#00311a",
)

_CSS_PATH = os.path.join(os.path.dirname(__file__), "assets", "cartesia.css")

def load_css() -> str:
    with open(_CSS_PATH, encoding="utf-8") as f:
        return f.read()

class CartesiaTheme(gr.themes.Base):
    def __init__(self):
        super().__init__(
            primary_hue=_GREEN,
            neutral_hue=_NEUTRAL,
            font=[gr.themes.GoogleFont("Inter"), "ui-sans-serif", "system-ui", "sans-serif"],
            font_mono=["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
            radius_size=gr.themes.sizes.radius_md,
            spacing_size=gr.themes.sizes.spacing_md,
        )
        self.set(
            body_text_size="14px",
            layout_gap="16px",
            form_gap_width="0px",
            block_padding="0px",
            block_radius="10px",
            container_radius="14px",
            block_label_text_size="13px",
            block_label_text_weight="500",
            block_title_text_size="13px",
            block_title_text_weight="500",
            block_info_text_size="12px",
            block_info_text_weight="400",
            input_text_size="14px",
            input_padding="0 12px",
            input_radius="8px",
            button_large_padding="0 16px",
            button_large_text_size="14px",
            button_large_text_weight="500",
            button_large_radius="8px",
            button_medium_text_size="14px",
            button_medium_radius="8px",
            checkbox_border_radius="4px",
            checkbox_border_width="1px",
            checkbox_shadow="0 1px 2px rgb(0 0 0 / 5%)",
            checkbox_label_padding="0px",
            checkbox_label_gap="8px",
            checkbox_label_text_size="14px",
            checkbox_label_text_weight="500",
            checkbox_label_border_width="0px",
            checkbox_label_shadow="none",
            checkbox_label_background_fill="transparent",
            checkbox_label_background_fill_hover="transparent",
            checkbox_label_background_fill_selected="transparent",
            checkbox_label_background_fill_dark="transparent",
            checkbox_label_background_fill_hover_dark="transparent",
            checkbox_label_background_fill_selected_dark="transparent",
            checkbox_background_color="#fefefe",
            checkbox_background_color_dark="color-mix(in oklab, #525150 22%, transparent)",
            checkbox_border_color="#e4e3db",
            checkbox_border_color_dark="color-mix(in oklab, #525150 70%, transparent)",
            checkbox_border_color_focus="#309d4b",
            checkbox_border_color_focus_dark="#5db368",
            block_info_text_color="#787672",
            block_info_text_color_dark="#a7a6a2",
            block_label_background_fill="transparent",
            block_label_background_fill_dark="transparent",
            block_label_border_width="0px",
            block_label_padding="0px",
            block_label_margin="0px",
            body_background_fill="#f9f9f8",
            body_text_color="#1e1c1a",
            body_text_color_subdued="#787672",
            background_fill_primary="#fefefe",
            background_fill_secondary="#f3f2ef",
            block_background_fill="#fefefe",
            block_border_color="#e4e3db",
            block_border_width="1px",
            block_shadow="none",
            block_shadow_dark="none",
            block_label_text_color="#1e1c1a",
            block_title_text_color="#1e1c1a",
            border_color_primary="#e4e3db",
            input_background_fill="#fefefe",
            input_border_color="#e4e3db",
            input_border_color_focus="#309d4b",
            input_shadow="0 1px 2px rgb(0 0 0 / 5%)",
            input_shadow_focus="0 0 0 3px rgb(48 157 75 / 25%)",
            button_primary_background_fill="#309d4b",
            button_primary_background_fill_hover="#227a38",
            button_primary_text_color="#fefefe",
            button_primary_border_color="#309d4b",
            button_secondary_background_fill="#fefefe",
            button_secondary_background_fill_hover="#f0efe9",
            button_secondary_text_color="#1e1c1a",
            button_secondary_border_color="#e4e3db",
            slider_color="#309d4b",
            checkbox_background_color_selected="#309d4b",
            checkbox_border_color_selected="#309d4b",
            body_background_fill_dark="#111010",
            body_text_color_dark="#f9f9f8",
            body_text_color_subdued_dark="#a7a6a2",
            background_fill_primary_dark="#1e1c1a",
            background_fill_secondary_dark="#111010",
            block_background_fill_dark="#1e1c1a",
            block_border_color_dark="color-mix(in oklab, #525150 55%, transparent)",
            block_label_text_color_dark="#f9f9f8",
            block_title_text_color_dark="#f9f9f8",
            border_color_primary_dark="color-mix(in oklab, #525150 55%, transparent)",
            input_background_fill_dark="color-mix(in oklab, #525150 22%, transparent)",
            input_border_color_dark="color-mix(in oklab, #525150 70%, transparent)",
            input_border_color_focus_dark="#5db368",
            input_shadow_focus_dark="0 0 0 3px rgb(93 179 104 / 25%)",
            button_primary_background_fill_dark="#5db368",
            button_primary_background_fill_hover_dark="#abd49e",
            button_primary_text_color_dark="#111010",
            button_primary_border_color_dark="#5db368",
            button_secondary_background_fill_dark="color-mix(in oklab, #525150 22%, transparent)",
            button_secondary_background_fill_hover_dark="color-mix(in oklab, #525150 40%, transparent)",
            button_secondary_text_color_dark="#f9f9f8",
            button_secondary_border_color_dark="color-mix(in oklab, #525150 55%, transparent)",
            slider_color_dark="#5db368",
            checkbox_background_color_selected_dark="#5db368",
            checkbox_border_color_selected_dark="#5db368",
        )
