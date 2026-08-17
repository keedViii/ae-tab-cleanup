# Changelog

All notable changes to this project are documented here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.2] - 2026-08-17

### Changed

- Rescan no longer asks for confirmation. The scan closes and immediately
  reopens every tab, so from the user's side it reads rather than changes — the
  dialog was interrupting a routine action to warn about a reordered tab bar.
- Refresh runs the scan itself when no open set has been read yet, so the panel
  works on first use without knowing which button to press.

## [1.5.1] - 2026-08-17

### Added

- Double-clicking a row in the Project comps list opens that comp, matching the
  gesture already used in the Closed tabs list. Comps opened this way are removed
  from the closed list.

## [1.5.0] - 2026-08-17

### Changed

- The list now shows open tabs by default rather than every comp in the project.
- The open set is maintained as the panel works — each close removes from it and
  each reopen adds back — so **Refresh** re-renders it without rescanning.
  **Rescan** re-reads it from After Effects, which is only needed after opening
  or closing tabs by hand outside the panel.
- **All comps** switches to the full project list when you need to reach a comp
  that was never open.

## [1.4.0] - 2026-08-17

### Added

- **Scan open tabs.** Lists only the comps currently open, instead of every comp
  in the project. After Effects exposes no way to read the open set, so the scan
  closes every tab and immediately reopens it — closing walks the tabs one at a
  time, which makes it the only way to observe them. Comps are stashed as they
  close and unstashed once restored, so an interrupted scan leaves them
  recoverable from the Closed tabs list rather than lost.
- **Refresh** returns to showing all comps in the project.

### Known behaviour

- A scan reorders the tab bar. The comp that was active is restored as active,
  but the surrounding tab order is not preserved.

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
