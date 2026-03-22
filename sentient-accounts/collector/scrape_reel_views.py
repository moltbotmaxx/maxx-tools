from __future__ import annotations

import argparse
import json
import pickle
import re
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from selenium import webdriver
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.support.ui import WebDriverWait

from instagram_auth import get_instagram_username, load_local_env, resolve_session_file

BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent
DEFAULT_PROFILE_DIR = REPO_ROOT / ".chrome-reels-profile"
DEFAULT_OUTPUT_DIR = REPO_ROOT / ".tmp" / "reel-views"
DEFAULT_MAX_REELS = 60
MAX_IDLE_SCROLLS = 8
SCROLL_PAUSE_SECONDS = 1.0
VIEW_KEYWORDS = (
    "view",
    "views",
    "play",
    "plays",
    "reproduccion",
    "reproducciones",
    "visualizacion",
    "visualizaciones",
)
IGNORE_LINE_KEYWORDS = (
    "pinned",
    "pin",
    "fijado",
    "fijada",
    "reel",
    "reels",
)
INSTAGRAM_HOME_URL = "https://www.instagram.com/"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Open Instagram Reels for one account in Chrome, scrape visible reel view counts, "
            "and save them as JSON for local analysis."
        )
    )
    parser.add_argument("username", help="Instagram handle without @")
    parser.add_argument(
        "--max-reels",
        type=int,
        default=DEFAULT_MAX_REELS,
        help=f"Maximum reels to collect before stopping. Default: {DEFAULT_MAX_REELS}",
    )
    parser.add_argument(
        "--profile-dir",
        default=str(DEFAULT_PROFILE_DIR),
        help=(
            "Chrome user-data directory for this scraper. Default uses a dedicated local profile "
            "that persists your Instagram login."
        ),
    )
    parser.add_argument(
        "--output",
        default="",
        help=(
            "Output JSON file path. Defaults to sentient-accounts/.tmp/reel-views/<username>.json"
        ),
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run Chrome headless. Only use this after the profile already has a valid login.",
    )
    parser.add_argument(
        "--skip-login-prompt",
        action="store_true",
        help="Fail immediately if Instagram shows the login screen instead of waiting for manual login.",
    )
    return parser.parse_args()


def normalize_username(raw_value: str) -> str:
    return raw_value.strip().lstrip("@")


def normalize_text(value: str) -> str:
    return unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode("ascii").lower()


def parse_count(text: str) -> int | None:
    if not text:
        return None

    normalized = normalize_text(text)
    normalized = re.sub(
        r"\b(?:views?|plays?|reproducciones?|visualizaciones?|de|del|la|el)\b",
        " ",
        normalized,
    )
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*(k|m|mil|mn|mll|millones)?", normalized)
    if not match:
        return None

    raw_number = match.group(1).replace(",", ".")
    try:
        value = float(raw_number)
    except ValueError:
        return None

    suffix = (match.group(2) or "").strip()
    if suffix in {"k", "mil"}:
        value *= 1_000
    elif suffix in {"m", "mn", "mll", "millones"}:
        value *= 1_000_000
    return int(round(value))


def extract_shortcode(url: str) -> str:
    path = urlparse(url).path.strip("/")
    parts = [part for part in path.split("/") if part]
    if len(parts) >= 2 and parts[0] == "reel":
        return parts[1]
    return parts[-1] if parts else ""


def resolve_output_path(username: str, raw_output: str) -> Path:
    if raw_output:
        path = Path(raw_output).expanduser()
        return path if path.is_absolute() else Path.cwd() / path
    return DEFAULT_OUTPUT_DIR / f"{username}.json"


def build_driver(profile_dir: Path, headless: bool) -> webdriver.Chrome:
    profile_dir.mkdir(parents=True, exist_ok=True)
    options = Options()
    options.add_argument(f"--user-data-dir={profile_dir}")
    options.add_argument("--disable-notifications")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1440,1600")
    options.add_argument("--lang=en-US")
    if headless:
        options.add_argument("--headless=new")

    return webdriver.Chrome(options=options)


def load_instaloader_session_cookies(session_file: Path) -> dict[str, str]:
    raw = pickle.loads(session_file.read_bytes())
    if not isinstance(raw, dict):
        raise ValueError(f"Session file {session_file} does not contain a cookie mapping.")

    cookies: dict[str, str] = {}
    for key, value in raw.items():
        if isinstance(key, str) and isinstance(value, str) and value:
            cookies[key] = value
    if not cookies:
        raise ValueError(f"Session file {session_file} did not yield any Instagram cookies.")
    return cookies


def apply_instagram_session_cookies(driver: webdriver.Chrome, session_file: Path) -> bool:
    if not session_file.exists():
        return False

    cookies = load_instaloader_session_cookies(session_file)
    driver.get(INSTAGRAM_HOME_URL)
    for name, value in cookies.items():
        driver.add_cookie(
            {
                "name": name,
                "value": value,
                "domain": ".instagram.com",
                "path": "/",
                "secure": True,
            }
        )
    driver.get(INSTAGRAM_HOME_URL)
    time.sleep(1)
    return not page_requires_login(driver)


def wait_for_reel_tiles(driver: webdriver.Chrome, timeout_seconds: int = 15) -> None:
    def tiles_present(current_driver: webdriver.Chrome) -> bool:
        return bool(current_driver.find_elements(By.XPATH, "//a[contains(@href,'/reel/')]"))

    WebDriverWait(driver, timeout_seconds).until(tiles_present)


def page_requires_login(driver: webdriver.Chrome) -> bool:
    current_url = driver.current_url.lower()
    if "accounts/login" in current_url:
        return True

    return bool(driver.find_elements(By.XPATH, "//input[@name='username' or @name='password']"))


def wait_for_manual_login(driver: webdriver.Chrome, target_url: str, skip_prompt: bool) -> None:
    if not page_requires_login(driver):
        return

    if skip_prompt:
        raise RuntimeError(
            "Instagram requires login for this scrape. Re-run without --skip-login-prompt "
            "or log into the scraper Chrome profile first."
        )

    print("")
    print("Instagram login is required in the opened Chrome window.")
    print("1. Log into Instagram in that window.")
    print("2. If Instagram asks for a challenge, finish it there.")
    print("3. Come back to this terminal and press Enter.")
    input("Press Enter once the account reels page is visible... ")
    driver.get(target_url)


def extract_candidate_lines(tile: WebElement, driver: webdriver.Chrome) -> list[str]:
    payload = driver.execute_script(
        """
        const el = arguments[0];
        const lines = new Set();

        const addText = (value) => {
          if (!value) return;
          String(value)
            .split(/\\n+/)
            .map((line) => line.trim())
            .filter(Boolean)
            .forEach((line) => lines.add(line));
        };

        addText(el.innerText || el.textContent || "");
        addText(el.getAttribute("aria-label") || "");
        addText(el.getAttribute("aria-description") || "");
        addText(el.getAttribute("title") || "");

        el.querySelectorAll("span").forEach((span) => addText(span.innerText || span.textContent || ""));
        return Array.from(lines);
        """,
        tile,
    )
    return [line for line in payload if isinstance(line, str) and line.strip()]


def extract_view_count(lines: list[str]) -> tuple[int | None, str]:
    prioritized: list[str] = []
    fallback: list[str] = []

    for line in lines:
        normalized = normalize_text(line)
        if not normalized:
            continue
        if any(keyword in normalized for keyword in IGNORE_LINE_KEYWORDS):
            continue
        if any(keyword in normalized for keyword in VIEW_KEYWORDS):
            prioritized.append(line)
        else:
            fallback.append(line)

    for bucket in (prioritized, fallback):
        for line in bucket:
            value = parse_count(line)
            if value is not None:
                return value, line
    return None, ""


def collect_reel_views(
    driver: webdriver.Chrome,
    username: str,
    max_reels: int,
    skip_login_prompt: bool,
) -> list[dict[str, Any]]:
    target_url = f"https://www.instagram.com/{username}/reels/"
    driver.get(target_url)
    time.sleep(2)
    wait_for_manual_login(driver, target_url, skip_login_prompt)

    try:
        wait_for_reel_tiles(driver)
    except TimeoutException as exc:
        raise RuntimeError(
            f"Timed out waiting for reels on @{username}. Make sure the account exists and the Reels tab is visible."
        ) from exc

    collected: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    idle_scrolls = 0

    while len(collected) < max_reels and idle_scrolls < MAX_IDLE_SCROLLS:
        tiles = driver.find_elements(By.XPATH, "//a[contains(@href,'/reel/')]")
        new_items = 0

        for tile in tiles:
            href = tile.get_attribute("href") or ""
            if not href or href in seen_urls:
                continue

            seen_urls.add(href)
            lines = extract_candidate_lines(tile, driver)
            views, source_line = extract_view_count(lines)
            shortcode = extract_shortcode(href)

            collected.append(
                {
                    "shortcode": shortcode,
                    "url": href,
                    "views": views,
                    "views_source_text": source_line,
                    "raw_lines": lines,
                }
            )
            new_items += 1

            if len(collected) >= max_reels:
                break

        if new_items == 0:
            idle_scrolls += 1
        else:
            idle_scrolls = 0

        driver.execute_script("window.scrollBy(0, Math.floor(window.innerHeight * 0.9));")
        time.sleep(SCROLL_PAUSE_SECONDS)

    return collected


class ReelViewScraper:
    def __init__(
        self,
        profile_dir: Path | None = None,
        headless: bool = False,
        session_file: Path | None = None,
        skip_login_prompt: bool = False,
    ) -> None:
        self.profile_dir = profile_dir or DEFAULT_PROFILE_DIR
        self.headless = headless
        self.session_file = session_file
        self.skip_login_prompt = skip_login_prompt
        self.driver: webdriver.Chrome | None = None
        self.session_authenticated = False

    def open(self) -> webdriver.Chrome:
        if self.driver is not None:
            return self.driver

        self.driver = build_driver(self.profile_dir, self.headless)
        if self.session_file:
            try:
                self.session_authenticated = apply_instagram_session_cookies(self.driver, self.session_file)
            except Exception as exc:
                print(f"Failed to apply Instagram session cookies from {self.session_file}: {exc}")
                self.session_authenticated = False
        return self.driver

    def close(self) -> None:
        if self.driver is None:
            return
        try:
            self.driver.quit()
        except Exception:
            pass
        self.driver = None

    def scrape_account(self, username: str, max_reels: int) -> list[dict[str, Any]]:
        driver = self.open()
        return collect_reel_views(
            driver,
            username=username,
            max_reels=max_reels,
            skip_login_prompt=self.skip_login_prompt,
        )

    def __enter__(self) -> ReelViewScraper:
        self.open()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()


def build_output_payload(username: str, reels: list[dict[str, Any]], target_url: str) -> dict[str, Any]:
    reels_with_views = [item for item in reels if item.get("views") is not None]
    return {
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "account": username,
        "profile_reels_url": target_url,
        "source": "selenium-instagram-reels-grid",
        "reels_collected": len(reels),
        "reels_with_views": len(reels_with_views),
        "reels": reels,
    }


def write_output(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


def main() -> int:
    args = parse_args()
    username = normalize_username(args.username)
    if not username:
        raise SystemExit("A valid Instagram username is required.")

    load_local_env()
    profile_dir = Path(args.profile_dir).expanduser()
    if not profile_dir.is_absolute():
        profile_dir = REPO_ROOT / profile_dir

    output_path = resolve_output_path(username, args.output)
    target_url = f"https://www.instagram.com/{username}/reels/"
    configured_username = get_instagram_username()
    session_file = resolve_session_file(configured_username) if configured_username else None

    print(f"Launching Chrome profile at {profile_dir}")
    print(f"Target account: @{username}")
    print(f"Output file: {output_path}")
    if session_file and session_file.exists():
        print(f"Will attempt to preload Instagram cookies from {session_file}")

    try:
        with ReelViewScraper(
            profile_dir=profile_dir,
            headless=args.headless,
            session_file=session_file,
            skip_login_prompt=args.skip_login_prompt,
        ) as scraper:
            reels = scraper.scrape_account(username, max(1, args.max_reels))
    except WebDriverException as exc:
        raise SystemExit(
            "Unable to launch Chrome through Selenium. Make sure Google Chrome is installed, "
            "then retry inside the sentient-accounts virtual environment."
        ) from exc

    payload = build_output_payload(username, reels, target_url)
    write_output(output_path, payload)

    print("")
    print(
        f"Collected {payload['reels_collected']} reel tiles for @{username}; "
        f"{payload['reels_with_views']} had a parsed view count."
    )
    print(f"Saved JSON to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
