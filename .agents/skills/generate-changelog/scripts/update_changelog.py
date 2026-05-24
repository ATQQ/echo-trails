#!/usr/bin/env python3
"""Generate and update CHANGELOG.md from Git commits."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


CATEGORY_ORDER = [
    "Feature",
    "Bug Fixes",
    "Performance",
    "Refactor",
    "Documentation",
    "Build",
    "Tests",
    "Chore",
    "Other",
]

TYPE_TO_CATEGORY = {
    "feat": "Feature",
    "feature": "Feature",
    "功能": "Feature",
    "fix": "Bug Fixes",
    "bugfix": "Bug Fixes",
    "bug": "Bug Fixes",
    "修复": "Bug Fixes",
    "perf": "Performance",
    "performance": "Performance",
    "refactor": "Refactor",
    "docs": "Documentation",
    "doc": "Documentation",
    "build": "Build",
    "ci": "Build",
    "test": "Tests",
    "tests": "Tests",
    "chore": "Chore",
}

RELEASE_RE = re.compile(r"^chore(?:\([^)]*\))?!?:\s*v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$", re.I)
CONVENTIONAL_RE = re.compile(r"^(?P<type>[\w\u4e00-\u9fff-]+)(?:\([^)]*\))?!?[：:]\s*(?P<body>.+)$")
SEMVER_TAG_RE = re.compile(r"^v?(?P<version>\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$")


@dataclass(frozen=True)
class Commit:
    sha: str
    subject: str


def run_git(args: list[str], cwd: Path) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return result.stdout.strip()


def repo_root() -> Path:
    try:
        return Path(run_git(["rev-parse", "--show-toplevel"], Path.cwd()))
    except subprocess.CalledProcessError as exc:
        print(exc.stderr, file=sys.stderr)
        raise SystemExit("Not inside a Git repository") from exc


def parse_version(value: str) -> tuple[int, int, int, str]:
    match = SEMVER_TAG_RE.match(value.strip())
    if not match:
        raise ValueError(f"Unsupported semver value: {value}")
    base = match.group("version")
    core = re.split(r"[-+]", base, maxsplit=1)[0]
    major, minor, patch = (int(part) for part in core.split("."))
    suffix = base[len(core):]
    return major, minor, patch, suffix


def normalize_version(version: str) -> str:
    return version[1:] if version.startswith("v") else version


def tag_exists(tag: str, root: Path) -> bool:
    try:
        run_git(["rev-parse", "--verify", "--quiet", f"refs/tags/{tag}"], root)
        return True
    except subprocess.CalledProcessError:
        return False


def semver_tags(root: Path) -> list[str]:
    tags = run_git(["tag", "--list"], root).splitlines()
    valid_tags = [tag for tag in tags if SEMVER_TAG_RE.match(tag)]
    return sorted(valid_tags, key=parse_version)


def find_current_version(root: Path) -> str:
    candidates = [
        root / "package.json",
        root / "packages/app/package.json",
        root / "packages/server/package.json",
        root / "packages/native/src-tauri/tauri.conf.json",
        root / "packages/native/src-tauri/Cargo.toml",
    ]

    for path in candidates:
        if not path.exists():
            continue
        if path.suffix == ".json":
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            version = data.get("version")
            if isinstance(version, str) and SEMVER_TAG_RE.match(version):
                return version
        if path.name == "Cargo.toml":
            for line in path.read_text(encoding="utf-8").splitlines():
                match = re.match(r'^version\s*=\s*"([^"]+)"', line.strip())
                if match and SEMVER_TAG_RE.match(match.group(1)):
                    return match.group(1)

    raise SystemExit("Could not detect current version. Pass --version explicitly.")


def detect_range(root: Path, version: str | None, start_ref: str | None, end_ref: str | None) -> tuple[str, str, str]:
    current_version = normalize_version(version or find_current_version(root))
    current_tag = f"v{current_version}"

    if start_ref and end_ref:
        return current_version, start_ref, end_ref

    tags = semver_tags(root)
    if not tags:
        raise SystemExit("No semver tags found. Pass --from and --to explicitly.")

    if tag_exists(current_tag, root):
        lower_tags = [tag for tag in tags if parse_version(tag) < parse_version(current_tag)]
        if not lower_tags:
            raise SystemExit(f"No previous semver tag found before {current_tag}")
        return current_version, start_ref or lower_tags[-1], end_ref or current_tag

    lower_tags = [tag for tag in tags if parse_version(tag) < parse_version(current_version)]
    previous = lower_tags[-1] if lower_tags else tags[-1]
    return current_version, start_ref or previous, end_ref or "HEAD"


def load_commits(root: Path, start_ref: str, end_ref: str) -> list[Commit]:
    output = run_git(["log", "--no-merges", "--format=%H%x1f%s", f"{start_ref}..{end_ref}"], root)
    commits: list[Commit] = []
    for line in output.splitlines():
        if not line.strip():
            continue
        sha, subject = line.split("\x1f", 1)
        if RELEASE_RE.match(subject.strip()):
            continue
        commits.append(Commit(sha=sha, subject=subject.strip()))
    commits.reverse()
    return commits


def categorize(subject: str) -> tuple[str, str]:
    match = CONVENTIONAL_RE.match(subject)
    if not match:
        return "Other", subject

    commit_type = match.group("type").lower()
    body = match.group("body").strip()
    category = TYPE_TO_CATEGORY.get(commit_type, "Other")
    return category, body


def render_section(version: str, commits: Iterable[Commit]) -> str:
    grouped: dict[str, list[str]] = {category: [] for category in CATEGORY_ORDER}
    seen: set[tuple[str, str]] = set()

    for commit in commits:
        category, body = categorize(commit.subject)
        key = (category, body)
        if key in seen:
            continue
        seen.add(key)
        grouped.setdefault(category, []).append(body)

    lines = [f"## {version}"]
    has_entries = False
    for category in CATEGORY_ORDER:
        entries = grouped.get(category, [])
        if not entries:
            continue
        has_entries = True
        lines.extend(["", f"### {category}"])
        lines.extend(f"- {entry}" for entry in entries)

    if not has_entries:
        lines.extend(["", "- 暂无提交变更"])

    return "\n".join(lines).rstrip() + "\n"


def update_changelog(content: str, version: str, section: str) -> str:
    heading_re = re.compile(rf"^##\s+v?{re.escape(version)}\s*$", re.M)
    match = heading_re.search(content)

    if match:
        next_match = re.search(r"^##\s+", content[match.end():], re.M)
        end = match.end() + next_match.start() if next_match else len(content)
        return content[:match.start()] + section + "\n" + content[end:].lstrip("\n")

    title_match = re.search(r"^#\s+.+$", content, re.M)
    if title_match:
        insert_at = title_match.end()
        return content[:insert_at].rstrip() + "\n" + section + "\n" + content[insert_at:].lstrip("\n")

    return "# Changelog\n" + section + "\n" + content.lstrip("\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate CHANGELOG.md from Git commits.")
    parser.add_argument("--version", help="Version heading to update, for example 0.7.9.")
    parser.add_argument("--from", dest="start_ref", help="Start ref, exclusive. Example: v0.7.8")
    parser.add_argument("--to", dest="end_ref", help="End ref, inclusive. Example: HEAD or v0.7.9")
    parser.add_argument("--changelog", action="append", help="Changelog file to update. Repeat for multiple files. Defaults to CHANGELOG.md.")
    parser.add_argument("--write", action="store_true", help="Write changes to changelog files.")
    parser.add_argument("--dry-run", action="store_true", help="Print generated section without writing.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = repo_root()
    version, start_ref, end_ref = detect_range(root, args.version, args.start_ref, args.end_ref)
    commits = load_commits(root, start_ref, end_ref)
    section = render_section(version, commits)

    print(f"Range: {start_ref}..{end_ref}")
    print(f"Version: {version}")
    print()
    print(section)

    if args.dry_run or not args.write:
        return 0

    for changelog in args.changelog or ["CHANGELOG.md"]:
        path = (root / changelog).resolve()
        if not path.is_relative_to(root):
            raise SystemExit(f"Refusing to write outside repository: {path}")
        content = path.read_text(encoding="utf-8") if path.exists() else "# Changelog\n"
        path.write_text(update_changelog(content, version, section), encoding="utf-8")
        print(f"Updated {path.relative_to(root)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
