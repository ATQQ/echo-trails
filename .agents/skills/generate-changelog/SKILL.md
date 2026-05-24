---
name: generate-changelog
description: Generate release changelog entries from committed Git history and update CHANGELOG.md files. Use when the user asks to create, refresh, or update changelogs/release notes based on commits between the current workspace version and the previous version tag, including tasks that mention CHANGELOG.md, version-to-version changes, or already committed commits.
---

# Generate Changelog

## Workflow

1. Inspect the repository state before editing:
   - `git status --short`
   - `git tag --sort=-v:refname`
   - version sources such as `package.json`, package manifests, or native app config files.
2. Determine the release range:
   - Prefer an explicit user-provided version or tag.
   - Otherwise derive the current version from the workspace manifest.
   - If `v<current-version>` exists, compare the previous semver tag to that tag.
   - If `v<current-version>` does not exist, compare the latest previous semver tag to `HEAD`.
3. Generate the changelog from committed commits only. Do not include uncommitted working tree changes.
4. Update the relevant `CHANGELOG.md` files. For this repository, default to the root `CHANGELOG.md` unless the user names another file.
5. Review the generated text and adjust wording only when it improves clarity while preserving the commit meaning.
6. Validate with `git diff -- CHANGELOG.md` or the selected changelog files.

## Script

Use `scripts/update_changelog.py` for the standard flow:

```bash
python3 .agents/skills/generate-changelog/scripts/update_changelog.py --dry-run
python3 .agents/skills/generate-changelog/scripts/update_changelog.py --write
```

Useful options:

```bash
python3 .agents/skills/generate-changelog/scripts/update_changelog.py --version 0.7.9 --write
python3 .agents/skills/generate-changelog/scripts/update_changelog.py --from v0.7.8 --to HEAD --version 0.7.9 --write
python3 .agents/skills/generate-changelog/scripts/update_changelog.py --changelog packages/app/CHANGELOG.md --write
```

The script:

- Reads the current version from workspace manifests when `--version` is omitted.
- Groups Conventional Commit subjects into `Feature`, `Bug Fixes`, `Performance`, `Refactor`, `Documentation`, `Build`, `Tests`, `Chore`, and `Other`.
- Ignores release-only commits such as `chore(release): v0.7.8`.
- Inserts a new `## <version>` section after the top `# Changelog` heading, or replaces the existing section for that version.

## Guardrails

- Do not update changelogs from uncommitted diffs unless the user explicitly asks for draft notes.
- Do not create release tags or bump versions unless the user asks.
- Preserve the existing changelog style as much as possible.
- If the version range is ambiguous, show the detected range before writing.
