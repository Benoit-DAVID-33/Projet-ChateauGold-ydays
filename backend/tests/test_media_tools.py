"""Tests des helpers medias (extensions, chemins surs, MIME)."""

from server import media_tools


def test_extension_predicates():
    assert media_tools.allowed_file("photo.png") is True
    assert media_tools.allowed_file("clip.mp4") is True
    assert media_tools.allowed_file("notes.txt") is False
    assert media_tools.is_image("photo.PNG") is True
    assert media_tools.is_video("clip.MP4") is True
    assert media_tools.is_image("clip.mp4") is False


def test_mimetype_for():
    assert media_tools.mimetype_for("a.png") == "image/png"
    assert media_tools.mimetype_for("a.jpg") == "image/jpeg"
    assert media_tools.mimetype_for("a.mp4") == "video/mp4"
    assert media_tools.mimetype_for("a.unknownext") == "application/octet-stream"


def test_clean_filename():
    assert media_tools.clean_filename("mon fichier.png") == "mon_fichier.png"
    assert media_tools.clean_filename("") is None


def test_safe_path_normal(tmp_path):
    assert media_tools.safe_path(tmp_path, "photo.png") == (tmp_path / "photo.png").resolve()


def test_safe_path_sanitizes_traversal(tmp_path):
    result = media_tools.safe_path(tmp_path, "../evil.txt")
    assert result is None or tmp_path.resolve() in result.parents
    assert media_tools.safe_path(tmp_path, "") is None
