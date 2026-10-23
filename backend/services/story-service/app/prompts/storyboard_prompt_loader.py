import json
from pathlib import Path

PROMPTS_DIR = Path(__file__).parent

STORYBOARD_PROMPT_PATH = PROMPTS_DIR / "storyboard_prompt.txt"
STORYBOARD_SCHEMA_PATH = PROMPTS_DIR / "storyboard_schema.json"


def load_storyboard_prompt() -> str:
    return STORYBOARD_PROMPT_PATH.read_text(encoding="utf-8")


def load_storyboard_schema() -> dict:
    with STORYBOARD_SCHEMA_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def build_storyboard_prompt(story: str) -> str:
    prompt = load_storyboard_prompt()
    schema = load_storyboard_schema()

    return (
        prompt
        .replace("{{SCHEMA}}", json.dumps(schema, ensure_ascii=False, indent=4))
        .replace("{{STORY}}", story)
    )
