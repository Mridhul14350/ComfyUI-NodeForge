"""Shared file helpers for NodeForge. No node classes here."""

import os

MAX_FILE_BYTES = 10 * 1024 * 1024


def resolve_under(base_dir: str, rel_path: str, label: str) -> str:
    """Return the real path of rel_path inside base_dir, or raise ValueError
    if it escapes base_dir (for example through '..' or a symlink)."""
    base = os.path.realpath(os.path.abspath(base_dir))
    path = os.path.realpath(os.path.join(base, rel_path))
    if not path.startswith(base + os.sep):
        raise ValueError(f"{label}: path '{rel_path}' is outside {base_dir}")
    return path


def load_image_tensors(path: str):
    """Open an image and return (image, mask) tensors for ComfyUI.

    image: float32 [1, H, W, 3] in 0-1. mask: float32 [1, H, W], 1 where the
    picture is transparent. Images without alpha get an all-zero mask.
    Only the first frame of animated files is read.
    """
    import numpy as np
    import torch
    from PIL import Image, ImageOps

    with Image.open(path) as img:
        frame = ImageOps.exif_transpose(img)
        if frame.mode == "P" and "transparency" in frame.info:
            frame = frame.convert("RGBA")
        rgb = frame.convert("RGB")
        if "A" in frame.getbands():
            alpha = np.array(frame.getchannel("A"), dtype=np.float32) / 255.0
            mask = 1.0 - alpha
        else:
            mask = np.zeros((rgb.height, rgb.width), dtype=np.float32)

    image = np.array(rgb, dtype=np.float32) / 255.0
    return (
        torch.from_numpy(image)[None,],
        torch.from_numpy(mask)[None,],
    )


def read_text_file(path: str) -> str:
    """Read a UTF-8 text file (BOM allowed). Files over MAX_FILE_BYTES are
    refused so one huge file cannot exhaust memory."""
    size = os.path.getsize(path)
    if size > MAX_FILE_BYTES:
        raise ValueError(
            f"file is {size} bytes, the limit is {MAX_FILE_BYTES}: {path}"
        )
    with open(path, "rb") as f:
        raw = f.read()
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError as e:
        raise ValueError(f"file is not UTF-8 text: {path} ({e})") from e
