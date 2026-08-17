# Tab Cleanup

Closes composition tabs in Adobe After Effects — in bulk, and reversibly. Every
comp it closes goes into a list you can reopen from with one click, so tidying up
never means losing your place.

![Tab Cleanup closing and restoring comp tabs](assets/demo.gif)

## Why

Working across nested comps opens tabs relentlessly. A day into a project the
Composition and Timeline panels are carrying hundreds of them, the tab bar is
useless, and the only way out is closing them one at a time.

After Effects has no "close all comps" command, and closing a tab doesn't
remember anything. So the choice is between drowning in tabs or losing the set of
comps you were moving between.

Tab Cleanup closes in bulk and keeps the receipt.

## Use

Press **Rescan** once to read which comps are open. From then on the list shows
only those, and it stays current as you close and reopen — **Refresh** just
re-renders it. **All comps** switches to the full project list when you need a
comp that was never open.

Highlight the rows you care about. Selection is the state — there is no separate
tick step, and selections survive filter changes, so you can build a set across
several searches. Double-click a row to open that comp.

| Action | What it does |
|---|---|
| Close all but selected | Closes everything, reopens your selection. The main one. |
| Close selected | Closes only the selected comps. |
| Close all | Closes every open tab. |
| Close all but active | Keeps the frontmost comp, closes the rest. No selection needed. |

Everything closed lands in the **Closed tabs** tab, newest first. Double-click an
entry to reopen it and drop it from the list.

The list persists to disk per project, so it survives quitting After Effects.
Comps are tracked by their internal item ID rather than by name or folder, which
means renaming a comp or reorganising the project doesn't break the link.

**Nothing is ever deleted.** Closing a tab leaves the comp exactly where it is in
the Project panel.

## Install

1. Copy `TabCleanup.jsx` into the ScriptUI Panels folder:
   - **macOS** — `/Applications/Adobe After Effects <version>/Scripts/ScriptUI Panels/`
   - **Windows** — `C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts\ScriptUI Panels\`
2. Enable **Preferences > Scripting & Expressions > Allow Scripts to Write Files
   and Access Network**. This is required — the closed list is written to disk.
3. Restart After Effects. The panel appears under **Window > TabCleanup.jsx**.

## How it works, and what that costs

Two constraints from the scripting API shape this tool, and both are worth
knowing before you file a bug.

**After Effects will not tell you which comps are open.** There is no `isOpen`
property and no list of viewer tabs — `app.project.activeItem` gives you the
active one and nothing else. **Rescan** works around this by closing every tab
and immediately reopening it, which is the only way to observe the set. After
that the panel tracks its own opens and closes, so a rescan is only needed when
tabs change by hand outside the panel.

**There is no API for closing a tab.** Closing means activating a comp and firing
the File > Close menu command through `app.executeCommand`. Because that walks
the open tabs one at a time, the close operation is itself the only reliable
enumeration of what was open — which is exactly what fills the Closed tabs list,
and what **Scan open tabs** exploits by closing everything and restoring it
immediately. The cost of that scan is a reordered tab bar.

The practical consequence: closing is not undoable. `Cmd`/`Ctrl` + `Z` will not
bring tabs back, because closing a tab isn't an undo-stack operation. The Closed
tabs list exists to cover that.

## Requirements

After Effects CC 2019 or newer. ExtendScript (ES3), no dependencies, no network
access. The closed list is stored in the user data folder as plain text.

## Known limitations

- Comps have no last-opened timestamp in the API, so the closed list is ordered
  by when this panel closed them, not by when you last worked in them.
- Closing several hundred tabs takes a few seconds, during which After Effects
  will not repaint.

## Companion tools

- [ae-comp-cleanup](https://github.com/keedViii/ae-comp-cleanup) — audits a
  project for unused footage, orphan comps and missing files before deleting
  anything.
- [OrderAE](https://github.com/keedViii/OrderAE) — sorts project items into
  category folders automatically.

## Contributing

Issues and pull requests welcome. When reporting a bug, include your After
Effects version and roughly how many comps the project contains.

## License

MIT — see [LICENSE](LICENSE).
