import sys
import types

import pytest

pytest.importorskip("torch")
pytest.importorskip("PIL")
from PIL import Image

from nodes.io_images import MAX_IMAGES, NodeForgeLoadImage, list_images


@pytest.fixture
def inputs(tmp_path, monkeypatch):
    inp = tmp_path / "input"
    out = tmp_path / "output"
    (inp / "sub").mkdir(parents=True)
    out.mkdir()

    fake = types.SimpleNamespace(
        get_input_directory=lambda: str(inp),
        get_output_directory=lambda: str(out),
        filter_files_content_types=lambda files, types_: [
            f for f in files if f.lower().endswith((".png", ".jpg"))
        ],
    )
    monkeypatch.setitem(sys.modules, "folder_paths", fake)
    Image.new("RGB", (4, 2), (255, 0, 0)).save(inp / "red.png")
    Image.new("RGBA", (3, 3), (0, 0, 0, 0)).save(inp / "sub" / "clear.png")
    Image.new("RGB", (5, 5), (0, 255, 0)).save(out / "green.png")
    (inp / "notes.txt").write_text("not an image", encoding="utf-8")
    return inp


def run_list(images, image=""):
    return NodeForgeLoadImage().run(image=image, images="\n".join(images), display="grid")


def test_single_image_fills_first_pair_and_pads_the_rest(inputs):
    out = run_list(["input/red.png"])
    assert len(out) == 2 * MAX_IMAGES
    img, mask = out[0], out[1]
    assert tuple(img.shape) == (1, 2, 4, 3)
    assert float(img[0, 0, 0, 0]) == 1.0
    assert tuple(mask.shape) == (1, 2, 4)
    assert float(mask.sum()) == 0.0
    assert all(v is None for v in out[2:])


def test_input_and_output_images_fill_two_pairs(inputs):
    out = run_list(["input/red.png", "output/green.png"])
    assert tuple(out[2].shape) == (1, 5, 5, 3)
    assert all(v is None for v in out[4:])


def test_transparent_pixels_become_mask_ones(inputs):
    out = run_list(["input/sub/clear.png"])
    assert float(out[1].min()) == 1.0


def test_legacy_image_value_is_used_when_list_is_empty(inputs):
    out = NodeForgeLoadImage().run(image="red.png", images="", display="grid")
    assert tuple(out[0].shape) == (1, 2, 4, 3)


def test_empty_selection_is_an_error(inputs):
    with pytest.raises(ValueError, match="at least one"):
        run_list([])


def test_more_than_ten_images_is_rejected(inputs):
    with pytest.raises(ValueError, match="at most 10"):
        run_list([f"input/{i}.png" for i in range(MAX_IMAGES + 1)])


def test_duplicate_selection_is_skipped(inputs):
    out = run_list(["input/red.png", "input/red.png"])
    assert tuple(out[0].shape) == (1, 2, 4, 3)
    assert all(v is None for v in out[2:])


def test_path_outside_input_and_output_is_rejected(inputs):
    with pytest.raises(ValueError):
        run_list(["input/../../secret.png"])
    assert NodeForgeLoadImage.VALIDATE_INPUTS(images="input/../../secret.png") is not True


def test_missing_file_is_reported_by_validate(inputs):
    assert NodeForgeLoadImage.VALIDATE_INPUTS(images="input/missing.png") is not True
    assert NodeForgeLoadImage.VALIDATE_INPUTS(images="input/red.png") is True


def test_list_includes_input_and_output_images(inputs):
    assert list_images() == ["input/red.png", "input/sub/clear.png", "output/green.png"]


def test_file_path_lines_are_added_to_picked_images(inputs):
    out = NodeForgeLoadImage().run(images="input/red.png", file_path="output/green.png")
    assert tuple(out[0].shape) == (1, 2, 4, 3)
    assert tuple(out[2].shape) == (1, 5, 5, 3)
    assert all(v is None for v in out[4:])


def test_file_path_lines_work_without_picked_images(inputs):
    out = NodeForgeLoadImage().run(images="", file_path="output/green.png\ninput/red.png")
    assert tuple(out[0].shape) == (1, 5, 5, 3)
    assert tuple(out[2].shape) == (1, 2, 4, 3)


def test_file_path_duplicates_of_picked_images_are_skipped(inputs):
    out = NodeForgeLoadImage().run(images="input/red.png", file_path="input/red.png\noutput\\green.png")
    assert tuple(out[2].shape) == (1, 5, 5, 3)
    assert all(v is None for v in out[4:])


def test_picked_and_typed_images_count_towards_the_limit(inputs):
    picked = [f"input/{i}.png" for i in range(MAX_IMAGES)]
    with pytest.raises(ValueError, match="at most 10"):
        NodeForgeLoadImage().run(images="\n".join(picked), file_path="output/green.png")


def test_file_path_outside_input_and_output_is_rejected(inputs):
    assert NodeForgeLoadImage.VALIDATE_INPUTS(file_path="input/../../secret.png") is not True
    with pytest.raises(ValueError):
        NodeForgeLoadImage().run(file_path="../secret.png")


def test_is_changed_follows_file_path_content(inputs):
    first = NodeForgeLoadImage.IS_CHANGED(file_path="output/green.png")
    Image.new("RGB", (5, 5), (0, 0, 255)).save(inputs.parent / "output" / "green.png")
    assert NodeForgeLoadImage.IS_CHANGED(file_path="output/green.png") != first
