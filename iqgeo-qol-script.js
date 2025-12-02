
// credit: https://github.com/Tampermonkey/tampermonkey/issues/1279#issuecomment-875386821
// Convenience function to execute your callback only after an element matching readySelector has been added to the page.
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
                console.warn("Giving up after 34 attempts. Could not find: " + readySelector);
            } else {
                setTimeout(tryNow, 250 * Math.pow(1.1, numAttempts));
            }
        }
    };
    tryNow();
}

(function () {
    console.log("IQGeo QOL Userscript Loaded");

    // Global Colors
    const iqgeoGreen = "#3CA22D";

    // credit: https://github.com/Tampermonkey/tampermonkey/issues/1279#issuecomment-875386821
    // Convenience function to execute your callback only after an element matching readySelector has been added to the page.
    // Example: runWhenReady('.search-result', augmentSearchResults);
    // Gives up after 1 minute.
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

    //
    //
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
            top: 50px; /* Adjust the top position as needed */
            left: calc(100% - 200px); /* Adjust the distance from the left edge */
            transform: translateX(-100%); /* Shift the menu to the left */
            background-color: #f1f1f1;
            border: 1px solid #ccc;
            padding: 10px;
            z-index: 9999; /* Ensure the menu appears above other elements */
        }
        
        .floating-menu button {
            display: block;
            margin-bottom: 5px;
            border: none; /* Remove the button border */
            padding: 5px 10px; /* Add padding for better visual appearance */
            cursor: pointer; /* Change cursor on hover */
            color: #333; /* Change button text color */
        }

        .floating-menu button.on {
            background-color: green; /* Set background color to indicate 'On' state */
            color: #fff; /* Change text color to white for better readability */
        }

        .floating-menu button.off {
            background-color: red; /* Set background color to indicate 'Off' state */
            color: #fff; /* Change text color to white for better readability */
        }
        `;

        // Append the style element to the document head
        document.head.appendChild(style);

        // Find the header content element
        var headerContent = document.getElementById("header-content");

        // Create the button element
        var button = document.createElement("button");
        button.innerHTML = "QOL Menu";
        button.classList.add("qol-menu");

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

        // Create the toggle buttons and status indicators
        var toggleButton1 = createToggleButton("Auto Login");
        var toggleButton2 = createToggleButton("Splice Changes");
        // var toggleButton3 = createToggleButton("Funny Day 🤪"); // TODO: Allow buttons to be added dynamically from their respective modules

        // Add the toggle buttons to the menu
        menu.appendChild(toggleButton1);
        menu.appendChild(toggleButton2);
        // menu.appendChild(toggleButton3);

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

        // Function to create a toggle button
        function createToggleButton(label) {
            var button = document.createElement("button");
            button.innerHTML = label;
            button.classList.add("on"); // Set the initial state to 'On'

            // Add event listener to toggle the button state
            button.addEventListener("click", function () {
                toggleState(label);
            });

            return button;
        }

        // Set the initial state of the toggle buttons based on the stored toggle states
        setToggleStates();

        // Function to set the toggle state
        function setToggleState(label, state) {
            // Update the state of the toggle button based on the provided label and state
            var toggleButton = getToggleButtonByLabel(label);
            if (toggleButton) {
                toggleButton.classList.remove("on", "off");
                toggleButton.classList.add(state);
            }

            // Store the current toggle state in localStorage
            localStorage.setItem(`qol-menu_${label}`, state);
        }

        // Function to set the states of all toggle buttons
        function setToggleStates() {
            var toggleButtons = document.querySelectorAll(
                ".floating-menu button"
            );
            toggleButtons.forEach(function (toggleButton) {
                var label = toggleButton.innerHTML;
                var state = localStorage.getItem(`qol-menu_${label}`) || "on"; // Retrieve from localStorage or default to "on"
                toggleButton.classList.remove("on", "off");
                toggleButton.classList.add(state);
                localStorage.setItem(`qol-menu_${label}`, state); // Store the current toggle state in localStorage
            });
        }

        // Function to toggle the state of a toggle button
        function toggleState(label) {
            var toggleButton = getToggleButtonByLabel(label);
            if (toggleButton) {
                if (toggleButton.classList.contains("on")) {
                    setToggleState(label, "off");
                } else {
                    setToggleState(label, "on");
                }
            }
        }

        // Function to get the toggle button by label
        function getToggleButtonByLabel(label) {
            var toggleButtons = document.querySelectorAll(
                ".floating-menu button"
            );
            for (var i = 0; i < toggleButtons.length; i++) {
                if (toggleButtons[i].innerHTML === label) {
                    return toggleButtons[i];
                }
            }
            return null; // Button not found
        }
    }
    runWhenReady("#map_canvas", createMenu);

    function isToggleButtonOn(label) {
        // Retrieve the toggle buttons
        var toggleButtons = document.querySelectorAll(".floating-menu button");

        // Find the specific toggle button by label value
        var toggleButton = Array.from(toggleButtons).find(function (button) {
            return button.innerHTML === label;
        });

        // Check the status of the toggle button
        if (toggleButton.classList.contains("on")) {
            // The toggle button is in the "On" state
            return true;
        }

        // The toggle button is in the "Off" state or not found
        return false;
    }

    // What: auto login
    // Why:  stupid question
    if (window.location.href.indexOf("/login") != -1) {
        if (isToggleButtonOn("Auto Login")) {
            console.log("Login page found. Redirecting..");
            window.location.href = window.location.href.replace(
                "/login",
                "/auth/sso/myw_oidc_auth_engine"
            ); // using replace maintains sub domains
        }
    }

    // What: remove ability to expand Slack in 'Connect Cables' dialog
    // Why:  to avoid unintentional splice connection
    // $("#myWorldApp").on("click", $("a[aria-expanded='true']").siblings(".jstree-ocl"),
    //     function() {
    //         $("a:contains('Slack')").siblings(".jstree-ocl").remove();
    //     }
    // );

    // Intercept XHR requests (dynamic content workaround)
    const oldXHR = window.XMLHttpRequest.prototype.open;
    function createXhrListener(url) {
        return function () {
            // Continue only if request is complete
            if (this.readyState !== 4) {
                return;
            }
            let match = null;

            try {
                // Check URL for manhole (UUB) structure
                match = this.responseURL.match(/\/feature\/manhole\/(\d+)/);
                if (match) {
                    // const manholeId = match[1];
                    // console.log(`UUB ${manholeId} selected`);
                    featurePendingSpliceChanges.processManholeData(this.responseURL);
                    return;
                }

                // Check URL for route contents
                const regexRouteContents = /\/modules\/comms\/route\/.*\/(\d+)\/contents/;
                match = this.responseURL.match(regexRouteContents);
                if (match) {
                    const routetId = match[1];
                    // console.log(`Route ${routetId} selected`);
                    try {
                        const data = JSON.parse(this.responseText);
                        if (data) {
                            featureBetterTerminations.getRouteSegments(data);
                        }   
                    } catch (error) {
                        throw console.error(error);
                    }
                    return;
                }

                // Check URL for segment terminations (user clicked to run manually)
                const regexSegmentTerms = /\/modules\/comms\/fiber\/paths\/(mywcom_fiber_segment\/\d+)/;
                match = this.responseURL.match(regexSegmentTerms);
                if (match) {
                    const segment = match[1];
                    const data = JSON.parse(this.responseText);
                    featureBetterTerminations.getSegment({segment: segment, interceptedData: data}, true);
                    return;
                }
            } catch (error) {
                throw console.error(error);
            }
        };
    }

    window.XMLHttpRequest.prototype.open = function (method, url, async) {
        if (this.xhrListener) {
            this.removeEventListener("readystatechange", this.xhrListener);
        }
        oldXHR.apply(this, arguments);
        this.xhrListener = createXhrListener(url);
        this.addEventListener("readystatechange", this.xhrListener);
    };

    // Feature - Pending Splice Changes
    // What: indicate splice changes of current design
    // Why:  proposed changes of an open design appear the same as published changes which can cause confusion
    // How:  XHR listener to intercept splice details when a structure containing splices is selected
    //       Mutation Observer to add pending splice count to cable groups header
    //       Click event listener to update style of pending splices when splice list is toggled
    let jsonData = {};
    let changedFeatures = [];
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
                // Note: Removing delta value from URL allows us to obtain changes of currently open design
                const newURL = url.replace(/&?delta=.*/, "");

                // const response = await fetch(`/modules/comms/structure/manhole/${manholeId}/contents?delta=&include_proposed=true&application=mywcom&lang=en-US`, {
                const response = await fetch(newURL);
                const data = await response.json();
                jsonData = data;
    
                const currentDeltaEl = document.querySelector("div.delta-owner-map-watermark-text");
                if (!currentDeltaEl) {
                    return;
                }
    
                const currentDelta = currentDeltaEl.textContent.split(": ")[1];
                const changedFeatures = data.conns.features.filter((feature) => {
                    const featureDelta = feature.myw?.delta?.split("/")[1];
                    return feature.myw && featureDelta === currentDelta;
                });
    
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

    // todo: use mutation observer instead
    $("#myWorldApp").on("click", 'div[id="related-equipment-tree-container"] i[class="jstree-icon jstree-ocl"]', function () {
        if (!isToggleButtonOn("Splice Changes")) {
            return;
        }

        // Fix alignment issue created by adding border to white color symbol
        $("div[class='fiberColorSymbol']:contains(WT)").css("width", "11px");
        $("div[class='fiberColorSymbol']:contains(WT)").css("padding", "0 3px");

        if (!Array.isArray(changedFeatures) || !changedFeatures.length) {
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

            splices.forEach((splice) => {
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
                        splice.style.color = "#20b94b";

                        // Add element showing the design name
                        splice.insertAdjacentHTML(
                            "beforeend",
                            `<span class="design-link" style="color: #20b94b;"> [Design: ${currentDelta}] </span>`
                        );

                        // Mark element so it's only processed once
                        splice.dataset.qol = true;
                    }
                }
            });
        });
    }
    );

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
        };
    })();

    // Feature - Better Terminations (local storage caching, hover details appended to strand list)
    var featureBetterTerminations = (function() {
        console.log("Running - Auto Terminations")

        const COMPANY_URL = `https://${window.location.hostname}`;
        const PORT = 'port';
        const FIBER_PATCH_PANEL = 'fiber_patch_panel';
        const FIBER_ONT = 'fiber_ont';
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

        // Cleanup stale cache data
        Object.entries(localStorage).forEach(([k, v]) => {
            if (k.includes("state")) return;
            if (v.includes("saved") && v.includes("data")) {
                // console.log(`${k} length before: ${Object.keys(JSON.parse(localStorage[k])).length}`);
                purgeFeatureCache(k, 5);
                // console.log(`${k} length after: ${Object.keys(JSON.parse(localStorage[k])).length}`);
            }
        });

        function showTerminations(segment, strands, savedTimestamp) {
            console.log('showTerminations:', segment);

            try { // todo: improve try catch to not blanket cover entire function

                if (!Array.isArray(strands)) {
                    console.error("Invalid data: strands is not an array");
                    console.error(strands);
                    return;
                }

                const liElement = document.getElementById(`out_${segment}`) || document.getElementById(`in_${segment}`) || document.getElementById(segment);
                if (!liElement) {
                    console.error('Segment DOM element not found for:', segment);
                    return;
                }
                const strandElements = liElement.querySelectorAll('a');
                if (!strandElements) {
                    console.error('Strand DOM elements not found for:', segment);
                    return;
                }

                // Determine which side should be the in and out (more consistent list when panels are lined up on the left side)
                let inCount = 0, outCount = 0;
                let maxCell1Width = 0;
                strands.forEach((strand, index) => {
                    if (strand.in.feature.startsWith(FIBER_PATCH_PANEL)) {
                        inCount++;
                    }
                    if (strand.out.feature.startsWith(FIBER_PATCH_PANEL)) {
                        outCount++;
                    }

                    // Calculate strandElements max width value
                    const strandElement = strandElements[index + 1]; // strand elements start index 1
                    const cell1Width = strandElement.clientWidth || 100; // 100 is approx. width of unspliced 2-digit strand
                    if (cell1Width > maxCell1Width) {
                        maxCell1Width = cell1Width;
                    }
                });

                displayStatusMessage(segment, 'Processing...');
                strands.forEach(async (strand, index) => {
                    // displayStatusMessage(segment, `Processing... Strand ${index}`);

                    const strandElement = strandElements[index + 1]; // Get the corresponding strand element, starting from the second element
                    // if (strandElement.classList.contains('qol-term')) {
                    //     console.log('test?');
                    //     return;
                    // }
            
                    let inSide, outSide;
                    if (inCount > outCount) {
                        [inSide, outSide] = [strand.in, strand.out];
                    } else {
                        [inSide, outSide] = [strand.out, strand.in];
                    }

                    // Only show terminations with ports
                    // if (!inSide.type.startsWith(PORT) || !outSide.type.startsWith(PORT)) {
                        // todo: when termination is a segment, use getSegment to get in_structure and out_structure.
                        // check in_structure and out_structure to determine which is the most likely termination point

                        // response.myw.title for structure name: ${COMPANY_URL}/feature/${structure}?display_values=true&include_lobs=true&include_geo_geometry=true&svars=%7B%22activeDelta%22%3A%22%22%7D&delta=&application=mywcom&lang=en-US
                        // response.cables.count for comparison criteria? : ${COMPANY_URL}/modules/comms/structure/${structure}/contents?delta=&include_proposed=true&application=mywcom&lang=en-US

                    // }

                    // Change the icon
                    const iconElement = strandElement.querySelector('.jstree-icon');
                    if (iconElement && iconElement.style.backgroundImage.includes('features/fiber.svg')) {
                        iconElement.style.backgroundImage = `url("${determineIcon(inSide.type, outSide.type)}")`;
                    }

                    // Populate the side info
                    inSide = await populateSideInfo(inSide);
                    outSide = await populateSideInfo(outSide);
            
                    const inElement = formatText(inSide);
                    const outElement = formatText(outSide);
            
                    const arrowElement = document.createElement('span');
                    arrowElement.textContent = ' ➡ ';
            
                    const wrappedElement = document.createElement('span');
                    const openingP = document.createTextNode(' (');
                    const closingP = document.createTextNode(')');
            
                    wrappedElement.append(openingP, inElement, arrowElement, outElement, closingP);
            
                    const row = document.createElement('div');
                    row.style.display = 'flex';
                    row.style.justifyContent = 'space-between';

                    const cell1 = document.createElement('div');
                    cell1.style.width = `${maxCell1Width + 5}px`;
                    while (strandElement.firstChild) {
                        cell1.appendChild(strandElement.firstChild); // Moves the existing content of the anchor tag to cell1
                    }
                    row.appendChild(cell1);

                    const cell2 = document.createElement('div');
                    cell2.appendChild(wrappedElement);
                    row.appendChild(cell2);

                    strandElement.appendChild(row);  // append the row to the element
                    strandElement.classList.add('qol-term');
                });

                displayStatusMessage(segment, null, savedTimestamp);

            } catch (error) {
                displayStatusMessage(segment, 'Unable to complete');
                console.error(`Unable to show terminations for ${segment}`);
                console.error(error);
            }
        }

        function displayStatusMessage(segment, message, savedTimestamp = '') {
            const liElement = document.getElementById(`out_${segment}`) || document.getElementById(`in_${segment}`) || document.getElementById(segment);
            if (!liElement) {
                console.error('Segment DOM element not found for:', segment);
                return;
            }
        
            try {
                const strandElements = liElement.querySelectorAll('a');
                const firstStrandElement = strandElements[0];
            
                let statusElement = firstStrandElement.querySelector('.qol-status-message');
            
                if (!statusElement) {
                    statusElement = document.createElement('span');
                    statusElement.classList.add('qol-status-message');
                    statusElement.style.paddingLeft = '10px';
                    statusElement.style.color = iqgeoGreen;
                    statusElement.style.fontSize = '13px';
                    firstStrandElement.appendChild(statusElement);
                }
            
                // Set the message to indicate the current status
                if (savedTimestamp) {
                    const savedDate = new Date(savedTimestamp);
                    statusElement.textContent = `(Terminations updated: ${savedDate.toLocaleString()})`;
                } else {
                    statusElement.textContent = message;
                }
            } catch (error) {
                console.error(`Error updating status message for segment: ${segment}`);
                console.error(error);
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
            // console.log('formatText', side);

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
                    featureId = side.feature.split('/')[1];
                    hoverText = `Segment - ${featureId}`;
                }
                // Get the appropriate formatter
                const formatter = formatters[featureType] || formatters.default;
                displayText = formatter(side);
            } catch (error) {
                console.log('Error in formatText for Side:', side);
                throw console.error(error);
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
                // console.log(`Getting structure: ${structure}`);

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
                        console.error(`Couldn't determine end_structure`);
                        throw new Error(`Couldn't determine end_structure`);
                    }

                    // No longer necessary... right?
                    // url = `${COMPANY_URL}/modules/comms/structure/${in_structure}/contents?delta=${design}&include_proposed=true&application=mywcom&lang=en-US`;
                    // data = await fetchData(url);
                    // structureData['end_equip_count'] = data.equip?.count;

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
                        console.log('feature:', feature);
                        console.info(`Unknown feature type: ${featureType}`);
                        
                        // *Should* be available for most/all features
                        propertiesToSave = ['id', 'name'];
                    }
            
                    // Extract desired properties from the data
                    featureData = {};
                    for (const property of propertiesToSave) {
                        if (data?.["properties"]?.hasOwnProperty(property) === false) {
                            throw console.error(`${feature} does not contain property: ${property}`);
                        }
                        featureData[property] = data.properties[property];
                    }
            
                    // Save to localStorage
                    await saveFeatureInfo(featureType, featureId, featureData);
                }
            
                // If there is a second level feature, fetch it as well
                // console.log('featureData:', featureData);
                const rootHousing = featureData.root_housing;
                // console.log('rootHousing:', rootHousing);
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
            // console.log('Loading feature info:', featureType, featureId);
            
            // Load the data for the specified featureType
            const item = localStorage.getItem(featureType);
            if (!item) {
                return null;
            }
            const existingData = JSON.parse(item);
            if (!existingData[featureId]) {
                // console.log(`Saved data not found: ${featureType} ${featureId}`);
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
                // console.info(`Feature ${featureType}/${featureId} saved ${elapsedTime} ms ago`);
                console.info(`Cache data for ${featureType}/${featureId} expired ${elapsedTime / dayInMs} hours ago`);

                // Remove expired record from cache
                delete existingData[featureId]; // Remove element from cached featureType data object
                localStorage.setItem(featureType, JSON.stringify(existingData)); // Update featureType cache
                
                return null;
            }
            
            return existingData[featureId].data;  // Return the data for the specified featureId
        }

        async function saveFeatureInfo(featureType, featureId, newData) {
            try {
                // console.log('Saving feature info:', featureType, featureId);

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
                console.error(`Unable to save info for ${featureType}/${featureId}`);
                console.error(`Error: ${error}`);
            }
        }

        function purgeFeatureCache(featureType, maxAgeDays = 5) {
            // console.log('Cleaning up cache for:', featureType);
            
            // Load the data for the specified featureType
            const item = localStorage.getItem(featureType);
            if (!item) return false;

            let cacheData = {};
            try {
                cacheData = JSON.parse(item);
                if (!cacheData) {
                    console.log(`Unable to parse cache for ${featureType}`);
                    return false;
                }
            } catch (error) {
                console.log(`Unable to parse cache for ${featureType}`);
                return false;
            }

            // console.log(`${featureType} cache size: ${Object.keys(cacheData).length}`);

            const dayInMs = 86_400_000 // 24 hours in milliseconds
            const maxTTL = maxAgeDays * dayInMs;
            const oldestSaveTime = Date.now() - maxTTL;
            // console.log('Oldest cache save time:', oldestSaveTime);
            
            const validEntries = Object.entries(cacheData).filter(([key, val]) => val.hasOwnProperty('saved') & val['saved'] > oldestSaveTime);
            // console.log('Count valid:', validEntries.length);
            const outdatedCount = Object.keys(cacheData).length - validEntries.length;
            updatedCacheData = Object.fromEntries(validEntries); 
            // console.log('Count outdated:', outdatedCount);

            updatedCacheData = Object.fromEntries(validEntries);
            // console.log('Updated Cache:', updatedCacheData);

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
                console.error(`Error updating ${featureType} cache`);
                console.error(error);
                throw error;
            }

            // Return how many entries remain after cleanup
            return remainingEntries;
        }
    
        // Cache for promises returned by getSegment
        const segmentRequests = {};
        async function getSegment({segment, cable, fiberCount, interceptedData}, forceRefreshParam = false) {
            // Check if there's an ongoing request for this segment
            if (segmentRequests[segment]) {
                return segmentRequests[segment];
            }

            // console.log(
            //     `getSegment for 
            //     segment: ${segment},
            //     cable: ${cable},
            //     fiberCount: ${fiberCount},
            //     interceptedData: ${interceptedData}`
            // );

            displayStatusMessage(segment, "Updating Terminations...");
            
            // If there's no ongoing request, start one and store it in the cache
            segmentRequests[segment] = (async () => {
                // Set whether to override local storage
                forceRefresh = forceRefreshParam;
                // console.log(`Getting segment: ${segment}, forceRefresh: ${forceRefresh}`);
                // console.log('interceptedData:', interceptedData);
                
                const [segmentType, segmentId] = segment.replace(/in|out/, '').split('/');
                let segmentData;
                let cachedSaved = null;

                if (!forceRefresh) {
                    const cached = await loadFeatureInfo(segmentType, segmentId);
                    if (cached) {
                        try {
                            const cacheRaw = JSON.parse(localStorage.getItem(segmentType) || "{}");
                            cachedSaved = cacheRaw?.[segmentId]?.saved || null;
                        } catch (e) {
                            /* ignore cache parse issues */
                        }
                        segmentData = { saved: cachedSaved, data: cached };
                    }
                }
            
                if (!segmentData) {
                    const design = getCurrentDesign();

                    if (!fiberCount && !interceptedData) {
                        if (cable) {
                            const fiberCountData = await fetchData(`${COMPANY_URL}/feature/${cable}?display_values=true&delta=${design}&application=mywcom&lang=en-US`);
                            fiberCount = fiberCountData.properties.fiber_count;
                        } else {
                            const segmentData = await fetchData(`${COMPANY_URL}/feature/${segment}?display_values=true&delta=${design}&application=mywcom&lang=en-US`);
                            cable = segmentData.properties.cable;
                            if (cable) {
                                const fiberCountData = await fetchData(`${COMPANY_URL}/feature/${cable}?display_values=true&delta=${design}&application=mywcom&lang=en-US`);
                                fiberCount = fiberCountData.properties.fiber_count;
                            }
                        }
                    }

                    let newData;
                    if (!interceptedData) {
                        newData = await fetchData(`${COMPANY_URL}/modules/comms/fiber/paths/${segment}?pins=in%3A1%3A${fiberCount}&full=false&delta=${design}&application=mywcom&lang=en-US`);
                    } else {
                        newData = interceptedData;
                    }

                    const strands = Object.keys(newData).map((key) => {
                        const strand = newData[key];
                        const { in: inSide, out: outSide } = strand;
        
                        // Extract properties from both in and out sides
                        const strandDetails = {
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
        
                        return strandDetails;
                    });

                    segmentData = {
                        saved: Date.now(),
                        data: strands
                    };
        
                    await saveFeatureInfo(segmentType, segmentId, strands); // 2025-11-17: Changed to save 'strands' instead of 'segmentData' to fix accidentally nesting in localStorage
                }
        
                return segmentData;
            })().then(result => {
                // console.log('Show Terms:', result);
                showTerminations(segment, result.data, result.saved);
                return result;
            });

            // When the request is complete, remove it from the cache
            return segmentRequests[segment].finally(() => {
                delete segmentRequests[segment];
            });
        } // todo: rename segmentData to terminationData and move related code to separate function (getTerminations?)
        
        async function getRouteSegments(data) {
            // console.log('Getting segments');

            const segments = data.cable_segs.features;
            const cables = data.cables.features;
            
            const routeSegments = segments.map((routeSegment) => {
                const segment = `mywcom_fiber_segment/${routeSegment.id}`;
                const cable = routeSegment.properties.cable;
                const cableId = cable.split('/')[1];
                const fiberCount = cables.find((c) => c.id == cableId)?.properties.fiber_count;
                return { segment, cable, fiberCount };
            });
    
            for (const routeSegment of routeSegments) {
                // console.log('Getting segment data:', routeSegment);

                await getSegment(routeSegment);
            }
        }

        // Helper function to fetch data
        async function fetchData(url) {
            try {
                const response = await fetch(url);
                const data = await response.json();
                return data;
            } catch (error) {
                console.error(`Error fetching data from ${url}:`, error);
                throw error; // Rethrow the error so it can be handled by the caller
            }
        }

        function getCurrentDesign() {
            const currentDeltaEl = document.querySelector('div.delta-owner-map-watermark-text');
            if (currentDeltaEl) {
                return `design%2F${currentDeltaEl.textContent?.split(": ")[1]}`;
            }

            return '';
        }
    
        function setupMutationObserver() {
            // Create an observer instance linked to the callback function
            const observer = new MutationObserver((mutations) => {                
                mutations.forEach(m => {
                    if (m.addedNodes.length === 0) return; // Ignore removedNodes

                    let segment, cable;
                    const mTarget = m.target;

                    // Skip Splice Closure until code is ready to handle cleanly
                    if (mTarget.id.startsWith("splice_closure")) {
                        return;
                    }

                    // Check if the target is an li element, starts with 'mywcom_fiber_segment/',
                    // and has the class 'jstree-open' (meaning the segment is expanded)
                    if (mTarget.nodeName === 'LI'
                        && mTarget.id.includes('mywcom_fiber_segment/')
                        && mTarget.classList.contains('jstree-open')) {
                        segment = mTarget.id.replace(/out_|in_/g, '');
                        // console.log('Mutation Target:', mTarget);
                        
                        let cableElement = mTarget.parentNode;
                        while (cableElement && !(cableElement.id && cableElement.id.startsWith('fiber_cable'))) {
                            cableElement = cableElement.parentNode;
                        }
                        cable = cableElement ? cableElement.id : null;
                    }

                    // Check if the target is an a element, starts with 'fiber_cable/',
                    // and has the attribute 'aria-expanded="true"' (meaning the strand list is expanded)
                    if (mTarget.nodeName === 'A'
                        && mTarget.id.includes('fiber_cable/')
                        && mTarget.attributes['aria-expanded']?.value === 'true') {
                        
                        // console.log('Mutation Target:', mTarget);
                        
                        cable = mTarget.id.replace(/_anchor/g, '');
                        
                        const segmentElement = mTarget.nextSibling.firstChild;
                        if (segmentElement.classList.contains('jstree-open')) {
                            segment = segmentElement.id.replace(/out_|in_/g, '');
                        }
                    }

                    // Show terminations if we have a segment and cable
                    if (segment) {
                        try {
                            getSegment({segment: segment, cable: cable});
                        } catch (error) {
                            console.error('Error:', error);
                            displayStatusMessage(segment, 'Error, check console');
                        }
                        // getSegment({segment: segment, cable: cable}).catch((r) => {
                        //     console.error('Error reason:', r);
                        //     displayStatusMessage(segment, 'Error, check console');
                        // });
                        // getSegment({segment: segment, cable: cable}).then(({savedTimestamp, segmentData}) => {
                        //     console.log('Segment data:', segmentData);
                        //     if (segmentData) {
                        //         showTerminations(segment, segmentData, savedTimestamp);
                        //     }
                        // }).catch(console.error);
                    }
                });
            });
    
            // Start observing the target node for configured mutations
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['id'] });
        }
    
        return {
            setupMutationObserver: setupMutationObserver,
            getRouteSegments: getRouteSegments,
            getSegment: getSegment
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

    // Load each feature
    // todo: setup single observer for all features
    featureDetailsPopup.observe();
    // featureStrandCalc.observe();
    // featureBetterSpliceDetails.observe();
    featureBetterTerminations.setupMutationObserver();
    featureHorizontalMenu.run();

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



    
})();

// Error Monitor
runWhenReady("#map_canvas", () => {
    'use strict';

    const IGNORE_URL_PATTERNS = [
        /googleapis\.com\/maps\/api\/mapsjs\//,
        /optical_node_closure_spec/
    ];

    // ─── State ────────────────────────────────────────────────────────────
    const logs = [];
    const STORAGE_KEY = 'qol-errmon-btn-pos';

    // ─── Helpers ──────────────────────────────────────────────────────────
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
        // drop anything matching an ignore pattern
        if (shouldIgnoreLog(entry)) return;
        
        logs.push({ time: new Date(), ...entry });
        if (panelOpen) renderLogs(currentFilter);
        updateButtonColor();
    }
    function formatTime(d) {
        return d.toLocaleTimeString();
    }
    function updateButtonColor() {
        btn.style.backgroundColor = logs.length > 0 ? '#e33' : '#3a3'; // red if errors, green if none
    }
    function saveBtnPosition(x, y) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ x, y }));
    }
    function getBtnPosition() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); }
        catch(e){ return null; }
    }

    // ─── Override console.error/warn ──────────────────────────────────────
    ['error'].forEach((level) => { // 2025-04-18 Removed use of 'warn'
        const orig = console[level];
        console[level] = function (...args) {
            addLog({ type: 'console', level, message: args.map(String).join(' ') });
            orig.apply(console, args);
        };
    });

    // ─── Capture uncaught errors & rejections ─────────────────────────────
    window.addEventListener('error', (e) => {
        addLog({ type: 'console', level: 'error', message: `${e.message} (${e.filename}:${e.lineno})` });
    });
    window.addEventListener('unhandledrejection', (e) => {
        addLog({ type: 'console', level: 'error', message: 'UnhandledRejection: ' + (e.reason?.toString() || e.reason) });
    });

    // ─── Wrap fetch ───────────────────────────────────────────────────────
    const origFetch = window.fetch;
    window.fetch = function (...args) {
        return origFetch.apply(this, args).then((res) => {
            if (!res.ok) {
                addLog({ type: 'network', method: 'fetch', status: res.status, url: res.url, message: `${res.status} ${res.statusText}` });
            }
            return res;
        }).catch((err) => {
            addLog({ type: 'network', method: 'fetch', status: 'ERR', url: args[0] || '', message: err.toString() });
            throw err;
        });
    };

    // ─── Wrap XHR ─────────────────────────────────────────────────────────
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._errmon = { method, url };
        return origOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) {
        this.addEventListener('loadend', () => {
            const { status, statusText } = this;
            if (status < 200 || status >= 300) {
                addLog({ type: 'network', method: this._errmon.method, status, url: this._errmon.url, message: `${status} ${statusText}` });
            }
        });
        this.addEventListener('error', () => {
            addLog({ type: 'network', method: this._errmon.method, status: 'ERR', url: this._errmon.url, message: 'XHR error' });
        });
        return origSend.apply(this, args);
    };

    // ─── Build UI ──────────────────────────────────────────────────────────
    let panelOpen = false, currentFilter = 'all';

    // Floating button
    const btn = document.createElement('button');
    btn.textContent = '🐞';
    Object.assign(btn.style, {
        position: 'fixed', width: '40px', height: '40px', borderRadius: '50%', 
        color: '#fff', border: 'none', cursor: 'move', zIndex: 99999
    });
    // load saved position or default
    const pos = getBtnPosition();
    if (pos?.x!=null && pos?.y!=null) {
        btn.style.left = pos.x + 'px';
        btn.style.top = pos.y + 'px';
    } else {
        btn.style.bottom = '20px';
        btn.style.right = '20px';
    }
    updateButtonColor();
    document.body.appendChild(btn);

    // Draggable behavior
    let isDragging = false, startX, startY;
    btn.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX - btn.offsetLeft;
        startY = e.clientY - btn.offsetTop;
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', onStopDrag);
        e.preventDefault();
    });
    function onDrag(e) {
        if (!isDragging) return;
        if (panelOpen) return; // to prevent moving under the panel unintentionally
        const x = e.clientX - startX, y = e.clientY - startY;
        btn.style.left = x + 'px';
        btn.style.top = y + 'px';
    }
    function onStopDrag() {
        if (isDragging) {
            isDragging = false;
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', onStopDrag);
            saveBtnPosition(btn.offsetLeft, btn.offsetTop);
        }
    }

    // Panel container
    const panel = document.createElement('div');
    Object.assign(panel.style, {
        position: 'fixed', width: '400px', maxHeight: '60vh', background: '#fff', 
        border: '1px solid #888', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', 
        padding: '8px', overflow: 'auto', fontSize: '12px', display: 'none', zIndex: 99999
    });
    document.body.appendChild(panel);

    // Header with filters & clear
    const header = document.createElement('div');
    header.innerHTML = `
        <button data-filter="all">All</button>
        <button data-filter="console">Console</button>
        <button data-filter="network">Network</button>
        <button id="err-clear" style="float:right">Clear</button>
        <hr/>
    `;
    panel.appendChild(header);

    const list = document.createElement('ul');
    Object.assign(list.style, { padding:'0', listStyle:'none' });
    panel.appendChild(list);

    btn.addEventListener('click', () => {
        panelOpen = !panelOpen;
        if (panelOpen) {
            panel.style.display = 'block';

            const btnRect = btn.getBoundingClientRect();
            const pH      = panel.offsetHeight;
            const pW      = panel.offsetWidth;
            const off     = 10;
            const vW      = window.innerWidth;
            const vH      = window.innerHeight;

            // Vertical position: above if enough space, otherwise below
            let top;
            if (btnRect.top >= pH + off) {
                top = btnRect.top - pH - off;
            } else {
                top = btnRect.bottom + off;
            }

            // Horizontal position: align left but clamp within viewport
            let left = btnRect.left;
            if (left + pW + off > vW) {
                left = vW - pW - off;
            }
            if (left < off) {
                left = off;
            }

            panel.style.top  = top  + 'px';
            panel.style.left = left + 'px';

            renderLogs(currentFilter);
        } else {
            panel.style.display = 'none';
        }
    });

    // Filter & clear
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

    function renderLogs(filter) {
        list.innerHTML = '';
        logs.forEach((log) => {
            if (filter !== 'all' && log.type !== filter) return;
            const li = document.createElement('li');
            li.style.marginBottom = '6px';
            li.innerHTML = `
                <strong>[${formatTime(log.time)}]</strong>
                <em>(${log.type}${log.level ? '/' + log.level : ''}${log.method ? '/' + log.method : ''})</em>
                <div>${log.message}</div>
                ${log.url ? `<div style="font-size:10px;color:#555;">${log.url}</div>` : ''}
            `;
            list.appendChild(li);
        });
        if (!list.children.length)
            list.innerHTML = '<li><em>No entries</em></li>';
    }

    const uiObserver = new MutationObserver((mutations, obs) => {
        // once we see <body>, inject UI and stop observing
        if (document.body) {
            document.body.appendChild(btn);
            document.body.appendChild(panel);
            obs.disconnect();
        }
    });
    // try immediately, otherwise wait for the body to appear
    if (document.body) {
        document.body.appendChild(btn);
        document.body.appendChild(panel);
    } else {
        uiObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
});

// Plugin Overrides: displayManager, locManager
(function () {
    'use strict';

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


    async function patchDisplayManager() {
        const dm = await waitFor(getDisplayManager);
        if (!dm || dm.__connLabelPatchedSimple) return;

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
        console.info('[userscript] Patched displayManager._connLabel');
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

    async function patchEquipmentTreeSaveState() {
        const timeoutMs = 10 * 60 * 1000;
        const treeView = await waitFor(getEquipTreeView, { timeoutMs: timeoutMs, intervalMs: 1000 });
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
                patchStructureManager()
            ]);
        } catch (e) { 
            console.error('[userscript] Patching error:', e); 
        }
    }

    applyPatches();

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
calculator
    * replace dialog with floating popup from copy feature
    * validate input

splice group
    * fix formatting so cable pairs are a list
    * fix strands not in ascending order (create object map first, sort, then create HTML?)
    * determine why cable pairs are not grouped (inspect object map)

*/
