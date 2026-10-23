
from pathlib import Path

from moviepy import VideoFileClip, concatenate_videoclips


class VideoAssemblyError(Exception):
    """Raised when video clips cannot be assembled."""


class VideoAssemblyService:
    """Assemble generated scene clips into a final MP4 video."""

    def __init__(self):
        self.output_dir = (
            Path(__file__).resolve().parents[1]
            / "storage"
            / "assembled_videos"
        )
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def assemble(
        self,
        clip_paths: list[str | Path],
        output_filename: str,
        *,
        fps: int = 24,
        resolution: tuple[int, int] = (1280, 720),
    ) -> Path:
        """
        Concatenate scene clips in the supplied storyboard order.

        Existing source clips are never modified.
        Audio tracks are retained when present in the source clips.
        """
        if not clip_paths:
            raise VideoAssemblyError("No scene clips were provided.")

        if Path(output_filename).name != output_filename:
            raise ValueError("output_filename must be a filename only.")

        if not output_filename.lower().endswith(".mp4"):
            raise ValueError("The output filename must end in .mp4.")

        if fps <= 0:
            raise ValueError("fps must be greater than zero.")

        width, height = resolution
        if width <= 0 or height <= 0:
            raise ValueError("Resolution dimensions must be positive.")

        paths = [Path(path).resolve() for path in clip_paths]

        missing = [str(path) for path in paths if not path.is_file()]
        if missing:
            raise VideoAssemblyError(
                f"Scene clip files were not found: {missing}"
            )

        clips = []
        final_clip = None

        try:
            for path in paths:
                clip = VideoFileClip(str(path))

                if clip.duration is None or clip.duration <= 0:
                    clip.close()
                    raise VideoAssemblyError(
                        f"Invalid or empty video clip: {path.name}"
                    )

                # Normalize dimensions for a consistent output.
                # This stretches frames to the target aspect ratio.
                clip = clip.resized(new_size=(width, height))
                clips.append(clip)

            final_clip = concatenate_videoclips(
                clips,
                method="compose",
                padding=0,
            )

            output_path = self.output_dir / output_filename

            final_clip.write_videofile(
                str(output_path),
                fps=fps,
                codec="libx264",
                audio_codec="aac",
                preset="medium",
                logger="bar",
            )

            if not output_path.is_file() or output_path.stat().st_size == 0:
                raise VideoAssemblyError(
                    "The final video was not created successfully."
                )

            return output_path

        except VideoAssemblyError:
            raise
        except Exception as exc:
            raise VideoAssemblyError(
                f"Video assembly failed: {exc}"
            ) from exc
        finally:
            if final_clip is not None:
                final_clip.close()

            for clip in clips:
                try:
                    clip.close()
                except Exception:
                    pass
