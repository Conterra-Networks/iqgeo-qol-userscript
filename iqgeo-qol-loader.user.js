// ==UserScript==
// @name         IQGeo QOL
// @namespace    https://github.com/Conterra-Networks/iqgeo-qol-userscript
// @version      1.0.1
// @description  Loader script that fetches and runs the latest IQGeo QOL logic (no grants required).
// @author       CShepard
// @match        https://*.nmt.iqgeo.cloud/*
// @run-at       document-start
// ==/UserScript==

(async function() {
    const logicUrl = "https://raw.githubusercontent.com/Conterra-Networks/iqgeo-qol-userscript/main/iqgeo-qol-script.js";

    try {
        const response = await fetch(logicUrl, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

        const logicCode = await response.text();

        const script = document.createElement("script");
        script.type = "text/javascript";
        script.textContent = logicCode;

        // Append early in the DOM so the logic executes immediately
        document.documentElement.appendChild(script);

    } catch (err) {
        console.error("[IQGeo QOL] Failed to load logic script:", err);
    }
})();
