---

name: changelog
description: Keep CHANGELOG.md up to date. Use whenever you change behavior in a project that has a CHANGELOG.md.
---

# Changelog entries

This project keeps a changelog in the Keep a Changelog format. Every change
that a user of the library could notice gets an entry. Do it in the same
change as the code, not later.

1. Open `CHANGELOG.md` and find the `## [Unreleased]` section at the top.
2. Put the entry under the right heading, creating it if it is missing:
   `### Added` for new features, `### Changed` for changes in existing
   behavior, `### Fixed` for bug fixes, `### Removed` for removed features.
3. Write one line per change, starting with `- `. Name the function or
   option the user would call, and say what is different for them.
   Write "`slugify()` now strips accents" and not "refactored the regex".
4. Do not touch released sections below `[Unreleased]`.
