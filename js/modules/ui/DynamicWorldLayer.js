// DynamicWorldLayer.js (Updated for Dynamic World All Bands)

import parseGeoraster from "georaster";
import GeoRasterLayer from "georaster-layer-for-leaflet";
import CONFIG from "../../config.js";
import {
    loadGEEClippedLayer,
    startDynamicWorldAllBandsExport,
    getDynamicWorldAllBandsExportStatus,
    getCurrentDynamicWorldAllBandsPath,
    getCurrentCountyKey,
    setCurrentCountyNameAndStateAbbr
} from "../services/DataManager.js";
import { fipsToState } from "../../utils/constants.js";
import { showToast } from "../../utils/toast.js";
import { showLoader, hideLoader } from "../../utils/loader.js";
import MapCore from "./MapCore.js";

let dynamicWorldLayer = null;
let geoRaster = null;
let geotiffLoaded = false;

function makeDynamicWorldColorFn(numBands) {
    const DW_COLORS = [
        "#419BDF", // water
        "#397D49", // trees
        "#88B053", // grass
        "#7A87C6", // flooded vegetation
        "#E49635", // crops
        "#DFC35A", // shrub/scrub
        "#C4281B", // built
        "#A59B8F", // bare ground
        "#B39FE1"  // snow/ice
    ];

    return function(values) {
        if (!values) return null;
        const label = values[numBands - 1];
        return DW_COLORS[label] + "AA";
    };
}

async function handleCountySelectionForDynamicWorld(feature) {
    const map = MapCore.getMap();
    if (!map) return;

    showLoader("Loading Dynamic World (all bands)…");

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
        const geotiffUrl = `${CONFIG.API_BASE_URL}${CONFIG.GEOTIFF_URL}DynamicWorldAllBands_${countyKey}_2024.tif`;

        geotiffLoaded = false;
        if (dynamicWorldLayer) {
            try { map.removeLayer(dynamicWorldLayer); } catch (e) {}
            dynamicWorldLayer = null;
        }
        geoRaster = null;

        try {
            const headResponse = await fetch(geotiffUrl, { method: "HEAD" });
            if (headResponse.ok) {
                const resp = await fetch(geotiffUrl);
                if (!resp.ok) throw new Error(`Failed to fetch GeoTIFF: ${resp.status}`);

                const arrayBuffer = await resp.arrayBuffer();
                geoRaster = await parseGeoraster(arrayBuffer);

                dynamicWorldLayer = new GeoRasterLayer({
                    georaster: geoRaster,
                    pane: "dynamicWorldPane",
                    opacity: 1.0,
                    resolution: 256,
                    pixelValuesToColorFn: makeDynamicWorldColorFn(geoRaster.numberOfRasters),
                    mask: feature.geometry
                }).addTo(map);

                geotiffLoaded = true;

                hideLoader();
                showToast("Dynamic World (all bands) loaded successfully.");
                return;
            }
        } catch (err) {
            console.warn("[WARN] Local Dynamic World GeoTIFF load failed:", err);
        }

        if (!geotiffLoaded) {
            await Promise.all([
                loadGEEClippedLayer(feature.geometry),
                startDynamicWorldAllBandsExport(feature.geometry)
            ]);

            let status = await getDynamicWorldAllBandsExportStatus();
            if (status === "COMPLETED") {
                const localPath = getCurrentDynamicWorldAllBandsPath();
                if (localPath) {
                    const resp = await fetch(`${CONFIG.API_BASE_URL}${localPath}`);
                    const arrayBuffer = await resp.arrayBuffer();
                    geoRaster = await parseGeoraster(arrayBuffer);

                    dynamicWorldLayer = new GeoRasterLayer({
                        georaster: geoRaster,
                        pane: "dynamicWorldPane",
                        opacity: 1.0,
                        resolution: 256,
                        pixelValuesToColorFn: makeDynamicWorldColorFn(geoRaster.numberOfRasters),
                        mask: feature.geometry
                    }).addTo(map);

                    hideLoader();
                    showToast("Dynamic World (all bands) loaded successfully.");
                    return;
                }
            }

            hideLoader();
            showToast("Failed to load Dynamic World (all bands) layer.", true);
            return;
        }

    } catch (error) {
        console.error("[DW ERROR]", error);
        hideLoader();
        showToast("Error loading Dynamic World layer.", true);
    }
}

function getDynamicWorldLayer() {
    return dynamicWorldLayer;
}

function getGeoRaster() {
    return geoRaster;
}

function resetDynamicWorld() {
    const map = MapCore.getMap();
    if (map && dynamicWorldLayer) {
        try {
            map.removeLayer(dynamicWorldLayer);
        } catch (err) {
            console.warn("Failed to remove Dynamic World layer:", err);
        }
    }

    dynamicWorldLayer = null;
    geoRaster = null;
    geotiffLoaded = false;
}

export default {
    handleCountySelectionForDynamicWorld,
    getDynamicWorldLayer,
    getGeoRaster,
    resetDynamicWorld
};