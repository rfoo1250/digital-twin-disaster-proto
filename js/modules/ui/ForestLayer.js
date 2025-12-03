// ForestLayer.js
// Handles GeoTIFF forest cover loading, masking, and GEE fallback

import parseGeoraster from "georaster";
import GeoRasterLayer from "georaster-layer-for-leaflet";
import CONFIG from "../../config.js";
import {
    loadGEEClippedLayer,
    startForestDataExport,
    getGEEUrl,
    setCurrentCountyNameAndStateAbbr,
    getCurrentCountyKey
} from "../services/DataManager.js";
import { fipsToState } from "../../utils/constants.js";
import { showToast } from "../../utils/toast.js";
import { showLoader, hideLoader } from "../../utils/loader.js";
import MapCore from "./MapCore.js";

let forestLayer = null;
let geoRaster = null;
let geotiffLoaded = false;

async function handleCountySelectionForGEE(feature) {
    const map = MapCore.getMap();
    if (!map) return;

    // Start loader for the whole operation
    showLoader("Loading forest data…");

    try {
        const countyName = feature.properties.NAME || "Unknown";
        let stateAbbr = "";

        if (feature.properties.STATE) {
            const fipsCode = feature.properties.STATE.toString().padStart(2, "0");
            stateAbbr = fipsToState[fipsCode] || fipsCode;
        }

        if (countyName === "Unknown" || !stateAbbr) {
            hideLoader();
            showToast("Cannot identify selected county.", true);
            return;
        }

        setCurrentCountyNameAndStateAbbr(countyName, stateAbbr);

        const countyKey = getCurrentCountyKey();
        const geotiffUrl = `${CONFIG.API_BASE_URL}${CONFIG.GEOTIFF_URL}ForestCover_${countyKey}_2024.tif`;

        // Reset previous state so UI stays correct if user re-requests
        geotiffLoaded = false;
        if (forestLayer) {
            try { map.removeLayer(forestLayer); } catch (e) {}
            forestLayer = null;
        }
        geoRaster = null;

        // Try to load the local GeoTIFF first (HEAD -> GET -> parse)
        try {
            const headResponse = await fetch(geotiffUrl, { method: "HEAD" });
            if (headResponse.ok) {
                const resp = await fetch(geotiffUrl);
                if (!resp.ok) throw new Error(`Failed to fetch GeoTIFF: ${resp.status}`);

                const arrayBuffer = await resp.arrayBuffer();
                geoRaster = await parseGeoraster(arrayBuffer);

                // remove old layer if present
                if (forestLayer) {
                    try { map.removeLayer(forestLayer); } catch {}
                }

                forestLayer = new GeoRasterLayer({
                    georaster: geoRaster,
                    pane: "forestPane",
                    opacity: 1.0,
                    resolution: 128,
                    pixelValuesToColorFn: (values) => {
                        const val = values[0];
                        return val === 1 ? "rgba(0,150,0,0.9)" : "rgba(0,0,0,0)";
                    },
                    mask: feature.geometry
                }).addTo(map);

                geotiffLoaded = true;

                // Done — hide loader and optionally notify
                hideLoader();
                showToast("Forest layer map loaded successfully.");
                return;
            }
        } catch (err) {
            // Local GeoTIFF load failed — we'll fallback
            console.warn("[WARN] Local GeoTIFF load failed:", err);
        }

        // Fallback: Use GEE tiles (this can be long; loader remains visible)
        if (!geotiffLoaded) {
            // startForestDataExport may start a background export; loadGEEClippedLayer should attempt to return tile URL if available/cached
            await Promise.all([
                loadGEEClippedLayer(feature.geometry),
                startForestDataExport(feature.geometry)
            ]);

            const tileUrl = getGEEUrl();
            if (tileUrl) {
                const tileLayer = L.tileLayer(tileUrl, {
                    opacity: CONFIG.DEFAULT_FOREST_OPACITY,
                    attribution: "GEE Forest Cover"
                });

                if (forestLayer) {
                    try { map.removeLayer(forestLayer); } catch {}
                }

                forestLayer = tileLayer.addTo(map);
                console.log("[INFO] Loaded GEE forest layer (fallback).");

                hideLoader();
                showToast("Forest layer map loaded successfully.");
                return;
            } else {
                hideLoader();
                showToast("Failed to load forest layer.", true);
                return;
            }
        }

    } catch (error) {
        console.error("[GEE ERROR]", error);
        hideLoader();
        showToast("Error loading forest layer.", true);
    }
}


function getForestLayer() {
    return forestLayer;
}

function getGeoRaster() {
    return geoRaster;
}

function resetForest() {
    const map = MapCore.getMap();
    if (map && forestLayer) {
        try { 
            map.removeLayer(forestLayer); 
        } catch (err) {
            console.warn("Failed to remove forest layer:", err);
        }
    }

    forestLayer = null;
    geoRaster = null;
    geotiffLoaded = false;
}


export default {
    handleCountySelectionForGEE,
    getForestLayer,
    getGeoRaster,
    resetForest
};