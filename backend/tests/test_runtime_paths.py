from pathlib import Path

from app.runtime_paths import (
    configure_runtime,
    get_data_dir,
    get_install_root,
    sqlite_url_for_path,
)


def test_configure_runtime_uses_install_root_data(tmp_path, monkeypatch) -> None:
    install = tmp_path / "app"
    data = install / "data"
    install.mkdir()
    monkeypatch.setenv("LCM_INSTALL_ROOT", str(install))
    monkeypatch.delenv("DATABASE_URL", raising=False)

    configure_runtime()

    assert get_install_root() == install.resolve()
    assert get_data_dir() == data.resolve()
    assert data.is_dir()
    assert Path(get_data_dir(), "lego.db").as_posix() in __import__(
        "os"
    ).environ["DATABASE_URL"]


def test_sqlite_url_for_path_windows_friendly(tmp_path) -> None:
    db = tmp_path / "lego.db"
    url = sqlite_url_for_path(db)
    assert url.startswith("sqlite:///")
    assert "lego.db" in url
