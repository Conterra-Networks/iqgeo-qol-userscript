// ==UserScript==
// @name         IQGeo QOL
// @description  Loads IQGeo QOL script from GitHub
// @version      1.0.0
// @author       CShepard
// @match        *://*.nmt.iqgeo.cloud/*
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

(function() {
    const scriptUrl = "https://raw.githubusercontent.com/Conterra-Networks/iqgeo-qol-userscript/main/iqgeo-qol-script.js";

    GM_xmlhttpRequest({
        method: "GET",
        url: scriptUrl,
        nocache: true,
        onload: (response) => {
            try {
                const script = document.createElement("script");
                script.type = "text/javascript";
                script.textContent = response.responseText;
                document.documentElement.appendChild(script);
            } catch (err) {
                console.error("[IQGeo QOL] Script injection error:", err);
            }
        },
        onerror: (err) => {
            console.error("[IQGeo QOL] Failed to fetch script file:", err);
        }
    });
})();
