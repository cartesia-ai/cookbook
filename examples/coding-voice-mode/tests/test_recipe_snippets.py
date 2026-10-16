"""Code blocks in the recipe that name a source file must be copies of that file's lines."""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
RECIPE = ROOT.parents[1] / "content" / "cookbook" / "10-python" / "05-voice-mode-for-coding-agents.mdx"

pytestmark = pytest.mark.skipif(not RECIPE.exists(), reason="recipe lives in the cookbook repo")

def test_recipe_snippets_match_source():
    text = RECIPE.read_text()
    blocks = re.findall(r'```python filename="([^"]+)"\n(.*?)```', text, re.S)
    assert len(blocks) >= 3
    for filename, code in blocks:
        source = {ln.strip() for ln in (ROOT / filename).read_text().splitlines()}
        for line in code.splitlines():
            assert not line.strip() or line.strip() in source, f"{filename}: {line!r} not in source"

def test_recipe_has_no_retired_ids_or_em_dash():
    text = RECIPE.read_text()
    assert "\u2014" not in text
