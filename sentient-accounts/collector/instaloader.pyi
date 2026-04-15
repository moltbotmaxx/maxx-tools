from __future__ import annotations

from pathlib import Path
from typing import Any, Iterator


class InstaloaderContext:
    username: str | None

    def update_cookies(self, cookies: dict[str, str]) -> None: ...


class Post:
    shortcode: str
    date_utc: Any
    _node: dict[str, Any]


class Profile:
    username: str
    followers: int
    followees: int
    mediacount: int
    full_name: str
    biography: str
    external_url: str
    is_verified: bool
    profile_pic_url: str

    @staticmethod
    def from_username(context: InstaloaderContext, username: str) -> Profile: ...

    def get_posts(self) -> Iterator[Post]: ...


class Instaloader:
    context: InstaloaderContext

    def __init__(
        self,
        download_pictures: bool = ...,
        download_videos: bool = ...,
        download_video_thumbnails: bool = ...,
        download_geotags: bool = ...,
        download_comments: bool = ...,
        save_metadata: bool = ...,
        compress_json: bool = ...,
        post_metadata_txt_pattern: str = ...,
        storyitem_metadata_txt_pattern: str = ...,
        quiet: bool = ...,
    ) -> None: ...

    def load_session_from_file(self, username: str, filename: str | Path | None = ...) -> None: ...
    def save_session_to_file(self, filename: str | Path | None = ...) -> None: ...
    def login(self, user: str, passwd: str) -> None: ...
    def interactive_login(self, username: str) -> None: ...
    def test_login(self) -> str | None: ...
