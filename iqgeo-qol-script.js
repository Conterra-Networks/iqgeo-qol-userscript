(function () {
    console.log("Conterra's IQGeo QOL Userscript Loaded");

    const iqgeoGreen = "#3CA22D";
    const HREF = window.location.href;
    const IS_LOGIN = HREF.includes("/login");
    const IS_CONFIG = HREF.includes("/config");
    const IS_MYWCOM = HREF.includes("/mywcom");
    const IS_APRIL_FOOLS = new Date().getMonth() === 3 && new Date().getDate() === 1; // April 1st (month is 0-indexed)
    const NOTIFICATION_POLL_MS = 300_000;
    const FEATURE_TOGGLES = [
        { label: "Auto Login", description: "Automatically uses OIDC login method", defaultState: "on", hidden: true },
        { label: "Design Changes", description: "Highlights pending splice changes in the current design", defaultState: "on", hidden: false },
        { label: "Details Popup", description: "View the active Details content in a draggable popup", defaultState: "on", hidden: false },
        { label: "Auto Terminations", description: "Automatically displays fiber terminations (and more) for segments", defaultState: "on", hidden: false },
        { label: "Restore Panel Width", description: "Remembers the left panel width across page reloads", defaultState: "on", hidden: false },
        { label: "Custom Add Object", description: "Displays Add Object menu in a horizontal layout", defaultState: "on", hidden: false },
        { label: "Notifications", description: "Polls for and displays system notifications", defaultState: "on", hidden: true },
        { label: "Error Monitor", description: "Displays a console for errors and network issues", defaultState: "on", hidden: true },
        { label: "Plugin Patches", description: "Applies monkey-patches/overrides to IQGeo app internals", defaultState: "on", hidden: true },
        { label: "Funny Day 🤪", description: "April Fools pranks", defaultState: "on", hidden: true } // Revealed in-menu only after all pranks have triggered
    ];
    // Features not included:
    // Splice Calc - Pending code removal
    // Better Splice Layout - Incomplete code causes unintended results

    // Debug logging configuration
    const DEBUG_CONFIG = {
        enabled: false,  // Master toggle - set to true to enable debug logging
        features: {
            'Terminations': false,
            'DesignChanges': false,
            'DetailsPopup': false,
            'ErrorMonitor': false,
            'PluginPatches': false,
            'SpliceCalc': false
        }
    };

    // Hybrid logging utility with per-feature control
    const logger = {
        _shouldLog: (feature, level) => {
            // A feature's own flag turns on its logging even with the master toggle off
            if (feature && DEBUG_CONFIG.features[feature] === true) return true;
            return DEBUG_CONFIG.enabled || level === 'error' || level === 'warn';
        },
        
        debug: (feature, ...args) => {
            if (logger._shouldLog(feature, 'debug')) {
                console.debug(`[${feature || 'QOL'}]`, ...args);
            }
        },
        
        log: (feature, ...args) => {
            if (logger._shouldLog(feature, 'log')) {
                console.log(`[${feature || 'QOL'}]`, ...args);
            }
        },
        
        info: (feature, ...args) => {
            console.info(`[${feature || 'QOL'}]`, ...args);
        },
        
        warn: (feature, ...args) => {
            console.warn(`[${feature || 'QOL'}]`, ...args);
        },
        
        error: (feature, ...args) => {
            console.error(`[${feature || 'QOL'}]`, ...args);
        }
    };

    // Expose to window for runtime debugging
    if (typeof window !== 'undefined') {
        window.qolDebug = DEBUG_CONFIG;
    }

    // ─── Hover Highlight Color Preferences ───────────────────────────────────────
    const HIGHLIGHT_COLORS_KEY = 'qol-highlight-colors';
    const HIGHLIGHT_COLORS_DEFAULTS = {
        color1: { enabled: false, value: '#FF0000', weight: 4, opacity: 0.75 },
        color2: { enabled: false, value: '#0000FF', weight: 4, opacity: 0.75 }
    };

    let _highlightColorsCache = null;

    function loadHighlightColors() {
        if (_highlightColorsCache) return _highlightColorsCache;
        try {
            const stored = localStorage.getItem(HIGHLIGHT_COLORS_KEY);
            if (!stored) {
                _highlightColorsCache = {
                    color1: { ...HIGHLIGHT_COLORS_DEFAULTS.color1 },
                    color2: { ...HIGHLIGHT_COLORS_DEFAULTS.color2 }
                };
            } else {
                const parsed = JSON.parse(stored);
                _highlightColorsCache = {
                    color1: { ...HIGHLIGHT_COLORS_DEFAULTS.color1, ...parsed.color1 },
                    color2: { ...HIGHLIGHT_COLORS_DEFAULTS.color2, ...parsed.color2 }
                };
            }
        } catch (e) {
            _highlightColorsCache = {
                color1: { ...HIGHLIGHT_COLORS_DEFAULTS.color1 },
                color2: { ...HIGHLIGHT_COLORS_DEFAULTS.color2 }
            };
        }
        return _highlightColorsCache;
    }

    function saveHighlightColors(colors) {
        try {
            localStorage.setItem(HIGHLIGHT_COLORS_KEY, JSON.stringify(colors));
            _highlightColorsCache = null; // invalidate cache after save
        } catch (e) {
            console.error('[userscript] Failed to save highlight colors:', e);
        }
    }

    // Debounced tree refresh - called after any highlight pref change so the
    // new colors bake in without the user having to navigate away and back.
    let _refreshEquipTreeTimer = null;
    function refreshEquipmentTree() {
        clearTimeout(_refreshEquipTreeTimer);
        _refreshEquipTreeTimer = setTimeout(() => {
            try {
                const ev = window.myw?.app?.plugins?.equipmentTree?.treeView;
                if (ev?.feature) ev.refreshFor(ev.feature).catch(() => {});
                const ct = window.myw?.app?.plugins?.cableTree;
                if (ct) {
                    ['structCableTreeView', 'routeTreeView'].forEach(key => {
                        const ctv = ct[key];
                        if (ctv?.feature) ctv.refreshFor(ctv.feature).catch(() => {});
                    });
                }
            } catch (e) {
                // silently ignore if trees not available
            }
        }, 150);
    }

    // Apply geomRepFor highlight color override to any PinFeatureTreeView instance.
    // Shared helper used for both equipmentTree.treeView and cableTree views.
    function applyGeomRepForPatch(treeView) {
        if (!treeView || treeView.__geomRepForPatched) return;
        const origGeomRepFor = treeView.geomRepFor.bind(treeView);
        treeView.geomRepFor = function (feature, geom, id, color, style) {
            const rep = origGeomRepFor(feature, geom, id, color, style);
            const prefs = loadHighlightColors();
            const role = color == null ? 'color1' : 'color2';
            const pref = prefs[role];
            if (pref.enabled) {
                rep.color = pref.value;
                if (rep.style) {
                    rep.style.color = pref.value;
                    rep.style.weight = pref.weight;
                    rep.style.opacity = pref.opacity;
                }
            }
            return rep;
        };
        Object.defineProperty(treeView, '__geomRepForPatched', { value: true });
        // If the tree was already built before this patch fired, force a rebuild.
        if (treeView.feature) refreshEquipmentTree();
    }
    // ─────────────────────────────────────────────────────────────────────────────

    const featureManager = (() => {
        const STORAGE_KEY = "qol-features";
        const states = {};
        const features = {};
        const defaults = {};
        let onChange = null;
        let initialized = false;

        // Load all states from unified localStorage object
        function loadAllStates() {
            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                return stored ? JSON.parse(stored) : {};
            } catch (e) {
                console.error("[featureManager] Failed to load states from localStorage:", e);
                return {};
            }
        }

        // Save all states to unified localStorage object
        function saveAllStates() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
            } catch (e) {
                console.error("[featureManager] Failed to save states to localStorage:", e);
            }
        }

        // Migrate old localStorage keys to new unified structure
        function migrateOldKeys() {
            let migrated = false;
            Object.keys(defaults).forEach(label => {
                const oldKey = `qol-menu_${label}`;
                const oldValue = localStorage.getItem(oldKey);
                if (oldValue) {
                    // Only migrate if no new state exists
                    if (!states[label]) {
                        states[label] = oldValue;
                        migrated = true;
                        console.log(`[featureManager] Migrated ${oldKey} -> ${STORAGE_KEY}.${label}`);
                    }
                    // Always clean up old key
                    localStorage.removeItem(oldKey);
                }
            });
            if (migrated) {
                saveAllStates();
            }
        }

        function notify(label, state) {
            if (onChange) {
                onChange(label, state);
            }
        }

        function register(label, handlers = {}, options = {}) {
            const { defaultState = "on", hidden = false } = options;
            
            // Warn about duplicate registration
            if (features[label]) {
                console.warn(`[featureManager] Feature "${label}" already registered - overwriting`);
            }
            
            // Store default and metadata
            defaults[label] = defaultState;
            
            // Store handlers
            features[label] = {
                start: handlers.start,
                stop: handlers.stop,
                hidden: hidden,
            };
        }

        function setState(label, state) {
            if (!features[label]) {
                console.warn(`[featureManager] Attempted to set state for unregistered feature: ${label}`);
                return;
            }
            
            // Validate state parameter
            if (state !== "on" && state !== "off") {
                console.error(`[featureManager] State must be "on" or "off", got: ${state}`);
                return;
            }
            
            if (states[label] === state) {
                return;
            }
            
            const oldState = states[label];
            states[label] = state;
            saveAllStates();
            
            try {
                if (state === "on") {
                    features[label]?.start?.();
                } else {
                    features[label]?.stop?.();
                }
            } catch (e) {
                console.error(`[featureManager] Error toggling feature "${label}":`, e);
                // Rollback state on error
                states[label] = oldState;
                saveAllStates();
                // Notify UI of rollback
                notify(label, oldState);
                return;
            }
            
            notify(label, state);
        }

        function toggle(label) {
            const nextState = states[label] === "on" ? "off" : "on";
            setState(label, nextState);
        }

        function validateConfiguration() {
            const issues = [];
            
            Object.entries(features).forEach(([label, feature]) => {
                const defaultState = defaults[label];
                const isHidden = feature.hidden;
                
                // Check for hidden features defaulted to off
                if (isHidden && defaultState === "off") {
                    issues.push({
                        severity: "warn",
                        feature: label,
                        message: "Hidden feature defaulted to 'off' - user cannot enable it"
                    });
                }
                
                // Check for missing handlers
                if (!feature.start && !feature.stop) {
                    issues.push({
                        severity: "info",
                        feature: label,
                        message: "No start/stop handlers registered"
                    });
                }
            });
            
            return issues;
        }

        function init() {
            if (initialized) {
                console.warn("[featureManager] init() called multiple times - ignoring");
                return;
            }
            initialized = true;
            
            // Load stored states
            const storedStates = loadAllStates();
            
            // Migrate old localStorage format if needed
            Object.assign(states, storedStates);
            migrateOldKeys();
            
            // Initialize states for all registered features
            Object.keys(features).forEach(label => {
                if (states[label] === undefined) {
                    states[label] = defaults[label] || "on";
                }
            });
            
            // Save initialized states
            saveAllStates();
            
            // Validate configuration and log issues
            const issues = validateConfiguration();
            if (issues.length > 0) {
                console.group("[featureManager] Configuration Issues");
                issues.forEach(issue => {
                    const logFn = issue.severity === "warn" ? console.warn : console.info;
                    logFn(`[${issue.severity.toUpperCase()}] ${issue.feature}: ${issue.message}`);
                });
                console.groupEnd();
            }
            
            // Log all feature states on startup
            console.group("[featureManager] Feature States on Load");
            Object.entries(features).forEach(([label, feature]) => {
                const state = states[label];
                const defaultState = defaults[label];
                const hidden = feature.hidden ? " [HIDDEN]" : "";
                console.log(`  ${label}${hidden}: ${state} (default: ${defaultState})`);
            });
            console.groupEnd();
            
            // Start enabled features
            Object.entries(features).forEach(([label, handlers]) => {
                if (states[label] === "on") {
                    try {
                        handlers.start?.();
                    } catch (e) {
                        console.error(`[featureManager] Error starting feature "${label}":`, e);
                    }
                }
            });
            
            // Notify UI of initial states
            Object.entries(states).forEach(([label, state]) => notify(label, state));
        }

        function onStateChange(cb) {
            onChange = cb;
        }

        function isEnabled(label) {
            return states[label] === "on";
        }

        function getState(label) {
            return states[label];
        }

        function getAllStates() {
            return { ...states };
        }

        function getAllFeatures() {
            return Object.keys(features).map(label => ({
                label,
                state: states[label],
                defaultState: defaults[label],
                hidden: features[label].hidden
            }));
        }

        return {
            register,
            setState,
            toggle,
            init,
            onStateChange,
            isEnabled,
            getState,
            getAllStates,
            getAllFeatures,
        };
    })();

    // Expose feature controls to window after featureManager is defined
    if (typeof window !== 'undefined') {
        window.qolFeatures = {
            // Get all feature names and their states
            list: () => {
                const features = featureManager.getAllFeatures();
                console.table(features);
                return features;
            },
            // Toggle a feature on/off
            toggle: (label) => {
                featureManager.toggle(label);
                console.log(`[qolFeatures] Toggled "${label}" to: ${featureManager.getState(label)}`);
            },
            // Set a feature to specific state
            set: (label, state) => {
                if (state !== "on" && state !== "off") {
                    console.error(`[qolFeatures] State must be "on" or "off", got: ${state}`);
                    return;
                }
                featureManager.setState(label, state);
                console.log(`[qolFeatures] Set "${label}" to: ${state}`);
            },
            // Get current state of a feature
            get: (label) => {
                return featureManager.getState(label);
            },
            // Check if a feature is enabled
            isEnabled: (label) => {
                return featureManager.isEnabled(label);
            },
            // Help text
            help: () => {
                console.log([
                    "[qolFeatures] Available Commands:",
                    "  qolFeatures.list()              - Show all features and their states",
                    "  qolFeatures.toggle(\"Feature\")   - Toggle a feature on/off",
                    "  qolFeatures.set(\"Feature\", \"on\") - Set feature to \"on\" or \"off\"",
                    "  qolFeatures.get(\"Feature\")      - Get current state",
                    "  qolFeatures.isEnabled(\"Feature\") - Check if feature is enabled",
                    "  qolFeatures.help()              - Show this help",
                    "",
                    "Example:",
                    "  qolFeatures.toggle(\"Error Monitor\")",
                    "  qolFeatures.set(\"Plugin Patches\", \"off\")"
                ].join("\n"));
            }
        };
    }

    // credit: https://github.com/Tampermonkey/tampermonkey/issues/1279#issuecomment-875386821
    // Executes callback only after an element matching readySelector has been added to the page
    // Example: runWhenReady('.search-result', augmentSearchResults);
    function runWhenReady(readySelector, callback) {
        var numAttempts = 0;
        var tryNow = function () {
            //console.log('runAtempt: ' + numAttempts);
            var elem = document.querySelector(readySelector);
            if (elem) {
                callback(elem);
            } else {
                numAttempts++;
                if (numAttempts >= 34) {
                    console.warn(
                        "Giving up after 34 attempts. Could not find: " +
                            readySelector
                    );
                } else {
                    setTimeout(tryNow, 250 * Math.pow(1.1, numAttempts));
                }
            }
        };
        tryNow();
    }

    function createMenu() {
        // Create the style element for CSS
        var style = document.createElement("style");
        style.innerHTML = `
        .qol-menu {
            background-color: #3ca22d; /* Add background color to the main Toggle Menu button */
            border: none; /* Remove the button border */
            margin: 25px; /* Use margins for better positioning */
            padding: 5px 10px; /* Add padding for better visual appearance */
            cursor: pointer; /* Change cursor on hover */
            color: #fff; /* Change button text color */
        }

        /* Anchor the wrapper to the right side of the header via absolute positioning so it
           cannot be displaced by the toolbar regardless of CSS reflow timing during resize. */
        #header-content {
            position: relative;
        }
        .qol-header-wrapper {
            position: absolute;
            right: 0;
            top: 0;
            height: 100%;
            display: flex;
            align-items: center;
        }

        .floating-menu {
            position: fixed;
            top: 52px;
            right: 160px;
            width: 190px;
            background-color: #f1f1f1;
            border: 1px solid #999;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            padding: 10px 12px;
            z-index: 9999; /* Ensure the menu appears above other elements */
        }
        
        .floating-menu .toggle-item {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
            padding: 2px 0;
        }

        .floating-menu .toggle-item:last-child {
            margin-bottom: 0;
        }
        
        .floating-menu .toggle-label {
            font-size: 13px;
            color: #333;
            cursor: pointer;
            user-select: none;
            flex: 1;
        }
        
        /* Toggle switch styling */
        .toggle-switch {
            position: relative;
            display: inline-block;
            width: 38px;
            height: 20px;
            margin-right: 8px;
            flex-shrink: 0;
        }
        
        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        
        .toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: 0.3s;
            border-radius: 20px;
        }
        
        .toggle-slider:before {
            position: absolute;
            content: "";
            height: 14px;
            width: 14px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: 0.3s;
            border-radius: 50%;
        }
        
        .toggle-switch input:checked + .toggle-slider {
            background-color: #3ca22d;
        }
        
        .toggle-switch input:checked + .toggle-slider:before {
            transform: translateX(18px);
        }
        
        .toggle-switch input:disabled + .toggle-slider {
            cursor: not-allowed;
            opacity: 0.5;
        }

        /* Splice row alignment */
        #related-equipment-tree-container {
            --qol-splice-main: auto;
        }
        #related-equipment-tree-container .jstree-anchor {
            display: inline-block;
        }
        #related-equipment-tree-container .jstree-anchor .qol-splice-row {
            display: grid;
            grid-template-columns: var(--qol-splice-main, auto) auto;
            align-items: center;
            column-gap: 8px;
        }
        #related-equipment-tree-container .jstree-anchor .qol-splice-main {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
        }
        #related-equipment-tree-container .jstree-anchor .design-link {
            margin-left: 8px;
            display: inline-block;
            color: #20b94b;
            font-size: 12px;
        }
        #related-equipment-tree-container .jstree-anchor .fiber-colors {
            display: inline-flex;
            align-items: center;
            gap: 2px;
        }
        #related-equipment-tree-container .jstree-anchor .qol-splice-right {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            justify-content: flex-end;
            justify-self: end;
        }

        /* April Fools completion toast */
        @keyframes qol-toast-in {
            from { opacity: 0; transform: translateX(-50%) translateY(16px); }
            to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes qol-toast-out {
            from { opacity: 1; transform: translateX(-50%) translateY(0); }
            to   { opacity: 0; transform: translateX(-50%) translateY(16px); }
        }
        .qol-toast {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: #f1f1f1;
            border: 1px solid #999;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
            padding: 10px 18px 10px 18px;
            border-radius: 4px;
            font-size: 13px;
            color: #333;
            z-index: 10001;
            white-space: normal;
            pointer-events: auto;
            cursor: default;
            display: flex;
            align-items: center;
            gap: 12px;
            animation: qol-toast-in 0.35s ease forwards;
        }
        .qol-toast.qol-toast-dismissing {
            animation: qol-toast-out 0.3s ease forwards;
        }
        .qol-toast-close {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 15px;
            line-height: 1;
            color: #888;
            padding: 0;
            flex-shrink: 0;
        }
        .qol-toast-close:hover {
            color: #333;
        }

        /* Hover highlight color picker section */
        .qol-color-section {
            border-top: 1px solid #ccc;
            margin-top: 8px;
            padding-top: 8px;
        }
        .qol-color-heading {
            font-size: 11px;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 6px;
        }
        .qol-color-row {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 4px;
        }
        .qol-color-enable {
            flex-shrink: 0;
            cursor: pointer;
        }
        .qol-color-label {
            font-size: 13px;
            color: #333;
            cursor: pointer;
            user-select: none;
            flex: 1;
        }
        .qol-color-swatch {
            width: 28px;
            height: 20px;
            padding: 1px 2px;
            border: 1px solid #999;
            border-radius: 3px;
            cursor: pointer;
            flex-shrink: 0;
        }
        .qol-color-swatch:disabled {
            opacity: 0.35;
            cursor: default;
        }
        .qol-color-gear {
            background: none;
            border: none;
            padding: 0 2px;
            font-size: 13px;
            color: #111;
            cursor: pointer;
            line-height: 1;
            flex-shrink: 0;
            transition: color 0.15s, transform 0.2s;
        }
        .qol-color-gear:hover {
            color: #444;
        }
        .qol-color-gear.open {
            color: #3ca22d;
            transform: rotate(45deg);
        }
        .qol-color-detail {
            display: none;
            flex-direction: column;
            gap: 4px;
            padding: 2px 0 6px 20px;
        }
        .qol-color-detail.open {
            display: flex;
        }
        .qol-color-slider-row {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .qol-color-detail-label {
            font-size: 11px;
            color: #888;
            white-space: nowrap;
            flex-shrink: 0;
        }
        .qol-color-slider {
            width: 70px;
            min-width: 0;
            flex-shrink: 1;
            cursor: pointer;
            accent-color: #3ca22d;
        }
        .qol-color-slider:disabled {
            opacity: 0.4;
            cursor: default;
        }
        .qol-color-slider-val {
            font-size: 11px;
            color: #555;
            white-space: nowrap;
            width: 28px;
            text-align: right;
            flex-shrink: 0;
        }
        `;

        // Append the style element to the document head
        document.head.appendChild(style);

        // Find the header content element
        var headerContent = document.getElementById("header-content");

        // Create the button element
        var button = document.createElement("button");
        button.innerHTML = "Conterra QOL ⚙";
        button.classList.add("qol-menu");
        button.title = "Toggle Quality of Life Features";

        // Add event listener to toggle menu visibility
        button.addEventListener("click", function (e) {
            e.stopPropagation();
            if (menu.style.display === "none") {
                menu.style.display = "block";
            } else {
                menu.style.display = "none";
            }
        });

        // Close menu when clicking anywhere outside it
        document.addEventListener("click", function (e) {
            if (menu.style.display !== "none" && !menu.contains(e.target)) {
                menu.style.display = "none";
            }
        });

        // Create the menu element
        var menu = document.createElement("div");
        menu.classList.add("floating-menu"); // Add the 'floating-menu' class
        menu.style.display = "none"; // Hide the menu by default

        FEATURE_TOGGLES.filter(f => !f.hidden).forEach((feature) => {
            menu.appendChild(createToggleButton(feature));
        });

        // Hover highlight color pickers
        (function () {
            const section = document.createElement('div');
            section.classList.add('qol-color-section');

            const heading = document.createElement('div');
            heading.classList.add('qol-color-heading');
            heading.textContent = 'Hover highlight colors';
            section.appendChild(heading);

            const colorDefs = [
                { key: 'color1', label: 'Primary', id: 'qol-hl-1' },
                { key: 'color2', label: 'Secondary', id: 'qol-hl-2' }
            ];

            const colors = loadHighlightColors();
            colorDefs.forEach(function (def) {
                // Main row: checkbox – label – color swatch – gear
                const row = document.createElement('div');
                row.classList.add('qol-color-row');

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = def.id + '-enable';
                checkbox.classList.add('qol-color-enable');
                checkbox.checked = colors[def.key].enabled;
                checkbox.title = 'Enable custom highlight color';

                const lbl = document.createElement('label');
                lbl.classList.add('qol-color-label');
                lbl.htmlFor = def.id + '-color';
                lbl.textContent = def.label;

                const picker = document.createElement('input');
                picker.type = 'color';
                picker.id = def.id + '-color';
                picker.classList.add('qol-color-swatch');
                picker.value = colors[def.key].value;
                picker.disabled = !colors[def.key].enabled;
                picker.title = def.label + ' highlight color';

                const gearBtn = document.createElement('button');
                gearBtn.type = 'button';
                gearBtn.classList.add('qol-color-gear');
                gearBtn.textContent = '⚙';
                gearBtn.title = 'Width & Opacity';

                row.appendChild(checkbox);
                row.appendChild(lbl);
                row.appendChild(picker);
                row.appendChild(gearBtn);

                // Detail panel: Width and Opacity sliders (hidden until gear clicked)
                const detail = document.createElement('div');
                detail.classList.add('qol-color-detail');

                // Width slider row
                const widthRow = document.createElement('div');
                widthRow.classList.add('qol-color-slider-row');

                const widthLbl = document.createElement('label');
                widthLbl.classList.add('qol-color-detail-label');
                widthLbl.htmlFor = def.id + '-weight';
                widthLbl.textContent = 'Width:';

                const weightInput = document.createElement('input');
                weightInput.type = 'range';
                weightInput.id = def.id + '-weight';
                weightInput.classList.add('qol-color-slider');
                weightInput.value = colors[def.key].weight;
                weightInput.min = '1';
                weightInput.max = '12';
                weightInput.step = '1';
                weightInput.disabled = !colors[def.key].enabled;
                weightInput.title = 'Line width (1–12 px)';

                const widthVal = document.createElement('span');
                widthVal.classList.add('qol-color-slider-val');
                widthVal.textContent = colors[def.key].weight;

                widthRow.appendChild(widthLbl);
                widthRow.appendChild(weightInput);
                widthRow.appendChild(widthVal);

                // Opacity slider row
                const opacityRow = document.createElement('div');
                opacityRow.classList.add('qol-color-slider-row');

                const opacityLbl = document.createElement('label');
                opacityLbl.classList.add('qol-color-detail-label');
                opacityLbl.htmlFor = def.id + '-opacity';
                opacityLbl.textContent = 'Opacity:';

                // Slider works in whole % steps (0–100); stored value is divided by 100
                const opacityInput = document.createElement('input');
                opacityInput.type = 'range';
                opacityInput.id = def.id + '-opacity';
                opacityInput.classList.add('qol-color-slider');
                opacityInput.value = Math.round(colors[def.key].opacity * 100);
                opacityInput.min = '0';
                opacityInput.max = '100';
                opacityInput.step = '5';
                opacityInput.disabled = !colors[def.key].enabled;
                opacityInput.title = 'Opacity';

                const opacityVal = document.createElement('span');
                opacityVal.classList.add('qol-color-slider-val');
                opacityVal.textContent = Math.round(colors[def.key].opacity * 100) + '%';

                opacityRow.appendChild(opacityLbl);
                opacityRow.appendChild(opacityInput);
                opacityRow.appendChild(opacityVal);

                detail.appendChild(widthRow);
                detail.appendChild(opacityRow);

                gearBtn.addEventListener('click', function () {
                    const open = detail.classList.toggle('open');
                    gearBtn.classList.toggle('open', open);
                });

                checkbox.addEventListener('change', function () {
                    const on = this.checked;
                    picker.disabled = !on;
                    weightInput.disabled = !on;
                    opacityInput.disabled = !on;
                    const current = loadHighlightColors();
                    current[def.key].enabled = on;
                    saveHighlightColors(current);
                    refreshEquipmentTree();
                });

                // Use 'change' (fires when picker closes) not 'input' (fires on every
                // drag step) - colors bake at tree-build time so live preview isn't
                // possible, and 'input' would trigger excessive tree rebuilds.
                picker.addEventListener('change', function () {
                    const current = loadHighlightColors();
                    current[def.key].value = this.value;
                    saveHighlightColors(current);
                    refreshEquipmentTree();
                });

                weightInput.addEventListener('input', function () {
                    widthVal.textContent = this.value;
                });
                weightInput.addEventListener('change', function () {
                    const current = loadHighlightColors();
                    current[def.key].weight = parseInt(this.value, 10);
                    saveHighlightColors(current);
                    refreshEquipmentTree();
                });

                opacityInput.addEventListener('input', function () {
                    opacityVal.textContent = this.value + '%';
                });
                opacityInput.addEventListener('change', function () {
                    const current = loadHighlightColors();
                    current[def.key].opacity = parseInt(this.value, 10) / 100;
                    saveHighlightColors(current);
                    refreshEquipmentTree();
                });

                section.appendChild(row);
                section.appendChild(detail);
            });

            menu.appendChild(section);
        })();

        // Insert the menu just after the header content
        headerContent.parentNode.insertAdjacentElement("afterend", menu);

        // Create the wrapper div
        var wrapperDiv = document.createElement("div");
        wrapperDiv.classList.add("right"); // Add the 'right' class
        wrapperDiv.classList.add("qol-header-wrapper"); // Marker class for width measurement

        // Find the logo element
        var logo = document.querySelector(".logo-large");

        // Add the button to the wrapper div
        wrapperDiv.appendChild(button);

        // Insert the wrapper div before the logo
        headerContent.insertBefore(wrapperDiv, logo);

        // Move the logo inside the wrapper div
        wrapperDiv.appendChild(logo);

        // Function to create a toggle switch
        function createToggleButton(feature) {
            var container = document.createElement("div");
            container.classList.add("toggle-item");
            
            var toggleSwitch = document.createElement("label");
            toggleSwitch.classList.add("toggle-switch");
            
            var input = document.createElement("input");
            input.type = "checkbox";
            input.id = "toggle-" + feature.label.replace(/\s+/g, "-").toLowerCase();
            input.checked = true; // Set the initial state to 'On'
            
            var slider = document.createElement("span");
            slider.classList.add("toggle-slider");
            
            // Add event listener to toggle the feature state
            input.addEventListener("change", function () {
                featureManager.toggle(feature.label);
            });
            
            toggleSwitch.appendChild(input);
            toggleSwitch.appendChild(slider);
            
            var label = document.createElement("label");
            label.classList.add("toggle-label");
            label.textContent = feature.label;
            label.title = feature.description;
            label.htmlFor = "toggle-" + feature.label.replace(/\s+/g, "-").toLowerCase();
            
            container.appendChild(toggleSwitch);
            container.appendChild(label);
            
            return container;
        }

        featureManager.onStateChange(updateToggleButton);
        setToggleStates();

        function updateToggleButton(label, state) {
            var toggleInput = getToggleInputByLabel(label);
            if (toggleInput) {
                toggleInput.checked = (state === "on");
            }
        }

        function setToggleStates() {
            FEATURE_TOGGLES.filter(f => !f.hidden).forEach((feature) => {
                updateToggleButton(feature.label, featureManager.getState(feature.label));
            });
        }

        function getToggleInputByLabel(label) {
            var inputId = "toggle-" + label.replace(/\s+/g, "-").toLowerCase();
            return document.getElementById(inputId);
        }

        // Patch the toolbar control's addButtons method so the overflow chevron fires sooner,
        // reserving space for the QOL menu button and logo on the right side of the header.
        // The existing window resize handler in ToolbarControl calls this.addButtons() on the
        // instance, so patching the instance method is enough to cover all future resizes.
        function patchToolbarAvailableWidth() {
            var attempts = 0;
            var maxAttempts = 10;
            function tryPatch() {
                var tc = window.myw?.app?.layout?.controls?.toolbar;
                if (!tc) {
                    attempts++;
                    if (attempts < maxAttempts) {
                        setTimeout(tryPatch, 200);
                    } else {
                        console.warn('[userscript] Could not patch toolbar width: toolbar control not found');
                    }
                    return;
                }

                // Walk two prototype hops (instance -> ToolbarControl.prototype -> Control.prototype)
                // to reach Control.prototype.addButtons, which is what the original super.addButtons() call resolves to.
                var superAddButtons = Object.getPrototypeOf(Object.getPrototypeOf(tc)).addButtons;
                if (typeof superAddButtons !== 'function') {
                    console.warn('[userscript] Could not patch toolbar width: Control.prototype.addButtons not found');
                    return;
                }

                // Cached once: the wrapper has a fixed size and re-measuring mid-resize
                // risks reading a stale value while the toolbar DOM is being rebuilt.
                var cachedRightSideWidth = null;

                tc.addButtons = function () {
                    var searchControl = this.app.layout.controls.search;
                    var searchBarWidth = searchControl?.$el
                        ? this.app.layout.controls.search.$el.outerWidth()
                        : 0;

                    if (cachedRightSideWidth === null) {
                        var wrapper = document.querySelector('.qol-header-wrapper');
                        cachedRightSideWidth = wrapper ? wrapper.offsetWidth : ($('#logo').outerWidth() || 0);
                    }

                    var availableWidth = $(window).width() - searchBarWidth - cachedRightSideWidth;
                    superAddButtons.call(this, this.$el, this.options.buttons, {}, availableWidth, 46);
                };

                // Recalculate immediately so the correction takes effect without waiting for a resize.
                tc.addButtons();
            }
            tryPatch();
        }

        if (window.myw?.appReady) {
            window.myw.appReady.then(patchToolbarAvailableWidth);
        }
    }
    if (IS_MYWCOM) {
        runWhenReady("#map_canvas", createMenu);
    }

    function isToggleButtonOn(label) {
        return featureManager.isEnabled(label);
    }

    function handleAutoLogin() {
        if (window.location.href.indexOf("/login") != -1) {
            if (isToggleButtonOn("Auto Login")) {
                console.log("Login page found. Redirecting..");
                window.location.href = window.location.href.replace(
                    "/login",
                    "/auth/sso/myw_oidc_auth_engine"
                ); // using replace maintains sub domains
            }
        }
    }

    function runConfigEnhancements() {
        // Placeholder for /config-specific tweaks
        console.info("[userscript] /config enhancements not yet implemented");
    }

    // Admin notifications poller (for /mywcom)
    let notificationsTimer = null;
    function startNotificationsPoll() {
        if (notificationsTimer) return;
        const tick = async () => {
            try {
                await window.myw?.app?.plugins?.adminNotifications?.showNewNotifications?.();
            } catch (err) {
                // silently ignore errors if plugin is unavailable
            }
        };
        tick();
        notificationsTimer = setInterval(tick, NOTIFICATION_POLL_MS);
    }
    function stopNotificationsPoll() {
        if (notificationsTimer) {
            clearInterval(notificationsTimer);
            notificationsTimer = null;
        }
    }

    // What: remove ability to expand Slack in 'Connect Cables' dialog
    // Why:  to avoid unintentional splice connection
    // $("#myWorldApp").on("click", $("a[aria-expanded='true']").siblings(".jstree-ocl"),
    //     function() {
    //         $("a:contains('Slack')").siblings(".jstree-ocl").remove();
    //     }
    // );

    // Intercept XHR/fetch requests (dynamic content workaround)
    const oldXHR = window.XMLHttpRequest.prototype.open;
    let xhrInterceptEnabled = false;
    let xhrInterceptUsers = 0;
    let interceptPaused = 0;
    const QOL_OWN_REQUEST = 'qolOwnRequest'; // fetch init flag; fetch ignores unknown init keys

    function enableXhrIntercept() {
        xhrInterceptUsers++;
        xhrInterceptEnabled = xhrInterceptUsers > 0;
    }

    function disableXhrIntercept() {
        xhrInterceptUsers = Math.max(0, xhrInterceptUsers - 1);
        xhrInterceptEnabled = xhrInterceptUsers > 0;
    }

    // eslint-disable-next-line no-unused-vars -- kept for the commented-out manhole intercept below
    function withInterceptPaused(fn) {
        interceptPaused++;
        let result;
        let isPromise = false;
        try {
            result = fn();
            isPromise =
                result && typeof result.then === "function" && typeof result.finally === "function";
            if (isPromise) {
                return result.finally(() => {
                    interceptPaused = Math.max(0, interceptPaused - 1);
                });
            }
            return result;
        } finally {
            if (!isPromise) {
                interceptPaused = Math.max(0, interceptPaused - 1);
            }
        }
    }

    function handleInterceptedResponse(url, responseText) {
        let match = null;

        // Limit to same origin and skip when paused
        if (interceptPaused > 0) {
            return;
        }
        let normalizedUrl;
        try {
            normalizedUrl = new URL(url, window.location.origin);
            if (normalizedUrl.hostname !== window.location.hostname) {
                return;
            }
        } catch {
            return;
        }

        try {
            // DEPRECATED: XHR intercept for manhole structure (Design Changes feature)
            // Now handled by patchAddPinConnectionInfo in Plugin Patches
            /*
            match = normalizedUrl.pathname.match(/\/structure\/manhole\/(\d+)\/contents/);
            if (match && featureManager.isEnabled("Design Changes")) {
                withInterceptPaused(() => featurePendingSpliceChanges.processManholeData(url));
                return;
            }
            */

            // Check URL for route contents
            const regexRouteContents = /\/modules\/comms\/route\/.*\/(\d+)\/contents/;
            match = normalizedUrl.pathname.match(regexRouteContents);
            if (match && featureManager.isEnabled("Auto Terminations")) {
                try {
                    const data = JSON.parse(responseText);
                    if (data) {
                        featureBetterTerminations.getRouteSegments(data);
                    }
                } catch (error) {
                    console.error(error);
                }
                return;
            }

            // Check URL for segment terminations (user clicked to run manually)
            const regexSegmentTerms = /\/modules\/comms\/fiber\/paths\/(mywcom_fiber_segment\/\d+)/;
            match = normalizedUrl.pathname.match(regexSegmentTerms);
            if (match && featureManager.isEnabled("Auto Terminations")) {
                const segment = match[1];
                const data = JSON.parse(responseText);
                featureBetterTerminations.getSegment({ segment: segment, interceptedData: data }, true);
                return;
            }
        } catch (error) {
            console.error(error);
        }
    }

    function createXhrListener(url) {
        return function () {
            // Continue only if request is complete
            if (this.readyState !== 4) {
                return;
            }
            if (!xhrInterceptEnabled || interceptPaused > 0) {
                return;
            }
            // Skip non-successful responses (e.g., 500 error pages with HTML)
            if (this.status !== 200) {
                return;
            }
            handleInterceptedResponse(this.responseURL, this.responseText);
        };
    }

    if (IS_MYWCOM) {
        window.XMLHttpRequest.prototype.open = function (method, url, async) {
            if (this.xhrListener) {
                this.removeEventListener("readystatechange", this.xhrListener);
            }
            oldXHR.apply(this, arguments);
            if (xhrInterceptEnabled && interceptPaused === 0) {
                this.xhrListener = createXhrListener(url);
                this.addEventListener("readystatechange", this.xhrListener);
            }
        };

        // Fetch interception to catch additional requests not using XHR
        const origFetchIntercept = window.fetch;
        window.fetch = function (...args) {
            // The script's own requests are tagged (QOL_OWN_REQUEST) so they aren't treated as IQGeo's
            const ownRequest = args[1]?.[QOL_OWN_REQUEST] === true;
            return origFetchIntercept.apply(this, args).then((res) => {
                // Skip non-successful responses (e.g., 500 error pages with HTML)
                if (!ownRequest && xhrInterceptEnabled && interceptPaused === 0 && res.ok) {
                    const url = res?.url || args[0];
                    res.clone()
                        .text()
                        .then((text) => {
                            handleInterceptedResponse(url, text);
                        })
                        .catch(() => {
                            /* ignore parse errors */
                        });
                }
                return res;
            });
        };
    }

    // Feature - Pending Splice Changes (DEPRECATED - Migrated to Plugin Patches)
    // What: indicate splice changes of current design
    // Why:  proposed changes of an open design appear the same as published changes which can cause confusion
    // How:  XHR listener to intercept splice details when a structure containing splices is selected
    //       Mutation Observer to add pending splice count to cable groups header
    //       Click event listener to update style of pending splices when splice list is toggled
    // MIGRATION: This feature is now integrated into pluginOverridesFeature (patchAddPinConnectionInfo)
    // TODO: Remove after stable migration period (~2 weeks)
    /*
    let jsonData = {};
    let changedFeatures = [];
    let currentDeltaId = null;
    var featurePendingSpliceChanges = (function() {
        var observer = new MutationObserver(function (mutations) {
            // The callback will be filled in later
        });
        
        function setupMutationObserver(spliceCountMap) {
            observer.disconnect();  // Stop observing any previous changes

            observer = new MutationObserver(function (mutations) {
                spliceCountMap.forEach((spliceCount, id) => {
                    const spliceGroup = document.querySelectorAll(`a[id^="${id}"]`);
    
                    if (!spliceGroup.length) {
                        return;
                    }
    
                    spliceGroup.forEach((element) => {
                        const existingDesignLink = element.querySelector(".design-link");
                        if (!existingDesignLink) {
                            element.insertAdjacentHTML("beforeend", ` <span class="design-link" style="color: #20b94b;">(${spliceCount} Pending)</span> `);
                        }
                    });
                });
            });
    
            observer.observe(document.body, { childList: true, subtree: true });
        }
    
        async function processManholeData(url) {
            try {
                const currentDeltaEl = document.querySelector("div.delta-owner-map-watermark-text");
                if (!currentDeltaEl) {
                    return;
                }

                // Note: Removing delta value from URL allows us to obtain changes of currently open design.
                // If the structure only exists in the proposed delta, the base URL will 404; fall back to the original URL.
                const baseURL = url.replace(/&?delta=.*\/, "");  // Escaped regex to avoid breaking block comment
                let response = await fetch(baseURL);
                if (response.status === 404) {
                    response = await fetch(url);
                }
                if (!response.ok) {
                    return;
                }

                const data = await response.json();
                jsonData = data;

                const currentDelta = currentDeltaEl.textContent.split(": ")[1];
                changedFeatures = data?.conns?.features.filter((feature) => {
                    const featureDelta = feature.myw?.delta?.split("/")[1];
                    return feature.myw && featureDelta === currentDelta;
                });
                currentDeltaId = currentDelta;
    
                if (!Array.isArray(changedFeatures) || !changedFeatures.length) {
                    return;
                }
    
                const spliceCountMap = new Map();
                changedFeatures.forEach((feature) => {
                    const { housing, in_object, out_object, in_low, in_high } = feature.properties;
                    const id = `${housing}_${in_object}_${out_object}`;
                    const spliceCount = in_high - in_low + 1;
    
                    if (spliceCountMap.has(id)) {
                        const existingSpliceCount = spliceCountMap.get(id);
                        spliceCountMap.set(id, existingSpliceCount + spliceCount);
                    } else {
                        spliceCountMap.set(id, spliceCount);
                    }
                });

                setupMutationObserver(spliceCountMap);
    
            } catch (error) {
                console.error(error);
                throw error;
            }
        }
    
        return {
            processManholeData
        };
    })();
    */

    // todo: use mutation observer instead
    /*
    // DEPRECATED: jQuery click handler for Design Changes feature
    // TODO: Migrate white fiber symbol fix to jstree event binding
    if (IS_MYWCOM) {
        $("#myWorldApp").on("click", 'div[id="related-equipment-tree-container"] i[class="jstree-icon jstree-ocl"]', function () {
            // if (!isToggleButtonOn("Design Changes")) {
            //     return;
            // }

            // Fix alignment issue created by adding border to white color symbol
            $("div[class='fiberColorSymbol']:contains(WT)").css("width", "11px");
            $("div[class='fiberColorSymbol']:contains(WT)").css("padding", "0 3px");

            if (!Array.isArray(changedFeatures) || !changedFeatures.length || !currentDeltaId) {
                return;
            }

            // Loop through pending splice changes
            changedFeatures.forEach((feature) => {
                const { housing, in_object, out_object, in_low, in_high, out_low, out_high } = feature.properties;
                const id = `${housing}_${in_object}_${out_object}`;
                const spliceGroup = document.querySelectorAll(`a[id^="${id}"]`);
                if (!spliceGroup.length) {
                    return;
                }
                const spliceList = spliceGroup[0].nextSibling;
                if (!spliceList) {
                    return;
                }
                const splices = spliceList.querySelectorAll("a.jstree-anchor");
                if (!splices.length) {
                    return;
                }
                const regex = /(\d+).*:(\d+)/;
                let maxMainWidth = 0;

                splices.forEach((splice) => {
                    // Normalize layout wrapper for all splices (pending or not)
                    if (!splice.querySelector(".qol-splice-row")) {
                        const row = document.createElement("span");
                        row.className = "qol-splice-row";
                        while (splice.firstChild) {
                            row.appendChild(splice.firstChild);
                        }
                        splice.appendChild(row);
                    }
                    const row = splice.querySelector(".qol-splice-row");

                    // Split into main (left/middle) and right wrappers for alignment
                    let rightWrap = row.querySelector(".qol-splice-right");
                    let mainWrap = row.querySelector(".qol-splice-main");
                    if (!mainWrap) {
                        mainWrap = document.createElement("span");
                        mainWrap.className = "qol-splice-main";
                        // Move all existing children into main for now
                        while (row.firstChild) {
                            mainWrap.appendChild(row.firstChild);
                        }
                        row.appendChild(mainWrap);
                    }
                    if (!rightWrap) {
                        rightWrap = document.createElement("span");
                        rightWrap.className = "qol-splice-right";
                        row.appendChild(rightWrap);
                    }

                    // Move right-side pieces into rightWrap
                    const fiberTo = mainWrap.querySelector(".fiber-colors.to");
                    if (fiberTo) {
                        rightWrap.appendChild(fiberTo);
                    }
                    const designLinkExisting = mainWrap.querySelector(".design-link");
                    if (designLinkExisting) {
                        rightWrap.appendChild(designLinkExisting);
                    }

                    // Track the widest main section for this splice list
                    const mainWidth = mainWrap.getBoundingClientRect().width;
                    if (mainWidth > maxMainWidth) {
                        maxMainWidth = mainWidth;
                    }

                    // Skip elements that have already been modified
                    if (splice.dataset.qol) {
                        return;
                    }

                    const matches = splice.textContent.match(regex);
                    if (matches && matches.length === 3) {
                        const strandIn = parseInt(matches[1]);
                        const strandOut = parseInt(matches[2]);
                        const matchIn =
                            strandIn >= in_low && strandIn <= in_high;
                        const matchOut =
                            strandOut >= out_low && strandOut <= out_high;
                        if (matchIn && matchOut) {
                            // Change text color to indicate pending change
                            row.style.color = "#20b94b";

                            // Add element showing the design name
                            if (!row.querySelector(".design-link")) {
                                const designLink = document.createElement("span");
                                designLink.className = "design-link";
                                designLink.textContent = `[Design: ${currentDeltaId}]`;
                                rightWrap.appendChild(designLink);
                            }

                            // Mark element so it's only processed once
                            splice.dataset.qol = true;
                        }
                    }
                });

                // Apply a consistent main-column width for this splice list to align right-side elements
                if (maxMainWidth > 0) {
                    spliceList.style.setProperty("--qol-splice-main", `${Math.ceil(maxMainWidth)}px`);
                }
            });
        });
    }
    */

    // Feature - Details Popup
    var featureDetailsPopup = (function () {
        function addFeatureToGUI() {
            // Create the popup list item element
            var li = document.createElement("li");
            li.classList.add("qol-popup-li");
            li.title = "Open in popup";
            li.style.display = "inline-block";
            li.style.backgroundColor = "transparent";

            // Create a span element to hold the icon
            var span = document.createElement("span");
            span.textContent = "❐"; // https://symbl.cc/en/2750/
            span.style.position = "absolute";
            span.style.top = "-4px";
            span.style.fontSize = "30px";
            li.appendChild(span);

            // Insert the li after the details nav menu
            var detailsNav = document.querySelector("#results-nav");
            detailsNav.appendChild(li);

            // Add event listener to copy the feature details to a popup
            li.addEventListener("click", function () {
                var popup = document.querySelector(".qol-popup-box");
                if (!popup) {
                    featureDetailsPopup.run();
                }
            });
        }

        function createFloatingOverlay(elementId) {
            // Get the element
            var element = document.getElementById(elementId);
            if (!element) {
                console.error('Element not found: ' + elementId);
                return;
            }

            // Get all elements with the class "jstree-open" that are children of the element
            var initiallyOpenElements = Array.from(element.getElementsByClassName('jstree-open'));

            // Expand all "jstree-closed" elements
            expandAll(element);
        
            // Create a copy of the element
            var copy = element.cloneNode(true);
            copy.style.height = 'auto';  // reset the height
            copy.style.overflowY = 'visible';  // reset the overflow

            // Collapse the "jstree-closed" elements again, except for those that were initially open
            collapseAll(element, initiallyOpenElements);
        
            // Create the floating box
            var box = document.createElement('div');
            box.style.position = 'fixed';
            box.style.backgroundColor = '#fff';
            box.style.padding = '10px 10px';
            box.style.borderRadius = '10px';
            box.style.width = '700px';
            box.style.maxWidth = '80%';
            box.style.height = '80vh';  // initial height
            box.style.maxHeight = '80vh';  // max height
            box.style.zIndex = '1000';
            box.style.left = '25%';
            box.style.top = '10%';
            box.style.resize = 'both';
            box.style.overflow = 'hidden';
            box.style.boxSizing = 'border-box'; // include padding and border in box's total width and height
            box.style.display = 'flex';
            box.style.flexDirection = 'column';
            box.classList.add("qol-popup-box");

            // Toggle lists using event delegation
            box.addEventListener('click', function(e) {
                // Check if the clicked element has the 'jstree-ocl' class
                if (e.target.classList.contains('jstree-ocl')) {
                    var parentNode = e.target.parentNode;

                    // If the parent node is open, collapse it
                    if (parentNode.classList.contains('jstree-open')) {
                        parentNode.classList.replace('jstree-open', 'jstree-closed');
                        var childList = parentNode.querySelector('ul');
                        if (childList) {
                            childList.style.display = 'none';
                        }
                    }
                    // If the parent node is closed, expand it
                    else if (parentNode.classList.contains('jstree-closed')) {
                        parentNode.classList.replace('jstree-closed', 'jstree-open');
                        var childList = parentNode.querySelector('ul');
                        if (childList) {
                            childList.style.display = 'block';
                        }
                    }
                }
            });

            // Create the header
            var header = document.createElement('div');
            header.style.position = 'relative';
            header.style.width = '100%';
            header.style.height = '30px';
            header.style.backgroundColor = '#ccc';
            header.style.cursor = 'move';
            box.appendChild(header);
        
            // Create the close button
            var closeBtn = document.createElement('div');
            closeBtn.textContent = 'X';
            closeBtn.style.position = 'absolute';
            closeBtn.style.right = '10px';
            closeBtn.style.top = '5px';
            closeBtn.style.cursor = 'pointer';
            closeBtn.style.color = '#fff';
            closeBtn.style.backgroundColor = '#3ca22d';
            // closeBtn.style.padding = '5px';
            closeBtn.style.borderRadius = '50%';
            closeBtn.style.width = '20px';
            closeBtn.style.height = '20px';
            closeBtn.style.textAlign = 'center';
            closeBtn.style.lineHeight = '20px';
            closeBtn.style.userSelect = 'none';
            header.appendChild(closeBtn);
            
            closeBtn.addEventListener('click', function() {
                document.body.removeChild(box);
            });

            // Create a container for the copied element
            var contentContainer = document.createElement('div');
            contentContainer.style.overflow = 'auto';
            contentContainer.style.width = '100%';
            contentContainer.style.height = 'calc(100% - 30px)';
            contentContainer.style.flexGrow = '1';
            contentContainer.appendChild(copy);  // append the copied element to the container

            // Add the container to the box
            box.appendChild(contentContainer);
        
            // Add the box to the body
            document.body.appendChild(box);

            // Adjust the height of the contentContainer when the box is resized
            box.onresize = function() {
                contentContainer.style.height = 'calc(100% - ' + header.offsetHeight + 'px)';
            };
        
            // Make the box draggable
            header.onmousedown = function(event) {
                // If the close button is clicked, don't execute the dragging code
                if (event.target === closeBtn) {
                    return;
                }
                
                var shiftX = event.clientX - box.getBoundingClientRect().left;
                var shiftY = event.clientY - box.getBoundingClientRect().top;
        
                box.style.position = 'absolute';
                box.style.zIndex = 1000;
        
                moveAt(event.pageX, event.pageY);
        
                function moveAt(pageX, pageY) {
                    box.style.left = pageX - shiftX + 'px';
                    box.style.top = pageY - shiftY + 'px';
                }
        
                function onMouseMove(event) {
                    moveAt(event.pageX, event.pageY);
                }
        
                document.addEventListener('mousemove', onMouseMove);
        
                header.onmouseup = function() {
                    document.removeEventListener('mousemove', onMouseMove);
                    header.onmouseup = null;
                };
            };
        
            header.ondragstart = function() {
                return false;
            };
        }
        
        function expandAll(element) {
            // Get all elements with the class "jstree-closed" that are children of the element
            var closedElements = Array.from(element.getElementsByClassName('jstree-closed'));
        
            closedElements.forEach(function(el) {
                // Find the .jstree-ocl element within the .jstree-closed element and simulate a click
                var toggleElement = el.querySelector('.jstree-ocl');
                if (toggleElement) {
                    toggleElement.click();
                    // Recursively expand all nested lists
                    expandAll(el);
                }
            });
        }
        
        function collapseAll(element, initiallyOpenElements) {
            // Get all elements with the class "jstree-open" that are children of the element
            var openElements = Array.from(element.getElementsByClassName('jstree-open'));
        
            openElements.forEach(function(el) {
                // If the element was not initially open, collapse it
                if (!initiallyOpenElements.includes(el)) {
                    // Find the .jstree-ocl element within the .jstree-open element and simulate a click
                    var toggleElement = el.querySelector('.jstree-ocl');
                    if (toggleElement) {
                        toggleElement.click();
                        // Recursively collapse all nested lists
                        collapseAll(el, initiallyOpenElements);
                    }
                }
            });
        }

        var observer = new MutationObserver(function(mutations) {
            // Check if details tab is open
            var featureDetails = document.querySelector('#feature-details');
            if (featureDetails && featureDetails.style.display !== 'none') {
                // Don't create the copy button if it already exists
                if (document.querySelector(".qol-popup-li")) {
                    return;
                }
    
                // Add feature to GUI
                addFeatureToGUI();
            }
        });

        return {
            run: function() {
                createFloatingOverlay('feature-details');
            },

            observe: function() {
                observer.observe(document, { childList: true, subtree: true });
            },

            stop: function() {
                observer.disconnect();
                const existingBtn = document.querySelector(".qol-popup-li");
                if (existingBtn) {
                    existingBtn.remove();
                }
                const popup = document.querySelector(".qol-popup-box");
                if (popup) {
                    popup.remove();
                }
            }
        };
    })();

    // Feature - Strand Splicing Calculator
    var featureStrandCalc = (function () {
        // Track whether the overlay is open
        let overlayOpen = false;
        
        // Create the floating overlay
        function createFloatingOverlay() {
            if (overlayOpen) {
                return;
            }
            overlayOpen = true;
        
            // Create the overlay window
            var overlayWindow = document.createElement("div");
            overlayWindow.classList.add("qol-calc-overlay");
            overlayWindow.style.position = "fixed";
            overlayWindow.style.top = "30%";
            overlayWindow.style.left = "70%";
            overlayWindow.style.display = "flex";
            overlayWindow.style.flexDirection = "column";
            overlayWindow.style.alignItems = "center";
            overlayWindow.style.background = "#fff";
            overlayWindow.style.padding = "10px";
            overlayWindow.style.borderRadius = "5px";
            overlayWindow.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.2)";

            // Create the header for dragging
            let header = document.createElement("div");
            header.style.position = "relative";
            header.style.width = "100%";
            header.style.height = "20px";
            header.style.backgroundColor = "#ccc";
            header.style.cursor = "move";
            header.style.marginBottom = "10px";
            overlayWindow.appendChild(header);

            // Create the close button
            var closeBtn = document.createElement("div");
            closeBtn.textContent = "X";
            closeBtn.style.position = "absolute";
            closeBtn.style.right = "10px";
            closeBtn.style.top = "0px";
            closeBtn.style.cursor = "pointer";
            closeBtn.style.color = "#fff";
            closeBtn.style.backgroundColor = "#3ca22d";
            // closeBtn.style.padding = "5px";
            closeBtn.style.borderRadius = "50%";
            closeBtn.style.width = "20px";
            closeBtn.style.height = "20px";
            closeBtn.style.textAlign = "center";
            closeBtn.style.lineHeight = "20px";
            closeBtn.style.userSelect = "none";
            header.appendChild(closeBtn);
            
            closeBtn.addEventListener('click', function() {
                document.body.removeChild(overlayWindow);
                overlayOpen = false;
            });

            // Create a container for the input rows
            let inputContainer = document.createElement("div");
            inputContainer.style.display = "flex";
            inputContainer.style.flexDirection = "column";
            inputContainer.style.alignItems = "flex-end";
            overlayWindow.appendChild(inputContainer);
            
            /// Create the input labels and inputs
            var labels = ["Panel Port:", "From Cable Size:", "To Cable Size:"];
            var inputs = [];
            
            for (var i = 0; i < labels.length; i++) {
                let row = document.createElement("div");
                row.style.display = "flex";
                row.style.justifyContent = "flex-end";
                row.style.alignItems = "center";

                var label = document.createElement("label");
                label.textContent = labels[i];
                label.style.marginRight = "10px";
                row.appendChild(label);
                
                var input = document.createElement("input");
                input.id = "qol-calc-input-" + i;
                input.type = "number";
                input.max = "999";
                input.style.width = "60px";
                row.appendChild(input);
                
                inputs.push(input);

                inputContainer.appendChild(row);
            }

            // Create an output container
            let outputContainer = document.createElement("pre");
            outputContainer.id = "qol-calc-output";
            outputContainer.style.marginTop = "20px";
            overlayWindow.appendChild(outputContainer);
        
            // Create the button
            var button = document.createElement("button");
            button.textContent = "Process";
            button.addEventListener("click", processInputs);
            overlayWindow.appendChild(button);

            // Make the box draggable
            header.onmousedown = function(event) {
                // If the close button is clicked, don't execute the dragging code
                if (event.target === closeBtn) {
                    return;
                }

                let shiftX = event.clientX - overlayWindow.getBoundingClientRect().left;
                let shiftY = event.clientY - overlayWindow.getBoundingClientRect().top;

                overlayWindow.style.position = 'absolute';
                overlayWindow.style.zIndex = 1000;

                moveAt(event.pageX, event.pageY);

                function moveAt(pageX, pageY) {
                    overlayWindow.style.left = pageX - shiftX + 'px';
                    overlayWindow.style.top = pageY - shiftY + 'px';
                }

                function onMouseMove(event) {
                    moveAt(event.pageX, event.pageY);
                }

                document.addEventListener('mousemove', onMouseMove);

                header.onmouseup = function() {
                    document.removeEventListener('mousemove', onMouseMove);
                    header.onmouseup = null;
                };
            };

            header.ondragstart = function() {
                return false;
            };

            // Append the overlayWindow to the document body
            document.body.appendChild(overlayWindow);
        }
        
        // Process the input values
        function processInputs() {
            var panelPort = document.getElementById("qol-calc-input-0").value;
            var fromCableSize = document.getElementById("qol-calc-input-1").value;
            var toCableSize = document.getElementById("qol-calc-input-2").value;

            // Input validation
            if (isNaN(panelPort) || isNaN(fromCableSize) || isNaN(toCableSize)) {
                alert("Please enter numbers only.");
                return;
            }
            if (panelPort < 0 || fromCableSize < 0 || toCableSize < 0) {
                alert("Please enter positive numbers only.");
                return;
            }

            const spliceStrands = calculateStrands(panelPort, 144, fromCableSize, toCableSize);
            console.log("From Options:", spliceStrands.fromOptions);
            console.log("To Options:", spliceStrands.toOptions);
            
            let outputContainer = document.getElementById("qol-calc-output");
            outputContainer.textContent = "From Options: " + spliceStrands.fromOptions + "\n" + "To Options: " + spliceStrands.toOptions;
        }

        function calculateStrands(panelPort, panelCount, fromCableCount, toCableCount) {
            console.log(`parameters: ${panelPort}, ${panelCount}, ${fromCableCount}, ${toCableCount}`);

            // Calculate the strand index of the buffer tube using the panel port
            const panelTubeIndex = Math.ceil(panelPort / 12);
            const strandIndex = (panelPort - 1) % 12 + 1;
            console.log(`panelTubeIndex: ${panelTubeIndex}, strandIndex: ${strandIndex}`);

            // Determine the tubes that maintain splicing consistency
            const panelTubeCount = Math.ceil(panelCount / 12);
            const panelTubes = panelTubeIndex % 2 === 0 ? evenNumbers(panelTubeCount) : oddNumbers(panelTubeCount);

            // Calculate the options based on each panel tube, strand index, and 12 strands per buffer
            const fromOptions = panelTubes.map(tube => ((tube - 1) * 12) + strandIndex).filter(strand => strand <= fromCableCount);
            const toOptions = panelTubes.map(tube => ((tube - 1) * 12) + strandIndex).filter(strand => strand <= toCableCount);

            return {
                fromOptions,
                toOptions
            };
        }

        // Helper function to generate an array of odd numbers
        function oddNumbers(n) {
            return Array.from({ length: Math.ceil(n / 2) }, (_, i) => i * 2 + 1);
        }

        // Helper function to generate an array of even numbers
        function evenNumbers(n) {
            return Array.from({ length: Math.floor(n / 2) }, (_, i) => (i + 1) * 2);
        }

        var observer = new MutationObserver(function(mutations) {
            // Don't create the GUI button if it already exists
            if (document.querySelector(".qol-calc-li")) {
                return;
            }
            
            // Don't create the GUI button if toolbar is still loading
            var toolbar = document.getElementById("toolbar");
            if (!toolbar || toolbar.childElementCount === 0) {
                return;
            }

            // Create the list item element
            var li = document.createElement("li");
            li.classList.add("qol-calc-li");
            li.style.display = "inline-block";

            // Create a span element for alignment (symbol sizing creates offset)
            var span = document.createElement("span");
            span.style.display = "flex";
            span.style.justifyContent = "center";
            span.style.alignItems = "center";
            span.style.width = "40px";
            span.style.height = "40px";

            // Create a span for the symbol
            var symbolSpan = document.createElement("span");
            symbolSpan.textContent = "🖩";
            symbolSpan.style.position = "absolute";
            symbolSpan.style.top = "-20px";
            symbolSpan.style.color = "white";
            symbolSpan.style.fontSize = "50px";

            // Append the spans to the list item
            span.appendChild(symbolSpan);
            li.appendChild(span);

            // Insert the li after the details nav menu
            toolbar.appendChild(li);

            // Add event listener to copy the feature details to a popup
            li.addEventListener("click", function () {
                var dialog = document.querySelector(".qol-calc-dialog");
                if (!dialog) {
                    featureStrandCalc.run();
                }
            });
        });

        return {
            run: function() {
                createFloatingOverlay();
            },

            observe: function() {
                observer.observe(document, { childList: true, subtree: true });
            },

            stop: function() {
                observer.disconnect();
                const existingBtn = document.querySelector(".qol-calc-li");
                if (existingBtn) {
                    existingBtn.remove();
                }
                const overlay = document.querySelector(".qol-calc-overlay");
                if (overlay) {
                    overlay.remove();
                }
            }
        };
    })();

    // Feature - Better Splice Details Layout
    var featureBetterSpliceDetails = (function () {
        function addFeatureToGUI() {
            // Create button to run feature
            const div = document.createElement('div');
            div.classList.add('qol-better-splice-btn');

            // Create a span element to hold the icon
            const span = document.createElement('span');
            span.textContent = 'Custom'; // https://symbl.cc/en/2750/
            // Object.assign(span.style, {
            //     position: 'absolute',
            //     top: '10px',
            //     right: '35px',
            //     fontSize: '14px'
            // });
            div.appendChild(span);

            // Insert button at top of Equipment section
            const equipmentSection = document.querySelector('#related-equipment-container');
            if (!equipmentSection) {
                return;
            }

            // const ref = equipmentSection.querySelector('.control-setting');
            // if (ref) {
            //     // Insert before the element
            //     ref.parentNode.insertBefore(div, ref);
            // } else {
            //     // If not found, prepend to the top
            //     equipmentSection.prepend(div);
            // }

            // Insert div as the first element after "Equipment" header (should be in front of input box)
            const equipHeader = equipmentSection.querySelector('.feature-plugins-header-options');
            if (equipHeader) {
                equipHeader.insertBefore(div, equipHeader.firstChild);
            }

            // Add event listener to button
            div.addEventListener('click', function () {
                featureBetterSpliceDetails.run(jsonData);
            });
        }

        function createHTMLFromJSON(json) {
            if (!json || !json.conns) {
                console.warn('JSON missing connection details');
                console.warn(JSON.stringify(json));
                return;
            }

            // Identify features with "splice: true" property
            const spliceFeatures = json.conns.features.filter(
                (f) => f.properties.splice
            );

            // Create map to store in/out objects
            const objectMap = new Map();

            let html = '';

            // Loop through splice features
            spliceFeatures.forEach((feature) => {
                // Get relevant properties from feature
                const {
                    in_object,
                    out_object,
                    in_low,
                    in_high,
                    out_low,
                    out_high,
                } = feature.properties;

                // Extract the segment IDs from the in_object and out_object properties
                const in_segment_id = parseInt(in_object.split('/')[1]);
                const out_segment_id = parseInt(out_object.split('/')[1]);

                // Find the segments in the cable_segs list
                const in_segment = json.cable_segs.features.find(
                    (seg) => seg.id === in_segment_id
                );
                const out_segment = json.cable_segs.features.find(
                    (seg) => seg.id === out_segment_id
                );

                // Get the cable IDs from the segments
                const in_cable_id = parseInt(
                    in_segment.properties.cable.split('/')[1]
                );
                const out_cable_id = parseInt(
                    out_segment.properties.cable.split('/')[1]
                );

                // Find the cables in the cables list
                const in_cable = json.cables.features.find(
                    (cable) => cable.id === in_cable_id
                );
                const out_cable = json.cables.features.find(
                    (cable) => cable.id === out_cable_id
                );

                // Get the cable names
                const in_cable_name = in_cable.properties.name;
                const out_cable_name = out_cable.properties.name;

                // Create arrays for in and out ranges
                const inRange = Array.from(
                    { length: in_high - in_low + 1 },
                    (_, i) => in_low + i
                );
                const outRange = Array.from(
                    { length: out_high - out_low + 1 },
                    (_, i) => out_low + i
                );

                // Check if in/out objects already exist in map
                const key = `${in_object}|${out_object}`;
                const keyR = `${out_object}|${in_object}`;
                let cables = '';
                let strands = '';

                if (objectMap.has(key)) {
                    //   console.log(`IO: ${key}`);

                    strands = inRange
                        .map((n, i) => {
                            const [bufferTubeColorIn, strandColorIn] =
                                getStrandColors(n);
                            const [bufferTubeColorOut, strandColorOut] =
                                getStrandColors(outRange[i]);

                            return `${generateStrandPairHTML(
                                bufferTubeColorIn,
                                strandColorIn,
                                n,
                                bufferTubeColorOut,
                                strandColorOut,
                                outRange[i],
                                '→'
                            )}`;
                        })
                        .join('');
                    html += `${strands}`;
                } else if (objectMap.has(keyR)) {
                    // If reverse key exists, change direction of arrows
                    //   console.log(`OI: ${keyR}`);

                    strands = inRange
                        .map((n, i) => {
                            const [bufferTubeColorIn, strandColorIn] =
                                getStrandColors(n);
                            const [bufferTubeColorOut, strandColorOut] =
                                getStrandColors(outRange[i]);

                            return `${generateStrandPairHTML(
                                bufferTubeColorIn,
                                strandColorIn,
                                n,
                                bufferTubeColorOut,
                                strandColorOut,
                                outRange[i],
                                '←'
                            )}`;
                        })
                        .join('');
                    html += `${strands}`;
                } else {
                    cables = `</ul><strong>${in_cable_name} <--> ${out_cable_name}</strong>`;
                    strands = inRange
                        .map((n, i) => {
                            const [bufferTubeColorIn, strandColorIn] =
                                getStrandColors(n);
                            const [bufferTubeColorOut, strandColorOut] =
                                getStrandColors(outRange[i]);

                            return `${generateStrandPairHTML(
                                bufferTubeColorIn,
                                strandColorIn,
                                n,
                                bufferTubeColorOut,
                                strandColorOut,
                                outRange[i],
                                '→'
                            )}`;
                        })
                        .join('');
                    html += `${cables}<ul>${strands}`;

                    objectMap.set(key, key);
                }
            });
            console.log(objectMap);

            return html;
        }

        function getStrandColors(strandNumber) {
            // Calculate the color indices for buffer tube and strand colors
            const bufferTubeColorIndex =
                Math.floor((strandNumber - 1) / 12) % 12;
            const strandColorIndex = (strandNumber - 1) % 12;

            // Define the TIA-598-C color codes
            const colors = [
                'Blue',
                'Orange',
                'Green',
                'Brown',
                'Slate',
                'White',
                'Red',
                'Black',
                'Yellow',
                'Violet',
                'Rose',
                'Aqua',
            ];

            // Get the buffer tube and strand colors
            const bufferTubeColor = colors[bufferTubeColorIndex];
            const strandColor = colors[strandColorIndex];

            // Return the color pair as an array
            return [bufferTubeColor, strandColor];
        }

        function generateStrandColorHTML(bufferTubeColor, strandColor) {
            // Function to generate HTML for strand colors

            // Define the color information
            const colorInfo = {
                Blue: {
                    abbreviation: 'BL',
                    backgroundColor: 'rgba(0, 0, 255, 0.5)',
                    textColor: 'rgb(255, 255, 255)',
                },
                Orange: {
                    abbreviation: 'OR',
                    backgroundColor: 'rgba(255, 165, 0, 0.5)',
                    textColor: 'rgb(0, 0, 0)',
                },
                Green: {
                    abbreviation: 'GN',
                    backgroundColor: 'rgba(0, 128, 0, 0.5)',
                    textColor: 'rgb(255, 255, 255)',
                },
                Brown: {
                    abbreviation: 'BN',
                    backgroundColor: 'rgba(165, 42, 42, 0.5)',
                    textColor: 'rgb(255, 255, 255)',
                },
                Slate: {
                    abbreviation: 'SL',
                    backgroundColor: 'rgba(112, 128, 144, 0.5)',
                    textColor: 'rgb(255, 255, 255)',
                },
                White: {
                    abbreviation: 'WT',
                    backgroundColor: 'rgba(255, 255, 255, 0.5)',
                    textColor: 'rgb(0, 0, 0)',
                },
                Red: {
                    abbreviation: 'RD',
                    backgroundColor: 'rgba(255, 0, 0, 0.5)',
                    textColor: 'rgb(0, 0, 0)',
                },
                Black: {
                    abbreviation: 'BK',
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    textColor: 'rgb(255, 255, 255)',
                },
                Yellow: {
                    abbreviation: 'YL',
                    backgroundColor: 'rgba(255, 255, 0, 0.5)',
                    textColor: 'rgb(0, 0, 0)',
                },
                Violet: {
                    abbreviation: 'VT',
                    backgroundColor: 'rgba(238, 130, 238, 0.5)',
                    textColor: 'rgb(0, 0, 0)',
                },
                Rose: {
                    abbreviation: 'RO',
                    backgroundColor: 'rgba(255, 228, 225, 0.5)',
                    textColor: 'rgb(0, 0, 0)',
                },
                Aqua: {
                    abbreviation: 'A',
                    backgroundColor: 'rgba(0, 255, 255, 0.5)',
                    textColor: 'rgb(0, 0, 0)',
                },
            };

            const bufferTubeColorInfo = colorInfo[bufferTubeColor];
            const strandColorInfo = colorInfo[strandColor];

            const bufferTubeDiv = `<div class="fiberColorSymbol" style="background-color: ${bufferTubeColorInfo.backgroundColor}; color: ${bufferTubeColorInfo.textColor};">${bufferTubeColorInfo.abbreviation}</div>`;
            const strandDiv = `<div class="fiberColorSymbol" style="background-color: ${strandColorInfo.backgroundColor}; color: ${strandColorInfo.textColor};">${strandColorInfo.abbreviation}</div>`;

            return `${bufferTubeDiv}${strandDiv}`;
        }

        function generateStrandPairHTML(
            bufferTubeColorIn,
            strandColorIn,
            strandIn,
            bufferTubeColorOut,
            strandColorOut,
            strandOut,
            arrow
        ) {
            // return `<li>${generateStrandColorHTML(bufferTubeColorIn, strandColorIn)}${strandIn} ${arrow} ${strandOut}${generateStrandColorHTML(bufferTubeColorOut, strandColorOut)}</li>`;

            return `
                <li role="none" id="j2_452" class="jstree-node jstree-leaf-node jstree-leaf">
                <div unselectable="on" role="presentation" class="jstree-wholerow">&nbsp;</div>
                <i class="jstree-icon jstree-ocl" role="presentation"></i>
                <a class="jstree-anchor" href="#" tabindex="-1" role="treeitem" aria-selected="false" aria-level="3" id="j2_452_anchor">
                <i class="jstree-icon jstree-themeicon jstree-themeicon-custom" role="presentation" style="background-image: url(&quot;modules/comms/images/features/fiber.svg&quot;);background-position: center center;background-size: auto;"></i>
                <div class="fiber-colors from">
                ${generateStrandColorHTML(bufferTubeColorIn, strandColorIn)}
                </div>
                ${strandIn} ${arrow} ${strandOut}
                <div class="fiber-colors to">
                ${generateStrandColorHTML(bufferTubeColorOut, strandColorOut)}
                </div>
                </a>
                </li>
            `;
        }

        var observer = new MutationObserver(function (mutations) {
            // Check if details tab is open
            var featureDetails = document.querySelector('#feature-details');
            if (featureDetails && featureDetails.style.display !== 'none') {
                // Only add feature if there is an Equipment section
                if (!document.querySelector('.control-setting')) {
                    return;
                }

                // Don't add the button if it already exists
                if (document.querySelector('.qol-better-splice-btn')) {
                    return;
                }

                // Add feature to GUI
                addFeatureToGUI();
            }
        });

        return {
            run: function (json) {
                // Update HTML
                document.querySelector('li[id*="splice_closure"] .jstree-children').innerHTML = createHTMLFromJSON(json);
            },

            observe: function () {
                observer.observe(document, { childList: true, subtree: true });
            },

            stop: function () {
                observer.disconnect();
                const btn = document.querySelector('.qol-better-splice-btn');
                if (btn) {
                    btn.remove();
                }
            },
        };
    })();

    // Feature - Auto Terminations (local storage caching, hover details appended to strand list)
    var featureBetterTerminations = (function() {
        const FEATURE_NAME = 'Terminations';

        const COMPANY_URL = `https://${window.location.hostname}`;
        const PORT = 'port';
        const FIBER_PATCH_PANEL = 'fiber_patch_panel';
        const FIBER_ONT = 'fiber_ont';
        // Trace cost is ~2.1 s per pin + ~1.5 s per request (measured 2026-11-08), so batch size
        // barely changes total time; small batches limit the blast radius of a strand that errors
        // and lets on-screen rows finish first. Timeout scales with pin count (~2.5x expected).
        const TERMINATION_BATCH_SIZE = 6;
        const TERMINATION_TIMEOUT_BASE_MS = 15000;
        const TERMINATION_TIMEOUT_PER_PIN_MS = 5000;
        const TERMINATION_MAX_CONCURRENCY = 5;
        const FEATURE_PROPERTIES = {
            'fiber_patch_panel': ['id', 'name', 'n_fiber_ports', 'root_housing'],
            'fiber_splitter': ['id', 'name', 'n_fiber_out_ports', 'device_id'],
            'fiber_ont': ['id', 'name', 'root_housing'],
            'fiber_mst': ['id', 'name', 'n_fiber_ports', 'root_housing'],
            'fiber_sfp': ['id', 'root_housing'],
            'cabinet': ['id', 'name', 'type', 'description'],
            'building': ['id', 'cust_name', 'name', 'description', 'street_num', 'street', 'city', 'state', 'zip', 'county'],
            'migration_structure': ['id', 'name', 'type'],
            'mywcom_route_junction': ['id'],
            'manhole': ['id', 'name', 'type'],
            'shelf': ['id', 'name', 'n_fiber_out_ports', 'root_housing'],
            'cub_cpe': ['id', 'name', 'root_housing'],
            'mid_span': ['id', 'name'],
            'pole': ['id', 'name'],
            'card': ['id', 'name'],
            'fiber_demux': ['id', 'name']
        };

        let termMutationObserver = null;
        const displayRetryCounts = new Map();
        const patchedTreeViews = new WeakSet();
        let cableTreeShowPatched = false;
        const segmentBatchState = new Map(); // segment -> { strands: [], saved: number, fiberCount: number }
        const failedPins = new Map(); // segment -> Map(pin -> reason) for traces that errored this session (retried on refresh/Clear)

        // Traces and feature data differ per design, so localStorage entries are kept per design
        // (`qol-term:<type>` in master, `qol-term:<type>@<design>` in a design) and the in-memory
        // maps above only ever hold the current design. The prefix keeps the purge off other apps' keys.
        const CACHE_KEY_PREFIX = 'qol-term:';
        function designCacheKey(featureType, design) {
            return `${CACHE_KEY_PREFIX}${featureType}${design ? `@${design}` : ''}`;
        }
        let stateDesign = null;
        function syncDesignState(design) {
            if (stateDesign === design) return;
            if (stateDesign !== null) {
                logger.debug(FEATURE_NAME, `design changed (${stateDesign || 'master'} -> ${design || 'master'}), resetting termination state`);
                segmentBatchState.clear();
                segmentOrientation.clear();
                failedPins.clear();
            }
            stateDesign = design;
            touchDesignCache(design);
        }

        // Keep caches for at most MAX_CACHED_DESIGNS designs (master doesn't count). The index
        // records when each design was last opened; the least recently opened is evicted first.
        const DESIGN_INDEX_KEY = 'qol-term-designs';
        const MAX_CACHED_DESIGNS = 3;
        const DESIGN_CACHE_MAX_AGE_DAYS = 2;
        function touchDesignCache(design) {
            if (!design) return;
            try {
                const index = JSON.parse(localStorage.getItem(DESIGN_INDEX_KEY) || '{}');
                index[design] = Date.now();
                const evict = Object.keys(index).sort((a, b) => index[b] - index[a]).slice(MAX_CACHED_DESIGNS);
                evict.forEach((old) => {
                    delete index[old];
                    Object.keys(localStorage)
                        .filter((k) => k.startsWith(CACHE_KEY_PREFIX) && k.endsWith(`@${old}`))
                        .forEach((k) => localStorage.removeItem(k));
                    logger.debug(FEATURE_NAME, `evicted cached terminations for ${old}`);
                });
                localStorage.setItem(DESIGN_INDEX_KEY, JSON.stringify(index));
            } catch (error) {
                logger.debug(FEATURE_NAME, 'Unable to update design cache index', error);
            }
        }

        // Cleanup stale cache data (design caches expire sooner)
        Object.keys(localStorage).forEach((k) => {
            if (k.startsWith(CACHE_KEY_PREFIX)) {
                purgeFeatureCache(k, k.includes('@design%2F') ? DESIGN_CACHE_MAX_AGE_DAYS : 5);
            } else if (isLegacyTermCache(k)) {
                localStorage.removeItem(k); // unprefixed cache from before the prefix; refilled on demand
            }
        });

        // A pre-prefix cache: an object whose every entry is { saved: <time>, data }
        function isLegacyTermCache(key) {
            try {
                const value = localStorage.getItem(key);
                if (!value || !value.includes('"saved"')) return false;
                const parsed = JSON.parse(value);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
                const entries = Object.values(parsed);
                return entries.length > 0 && entries.every((e) =>
                    e && typeof e === 'object' && typeof e.saved === 'number' && Object.keys(e).length === 2 && 'data' in e);
            } catch {
                return false;
            }
        }

        // A segment can have several rows at once: a slack's A and Z rows are the in_ and out_ ends
        // of the same segment. The slack row itself has the bare id and holds both, so the bare id
        // is used only when there is no in_/out_ row. getElementById because IDs contain slashes.
        function segmentElements(segment) {
            const ends = [`out_${segment}`, `in_${segment}`]
                .map((id) => document.getElementById(id))
                .filter(Boolean);
            if (ends.length) return ends;
            const bare = document.getElementById(segment);
            return bare ? [bare] : [];
        }

        function segmentRowAnchor(li) {
            return document.getElementById(`${li.id}_anchor`) || li.querySelector(':scope > a.jstree-anchor');
        }

        function openSegmentElements(segment) {
            return segmentElements(segment).filter((li) => segmentRowAnchor(li)?.getAttribute('aria-expanded') === 'true');
        }

        function isSegmentExpanded(segment) {
            return openSegmentElements(segment).length > 0;
        }

        let renderSequence = 0;
        const segmentOrientation = new Map(); // segment -> 'in' | 'out' (which strand side is shown first)

        // ─── Segment-wide column layout ──────────────────────────────────────
        // Each strand row becomes a 3-column grid:
        //   lead (icon, pin, colours) | termination | tail (IQGeo's own splice/connection text)
        // Column widths live in CSS variables on the segment <li>, so every row in the
        // segment shares one left edge for the termination column and batches never
        // have to measure individual rows. Widths only grow, never shrink.
        (function injectTermLayoutStyles() {
            if (document.getElementById('qol-term-layout-css')) return;
            const style = document.createElement('style');
            style.id = 'qol-term-layout-css';
            style.textContent = `
                a.jstree-anchor.qol-term-layout { display: inline-block; }
                .qol-term-row {
                    display: grid;
                    grid-template-columns:
                        var(--qol-term-lead, max-content)
                        var(--qol-term-near, max-content)
                        24px
                        var(--qol-term-far, max-content)
                        max-content;
                    align-items: center;
                    column-gap: 0;
                    white-space: nowrap;
                }
                .qol-term-cell { display: flex; align-items: center; gap: 4px; align-self: stretch; }
                .qol-term-lead { padding-right: 8px; }
                .qol-term-tail { padding-left: 8px; }
                /* Both ends sit on one shared band so they read as a single path */
                .qol-term-has-path > .qol-term-near,
                .qol-term-has-path > .qol-term-arrow,
                .qol-term-has-path > .qol-term-far { background: #f5f7fa; }
                .qol-term-has-path > .qol-term-near { padding: 0 2px 0 6px; border-radius: 4px 0 0 4px; }
                .qol-term-has-path > .qol-term-far { padding: 0 6px 0 2px; border-radius: 0 4px 4px 0; }
                .qol-term-colors {
                    display: inline-flex; align-items: center; justify-content: flex-end; gap: 2px;
                    min-width: var(--qol-term-colors, auto);
                }
                .qol-term-pin {
                    display: inline-block; min-width: var(--qol-term-pin, auto);
                    text-align: right; font-variant-numeric: tabular-nums;
                }
                .qol-term-arrow { justify-content: center; color: #2f3b4c; font-size: 15px; font-weight: 700; }
                .qol-term-end { display: flex; align-items: center; gap: 5px; flex: 1 0 auto; font-size: 13px; cursor: pointer; }
                .qol-term-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; box-sizing: border-box; }
                .qol-term-dot.port { background: #1f8a5b; }
                .qol-term-dot.open { border: 1.5px solid #c98a00; background: transparent; }
                .qol-term-badge {
                    flex: none; min-width: 30px; box-sizing: border-box; padding: 0 4px; border-radius: 3px;
                    text-align: center; font-size: 10.5px; line-height: 15px; font-weight: 600; letter-spacing: 0.02em;
                }
                .qol-term-badge.eq { background: #e4eefb; color: #1d4f91; }
                .qol-term-badge.st { background: #efeafb; color: #4b3b8f; }
                .qol-term-label { display: flex; align-items: baseline; gap: 4px; flex: 0 0 auto; color: #222; }
                .qol-term-name { max-width: 20ch; overflow: hidden; text-overflow: ellipsis; }
                .qol-term-sub { max-width: 14ch; overflow: hidden; text-overflow: ellipsis; color: #555; }
                html.qol-term-hide-sub .qol-term-sub { display: none; }
                /* Names that repeat the row above: softly faded (default), or run starts in semibold, or left as is */
                html:not(.qol-term-repeats-bold):not(.qol-term-repeats-none) .qol-term-label.qol-term-repeat .qol-term-name { color: #5c5c5c; }
                html:not(.qol-term-repeats-bold):not(.qol-term-repeats-none) .qol-term-label.qol-term-repeat .qol-term-sub { color: #7a7a7a; }
                html.qol-term-repeats-bold .qol-term-label:not(.qol-term-repeat) .qol-term-name { font-weight: 600; }
                .qol-term-num { margin-left: auto; padding-left: 6px; font-variant-numeric: tabular-nums; color: #444; }
                .qol-term-failed { font-size: 12px; color: #a15c00; cursor: help; white-space: nowrap; }
                /* IQGeo's own connection text: compact chip by default, full text optional */
                .qol-term-splice {
                    display: inline-flex; align-items: center; gap: 3px; padding: 0 5px; line-height: 16px;
                    font-size: 11px; color: #555; border: 1px solid #cfd4db; border-radius: 3px; cursor: help;
                }
                .qol-term-tail-full { display: none; align-items: center; gap: 4px; padding-left: 8px; border-left: 1px solid #cfd4db; }
                html.qol-term-splice-full .qol-term-splice { display: none; }
                html.qol-term-splice-full .qol-term-tail-full { display: inline-flex; }
                .qol-term-legend { margin-left: 10px; font-size: 11px; color: #777; }
                .qol-status-message { padding-left: 10px; font-size: 13px; }
                .qol-term-clear-btn {
                    margin-left: 6px; padding: 0 4px; font-size: 13px; line-height: 16px; cursor: pointer;
                    background: transparent; color: #999; border: 1px solid transparent; border-radius: 3px;
                }
                .qol-term-clear-btn:hover { background: #c62828; color: #fff; }
                /* Open cable and segment rows stay pinned while their children scroll underneath.
                   The segment pins just below its cable (--qol-term-cable-h, set on each cable li), and a
                   slack's A/Z row below the slack row too (--qol-term-seg-h, set on each open segment li).
                   --qol-term-pad (set on the scroll container) cancels its top padding, which sticky
                   would otherwise leave as a gap above the pinned rows. */
                html.qol-term-sticky:not(.qol-term-sticky-off) li.jstree-open[id*="fiber_cable/"] > a.jstree-anchor,
                html.qol-term-sticky:not(.qol-term-sticky-off) li.jstree-open[id*="mywcom_fiber_segment/"] > a.jstree-anchor,
                html.qol-term-sticky:not(.qol-term-sticky-off) li.jstree-open[id*="fiber_cable/"] > i.jstree-ocl,
                html.qol-term-sticky:not(.qol-term-sticky-off) li.jstree-open[id*="mywcom_fiber_segment/"] > i.jstree-ocl {
                    position: sticky; top: calc(0px - var(--qol-term-pad, 0px)); z-index: 3;
                    background-color: var(--qol-term-sticky-bg, #fff);
                }
                html.qol-term-sticky:not(.qol-term-sticky-off) li.jstree-open[id*="mywcom_fiber_segment/"] > i.jstree-ocl { z-index: 4; }
                html.qol-term-sticky:not(.qol-term-sticky-off) li.jstree-open[id*="fiber_cable/"] > a.jstree-anchor { z-index: 5; }
                html.qol-term-sticky:not(.qol-term-sticky-off) li.jstree-open[id*="fiber_cable/"] > i.jstree-ocl { z-index: 6; }
                html.qol-term-sticky:not(.qol-term-sticky-off) li[id*="fiber_cable/"] li.jstree-open[id*="mywcom_fiber_segment/"] > a.jstree-anchor,
                html.qol-term-sticky:not(.qol-term-sticky-off) li[id*="fiber_cable/"] li.jstree-open[id*="mywcom_fiber_segment/"] > i.jstree-ocl { top: calc(var(--qol-term-cable-h, 0px) - var(--qol-term-pad, 0px)); }
                html.qol-term-sticky:not(.qol-term-sticky-off) li.jstree-open[id*="mywcom_fiber_segment/"] li.jstree-open[id*="mywcom_fiber_segment/"] > a.jstree-anchor,
                html.qol-term-sticky:not(.qol-term-sticky-off) li.jstree-open[id*="mywcom_fiber_segment/"] li.jstree-open[id*="mywcom_fiber_segment/"] > i.jstree-ocl { top: calc(var(--qol-term-cable-h, 0px) + var(--qol-term-seg-h, 0px) - var(--qol-term-pad, 0px)); }
                /* Hover and selection stay opaque: a tint layered over the solid row background */
                html.qol-term-sticky:not(.qol-term-sticky-off) li.jstree-open[id*="fiber_cable/"] > a.jstree-anchor.jstree-hovered,
                html.qol-term-sticky:not(.qol-term-sticky-off) li.jstree-open[id*="mywcom_fiber_segment/"] > a.jstree-anchor.jstree-hovered {
                    background-image: linear-gradient(rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.06));
                }
                html.qol-term-sticky:not(.qol-term-sticky-off) li.jstree-open[id*="fiber_cable/"] > a.jstree-anchor.jstree-clicked,
                html.qol-term-sticky:not(.qol-term-sticky-off) li.jstree-open[id*="mywcom_fiber_segment/"] > a.jstree-anchor.jstree-clicked {
                    background-image: linear-gradient(rgba(33, 113, 201, 0.16), rgba(33, 113, 201, 0.16));
                }
                /* While pinned: full-width backing (box-shadow adds no scroll area) and a divider */
                html.qol-term-sticky:not(.qol-term-sticky-off) a.jstree-anchor.qol-seg-stuck {
                    box-shadow: 0 0 0 100vmax var(--qol-term-sticky-bg, #fff), 0 1px 0 100vmax #cfd4db;
                    clip-path: inset(0 -100vmax -1px -100vmax);
                    cursor: pointer;
                }
                html.qol-term-sticky:not(.qol-term-sticky-off) a.jstree-anchor.qol-seg-stuck::after {
                    content: "⤒"; margin-left: 8px; color: #2f3b4c; font-weight: 700;
                }
                .qol-term-legend .qol-term-dot { display: inline-block; margin: 0 3px 0 6px; vertical-align: middle; }
            `;
            (document.head || document.documentElement).appendChild(style);
        })();

        function isInsideToColors(node) {
            return !!(node.closest && node.closest('.fiber-colors.to'));
        }

        // Split IQGeo's original strand label into the lead (icon, pin number, "from" colours)
        // and the tail (connection/splice text and "to" colours). Falls back to "everything
        // in the lead" when the label has no recognisable pin or colour block.
        function splitBaseline(baselineHtml) {
            const holder = document.createElement('div');
            holder.innerHTML = baselineHtml;
            const nodes = Array.from(holder.childNodes);
            const lead = document.createDocumentFragment();
            const tail = document.createDocumentFragment();

            // First top-level node that is, or contains, a "from" colour block
            let colorIdx = -1;
            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                if (n.nodeType !== Node.ELEMENT_NODE) continue;
                if (n.matches('.fiber-colors.to')) break; // reached the far side of the connection
                const isColor = n.matches('.fiber-colors, .fiberColorSymbol');
                const inner = Array.from(n.querySelectorAll('.fiber-colors:not(.to), .fiberColorSymbol'))
                    .find((c) => !isInsideToColors(c));
                if (isColor || inner) { colorIdx = i; break; }
            }

            // First top-level text node that holds the pin number
            let pinIdx = -1;
            let pinEnd = 0;
            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                if (n.nodeType !== Node.TEXT_NODE) continue;
                const m = n.nodeValue.match(/\d+/);
                if (m) { pinIdx = i; pinEnd = m.index + m[0].length; break; }
            }

            if (pinIdx === -1 && colorIdx === -1) {
                nodes.forEach((n) => lead.appendChild(n));
                return { lead, tail };
            }

            // The lead ends at whichever comes later: the pin number or the "from" colours
            const splitPinText = pinIdx > colorIdx;
            const cutIdx = splitPinText ? pinIdx : colorIdx;
            nodes.forEach((n, i) => {
                if (i < cutIdx) {
                    lead.appendChild(n);
                } else if (i === cutIdx && splitPinText) {
                    lead.appendChild(document.createTextNode(n.nodeValue.slice(0, pinEnd)));
                    const rest = n.nodeValue.slice(pinEnd).replace(/^\s*-(?!>)\s*/, ' '); // drop a lone "-" separator, keep "->"
                    if (rest.trim()) tail.appendChild(document.createTextNode(rest.trimStart()));
                } else if (i === cutIdx) {
                    lead.appendChild(n);
                } else {
                    tail.appendChild(n);
                }
            });

            // Drop a tail that is only whitespace
            const hasElements = Array.from(tail.childNodes).some((n) => n.nodeType === Node.ELEMENT_NODE);
            if (!hasElements && !tail.textContent.trim()) {
                return { lead, tail: document.createDocumentFragment() };
            }
            return { lead, tail };
        }

        // Convert one strand anchor into the grid row (idempotent). Returns the row.
        function prepareStrandLayout(anchor, pin) {
            const existing = anchor.querySelector(':scope > .qol-term-row');
            if (existing) return existing;

            ensureBaselineAnchor(anchor);
            const { lead, tail } = splitBaseline(anchor.dataset.qolOriginalHtml || '');

            const row = document.createElement('div');
            row.classList.add('qol-term-row');
            row.dataset.qolPin = pin;
            const makeCell = (cls) => {
                const c = document.createElement('div');
                c.classList.add('qol-term-cell', cls);
                return c;
            };
            const leadCell = makeCell('qol-term-lead');
            const nearCell = makeCell('qol-term-near');
            const arrowCell = makeCell('qol-term-arrow');
            const farCell = makeCell('qol-term-far');
            const tailCell = makeCell('qol-term-tail');
            leadCell.appendChild(lead);
            slotLead(leadCell);
            if (tail.childNodes.length) {
                // Text only, without the colour-badge abbreviations
                const textOnly = document.createElement('div');
                textOnly.appendChild(tail.cloneNode(true));
                textOnly.querySelectorAll('.fiber-colors, .fiberColorSymbol').forEach((n) => n.remove());
                const fullText = (textOnly.textContent || '').replace(/\s+/g, ' ').trim();
                const pinRef = fullText.match(/#\s*[\w:-]+\s*$/);
                const chip = document.createElement('span');
                chip.className = 'qol-term-splice';
                chip.textContent = `⇄ ${pinRef ? pinRef[0].replace(/\s+/g, '') : 'splice'}`;
                chip.title = fullText;
                const full = document.createElement('span');
                full.className = 'qol-term-tail-full';
                full.appendChild(tail);
                tailCell.append(chip, full);
            }
            row.append(leadCell, nearCell, arrowCell, farCell, tailCell);

            anchor.dataset.qolPin = pin;
            anchor.replaceChildren(row);
            anchor.classList.add('qol-term-layout');
            return row;
        }

        // Grow a column variable on the segment <li> to fit its widest cell.
        // All reads happen before the single write, so this is one layout pass.
        // Width a cell needs: from its left edge to the end of its content, plus right padding.
        // Sub-pixel accurate (scrollWidth rounds, which left some rows ~1px out of line).
        function neededWidth(cell) {
            if (!cell.childNodes.length) return 0;
            // A Range measures text glyphs, which overflow:hidden doesn't clip, so an
            // ellipsized name would report its full hidden width. Measure end cells by
            // their element boxes instead (those respect max-width).
            const end = cell.querySelector(':scope > .qol-term-end');
            if (end) {
                const kids = [...end.children];
                const gap = parseFloat(getComputedStyle(end).columnGap) || 0;
                const cs = getComputedStyle(cell);
                return kids.reduce((w, k) => w + k.getBoundingClientRect().width, 0)
                    + gap * Math.max(0, kids.length - 1)
                    + (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
            }
            const range = document.createRange();
            range.selectNodeContents(cell);
            const content = range.getBoundingClientRect();
            if (!content.width && !content.height) return 0;
            const box = cell.getBoundingClientRect();
            return Math.max(box.width, content.right - box.left + (parseFloat(getComputedStyle(cell).paddingRight) || 0));
        }

        function growColumn(liElement, which) {
            const varName = `--qol-term-${which}`;
            const current = parseFloat(liElement.style.getPropertyValue(varName)) || 0;
            let max = current;
            liElement.querySelectorAll(`.qol-term-row .qol-term-${which}`).forEach((c) => {
                max = Math.max(max, neededWidth(c));
            });
            if (max > current) {
                liElement.style.setProperty(varName, `${Math.ceil(max)}px`);
            }
        }

        // Display settings: { spliceText: 'compact' | 'full', secondary: true | false, stickyHeader: true | false,
        //                     repeats: 'fade' | 'bold' | 'none' }
        const TERM_DISPLAY_KEY = 'qol-term-display';
        const TERM_DISPLAY_DEFAULTS = { spliceText: 'compact', secondary: true, stickyHeader: true, repeats: 'fade' };
        function loadTermDisplay() {
            try {
                return { ...TERM_DISPLAY_DEFAULTS, ...JSON.parse(localStorage.getItem(TERM_DISPLAY_KEY) || '{}') };
            } catch (e) {
                return { ...TERM_DISPLAY_DEFAULTS };
            }
        }
        function applyTermDisplay(settings) {
            const root = document.documentElement;
            root.classList.toggle('qol-term-splice-full', settings.spliceText === 'full');
            root.classList.toggle('qol-term-hide-sub', settings.secondary === false);
            root.classList.toggle('qol-term-sticky-off', settings.stickyHeader === false);
            root.classList.toggle('qol-term-repeats-bold', settings.repeats === 'bold');
            root.classList.toggle('qol-term-repeats-none', settings.repeats === 'none');
        }
        applyTermDisplay(loadTermDisplay());

        // Column widths only grow, so a display change resets and re-measures every open segment
        function remeasureAllSegments() {
            document.querySelectorAll('li[style*="--qol-term"]').forEach((li) => {
                TERM_COLUMN_VARS.forEach((v) => li.style.removeProperty(v));
                ['colors', 'pin', 'lead', 'near', 'far'].forEach((which) => growColumn(li, which));
            });
        }

        // ─── Pinned segment row ──────────────────────────────────────────────
        // CSS keeps the open segment's row (and its expand/collapse arrow) pinned while its
        // strands scroll. While pinned, a click on the row jumps back to the segment instead
        // of selecting it (which would change the current feature and refresh the trees).
        const STICKY_ROW_LIS = ['li.jstree-open[id*="fiber_cable/"]', 'li.jstree-open[id*="mywcom_fiber_segment/"]'];
        const STICKY_LI_SELECTOR = STICKY_ROW_LIS.join(', ');
        const STICKY_ANCHOR_SELECTOR = STICKY_ROW_LIS.map((sel) => `${sel} > a.jstree-anchor`).join(', ');
        const STICKY_OCL_SELECTOR = STICKY_ROW_LIS.map((sel) => `${sel} > i.jstree-ocl`).join(', ');
        const scrollContainerCache = new WeakMap();
        let stickyActive = false;
        let stickyRaf = 0;
        let stickyWarned = false;
        const stickyPaddedContainers = new Set();

        function findScrollContainer(el) {
            const cached = scrollContainerCache.get(el);
            if (cached && cached.isConnected && cached.contains(el)) return cached;
            let found = document.scrollingElement || document.documentElement;
            for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
                const oy = getComputedStyle(n).overflowY;
                if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) { found = n; break; }
            }
            scrollContainerCache.set(el, found);
            return found;
        }

        function isPageScroller(container) {
            return container === document.scrollingElement || container === document.documentElement;
        }

        function containerTop(container) {
            return isPageScroller(container) ? 0 : container.getBoundingClientRect().top;
        }

        // Top of the scrollport (inside the border), where pinned rows sit once the padding is cancelled
        function scrollportTop(container) {
            return isPageScroller(container) ? 0 : container.getBoundingClientRect().top + container.clientTop;
        }

        function effectiveBackground(el) {
            for (let n = el; n; n = n.parentElement) {
                const bg = getComputedStyle(n).backgroundColor;
                if (bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg)) return bg;
            }
            return '#fff';
        }

        function scrollToSegment(li, container = findScrollContainer(li), behavior = 'smooth') {
            const anchor = li.querySelector(':scope > a.jstree-anchor');
            const pinnedTop = anchor ? parseFloat(getComputedStyle(anchor).top) || 0 : 0;
            const pad = isPageScroller(container) ? 0 : parseFloat(getComputedStyle(container).paddingTop) || 0;
            const delta = li.getBoundingClientRect().top - scrollportTop(container) - pad - pinnedTop;
            if (Math.abs(delta) > 1) container.scrollBy({ top: delta, behavior });
        }

        function setStuck(anchor, stuck) {
            if (stuck === anchor.classList.contains('qol-seg-stuck')) return;
            anchor.classList.toggle('qol-seg-stuck', stuck);
            if (stuck) {
                anchor.dataset.qolPrevTitle = anchor.getAttribute('title') || '';
                const kind = anchor.parentElement?.id?.includes('fiber_cable/') ? 'cable' : 'segment';
                anchor.setAttribute('title', `Jump back to this ${kind}`);
            } else {
                if (anchor.dataset.qolPrevTitle) anchor.setAttribute('title', anchor.dataset.qolPrevTitle);
                else anchor.removeAttribute('title');
                delete anchor.dataset.qolPrevTitle;
            }
        }

        // Explain once if an ancestor's overflow setting stops sticky from working
        function warnIfStickyBlocked(li, anchor, liTop, anchorTop) {
            if (stickyWarned) return;
            const container = findScrollContainer(li);
            const cTop = containerTop(container);
            if (!(liTop < cTop - 4 && anchorTop < cTop - 4 && li.getBoundingClientRect().bottom > cTop + 48)) return;
            stickyWarned = true;
            let blocker = null;
            for (let n = li.parentElement; n && n !== container; n = n.parentElement) {
                const cs = getComputedStyle(n);
                if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { blocker = n; break; }
            }
            logger.warn(FEATURE_NAME, 'Segment row did not stay pinned; an ancestor with overflow set is likely blocking position: sticky', { blocker, container });
        }

        function updateStuckState() {
            stickyRaf = 0;
            const root = document.documentElement;
            const anchors = [...document.querySelectorAll(STICKY_ANCHOR_SELECTOR)];
            if (anchors.length && !root.style.getPropertyValue('--qol-term-sticky-bg')) {
                root.style.setProperty('--qol-term-sticky-bg', effectiveBackground(anchors[0].parentElement));
            }
            for (const c of stickyPaddedContainers) if (!c.isConnected) stickyPaddedContainers.delete(c);

            // Read everything first, then write, so the frame does one layout instead of one per row.
            // Rows are measured per tree: a hidden tree (e.g. the Cables tab behind a dialog) has 0-height rows.
            const pads = new Map();
            const rows = anchors.map((anchor) => {
                const li = anchor.parentElement;
                const container = findScrollContainer(li);
                if (!isPageScroller(container) && !pads.has(container)) {
                    pads.set(container, `${parseFloat(getComputedStyle(container).paddingTop) || 0}px`);
                }
                const anchorRect = anchor.getBoundingClientRect();
                return { anchor, li, height: anchorRect.height, liTop: li.getBoundingClientRect().top, anchorTop: anchorRect.top };
            });

            pads.forEach((pad, container) => {
                if (container.style.getPropertyValue('--qol-term-pad') === pad) return;
                container.style.setProperty('--qol-term-pad', pad);
                stickyPaddedContainers.add(container);
            });
            rows.forEach(({ li, height }) => {
                if (!height) return;
                const prop = li.id.includes('fiber_cable/') ? '--qol-term-cable-h' : '--qol-term-seg-h';
                const h = `${Math.round(height)}px`;
                if (li.style.getPropertyValue(prop) !== h) li.style.setProperty(prop, h);
            });
            rows.forEach(({ anchor, li, liTop, anchorTop }) => {
                const stuck = anchorTop - liTop > 1;
                setStuck(anchor, stuck);
                if (!stuck) warnIfStickyBlocked(li, anchor, liTop, anchorTop);
            });
            // Rows that are no longer open segments lose the pinned state
            document.querySelectorAll('a.jstree-anchor.qol-seg-stuck').forEach((a) => {
                if (!a.parentElement?.matches(STICKY_LI_SELECTOR)) setStuck(a, false);
            });
        }

        function onStickyScroll() {
            if (!stickyRaf) stickyRaf = requestAnimationFrame(updateStuckState);
        }

        // Capture phase on document runs before jstree's and IQGeo's own click handlers
        function onStickyClick(e) {
            if (document.documentElement.classList.contains('qol-term-sticky-off')) return;
            const target = e.target instanceof Element ? e.target : null;
            if (!target) return;

            // Collapse arrow pressed while pinned: let jstree collapse, then bring the segment back into view
            const ocl = target.closest(STICKY_OCL_SELECTOR);
            if (ocl) {
                const li = ocl.parentElement;
                const anchor = li.querySelector(':scope > a.jstree-anchor');
                if (e.type === 'click' && anchor?.classList.contains('qol-seg-stuck')) {
                    const container = findScrollContainer(li);
                    requestAnimationFrame(() => requestAnimationFrame(() => scrollToSegment(li, container, 'auto')));
                }
                return;
            }

            const anchor = target.closest(STICKY_ANCHOR_SELECTOR);
            if (!anchor || target.closest('.qol-term-clear-btn')) return;
            const recentlyJumped = Date.now() - (Number(anchor.dataset.qolJumpedAt) || 0) < 700;
            if (!anchor.classList.contains('qol-seg-stuck') && !recentlyJumped) return;

            // Swallow the click (and a double-click's second half) so the current feature doesn't change
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            if (e.type === 'click' && !recentlyJumped) {
                anchor.dataset.qolJumpedAt = String(Date.now());
                scrollToSegment(anchor.parentElement);
            }
        }

        function enableStickyHeaders() {
            if (stickyActive) return;
            stickyActive = true;
            document.documentElement.classList.add('qol-term-sticky');
            document.documentElement.style.removeProperty('--qol-term-sticky-bg'); // re-read the tree background
            document.addEventListener('scroll', onStickyScroll, { capture: true, passive: true });
            document.addEventListener('click', onStickyClick, true);
            document.addEventListener('dblclick', onStickyClick, true);
            onStickyScroll();
        }

        function disableStickyHeaders() {
            if (!stickyActive) return;
            stickyActive = false;
            document.documentElement.classList.remove('qol-term-sticky');
            document.removeEventListener('scroll', onStickyScroll, { capture: true });
            document.removeEventListener('click', onStickyClick, true);
            document.removeEventListener('dblclick', onStickyClick, true);
            if (stickyRaf) cancelAnimationFrame(stickyRaf);
            stickyRaf = 0;
            document.querySelectorAll('a.jstree-anchor.qol-seg-stuck').forEach((a) => setStuck(a, false));
            document.querySelectorAll('li[style*="--qol-term-cable-h"], li[style*="--qol-term-seg-h"]').forEach((li) => {
                li.style.removeProperty('--qol-term-cable-h');
                li.style.removeProperty('--qol-term-seg-h');
            });
            stickyPaddedContainers.forEach((c) => c.style.removeProperty('--qol-term-pad'));
            stickyPaddedContainers.clear();
        }
        // ─────────────────────────────────────────────────────────────────────

        const TERM_COLUMN_VARS = ['--qol-term-lead', '--qol-term-colors', '--qol-term-pin', '--qol-term-near', '--qol-term-far'];

        // After a batch: mark run starts, then grow the end columns (semibold is wider), once per frame
        const pendingRefresh = new Set();
        function scheduleRefresh(liElement) {
            const key = liElement.id;
            if (pendingRefresh.has(key)) return;
            pendingRefresh.add(key);
            requestAnimationFrame(() => {
                pendingRefresh.delete(key);
                if (!liElement.isConnected) return;
                muteRepeats(liElement);
                growColumn(liElement, 'near');
                growColumn(liElement, 'far');
            });
        }

        // Put the colour badges and the strand number in their own slots so both line up
        // across rows (tube badges such as "VT/BK" are wider than "BL").
        function slotLead(leadCell) {
            const colorSlot = document.createElement('span');
            colorSlot.className = 'qol-term-colors';
            const pinSlot = document.createElement('span');
            pinSlot.className = 'qol-term-pin';
            Array.from(leadCell.childNodes).forEach((n) => {
                if (n.nodeType === Node.ELEMENT_NODE &&
                    (n.matches('.fiber-colors, .fiberColorSymbol') || n.querySelector('.fiber-colors, .fiberColorSymbol'))) {
                    colorSlot.appendChild(n);
                } else if (n.nodeType === Node.TEXT_NODE && /\d/.test(n.nodeValue) && !pinSlot.textContent) {
                    pinSlot.textContent = n.nodeValue.trim();
                    n.remove();
                } else if (n.nodeType === Node.TEXT_NODE && !n.nodeValue.trim()) {
                    n.remove();
                }
            });
            if (!colorSlot.childNodes.length && !pinSlot.textContent) return; // unrecognised label: leave as-is
            leadCell.append(colorSlot, pinSlot);
        }

        const EQUIPMENT_BADGES = {
            fiber_patch_panel: 'PNL', fiber_ont: 'ONT', fiber_splitter: 'SPL', fiber_mst: 'MST', shelf: 'SHF',
            fiber_sfp: 'SFP', card: 'CRD', fiber_demux: 'DMX', cub_cpe: 'CPE'
        };
        const STRUCTURE_BADGES = {
            building: 'BLDG', manhole: 'MH', migration_structure: 'MS', mywcom_route_junction: 'JCT',
            cabinet: 'CAB', pole: 'POLE', mid_span: 'MSP', splice_closure: 'SC'
        };
        // UUB (manhole feature) badges by its type; anything else is treated as a manhole
        const UUB_TYPE_BADGES = { Manhole: 'MH', Handhole: 'HH', Pedestal: 'PED' };
        const uubBadge = (type) => UUB_TYPE_BADGES[type] || 'MH';
        // IQGeo appends the pin spec to desc ("<name>#IN:3", "<cable>#1"); the number is shown
        // separately, so drop only that suffix and keep any '#' inside the name itself
        const stripPinSuffix = (desc) => (desc || '').replace(/(?<=\S)#(?:(?:IN|OUT):)?\d+$/i, '').trim();
        const shortType = (type) => (type || '?').replace(/^(fiber_|mywcom_)/, '').slice(0, 4).toUpperCase();
        const cleanTitle = (title) => (title || '').replace(/^[^:]{1,40}:\s+/, '').replace(/Splice Closure/, 'Closure').trim();

        // Customer-end equipment is known by the building it's in, not by its own id
        const BUILDING_LABEL_TYPES = new Set(['fiber_mst', 'fiber_sfp', FIBER_ONT, 'cub_cpe']);
        const buildingAddress = (h) => [h?.street_num, h?.street].filter(Boolean).join(' ').trim();
        // { name, address } of the building housing this end, or null when it isn't in a building
        function endBuilding(side) {
            const type = (side.feature || '').split('/')[0];
            if (!BUILDING_LABEL_TYPES.has(type) || !String(side.equipmentInfo?.root_housing || '').startsWith('building/')) return null;
            const h = side.housingInfo;
            const building = { name: h?.cust_name || h?.name || '', address: buildingAddress(h) };
            return building.name || building.address ? building : null;
        }

        // Break one end into display parts: badge, primary name, secondary text, number, open/terminated
        function describeEnd(side) {
            const [type, id] = (side.feature || '').split('/');
            const desc = stripPinSuffix(side.desc);

            if (side.type === PORT) {
                const h = side.housingInfo;
                const eq = side.equipmentInfo;
                const building = endBuilding(side);
                if (building) {
                    // Name and address; with no name the address leads and the id follows
                    return {
                        kind: 'eq',
                        badge: EQUIPMENT_BADGES[type] || shortType(type),
                        primary: building.name || building.address,
                        secondary: building.name ? building.address : id,
                        num: `P${side.pin}`,
                        open: false
                    };
                }
                let housing = '';
                let ident = eq?.name || id;
                if (type === FIBER_PATCH_PANEL) {
                    housing = h?.name || h?.description;
                    ident = id; // users know panels by id
                } else if (type === FIBER_ONT) {
                    housing = h?.cust_name || h?.name || h?.description;
                    ident = id;
                } else if (type === 'shelf') {
                    housing = h?.description;
                    ident = id;
                } else if (type === 'fiber_splitter') {
                    ident = eq?.device_id || side.title?.replace(/^Splitter: /, '') || id;
                } else if (type === 'fiber_mst') {
                    ident = id;
                }
                return {
                    kind: 'eq',
                    badge: EQUIPMENT_BADGES[type] || shortType(type),
                    primary: housing || ident || '',
                    secondary: housing ? (ident || '') : '',
                    num: `P${side.pin}`,
                    open: false
                };
            }

            // Cable end: the strand stops unterminated at a structure
            const sd = side.structureData;
            const est = sd?.end_structure_type;
            let badge = STRUCTURE_BADGES[est] || (est ? shortType(est) : 'END');
            if (est === 'manhole') badge = uubBadge(side.endStructureData?.type);
            let place = cleanTitle(sd?.end_structure_title);
            if (est === 'building') {
                place = side.endStructureData?.cust_name || side.endStructureData?.name || place;
            }
            return {
                kind: 'st',
                badge,
                primary: place || desc,
                secondary: place ? desc : '',
                num: `S${side.pin}`,
                open: true
            };
        }

        // Build one end cell. The old one-line label (formatText) becomes the hover text and
        // keeps its click-to-select behaviour.
        function buildEndCell(side) {
            const legacy = formatText(side);
            const parts = describeEnd(side);

            const end = document.createElement('span');
            end.className = 'qol-term-end';
            end.dataset.qolKey = `${parts.badge}|${parts.primary}|${parts.secondary}`;
            end.title = [legacy.textContent, legacy.title].filter(Boolean).join('\n');
            end.addEventListener('click', () => legacy.click());

            const dot = document.createElement('span');
            dot.className = `qol-term-dot ${parts.open ? 'open' : 'port'}`;

            const badge = document.createElement('span');
            badge.className = `qol-term-badge ${parts.kind}`;
            badge.textContent = parts.badge;

            const label = document.createElement('span');
            label.className = 'qol-term-label';
            const name = document.createElement('span');
            name.className = 'qol-term-name';
            name.textContent = parts.primary;
            label.appendChild(name);
            if (parts.secondary) {
                const sub = document.createElement('span');
                sub.className = 'qol-term-sub';
                sub.textContent = `· ${parts.secondary}`;
                label.appendChild(sub);
            }

            const num = document.createElement('span');
            num.className = 'qol-term-num';
            num.textContent = parts.num;

            end.append(dot, badge, label, num);
            return end;
        }

        // Mark an end's name as a repeat when it matches the same end on the row above (run starts stay semibold)
        function muteRepeats(liElement) {
            const rows = Array.from(liElement.querySelectorAll('.qol-term-row'))
                .sort((a, b) => Number(a.dataset.qolPin) - Number(b.dataset.qolPin));
            ['near', 'far'].forEach((which) => {
                let previousKey = null;
                rows.forEach((row) => {
                    const end = row.querySelector(`.qol-term-${which} .qol-term-end`);
                    const key = end ? end.dataset.qolKey : null;
                    const label = end?.querySelector('.qol-term-label');
                    if (label) label.classList.toggle('qol-term-repeat', !!key && key === previousKey);
                    previousKey = key;
                });
            });
        }

        // Convert every strand row in the segment up front, then size the lead column once.
        // Strand rows exist as soon as the segment opens, so this does not depend on batches.
        function prepareSegmentLayout(liElement, strandAnchorIndex) {
            let created = false;
            Object.entries(strandAnchorIndex).forEach(([pin, a]) => {
                if (!a.querySelector(':scope > .qol-term-row')) {
                    prepareStrandLayout(a, pin);
                    created = true;
                }
            });
            if (created) {
                growColumn(liElement, 'colors');
                growColumn(liElement, 'pin');
                growColumn(liElement, 'lead');
            }
        }

        // Best-effort layout pass as soon as a segment opens, before any data arrives
        function prepareSegment(segment) {
            openSegmentElements(segment).forEach((liElement) => {
                const index = indexStrandAnchors(liElement);
                if (Object.keys(index).length) prepareSegmentLayout(liElement, index);
            });
        }

        // Decide which side goes first from every strand known for the segment, not per batch
        function decideOrientation(segment, fallbackStrands) {
            const known = (segmentBatchState.get(segment)?.strands || []).filter(Boolean);
            const pool = known.length ? known : fallbackStrands;
            let inCount = 0, outCount = 0;
            pool.forEach((strand) => {
                if (strand.in?.feature?.startsWith(FIBER_PATCH_PANEL)) inCount++;
                if (strand.out?.feature?.startsWith(FIBER_PATCH_PANEL)) outCount++;
            });
            return inCount > outCount ? 'in' : 'out';
        }
        // ─────────────────────────────────────────────────────────────────────

        function indexStrandAnchors(liElement) {
            // Map strand pin -> anchor element (tolerant of injected rows)
            const anchors = {};
            const leafAnchors = liElement ? liElement.querySelectorAll('li.jstree-leaf > a.jstree-anchor') : [];
            if (!leafAnchors.length) return anchors;

            const extractTextPin = (node) => {
                // Rows already converted to the grid carry their pin
                if (node.dataset.qolPin) return parseInt(node.dataset.qolPin, 10);
                const clone = node.cloneNode(true);
                clone.querySelectorAll('.qol-term-row, .qol-status-message').forEach((n) => n.remove());
                const text = (clone.textContent || '').trim();
                const match = text.match(/(?:^|\s)(\d+)\s*(?:-|$)/);
                return match ? parseInt(match[1], 10) : NaN;
            };

            leafAnchors.forEach((a) => {
                const pin = extractTextPin(a);
                if (!Number.isNaN(pin)) {
                    anchors[pin] = a;
                }
            });

            logger.debug(FEATURE_NAME, 'indexStrandAnchors', {
                li: liElement?.id,
                leafAnchors: leafAnchors.length,
                pins: Object.keys(anchors)
            });
            return anchors;
        }

        function ensureBaselineAnchor(anchor) {
            if (!anchor) return;
            // Only capture baseline if not already captured
            if (anchor.dataset.qolOriginalHtml) return;
            const clone = anchor.cloneNode(true);
            clone.querySelectorAll('.qol-term-row, .qol-status-message').forEach((n) => n.remove());
            anchor.dataset.qolOriginalHtml = clone.innerHTML;
        }

        function resetStrandAnchor(anchor) {
            if (!anchor) return;
            // Restore from baseline (don't re-capture, that would overwrite with modified state)
            anchor.innerHTML = anchor.dataset.qolOriginalHtml || '';
            anchor.classList.remove('qol-term', 'qol-term-layout');
            delete anchor.dataset.qolPin;
            anchor.querySelectorAll('.qol-status-message').forEach((n) => n.remove());
        }

        function resetSegmentAnchors(liElement) {
            if (!liElement) return;
            liElement.querySelectorAll('li.jstree-leaf > a').forEach(resetStrandAnchor);
            liElement.querySelectorAll('.qol-status-message').forEach((n) => n.remove());
            TERM_COLUMN_VARS.forEach((v) => liElement.style.removeProperty(v));
        }

        // forceRefresh: re-fetch end details instead of reading the cache (only for this call)
        async function showTerminations(segment, strands, { forceRefresh = false } = {}) {
            // Don't render if feature is disabled
            if (!featureManager.isEnabled("Auto Terminations")) {
                return;
            }

            const seq = ++renderSequence;
            logger.log(FEATURE_NAME, 'showTerminations seq', seq, 'segment:', segment, 'strands len:', strands?.length);
            try {
                if (!Array.isArray(strands)) {
                    logger.error(FEATURE_NAME, "Invalid data: strands is not an array", strands);
                    return;
                }

                // Filter out undefined/null values from sparse array
                const validStrands = strands.filter(Boolean);
                if (!validStrands.length) {
                    logger.debug(FEATURE_NAME, "No valid strands to display for segment:", segment);
                    return;
                }

                const openLis = openSegmentElements(segment);
                if (!openLis.length) {
                    return;
                }
                // Every open row of the segment (both ends of a slack) gets the same terminations
                const targets = openLis
                    .map((liElement) => ({ liElement, strandAnchorIndex: indexStrandAnchors(liElement) }))
                    .filter((t) => Object.keys(t.strandAnchorIndex).length);
                if (!targets.length) {
                    const key = `${segment}::anchors`;
                    const count = displayRetryCounts.get(key) || 0;
                    if (count < 5) {
                        displayRetryCounts.set(key, count + 1);
                        setTimeout(() => showTerminations(segment, strands, { forceRefresh }), 250 * (count + 1));
                        logger.debug(FEATURE_NAME, 'anchors not ready, retry', { segment, attempt: count + 1 });
                    } else {
                        // Usually the tree was rebuilt for another feature mid-render, so not an error
                        logger.debug(FEATURE_NAME, 'Strand DOM elements not found after retries:', segment);
                        displayRetryCounts.delete(key); // Clean up
                    }
                    return;
                }
                displayRetryCounts.delete(`${segment}::anchors`);

                // Every strand row gets the grid (and the lead column its width) before any cell is filled
                targets.forEach((t) => prepareSegmentLayout(t.liElement, t.strandAnchorIndex));

                // Orientation is per segment; if a new batch changes it, re-render everything known
                const orientation = decideOrientation(segment, validStrands);
                const previousOrientation = segmentOrientation.get(segment);
                segmentOrientation.set(segment, orientation);
                let renderList = validStrands;
                if (previousOrientation && previousOrientation !== orientation) {
                    const known = (segmentBatchState.get(segment)?.strands || []).filter(Boolean);
                    if (known.length) renderList = known;
                    logger.debug(FEATURE_NAME, 'orientation changed, re-rendering segment', { segment, previousOrientation, orientation });
                }

                for (const strand of renderList) {
                    const pin = parseInt(strand.pin, 10);
                    const strandElements = targets.map((t) => t.strandAnchorIndex[pin]).filter(Boolean);
                    if (!strandElements.length) {
                        logger.warn(FEATURE_NAME, `no strand anchor for pin ${pin} in ${segment}`, {
                            seq,
                            pinsAvailable: Object.keys(targets[0].strandAnchorIndex),
                            strand
                        });
                        continue;
                    }
                    // One bad end must not stop the rest of the batch from rendering
                    try {
                        const [nearSide, farSide] = orientation === 'in' ? [strand.in, strand.out] : [strand.out, strand.in];
                        const [popNear, popFar] = await Promise.all([populateSideInfo(nearSide, forceRefresh), populateSideInfo(farSide, forceRefresh)]);

                        for (const strandElement of strandElements) {
                            const row = prepareStrandLayout(strandElement, pin);
                            row.querySelector('.qol-term-near').replaceChildren(buildEndCell(popNear));
                            row.querySelector('.qol-term-arrow').textContent = '➜';
                            row.querySelector('.qol-term-far').replaceChildren(buildEndCell(popFar));
                            row.classList.add('qol-term-has-path');

                            // Swap the generic fiber icon for one that reflects both end types
                            const iconElement = row.querySelector('.qol-term-lead .jstree-icon');
                            if (iconElement) {
                                if (iconElement.dataset.qolOrigIcon === undefined) {
                                    iconElement.dataset.qolOrigIcon = iconElement.style.backgroundImage || '';
                                }
                                if (iconElement.dataset.qolOrigIcon.includes('features/fiber.svg')) {
                                    iconElement.style.backgroundImage = `url("${determineIcon(nearSide.type, farSide.type)}")`;
                                }
                            }
                            strandElement.classList.add('qol-term');
                        }
                    } catch (strandError) {
                        logger.warn(FEATURE_NAME, `Unable to render termination for pin ${pin} in ${segment}`, strandError);
                    }
                }

                // End columns grow to fit this batch; only the trailing splice text moves
                targets.forEach((t) => scheduleRefresh(t.liElement));
            } catch (error) {
                logger.error(FEATURE_NAME, `Unable to show terminations for ${segment}`, error);
            }
        }

        // IQGeo rebuilds the tree after its own trace, so rows drawn before that lose their labels.
        // Draw the known strands (and failure markers) again on rows that don't have them.
        function renderMissingRows(segment) {
            ensurePendingStatus(segment);
            const strands = (segmentBatchState.get(segment)?.strands || []).filter(Boolean);
            const failed = failedPins.get(segment);
            const indexes = openSegmentElements(segment).map((li) => indexStrandAnchors(li));
            const isMissing = (pin, selector) => indexes.some((index) => index[pin] && !index[pin].querySelector(selector));
            const missing = strands.filter((strand) => {
                const pin = parseInt(strand.pin, 10);
                return !failed?.has(pin) && isMissing(pin, '.qol-term-has-path');
            });
            failed?.forEach((reason, pin) => { if (isMissing(pin, '.qol-term-failed')) showFailedStrand(segment, pin, reason); });
            if (!missing.length) return null;
            logger.debug(FEATURE_NAME, `redrawing ${missing.length} rows the tree rebuilt`, segment);
            return showTerminations(segment, missing);
        }

        // A rebuilt segment row also loses its "Updating Terminations..." status mid-load
        function ensurePendingStatus(segment) {
            openSegmentElements(segment).forEach((li) => {
                if (!segmentRowAnchor(li)?.querySelector('.qol-status-message')) showStatusOnRow(segment, li, PENDING_STATUS, '');
            });
        }

        const PENDING_STATUS = '⟳ Updating…';

        // "✓ 3:45 PM" for a load today, "✓ Nov 10" for an older one; the full time goes in the hover text
        function shortSavedTime(date) {
            const today = date.toDateString() === new Date().toDateString();
            return today
                ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }

        // Status shows on every open row of the segment; closed rows are skipped
        function displayStatusMessage(segment, message, savedTimestamp = '') {
            openSegmentElements(segment).forEach((liElement) => showStatusOnRow(segment, liElement, message, savedTimestamp));
        }

        function showStatusOnRow(segment, liElement, message, savedTimestamp) {
            try {
                const anchor = segmentRowAnchor(liElement);
                if (!anchor) {
                    return;
                }

                let statusElement = anchor.querySelector('.qol-status-message');

                if (!statusElement) {
                    statusElement = document.createElement('span');
                    statusElement.classList.add('qol-status-message');
                    anchor.appendChild(statusElement);
                }
                statusElement.style.color = iqgeoGreen; // Clear greys it

                // Remove existing clear button if any
                const existingClearBtn = anchor.querySelector('.qol-term-clear-btn');
                if (existingClearBtn) {
                    existingClearBtn.remove();
                }

                // Set the message to indicate the current status
                if (savedTimestamp) {
                    const savedDate = new Date(savedTimestamp);
                    statusElement.textContent = `✓ ${shortSavedTime(savedDate)}`;
                    statusElement.title = `Terminations updated: ${savedDate.toLocaleString()}`;

                    // Add clear button for debugging
                    const clearBtn = document.createElement('button');
                    clearBtn.textContent = '×';
                    clearBtn.classList.add('qol-term-clear-btn');
                    clearBtn.title = 'Clear cached terminations for this segment';
                    
                    clearBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        clearSegmentTerminations(segment);
                    });
                    
                    anchor.appendChild(clearBtn);

                    if (!anchor.querySelector('.qol-term-legend')) {
                        const legend = document.createElement('span');
                        legend.className = 'qol-term-legend';
                        legend.innerHTML = '<span class="qol-term-dot port"></span>port <span class="qol-term-dot open"></span>open cable end &nbsp;⇄ spliced here';
                        anchor.appendChild(legend);
                    }
                } else {
                    statusElement.textContent = message;
                    statusElement.title = message === PENDING_STATUS ? 'Updating terminations' : '';
                }
                // Fixed order: an earlier render (or Clear) can leave the legend ahead of a new status or ×
                anchor.append(...['.qol-status-message', '.qol-term-clear-btn', '.qol-term-legend']
                    .map((sel) => anchor.querySelector(`:scope > ${sel}`)).filter(Boolean));
            } catch (error) {
                logger.error(FEATURE_NAME, `Error updating status message for segment: ${segment}`, error);
            }
        }

        function clearSegmentTerminations(segment) {
            try {
                // Clear rendered terminations from every row of the segment
                const rows = segmentElements(segment);
                rows.forEach((liElement) => resetSegmentAnchors(liElement));

                // Clear from in-memory batch state
                segmentBatchState.delete(segment);
                segmentOrientation.delete(segment);
                failedPins.delete(segment);

                // Clear from localStorage
                const normalizedSegment = segment.replace(/out_|in_/g, '');
                const [segmentType, segmentId] = normalizedSegment.split('/');
                const cacheKey = designCacheKey(segmentType, getCurrentDesign());
                const cacheItem = localStorage.getItem(cacheKey);
                
                if (cacheItem) {
                    try {
                        const cacheData = JSON.parse(cacheItem);
                        if (cacheData[segmentId]) {
                            delete cacheData[segmentId];
                            if (Object.keys(cacheData).length > 0) {
                                localStorage.setItem(cacheKey, JSON.stringify(cacheData));
                            } else {
                                localStorage.removeItem(cacheKey);
                            }
                            logger.debug(FEATURE_NAME, `Cleared cache for ${segment}`);
                        }
                    } catch (e) {
                        logger.warn(FEATURE_NAME, `Failed to parse cache for ${cacheKey}`, e);
                    }
                }

                // Update status message
                rows.forEach((liElement) => {
                    const anchor = segmentRowAnchor(liElement);
                    if (!anchor) return;
                    const statusElement = anchor.querySelector('.qol-status-message');
                    if (statusElement) {
                        statusElement.textContent = 'Cleared';
                        statusElement.title = '';
                        statusElement.style.color = '#999';
                    }
                    const clearBtn = anchor.querySelector('.qol-term-clear-btn');
                    if (clearBtn) {
                        clearBtn.remove();
                    }
                });

                logger.info(FEATURE_NAME, `Cleared terminations for segment: ${segment}`);
            } catch (error) {
                logger.error(FEATURE_NAME, `Error clearing segment terminations for ${segment}`, error);
            }
        }

        function determineIcon(inType, outType) {
            // TODO: Add handling to catch icons not available (paths change in future)
            // Consider dynamically pulling default icon from segment element

            try {
                if (inType === PORT && outType === PORT) {
                    return 'modules/comms/images/paths/port_to_port.svg';
                } else if (inType === PORT) {
                    return 'modules/comms/images/paths/port_to_fiber.svg';
                } else if (outType === PORT) {
                    return 'modules/comms/images/paths/fiber_to_port.svg';
                } else {
                    return 'modules/comms/images/features/fiber.svg';
                }
            } catch (error) {
                return '';
            }
        }

        async function populateSideInfo(side, forceRefresh = false) {
            const design = getCurrentDesign();
            if (side.type === 'cable') {
                const structureData = await getStructure(side, design, forceRefresh);
                return { 
                    ...side, 
                    structureData: structureData,
                    endStructureData: structureData.end_structure
                };
            }
            // else if (side.feature.startsWith(FIBER_PATCH_PANEL) || side.feature.startsWith(FIBER_ONT)) {
            else if (side.type === PORT) {
                const equipmentData = await getFeatureInfo(side.feature, design, forceRefresh);
                return {
                    ...side,
                    equipmentInfo: equipmentData,
                    housingInfo: equipmentData?.housingInfo
                };
            }
            return side;
        }
        
        function formatText(side) {
            const desc = stripPinSuffix(side.desc);
            const featureType = side.feature.split('/')[1];

            // "<text> - " when there is text, nothing otherwise (no "null" or stray spaces)
            const prefix = (text) => (text ? `${text} - ` : '');

            const formatters = { // todo: change formatter to use housing structure type instead of equipment
                ['building']: (side) => {
                    const buildingDescription = side.endStructureData?.name || side.endStructureData?.cust_name;
                    return `${prefix(buildingDescription)}${desc}, Strand ${side.pin}`;
                },
                ['fiber_patch_panel']: (side) => {
                    const housingDescription = side.housingInfo?.name || side.housingInfo?.description;
                    return `${prefix(housingDescription)}Panel ${featureType}, Port ${side.pin}`;
                },
                ['fiber_splitter']: (side) => {
                    const deviceId = side.equipmentInfo?.device_id || side.title?.replace(/^Splitter: /, '') || `Splitter ${featureType}`;
                    return `${deviceId}, Port ${side.pin}`;
                },
                ['fiber_mst']: (side) => `${prefix(endBuilding(side)?.name || endBuilding(side)?.address)}MST ${featureType}, Port ${side.pin}`,
                ['fiber_sfp']: (side) => `${prefix(endBuilding(side)?.name || endBuilding(side)?.address)}SFP ${featureType}, Port ${side.pin}`,
                ['cub_cpe']: (side) => `${prefix(endBuilding(side)?.name || endBuilding(side)?.address)}CPE ${featureType}, Port ${side.pin}`,
                ['fiber_ont']: (side) => {
                    const housingDescription = side.housingInfo?.cust_name || side.housingInfo?.name || side.housingInfo?.description;
                    return `${prefix(housingDescription)}ONT ${featureType}, Port ${side.pin}`;
                },
                ['shelf']: (side) => {
                    const housingDescription = side.housingInfo?.description;
                    return `${prefix(housingDescription)}Shelf ${featureType}, Port ${side.pin}`;
                },
                ['migration_structure']: (side) => {
                    const structureTitle = side.structureData?.end_structure_title?.replace(/^Migration Structure:\s+/, '').replace(/Splice Closure/, 'Closure') || '';
                    return `MS: ${prefix(structureTitle)}${desc}, Strand ${side.pin}`;
                },
                ['manhole']: (side) => {
                    let strStructure = 'UUB: ';
                    let strTitle = '';
                    if (side.endStructureData) {
                        strStructure = `${uubBadge(side.endStructureData.type)}: `;
                        strTitle = side.structureData?.end_structure_title?.replace(/UUB: /, '') || '';
                    }
                    return `${strStructure}${prefix(strTitle)}${desc}, Strand ${side.pin}`;
                },
                ['mywcom_route_junction']: (side) => {
                    const structureTitle = side.structureData?.end_structure_title?.replace(/Route /, '');
                    return `${structureTitle ? prefix(structureTitle) : 'Junction '}${desc}, Strand ${side.pin}`;
                },
                default: (side) => `${desc}, Strand ${side.pin}`,
            };

            let displayText = side.desc;
            let hoverText = '';

            try {
                let featureType;
                if (side.type === PORT) {
                    featureType = side.feature.split('/')[0];
                    if ((featureType === FIBER_ONT || endBuilding(side)) && side.housingInfo?.street) {
                        const h = side.housingInfo;
                        hoverText = [[h.street_num, h.street].filter(Boolean).join(' '), h.city].filter(Boolean).join(', ');
                    }
                } else if (side.type === 'cable') {
                    featureType = side.structureData.end_structure_type;
                    let featureId = side.feature.split('/')[1];
                    hoverText = `Segment - ${featureId}`;
                }
                // Get the appropriate formatter
                const formatter = formatters[featureType] || formatters.default;
                displayText = formatter(side);
            } catch (error) {
                logger.error(FEATURE_NAME, 'Error in formatText for Side:', side, error);
                throw error;
            }
        
            const element = document.createElement('span');
            element.textContent = displayText;

            // Set information to show on hover
            if (hoverText) {
                element.title = hoverText;
            }
            if (side.type === PORT) {
                element.style.color = iqgeoGreen;
                element.style.fontSize = '13px';
            }

            // Create click event to set feature in Details tab
            element.addEventListener('click', async function() {
                let featureToSet = side.feature;
                if (side.type == "cable") { // Use end structure instead of cable segment
                    featureToSet = side.side === 'in' ? side.structureData.in_structure : side.structureData.out_structure;
                }
                window.myw?.app?.setCurrentFeature(
                    await window.myw.app.database.getFeatureByUrn(featureToSet),
                    { zoomTo: true, keepFeatureSet: true, edit: false, notify: true }
                );
            });
        
            return element;
        }

        // forceRefresh may be a Map shared by one refresh (see newRefreshScope), so a feature that
        // many strands end at is fetched fresh once per refresh, not once per strand
        function newRefreshScope() {
            return new Map();
        }
        function oncePerRefresh(scope, key, run) {
            if (!scope.has(key)) {
                scope.set(key, run().catch((e) => { scope.delete(key); throw e; }));
            }
            return scope.get(key);
        }

        // Cache for promises returned by getStructure
        const structureRequests = {};
        async function getStructure(side, design = getCurrentDesign(), forceRefresh = false) {
            if (forceRefresh instanceof Map) {
                return oncePerRefresh(forceRefresh, `structure|${design}|${side.feature}:${side.side}`, () => getStructure(side, design, true));
            }
            const structure = side.feature;
            const in_or_out = side.side;
            // The end structure depends on which end of the segment, so the side is part of every key
            const requestKey = `${design}|${structure}:${in_or_out}|${forceRefresh ? 'force' : ''}`;

            if (structureRequests[requestKey]) {
                return structureRequests[requestKey];
            }

            // If there's no ongoing request, start one and store it in the cache
            structureRequests[requestKey] = (async () => {
                const [structureType, segmentId] = structure.split('/');
                const structureId = `${segmentId}:${in_or_out}`;
                let structureData;
                if (!forceRefresh) {
                    structureData = await loadFeatureInfo(`structure_${structureType}`, structureId, design);
                }

                if (!structureData) {
                    const url = `${COMPANY_URL}/feature/${structure}?display_values=true&delta=${design}&application=mywcom&lang=en-US`;
                    const data = await fetchData(url);

                    const in_structure = data.properties.in_structure;
                    const out_structure = data.properties.out_structure;

                    structureData = {
                        'in_structure': in_structure,
                        'out_structure': out_structure,
                    }

                    let end_structure = null;
                    if (in_or_out === 'in') {
                        end_structure = in_structure;
                    } else if (in_or_out === 'out') {
                        end_structure = out_structure;
                    } else {
                        const msg = `Couldn't determine end_structure`;
                        logger.error(FEATURE_NAME, msg);
                        throw new Error(msg);
                    }

                    // Send request to get end_structure data
                    const structureURL = `${COMPANY_URL}/feature/${end_structure}?display_values=true&delta=${design}&application=mywcom&lang=en-US`;
                    const responseData = await fetchData(structureURL);
                    structureData['end_structure_feature'] = end_structure.split('/')[0];
                    structureData['end_structure_title'] = responseData.myw?.title;
                    structureData['end_structure_type'] = responseData.myw?.feature_type;

                    // Send request to get end_structure data
                    const end_structure_data = await getFeatureInfo(end_structure, design, forceRefresh);
                    structureData['end_structure'] = end_structure_data;

                    // Save to localStorage
                    await saveFeatureInfo(`structure_${structureType}`, structureId, structureData, design);
                }

                return structureData;
            })();

            // When the request is complete, remove it from the cache
            return structureRequests[requestKey].finally(() => {
                delete structureRequests[requestKey];
            });
        }
        
        // Cache for promises returned by getFeatureInfo
        const featureRequests = {};
        async function getFeatureInfo(feature, design = getCurrentDesign(), forceRefresh = false) {
            if (forceRefresh instanceof Map) {
                return oncePerRefresh(forceRefresh, `feature|${design}|${feature}`, () => getFeatureInfo(feature, design, true));
            }
            const requestKey = `${design}|${feature}|${forceRefresh ? 'force' : ''}`;
            // Check if there's an ongoing request for this feature
            if (featureRequests[requestKey]) {
                return featureRequests[requestKey];
            }

            // If there's no ongoing request, start one and store it in the cache
            featureRequests[requestKey] = (async () => {
                const [featureType, featureId] = feature.split('/');
                let featureData;
                if (!forceRefresh) {
                    featureData = await loadFeatureInfo(featureType, featureId, design);
                }

                if (!featureData) {
                    // If data doesn't exist in localStorage, fetch it
                    const url = `${COMPANY_URL}/feature/${feature}?display_values=true&delta=${design}&application=mywcom&lang=en-US`;
                    const data = await fetchData(url);
            
                    // Get the list of properties to save for this featureType
                    let propertiesToSave = FEATURE_PROPERTIES[featureType];
                    if (!propertiesToSave) {
                        logger.debug(FEATURE_NAME, 'Unknown feature type:', featureType, 'feature:', feature);
                        // *Should* be available for all features
                        propertiesToSave = ['id', 'name'];
                    }
            
                    // Extract desired properties from the data
                    featureData = {};
                    for (const property of propertiesToSave) {
                        if (data?.["properties"]?.hasOwnProperty(property) === false) {
                            const msg = `${feature} does not contain property: ${property}`;
                            logger.debug(FEATURE_NAME, msg);
                        }
                        featureData[property] = data.properties[property];
                    }
            
                    // Save to localStorage
                    await saveFeatureInfo(featureType, featureId, featureData, design);
                }

                // If there is a second level feature, fetch it as well
                const rootHousing = featureData.root_housing;
                if (rootHousing && (rootHousing.startsWith('cabinet') || rootHousing.startsWith('building'))) {
                    const housingData = await getFeatureInfo(rootHousing, design, forceRefresh);  // Recursion
                    return { ...featureData, housingInfo: housingData };
                }

                return featureData;
            })();

            // When the request is complete, remove it from the cache
            return featureRequests[requestKey].finally(() => {
                delete featureRequests[requestKey];
            });
        }

        async function loadFeatureInfo(featureType, featureId, design = getCurrentDesign()) {
            // Load the data for the specified featureType (one localStorage entry per design)
            const storageKey = designCacheKey(featureType, design);
            const item = localStorage.getItem(storageKey);
            if (!item) {
                return null;
            }
            const existingData = JSON.parse(item);
            if (!existingData[featureId]) {
                return null;
            }

            const dayInMs = 24 * 60 * 60 * 1000 // 24 hours in milliseconds
            const maxTTL = 2 * dayInMs;
            const currTime = Date.now();
            const savedTime = existingData[featureId]?.saved;
            if (!savedTime) {
                return null; // Off chance something happens to localStorage saving
            }
            
            const elapsedTime = currTime - savedTime;
            if (elapsedTime > maxTTL) {
                logger.debug(FEATURE_NAME, `Cache data for ${featureType}/${featureId} expired ${elapsedTime / dayInMs} hours ago`);

                // Remove expired record from cache
                delete existingData[featureId]; // Remove element from cached featureType data object
                localStorage.setItem(storageKey, JSON.stringify(existingData)); // Update featureType cache

                return null;
            }

            return existingData[featureId].data;  // Return the data for the specified featureId
        }

        async function saveFeatureInfo(featureType, featureId, newData, design = getCurrentDesign()) {
            const storageKey = designCacheKey(featureType, design);
            try {
                // Load existing data or initialize an empty object
                let existingData = localStorage.getItem(storageKey);
                existingData = existingData ? JSON.parse(existingData) : {};
            
                // Update the data for the specified featureId
                existingData[featureId] = {
                    saved: Date.now(),
                    data: newData,
                };
            
                localStorage.setItem(storageKey, JSON.stringify(existingData));
                return existingData[featureId].data;
                
            } catch (error) {
                logger.error(FEATURE_NAME, `Unable to save info for ${featureType}/${featureId}`, error);
            }
        }

        function purgeFeatureCache(featureType, maxAgeDays = 5) {
            // Load the data for the specified featureType
            const item = localStorage.getItem(featureType);
            if (!item) return false;

            let cacheData = {};
            try {
                cacheData = JSON.parse(item);
                if (!cacheData) {
                    logger.debug(FEATURE_NAME, `Unable to parse cache for ${featureType}`);
                    return false;
                }
            } catch (error) {
                logger.debug(FEATURE_NAME, `Unable to parse cache for ${featureType}`);
                return false;
            }

            logger.debug(FEATURE_NAME, `${featureType} cache size: ${Object.keys(cacheData).length}`);

            const dayInMs = 86_400_000 // 24 hours in milliseconds
            const maxTTL = maxAgeDays * dayInMs;
            const oldestSaveTime = Date.now() - maxTTL;
            
            const validEntries = Object.entries(cacheData).filter(([key, val]) => val.hasOwnProperty('saved') && val['saved'] > oldestSaveTime);
            const outdatedCount = Object.keys(cacheData).length - validEntries.length;
            const updatedCacheData = Object.fromEntries(validEntries);

            // Return early if no change is needed
            if (outdatedCount <= 0) {
                return null;
            }

            const remainingEntries = Object.keys(updatedCacheData).length;

            try {
                // Update featureType cache
                if (remainingEntries > 0) {
                    localStorage.setItem(featureType, JSON.stringify(updatedCacheData));
                }
                // Remove empty featureType cache
                else if (remainingEntries === 0) {
                    localStorage.removeItem(featureType);
                }
            } catch (error) {
                logger.error(FEATURE_NAME, `Error updating ${featureType} cache`, error);
                throw error;
            }

            // Return how many entries remain after cleanup
            return remainingEntries;
        }
    
        function normalizeStrands(newData) {
            return Object.keys(newData).map((key) => {
                const strand = newData[key];
                const { in: inSide, out: outSide } = strand;
    
                const pinFromKey = parseInt(key, 10);
                const pinFromSides = parseInt(inSide.pin || outSide.pin, 10);
                const pin = Number.isNaN(pinFromKey) ? pinFromSides : pinFromKey;

                return {
                    pin,
                    in: {
                        desc: inSide.desc,
                        feature: inSide.feature,
                        id: inSide.id,
                        pin: inSide.pin,
                        side: inSide.side,
                        title: inSide.title,
                        type: inSide.type,
                    },
                    out: {
                        desc: outSide.desc,
                        feature: outSide.feature,
                        id: outSide.id,
                        pin: outSide.pin,
                        side: outSide.side,
                        title: outSide.title,
                        type: outSide.type,
                    },
                };
            });
        }

        function mergeBatchStrands(segment, fiberCount, batchStrands, savedTimestamp) {
            const state = segmentBatchState.get(segment) || { strands: new Array(fiberCount), saved: savedTimestamp, fiberCount };
            // Growing (e.g. the real fiber count arrives after the cache) must keep what's already merged
            const merged = state.strands.length >= fiberCount ? state.strands : Object.assign(new Array(fiberCount), state.strands);
            batchStrands.forEach((strand) => {
                const pin = Number(strand.pin);
                const idx = Number.isFinite(pin) ? Math.max(0, pin - 1) : merged.length;
                merged[idx] = strand;
            });
            segmentBatchState.set(segment, { strands: merged, saved: savedTimestamp || state.saved, fiberCount });
            return segmentBatchState.get(segment);
        }

        async function fetchSegmentBatch({ segment, startPin, endPin, design }) {
            const url = `${COMPANY_URL}/modules/comms/fiber/paths/${segment}?pins=in%3A${startPin}%3A${endPin}&full=false&delta=${design}&application=mywcom&lang=en-US`;
            const timeoutMs = TERMINATION_TIMEOUT_BASE_MS + TERMINATION_TIMEOUT_PER_PIN_MS * (endPin - startPin + 1);
            return fetchData(url, { timeoutMs });
        }

        // Mark a strand row whose trace failed, so it reads as done rather than still loading
        function showFailedStrand(segment, pin, reason) {
            openSegmentElements(segment).forEach((li) => markFailedStrandRow(segment, li, pin, reason));
        }

        function markFailedStrandRow(segment, li, pin, reason) {
            const anchor = indexStrandAnchors(li)[pin];
            if (!anchor) return;
            try {
                const row = prepareStrandLayout(anchor, pin);
                const marker = document.createElement('span');
                marker.className = 'qol-term-failed';
                marker.textContent = '⚠ trace failed';
                marker.title = reason;
                row.querySelector('.qol-term-near').replaceChildren(marker);
                row.querySelector('.qol-term-arrow').textContent = '';
                row.querySelector('.qol-term-far').replaceChildren();
                row.classList.remove('qol-term-has-path');
                scheduleRefresh(li);
            } catch (error) {
                logger.warn(FEATURE_NAME, `Unable to mark failed strand ${pin} in ${segment}`, error);
            }
        }

        // /fiber/paths/ returns 500 for some strands (e.g. a splice from a segment end back to
        // itself), while trace_out still works. Use its tree to explain the failure on hover.
        async function diagnoseFailedStrand(segment, pin, design) {
            const fallback = 'IQGeo could not trace this strand (its own "Show terminations" fails too). "Trace both" may show where the path breaks.';
            const from = encodeURIComponent(`${segment}?pins=in:${pin}`);
            const url = `${COMPANY_URL}/network/mywcom_fiber/trace_out?from=${from}&direction=both&result_type=tree&max_nodes=20000&delta=${design}&application=mywcom&lang=en-US`;
            try {
                const data = await fetchData(url, { timeoutMs: 30000 });
                // Same checks as the GIS team's search filters: an overlapping same-end splice is
                // always wrong; a same-end loopback or a cable spliced to its own other end may be intentional.
                const errors = [];
                const possible = [];
                Object.entries(data?.features || {}).forEach(([urn, f]) => {
                    const p = f?.properties;
                    if (!urn.startsWith('mywcom_fiber_connection/') || !p || p.in_object !== p.out_object) return;
                    const where = [f.display_values?.housing || p.housing, f.display_values?.root_housing || p.root_housing].filter(Boolean).join(', ');
                    const span = (lo, hi) => (lo === hi ? `${lo}` : `${lo}–${hi}`);
                    const ranges = `fibers ${span(p.in_low, p.in_high)} ↔ ${span(p.out_low, p.out_high)}`;
                    const at = `at ${where} (${urn})`;
                    if (p.in_side !== p.out_side) {
                        possible.push(`the cable's two ends are spliced together (${ranges}) ${at}`);
                    } else if (p.in_low === p.out_low) {
                        errors.push(p.in_low === p.in_high
                            ? `fiber ${p.in_low} is spliced to itself ${at}`
                            : `fibers ${span(p.in_low, p.in_high)} are spliced to themselves ${at}`);
                    } else if (p.in_low <= p.out_high && p.out_low <= p.in_high) {
                        errors.push(`overlapping splice on one cable end (${ranges}), so some fibers are spliced twice, ${at}`);
                    } else {
                        possible.push(`loopback on one cable end (${ranges}) ${at}`);
                    }
                });
                if (errors.length) {
                    const also = possible.length ? `\nAlso check (may be intentional):\n${possible.join('\n')}` : '';
                    return `Trace failed: ${errors.join('\n')}\nFixing ${errors.length > 1 ? 'those connections' : 'that connection'} in IQGeo should fix the trace.${also}`;
                }
                if (possible.length) {
                    return `Trace failed. Possible cause (may be intentional):\n${possible.join('\n')}`;
                }
                return fallback;
            } catch (error) {
                logger.debug(FEATURE_NAME, `trace_out diagnosis failed for ${segment} pin ${pin}`, error);
                return fallback;
            }
        }

        // Pin of the strand row nearest the middle of the visible tree (null if not rendered)
        function visibleCenterPin(segment) {
            const rows = openSegmentElements(segment).flatMap((li) => [...li.querySelectorAll('li.jstree-leaf > a.jstree-anchor[data-qol-pin]')]);
            if (!rows.length) return null;
            const container = findScrollContainer(rows[0]);
            const isPage = container === document.scrollingElement || container === document.documentElement;
            const box = isPage ? { top: 0, bottom: window.innerHeight } : container.getBoundingClientRect();
            const mid = (box.top + box.bottom) / 2;
            let best = null;
            let bestDist = Infinity;
            rows.forEach((a) => {
                const r = a.getBoundingClientRect();
                if (!r.height) return;
                const dist = Math.abs((r.top + r.bottom) / 2 - mid);
                if (dist < bestDist) { bestDist = dist; best = parseInt(a.dataset.qolPin, 10); }
            });
            return best;
        }

        // Fiber count per cable for this page session (one feature request per cable)
        const cableFiberCounts = new Map(); // `${design}|${cable or segment}` -> Promise<count>
        function getCableFiberCount(segment, cable, design) {
            const key = `${design}|${cable || segment}`;
            if (!cableFiberCounts.has(key)) {
                const featureUrl = (urn) => `${COMPANY_URL}/feature/${urn}?display_values=true&delta=${design}&application=mywcom&lang=en-US`;
                const request = (async () => {
                    const cableUrn = cable || (await fetchData(featureUrl(segment)))?.properties?.cable;
                    if (!cableUrn) return 0;
                    return Number((await fetchData(featureUrl(cableUrn)))?.properties?.fiber_count) || 0;
                })().catch((error) => {
                    logger.debug(FEATURE_NAME, `Unable to get fiber count for ${cable || segment}`, error);
                    return 0;
                }).then((count) => {
                    if (!count) cableFiberCounts.delete(key); // retry next time
                    return count;
                });
                cableFiberCounts.set(key, request);
            }
            return cableFiberCounts.get(key);
        }

        // Cache for promises returned by getSegment
        const segmentRequests = {};
        async function getSegment({segment, cable, fiberCount, interceptedData}, forceRefresh = false) {
            // Don't fetch/render if feature is disabled
            if (!featureManager.isEnabled("Auto Terminations")) {
                return Promise.resolve({ saved: null, data: [] });
            }
            
            // Requests and state are per design (see syncDesignState)
            const design = getCurrentDesign();
            syncDesignState(design);
            const requestKey = `${design}|${segment}`;

            // Check if there's an ongoing request for this segment
            if (segmentRequests[requestKey]) {
                if (!interceptedData) {
                    renderMissingRows(segment); // called again because the tree was rebuilt mid-load
                    return segmentRequests[requestKey];
                }
                // IQGeo's own trace arrived while ours is loading: render it now and save it once ours
                // finishes, since the in-flight request may return early without saving.
                const interceptedStrands = normalizeStrands(interceptedData);
                const known = segmentBatchState.get(segment);
                mergeBatchStrands(segment, known?.fiberCount || interceptedStrands.length, interceptedStrands, Date.now());
                showTerminations(segment, interceptedStrands, { forceRefresh: newRefreshScope() });
                return segmentRequests[requestKey].then(async (result) => {
                    if (getCurrentDesign() !== design) return result;
                    const [segmentType, segmentId] = segment.replace(/in|out/, '').split('/');
                    const strands = segmentBatchState.get(segment)?.strands.filter(Boolean) || [];
                    if (strands.length) await saveFeatureInfo(segmentType, segmentId, strands, design);
                    return result;
                });
            }

            if (isSegmentExpanded(segment)) {
                displayStatusMessage(segment, PENDING_STATUS);
                prepareSegment(segment); // align rows before any batch arrives
                onStickyScroll();
            } else {
                // Do not start work unless expanded
                return Promise.resolve({ saved: null, data: [] });
            }
            
            // If there's no ongoing request, start one and store it in the cache
            segmentRequests[requestKey] = (async () => {
                logger.log(FEATURE_NAME, `Getting segment: ${segment}, forceRefresh: ${forceRefresh}`);
                const refresh = forceRefresh ? newRefreshScope() : false; // shared by every render of this load
                if (forceRefresh) {
                    segmentBatchState.delete(segment);
                    failedPins.delete(segment);
                }
                
                const [segmentType, segmentId] = segment.replace(/in|out/, '').split('/');
                let segmentData;
                let cachedSaved = null;

                if (!forceRefresh) {
                    const state = segmentBatchState.get(segment);
                    if (state && Array.isArray(state.strands) && state.strands.length > 0) {
                        segmentData = { saved: state.saved || Date.now(), data: state.strands.filter(Boolean) };
                    }
                    if (!segmentData) {
                        const cached = await loadFeatureInfo(segmentType, segmentId, design);
                        if (cached) {
                            try {
                                const cacheRaw = JSON.parse(localStorage.getItem(designCacheKey(segmentType, design)) || "{}");
                                cachedSaved = cacheRaw?.[segmentId]?.saved || null;
                            } catch (e) {
                                /* ignore cache parse issues */
                            }
                            segmentData = { saved: cachedSaved, data: cached };
                        }
                    }
                }

                // Show cached immediately
                const cachedStrands = segmentData?.data || [];
                if (cachedStrands.length) {
                    const savedTs = segmentData.saved || Date.now();
                    mergeBatchStrands(segment, fiberCount || segmentBatchState.get(segment)?.fiberCount || cachedStrands.length, cachedStrands, savedTs);
                    showTerminations(segment, cachedStrands);
                    displayStatusMessage(segment, null, savedTs);
                }

                // Fiber count: the cable's own count; the highest known pin only as a last resort,
                // since strands at the end that failed earlier would otherwise never be fetched
                if (!fiberCount && !interceptedData) {
                    fiberCount = await getCableFiberCount(segment, cable, design);
                }
                if (!fiberCount) {
                    fiberCount = segmentBatchState.get(segment)?.fiberCount || 0;
                }
                if (!fiberCount && cachedStrands.length) {
                    const pins = cachedStrands.map((s) => parseInt(s.pin, 10)).filter(Number.isFinite);
                    fiberCount = Math.max(...pins, 0);
                }

                // Determine missing pins from current state/cache
                const currentStrands = segmentBatchState.get(segment)?.strands || cachedStrands;
                const knownPins = new Set(
                    (currentStrands || []).map((s) => parseInt(s?.pin, 10)).filter(Number.isFinite)
                );
                const missingPins = [];
                const knownFailed = failedPins.get(segment);
                if (fiberCount) {
                    for (let pin = 1; pin <= fiberCount; pin++) {
                        if (!knownPins.has(pin) && !knownFailed?.has(pin)) {
                            missingPins.push(pin);
                        }
                    }
                }
                logger.debug(FEATURE_NAME, 'missingPins', segment, missingPins.length ? `${missingPins[0]}-${missingPins[missingPins.length - 1]} (count ${missingPins.length})` : 'none');

                knownFailed?.forEach((reason, pin) => showFailedStrand(segment, pin, reason));

                // Nothing missing: finalize status and return
                if (!missingPins.length && segmentData) {
                    displayStatusMessage(segment, null, segmentData.saved);
                    return segmentData;
                }

                let newData;
                if (!interceptedData) {
                    const baseBatchSize = Math.max(1, TERMINATION_BATCH_SIZE);

                    const buildRangesFromPins = (pins, batchSize) => {
                        const sorted = [...pins].sort((a, b) => a - b);
                        const ranges = [];
                        let start = null;
                        let end = null;
                        for (let i = 0; i < sorted.length; i++) {
                            const pin = sorted[i];
                            if (start === null) {
                                start = end = pin;
                                continue;
                            }
                            const nextSize = (pin - start) + 1;
                            if (pin === end + 1 && nextSize <= batchSize) {
                                end = pin;
                            } else {
                                ranges.push({ startPin: start, endPin: end });
                                start = end = pin;
                            }
                        }
                        if (start !== null) {
                            ranges.push({ startPin: start, endPin: end });
                        }
                        return ranges;
                    };

                    // Shared queue: a failing range is split in half and both halves go back
                    // in the queue, so other workers can take them and concurrency stays capped.
                    const queue = buildRangesFromPins(missingPins, baseBatchSize);
                    const renders = [];

                    // Take the range nearest the rows on screen, so what the user sees fills first
                    const takeNext = () => {
                        const center = visibleCenterPin(segment);
                        let pick = 0;
                        if (center !== null) {
                            const dist = ({ startPin, endPin }) => (center < startPin ? startPin - center : center > endPin ? center - endPin : 0);
                            queue.forEach((r, i) => { if (dist(r) < dist(queue[pick])) pick = i; });
                        }
                        return queue.splice(pick, 1)[0];
                    };

                    const fetchRange = async (startPin, endPin) => {
                        try {
                            const batchData = await fetchSegmentBatch({ segment, startPin, endPin, design });
                            if (getCurrentDesign() !== design) return; // design switched mid-load; drop stale results
                            const batchStrands = normalizeStrands(batchData);
                            mergeBatchStrands(segment, fiberCount, batchStrands, Date.now());
                            renders.push(showTerminations(segment, batchStrands, { forceRefresh: refresh }));
                            ensurePendingStatus(segment);
                            logger.debug(FEATURE_NAME, `batch ${startPin}-${endPin} ok for ${segment} (seq ${renderSequence})`);
                        } catch (err) {
                            if (getCurrentDesign() !== design) return;
                            // Suppress batch split warnings; only log single strand failures
                            if (endPin > startPin) {
                                const mid = Math.floor((startPin + endPin) / 2);
                                queue.push({ startPin, endPin: mid }, { startPin: mid + 1, endPin });
                            } else {
                                if (!failedPins.has(segment)) failedPins.set(segment, new Map());
                                const failures = failedPins.get(segment);
                                failures.set(startPin, 'Trace failed. Checking why…');
                                showFailedStrand(segment, startPin, failures.get(startPin));
                                logger.warn(FEATURE_NAME, `strand ${startPin} failed for ${segment}`, err);
                                diagnoseFailedStrand(segment, startPin, design).then((reason) => {
                                    if (failedPins.get(segment) !== failures) return; // cleared or refreshed meanwhile
                                    failures.set(startPin, reason);
                                    showFailedStrand(segment, startPin, reason);
                                });
                            }
                        }
                    };

                    // Keep up to MAX_CONCURRENCY requests in flight; each finish refills the slots
                    // (a split may have queued new halves). fetchRange never rejects.
                    let active = 0;
                    let finish;
                    const allDone = new Promise((resolve) => { finish = resolve; });
                    const topUp = () => {
                        while (active < TERMINATION_MAX_CONCURRENCY && queue.length) {
                            active++;
                            const { startPin, endPin } = takeNext();
                            fetchRange(startPin, endPin).finally(() => {
                                active--;
                                topUp();
                                if (!active && !queue.length) finish();
                            });
                        }
                    };
                    topUp();
                    if (!active) finish();
                    await allDone;
                    await Promise.all(renders);
                    if (getCurrentDesign() === design) await renderMissingRows(segment);

                    const mergedState = segmentBatchState.get(segment);
                    newData = mergedState ? mergedState.strands.filter(Boolean) : [];
                } else {
                    // IQGeo's own trace (e.g. "Show terminations"): render it now, not only on the next load
                    const interceptedStrands = normalizeStrands(interceptedData);
                    mergeBatchStrands(segment, fiberCount || interceptedStrands.length, interceptedStrands, Date.now());
                    showTerminations(segment, interceptedStrands, { forceRefresh: refresh });
                    newData = segmentBatchState.get(segment).strands.filter(Boolean);
                }

                segmentData = {
                    saved: Date.now(),
                    data: newData
                };
    
                if (getCurrentDesign() !== design) return null; // design switched mid-load; state now belongs to the new design
                await saveFeatureInfo(segmentType, segmentId, newData, design); // 2025-11-17: Changed to save 'strands' instead of 'segmentData' to fix accidentally nesting in localStorage
        
                return segmentData;
            })().then(result => {
                if (!result) return { saved: null, data: [] };
                displayStatusMessage(segment, null, result.saved);
                return result;
            });

            // When the request is complete, remove it from the cache
            return segmentRequests[requestKey].finally(() => {
                delete segmentRequests[requestKey];
            });
        } // todo: rename segmentData to terminationData and move related code to separate function (getTerminations?)
        
        async function getRouteSegments(data) {
            const segments = data.cable_segs?.features;
            const cables = data.cables?.features;
            
            const routeSegments = segments.map((routeSegment) => {
                const segment = `mywcom_fiber_segment/${routeSegment.id}`;
                const cable = routeSegment.properties.cable;
                const cableId = cable.split('/')[1];
                const fiberCount = cables.find((c) => c.id == cableId)?.properties.fiber_count;
                return { segment, cable, fiberCount };
            });

            // Defer fetching until the segment is expanded; listeners handle it
            routeSegments.forEach(({ segment, cable, fiberCount }) => {
                if (isSegmentExpanded(segment)) {
                    getSegment({ segment, cable, fiberCount });
                }
            });
        }

        function abortableTimeoutController(timeoutMs) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(`timeout_${timeoutMs}`), timeoutMs);
            return {
                controller,
                clear: () => clearTimeout(timeoutId),
            };
        }

        // Helper function to fetch data
        async function fetchData(url, { timeoutMs } = {}) {
            const timeout = timeoutMs ? abortableTimeoutController(timeoutMs) : null;
            try {
                const init = { [QOL_OWN_REQUEST]: true };
                if (timeout) init.signal = timeout.controller.signal;
                const response = await fetch(url, init);
                const data = await response.json();
                return data;
            } catch (error) {
                // Don't log here - let the caller (fetchRange) handle logging for single-strand failures only
                throw error;
            } finally {
                timeout?.clear();
            }
        }

        function getCurrentDesign() {
            const currentDeltaEl = document.querySelector('div.delta-owner-map-watermark-text');
            if (currentDeltaEl) {
                return `design%2F${currentDeltaEl.textContent?.split(": ")[1]}`;
            }

            return '';
        }
    
        function setupTreeListeners() {
            patchCableTreeHandlers();
            patchCableTreeShow();
        }

        function patchCableTreeHandlers() {
            // Each view is patched once; the route view can be created after the struct view
            const cableTree = window.myw?.app?.plugins?.cableTree;
            const treeViews = [
                [cableTree?.structCableTreeView, 'struct'],
                [cableTree?.routeTreeView, 'route']
            ].filter(([tv]) => tv && !patchedTreeViews.has(tv));
            if (!treeViews.length) return;

            const patchOne = (treeView, label) => {
                if (!treeView || typeof treeView.setEventHandlers !== 'function') return;
                const original = treeView.setEventHandlers.bind(treeView);
                treeView.setEventHandlers = function (...args) {
                    original(...args);
                    try {
                        const $tree = this.container;
                        if (!$tree || typeof $tree.on !== 'function') return;
                        const inst = typeof $tree.jstree === 'function' ? $tree.jstree(true) : null;
                        if (!inst || inst === true || inst === false || typeof inst.get_node !== 'function') return;

                        const renderOpenNodes = () => {
                            const openNodes = $tree.find('li.jstree-open[id*="mywcom_fiber_segment/"]');
                            openNodes.each((_, li) => {
                                const node = inst.get_node(li);
                                if (!node) return;
                                const segment = node.id.replace(/out_|in_/g, '');
                                let cable = null;
                                let parentId = node.parent;
                                while (parentId) {
                                    const parentNode = inst.get_node(parentId);
                                    if (parentNode && parentNode.id && parentNode.id.startsWith('fiber_cable')) {
                                        cable = parentNode.id;
                                        break;
                                    }
                                    parentId = parentNode ? parentNode.parent : null;
                                }
                                getSegment({ segment, cable });
                            });
                        };

                        $tree.off(`open_node.jstree.qolTerm.${label}`);
                        $tree.on(`open_node.jstree.qolTerm.${label}`, (_e, data) => {
                            const node = data?.node;
                            if (!node || !node.id || !node.id.includes('mywcom_fiber_segment/')) return;
                            const segment = node.id.replace(/out_|in_/g, '');
                            let cable = null;
                            let parentId = node.parent;
                            while (parentId) {
                                const parentNode = inst.get_node(parentId);
                                if (parentNode && parentNode.id && parentNode.id.startsWith('fiber_cable')) {
                                    cable = parentNode.id;
                                    break;
                                }
                                parentId = parentNode ? parentNode.parent : null;
                            }
                            logger.debug(FEATURE_NAME, `[${label}] open_node`, node.id, '->', segment, 'cable', cable);
                            getSegment({ segment, cable });
                        });

                        const scanEvents = `state_ready.jstree.qolTerm.${label} loaded.jstree.qolTerm.${label} redraw.jstree.qolTerm.${label} refresh.jstree.qolTerm.${label}`;
                        $tree.off(scanEvents);
                        $tree.on(scanEvents, (e) => {
                            logger.debug(FEATURE_NAME, `[${label}]`, e.type, 'scan open nodes');
                            renderOpenNodes();
                        });
                    } catch (err) {
                        logger.error(FEATURE_NAME, `Termination handler error (patched setEventHandlers ${label})`, err);
                    }
                };
            };

            treeViews.forEach(([tv, label]) => {
                patchOne(tv, label);
                applyGeomRepForPatch(tv);
                patchedTreeViews.add(tv);
            });
        }

        function patchCableTreeShow() {
            if (cableTreeShowPatched) return;
            const cableTree = window.myw?.app?.plugins?.cableTree;
            if (!cableTree || typeof cableTree.showTree !== 'function') return;
            const original = cableTree.showTree.bind(cableTree);
            cableTree.showTree = function (...args) {
                logger.debug(FEATURE_NAME, 'cableTree.showTree called', args[2]);
                const res = original(...args);
                try {
                    setTimeout(() => setupTreeListeners(), 0);
                    setTimeout(() => setupTreeListeners(), 500);
                    setTimeout(() => setupTreeListeners(), 1500);
                } catch (err) {
                    logger.error(FEATURE_NAME, 'showTree hook error', err);
                }
                return res;
            };
            cableTreeShowPatched = true;
        }

        async function setupMutationObserver() {
            enableStickyHeaders();
            if (termMutationObserver) {
                return;
            }

            // Fallback: watch for late-mounted tree and bind listeners
            termMutationObserver = new MutationObserver(() => {
                setupTreeListeners();
            });
    
            // Wait for document.body to be available
            try {
                const targetNode = await waitFor(() => document.body, { timeoutMs: 10000, intervalMs: 100 });
                termMutationObserver.observe(targetNode, { childList: true, subtree: true });
            } catch (error) {
                logger.warn(FEATURE_NAME, 'Timeout waiting for document.body, falling back to documentElement');
                // Fallback to documentElement if body takes too long
                if (document.documentElement) {
                    termMutationObserver.observe(document.documentElement, { childList: true, subtree: true });
                }
            }
        }

        function stopObserving() {
            if (termMutationObserver) {
                termMutationObserver.disconnect();
                termMutationObserver = null;
            }
            // Clean up all termination UI when stopping
            disableStickyHeaders();
            cleanupTerminationUI();
        }
        
        function cleanupTerminationUI() {
            // Remove all injected termination elements from the tree
            document.querySelectorAll('a.jstree-anchor.qol-term, a.jstree-anchor.qol-term-layout').forEach((anchor) => {
                anchor.classList.remove('qol-term', 'qol-term-layout');
                delete anchor.dataset.qolPin;
                if (anchor.dataset.qolOriginalHtml) {
                    anchor.innerHTML = anchor.dataset.qolOriginalHtml;
                }
            });
            document.querySelectorAll('.qol-term-row, .qol-status-message, .qol-term-clear-btn, .qol-term-legend').forEach((el) => el.remove());
            document.querySelectorAll('li[style*="--qol-term"]').forEach((li) => {
                TERM_COLUMN_VARS.forEach((v) => li.style.removeProperty(v));
            });
            segmentOrientation.clear();
        }
    
        if (typeof window !== 'undefined') {
            window.qolTerminations = {
                settings: () => loadTermDisplay(),
                set: (key, value) => {
                    if (!(key in TERM_DISPLAY_DEFAULTS)) {
                        console.warn(`[qolTerminations] Unknown setting "${key}". Use: ${Object.keys(TERM_DISPLAY_DEFAULTS).join(', ')}`);
                        return;
                    }
                    const next = { ...loadTermDisplay(), [key]: value };
                    try { localStorage.setItem(TERM_DISPLAY_KEY, JSON.stringify(next)); } catch (e) { /* storage unavailable */ }
                    applyTermDisplay(next);
                    remeasureAllSegments();
                    onStickyScroll();
                    return next;
                },
                help: () => console.log([
                    '[qolTerminations] Display settings:',
                    '  qolTerminations.set("spliceText", "full")   - show IQGeo splice text in full ("compact" = chip)',
                    '  qolTerminations.set("secondary", false)     - hide the muted second name (shown in hover)',
                    '  qolTerminations.set("stickyHeader", false)  - stop pinning the open cable and segment rows',
                    '  qolTerminations.set("repeats", "bold")      - names repeating the row above: "fade" (default), "bold" run starts, "none"',
                    '  qolTerminations.settings()                  - current settings'
                ].join('\n'))
            };
        }

        return {
            setupMutationObserver: setupMutationObserver,
            setupTreeListeners: setupTreeListeners,
            stopObserving: stopObserving,
            getRouteSegments: getRouteSegments,
            getSegment: getSegment,
            _debugSegmentRequests: segmentRequests
        };
    })();

    var featureHorizontalMenu = (function() {
        // Configuration constants
        const DIALOG_WIDTH_PERCENT = 0.75;  // Dialog width as percentage of viewport (75%)
        const CUSTOMIZATION_DELAY_MS = 200; // Delay before customizing dialog to ensure DOM is ready
        const COLUMN_MIN_WIDTH_PX = 120;     // Minimum width for each column
        const COLUMN_GAP_PX = 15;            // Gap between columns
        
        let originalGetContents = null;
        let originalShowDialog = null;
        let patchApplied = false;
        let styleElement = null;
        let isStarted = false;

        // Base CSS - improves original dialog (always active, never removed)
        var baseStyles = `
            /* Original vertical dialog improvements */
            .ui-dialog:has(.createFeature-dialog) {
                top: 10% !important;
            }
            
            .createFeature-dialog {
                max-height: 70vh !important;
                overflow-y: auto !important;
            }
        `;
        
        // Feature CSS - horizontal menu specific (removed on stop)
        var featureStyles = `
            .menu-container {
                display: flex !important;
                height: 500px !important;
                gap: ${COLUMN_GAP_PX}px !important;
            }

            .menu-column {
                flex: 0 1 auto !important;
                min-width: ${COLUMN_MIN_WIDTH_PX}px !important;
                padding-right: 10px !important;
                border-right: 1px solid #ddd !important;
            }

            .menu-column:last-child {
                border-right: none !important;
            }

            .menu-section {
                font-weight: bold !important;
                margin-bottom: 10px !important;
                padding-bottom: 5px !important;
                border-bottom: 1px solid #eee !important;
                text-align: center !important;
            }

            .menu-items {
                list-style-type: none !important;
                padding: 0 !important;
                margin: 0 !important;
                overflow-y: auto;
                height: 90%;
            }

            .menu-container .menu-column .menu-items li {
                padding: 0 !important;
                margin: 0px 0px 8px 0px !important;
                line-height: 1.4 !important;
                border-radius: 3px !important;
            }

            .menu-container .menu-column .menu-items li:hover {
                background-color: #f5f5f5 !important;
            }

            /* Horizontal menu styling (when feature enabled and customized) */
            .ui-dialog.qol-horizontal-menu {
                position: fixed !important;
                top: 50% !important;
                left: 50% !important;
                transform: translate(-50%, -50%) !important;
                opacity: 1 !important;
            }

            .ui-dialog.qol-horizontal-menu .ui-dialog-titlebar {
                cursor: default !important;
            }
        `;
        
        let baseStyleElement = null;
        let featureStyleElement = null;

        // Inject base styles immediately (original dialog improvements always active)
        (function injectBaseStyles() {
            if (!baseStyleElement) {
                baseStyleElement = document.createElement('style');
                baseStyleElement.textContent = baseStyles;
                document.head.appendChild(baseStyleElement);
            }
        })();

        function injectStyles() {
            // Inject feature styles (removed on stop)
            if (!featureStyleElement) {
                featureStyleElement = document.createElement('style');
                featureStyleElement.textContent = featureStyles;
                document.head.appendChild(featureStyleElement);
            }
        }
        
        function removeStyles() {
            // Only remove feature-specific styles, keep base styles for original dialog
            if (featureStyleElement && featureStyleElement.parentNode) {
                featureStyleElement.parentNode.removeChild(featureStyleElement);
                featureStyleElement = null;
            }
        }

        // Function to transform jQuery content into horizontal layout
        function transformContent(content) {
            try {
                // Clone to avoid mutating original
                const $content = $(content).clone();
                
                // Create the new menu container
                const menuContainer = $('<div>', { class: 'menu-container' });
                
                // Find all sections (dividers)
                const sections = $content.find('.comms-feature-divider').toArray();
                
                sections.forEach((section) => {
                    const $section = $(section);
                    const column = $('<div>', { class: 'menu-column' });
                    
                    const sectionTitle = $section.find('.comms-divider-label').text();
                    const menuItems = [];
                    
                    // Get all items until next divider
                    let $next = $section.next();
                    while ($next.length && !$next.hasClass('comms-feature-divider')) {
                        if ($next.is('li')) {
                            menuItems.push($next.clone());
                        } else if ($next.is('ul')) {
                            $next.find('li').each(function() {
                                menuItems.push($(this).clone());
                            });
                        }
                        $next = $next.next();
                    }
                    
                    if (sectionTitle && menuItems.length > 0) {
                        const ul = $('<ul>', { class: 'createFeature-menu menu-items' });
                        menuItems.forEach(item => ul.append(item));
                        
                        column.append($('<div>', { class: 'menu-section', text: sectionTitle }));
                        column.append(ul);
                        menuContainer.append(column);
                    }
                });
                
                return menuContainer;
            } catch (error) {
                console.warn('[Alt Add Object Menu] Failed to transform content:', error);
                return content; // Return original on error
            }
        }

        function patchShowDialog() {
            const createFeaturePlugin = window.myw?.app?.plugins?.createFeature;
            if (!createFeaturePlugin || typeof createFeaturePlugin.showDialog !== 'function') {
                console.log('[Alt Add Object Menu] showDialog not available');
                return false;
            }

            // Store original method
            originalShowDialog = createFeaturePlugin.showDialog.bind(createFeaturePlugin);

            // Patch to resize and customize dialog after creation
            createFeaturePlugin.showDialog = function(...args) {
                // Reset dialog state BEFORE opening (for reused dialogs)
                const existingDialog = $('.createFeature-dialog').parent('.ui-dialog');
                if (existingDialog.length) {
                    existingDialog.removeClass('qol-horizontal-menu');
                    existingDialog.css('opacity', '0'); // Hide during customization
                }
                
                const result = originalShowDialog.apply(this, args);
                
                setTimeout(() => {
                    try {
                        const dialog = $('.createFeature-dialog');
                        const dialogWidget = dialog.parent('.ui-dialog');
                        
                        if (!dialogWidget.length) return; // Dialog not ready, skip customization
                        
                        // Hide during customization
                        dialogWidget.css('opacity', '0');
                        
                        const viewportWidth = $(window).width();
                        const newWidth = Math.floor(viewportWidth * DIALOG_WIDTH_PERCENT);
                        
                        // Add class for CSS positioning
                        dialogWidget.addClass('qol-horizontal-menu');
                        
                        // Set width with !important via inline style
                        const originalStyle = dialogWidget.attr('style') || '';
                        const newStyle = originalStyle + '; width: ' + newWidth + 'px !important;';
                        dialogWidget.attr('style', newStyle);
                        
                        // Show dialog
                        dialogWidget.css('opacity', '1');
                        
                        // Override rePosition to maintain centering
                        if (this.addObjectDialog) {
                            this.addObjectDialog.rePosition = function() {
                                return true; // CSS handles positioning
                            };
                        }
                        
                        // Disable dragging
                        if (dialog.length && dialog.dialog) {
                            try {
                                dialog.dialog('option', 'draggable', false);
                                dialogWidget.removeClass('ui-draggable'); // Remove class to fix cursor
                            } catch (e) {
                                console.error('[Alt Add Object Menu] Could not disable dragging:', e);
                            }
                        }
                    } catch (e) {
                        console.error('[Alt Add Object Menu] Error customizing dialog:', e);
                    }
                }, CUSTOMIZATION_DELAY_MS);
                
                return result;
            };

            return true;
        }

        function unpatchShowDialog() {
            if (!originalShowDialog) return;

            const createFeaturePlugin = window.myw?.app?.plugins?.createFeature;
            if (createFeaturePlugin) {
                createFeaturePlugin.showDialog = originalShowDialog;
            }

            originalShowDialog = null;
        }

        function patchGetContents() {
            const createFeaturePlugin = window.myw?.app?.plugins?.createFeature;
            if (!createFeaturePlugin || typeof createFeaturePlugin.getContents !== 'function') {
                console.log('[Alt Add Object Menu] createFeature plugin not ready');
                return false;
            }

            if (patchApplied) {
                return true;
            }

            // Store original method
            originalGetContents = createFeaturePlugin.getContents.bind(createFeaturePlugin);

            // Patch the method to transform content before returning
            createFeaturePlugin.getContents = function(...args) {
                return originalGetContents.apply(this, args).then(content => {
                    
                    // If content is a jQuery element with the menu class, transform it
                    if (content && content.jquery && content.hasClass('createFeature-menu')) {
                        return transformContent(content);
                    }
                    
                    // Otherwise return as-is (for error messages, etc.)
                    return content;
                });
            };

            patchApplied = true;
            return true;
        }

        function unpatchGetContents() {
            if (!patchApplied || !originalGetContents) return;

            const createFeaturePlugin = window.myw?.app?.plugins?.createFeature;
            if (createFeaturePlugin) {
                createFeaturePlugin.getContents = originalGetContents;
            }

            originalGetContents = null;
            patchApplied = false;
        }

        function applyPatches() {
            const createFeaturePlugin = window.myw?.app?.plugins?.createFeature;
            if (!createFeaturePlugin) {
                return false;
            }

            if (patchApplied) {
                return true;
            }
            
            const contentsPatched = patchGetContents();
            const dialogPatched = patchShowDialog();
            
            if (contentsPatched && dialogPatched) {
                patchApplied = true;
                return true;
            }
            
            return false;
        }

        function removePatches() {
            unpatchGetContents();
            unpatchShowDialog();
        }

        return {
            start: function() {
                if (isStarted) return; // Prevent multiple starts
                isStarted = true;
                injectStyles();
                
                runWhenReady("#a-createFeature", () => {
                    if (!applyPatches()) {
                        console.error('[Alt Add Object Menu] Failed to initialize');
                    }
                });
            },
            stop: function() {
                removePatches();
                removeStyles();
                isStarted = false;
            }
        };
    })();

    // test - intercepting path finder results
    // const OldEventSource = EventSource;
    // EventSource = function(url, options) {
    //     console.log(`EventSource created with URL ${url}`);
    //     console.trace();  // Add this line
    //     const es = new OldEventSource(url, options);

    //     es.addEventListener('end', function(event) {
    //         console.log('Stream ended', event.data);
    //     });

    //     return es;
    // };


    // April Fools Feature
    const aprilFoolsFeature = (() => {

        // Timing configuration - adjust here to tune behaviour. All times in minutes.
        const TIMING = {
            initialDelay:  { min: 2, max: 4  },  // Wait before first timed prank fires
            prankCooldown: { min: 5, max: 10  },  // Gap between end of one prank and start of next
        };

        function randMinutes(min, max) {
            return (min + Math.random() * (max - min)) * 60 * 1000;
        }

        // Safety net: prevents mapTilt and upsideDownMap from overlapping if stop() is
        // called mid-play (which bypasses the scheduler). The scheduler itself already
        // ensures only one timed prank runs at a time.
        let mapTransformActive = false;

        // Discovery tracking:
        // Tracks which pranks have been seen at least once. When every ID in
        // ALL_PRANK_IDS has triggered, the 'Funny Day 🤪' toggle is dynamically
        // added to the QOL menu so the user can disable pranks if desired.
        const DISCOVERY_KEY = 'qol-pranks-discovered';
        const NOTIFIED_KEY  = 'qol-pranks-notified';
        const ALL_PRANK_IDS = ['textColorShift', 'imageSwap', 'mapTilt', 'upsideDownMap', 'shakingPanel', 'textResize', 'cursorFlip', 'rickRoll'];

        function getDiscoveredPranks() {
            try { return new Set(JSON.parse(localStorage.getItem(DISCOVERY_KEY) || '[]')); }
            catch { return new Set(); }
        }

        function markDiscovered(id) {
            const discovered = getDiscoveredPranks();
            if (!discovered.has(id)) {
                discovered.add(id);
                try { localStorage.setItem(DISCOVERY_KEY, JSON.stringify([...discovered])); } catch {}
            }
            checkRevealToggle();
        }

        function checkRevealToggle() {
            const discovered = getDiscoveredPranks();
            if (ALL_PRANK_IDS.every(id => discovered.has(id))) {
                runWhenReady('.floating-menu', revealToggle);
            }
        }

        function showCompletionToast() {
            const toast = document.createElement('div');
            toast.className = 'qol-toast';

            const msg = document.createElement('div');
            const line1 = document.createElement('div');
            line1.textContent = '🎉 You\'ve triggered all the pranks!';
            const line2 = document.createElement('div');
            line2.style.cssText = 'margin-top:3px;opacity:0.8;';
            line2.textContent = 'The \'Funny Day 🤪\' toggle has been added to the QOL menu. Use it to disable pranks.';
            msg.appendChild(line1);
            msg.appendChild(line2);

            const closeBtn = document.createElement('button');
            closeBtn.className = 'qol-toast-close';
            closeBtn.textContent = '×';
            closeBtn.title = 'Dismiss';

            toast.appendChild(msg);
            toast.appendChild(closeBtn);
            document.body.appendChild(toast);

            function dismiss() {
                localStorage.setItem(NOTIFIED_KEY, '1');
                toast.classList.add('qol-toast-dismissing');
                setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 320);
            }

            closeBtn.addEventListener('click', dismiss);

            // Safety cleanup: auto-dismiss only after 2 minutes of continuous active
            // presence (mouse/keyboard activity on a visible tab). Going idle or hiding
            // the tab pauses the countdown; returning from either restarts it fresh.
            // This ensures the user has genuinely had a chance to read the toast.
            const SAFETY_MS = 2 * 60 * 1000;
            const IDLE_MS = 30 * 1000; // consider user idle after 30s of no input
            let safetyId = null;
            let idleId = null;

            function onIdle() {
                clearTimeout(safetyId);
                safetyId = null;
            }

            function onActivity() {
                if (document.hidden) return;
                clearTimeout(idleId);
                // Restart safety countdown from the moment user returns from idle
                if (!safetyId) safetyId = setTimeout(dismiss, SAFETY_MS);
                idleId = setTimeout(onIdle, IDLE_MS);
            }

            function onVisibilityChange() {
                if (document.hidden) {
                    clearTimeout(safetyId);
                    clearTimeout(idleId);
                    safetyId = idleId = null;
                }
                // Visible: wait for first activity before starting countdown
            }

            document.addEventListener('visibilitychange', onVisibilityChange);
            document.addEventListener('mousemove', onActivity);
            document.addEventListener('keydown', onActivity);

            function cleanup() {
                clearTimeout(safetyId);
                clearTimeout(idleId);
                document.removeEventListener('visibilitychange', onVisibilityChange);
                document.removeEventListener('mousemove', onActivity);
                document.removeEventListener('keydown', onActivity);
            }

            closeBtn.addEventListener('click', cleanup, { once: true });
        }

        function revealToggle(menu) {
            const inputId = 'toggle-funny-day-🤪';
            if (document.getElementById(inputId)) return; // Already added
            const feature = FEATURE_TOGGLES.find(f => f.label === 'Funny Day 🤪');
            if (!feature) return;

            const container = document.createElement('div');
            container.classList.add('toggle-item');
            const toggleSwitch = document.createElement('label');
            toggleSwitch.classList.add('toggle-switch');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.id = inputId;
            input.checked = featureManager.isEnabled(feature.label);
            const slider = document.createElement('span');
            slider.classList.add('toggle-slider');
            input.addEventListener('change', () => featureManager.toggle(feature.label));
            toggleSwitch.appendChild(input);
            toggleSwitch.appendChild(slider);
            const label = document.createElement('label');
            label.classList.add('toggle-label');
            label.textContent = feature.label;
            label.title = feature.description;
            label.htmlFor = inputId;
            container.appendChild(toggleSwitch);
            container.appendChild(label);
            menu.appendChild(container);
            if (!localStorage.getItem(NOTIFIED_KEY)) {
                showCompletionToast();
            }
        }

        // Prank 1: Gradual Text Color Shift (2025)
        // Cycles all visible text through a rainbow hue shift every 100ms for 10s,
        // then reverts.
        const textColorShift = (() => {
            let intervalId = null;
            let revertTimeoutId = null;
            let originalColors = new Map();
            const DURATION_MS = 10000;

            return {
                durationMs: DURATION_MS,
                play() {
                    markDiscovered('textColorShift');
                    const visibleElements = Array.from(
                        document.querySelectorAll('p, span, div')
                    ).filter(el =>
                        el.style.display !== 'none' &&
                        window.getComputedStyle(el).display !== 'none' &&
                        !el.closest('.gm-style')  // Exclude Google Maps elements - GM uses color property for internal positioning
                    );

                    // Store only the inline style value ('' if none set); restoring a computed
                    // value as inline would incorrectly override CSS inheritance
                    originalColors = new Map();
                    visibleElements.forEach(el => originalColors.set(el, el.style.color));

                    let hue = 0;
                    intervalId = setInterval(() => {
                        hue = (hue + 1) % 360;
                        visibleElements.forEach(el => {
                            el.style.color = `hsl(${hue}, 50%, 50%)`;
                        });
                    }, 100);

                    revertTimeoutId = setTimeout(() => {
                        clearInterval(intervalId);
                        intervalId = null;
                        visibleElements.forEach(el => { el.style.color = originalColors.get(el); });
                    }, DURATION_MS);
                },
                stop() {
                    clearInterval(intervalId);
                    clearTimeout(revertTimeoutId);
                    intervalId = revertTimeoutId = null;
                    originalColors.forEach((color, el) => { el.style.color = color; });
                    originalColors = new Map();
                }
            };
        })();

        // Prank 2: Image Swap (2025)
        // Replaces all page images with random funny ones for 5s, then reverts.
        const imageSwap = (() => {
            const revertTimeoutIds = [];
            const DISPLAY_MS = 5000; // How long funny images are shown before reverting
            const funnyImages = [
                'https://images.pexels.com/photos/6898857/pexels-photo-6898857.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
                'https://images.pexels.com/photos/321552/pexels-photo-321552.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
                'https://images.pexels.com/photos/2233442/pexels-photo-2233442.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
                'https://gratisography.com/wp-content/uploads/2024/01/gratisography-cyber-kitty-1170x780.jpg',
                'https://as2.ftcdn.net/jpg/14/52/54/13/1000_F_1452541395_yMpNpwGkHuBt8jdBLtIQvXCTCc708Nya.jpg',
                'https://as1.ftcdn.net/jpg/16/02/76/80/1000_F_1602768095_DxbryJHB21uadh0d4vIVxZYz6CAmepg4.jpg'
            ];

            return {
                durationMs: DISPLAY_MS,
                play() {
                    markDiscovered('imageSwap');
                    document.querySelectorAll('img').forEach((img) => {
                        const originalSrc = img.src;
                        const originalWidth = img.style.width;
                        const originalHeight = img.style.height;

                        // Lock rendered dimensions before swap so layout doesn't reflow
                        const rect = img.getBoundingClientRect();
                        img.style.width = rect.width + 'px';
                        img.style.height = rect.height + 'px';

                        img.src = funnyImages[Math.floor(Math.random() * funnyImages.length)];

                        const id = setTimeout(() => {
                            img.src = originalSrc;
                            img.style.width = originalWidth;
                            img.style.height = originalHeight;
                        }, DISPLAY_MS);
                        revertTimeoutIds.push(id);
                    });
                },
                stop() {
                    revertTimeoutIds.forEach(id => clearTimeout(id));
                    revertTimeoutIds.length = 0;
                }
            };
        })();

        // Prank 3: Map Tilt (2026)
        // Gently tilts the map canvas a few degrees, then slowly corrects itself.
        const mapTilt = (() => {
            let revertTimeoutId = null;
            let transitionCleanupTimeoutId = null;
            const HOLD_MS = 5000;
            const TRANSITION_MS = 1500;

            return {
                durationMs: HOLD_MS + TRANSITION_MS,
                play() {
                    const map = document.querySelector('#map_canvas');
                    if (!map || mapTransformActive) return;
                    mapTransformActive = true;
                    markDiscovered('mapTilt');

                    const originalTransition = map.style.transition;
                    map.style.transition = `transform ${TRANSITION_MS}ms ease`;
                    map.style.transform = 'rotate(4deg)';

                    revertTimeoutId = setTimeout(() => {
                        // Always revert to '' (mapTilt and upsideDownMap are the only
                        // things that set this property, so '' is always the correct original)
                        map.style.transform = '';
                        transitionCleanupTimeoutId = setTimeout(() => {
                            map.style.transition = originalTransition;
                            mapTransformActive = false;
                        }, TRANSITION_MS);
                    }, HOLD_MS);
                },
                stop() {
                    clearTimeout(revertTimeoutId);
                    clearTimeout(transitionCleanupTimeoutId);
                    revertTimeoutId = transitionCleanupTimeoutId = null;
                    const map = document.querySelector('#map_canvas');
                    if (map) { map.style.transition = ''; map.style.transform = ''; }
                    mapTransformActive = false;
                }
            };
        })();

        // Prank 4: Shaking Details Panel (2026)
        // Plays a brief shake animation on the Details panel each time a new feature
        // loads. Event-driven, always active while the feature is enabled, bypasses
        // the scheduler.
        const shakingPanel = (() => {
            let styleEl = null;
            let observer = null;
            let shakeTimeoutId = null;
            let lastShakeTime = 0;
            const COOLDOWN_MS = 5 * 60 * 1000; // Minimum gap between shakes (persists across stop/start)

            const SHAKE_CSS = `
                @keyframes qol-shake {
                    0%, 100% { transform: translateX(0); }
                    15%       { transform: translateX(-6px) rotate(-0.8deg); }
                    30%       { transform: translateX(6px) rotate(0.8deg); }
                    50%       { transform: translateX(-5px) rotate(-0.5deg); }
                    70%       { transform: translateX(5px) rotate(0.5deg); }
                    85%       { transform: translateX(-3px); }
                }
                .qol-shake {
                    animation: qol-shake 0.5s ease;
                }
            `;

            function shake() {
                if (Date.now() - lastShakeTime < COOLDOWN_MS) return;
                const panel = document.querySelector('#feature-details');
                if (!panel) return;

                lastShakeTime = Date.now();
                markDiscovered('shakingPanel');
                panel.classList.remove('qol-shake');
                void panel.offsetWidth; // Force reflow to restart animation
                panel.classList.add('qol-shake');
                shakeTimeoutId = setTimeout(() => {
                    panel.classList.remove('qol-shake');
                }, 500); // class cleanup after animation ends
            }

            return {
                start() {
                    styleEl = document.createElement('style');
                    styleEl.textContent = SHAKE_CSS;
                    document.head.appendChild(styleEl);

                    runWhenReady('#feature-details', (panel) => {
                        observer = new MutationObserver(shake);
                        observer.observe(panel, { childList: true, subtree: true });
                    });
                },
                stop() {
                    if (observer) { observer.disconnect(); observer = null; }
                    clearTimeout(shakeTimeoutId);
                    shakeTimeoutId = null;
                    // lastShakeTime intentionally NOT reset; cooldown persists across stop/start
                    if (styleEl && styleEl.parentNode) { styleEl.parentNode.removeChild(styleEl); styleEl = null; }
                    const panel = document.querySelector('#feature-details');
                    if (panel) panel.classList.remove('qol-shake');
                }
            };
        })();

        // Prank 5: Upside-Down Map (2026)
        // Flips the map canvas 180 degrees for 5 seconds, then flips it back.
        const upsideDownMap = (() => {
            let revertTimeoutId = null;
            let transitionCleanupTimeoutId = null;
            const HOLD_MS = 5000;
            const TRANSITION_MS = 800;

            return {
                durationMs: HOLD_MS + TRANSITION_MS,
                play() {
                    const map = document.querySelector('#map_canvas');
                    if (!map || mapTransformActive) return;
                    mapTransformActive = true;
                    markDiscovered('upsideDownMap');

                    const originalTransition = map.style.transition;
                    map.style.transition = `transform ${TRANSITION_MS}ms ease`;
                    map.style.transform = 'rotate(180deg)';

                    revertTimeoutId = setTimeout(() => {
                        // Always revert to '' (mapTilt and upsideDownMap are the only
                        // things that set this property, so '' is always the correct original)
                        map.style.transform = '';
                        transitionCleanupTimeoutId = setTimeout(() => {
                            map.style.transition = originalTransition;
                            mapTransformActive = false;
                        }, TRANSITION_MS);
                    }, HOLD_MS);
                },
                stop() {
                    clearTimeout(revertTimeoutId);
                    clearTimeout(transitionCleanupTimeoutId);
                    revertTimeoutId = transitionCleanupTimeoutId = null;
                    const map = document.querySelector('#map_canvas');
                    if (map) { map.style.transition = ''; map.style.transform = ''; }
                    mapTransformActive = false;
                }
            };
        })();

        // Prank 6: Text Jumble (2026)
        // Randomly scales text-heavy elements to comic proportions.
        // Runs as an ambient pranklet on its own timer, independent of the scheduler.
        const textResize = (() => {
            let revertTimeoutId = null;
            let nextPlayTimeoutId = null;
            let affected = [];
            const PLAY_DURATION_MS = 5000;
            const AMBIENT_INTERVAL = { min: 8, max: 15 }; // minutes

            function play() {
                const candidates = Array.from(
                    document.querySelectorAll('span, td, th, li')
                ).filter(el =>
                    el.childElementCount === 0 &&
                    el.textContent.trim().length > 2 &&
                    !el.closest('.gm-style') &&
                    !el.closest('.floating-menu')
                );
                if (candidates.length === 0) return;
                markDiscovered('textResize');

                const count = Math.min(candidates.length, 15);
                const chosen = candidates.sort(() => Math.random() - 0.5).slice(0, count);
                affected = [];
                chosen.forEach(el => {
                    const originalTransform = el.style.transform;
                    const originalDisplay = el.style.display;
                    const scale = (0.3 + Math.random() * 2.2).toFixed(2);
                    el.style.display = originalDisplay || 'inline-block';
                    el.style.transform = `scale(${scale})`;
                    el.style.transformOrigin = 'left center';
                    affected.push({ el, originalTransform, originalDisplay });
                });

                clearTimeout(revertTimeoutId);
                revertTimeoutId = setTimeout(() => {
                    affected.forEach(({ el, originalTransform, originalDisplay }) => {
                        el.style.transform = originalTransform;
                        if (originalDisplay === '') el.style.removeProperty('display');
                        else el.style.display = originalDisplay;
                        el.style.removeProperty('transform-origin');
                    });
                    affected = [];
                }, PLAY_DURATION_MS);
            }

            function scheduleAmbient() {
                const delay = randMinutes(AMBIENT_INTERVAL.min, AMBIENT_INTERVAL.max);
                nextPlayTimeoutId = setTimeout(() => {
                    if (featureManager.isEnabled('Funny Day 🤪')) play();
                    scheduleAmbient();
                }, delay);
            }

            return {
                durationMs: PLAY_DURATION_MS,
                play,
                startAmbient() { scheduleAmbient(); },
                stop() {
                    clearTimeout(revertTimeoutId);
                    clearTimeout(nextPlayTimeoutId);
                    revertTimeoutId = nextPlayTimeoutId = null;
                    affected.forEach(({ el, originalTransform, originalDisplay }) => {
                        el.style.transform = originalTransform;
                        if (originalDisplay === '') el.style.removeProperty('display');
                        else el.style.display = originalDisplay;
                        el.style.removeProperty('transform-origin');
                    });
                    affected = [];
                }
            };
        })();

        // Prank 7: Upside-Down Cursor (2026)
        // Replaces the cursor with an upside-down arrow pointer for a short while.
        const cursorFlip = (() => {
            let styleEl = null;
            let revertTimeoutId = null;
            const HOLD_MS = 10000;

            // Standard pointer arrow shape, rotated 180° so the tip points down-right.
            // Hotspot (20, 21) is near the bottom-right tip of the flipped arrow.
            const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path transform="rotate(180 12 12)" d="M4 3 L4 17 L7 14 L10 19.5 L12.5 18.5 L9.5 13 L14 13 Z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
            const cursorUrl = `data:image/svg+xml,${encodeURIComponent(SVG)}`;

            return {
                durationMs: HOLD_MS,
                play() {
                    markDiscovered('cursorFlip');
                    styleEl = document.createElement('style');
                    styleEl.textContent = `* { cursor: url("${cursorUrl}") 20 21, default !important; }`;
                    document.head.appendChild(styleEl);
                    revertTimeoutId = setTimeout(() => {
                        if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
                        styleEl = null;
                    }, HOLD_MS);
                },
                stop() {
                    clearTimeout(revertTimeoutId);
                    revertTimeoutId = null;
                    if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
                    styleEl = null;
                }
            };
        })();

        // Prank 8: Rick Roll (2026)
        // When the street view pane opens, overlays it with the classic video.
        // Event-driven, always active while the feature is enabled, bypasses the scheduler.
        const rickRoll = (() => {
            let bodyObserver = null;
            let paneObserver = null;
            let currentIframe = null;
            let currentToggleBtn = null;
            let showingRickRoll = true;
            const VOLUME = 15; // 0-100, low enough not to startle, still audible
            // autoplay=0: start paused so volume is set before playback begins.
            // enablejsapi=1: allows postMessage commands (setVolume, playVideo).
            const VIDEO_URL = 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0&enablejsapi=1';

            function setVolumeAndPlay(iframe) {
                // YouTube IFrame API accepts postMessage commands when enablejsapi=1.
                // We wait a moment after load to ensure the player is initialised,
                // then set the volume before triggering playback so there is no loud burst.
                setTimeout(() => {
                    iframe.contentWindow?.postMessage(
                        JSON.stringify({ event: 'command', func: 'setVolume', args: [VOLUME] }),
                        'https://www.youtube.com'
                    );
                    iframe.contentWindow?.postMessage(
                        JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
                        'https://www.youtube.com'
                    );
                }, 800);
            }

            function isPaneVisible(pane) {
                return pane.style.display !== 'none' && window.getComputedStyle(pane).display !== 'none';
            }

            function removeOverlay() {
                if (currentIframe && currentIframe.parentNode) currentIframe.parentNode.removeChild(currentIframe);
                currentIframe = null;
            }

            // The toggle button lives in the panel header above the pane (feature-plugins-header),
            // matching the style of the existing expand/collapse icon already present there.
            function syncToggleBtn(pane) {
                if (currentToggleBtn && currentToggleBtn.parentNode) currentToggleBtn.parentNode.removeChild(currentToggleBtn);
                const header = pane.parentElement?.querySelector('.feature-plugins-header');
                if (!header) return;

                const btn = document.createElement('button');
                btn.className = 'qol-rick-toggle';
                // margin-left:auto pushes the button to the far right when the header is a flex row.
                // The button is appended last so the title text stays on the left.
                btn.style.cssText = 'background:none;border:none;cursor:pointer;padding:0 4px;font-size:11px;vertical-align:middle;margin-left:auto;opacity:0.7;';
                if (showingRickRoll) {
                    btn.title = 'Switch to real Street View';
                    btn.textContent = '↩ Street View';
                    btn.addEventListener('click', (e) => { e.stopPropagation(); showingRickRoll = false; removeOverlay(); syncToggleBtn(pane); });
                } else {
                    btn.title = 'Switch to Rick Roll';
                    btn.textContent = '🎵 Rick Roll';
                    btn.addEventListener('click', (e) => { e.stopPropagation(); showingRickRoll = true; injectOverlay(pane); syncToggleBtn(pane); });
                }
                header.appendChild(btn);
                currentToggleBtn = btn;
            }

            function injectOverlay(pane) {
                if (pane.querySelector('.qol-rick-roll')) return;
                markDiscovered('rickRoll');
                const iframe = document.createElement('iframe');
                iframe.className = 'qol-rick-roll';
                iframe.src = VIDEO_URL;
                iframe.style.cssText = 'width:100%;height:100%;border:0;position:absolute;top:0;left:0;z-index:999;';
                iframe.allow = 'autoplay; encrypted-media';
                iframe.allowFullscreen = true;
                iframe.addEventListener('load', () => setVolumeAndPlay(iframe), { once: true });
                pane.appendChild(iframe);
                currentIframe = iframe;
            }

            function attachPaneObserver(pane) {
                if (paneObserver) { paneObserver.disconnect(); }
                paneObserver = new MutationObserver(() => {
                    if (!isPaneVisible(pane)) {
                        // Pane hidden - stop video to avoid background network traffic
                        removeOverlay();
                    } else if (showingRickRoll && !pane.querySelector('.qol-rick-roll')) {
                        // Pane made visible again - restore video
                        injectOverlay(pane);
                    }
                });
                paneObserver.observe(pane, { attributes: true, attributeFilter: ['style', 'class'] });
            }

            function checkPane() {
                const pane = document.querySelector('div.street-view-small');
                if (!pane || !isPaneVisible(pane) || !pane.children.length) return;
                // Fresh pane with no overlay state - set up from scratch
                if (!pane.parentElement?.querySelector('.qol-rick-toggle')) {
                    showingRickRoll = true;
                    pane.style.position = 'relative';
                    attachPaneObserver(pane);
                    injectOverlay(pane);
                    syncToggleBtn(pane);
                }
            }

            return {
                play() { checkPane(); },
                start() {
                    bodyObserver = new MutationObserver(checkPane);
                    bodyObserver.observe(document.body, { childList: true, subtree: true });
                    checkPane();
                },
                stop() {
                    if (bodyObserver) { bodyObserver.disconnect(); bodyObserver = null; }
                    if (paneObserver) { paneObserver.disconnect(); paneObserver = null; }
                    removeOverlay();
                    if (currentToggleBtn && currentToggleBtn.parentNode) currentToggleBtn.parentNode.removeChild(currentToggleBtn);
                    currentToggleBtn = null;
                }
            };
        })();

        // Each timed prank needs: durationMs (how long its effect runs), play(), stop()
        // Add to this array to register with the central scheduler.
        const timedPranks = [textColorShift, imageSwap, mapTilt, upsideDownMap, cursorFlip];

        // Central scheduler:
        // Picks one timed prank at random, plays it, waits for it to fully complete,
        // then waits a cooldown before picking the next. Only one prank runs at a time.
        let schedulerTimeoutId = null;
        let activePrank = null;

        function scheduleNext() {
            if (!featureManager.isEnabled('Funny Day 🤪')) return;
            const cooldown = randMinutes(TIMING.prankCooldown.min, TIMING.prankCooldown.max);
            schedulerTimeoutId = setTimeout(() => {
                // Avoid repeating the same prank back-to-back if possible
                const pool = timedPranks.filter(p => p !== activePrank);
                activePrank = pool[Math.floor(Math.random() * pool.length)];
                activePrank.play();
                schedulerTimeoutId = setTimeout(scheduleNext, activePrank.durationMs);
            }, cooldown);
        }

        // Registry used by the debug API (window.qolPranks)
        const allPranks = { textColorShift, imageSwap, mapTilt, upsideDownMap, shakingPanel, textResize, cursorFlip, rickRoll };

        return {
            // Manually fire a prank by name (for testing via the console)
            trigger(name) {
                const prank = allPranks[name];
                if (!prank) {
                    console.warn(`[April Fools] Unknown prank: "${name}". Valid names:`, Object.keys(allPranks).join(', '));
                    return;
                }
                prank.play ? prank.play() : prank.start?.();
            },
            list() {
                console.log('[April Fools] Available pranks:', Object.keys(allPranks).join(', '));
                return Object.keys(allPranks);
            },
            start() {
                if (!IS_APRIL_FOOLS) return;
                runWhenReady('#map_canvas', () => {
                    // Event-driven pranks start immediately (no scheduling needed)
                    shakingPanel.start();
                    rickRoll.start();
                    textResize.startAmbient();

                    // Reveal toggle immediately if all pranks were seen in a prior session
                    checkRevealToggle();

                    // Wait initial delay before the first timed prank fires
                    const initialDelay = randMinutes(TIMING.initialDelay.min, TIMING.initialDelay.max);
                    schedulerTimeoutId = setTimeout(() => {
                        activePrank = timedPranks[Math.floor(Math.random() * timedPranks.length)];
                        activePrank.play();
                        schedulerTimeoutId = setTimeout(scheduleNext, activePrank.durationMs);
                    }, initialDelay);
                });
            },
            stop() {
                clearTimeout(schedulerTimeoutId);
                schedulerTimeoutId = null;
                activePrank = null;
                timedPranks.forEach(p => p.stop());
                shakingPanel.stop();
                rickRoll.stop();
                textResize.stop();
            }
        };
    })();

    // Expose prank controls to the console for testing
    if (typeof window !== 'undefined') {
        window.qolPranks = {
            trigger: (name) => aprilFoolsFeature.trigger(name),
            list: () => aprilFoolsFeature.list(),
            help: () => console.log([
                '[qolPranks] Available commands:',
                '  qolPranks.list()           - List all prank names',
                '  qolPranks.trigger("name")  - Manually fire a prank',
                '',
                'Example:  qolPranks.trigger("rickRoll")',
            ].join('\n'))
        };
    }

    // Error Monitor
    const errorMonitorFeature = (() => {
        let started = false;
        let interceptorsInstalled = false;
        let uiInitialized = false;
        let cleanupFns = [];
        let uiObserver = null;
        let footerObserver = null;
        let debugFallbackTimeout = null;
        let wrapper = null;
        let btn = null;
        let panel = null;
        let panelOpen = false;
        let currentFilter = 'all';
        const logs = [];
        let debugLogging = false; // Enable if UI fails to initialize
        const IGNORE_URL_PATTERNS = [
            /googleapis\.com\/maps\/api\/mapsjs\//,
            /optical_node_closure_spec/
        ];
        const IGNORE_404_PATTERNS = [
            /\/modules\/comms\/structure\/manhole\// // expected 404 when structure exists only in delta
        ];
        const LEGACY_BUTTON_POS_KEY = 'qol-errmon-btn-pos'; // Implemented 2026-01-13. To be removed at a later date

        function debugLog(...args) {
            if (debugLogging) {
                console.log('[ErrorMonitor]', ...args);
            }
        }

        function purgeLegacyErrorMonitorState() {
            try {
                if (window.localStorage && localStorage.getItem(LEGACY_BUTTON_POS_KEY) !== null) {
                    localStorage.removeItem(LEGACY_BUTTON_POS_KEY);
                }
            } catch (e) {
                // Ignore storage access issues; legacy cleanup is best-effort only
            }
        }

        // Clean up legacy Error Monitor button position state from older script versions
        purgeLegacyErrorMonitorState();

        function shouldIgnoreLog(entry) {
            if (entry.url) {
                for (const pat of IGNORE_URL_PATTERNS) {
                    if (pat.test(entry.url)) return true;
                }
            }
            if (entry.message) {
                for (const pat of IGNORE_URL_PATTERNS) {
                    if (pat.test(entry.message)) return true;
                }
            }
            return false;
        }

        function addLog(entry) {
            if (shouldIgnoreLog(entry)) return;
            logs.push({ time: new Date(), ...entry });
            debugLog('Log added:', entry.type, entry.message?.substring(0, 50));
            if (panelOpen) renderLogs(currentFilter);
            updateButtonColor();
        }

        function formatTime(d) {
            return d.toLocaleTimeString();
        }

        function updateButtonColor() {
            if (!btn) return;
            
            const hasErrors = logs.length > 0;
            
            if (hasErrors) {
                // Red X icon for errors
                btn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg"
                         width="18" height="18" viewBox="0 0 18 18"
                         aria-hidden="true"
                         style="display: block; transition: filter 0.15s, transform 0.1s;">
                      <circle cx="9" cy="9" r="7.5"
                              fill="#ffffff"
                              stroke="#000000"
                              stroke-width="1.25"/>
                      <path d="M6 6 L12 12 M12 6 L6 12"
                            fill="none"
                            stroke="#dc2626"
                            stroke-width="2.5"
                            stroke-linecap="round"/>
                    </svg>
                `;
            } else {
                // Green checkmark icon for no errors
                btn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg"
                         width="18" height="18" viewBox="0 0 18 18"
                         aria-hidden="true"
                         style="display: block; transition: filter 0.15s, transform 0.1s;">
                      <circle cx="9" cy="9" r="7.5"
                              fill="#ffffff"
                              stroke="#000000"
                              stroke-width="1.25"/>
                      <path d="M5.5 9.5 L8 12 L12.5 6.75"
                            fill="none"
                            stroke="#16a34a"
                            stroke-width="2.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"/>
                    </svg>
                `;
            }
            
            // Add hover/active feedback
            const svg = btn.querySelector('svg');
            if (svg) {
                svg.addEventListener('mouseenter', function() {
                    this.style.filter = 'brightness(0.9)';
                });
                svg.addEventListener('mouseleave', function() {
                    this.style.filter = '';
                });
                svg.addEventListener('mousedown', function() {
                    this.style.transform = 'translateY(1px)';
                });
                svg.addEventListener('mouseup', function() {
                    this.style.transform = '';
                });
            }
        }

        function renderLogs(filter) {
            if (!panel) return;
            const list = panel.querySelector('ul');
            if (!list) return;
            list.innerHTML = '';
            logs.forEach((log) => {
                if (filter !== 'all' && log.type !== filter) return;
                const li = document.createElement('li');
                li.style.marginBottom = '6px';
                li.style.wordBreak = 'break-word';
                li.style.overflowWrap = 'break-word';
                li.innerHTML = `
                    <strong>[${formatTime(log.time)}]</strong>
                    <em>(${log.type}${log.level ? '/' + log.level : ''}${log.method ? '/' + log.method : ''})</em>
                    <div>${log.message}</div>
                    ${log.url ? `<div style="font-size:10px;color:#555;word-break:break-all;">${log.url}</div>` : ''}
                `;
                list.appendChild(li);
            });
            if (!list.children.length) {
                list.innerHTML = '<li><em>No entries</em></li>';
            }
        }

        function teardownUi() {
            debugLog('Tearing down UI');
            if (uiObserver) {
                uiObserver.disconnect();
                uiObserver = null;
            }
            if (footerObserver) {
                footerObserver.disconnect();
                footerObserver = null;
            }
            if (wrapper && wrapper.parentNode) {
                wrapper.remove();
            }
            if (panel && panel.parentNode) {
                panel.remove();
            }
            wrapper = null;
            btn = null;
            panel = null;
            panelOpen = false;
            uiInitialized = false;
        }

        function installInterceptors() {
            if (interceptorsInstalled) {
                debugLog('Interceptors already installed');
                return;
            }
            
            debugLog('Installing error interceptors');
            
            // Intercept console.error
            ['error'].forEach((level) => {
                const orig = console[level];
                console[level] = function (...args) {
                    addLog({ type: 'console', level, message: args.map(String).join(' ') });
                    orig.apply(console, args);
                };
                cleanupFns.push(() => { console[level] = orig; });
            });

            // Intercept window errors
            const errListener = (e) => {
                addLog({ type: 'console', level: 'error', message: `${e.message} (${e.filename}:${e.lineno})` });
            };
            const rejListener = (e) => {
                addLog({ type: 'console', level: 'error', message: 'UnhandledRejection: ' + (e.reason?.toString() || e.reason) });
            };
            window.addEventListener('error', errListener);
            window.addEventListener('unhandledrejection', rejListener);
            cleanupFns.push(() => {
                window.removeEventListener('error', errListener);
                window.removeEventListener('unhandledrejection', rejListener);
            });

            // Intercept fetch
            const origFetch = window.fetch;
            window.fetch = function (...args) {
                return origFetch.apply(this, args).then((res) => {
                    const url = res?.url || args[0] || '';
                    // The script's own trace 500s (bad splice data) are marked and explained on the strand row
                    const ownTrace500 = res.status === 500 && args[1]?.[QOL_OWN_REQUEST] === true
                        && /\/modules\/comms\/fiber\/paths\//.test(url);
                    if (!res.ok && !ownTrace500) {
                        if (!(res.status === 404 && IGNORE_404_PATTERNS.some((p) => p.test(url)))) {
                            addLog({ type: 'network', method: 'fetch', status: res.status, url, message: `${res.status} ${res.statusText}` });
                        }
                    }
                    return res;
                }).catch((err) => {
                    // The script's own timeouts (slow traces) are retried and, if they keep failing,
                    // marked on the strand row; logging them here would only be noise
                    const init = args[1];
                    const ownTimeout = init?.[QOL_OWN_REQUEST] === true && init.signal?.aborted
                        && String(init.signal.reason).startsWith('timeout_');
                    if (!ownTimeout) {
                        addLog({ type: 'network', method: 'fetch', status: 'ERR', url: args[0] || '', message: String(err) });
                    }
                    throw err;
                });
            };
            cleanupFns.push(() => { window.fetch = origFetch; });

            // Intercept XMLHttpRequest
            const origOpen = XMLHttpRequest.prototype.open;
            const origSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function (method, url, ...rest) {
                this._errmon = { method, url };
                return origOpen.call(this, method, url, ...rest);
            };
            XMLHttpRequest.prototype.send = function (...args) {
                this.addEventListener('loadend', () => {
                    const { status, statusText } = this;
                    const url = this._errmon.url;
                    if (status < 200 || status >= 300) {
                        if (!(status === 404 && IGNORE_404_PATTERNS.some((p) => p.test(url)))) {
                            addLog({ type: 'network', method: this._errmon.method, status, url, message: `${status} ${statusText}` });
                        }
                    }
                });
                this.addEventListener('error', () => {
                    addLog({ type: 'network', method: this._errmon.method, status: 'ERR', url: this._errmon.url, message: 'XHR error' });
                });
                return origSend.apply(this, args);
            };
            cleanupFns.push(() => {
                XMLHttpRequest.prototype.open = origOpen;
                XMLHttpRequest.prototype.send = origSend;
            });

            interceptorsInstalled = true;
            debugLog('Interceptors installed successfully');
        }

        function initializeUI() {
            if (uiInitialized) {
                debugLog('UI already initialized');
                return;
            }
            
            debugLog('Initializing UI components');
            cleanupFns.push(teardownUi);
            
            // Create footer button icon
            btn = document.createElement('span');
            btn.title = 'Error Monitor';
            btn.style.cursor = 'pointer';
            
            // Create SVG alert icon (initial state)
            btn.innerHTML = '';
            updateButtonColor();

            // Create panel
            panel = document.createElement('div');
            Object.assign(panel.style, {
                position: 'fixed', width: '400px', maxHeight: '60vh', background: '#fff', 
                border: '1px solid #888', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', 
                fontSize: '12px', display: 'none', zIndex: 99999,
                overflow: 'hidden'
            });

            // Position panel near bottom-right with viewport-aware boundary checks
            var positionErrorPanel = function() {
                if (!panel) {
                    return;
                }
                // Desired offsets matching previous behavior
                var desiredBottom = 30; // px
                var desiredRight = 10;  // px

                var vh = window.innerHeight || document.documentElement.clientHeight || 0;
                // Panel is constrained to 60% of viewport height
                var maxPanelHeight = vh * 0.6;

                // Ensure bottom offset plus max height does not exceed viewport
                if (desiredBottom + maxPanelHeight > vh) {
                    desiredBottom = Math.max(10, vh - maxPanelHeight - 10);
                }

                panel.style.bottom = desiredBottom + 'px';
                panel.style.right = desiredRight + 'px';
            };

            // Initial positioning and keep responsive on resize
            positionErrorPanel();
            window.addEventListener('resize', positionErrorPanel);
            
            const header = document.createElement('div');
            Object.assign(header.style, {
                padding: '8px',
                borderBottom: '1px solid #ccc',
                background: '#f5f5f5'
            });
            header.innerHTML = `
                <button data-filter="all">All</button>
                <button data-filter="console">Console</button>
                <button data-filter="network">Network</button>
                <button id="err-clear" style="float:right">Clear</button>
                <hr style="margin-top: 8px; margin-bottom: 0;"/>
            `;
            panel.appendChild(header);

            const list = document.createElement('ul');
            Object.assign(list.style, { 
                padding: '8px', 
                paddingRight: '16px',
                listStyle: 'none',
                margin: '0',
                maxHeight: 'calc(60vh - 60px)',
                overflowY: 'auto',
                overflowX: 'hidden'
            });
            panel.appendChild(list);

            btn.addEventListener('click', () => {
                panelOpen = !panelOpen;
                panel.style.display = panelOpen ? 'block' : 'none';
                if (panelOpen) {
                    renderLogs(currentFilter);
                }
            });

            header.querySelectorAll('button[data-filter]').forEach((fb) => {
                fb.addEventListener('click', () => {
                    currentFilter = fb.dataset.filter;
                    renderLogs(currentFilter);
                });
            });
            header.querySelector('#err-clear').addEventListener('click', () => {
                logs.length = 0;
                updateButtonColor();
                renderLogs(currentFilter);
            });

            const injectUi = () => {
                const footerRight = document.getElementById('footer-right');
                if (!footerRight) {
                    debugLog('footer-right not found, waiting...');
                    return false;
                }
                
                debugLog('Injecting UI into footer-right');
                
                // Create wrapper span with same structure as other footer elements
                wrapper = document.createElement('span');
                const iconSpan = document.createElement('span');
                iconSpan.className = 'plugin-icon';
                iconSpan.appendChild(btn);
                
                const messageSpan = document.createElement('span');
                messageSpan.className = 'plugin-message';
                
                wrapper.appendChild(iconSpan);
                wrapper.appendChild(messageSpan);
                
                // Insert as first child in footer-right
                footerRight.insertBefore(wrapper, footerRight.firstChild);
                
                // Append panel to body
                document.body.appendChild(panel);
                
                debugLog('UI successfully injected, monitoring active with', logs.length, 'logs captured');
                uiInitialized = true;
                
                // Clear the debug fallback timeout since UI initialized successfully
                if (debugFallbackTimeout) {
                    clearTimeout(debugFallbackTimeout);
                    debugFallbackTimeout = null;
                }
                
                // Watch for new elements being added to footer and keep error monitor at start
                footerObserver = new MutationObserver(() => {
                    if (wrapper && wrapper.parentNode === footerRight) {
                        // Only reposition if we're not already first
                        if (footerRight.firstChild !== wrapper) {
                            footerRight.insertBefore(wrapper, footerRight.firstChild);
                        }
                    }
                });
                footerObserver.observe(footerRight, { childList: true });
                
                return true;
            };

            if (!injectUi()) {
                debugLog('Starting MutationObserver to watch for footer-right');
                uiObserver = new MutationObserver((mutations, obs) => {
                    if (injectUi()) {
                        debugLog('footer-right appeared, UI injected via observer');
                        obs.disconnect();
                    }
                });
                uiObserver.observe(document.documentElement, { childList: true, subtree: true });
                
                // Fallback: Enable debug logging if UI doesn't appear within 15 seconds
                debugFallbackTimeout = setTimeout(() => {
                    if (!uiInitialized) {
                        debugLogging = true;
                        console.warn('[ErrorMonitor] UI failed to initialize after 15s, debug logging enabled');
                        console.log('[ErrorMonitor] Captured', logs.length, 'log entries');
                        if (logs.length > 0) {
                            console.log('[ErrorMonitor] Most recent logs:');
                            logs.slice(-5).forEach(log => {
                                console.log(`  [${formatTime(log.time)}] ${log.type}/${log.level || log.method}: ${log.message}`);
                            });
                        }
                    }
                    debugFallbackTimeout = null;
                }, 15000);
            } else {
                debugLog('UI injected immediately');
            }
        }

        function start() {
            if (started) {
                debugLog('Already started, skipping');
                return;
            }
            debugLog('Feature start() called');
            started = true;
            
            // Phase 1: Install interceptors immediately to capture errors from page load
            installInterceptors();
            
            // Phase 2: Initialize UI when DOM is ready (deferred)
            // Try immediately first, then fall back to waiting
            if (document.getElementById('footer-right')) {
                debugLog('footer-right already exists, initializing UI immediately');
                initializeUI();
            } else {
                debugLog('Waiting for DOM to be ready for UI injection');
                // Wait for DOM ready
                if (document.readyState === 'loading') {
                    const domReadyHandler = () => {
                        debugLog('DOMContentLoaded fired, attempting UI initialization');
                        setTimeout(() => initializeUI(), 100); // Small delay to let IQGeo app initialize
                    };
                    document.addEventListener('DOMContentLoaded', domReadyHandler, { once: true });
                    cleanupFns.push(() => document.removeEventListener('DOMContentLoaded', domReadyHandler));
                } else {
                    // DOM already ready
                    setTimeout(() => initializeUI(), 100);
                }
            }
        }

        function stop() {
            if (!started) {
                debugLog('stop() called but not started');
                return;
            }
            debugLog('Stopping feature and cleaning up');
            started = false;
            interceptorsInstalled = false;
            
            // Clear any pending timeouts
            if (debugFallbackTimeout) {
                clearTimeout(debugFallbackTimeout);
                debugFallbackTimeout = null;
            }
            
            while (cleanupFns.length) {
                const fn = cleanupFns.pop();
                try { fn(); } catch (e) { console.warn('[ErrorMonitor] Cleanup failed', e); }
            }
            debugLog('Feature stopped');
        }

        return { start, stop };
    })();

    // Shared utility: wait for a condition to be truthy
    function waitFor(predicate, { timeoutMs = 30000, intervalMs = 500 } = {}) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const tick = () => {
                try {
                    const val = predicate();
                    if (val) return resolve(val);
                } catch {
                    /* ignore */
                }
                if (Date.now() - start >= timeoutMs)
                    return reject(new Error('waitFor: timeout'));
                setTimeout(tick, intervalMs);
            };
            tick();
        });
    }

    // Shared utility: apply a monkey-patch as soon as its target becomes available.
    // One interval covers every registered patch instead of each patch rolling its
    // own waitFor/setTimeout/retry-id boilerplate.
    const patchPollQueue = [];
    let patchPollTimerId = null;

    function tryApplyPatch(entry) {
        let target;
        try {
            target = entry.getTarget();
        } catch {
            return false;
        }
        if (!target) return false;
        if (entry.isPatched(target)) return true;

        try {
            entry.apply(target);
        } catch (e) {
            if (!entry.hasLoggedFailure) {
                console.error(`[userscript] Failed to apply patch (${entry.label}), will keep retrying:`, e);
                entry.hasLoggedFailure = true;
            }
            return false; // apply() threw - target wasn't actually ready, keep polling
        }

        if (entry.isPatched(target)) return true;

        // apply() ran without throwing but didn't mark the target patched - one of
        // its internal preconditions (e.g. a method not yet attached) wasn't met.
        // Keep polling instead of silently abandoning the patch; only warn once.
        if (!entry.hasLoggedFailure) {
            console.warn(`[userscript] Patch target found but not fully ready, will keep retrying (${entry.label})`);
            entry.hasLoggedFailure = true;
        }
        return false;
    }

    function registerPatch(getTarget, isPatched, apply, label) {
        const entry = { getTarget, isPatched, apply, label };
        if (tryApplyPatch(entry)) return;

        patchPollQueue.push(entry);
        if (!patchPollTimerId) {
            patchPollTimerId = setInterval(() => {
                for (let i = patchPollQueue.length - 1; i >= 0; i--) {
                    if (tryApplyPatch(patchPollQueue[i])) patchPollQueue.splice(i, 1);
                }
                if (!patchPollQueue.length) {
                    clearInterval(patchPollTimerId);
                    patchPollTimerId = null;
                }
            }, 2000);
        }
    }

    function stopPatchPolling() {
        patchPollQueue.length = 0;
        if (patchPollTimerId) {
            clearInterval(patchPollTimerId);
            patchPollTimerId = null;
        }
    }

    // Plugin Overrides: displayManager, locManager
    const pluginOverridesFeature = (() => {
        'use strict';

        let started = false;

        const getDisplayManager = () => {
            try {
                return window.myw?.app?.plugins?.displayManager || null;
            } catch {
                return null;
            }
        };

        const getStructureManager = () => {
            try {
                return window.myw?.app?.plugins?.structureManager || null;
            } catch {
                return null;
            }
        };

        const getLocManager = () => {
            try {
                return window.myw?.app?.plugins?.locManager || null;
            } catch {
                return null;
            }
        };

        const getEquipTreeView = () => {
            try {
                return window.myw?.app?.plugins?.equipmentTree?.treeView || null;
            } catch {
                return null;
            }
        };

        // TEMP HOTFIX (IQG-34445): keep FeatureTreeView.refreshFor lazy-aware.
        // Remove when upstream refreshFor matches renderFor lazy-loading behavior.
        function applyFeatureTreeRefreshLazy(treeView) {
            const originalRefreshFor = treeView.refreshFor;
            if (typeof originalRefreshFor !== 'function') {
                throw new Error('equipmentTree.treeView.refreshFor not a function');
            }

            treeView.refreshFor = async function(feature) {
                const tree = this.jstree();
                if (tree) {
                    const treeData = await this.getTreesFor(feature, true);
                    const treeViewInstance = this;

                    tree.settings.core.data = async function(node, cb) {
                        if (node.id === '#') {
                            return cb(treeData);
                        }

                        if (!node || !node.data || typeof node.data.lazy_builder !== 'function') {
                            return cb([]);
                        }

                        if (typeof treeViewInstance.childrenForNode === 'function') {
                            return cb(await treeViewInstance.childrenForNode(node));
                        }

                        return cb([]);
                    };

                    tree.refresh();
                }

                this.filter();
            };

            Object.defineProperty(treeView, '__refreshForLazyPatched', {
                value: { original: originalRefreshFor }
            });
            console.info('[userscript] Patched equipmentTree.treeView.refreshFor for lazy loading');
        }

        // TEMP HOTFIX (IQG-34445): guard missing tree-feature-modified payloads.
        // Remove when upstream always emits a payload object for this event.
        function applyTreeFeatureModifiedPayloadGuard(treeView) {
            const app = treeView.app || window.myw?.app;
            if (!app || typeof app.on !== 'function') {
                throw new Error('tree-feature-modified guard: app.on not available');
            }

            const wrapExistingTreeFeatureListeners = () => {
                const events = app._events;
                if (!events || !events['tree-feature-modified']) return;

                const handlers = Array.isArray(events['tree-feature-modified'])
                    ? events['tree-feature-modified']
                    : [events['tree-feature-modified']];

                handlers.forEach(entry => {
                    if (!entry || typeof entry.callback !== 'function' || entry.__qolPayloadGuardWrapped) {
                        return;
                    }

                    const originalCallback = entry.callback;
                    entry.callback = function(data, ...rest) {
                        return originalCallback.call(this, data || {}, ...rest);
                    };
                    entry.__qolPayloadGuardWrapped = true;
                });
            };

            const originalInitRefreshHandlers = treeView.initRefreshHandlers;
            if (typeof originalInitRefreshHandlers !== 'function') {
                throw new Error('equipmentTree.treeView.initRefreshHandlers not a function');
            }

            treeView.initRefreshHandlers = function patchedInitRefreshHandlers() {
                if (this.__qolDbViewChangedHandler) {
                    this.app.off('database-view-changed', this.__qolDbViewChangedHandler);
                }
                if (this.__qolTreeFeatureModifiedHandler) {
                    this.app.off('tree-feature-modified', this.__qolTreeFeatureModifiedHandler);
                }

                this.__qolDbViewChangedHandler = () => {
                    this.refreshFor(this.feature);
                };

                this.__qolTreeFeatureModifiedHandler = (data) => {
                    if (data?.feature) {
                        this.feature = data.feature;
                    }
                    this.refreshFor(this.feature);
                };

                this.app.on('database-view-changed', this.__qolDbViewChangedHandler);
                this.app.on('tree-feature-modified', this.__qolTreeFeatureModifiedHandler);
            };

            wrapExistingTreeFeatureListeners();

            try {
                treeView.initRefreshHandlers();
            } catch (e) {
                console.warn('[userscript] tree-feature payload guard installed, but immediate rebind failed', e);
            }

            Object.defineProperty(treeView, '__treeFeaturePayloadGuardPatched', {
                value: { original: originalInitRefreshHandlers }
            });
            console.info('[userscript] Patched equipmentTree.treeView.initRefreshHandlers payload guard');
        }

        function applyAddPinConnectionInfo(treeView) {
            const original_addPinConnectionInfo = treeView._addPinConnectionInfo;
            if (typeof original_addPinConnectionInfo !== 'function') {
                throw new Error('equipmentTree.treeView._addPinConnectionInfo not a function');
            }

            treeView._addPinConnectionInfo = function(pinNodes, conns, cable, color2) {
                // When toggle OFF, use original IQGeo behavior
                if (!featureManager.isEnabled("Design Changes")) {
                    return original_addPinConnectionInfo.call(this, pinNodes, conns, cable, color2);
                }
                
                for (const conn of conns) {
                    // QOL patch: Normalize delta location - copy from alternate location if needed
                    const hasAltDelta = !conn.delta && conn.conn_rec?._myw?.delta;
                    if (hasAltDelta) {
                        conn.delta = conn.conn_rec._myw.delta;
                        
                        // Generate deltaTitle if not available: "design/NAME" -> "Design: NAME"
                        if (conn.conn_rec._myw.delta_owner_title) {
                            conn.deltaTitle = conn.conn_rec._myw.delta_owner_title;
                        } else if (conn.delta && conn.delta.startsWith('design/')) {
                            conn.deltaTitle = 'Design: ' + conn.delta.replace('design/', '');
                        }
                        
                        // Override isProposed() to return true for normalized deltas
                        if (!conn.__isProposedPatched) {
                            const originalIsProposed = conn.isProposed.bind(conn);
                            conn.isProposed = function() {
                                const original = originalIsProposed();
                                // Return true if we have a delta (normalized or original)
                                return original || !!conn.delta;
                            };
                            conn.__isProposedPatched = true;
                        }
                    }
                    
                    // Determine colours for highlights
                    const fromCableColor = conn.from_cable === cable ? undefined : color2;
                    const toCableColor = !cable || conn.to_cable === cable ? undefined : color2;
                    const currentDelta = this.ds.getDelta();

                    // Build highlights
                    const fromGeomRep = this.geomRepForCable(
                        conn.from_cable,
                        conn.from_feature,
                        conn.from_cable_side,
                        fromCableColor
                    );
                    const toGeomRep = this.geomRepForCable(
                        conn.to_cable,
                        conn.to_feature,
                        conn.to_cable_side,
                        toCableColor
                    );
                    // Update nodes for connection (avoiding problems with broken data)
                    for (let pin = conn.from_pins.low; pin <= conn.from_pins.high; pin++) {
                        const node = pinNodes[pin];

                        // Check for broken data
                        if (!node) {
                            console.warn(`equipmentTree: No node for pin ${pin}`);
                            continue;
                        }

                        // Check for already added (can happen with bi-directional cables)
                        if (node.conn && node.conn.urn === conn.urn) continue;

                        // for handling if connection is in both master and one or more designs (gazumped)
                        const gazumped = node.conn && conn.delta && conn.delta !== currentDelta;
                        if (!gazumped) node.conn = conn;

                        node.text += this.displayManager.connLabel(pin, conn);

                        // Mark all connections with delta as proposed
                        if (conn.delta) {
                            if (!gazumped) node.proposed = true;
                            node.highlight = null;
                            node.highlight2 = null;
                            node.link = conn.delta;
                            continue;
                        }

                        node.highlight = fromGeomRep;
                        node.highlight2 = toGeomRep;
                    }
                }
            };

            Object.defineProperty(treeView, '__addPinConnectionInfoPatched', { value: true });

            // Apply custom hover highlight colors via geomRepFor patch.
            applyGeomRepForPatch(treeView);

            console.info('[userscript] Patched equipmentTree.treeView._addPinConnectionInfo + geomRepFor');
        }


        function applyDisplayManagerPatch(dm) {
            // Override _proposedText to conditionally use different color for current delta
            const original_proposedText = dm._proposedText;
            dm._proposedText = function(text, deltaDesc = null, conn = null) {
                // When toggle OFF, use original IQGeo behavior
                if (!featureManager.isEnabled("Design Changes")) {
                    return original_proposedText.call(this, text, deltaDesc);
                }
                
                // Feature enabled - highlight current delta differently
                const currentDelta = window.myw?.app?.getDelta() || '';
                let isCurrentDelta = false;
                if (conn && conn.delta && currentDelta) {
                    isCurrentDelta = conn.delta === currentDelta;
                }
                const color = isCurrentDelta ? "#20b94b" : this.proposedObjectStyle.color;

                let html = `<span style="color:${color};"> ${text} </span>`;

                if (deltaDesc) {
                    html += `<span class="design-link" style="color:${color};" > [${deltaDesc}] </span>`;
                }

                return html;
            };

            // Override spliceLabel to show proposed connection count
            const originalSpliceLabel = dm.spliceLabel;
            dm.spliceLabel = function(splice) {
                // When toggle OFF, use original IQGeo behavior
                if (!featureManager.isEnabled("Design Changes")) {
                    return originalSpliceLabel.call(this, splice);
                }
                
                const currentDelta = window.myw?.app?.getDelta() || '';
                
                // Get total count and proposed count
                let count = 0;
                let proposedCount = 0;
                for (const conn of splice.conns) {
                    const connCount = conn.from_pins.size;
                    count += connCount;
                    
                    // Normalize delta if needed (same as in _addPinConnectionInfo)
                    if (!conn.delta && conn.conn_rec?._myw?.delta) {
                        conn.delta = conn.conn_rec._myw.delta;
                        if (conn.conn_rec._myw.delta_owner_title) {
                            conn.deltaTitle = conn.conn_rec._myw.delta_owner_title;
                        } else if (conn.delta && conn.delta.startsWith('design/')) {
                            conn.deltaTitle = 'Design: ' + conn.delta.replace('design/', '');
                        }
                        
                        // Override isProposed() to return true for normalized deltas
                        if (!conn.__isProposedPatched) {
                            const originalIsProposed = conn.isProposed.bind(conn);
                            conn.isProposed = function() {
                                return originalIsProposed() || !!conn.delta;
                            };
                            conn.__isProposedPatched = true;
                        }
                    }
                    
                    // Check if proposed AND in current delta
                    const isConnProposed = (conn.isProposed && conn.isProposed()) || !!conn.delta;
                    const isCurrentDelta = conn.delta === currentDelta;
                    if (isConnProposed && isCurrentDelta) {
                        proposedCount += connCount;
                    }
                }

                // Build label
                const from = splice.from_cable.properties.name;
                const to = splice.to_cable.properties.name;
                let text = `${this.msg('splice')}: ${from} -> ${to} (${count})`;
                
                // Add proposed count if any
                if (proposedCount > 0) {
                    text += ` <span style="color: #20b94b; margin-left: 8px;">[${proposedCount} Pending]</span>`;
                }

                if (splice.proposed) {
                    return this._proposedText(text, splice.deltaTitle);
                }

                return text;
            };

            // Override connLabel to show both pin details AND delta info for proposed connections
            const originalConnLabel = dm.connLabel;
            dm.connLabel = function(pin, conn) {
                // When toggle OFF, use original IQGeo behavior
                if (!featureManager.isEnabled("Design Changes")) {
                    return originalConnLabel.call(this, pin, conn);
                }
                
                // Get the detailed pin info
                const baseLabel = this._connLabel(pin, conn);
                
                // If proposed, append delta info
                if (conn.isProposed && conn.isProposed()) {
                    const deltaDesc = conn.deltaTitle || (conn.delta ? conn.delta.replace('design/', 'Design: ') : '');
                    const proposedText = this._proposedText ? this._proposedText(baseLabel, deltaDesc, conn) : `${baseLabel} (${deltaDesc})`;
                    return proposedText;
                }
                
                return baseLabel;
            };

            // Use a normal function to preserve `this` so calls to this.msg / this.getColorHTMLFor work
            dm._connLabel = function (pin, conn) {
                const toPin = conn.toPinFor(pin);

                // Build direction indicator (fallback when to_feature is missing)
                const connDir = conn?.to_feature ? this._connDir(conn) : '<-?->';

                // Build feature ident
                let ftrStr = '';
                if (conn?.to_cable) {
                    ftrStr = conn.to_cable.properties?.name ?? '';
                } else if (conn?.to_feature) {
                    ftrStr = conn.to_feature.properties?.name ?? '';
                }

                // Build pin ident
                let pinStr;
                if (conn?.to_cable) {
                    if (conn.to_cable.properties?.directed) {
                        pinStr = '' + toPin;
                    } else {
                        pinStr = this.msg('cable_pin_' + conn.to_pins.side) + ':' + toPin;
                    }
                    pinStr += this.getColorHTMLFor(conn.to_cable, toPin, 'to');
                } else {
                    if (conn?.to_feature) {
                        const sideLabel = conn.to_feature.getSideLabelID(conn.to_pins.side);
                        pinStr = this.msg('side_' + sideLabel + ':' + toPin);
                    } else {
                        pinStr = `${conn?.to_ref ? conn.to_ref : '?'}:${toPin}`;
                    }
                }

                return ` ${connDir} ${ftrStr} #${pinStr}`;
            };

            Object.defineProperty(dm, '__connLabelPatchedSimple', { value: true });
            console.info('[userscript] Patched displayManager._connLabel, _proposedText, connLabel, and spliceLabel');
        }

        function applyLocManagerPatch(lm) {
            // Keep async signature so callers using await remain compatible
            lm.getFeatureLOCDetailsAt = async function (struct, features, segments = true, include_proposed = false) {
                return {};
            };

            Object.defineProperty(lm, '__getFeatureLOCDetailsAtPatched', { value: true });
            console.info('[userscript] Patched locManager.getFeatureLOCDetailsAt');
        }

        let saveStateDebounceTimer = null;
        const DEBUG_SAVESTATE = false; // Set to true for diagnostic logging
        const SAVE_DEBOUNCE_MS = 500; // Wait 500ms after last change before writing to localStorage

        function applyEquipmentTreeSaveState(treeView) {
            // localStorage persistence constants
            const STORAGE_KEY = 'qol-tree-state';
            const MAX_STRUCTURES = 10; // Keep last 10 structures
            const MAX_AGE_DAYS = 7; // Purge entries older than 7 days
            
            // Load and purge localStorage
            function loadFromLocalStorage() {
                try {
                    const stored = localStorage.getItem(STORAGE_KEY);
                    if (!stored) return {};
                    
                    const data = JSON.parse(stored);
                    const now = Date.now();
                    const maxAge = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
                    
                    // Purge old entries
                    const purged = {};
                    for (const [key, value] of Object.entries(data)) {
                        if (now - value.timestamp < maxAge) {
                            purged[key] = value;
                        } else if (DEBUG_SAVESTATE) {
                            console.log(`[userscript] Purged stale tree state for ${key}`);
                        }
                    }
                    
                    return purged;
                } catch (e) {
                    console.warn('[userscript] Error loading tree state from localStorage:', e);
                    return {};
                }
            }
            
            // Save to localStorage with LRU purge
            function saveToLocalStorage(structUrn, openNodes) {
                try {
                    const data = loadFromLocalStorage();
                    
                    if (openNodes.length === 0) {
                        // Remove entry if only root is open (no state to save)
                        if (data[structUrn]) {
                            delete data[structUrn];
                            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                            if (DEBUG_SAVESTATE) {
                                console.log(`[userscript] Removed ${structUrn} - only root open`);
                            }
                        }
                        return;
                    }
                    
                    // Update entry
                    data[structUrn] = {
                        open: openNodes,
                        timestamp: Date.now()
                    };
                    
                    // LRU purge - keep only MAX_STRUCTURES most recent
                    const entries = Object.entries(data);
                    if (entries.length > MAX_STRUCTURES) {
                        entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
                        const kept = Object.fromEntries(entries.slice(0, MAX_STRUCTURES));
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
                        if (DEBUG_SAVESTATE) {
                            console.log(`[userscript] Purged old entries, kept ${MAX_STRUCTURES} most recent`);
                        }
                    } else {
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                    }
                } catch (e) {
                    console.warn('[userscript] Error saving tree state to localStorage:', e);
                }
            }
            
            // Wrapper - only write after 500ms of inactivity
            function saveToLocalStorageWrapper(structUrn, openNodes) {
                clearTimeout(saveStateDebounceTimer);
                saveStateDebounceTimer = setTimeout(() => {
                    saveToLocalStorage(structUrn, openNodes);
                }, SAVE_DEBOUNCE_MS);
            }

            // Seed incremental open-set from localStorage and session state
            treeView.owner = treeView.owner || {};
            treeView.owner.saved_state = treeView.owner.saved_state || {};
            
            // Capture state key once for consistency
            if (!treeView.rootUrn) {
                console.warn('[userscript] treeView.rootUrn is not set, saveState may not work correctly');
            }
            
            const stateKey = treeView.rootUrn;
            
            // Try localStorage first, fall back to session state
            const localData = loadFromLocalStorage();
            const localPrior = localData[stateKey]?.open || [];
            const sessionPrior = (treeView.owner.saved_state[stateKey]?.open) || [];
            const prior = localPrior.length > 0 ? localPrior : sessionPrior;
            
            treeView._openSet = new Set(prior);
            
            // Include root in saved_state (not in _openSet/storage)
            const openArray = Array.from(treeView._openSet);
            const savedStateArray = [stateKey, ...openArray];
            treeView.owner.saved_state[stateKey] = { open: savedStateArray };
            
            if (DEBUG_SAVESTATE && prior.length > 0) {
                const source = localPrior.length > 0 ? 'localStorage' : 'session';
                console.log(`[userscript] Initial: Restored ${prior.length} nodes from ${source}`);
            }
            
            // Track current rootUrn for detecting structure changes
            treeView._currentRootUrn = stateKey;

            // Lightweight check for "node or any parent is loading"
            function isNodeOrParentsLoading(inst, node) {
                try {
                    if (inst.is_loading && inst.is_loading(node)) return true;
                    if (node && Array.isArray(node.parents)) {
                        for (let i = 0; i < node.parents.length; i++) {
                            const p = inst.get_node(node.parents[i]);
                            if (inst.is_loading && inst.is_loading(p)) return true;
                            if (p && p.state && p.state.loading) return true;
                        }
                    }
                    return node && node.state && node.state.loading;
                } catch {
                    return false;
                }
            }

            // Replace saveState: O(1) add/remove
            treeView.saveState = function (nodeData) {
                if (!this.owner.saved_state) return;
                if (!nodeData || !nodeData.instance) return;

                const inst = nodeData.instance;
                const node = inst.get_node(nodeData.node || nodeData);
                if (!node) return;

                // Skip if node or parents are still loading
                if (isNodeOrParentsLoading(inst, node)) {
                    if (DEBUG_SAVESTATE) {
                        console.log('[userscript] Node or parent loading, skipping save:', node.id);
                    }
                    return;
                }
                
                // Skip if DOM element doesn't exist (solution for race condition during slow loads)
                const domEl = inst.get_node(node, true);
                if (!domEl || !domEl.length) {
                    if (DEBUG_SAVESTATE) {
                        console.log('[userscript] DOM element missing, skipping save:', node.id);
                    }
                    return;
                }

                const currentStateKey = this.rootUrn;
                if (!currentStateKey) {
                    console.warn('[userscript] rootUrn not available during saveState');
                    return;
                }

                // Validate node ID is not empty/undefined
                if (!node.id) {
                    console.warn('[userscript] Invalid node.id during saveState:', node);
                    return;
                }

                const wasOpen = this._openSet.has(node.id);
                const isOpen = node.state && node.state.opened;

                // Don't track root node in _openSet (it's always in saved_state)
                if (node.id === this.rootUrn) return;
                
                if (isOpen) {
                    this._openSet.add(node.id);
                    if (DEBUG_SAVESTATE && !wasOpen) {
                        console.log('[userscript] Opened:', node.id);
                    }
                } else {
                    this._openSet.delete(node.id);
                    if (DEBUG_SAVESTATE && wasOpen) {
                        console.log('[userscript] Closed:', node.id);
                    }
                }
                
                // Maintain consistency: root in saved_state, not in localStorage
                const openArray = Array.from(this._openSet);
                const savedStateArray = [currentStateKey, ...openArray];
                this.owner.saved_state[currentStateKey] = { open: savedStateArray };
                saveToLocalStorageWrapper(currentStateKey, openArray);
            };

            // Patch getTreesFor to load saved state before tree initialization
            // Runs after rootUrn is set but before tree is built
            const originalGetTreesFor = treeView.getTreesFor;
            treeView.getTreesFor = async function(feature, lazyBuild = false) {
                // Get the root housing to determine rootUrn for this structure
                const struct = await feature.getRootHousing();
                const currentRootUrn = struct.getUrn();
                
                // If structure changed, load saved state before building tree
                if (currentRootUrn && currentRootUrn !== this._currentRootUrn) {
                    this._currentRootUrn = currentRootUrn;
                    
                    // Load open nodes from localStorage for this structure
                    const localData = loadFromLocalStorage();
                    const localPrior = localData[currentRootUrn]?.open || [];
                    const sessionPrior = (this.owner.saved_state[currentRootUrn]?.open) || [];
                    const prior = localPrior.length > 0 ? localPrior : sessionPrior;
                    
                    // Don't store root in _openSet, but include in saved_state
                    this._openSet = new Set(prior.filter(id => id !== currentRootUrn));
                    
                    const openArray = Array.from(this._openSet);
                    const savedStateArray = [currentRootUrn, ...openArray];
                    this.owner.saved_state[currentRootUrn] = { open: savedStateArray };
                    
                    if (DEBUG_SAVESTATE) {
                        console.log(`[userscript] Structure: ${currentRootUrn}`);
                        console.log(`  Loaded ${prior.length} nodes from ${localPrior.length > 0 ? 'localStorage' : 'session'}`);
                    }
                }
                
                // Now call original to build tree with our saved state
                return await originalGetTreesFor.call(this, feature, lazyBuild);
            };

            Object.defineProperty(treeView, '__saveStatePatched', { value: true });
            
            if (DEBUG_SAVESTATE) {
                const currentStorage = loadFromLocalStorage();
                const structCount = Object.keys(currentStorage).length;
                console.info('[userscript] Tree state persistence enabled');
                console.log(`  Currently tracking ${structCount}/${MAX_STRUCTURES} structures`);
            } else {
                console.info('[userscript] Patched equipmentTree.treeView with state persistence');
            }
        }

        // async function armEquipmentTreeStateTrigger() {
        //     const treeView = await waitFor(getEquipTree);
        //     const sm = await waitFor(getStructureManager);
        //     const app = window.myw?.app;

        //     if (!treeView || !sm || !app) return;

        //     sm.trigger('state-changed', sm.app.currentFeature);

        //     // Try now and re-try periodically to catch SPA remounts
        //     bindNow();
        //     if (treeView.__restoreTriggerPollIdV2) clearInterval(treeView.__restoreTriggerPollIdV2);
        //     treeView.__restoreTriggerPollIdV2 = setInterval(bindNow, 1000);
        // }

        function applyStructureManagerPatch(sm) {
            const original = sm.structContent;
            if (typeof original !== 'function') {
                throw new Error('structureManager.structContent not a function');
            }

            // Replace with a delegating wrapper (preserves scope of StructContents called within original structContent)
            sm.structContent = async function (struct, includeProposed = false, layer = undefined) {
                // Only override when we can compute a sensible layer
                try {
                    // const equipTree = getEquipTree();
                    const structUrn = (struct && struct.type && struct.id) ? (struct.type + '/' + struct.id) : null;

                    let newLayer = layer; // default: keep whatever caller passed

                    // if (equipTree && equipTree.saved_state && structUrn) {
                        // const ss = equipTree.saved_state[structUrn];
                        // const openList = Array.isArray(ss?.open) ? ss.open : null;

                        // If caller points at the struct root (or didn't specify a layer),
                        // redirect to a "deepest recently opened" node when available.
                        //if ((layer === undefined || layer === structUrn) && openList && openList.length) {
                            // Heuristic: last opened entry tends to be the deepest after restore
                            //newLayer = openList[openList.length - 1];
                            // Uncomment for debug:
                            //console.log('[userscript] structContent: redirected layer ->', newLayer);
                        //}

                    if (layer === structUrn) {
                        newLayer = undefined;
                        console.log(`[userscript] structContent: redirected layer ${layer} -> ${newLayer}`);
                    }
                    // }

                    // Delegate back to the original (keeps the correct StructContents constructor)
                    return await original.call(this, struct, includeProposed, newLayer);
                } catch (e) {
                    console.warn('[userscript] structContent override error; falling back to original', e);
                    return await original.call(this, struct, includeProposed, layer);
                }
            };

            Object.defineProperty(sm, '__structContentPatched', { value: true });
            console.info('[userscript] Patched structureManager.structContent (delegating, no direct StructContents)');
        }

        const getMapForCopyCoordinate = () => {
            const m = window.myw?.app?.map;
            return (m && typeof m._copyCoordinate === 'function') ? m : null;
        };

        function applyCopyCoordinatePatch(map) {
            map._copyCoordinate = function (mapArg, location) {
                // location.coordinate is [lng, lat] - swap to [lat, lng]
                const lat = location.coordinate[1].toFixed(7);
                const lng = location.coordinate[0].toFixed(7);

                const formatted = `${lat}, ${lng}`;

                // Replacement for copyToClipboard() that is not available to patch
                navigator.clipboard?.writeText(formatted).catch(() => {
                    const el = document.createElement('textarea');
                    el.value = formatted;
                    document.body.appendChild(el);
                    el.select();
                    document.execCommand('copy');
                    document.body.removeChild(el);
                });
            };

            Object.defineProperty(map, '__copyCoordinatePatched', { value: true });
            console.info('[QOL] Plugin Patches: _copyCoordinate patched');
        }

        // Patch geomRepFor on cable tree views independently of the Terminations
        // feature, so custom hover highlight colors work in the Cables section
        // even when Auto Terminations is disabled.
        const getCableTree = () => {
            try {
                const ct = window.myw?.app?.plugins?.cableTree;
                if (!ct) return null;
                const views = [ct.structCableTreeView, ct.routeTreeView].filter(Boolean);
                return views.length ? ct : null;
            } catch { return null; }
        };
        // structCableTreeView and routeTreeView can each appear at different times
        // (e.g. routeTreeView only once the user opens the Routes section), so this
        // is never considered permanently "done" - apply() is cheap and idempotent
        // per-view, so it's fine to keep re-checking for the life of the session.
        const isCableTreePatched = () => false;
        function applyCableTreeGeomRepFor(ct) {
            [ct.structCableTreeView, ct.routeTreeView].forEach(tv => {
                if (!tv || tv.__geomRepForPatched) return;
                applyGeomRepForPatch(tv);
                console.info('[userscript] Patched cableTree geomRepFor (independent path)');
            });
        }

        const getStreetviewReady = () => {
            const sv = window.myw?.app?.plugins?.streetview;
            // smallSvControl is created lazily by the details panel - wait for it too
            return (sv && sv.smallSvControl) ? sv : null;
        };
        function applyStreetviewPlugin(sv) {
            // Collapse immediately for this session
            sv.smallSvControl.collapse();

            // Prevent IQGeo persisting the expanded state across reloads
            sv.getState = () => ({ collapsed: true });

            // Collapse synchronously on feature change - before the async findPano() gap -
            // so the panel never flashes expanded between feature selections.
            sv.app.on('currentFeature-changed', () => {
                if (sv.smallSvControl) sv.smallSvControl.collapse();
            });

            Object.defineProperty(sv, '__svCollapsePatchApplied', { value: true });
            console.info('[userscript] Patched streetviewPlugin: always collapsed');
        }

        // Fix trace result hover tooltips: segment_ids from the server is a
        // compact comma-separated string with no spacing, causing the popup to
        // overflow off-screen. Adds spaces after commas and constrains tooltip
        // width via CSS so the text wraps correctly.
        const getMapForTraceTooltip = () => {
            const m = window.myw?.app?.map;
            return (typeof m?._showTooltip === 'function') ? m : null;
        };
        function applyTraceTooltipSegIds(map) {
            const MapControl = map.constructor;

            // position:static removes the shrink-wrap that defeats max-width.
            // white-space:normal overrides the upstream nowrap rule.
            // !important beats the high-specificity IQGeo SCSS selector.
            const style = document.createElement('style');
            style.textContent = [
                '.feature-tooltip { position: static !important; max-width: 400px !important; }',
                '.feature-tooltip dd { white-space: normal !important; }'
            ].join('\n');
            document.head.appendChild(style);

            const origShowTooltip = MapControl.prototype._showTooltip;
            MapControl.prototype._showTooltip = function (event) {
                origShowTooltip.call(this, event);
                if (!this._isTooltipVisible || !this._tooltipElement) return;
                this._tooltipElement.querySelectorAll('dd').forEach(function (dd) {
                    // Only touch plain text <dd> nodes - skip those with nested HTML
                    if (dd.childNodes.length !== 1 || dd.childNodes[0].nodeType !== Node.TEXT_NODE) return;
                    const textNode = dd.childNodes[0];
                    if (/,\d/.test(textNode.nodeValue)) {
                        textNode.nodeValue = textNode.nodeValue.replace(/,(?=\d)/g, ', ');
                    }
                });
            };
            MapControl.prototype._qolTooltipPatched = true;
            console.info('[userscript] Patched MapControl._showTooltip: trace tooltip segment ID fix');
        }

        function applyPatches() {
            // Each entry is applied the instant its target becomes available - whether
            // that's immediately on page load or only after the user opens a panel
            // (e.g. equipmentTree/streetview are lazily created) minutes later.
            registerPatch(getEquipTreeView, tv => !!tv.__refreshForLazyPatched, applyFeatureTreeRefreshLazy, 'refreshFor lazy');
            registerPatch(getEquipTreeView, tv => !!tv.__treeFeaturePayloadGuardPatched, applyTreeFeatureModifiedPayloadGuard, 'tree-feature-modified payload guard');
            registerPatch(getEquipTreeView, tv => !!tv.__addPinConnectionInfoPatched, applyAddPinConnectionInfo, 'addPinConnectionInfo');
            registerPatch(getEquipTreeView, tv => !!tv.__saveStatePatched, applyEquipmentTreeSaveState, 'equipmentTree save state');
            registerPatch(getDisplayManager, dm => !!dm.__connLabelPatchedSimple, applyDisplayManagerPatch, 'displayManager');
            registerPatch(getLocManager, lm => !!lm.__getFeatureLOCDetailsAtPatched, applyLocManagerPatch, 'locManager');
            registerPatch(getStructureManager, sm => !!sm.__structContentPatched, applyStructureManagerPatch, 'structureManager');
            registerPatch(getCableTree, isCableTreePatched, applyCableTreeGeomRepFor, 'cableTree geomRepFor');
            registerPatch(getStreetviewReady, sv => !!sv.__svCollapsePatchApplied, applyStreetviewPlugin, 'streetview collapse');
            registerPatch(getMapForTraceTooltip, m => !!m.constructor.prototype._qolTooltipPatched, applyTraceTooltipSegIds, 'trace tooltip seg ids');
            registerPatch(getMapForCopyCoordinate, m => !!m.__copyCoordinatePatched, applyCopyCoordinatePatch, 'copyCoordinate');
        }

        function start() {
            if (started) return;
            started = true;
            applyPatches();
        }

        function stop() {
            if (!started) return;
            started = false;

            stopPatchPolling();

            // Clear debounce timer
            if (saveStateDebounceTimer) {
                clearTimeout(saveStateDebounceTimer);
                saveStateDebounceTimer = null;
            }
        }

        // // Re-apply on SPA URL changes
        // let lastHref = location.href;
        // setInterval(() => {
        //     if (lastHref !== location.href) {
        //         lastHref = location.href;
        //         applyPatches();
        //     }
        // }, 1000);

        // // Light DOM-change heuristic for remounts
        // const mo = new MutationObserver(() => {
        //     if (!getDisplayManager() || !getLocManager()) return;
        //     applyPatches();
        // });
        // mo.observe(document.documentElement, { childList: true, subtree: true });
        return { start, stop };
    })();

    // Panel Width Persistence: Patch DesktopLayout to remember west panel width
    const panelWidthPersistence = (() => {
        let started = false;
        let saveTimeout = null;
        const STORAGE_KEY = 'qol-west-pane-width';
        const SAVE_DELAY_MS = 500;

        function saveWidth(width) {
            const numWidth = typeof width === 'number' ? width : parseInt(width, 10);
            if (numWidth > 0) {
                localStorage.setItem(STORAGE_KEY, numWidth.toString());
            }
        }

        function getSavedWidth() {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? parseInt(saved, 10) : null;
        }

        function patchDesktopLayout() {
            const DesktopLayout = window.myw?.DesktopLayout;
            if (!DesktopLayout || !DesktopLayout.prototype) {
                return false;
            }
            
            // Check if already patched
            if (DesktopLayout.prototype.__westWidthPatched) {
                return true;
            }
            
            // Patch the setBodyLayout method to inject saved width
            const originalSetBodyLayout = DesktopLayout.prototype.setBodyLayout;
            if (typeof originalSetBodyLayout !== 'function') {
                return false;
        }

            DesktopLayout.prototype.setBodyLayout = function(app) {
            const savedWidth = getSavedWidth();
                
                // Intercept the layout() call to wrap the west.onresize callback
                const originalLayoutFn = this.$el.layout;
                this.$el.layout = function(layoutOptions) {
                    // Wrap the west pane's onresize callback to save width on resize
                    if (layoutOptions && layoutOptions.west && layoutOptions.west.onresize) {
                        const originalWestOnResize = layoutOptions.west.onresize;
                        layoutOptions.west.onresize = function(paneName, paneElement, paneState, paneOptions, layoutName) {
                            const result = originalWestOnResize.apply(this, arguments);

                            // Save the new width from paneState (debounced)
                            if (started && paneState && typeof paneState.size === 'number' && paneState.size > 0) {
                            clearTimeout(saveTimeout);
                                saveTimeout = setTimeout(() => saveWidth(paneState.size), SAVE_DELAY_MS);
                        }
                            
                            return result;
                        };
                    }
                    
                    return originalLayoutFn.call(this, layoutOptions);
                };

                // Override westPanelInitialSize with saved width if available
                if (savedWidth && this.options) {
                    this.options.westPanelInitialSize = savedWidth;
                }
                
                originalSetBodyLayout.call(this, app);
                
                // Restore original $el.layout
                this.$el.layout = originalLayoutFn;
            };

            // Mark as patched
            DesktopLayout.prototype.__westWidthPatched = true;
            return true;
        }

        function start() {
            if (started) return;
            started = true;

            // Patch DesktopLayout prototype before it initializes
            patchDesktopLayout();
        }

        function stop() {
            if (!started) return;
            started = false;

            if (saveTimeout) {
                clearTimeout(saveTimeout);
                saveTimeout = null;
            }
        }

        return { start, stop };
    })();

    // Route-based feature loading
    if (IS_LOGIN) {
        const autoLoginFeature = FEATURE_TOGGLES.find(f => f.label === "Auto Login");
        if (autoLoginFeature) {
            featureManager.register(autoLoginFeature.label, { start: handleAutoLogin }, { defaultState: autoLoginFeature.defaultState, hidden: autoLoginFeature.hidden });
        }
        featureManager.init();
        return;
    }

    if (IS_CONFIG) {
        runConfigEnhancements();
        return;
    }

    if (!IS_MYWCOM) {
        return;
    }

    // Load each feature through the feature manager for /mywcom
    // Register features with their default states
    FEATURE_TOGGLES.forEach(feature => {
        const handlers = {
            "Auto Login": { start: handleAutoLogin },
            // Design Changes: Now integrated into Plugin Patches feature
            // Toggle only affects visual indicators (runtime checks in patches)
            // No separate start/stop needed - patches remain active for delta normalization
            "Design Changes": { start: () => {}, stop: () => {} },
            "Notifications": { start: startNotificationsPoll, stop: stopNotificationsPoll },
            "Details Popup": { start: () => featureDetailsPopup.observe(), stop: () => featureDetailsPopup.stop() },
            "Auto Terminations": { 
                start: () => { enableXhrIntercept(); featureBetterTerminations.setupMutationObserver(); featureBetterTerminations.setupTreeListeners(); }, 
                stop: () => { featureBetterTerminations.stopObserving(); disableXhrIntercept(); } 
            },
            "Restore Panel Width": { start: () => panelWidthPersistence.start(), stop: () => panelWidthPersistence.stop() },
            "Custom Add Object": { start: () => featureHorizontalMenu.start(), stop: () => featureHorizontalMenu.stop() },
            "Error Monitor": { start: () => errorMonitorFeature.start(), stop: () => errorMonitorFeature.stop() },
            "Plugin Patches": { start: () => pluginOverridesFeature.start(), stop: () => pluginOverridesFeature.stop() },
            "Funny Day 🤪": { start: () => aprilFoolsFeature.start(), stop: () => aprilFoolsFeature.stop() }
        };
        
        featureManager.register(feature.label, handlers[feature.label] || {}, { defaultState: feature.defaultState, hidden: feature.hidden });
    });
    featureManager.init();
})();

/*
For tables in Config

Stop header tooltips showing on hover
    div.ant-tooltip
        display: none !important;

Make table headers stay at top when scrolling
div.ant-table-container
    max-height: 100%;
    overflow-y: scroll;
    border: 1px solid #ccc;

thead.ant-table-thead
    position: sticky;
    top: 0;
    z-index: 10;

Optional headache for better UI
th.ant-table-column-has-sorters
    background-color: iqgeoGreen
    font-color? white
    up/down arrow colors?
        ant-table-column-sorter-down
        ant-table-column-sorter-down.active

*/


// TODO
/*

splice group
    * fix formatting so cable pairs are a list
    * fix strands not in ascending order (create object map first, sort, then create HTML?)
    * determine why cable pairs are not grouped (inspect object map)

*/
