(function () {
    console.log("Conterra's IQGeo QOL Userscript Loaded");

    const iqgeoGreen = "#3CA22D";
    const HREF = window.location.href;
    const IS_LOGIN = HREF.includes("/login");
    const IS_CONFIG = HREF.includes("/config");
    const IS_MYWCOM = HREF.includes("/mywcom");
    const NOTIFICATION_POLL_MS = 300_000;
    const FEATURE_TOGGLES = [
        { label: "Auto Login", description: "Automatically uses OIDC login method", defaultState: "on", hidden: true },
        { label: "Design Changes", description: "Highlights pending splice changes in the current design", defaultState: "on", hidden: false },
        { label: "Details Popup", description: "View the active Details content in a draggable popup", defaultState: "on", hidden: false },
        { label: "Auto Terminations", description: "Automatically displays fiber terminations (and more) for segments", defaultState: "on", hidden: false },
        { label: "Restore Panel Width", description: "Remembers the left panel width across page reloads", defaultState: "on", hidden: false },
        { label: "Notifications", description: "Polls for and displays system notifications", defaultState: "on", hidden: true },
        { label: "Error Monitor", description: "Displays a console for errors and network issues", defaultState: "off", hidden: true },
        { label: "Plugin Patches", description: "Applies monkey-patches/overrides to IQGeo app internals", defaultState: "on", hidden: true }
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
            if (!DEBUG_CONFIG.enabled) return level === 'error' || level === 'warn';
            if (!feature) return DEBUG_CONFIG.enabled;
            return DEBUG_CONFIG.features[feature] === true || DEBUG_CONFIG.enabled;
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

    const featureManager = (() => {
        const states = {};
        const features = {};
        let onChange = null;

        function loadState(label, defaultState = "on") {
            return localStorage.getItem(`qol-menu_${label}`) || defaultState;
        }

        function persistState(label, state) {
            localStorage.setItem(`qol-menu_${label}`, state);
        }

        function notify(label, state) {
            if (onChange) {
                onChange(label, state);
            }
        }

        function register(label, handlers = {}, options = {}) {
            const { defaultState = "on" } = options;
            features[label] = {
                start: handlers.start,
                stop: handlers.stop,
            };
            if (!states[label]) {
                states[label] = loadState(label, defaultState);
            }
        }

        function setState(label, state) {
            if (states[label] === state) {
                return;
            }
            states[label] = state;
            persistState(label, state);
            if (state === "on") {
                features[label]?.start?.();
            } else {
                features[label]?.stop?.();
            }
            notify(label, state);
        }

        function toggle(label) {
            const nextState = states[label] === "on" ? "off" : "on";
            setState(label, nextState);
        }

        function init() {
            Object.entries(features).forEach(([label, handlers]) => {
                if (!states[label]) {
                    states[label] = loadState(label, "on");
                }
                if (states[label] === "on") {
                    handlers.start?.();
                }
            });
            Object.entries(states).forEach(([label, state]) => notify(label, state));
        }

        function onStateChange(cb) {
            onChange = cb;
        }

        function isEnabled(label) {
            return states[label] === "on";
        }

        function getState(label) {
            return states[label] || loadState(label, "on");
        }

        return {
            register,
            setState,
            toggle,
            init,
            onStateChange,
            isEnabled,
            getState,
        };
    })();

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

        .floating-menu {
            position: fixed;
            top: 52px;
            right: 160px;
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
        button.addEventListener("click", function () {
            if (menu.style.display === "none") {
                menu.style.display = "block";
            } else {
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

        // Insert the menu just after the header content
        headerContent.parentNode.insertAdjacentElement("afterend", menu);

        // Create the wrapper div
        var wrapperDiv = document.createElement("div");
        wrapperDiv.classList.add("right"); // Add the 'right' class

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

    function enableXhrIntercept() {
        xhrInterceptUsers++;
        xhrInterceptEnabled = xhrInterceptUsers > 0;
    }

    function disableXhrIntercept() {
        xhrInterceptUsers = Math.max(0, xhrInterceptUsers - 1);
        xhrInterceptEnabled = xhrInterceptUsers > 0;
    }

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
                    withInterceptPaused(() => {
                        const data = JSON.parse(responseText);
                        if (data) {
                            featureBetterTerminations.getRouteSegments(data);
                        }
                    });
                } catch (error) {
                    console.error(error);
                }
                return;
            }

            // Check URL for segment terminations (user clicked to run manually)
            const regexSegmentTerms = /\/modules\/comms\/fiber\/paths\/(mywcom_fiber_segment\/\d+)/;
            match = normalizedUrl.pathname.match(regexSegmentTerms);
            if (match && featureManager.isEnabled("Auto Terminations")) {
                withInterceptPaused(() => {
                    const segment = match[1];
                    const data = JSON.parse(responseText);
                    featureBetterTerminations.getSegment({ segment: segment, interceptedData: data }, true);
                });
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
            return origFetchIntercept.apply(this, args).then((res) => {
                // Skip non-successful responses (e.g., 500 error pages with HTML)
                if (xhrInterceptEnabled && interceptPaused === 0 && res.ok) {
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
        console.log("Running - Details Popup")

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
        console.log("Running - Splice Calc")

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
        console.log('Running - Alt Splice Details');

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
        logger.info(FEATURE_NAME, "Running - Auto Terminations");

        const COMPANY_URL = `https://${window.location.hostname}`;
        const PORT = 'port';
        const FIBER_PATCH_PANEL = 'fiber_patch_panel';
        const FIBER_ONT = 'fiber_ont';
        const TERMINATION_BATCH_SIZE = 12;
        const TERMINATION_TIMEOUT_MS = 30000;
        const TERMINATION_MAX_CONCURRENCY = 3;
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

        let forceRefresh = false;
        let termMutationObserver = null;
        const displayRetryCounts = new Map();
        let cableTreePatched = false;
        let cableTreeShowPatched = false;
        const segmentBatchState = new Map(); // segment -> { strands: [], saved: number, fiberCount: number }

        // Cleanup stale cache data
        Object.entries(localStorage).forEach(([k, v]) => {
            if (k.includes("state")) return;
            if (v.includes("saved") && v.includes("data")) {
                purgeFeatureCache(k, 5);
            }
        });

        function findSegmentAnchor(segment) {
            // IDs contain slashes; use getElementById instead of querySelector
            const candidates = [
                `out_${segment}_anchor`,
                `in_${segment}_anchor`,
                `${segment}_anchor`
            ];
            for (const id of candidates) {
                const el = document.getElementById(id);
                if (el) return el;
            }
            return null;
        }

        function isSegmentExpanded(segment) {
            const anchor = findSegmentAnchor(segment);
            return !!(anchor && anchor.getAttribute('aria-expanded') === 'true');
        }

        let renderSequence = 0;

        function indexStrandAnchors(liElement) {
            // Map strand pin -> anchor element (tolerant of injected rows)
            const anchors = {};
            const leafAnchors = liElement ? liElement.querySelectorAll('li.jstree-leaf > a.jstree-anchor') : [];
            if (!leafAnchors.length) return anchors;

            const extractTextPin = (node) => {
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
            anchor.classList.remove('qol-term');
            anchor.querySelectorAll('.qol-status-message').forEach((n) => n.remove());
        }

        function resetSegmentAnchors(liElement) {
            if (!liElement) return;
            liElement.querySelectorAll('li.jstree-leaf > a').forEach(resetStrandAnchor);
            liElement.querySelectorAll('.qol-status-message').forEach((n) => n.remove());
        }

        async function showTerminations(segment, strands) {
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
                
                const anchor = findSegmentAnchor(segment);
                if (!anchor || anchor.getAttribute('aria-expanded') !== 'true') {
                    return;
                }
                const liElement = document.getElementById(`out_${segment}`) || document.getElementById(`in_${segment}`) || document.getElementById(segment);
                if (!liElement) {
                    const count = displayRetryCounts.get(segment) || 0;
                    if (count < 5) {
                        displayRetryCounts.set(segment, count + 1);
                        setTimeout(() => showTerminations(segment, strands), 250 * (count + 1));
                    }
                    return;
                }
                displayRetryCounts.delete(segment);
                const strandAnchorIndex = indexStrandAnchors(liElement);
                if (!Object.keys(strandAnchorIndex).length) {
                    const key = `${segment}::anchors`;
                    const count = displayRetryCounts.get(key) || 0;
                    if (count < 5) {
                        displayRetryCounts.set(key, count + 1);
                        setTimeout(() => showTerminations(segment, strands), 250 * (count + 1));
                        logger.debug(FEATURE_NAME, 'anchors not ready, retry', { segment, attempt: count + 1 });
                    } else {
                        logger.error(FEATURE_NAME, 'Strand DOM elements not found after retries:', segment);
                        displayRetryCounts.delete(key); // Clean up
                    }
                    return;
                }
                displayRetryCounts.delete(`${segment}::anchors`);
                // Reset only pins we are about to render; avoid clearing unrelated pins during batch updates
                let inCount = 0, outCount = 0;
                validStrands.forEach((strand) => {
                    if (strand.in.feature.startsWith(FIBER_PATCH_PANEL)) inCount++;
                    if (strand.out.feature.startsWith(FIBER_PATCH_PANEL)) outCount++;
                });
                for (const strand of validStrands) {
                    const pin = parseInt(strand.pin, 10);
                    const strandElement = strandAnchorIndex[pin];
                    if (!strandElement) {
                        logger.warn(FEATURE_NAME, `no strand anchor for pin ${pin} in ${segment}`, {
                            seq,
                            pinsAvailable: Object.keys(strandAnchorIndex),
                            strand
                        });
                        continue;
                    }
                    ensureBaselineAnchor(strandElement);
                    strandElement.querySelectorAll('.qol-term-row').forEach((n) => n.remove());
                    const baselineHtml = strandElement.dataset.qolOriginalHtml || '';
                    // Render baseline temporarily to measure width, then clear to avoid duplicate baseline rows
                    strandElement.innerHTML = baselineHtml;
                    const cell1Width = Math.max(strandElement.getBoundingClientRect?.().width || 0, strandElement.clientWidth || 0, 100);
                    strandElement.innerHTML = '';
                    strandElement.querySelectorAll('.qol-status-message').forEach((el) => el.remove());
                    strandElement.classList.remove('qol-term');
                    let inSide, outSide;
                    if (inCount > outCount) {
                        [inSide, outSide] = [strand.in, strand.out];
                    } else {
                        [inSide, outSide] = [strand.out, strand.in];
                    }
                    const [popIn, popOut] = await Promise.all([populateSideInfo(inSide), populateSideInfo(outSide)]);
                    const inElement = formatText(popIn);
                    const outElement = formatText(popOut);
                    const openingP = document.createTextNode(' (');
                    const closingP = document.createTextNode(')');
                    const arrowElement = document.createElement('span');
                    arrowElement.textContent = ' ➡ ';
                    
                    const wrappedElement = document.createElement('span');
                    wrappedElement.append(openingP, inElement, arrowElement, outElement, closingP);

                    const row = document.createElement('div');
                    row.classList.add('qol-term-row');
                    row.style.display = 'flex';
                    row.style.justifyContent = 'space-between';
                    row.dataset.qolPin = pin;
                    const cell1 = document.createElement('div');
                    cell1.classList.add('qol-term-cell', 'qol-term-cell1');
                    cell1.style.width = `${cell1Width + 5}px`;
                    cell1.innerHTML = baselineHtml;
                    const iconElement = cell1.querySelector('.jstree-icon');
                    if (iconElement && iconElement.style.backgroundImage.includes('features/fiber.svg')) {
                        iconElement.style.backgroundImage = `url("${determineIcon(inSide.type, outSide.type)}")`;
                    }
                    row.appendChild(cell1);
                    const cell2 = document.createElement('div');
                    cell2.classList.add('qol-term-cell', 'qol-term-cell2');
                    cell2.appendChild(wrappedElement);
                    row.appendChild(cell2);
                    strandElement.appendChild(row);
                    strandElement.classList.add('qol-term');
                    const dupCells = strandElement.querySelectorAll('.qol-term-cell2').length;
                    if (dupCells > 1) {
                        logger.debug(FEATURE_NAME, 'multiple term cells after inject', { segment, pin, dupCells, seq });
                    }
                }
            } catch (error) {
                logger.error(FEATURE_NAME, `Unable to show terminations for ${segment}`, error);
            }
        }
        
        function displayStatusMessage(segment, message, savedTimestamp = '') {
            // Only show status when the segment anchor is open
            if (!isSegmentExpanded(segment)) {
                return;
            }

            const liElement = document.getElementById(`out_${segment}`) || document.getElementById(`in_${segment}`) || document.getElementById(segment);
            if (!liElement) {
                // Tree/segment not in DOM yet; skip status update quietly
                return;
            }

            try {
                // Prefer the segment anchor; fall back to any anchor inside the li
                const anchor = findSegmentAnchor(segment) || liElement.querySelector('a');
                if (!anchor) {
                    return;
                }

                let statusElement = anchor.querySelector('.qol-status-message');

                if (!statusElement) {
                    statusElement = document.createElement('span');
                    statusElement.classList.add('qol-status-message');
                    statusElement.style.paddingLeft = '10px';
                    statusElement.style.color = iqgeoGreen;
                    statusElement.style.fontSize = '13px';
                    anchor.appendChild(statusElement);
                }

                // Remove existing clear button if any
                const existingClearBtn = anchor.querySelector('.qol-term-clear-btn');
                if (existingClearBtn) {
                    existingClearBtn.remove();
                }

                // Set the message to indicate the current status
                if (savedTimestamp) {
                    const savedDate = new Date(savedTimestamp);
                    statusElement.textContent = `(Terminations updated: ${savedDate.toLocaleString()})`;
                    
                    // Add clear button for debugging
                    const clearBtn = document.createElement('button');
                    clearBtn.textContent = 'Clear';
                    clearBtn.classList.add('qol-term-clear-btn');
                    clearBtn.style.marginLeft = '8px';
                    clearBtn.style.padding = '2px 6px';
                    clearBtn.style.fontSize = '11px';
                    clearBtn.style.cursor = 'pointer';
                    clearBtn.style.backgroundColor = '#c62828';
                    clearBtn.style.color = 'white';
                    clearBtn.style.border = 'none';
                    clearBtn.style.borderRadius = '3px';
                    clearBtn.title = 'Clear cached terminations for this segment';
                    
                    clearBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        clearSegmentTerminations(segment, liElement);
                    });
                    
                    anchor.appendChild(clearBtn);
                } else {
                    statusElement.textContent = message;
                }
            } catch (error) {
                logger.error(FEATURE_NAME, `Error updating status message for segment: ${segment}`, error);
            }
        }

        function clearSegmentTerminations(segment, liElement) {
            try {
                // Clear rendered terminations from DOM
                if (liElement) {
                    resetSegmentAnchors(liElement);
                }

                // Clear from in-memory batch state
                segmentBatchState.delete(segment);

                // Clear from localStorage
                const normalizedSegment = segment.replace(/out_|in_/g, '');
                const [segmentType, segmentId] = normalizedSegment.split('/');
                const cacheKey = segmentType;
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
                const anchor = findSegmentAnchor(segment);
                if (anchor) {
                    const statusElement = anchor.querySelector('.qol-status-message');
                    if (statusElement) {
                        statusElement.textContent = '(Cleared)';
                        statusElement.style.color = '#999';
                    }
                    const clearBtn = anchor.querySelector('.qol-term-clear-btn');
                    if (clearBtn) {
                        clearBtn.remove();
                    }
                }

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

        async function populateSideInfo(side) {
            if (side.type === 'cable') {
                const structureData = await getStructure(side);
                return { 
                    ...side, 
                    structureData: structureData,
                    endStructureData: structureData.end_structure
                };
            }
            // else if (side.feature.startsWith(FIBER_PATCH_PANEL) || side.feature.startsWith(FIBER_ONT)) {
            else if (side.type === PORT) {
                const equipmentData = await getFeatureInfo(side.feature);
                if (equipmentData.housingInfo) {
                    return {
                        ...side,
                        equipmentInfo: equipmentData,
                        housingInfo: equipmentData.housingInfo
                    }
                }
            }
            return side;
        }
        
        function formatText(side) {
            const desc = side.desc.replace(/#.*/g, '');
            const featureType = side.feature.split('/')[1];

            const formatters = { // todo: change formatter to use housing structure type instead of equipment
                ['building']: (side) => {
                    let buildingDescription = side.endStructureData?.cust_name ? side.endStructureData.cust_name || side.endStructureData.name : '';
                    if (side.type == PORT) {
                        return `${buildingDescription} - Panel ${side.feature.split('/')[1]}, Port ${side.pin}`;
                    } else {
                        buildingDescription = side.endStructureData.name;
                        return `${buildingDescription} - ${desc}, Strand ${side.pin}`;
                    }
                },
                ['fiber_patch_panel']: (side) => {
                    let housingDescription = side.housingInfo?.name ? side.housingInfo.name || side.housingInfo.description : '';
                    return `${housingDescription}${housingDescription ? ' -' : ''} Panel ${featureType}, Port ${side.pin}`;
                },
                ['fiber_splitter']: (side) => {
                    let deviceId = side.equipmentInfo ? side.equipmentInfo.device_id || side.title.replace(/^Splitter: /, '') : '';
                    return `${deviceId}, Port ${side.pin}`;
                },
                ['fiber_mst']: (side) => `MST ${featureType}, Port ${side.pin}`,
                ['fiber_ont']: (side) => {
                    let housingDescription = side.housingInfo ? side.housingInfo.cust_name || side.housingInfo.name || side.housingInfo.description : '';
                    return `${housingDescription}${housingDescription ? ' -' : ''} ONT ${featureType}, Port ${side.pin}`;
                },
                ['shelf']: (side) => {
                    let housingDescription = side.housingInfo ? side.housingInfo.description : '';
                    return `${housingDescription}${housingDescription ? ' -' : ''} Shelf ${featureType}, Port ${side.pin}`;
                },
                ['migration_structure']: (side) => {
                    let structureTitle = side.structureData ? side.structureData.end_structure_title.replace(/^Migration Structure:  /, '').replace(/Splice Closure/, 'Closure') : '';
                    return `MS: ${structureTitle}${structureTitle ? ' -' : ''} ${desc}, Strand ${side.pin}`;
                },
                ['manhole']: (side) => {
                    let strStructure = 'UUB: ';
                    let strTitle = '';
                    if (side.endStructureData) {
                        strStructure = side.endStructureData.type === 'Handhole' ? 'HH: ' : 'MH: ';
                        strTitle = side.structureData ? side.structureData.end_structure_title.replace(/UUB: /, '') : '';
                    }
                    return `${strStructure}${strTitle}${strTitle ? ' -' : ''} ${desc}, Strand ${side.pin}`;
                },
                ['mywcom_route_junction']: (side) => {
                    let structureTitle = side.structureData ? side.structureData.end_structure_title.replace(/Route /, '') : '';
                    return `${structureTitle}${structureTitle ? ' -' : 'Junction'} ${desc}, Strand ${side.pin}`;
                },
                default: (side) => `${desc}, Strand ${side.pin}`,
            };

            let displayText = side.desc;
            let hoverText = '';

            try {
                let featureType;
                if (side.type === PORT) {
                    featureType = side.feature.split('/')[0];
                    if (featureType === FIBER_ONT && side.housingInfo) {
                        hoverText = `${side.housingInfo.street_num} ${side.housingInfo.street}, ${side.housingInfo.city}`;
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
                    featureToSet = side == "in" ? side.structureData.in_structure : side.structureData.out_structure;
                }
                myw?.app?.setCurrentFeature(
                    await myw.app.database.getFeatureByUrn(featureToSet), 
                    { zoomTo: true, keepFeatureSet: true, edit: false, notify: true }
                );
            });
        
            return element;
        }

        // Cache for promises returned by getStructure
        const structureRequests = {};
        async function getStructure(side) {
            const structure = side.feature;
            const in_or_out = side.side;

            if (structureRequests[structure]) {
                return structureRequests[structure];
            }

            // If there's no ongoing request, start one and store it in the cache
            structureRequests[structure] = (async () => {
                const [structureType, structureId] = structure.split('/');
                let structureData;
                if (!forceRefresh) {
                    structureData = await loadFeatureInfo(`structure_${structureType}`, structureId);
                }

                if (!structureData) {
                    const design = getCurrentDesign();
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
                    const end_structure_data = await getFeatureInfo(end_structure);
                    structureData['end_structure'] = end_structure_data;

                    // Save to localStorage
                    await saveFeatureInfo(`structure_${structureType}`, structureId, structureData);
                }

                return structureData;
            })();

            // When the request is complete, remove it from the cache
            return structureRequests[structure].finally(() => {
                delete structureRequests[structure];
            });
        }
        
        // Cache for promises returned by getFeatureInfo
        const featureRequests = {};
        async function getFeatureInfo(feature) {
            // Check if there's an ongoing request for this feature
            if (featureRequests[feature]) {
                return featureRequests[feature];
            }
        
            // If there's no ongoing request, start one and store it in the cache
            featureRequests[feature] = (async () => {        
                const [featureType, featureId] = feature.split('/');
                let featureData;
                if (!forceRefresh) {
                    featureData = await loadFeatureInfo(featureType, featureId);
                }

                if (!featureData) {
                    // If data doesn't exist in localStorage, fetch it
                    const design = getCurrentDesign();
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
                    await saveFeatureInfo(featureType, featureId, featureData);
                }
            
                // If there is a second level feature, fetch it as well
                const rootHousing = featureData.root_housing;
                if (rootHousing && (rootHousing.startsWith('cabinet') || rootHousing.startsWith('building'))) {
                    const housingData = await getFeatureInfo(rootHousing);  // Recursion
                    return { ...featureData, housingInfo: housingData };
                }
            
                return featureData;
            })();

            // When the request is complete, remove it from the cache
            return featureRequests[feature].finally(() => {
                delete featureRequests[feature];
            });
        }

        async function loadFeatureInfo(featureType, featureId) {
            // Load the data for the specified featureType
            const item = localStorage.getItem(featureType);
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
                localStorage.setItem(featureType, JSON.stringify(existingData)); // Update featureType cache
                
                return null;
            }
            
            return existingData[featureId].data;  // Return the data for the specified featureId
        }

        async function saveFeatureInfo(featureType, featureId, newData) {
            try {
                // Load existing data or initialize an empty object
                let existingData = localStorage.getItem(featureType);
                existingData = existingData ? JSON.parse(existingData) : {};
            
                // Update the data for the specified featureId
                existingData[featureId] = {
                    saved: Date.now(),
                    data: newData,
                };
            
                localStorage.setItem(featureType, JSON.stringify(existingData));
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
            const merged = state.strands.length >= fiberCount ? state.strands : new Array(fiberCount);
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
            const data = await withInterceptPaused(() => fetchData(url, { timeoutMs: TERMINATION_TIMEOUT_MS }));
            return data;
        }

        // Cache for promises returned by getSegment
        const segmentRequests = {};
        async function getSegment({segment, cable, fiberCount, interceptedData}, forceRefreshParam = false) {
            // Don't fetch/render if feature is disabled
            if (!featureManager.isEnabled("Auto Terminations")) {
                return Promise.resolve({ saved: null, data: [] });
            }
            
            // Check if there's an ongoing request for this segment
            if (segmentRequests[segment]) {
                return segmentRequests[segment];
            }

            if (isSegmentExpanded(segment)) {
                displayStatusMessage(segment, "Updating Terminations...");
            } else {
                // Do not start work unless expanded
                return Promise.resolve({ saved: null, data: [] });
            }
            
            // If there's no ongoing request, start one and store it in the cache
            segmentRequests[segment] = (async () => {
                // Set whether to override local storage
                forceRefresh = forceRefreshParam;
                logger.log(FEATURE_NAME, `Getting segment: ${segment}, forceRefresh: ${forceRefresh}`);
                if (forceRefresh) {
                    segmentBatchState.delete(segment);
                }
                
                const [segmentType, segmentId] = segment.replace(/in|out/, '').split('/');
                let segmentData;
                let cachedSaved = null;
                let cached = null;

                if (!forceRefresh) {
                    const state = segmentBatchState.get(segment);
                    if (state && Array.isArray(state.strands) && state.strands.length > 0) {
                        segmentData = { saved: state.saved || Date.now(), data: state.strands.filter(Boolean) };
                    }
                    if (!segmentData) {
                        cached = await loadFeatureInfo(segmentType, segmentId);
                        if (cached) {
                            try {
                                const cacheRaw = JSON.parse(localStorage.getItem(segmentType) || "{}");
                                cachedSaved = cacheRaw?.[segmentId]?.saved || null;
                            } catch (e) {
                                /* ignore cache parse issues */
                            }
                            segmentData = { saved: cachedSaved, data: cached };
                            const cachedPins = Array.isArray(cached) ? cached.map((s) => parseInt(s.pin, 10)).filter(Number.isFinite) : [];
                            const inferredCount = Math.max(...cachedPins, 0);
                            segmentBatchState.set(segment, { strands: cached, saved: cachedSaved, fiberCount: inferredCount || fiberCount || 0 });
                        }
                    }
                }
                const design = getCurrentDesign();

                // Ensure fiberCount
                if (!fiberCount) {
                    const state = segmentBatchState.get(segment);
                    if (state?.fiberCount) {
                        fiberCount = state.fiberCount;
                    }
                }
                if (!fiberCount && segmentData?.data?.length) {
                    const pins = segmentData.data
                        .map((s) => parseInt(s.pin, 10))
                        .filter(Number.isFinite);
                    fiberCount = Math.max(...pins, fiberCount || 0);
                }

                if (!fiberCount && !interceptedData) {
                    if (cable) {
                        const fiberCountData = await fetchData(`${COMPANY_URL}/feature/${cable}?display_values=true&delta=${design}&application=mywcom&lang=en-US`);
                        fiberCount = fiberCountData.properties.fiber_count;
                    } else {
                        const segmentDataInfo = await fetchData(`${COMPANY_URL}/feature/${segment}?display_values=true&delta=${design}&application=mywcom&lang=en-US`);
                        cable = segmentDataInfo.properties.cable;
                        if (cable) {
                            const fiberCountData = await fetchData(`${COMPANY_URL}/feature/${cable}?display_values=true&delta=${design}&application=mywcom&lang=en-US`);
                            fiberCount = fiberCountData.properties.fiber_count;
                        }
                    }
                }

                // Determine missing pins from current state/cache
                const currentState = segmentBatchState.get(segment);
                const currentStrands = currentState?.strands || segmentData?.data || [];
                const knownPins = new Set(
                    (currentStrands || []).map((s) => parseInt(s?.pin, 10)).filter(Number.isFinite)
                );
                const missingPins = [];
                if (fiberCount) {
                    for (let pin = 1; pin <= fiberCount; pin++) {
                        if (!knownPins.has(pin)) {
                            missingPins.push(pin);
                        }
                    }
                }
                logger.debug(FEATURE_NAME, 'missingPins', segment, missingPins.length ? `${missingPins[0]}-${missingPins[missingPins.length - 1]} (count ${missingPins.length})` : 'none');

                // Show cached immediately
                if (currentStrands && currentStrands.length) {
                    const savedTs = segmentData?.saved || cachedSaved || Date.now();
                    mergeBatchStrands(segment, fiberCount || currentStrands.length, currentStrands, savedTs);
                    showTerminations(segment, currentStrands);
                    displayStatusMessage(segment, null, savedTs);
                }

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

                    // Recursive splitter: shrink only the failing range, not future batches
                    const fetchRange = async (startPin, endPin) => {
                        if (startPin > endPin) return;
                        try {
                            const batchData = await fetchSegmentBatch({ segment, startPin, endPin, design });
                            const batchStrands = normalizeStrands(batchData);
                            mergeBatchStrands(segment, fiberCount, batchStrands, Date.now());
                            showTerminations(segment, batchStrands);
                            logger.debug(FEATURE_NAME, `batch ${startPin}-${endPin} ok for ${segment} (seq ${renderSequence})`);
                        } catch (err) {
                            const size = endPin - startPin + 1;
                            // Suppress batch split warnings; only log single strand failures
                            if (size > 1) {
                                const mid = Math.floor((startPin + endPin) / 2);
                                await fetchRange(startPin, mid);
                                await fetchRange(mid + 1, endPin);
                            } else {
                                logger.warn(FEATURE_NAME, `strand ${startPin} failed for ${segment}`, err);
                            }
                        }
                    };

                    const ranges = buildRangesFromPins(missingPins, baseBatchSize);

                    // Process base ranges with limited concurrency
                    let idx = 0;
                    const worker = async () => {
                        while (idx < ranges.length) {
                            const { startPin, endPin } = ranges[idx++];
                            await fetchRange(startPin, endPin);
                        }
                    };
                    const workers = Array.from({ length: Math.min(TERMINATION_MAX_CONCURRENCY, ranges.length) }, () => worker());
                    await Promise.allSettled(workers);

                    const mergedState = segmentBatchState.get(segment);
                    newData = mergedState ? mergedState.strands.filter(Boolean) : [];
                } else {
                    newData = normalizeStrands(interceptedData);
                    mergeBatchStrands(segment, fiberCount || newData.length, newData, Date.now());
                }

                segmentData = {
                    saved: Date.now(),
                    data: newData
                };
    
                await saveFeatureInfo(segmentType, segmentId, newData); // 2025-11-17: Changed to save 'strands' instead of 'segmentData' to fix accidentally nesting in localStorage
        
                return segmentData;
            })().then(result => {
                displayStatusMessage(segment, null, result.saved);
                return result;
            });

            // When the request is complete, remove it from the cache
            return segmentRequests[segment].finally(() => {
                delete segmentRequests[segment];
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
                const anchor = findSegmentAnchor(segment);
                if (anchor && anchor.getAttribute('aria-expanded') === 'true') {
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
                const response = await fetch(url, timeout ? { signal: timeout.controller.signal } : undefined);
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
            if (cableTreePatched) return true;
            const treeViews = [
                window.myw?.app?.plugins?.cableTree?.structCableTreeView,
                window.myw?.app?.plugins?.cableTree?.routeTreeView
            ].filter(Boolean);
            if (!treeViews.length) return false;

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

            treeViews.forEach((tv, idx) => patchOne(tv, idx === 0 ? 'struct' : 'route'));

            cableTreePatched = true;
            return true;
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

        function setupMutationObserver() {
            if (termMutationObserver) {
                return;
            }

            // Fallback: watch for late-mounted tree and bind listeners
            termMutationObserver = new MutationObserver(() => {
                setupTreeListeners();
            });
    
            termMutationObserver.observe(document.body, { childList: true, subtree: true });
        }

        function stopObserving() {
            if (termMutationObserver) {
                termMutationObserver.disconnect();
                termMutationObserver = null;
            }
            // Clean up all termination UI when stopping
            cleanupTerminationUI();
        }
        
        function cleanupTerminationUI() {
            // Remove all injected termination elements from the tree
            const tree = document.querySelector('#related-equipment-tree-container');
            if (tree) {
                tree.querySelectorAll('.qol-term-row, .qol-status-message').forEach((el) => el.remove());
                tree.querySelectorAll('a.jstree-anchor.qol-term').forEach((anchor) => {
                    anchor.classList.remove('qol-term');
                    if (anchor.dataset.qolOriginalHtml) {
                        anchor.innerHTML = anchor.dataset.qolOriginalHtml;
                    }
                });
            }
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
        console.log("Running - Alt Add Object Menu")

        // CSS styles for the menu
        var styles = `
            .dialog-container {
                width: 60% !important;
                left: 50% !important;
                transform: translate(-50%, 30%) !important;
            }

            .menu-container {
                display: flex !important;
                // overflow-y: scroll !important;
                height: 500px !important;
            }

            .menu-container ul {
                list-style-type: none !important;
            }

            .menu-column {
                flex: 1 !important;
                // padding: 0px 5px !important;
                // margin: 0px 5px !important;
            }

            .menu-section {
                font-weight: bold !important;
                margin-bottom: 10px !important;
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
                margin: 0px 0px 5px 0px !important;
            }
        `;

        // Create a <style> element and insert the CSS styles
        var styleElement = document.createElement('style');
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);

        // Function to convert the menu into a horizontal layout
        async function convertMenu() {
            try {
                // Find "Add Object" menu element
                // var dialog
                // var dialogs = document.querySelectorAll('[id*="ui-id-"]');
                // if (dialogs) {
                //     dialogs.forEach((e) => {
                //         if (e.textContent === "Add Object") {
                //             dialog = e;
                //             return;
                //         }
                //     });
                // } else {
                //     throw new Error('Menu dialog not found');
                // }

                var dialog = document.querySelector('.createFeature-dialog');
                if (!dialog) { 
                    // Trigger opening menu for the first time to load contents
                    // await myw?.app?.plugins?.createFeature?.showDialog();
                    dialog = document.querySelector('.createFeature-dialog');
                }
                if (!dialog) return;
                
                var dialogParent = dialog.parentElement;
                dialogParent.classList.add('dialog-container');

                // Create the new menu container
                var menuContainer = document.createElement('div');
                menuContainer.classList.add('menu-container');
                var fragment = document.createDocumentFragment();

                var sections = dialog.querySelectorAll('.comms-feature-divider');
                var sectionIndex = 0;

                while (sectionIndex < sections.length) {
                    var section = sections[sectionIndex];
                    var column = document.createElement('div');
                    column.classList.add('menu-column');

                    var sectionTitle = section.querySelector('.comms-divider-label');
                    var menuItems = [];

                    var nextSibling = section.nextElementSibling;
                    while (nextSibling && !nextSibling.classList.contains('comms-feature-divider')) {
                        if (nextSibling.nodeName === 'LI') {
                            menuItems.push(nextSibling.cloneNode(true));
                        } else if (nextSibling.nodeName === 'UL') {
                            var listItems = nextSibling.querySelectorAll('li');
                            listItems.forEach(function(listItem) {
                                menuItems.push(listItem.cloneNode(true));
                            });
                        }
                        nextSibling = nextSibling.nextElementSibling;
                    }

                    if (sectionTitle) { // removed length check (menuItems.length > 0) to show blank sections
                        var ul = document.createElement('ul');
                        ul.classList.add('createFeature-menu', 'menu-items');

                        menuItems.forEach(function (menuItem) {
                            ul.appendChild(menuItem);
                        });

                        column.innerHTML = `
                        <div class="menu-section">${sectionTitle.textContent}</div>
                        ${ul.outerHTML}
                    `;
                        menuContainer.appendChild(column);
                    }

                    sectionIndex++;
                }

                fragment.appendChild(menuContainer);

                // Only update the DOM once all elements are added to the document fragment
                dialog.innerHTML = '';
                dialog.appendChild(menuContainer);
            } catch (error) {
                console.error('Failed to convert menu:', error);
            }
        }

        return {
            run: function() {
                // Wait for the click event on the 'Add Object' menu element and convert the menu
                // document.querySelector('#myWorldApp').addEventListener('click', function(event) {
                //     if (event.target.matches('#a-createFeature')) {
                //         convertMenu();
                //     }
                // });
                runWhenReady("#a-createFeature", () => {
                    document.querySelector('#a-createFeature').addEventListener('click', () => {
                        convertMenu();
                    });
                });
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


    /*

    // April Fools 2025

    // Prank 1: Gradual Text Color Shift
    function gradualTextColorShift() {
        const targetElements = document.querySelectorAll('p, span, div'); // Adjust selectors as needed
        const originalColors = new Map();

        // Filter out elements that are not visible
        const visibleElements = Array.from(targetElements).filter(el => {
            return el.style.display !== 'none' && window.getComputedStyle(el).display !== 'none';
        });

        // Store original text colors
        visibleElements.forEach(el => {
            originalColors.set(el, el.style.color || window.getComputedStyle(el).color);
        });

        let hue = 0;
        const intervalId = setInterval(() => {
            hue = (hue + 1) % 360;
            visibleElements.forEach(el => {
                el.style.color = `hsl(${hue}, 50%, 50%)`;
            });
        }, 100); // Change color every 100ms

        // Stop the color shift after 10 seconds and revert to original colors
        setTimeout(() => {
            clearInterval(intervalId);
            visibleElements.forEach(el => {
                el.style.color = originalColors.get(el);
            });
        }, 10000); // 10000ms = 10 seconds


        // Repeat after 30 seconds if still enabled
        if (isToggleButtonOn("Funny Day 🤪")) {
            setTimeout(() => {
                gradualTextColorShift();
            }, 30000);
        }
    }


    // Prank 2: Delayed Image Swap
    function delayedImageSwap() {
        const swapDelay = 30000; // 30 seconds
        const originalImages = [];
        const funnyImages = [
            'https://images.pexels.com/photos/6898857/pexels-photo-6898857.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
            'https://images.pexels.com/photos/321552/pexels-photo-321552.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
            'https://images.pexels.com/photos/2233442/pexels-photo-2233442.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'
        ];

        document.querySelectorAll('img').forEach((img, index) => {
            originalImages[index] = img.src;
        });

        setTimeout(() => {
            document.querySelectorAll('img').forEach((img, index) => {
                const randomIndex = Math.floor(Math.random() * funnyImages.length);
                img.src = funnyImages[randomIndex];
                setTimeout(() => {
                    img.src = originalImages[index];
                }, 10000); // Revert after 10 seconds
            });
        }, swapDelay);
    }

    // Initialize April Fools' "pranks" if enabled in QOL menu
    runWhenReady("#map_canvas", () => {
        if (isToggleButtonOn("Funny Day 🤪")) {
            gradualTextColorShift();
            // delayedImageSwap();
        }
    });
    */



    
// Error Monitor
    const errorMonitorFeature = (() => {
        let started = false;
        let cleanupFns = [];
        let uiObserver = null;
        let footerObserver = null;
        let wrapper = null;
        let btn = null;
        let panel = null;
        let panelOpen = false;
        let currentFilter = 'all';
        const logs = [];
        const IGNORE_URL_PATTERNS = [
            /googleapis\.com\/maps\/api\/mapsjs\//,
            /optical_node_closure_spec/
        ];
        const IGNORE_404_PATTERNS = [
            /\/modules\/comms\/structure\/manhole\// // expected 404 when structure exists only in delta
        ];
        const LEGACY_BUTTON_POS_KEY = 'qol-errmon-btn-pos'; // Implemented 2026-01-13. To be removed at a later date

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
        }

        function start() {
            if (started) return;
            started = true;
            runWhenReady('#map_canvas', () => {
                cleanupFns.push(teardownUi);

                ['error'].forEach((level) => {
                    const orig = console[level];
                    console[level] = function (...args) {
                        addLog({ type: 'console', level, message: args.map(String).join(' ') });
                        orig.apply(console, args);
                    };
                    cleanupFns.push(() => { console[level] = orig; });
                });

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

                const origFetch = window.fetch;
                window.fetch = function (...args) {
                    return origFetch.apply(this, args).then((res) => {
                        const url = res?.url || args[0] || '';
                        if (!res.ok) {
                            if (!(res.status === 404 && IGNORE_404_PATTERNS.some((p) => p.test(url)))) {
                                addLog({ type: 'network', method: 'fetch', status: res.status, url, message: `${res.status} ${res.statusText}` });
                            }
                        }
                        return res;
                    }).catch((err) => {
                        addLog({ type: 'network', method: 'fetch', status: 'ERR', url: args[0] || '', message: err.toString() });
                        throw err;
                    });
                };
                cleanupFns.push(() => { window.fetch = origFetch; });

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
                    if (!footerRight) return false;
                    
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
                    uiObserver = new MutationObserver((mutations, obs) => {
                        if (injectUi()) {
                            obs.disconnect();
                        }
                    });
                    uiObserver.observe(document.documentElement, { childList: true, subtree: true });
                }
            });
        }

        function stop() {
            if (!started) return;
            started = false;
            while (cleanupFns.length) {
                const fn = cleanupFns.pop();
                try { fn(); } catch (e) { console.warn('[userscript] Error monitor cleanup failed', e); }
            }
        }

        return { start, stop };
    })();

    // Plugin Overrides: displayManager, locManager
    const pluginOverridesFeature = (() => {
        'use strict';

        let started = false;

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

        let addPinConnectionPatchRetryId = null;

        async function patchAddPinConnectionInfo() {
            // Try with a reasonable initial timeout
            let treeView;
            try {
                treeView = await waitFor(getEquipTreeView, { timeoutMs: 30000, intervalMs: 1000 });
            } catch (e) {
                // If initial attempt fails, set up periodic retry
                if (!addPinConnectionPatchRetryId) {
                    console.info('[userscript] EquipTreeView not found for _addPinConnectionInfo patch, will retry periodically...');
                    addPinConnectionPatchRetryId = setInterval(() => {
                        const tv = getEquipTreeView();
                        if (tv && !tv.__addPinConnectionInfoPatched) {
                            clearInterval(addPinConnectionPatchRetryId);
                            addPinConnectionPatchRetryId = null;
                            patchAddPinConnectionInfo(); // Retry the patch
                        }
                    }, 5000); // Check every 5 seconds
                }
                return;
            }

            if (!treeView || treeView.__addPinConnectionInfoPatched) return;

            const original_addPinConnectionInfo = treeView._addPinConnectionInfo;
            if (typeof original_addPinConnectionInfo !== 'function') {
                console.warn('[userscript] equipmentTree.treeView._addPinConnectionInfo not a function');
                return;
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
            console.info('[userscript] Patched equipmentTree.treeView._addPinConnectionInfo');
        }


        async function patchDisplayManager() {
            const dm = await waitFor(getDisplayManager);
            if (!dm || dm.__connLabelPatchedSimple) return;

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

        async function patchLocManager() {
            const lm = await waitFor(getLocManager);
            if (!lm || lm.__getFeatureLOCDetailsAtPatched) return;

            // Keep async signature so callers using await remain compatible
            lm.getFeatureLOCDetailsAt = async function (struct, features, segments = true, include_proposed = false) {
                return {};
            };

            Object.defineProperty(lm, '__getFeatureLOCDetailsAtPatched', { value: true });
            console.info('[userscript] Patched locManager.getFeatureLOCDetailsAt');
        }

        let saveStatePatchRetryId = null;

        async function patchEquipmentTreeSaveState() {
            // Try with a reasonable initial timeout
            let treeView;
            try {
                treeView = await waitFor(getEquipTreeView, { timeoutMs: 30000, intervalMs: 1000 });
            } catch (e) {
                // If initial attempt fails, set up periodic retry
                if (!saveStatePatchRetryId) {
                    console.info('[userscript] EquipTreeView not found yet, will retry periodically...');
                    saveStatePatchRetryId = setInterval(() => {
                        const tv = getEquipTreeView();
                        if (tv && !tv.__saveStatePatched) {
                            clearInterval(saveStatePatchRetryId);
                            saveStatePatchRetryId = null;
                            patchEquipmentTreeSaveState(); // Retry the patch
                        }
                    }, 5000); // Check every 5 seconds
                }
                return;
            }

            if (!treeView || treeView.__saveStatePatched) return;

            // Seed incremental open-set from any prior saved state
            treeView.owner = treeView.owner || {};
            treeView.owner.saved_state = treeView.owner.saved_state || {};
            const stateKey = treeView?.rootUrn;
            const prior = (treeView.owner.saved_state[stateKey]?.open) || [];
            treeView._openSet = new Set(prior);

            // Guard flag: pause saves during loading/restore bursts
            treeView._suspendSaveState = false;

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

            // Replace saveState: O(1) add/remove; skip while loading
            treeView.saveState = function (nodeData) {
                if (!this.owner.saved_state || this._suspendSaveState) return;
                if (!nodeData || !nodeData.instance) return;

                const inst = nodeData.instance;
                const node = inst.get_node(nodeData.node || nodeData);
                if (!node) return;

                if (isNodeOrParentsLoading(inst, node)) return;

                if (node.state && node.state.opened) {
                    this._openSet.add(node.id);
                } else {
                    this._openSet.delete(node.id);
                }
                this.owner.saved_state[this.rootUrn] = { open: Array.from(this._openSet) };
            };

            // Bind guards when the container exists; re-bind on SPA remounts
            function bindGuardsIfReady() {
                try {
                    const equipTreeContainer = treeView && treeView.container ? $(treeView.container) : null;
                    if (!equipTreeContainer || !equipTreeContainer.length) return false;
                    if (equipTreeContainer.data('__saveStateGuardBound')) return true;

                    let resumeTimer;
                    equipTreeContainer
                        .off('.saveStateGuard')
                        .on('loading.jstree.saveStateGuard', function () {
                            treeView._suspendSaveState = true;
                            clearTimeout(resumeTimer);
                        })
                        .on('load_node.jstree.saveStateGuard after_open.jstree.saveStateGuard', function () {
                            clearTimeout(resumeTimer);
                            resumeTimer = setTimeout(() => { treeView._suspendSaveState = false; }, 200);
                        });

                    equipTreeContainer.data('__saveStateGuardBound', true);
                    console.info('[userscript] Bound saveState guards on equipmentTree container');
                    return true;
                } catch {
                    return false;
                }
            }

            // Try now, then poll lightly to catch future remounts
            bindGuardsIfReady();
            if (treeView.__saveStateGuardPollId) clearInterval(treeView.__saveStateGuardPollId);
            treeView.__saveStateGuardPollId = setInterval(bindGuardsIfReady, 1000);

            Object.defineProperty(treeView, '__saveStatePatched', { value: true });
            console.info('[userscript] Patched equipmentTree.treeView.saveState');
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

        async function patchStructureManager() {
            const sm = await waitFor(getStructureManager);
            if (!sm || sm.__structContentPatched) return;

            const original = sm.structContent;
            if (typeof original !== 'function') {
                console.warn('[userscript] structureManager.structContent not a function');
                return;
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

        async function applyPatches() {
            try { 
                await Promise.all([
                    patchDisplayManager(), 
                    patchLocManager(), 
                    patchEquipmentTreeSaveState(),
                    patchStructureManager(),
                    patchAddPinConnectionInfo()
                ]);
            } catch (e) { 
                console.error('[userscript] Patching error:', e); 
            }
        }

        function start() {
            if (started) return;
            started = true;
            applyPatches();
        }

        function stop() {
            if (!started) return;
            started = false;
            
            // Clean up retry intervals
            if (saveStatePatchRetryId) {
                clearInterval(saveStatePatchRetryId);
                saveStatePatchRetryId = null;
            }
            
            if (addPinConnectionPatchRetryId) {
                clearInterval(addPinConnectionPatchRetryId);
                addPinConnectionPatchRetryId = null;
            }
            
            // Clean up tree view polling
            const treeView = getEquipTreeView();
            if (treeView && treeView.__saveStateGuardPollId) {
                clearInterval(treeView.__saveStateGuardPollId);
                treeView.__saveStateGuardPollId = null;
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

    // Panel Width Persistence: Save and restore left panel width across page reloads
    const panelWidthPersistence = (() => {
        let started = false;
        let resizeObserver = null;
        let innerCenterObserver = null;
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

        function restoreWidth() {
            const westPane = document.querySelector('div#left-content');
            const resizer = document.querySelector('.ui-layout-resizer-west');
            const outerCenter = document.querySelector('#layout-map-view');
            const innerCenter = document.querySelector('div#right-content');
            const container = document.querySelector('.ui-layout-container');
            const savedWidth = getSavedWidth();
            
            // Check if all required elements are present
            if (!westPane || !resizer || !outerCenter || !innerCenter || !container || !savedWidth) {
                return false;
            }
            
            try {
                // Set west pane width
                westPane.style.width = savedWidth + 'px';
                
                // Update resizer position
                resizer.style.left = savedWidth + 'px';
                
                // Update outer center pane
                const resizerWidth = resizer.offsetWidth || 3;
                const centerLeft = savedWidth + resizerWidth;
                outerCenter.style.left = centerLeft + 'px';
                outerCenter.style.width = (container.offsetWidth - centerLeft) + 'px';
                
                // Remove width and setup guard for inner center
                innerCenter.style.width = '';
                setupInnerCenterWidthGuard(innerCenter);
                
                // Trigger resize
                if (window.jQuery) {
                    window.jQuery(window).trigger('resize');
                }
                
                return true;
            } catch (e) {
                console.error('[userscript] Panel width restore error:', e);
                return false;
            }
        }

        function attemptRestoreWithRetry() {
            const savedWidth = getSavedWidth();
            if (!savedWidth) return;
            
            let attempts = 0;
            const maxAttempts = 20; // Try for up to 10 seconds
            const retryInterval = 500;
            
            const tryRestore = () => {
                attempts++;
                
                // Try to restore
                const success = restoreWidth();
                
                if (success) {
                    // Verify it actually applied
                    const westPane = document.querySelector('div#left-content');
                    const actualWidth = westPane ? parseInt(westPane.style.width, 10) : 0;
                    
                    if (actualWidth === savedWidth) {
                        // Success! Stop retrying
                        return;
                    }
                }
                
                // Retry if we haven't hit max attempts
                if (attempts < maxAttempts) {
                    setTimeout(tryRestore, retryInterval);
                }
            };
            
            // Start trying after a short initial delay
            setTimeout(tryRestore, 1000);
        }

        function setupInnerCenterWidthGuard(innerCenter) {
            if (!innerCenter) return;
            
            if (innerCenterObserver) {
                innerCenterObserver.disconnect();
            }
            
            // Continuously remove width style if app tries to set it
            innerCenterObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.attributeName === 'style' && innerCenter.style.width) {
                        innerCenter.style.width = '';
                    }
                });
            });
            
            innerCenterObserver.observe(innerCenter, {
                attributes: true,
                attributeFilter: ['style']
            });
        }

        function setupResizeMonitoring() {
            const westPane = document.querySelector('div#left-content');
            if (!westPane) return false;

            // Monitor west pane for resize and save width
            resizeObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.attributeName === 'style') {
                        const currentWidth = westPane.style.width;
                        if (currentWidth) {
                            clearTimeout(saveTimeout);
                            saveTimeout = setTimeout(() => {
                                saveWidth(currentWidth);
                            }, SAVE_DELAY_MS);
                        }
                    }
                });
            });

            resizeObserver.observe(westPane, {
                attributes: true,
                attributeFilter: ['style']
            });

            // Setup inner center width guard
            const innerCenter = document.querySelector('div#right-content');
            if (innerCenter) {
                setupInnerCenterWidthGuard(innerCenter);
            }

            return true;
        }

        function start() {
            if (started) return;
            started = true;

            runWhenReady('div#left-content', () => {
                // Use retry logic for reliable restoration
                attemptRestoreWithRetry();
                
                // Setup monitoring
                setupResizeMonitoring();
            });
        }

        function stop() {
            if (!started) return;
            started = false;

            if (resizeObserver) {
                resizeObserver.disconnect();
                resizeObserver = null;
            }

            if (innerCenterObserver) {
                innerCenterObserver.disconnect();
                innerCenterObserver = null;
            }

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
            featureManager.register(autoLoginFeature.label, { start: handleAutoLogin }, { defaultState: autoLoginFeature.defaultState });
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
            "Error Monitor": { start: () => errorMonitorFeature.start(), stop: () => errorMonitorFeature.stop() },
            "Plugin Patches": { start: () => pluginOverridesFeature.start(), stop: () => pluginOverridesFeature.stop() }
        };
        
        featureManager.register(feature.label, handlers[feature.label] || {}, { defaultState: feature.defaultState });
    });
    featureManager.init();

    featureHorizontalMenu.run();
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
