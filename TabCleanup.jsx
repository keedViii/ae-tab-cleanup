#targetengine "tabCleanup"

/**
 * Tab Cleanup — closes and restores composition tabs in Adobe After Effects.
 *
 * Long sessions leave hundreds of comps open across the Composition and Timeline
 * panels. This closes them in bulk and remembers what it closed, so reopening a
 * comp later is one click instead of a hunt through the Project panel.
 *
 * Install: copy to
 *   Win : C:\Program Files\Adobe\Adobe After Effects <ver>\Support Files\Scripts\ScriptUI Panels\
 *   Mac : /Applications/Adobe After Effects <ver>/Scripts/ScriptUI Panels/
 * then enable Preferences > Scripting & Expressions > Allow Scripts to Write Files
 * and Access Network, and restart AE. Opens under Window > TabCleanup.jsx.
 *
 * Two notes on how this works, because the scripting API constrains both:
 *
 * 1. After Effects exposes no way to list which comps are currently open, and no
 *    way to close a viewer tab directly. Closing means activating a comp and
 *    issuing the File > Close menu command. The Project comps tab therefore lists
 *    every comp in the project rather than only the open ones — ticking a comp
 *    that is already closed is harmless.
 *
 * 2. Because closing walks the open tabs one at a time, the close operation is
 *    itself the only reliable enumeration of what was open. Everything closed is
 *    recorded to the Closed tabs list, which persists to disk per project.
 *
 * Tested on CC 2019 through 2025. ExtendScript (ES3) — no ES5 array methods.
 *
 * @author Wun VFX
 * @version 1.5.2
 * @license MIT
 */

(function tabCleanup(thisObj) {
    var SCRIPT_NAME = "Tab Cleanup";
    var SCRIPT_VERSION = "1.5.2";

    var CHECKED = "\u25A0";
    var UNCHECKED = "\u25A1";
    var STASH_LIMIT = 800;

    /* ---------------------------------------------------------------- utils */

    function each(arr, fn) {
        for (var i = 0; i < arr.length; i++) { fn(arr[i], i); }
    }

    function indexOf(arr, val) {
        for (var i = 0; i < arr.length; i++) { if (arr[i] === val) { return i; } }
        return -1;
    }

    function contains(haystack, needle) {
        return String(haystack).toLowerCase().indexOf(String(needle).toLowerCase()) !== -1;
    }

    function formatDuration(seconds) {
        var total = Math.round(seconds);
        var m = Math.floor(total / 60);
        var s = total % 60;
        return m + ":" + (s < 10 ? "0" : "") + s;
    }

    function isAlive(item) {
        try { var n = item.name; return true; } catch (e) { return false; }
    }

    /* ------------------------------------------------------------- ae access */

    /** File > Close. There is no Viewer.close() in the scripting API. */
    function closeCommandId() {
        var id = 0;
        try { id = app.findMenuCommandId("Close"); } catch (e) { id = 0; }
        return id;
    }

    function allComps() {
        var out = [];
        var proj = app.project;
        for (var i = 1; i <= proj.numItems; i++) {
            var item = proj.item(i);
            if (item instanceof CompItem) { out.push(item); }
        }
        return out;
    }

    function activeComp() {
        var ai = app.project.activeItem;
        return (ai instanceof CompItem) ? ai : null;
    }

    function compById(id) {
        try {
            var it = app.project.itemByID(id);
            if (it instanceof CompItem) { return it; }
        } catch (e) {}
        return null;
    }

    /**
     * Fires Close and confirms the active item actually changed. False means the
     * command did not land — usually focus sitting somewhere Close does not apply
     * to — and callers must stop rather than spin.
     */
    function closeActive(cmdId) {
        var before = app.project.activeItem;
        if (!(before instanceof CompItem)) { return false; }
        try { app.executeCommand(cmdId); } catch (e) { return false; }
        return app.project.activeItem !== before;
    }

    function closeOne(comp, cmdId) {
        if (!isAlive(comp)) { return false; }
        try {
            if (!comp.openInViewer()) { return false; }
        } catch (e) {
            return false;
        }
        return closeActive(cmdId);
    }

    /**
     * Closes every open comp, handing each successfully closed one to onClosed.
     * That callback is the only way to learn what was open, so it doubles as the
     * enumeration the API otherwise refuses to provide.
     */
    function closeAll(cmdId, onClosed) {
        var closed = 0;
        var guard = 0;
        while (guard < 3000) {
            var comp = activeComp();
            if (comp === null) { break; }
            // Pull focus onto the Composition viewer first. Without this the Close
            // command can land on whichever panel the user last clicked — including
            // this one — instead of the comp tab.
            try { comp.openInViewer(); } catch (e) {}
            if (!closeActive(cmdId)) { break; }
            closed++;
            guard++;
            if (onClosed) { onClosed(comp); }
        }
        return closed;
    }

    /* ------------------------------------------------------ stash persistence */

    function stashFolder() {
        var f = new Folder(Folder.userData.fsName + "/TabCleanup");
        if (!f.exists) { f.create(); }
        return f;
    }

    /** One stash per project file, so switching projects does not mix histories. */
    function stashFile() {
        var name = "untitled";
        try {
            if (app.project.file) { name = app.project.file.name; }
        } catch (e) {}
        name = name.replace(/[^A-Za-z0-9._-]/g, "_");
        return new File(stashFolder().fsName + "/" + name + ".txt");
    }

    function saveStash(stash) {
        try {
            var f = stashFile();
            f.encoding = "UTF-8";
            if (!f.open("w")) { return false; }
            for (var i = 0; i < stash.length; i++) {
                f.writeln(stash[i].id + "\t" + stash[i].name);
            }
            f.close();
            return true;
        } catch (e) {
            return false;
        }
    }

    function loadStash() {
        var out = [];
        try {
            var f = stashFile();
            if (!f.exists) { return out; }
            f.encoding = "UTF-8";
            if (!f.open("r")) { return out; }
            while (!f.eof) {
                var line = f.readln();
                if (!line) { continue; }
                var tab = line.indexOf("\t");
                if (tab < 1) { continue; }
                var id = parseInt(line.substring(0, tab), 10);
                if (isNaN(id)) { continue; }
                out.push({ id: id, name: line.substring(tab + 1) });
            }
            f.close();
        } catch (e) {}
        return out;
    }

    /* ------------------------------------------------------------------- ui */

    function build(thisObj) {
        var win = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", SCRIPT_NAME + " " + SCRIPT_VERSION, undefined, { resizeable: true });

        win.orientation = "column";
        win.alignChildren = ["fill", "fill"];
        win.spacing = 8;
        win.margins = 10;

        var comps = [];        // every comp in the project
        var ticked = [];       // selected comps, survives filter changes
        var shown = [];        // comps currently visible in the comp list
        var stash = [];        // {id, name} of comps this panel closed, newest first
        var openComps = [];    // result of the last open-tab scan
        var mode = "open";     // "open" (tabs on screen) or "all" (every comp in the project)
        var suspend = false;   // blocks the selection handler during programmatic repaints

        var tabs = win.add("tabbedpanel");
        tabs.alignChildren = ["fill", "fill"];
        tabs.preferredSize.height = 380;

        var tabComps = tabs.add("tab", undefined, "Project comps");
        var tabStash = tabs.add("tab", undefined, "Closed tabs");
        each([tabComps, tabStash], function (t) {
            t.orientation = "column";
            t.alignChildren = ["fill", "fill"];
            t.spacing = 8;
            t.margins = 10;
        });
        tabs.selection = tabComps;

        /* --- tab 1: project comps --- */

        var filterRow = tabComps.add("group");
        filterRow.orientation = "row";
        filterRow.alignChildren = ["fill", "center"];
        filterRow.alignment = ["fill", "top"];
        filterRow.add("statictext", undefined, "Filter:");
        var txtFilter = filterRow.add("edittext", undefined, "");
        txtFilter.alignment = ["fill", "center"];
        var btnRefresh = filterRow.add("button", undefined, "Refresh");
        btnRefresh.preferredSize.width = 80;
        var btnScanOpen = filterRow.add("button", undefined, "Rescan");
        btnScanOpen.preferredSize.width = 80;
        var btnShowAll = filterRow.add("button", undefined, "All comps");
        btnShowAll.preferredSize.width = 90;

        var list = tabComps.add("listbox", undefined, [], {
            numberOfColumns: 4,
            showHeaders: true,
            columnTitles: ["", "Composition", "Layers", "Length"],
            columnWidths: [26, 300, 60, 70],
            multiselect: true
        });
        list.alignment = ["fill", "fill"];

        var tickRow = tabComps.add("group");
        tickRow.orientation = "row";
        tickRow.alignChildren = ["left", "center"];
        tickRow.alignment = ["fill", "bottom"];
        var btnSelectShown = tickRow.add("button", undefined, "Select all shown");
        var btnTickActive = tickRow.add("button", undefined, "Add active comp");
        var btnClear = tickRow.add("button", undefined, "Clear selection");
        each([btnSelectShown, btnTickActive, btnClear], function (b) {
            b.preferredSize.width = 140;
        });

        var actRow = tabComps.add("group");
        actRow.orientation = "row";
        actRow.alignChildren = ["fill", "center"];
        actRow.alignment = ["fill", "bottom"];
        var btnCloseButTicked = actRow.add("button", undefined, "Close all but selected");
        var btnCloseTicked = actRow.add("button", undefined, "Close selected");
        var btnCloseAll = actRow.add("button", undefined, "Close all");
        var btnCloseOthers = actRow.add("button", undefined, "Close all but active");

        /* --- tab 2: closed tabs --- */

        var stashList = tabStash.add("listbox", undefined, [], {
            numberOfColumns: 2,
            showHeaders: true,
            columnTitles: ["Composition", "Status"],
            columnWidths: [340, 120],
            multiselect: true
        });
        stashList.alignment = ["fill", "fill"];

        var stashRow = tabStash.add("group");
        stashRow.orientation = "row";
        stashRow.alignChildren = ["fill", "center"];
        stashRow.alignment = ["fill", "bottom"];
        var btnReopen = stashRow.add("button", undefined, "Reopen selected");
        var btnReopenAll = stashRow.add("button", undefined, "Reopen all");
        var btnForget = stashRow.add("button", undefined, "Remove from list");
        var btnForgetAll = stashRow.add("button", undefined, "Clear list");

        /* --- shared footer --- */

        var lblStatus = win.add("statictext", undefined, "Press Refresh to read the open tabs.");
        lblStatus.alignment = ["fill", "bottom"];

        var lblFoot = win.add("statictext", undefined,
            "Closing a tab never deletes anything \u2014 comps stay in the Project panel.");
        lblFoot.alignment = ["fill", "bottom"];

        /* --- ui helpers --- */

        function repaint() {
            try {
                var w = (win instanceof Window) ? win : win.window;
                if (w && w.update) { w.update(); }
            } catch (e) {}
        }

        function guard(fn) {
            return function () {
                try {
                    return fn.apply(this, arguments);
                } catch (e) {
                    var where = e.line ? " (line " + e.line + ")" : "";
                    lblStatus.text = "Failed: " + e.toString();
                    alert(SCRIPT_NAME + " hit an error" + where + ":\n\n" + e.toString(),
                        SCRIPT_NAME);
                }
            };
        }

        function isTicked(comp) {
            return indexOf(ticked, comp) !== -1;
        }

        function setTicked(comp, on) {
            var at = indexOf(ticked, comp);
            if (on && at === -1) { ticked.push(comp); }
            if (!on && at !== -1) { ticked.splice(at, 1); }
        }

        /**
         * Selection is the state. Highlighting a row marks the comp; the ■ column
         * mirrors it. Ticks for comps hidden by the current filter are left alone,
         * so a selection can be built up across several different filter terms.
         */
        function syncFromSelection() {
            if (suspend) { return; }
            for (var i = 0; i < shown.length && i < list.items.length; i++) {
                var row = list.items[i];
                var on = row.selected;
                setTicked(shown[i], on);
                row.text = on ? CHECKED : UNCHECKED;
            }
            summarise();
        }

        function paintComps() {
            var needle = txtFilter.text;
            var source = (mode === "open") ? openComps : comps;
            shown = [];
            suspend = true;
            list.removeAll();

            each(source, function (comp) {
                if (!isAlive(comp)) { return; }
                if (needle !== "" && !contains(comp.name, needle)) { return; }
                shown.push(comp);

                var on = isTicked(comp);
                var row = list.add("item", on ? CHECKED : UNCHECKED);
                row.subItems[0].text = comp.name;
                row.subItems[1].text = comp.numLayers;
                row.subItems[2].text = formatDuration(comp.duration);
                row.comp = comp;
                row.selected = on;
            });

            suspend = false;
            summarise();
        }

        function paintStash() {
            stashList.removeAll();
            each(stash, function (entry) {
                var comp = compById(entry.id);
                var row = stashList.add("item", comp ? comp.name : entry.name);
                row.subItems[0].text = comp ? "In project" : "Not found";
                row.entry = entry;
            });
            tabStash.text = "Closed tabs (" + stash.length + ")";
        }

        function summarise() {
            var scope = (mode === "open")
                ? openComps.length + " open tab(s)"
                : comps.length + " comp(s) in project";
            lblStatus.text = scope + ", " + shown.length +
                " shown, " + ticked.length + " selected \u2014 " + stash.length + " in closed list.";
        }

        function selectionOf(lb) {
            var sel = lb.selection;
            if (!sel) { return []; }
            if (!(sel instanceof Array)) { sel = [sel]; }
            return sel;
        }

        function requireCloseCommand() {
            var id = closeCommandId();
            if (!id) {
                lblStatus.text = "Could not find the File > Close command in this AE version.";
                return 0;
            }
            return id;
        }

        function stashAdd(comp) {
            try {
                var id = comp.id;
                for (var i = 0; i < stash.length; i++) {
                    if (stash[i].id === id) { return; }
                }
                stash.unshift({ id: id, name: comp.name });
                if (stash.length > STASH_LIMIT) { stash.length = STASH_LIMIT; }
            } catch (e) {}
        }

        /**
         * The open set is maintained as the panel works rather than rescanned.
         * Every close removes from it and every reopen adds back, so it stays
         * accurate for anything this panel did. Tabs opened or closed by hand
         * elsewhere in After Effects are invisible to it — that is what Rescan
         * is for.
         */
        function openAdd(comp) {
            if (indexOf(openComps, comp) === -1) { openComps.push(comp); }
        }

        function openRemove(comp) {
            var at = indexOf(openComps, comp);
            if (at !== -1) { openComps.splice(at, 1); }
        }

        function stashRemoveComp(comp) {
            try {
                var id = comp.id;
                for (var i = stash.length - 1; i >= 0; i--) {
                    if (stash[i].id === id) { stash.splice(i, 1); }
                }
            } catch (e) {}
        }

        /**
         * Determines exactly which comps are open by closing every tab and
         * immediately reopening them. After Effects offers no way to read the set
         * of open comps, and closing walks them one at a time, so a full close and
         * restore is the only way to observe it.
         *
         * Comps are stashed as they close and unstashed once reopened, so an
         * interrupted scan leaves them recoverable from the Closed tabs list
         * rather than simply gone.
         */
        function scanOpenTabs(cmdId) {
            var found = [];
            var guard = 0;

            while (guard < 3000) {
                var comp = activeComp();
                if (comp === null) { break; }
                try { comp.openInViewer(); } catch (e) {}
                if (!closeActive(cmdId)) { break; }
                found.push(comp);
                stashAdd(comp);
                guard++;
            }
            saveStash(stash);

            // Reverse order so the comp that was active ends up active again.
            for (var i = found.length - 1; i >= 0; i--) {
                try { found[i].openInViewer(); } catch (e) {}
                stashRemoveComp(found[i]);
            }
            saveStash(stash);

            return found;
        }

        function reopenComps(list_) {
            var opened = 0;
            each(list_, function (comp) {
                if (!comp || !isAlive(comp)) { return; }
                try {
                    if (comp.openInViewer()) { opened++; openAdd(comp); }
                } catch (e) {}
            });
            return opened;
        }

        function afterClose(closedCount, reopenedCount) {
            saveStash(stash);
            paintStash();
            summarise();
            lblStatus.text = "Closed " + closedCount + " tab(s)" +
                (reopenedCount ? ", reopened " + reopenedCount : "") +
                ". " + stash.length + " in the closed list.";
        }

        /* --- wiring: project comps --- */

        function pruneDead() {
            var live = [];
            each(ticked, function (c) { if (isAlive(c)) { live.push(c); } });
            ticked = live;

            var stillOpen = [];
            each(openComps, function (c) { if (isAlive(c)) { stillOpen.push(c); } });
            openComps = stillOpen;
        }

        btnRefresh.onClick = function () {
            comps = allComps();
            pruneDead();
            if (mode === "open" && openComps.length === 0) {
                btnScanOpen.onClick();
                return;
            }
            paintComps();
        };

        btnShowAll.onClick = function () {
            comps = allComps();
            mode = "all";
            pruneDead();
            paintComps();
        };

        btnScanOpen.onClick = function () {
            var cmdId = requireCloseCommand();
            if (!cmdId) { return; }

            lblStatus.text = "Reading open tabs\u2026";
            repaint();

            openComps = scanOpenTabs(cmdId);
            comps = allComps();
            mode = "open";
            pruneDead();

            paintComps();
            paintStash();
            lblStatus.text = "Found " + openComps.length + " open tab(s).";
        };

        txtFilter.onChanging = function () {
            if (comps.length > 0) { paintComps(); }
        };

        btnSelectShown.onClick = function () {
            suspend = true;
            for (var i = 0; i < list.items.length; i++) {
                list.items[i].selected = true;
            }
            suspend = false;
            syncFromSelection();
        };

        btnTickActive.onClick = function () {
            var c = activeComp();
            if (!c) {
                lblStatus.text = "No comp is active. Click a comp tab first.";
                return;
            }
            if (indexOf(comps, c) === -1) { comps = allComps(); }
            setTicked(c, true);
            paintComps();
            lblStatus.text = "Added \u201C" + c.name + "\u201D to the selection.";
        };

        btnClear.onClick = function () {
            ticked = [];
            suspend = true;
            for (var i = 0; i < list.items.length; i++) {
                list.items[i].selected = false;
                list.items[i].text = UNCHECKED;
            }
            suspend = false;
            summarise();
        };

        /** Highlighting rows is the tick — no separate step. */
        list.onChange = function () {
            syncFromSelection();
        };

        /** Double-click opens the comp, whether or not it was in the closed list. */
        list.onDoubleClick = function () {
            var rows = selectionOf(list);
            if (rows.length === 0) { return; }

            var picked = [];
            each(rows, function (row) { picked.push(row.comp); });

            var opened = reopenComps(picked);
            each(picked, function (c) { stashRemoveComp(c); });
            saveStash(stash);
            paintStash();
            summarise();
            lblStatus.text = "Opened " + opened + " comp(s).";
        };

        btnCloseTicked.onClick = function () {
            var cmdId = requireCloseCommand();
            if (!cmdId) { return; }
            if (ticked.length === 0) {
                lblStatus.text = "Select the comps you want closed first.";
                return;
            }

            lblStatus.text = "Closing\u2026";
            repaint();

            var closedCount = 0;
            each(ticked, function (comp) {
                if (closeOne(comp, cmdId)) {
                    stashAdd(comp);
                    openRemove(comp);
                    closedCount++;
                }
            });

            afterClose(closedCount, 0);
        };

        btnCloseButTicked.onClick = function () {
            var cmdId = requireCloseCommand();
            if (!cmdId) { return; }
            if (ticked.length === 0) {
                lblStatus.text = "Nothing selected \u2014 that would close everything. Use Close all instead.";
                return;
            }

            var keep = [];
            each(ticked, function (c) { if (isAlive(c)) { keep.push(c); } });

            if (!confirm("Close every open comp, then reopen the " + keep.length +
                " selected one(s)?\n\nEverything closed is added to the Closed tabs list.",
                false, SCRIPT_NAME)) { return; }

            lblStatus.text = "Closing\u2026";
            repaint();

            var closedCount = closeAll(cmdId, function (comp) {
                openRemove(comp);
                if (indexOf(keep, comp) === -1) { stashAdd(comp); }
            });
            var reopened = reopenComps(keep);

            afterClose(closedCount, reopened);
        };

        btnCloseAll.onClick = function () {
            var cmdId = requireCloseCommand();
            if (!cmdId) { return; }
            if (!confirm("Close every open comp tab?\n\nAll of them are added to the " +
                "Closed tabs list so you can reopen them.", false, SCRIPT_NAME)) { return; }

            lblStatus.text = "Closing\u2026";
            repaint();

            var closedCount = closeAll(cmdId, function (comp) {
                stashAdd(comp);
                openRemove(comp);
            });
            afterClose(closedCount, 0);
        };

        btnCloseOthers.onClick = function () {
            var cmdId = requireCloseCommand();
            if (!cmdId) { return; }

            var keep = activeComp();
            if (!keep) {
                lblStatus.text = "No comp is active. Click a comp tab first.";
                return;
            }

            lblStatus.text = "Closing\u2026";
            repaint();

            var closedCount = closeAll(cmdId, function (comp) {
                openRemove(comp);
                if (comp !== keep) { stashAdd(comp); }
            });
            var reopened = reopenComps([keep]);

            afterClose(closedCount, reopened);
        };

        /* --- wiring: closed tabs --- */

        function reopenEntries(entries, forget) {
            var opened = 0;
            var missing = 0;
            each(entries, function (entry) {
                var comp = compById(entry.id);
                if (!comp) { missing++; return; }
                try {
                    if (comp.openInViewer()) {
                        opened++;
                        openAdd(comp);
                        if (forget) {
                            var at = indexOf(stash, entry);
                            if (at !== -1) { stash.splice(at, 1); }
                        }
                    }
                } catch (e) {}
            });
            saveStash(stash);
            paintStash();
            summarise();
            lblStatus.text = "Reopened " + opened + " comp(s)" +
                (missing ? ", " + missing + " no longer in the project" : "") + ".";
        }

        btnReopen.onClick = function () {
            var rows = selectionOf(stashList);
            if (rows.length === 0) {
                lblStatus.text = "Select the comps you want reopened.";
                return;
            }
            var entries = [];
            each(rows, function (row) { entries.push(row.entry); });
            reopenEntries(entries, true);
        };

        btnReopenAll.onClick = function () {
            if (stash.length === 0) {
                lblStatus.text = "The closed list is empty.";
                return;
            }
            if (!confirm("Reopen all " + stash.length + " comp(s)?\n\n" +
                "That is a lot of tabs again.", false, SCRIPT_NAME)) { return; }
            reopenEntries(stash.slice(0), true);
        };

        btnForget.onClick = function () {
            var rows = selectionOf(stashList);
            each(rows, function (row) {
                var at = indexOf(stash, row.entry);
                if (at !== -1) { stash.splice(at, 1); }
            });
            saveStash(stash);
            paintStash();
            summarise();
        };

        btnForgetAll.onClick = function () {
            if (stash.length === 0) { return; }
            if (!confirm("Clear the closed list?\n\nThe comps themselves are untouched.",
                false, SCRIPT_NAME)) { return; }
            stash = [];
            saveStash(stash);
            paintStash();
            summarise();
        };

        stashList.onDoubleClick = function () {
            var rows = selectionOf(stashList);
            if (rows.length === 0) { return; }
            var entries = [];
            each(rows, function (row) { entries.push(row.entry); });
            reopenEntries(entries, true);
        };

        each([btnRefresh, btnScanOpen, btnShowAll, btnSelectShown, btnTickActive, btnClear,
              btnCloseTicked, btnCloseButTicked, btnCloseAll, btnCloseOthers,
              btnReopen, btnReopenAll, btnForget, btnForgetAll],
            function (btn) { btn.onClick = guard(btn.onClick); });
        list.onChange = guard(list.onChange);
        list.onDoubleClick = guard(list.onDoubleClick);
        stashList.onDoubleClick = guard(stashList.onDoubleClick);

        /* --- boot --- */
        stash = loadStash();
        paintStash();

        win.layout.layout(true);
        win.layout.resize();
        win.onResizing = win.onResize = function () { this.layout.resize(); };

        if (win instanceof Window) {
            win.center();
            win.show();
        }
        return win;
    }

    build(thisObj);
})(this);
