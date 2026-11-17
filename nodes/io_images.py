# Portions of this file are adapted from ComfyUI-Pixaroma (Load Image Mini),
# Copyright (c) 2026 pixaroma, licensed under the MIT License:
#
# MIT License
#
# Copyright (c) 2026 pixaroma
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.

"""NodeForge: Load Image. Loads up to MAX_IMAGES images from input or output for the workflow."""

import hashlib
import os

from .utils import load_image_tensors, resolve_under

MAX_IMAGES = 10
FOLDERS = ("input", "output")
LABEL = "NodeForge: Load Image"


def _folder_dir(folder: str) -> str:
    import folder_paths

    if folder == "input":
        return folder_paths.get_input_directory()
    return folder_paths.get_output_directory()


def list_images() -> list:
    """Image files in input and output (subfolders included), e.g. 'input/a.png'."""
    import folder_paths

    files = []
    for folder in FOLDERS:
        base = _folder_dir(folder)
        if not os.path.isdir(base):
            continue
        for root, _dirs, names in os.walk(base):
            for name in names:
                rel = os.path.relpath(os.path.join(root, name), base)
                files.append(f"{folder}/{rel.replace(os.sep, '/')}")
    return folder_paths.filter_files_content_types(sorted(files), ["image"])


def resolve_image(choice: str) -> str:
    folder, sep, rel = choice.partition("/")
    if folder not in FOLDERS or not sep or not rel:
        raise ValueError(
            f"{LABEL}: path must be under input or output (e.g. input/a.png), got '{choice}'"
        )
    path = resolve_under(_folder_dir(folder), rel, LABEL)
    if not os.path.isfile(path):
        raise FileNotFoundError(f"{LABEL}: file not found: {choice}")
    return path


def selected_entries(images: str, image: str) -> list:
    """Chosen paths from the newline list. Falls back to the legacy single
    'image' value (a file in the input folder) when the list is empty."""
    entries = [line.strip() for line in (images or "").splitlines() if line.strip()]
    if not entries and image:
        entries = [f"input/{image}"]
    if not entries:
        raise ValueError(f"{LABEL}: select at least one image")
    if len(entries) > MAX_IMAGES:
        raise ValueError(
            f"{LABEL}: select at most {MAX_IMAGES} images, got {len(entries)}"
        )
    if len(set(entries)) != len(entries):
        raise ValueError(f"{LABEL}: the same image is selected more than once")
    return entries


class NodeForgeLoadImage:
    @classmethod
    def INPUT_TYPES(cls):
        legacy = [f[len("input/"):] for f in list_images() if f.startswith("input/")]
        return {
            "required": {
                # Legacy single-image widget, kept so older workflows still load.
                # The UI hides it and writes the selection to 'images'.
                "image": (
                    ["", *legacy],
                    {"default": "", "tooltip": "Legacy single image from the input folder."},
                ),
                "images": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "",
                        "tooltip": f"One image per line: input/... or output/... (up to {MAX_IMAGES}).",
                    },
                ),
                "display": (
                    ["grid", "list"],
                    {"default": "grid", "tooltip": "Preview layout in the node."},
                ),
            },
        }

    CATEGORY = "NodeForge/IO"
    RETURN_TYPES = ("IMAGE", "MASK") * MAX_IMAGES
    RETURN_NAMES = tuple(
        name for i in range(1, MAX_IMAGES + 1) for name in (f"image_{i}", f"mask_{i}")
    )
    FUNCTION = "run"
    DESCRIPTION = (
        f"Loads up to {MAX_IMAGES} images from the input or output folder. Each image "
        "gives an IMAGE and a MASK output (in order image_1, mask_1, image_2, ...). "
        "Unused slots are empty. A mask is 1 where the picture is transparent."
    )

    def run(self, image="", images="", display="grid"):
        loaded = [
            load_image_tensors(resolve_image(choice))
            for choice in selected_entries(images, image)
        ]
        outputs = []
        for i in range(MAX_IMAGES):
            if i < len(loaded):
                outputs.extend(loaded[i])
            else:
                outputs.extend((None, None))
        return tuple(outputs)

    @classmethod
    def IS_CHANGED(cls, image="", images="", display="grid"):
        digest = hashlib.sha256()
        try:
            entries = selected_entries(images, image)
        except ValueError:
            return float("nan")
        for choice in entries:
            digest.update(choice.encode("utf-8"))
            try:
                with open(resolve_image(choice), "rb") as f:
                    digest.update(f.read())
            except (OSError, ValueError):
                digest.update(b"missing")
        return digest.hexdigest()

    @classmethod
    def VALIDATE_INPUTS(cls, image="", images="", display="grid"):
        try:
            for choice in selected_entries(images, image):
                resolve_image(choice)
        except (ValueError, FileNotFoundError) as e:
            return str(e)
        return True
