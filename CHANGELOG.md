# Changelog

All notable changes to this project are documented here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-08-16

### Changed

- Selecting a row now *is* selecting the comp. Highlighting rows in the list
  marks them directly, replacing the earlier two-step flow of selecting rows and
  then pressing a Tick button. The ■ column mirrors the highlight.
- Selections survive filter changes, so a set can be built up across several
  different search terms rather than only from what is currently visible.
- Button labels renamed from "ticked" to "selected" to match.

## [1.2.0] - 2026-08-16

### Changed

- Ticking a comp is now a single click on the row, rather than selecting it and
  pressing a button.
- Tick changes update the affected rows in place instead of rebuilding the whole
  list. On a project with several hundred comps the full repaint was slow and
  reset the scroll position on every click, which made ticking through a long
  list impractical.

## [1.1.1] - 2026-08-16

### Fixed

- Bulk closing could act on the wrong panel. `app.executeCommand` applies to
  whichever panel holds focus, and clicking a button in a floating ScriptUI
  palette leaves focus on the palette — so the File > Close command could close
  the panel itself instead of a comp tab. Each comp is now brought into the
  Composition viewer immediately before its Close command fires.

## [1.1.0] - 2026-08-16

### Added

- **Closed tabs** list. Every comp the panel closes is recorded and can be
  reopened with a double-click. Because closing walks the open tabs one at a
  time, the close operation is the only reliable enumeration of what was open —
  so recording it costs nothing and solves the problem that closing a tab
  otherwise loses the comp entirely.
- The closed list persists to disk, stored per project file so switching projects
  does not mix histories.
- Comps are tracked by internal item ID rather than name or folder path, so
  renaming a comp or reorganising the project does not break the link.
- **Tick active comp**, for keeping the comp you are working in without hunting
  for it in a long list.

## [1.0.0] - 2026-08-16

### Added

- Initial release.
- Filterable list of every composition in the project.
- Close ticked, close all but ticked, close all, and close all but active.
- Guarded close loop that stops rather than spinning if the Close command fails
  to land.
