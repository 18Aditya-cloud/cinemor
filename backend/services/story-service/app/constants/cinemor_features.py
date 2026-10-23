from __future__ import annotations


CINEMOR_FEATURES = [
    # The six features are the six stages of an organization project
    # (app/constants/workflow_stages.py): a job role with a feature works on,
    # or reviews, that stage. The keys are kept from before, so roles that
    # already have them keep working.
    {
        "key": "story_creation",
        "name": "Story Creation",
        "description": "Write or import the story (the Story stage).",
    },
    {
        "key": "storyboard_creation",
        "name": "Storyboard Creation",
        "description": "Turn the approved story into a storyboard (the Storyboard stage).",
    },
    {
        "key": "character_creation",
        "name": "Character Creation",
        "description": "Character profiles and images (the Characters stage).",
    },
    {
        "key": "scene_creation",
        "name": "Location Creation",
        "description": "Location profiles and images (the Locations stage).",
    },
    {
        "key": "shot_creation",
        "name": "Sketch Creation",
        "description": "A sketch for every scene (the Sketches stage).",
    },
    {
        "key": "video_generation",
        "name": "AI Animation",
        "description": "Scene clips and the film (the AI Animation stage).",
    },
]