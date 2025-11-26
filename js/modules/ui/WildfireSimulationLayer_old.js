// WildfireSimulationLayer.js
// Handles wildfire simulation frame loading, animation

import parseGeoraster from "georaster";
import GeoRasterLayer from "georaster-layer-for-leaflet";
import CONFIG from "../../config.js";
import MapCore from "./MapCore.js";
import ForestLayer from "./ForestLayer.js";
import { showToast } from "../../utils/toast.js";
import { getCurrentCountyKey } from "../services/DataManager.js";


let wildfireFrames = [];
let wildfireAnimTimer = null;
let wildfireFramesLoaded = false;

let WILDFIRE_ANIMATION_INTERVAL = 2000; // milliseconds
let WILDFIRE_FRAME_TIMEOUT = 100;   // milliseconds

async function loadWildfireFrames(outputDir) {
    const map = MapCore.getMap();
    const selectedCounty = MapCore.getSelectedCounty();
    if (!map || !selectedCounty) return;

    // Cleanup old frames
    stopAnimation();
    wildfireFrames.forEach(layer => {
        try { map.removeLayer(layer); } catch {}
    });
    wildfireFrames = [];
    wildfireFramesLoaded = false; // Reset loading state

    let timestep = 0;
    const maxTimesteps = 100;
    const baseUrl = `${CONFIG.API_BASE_URL}/${outputDir}`;

    while (timestep < maxTimesteps) {
        const rasterUrl = `${baseUrl}/wildfire_t_${timestep.toString().padStart(3, "0")}.tif`;

        try {
            const headResp = await fetch(rasterUrl, { method: "HEAD" });
            if (!headResp.ok) break;

            const resp = await fetch(rasterUrl);
            const arrayBuffer = await resp.arrayBuffer();
            const simGeoRaster = await parseGeoraster(arrayBuffer);

            const frameLayer = new GeoRasterLayer({
                georaster: simGeoRaster,
                pane: "wildfireSimPane",
                opacity: 0,
                resolution: 256,
                pixelValuesToColorFn: function(values) {
                    const val = values[0];
                    switch (val) {
                        case 2: return "rgba(255,165,0,0.9)"; // orange
                        case 3: return "rgba(255,0,0,0.9)";   // red
                        default: return "rgba(0,0,0,0)";
                    }
                },
                mask: selectedCounty.feature.geometry
            });

            frameLayer.addTo(map);
            wildfireFrames.push(frameLayer);
            timestep++;
        } catch (err) {
            console.error(`[ERROR] Failed to load frame ${timestep}:`, err);
            break;
        }
    }

    if (wildfireFrames.length === 0) {
        showToast("No wildfire frames found.", true);
        return false;
    }

    // IMPORTANT: Don't bring county/forest to front here
    // Let the animation control layer ordering
    wildfireFramesLoaded = true;
    console.debug(`[DEBUG] Loaded ${wildfireFrames.length} wildfire frames`);
    return true;
}

function startAnimation() {
    const map = MapCore.getMap();

    console.debug("[DEBUG] startAnimation() called");
    console.debug("[DEBUG] wildfireFramesLoaded =", wildfireFramesLoaded);
    console.debug("[DEBUG] total frames loaded =", wildfireFrames.length);

    if (!map) {
        console.warn("[DEBUG] Cannot start animation: map is not ready.");
        return;
    }

    if (wildfireFrames.length === 0) {
        console.warn("[DEBUG] Cannot start animation: no frames available.");
        return;
    }

    if (!wildfireFramesLoaded) {
        console.warn("[DEBUG] Cannot start animation: frames are still loading.");
        return;
    }

    // Stop any existing animation
    console.debug("[DEBUG] Stopping any existing animation...");
    stopAnimation();

    // Hide all frames initially
    console.debug("[DEBUG] Hiding all frames...");
    wildfireFrames.forEach((frame) => {
        frame.setOpacity(0);
    });

    // Ensure proper layer ordering before starting
    const forestLayer = ForestLayer.getForestLayer();
    const countyLayer = MapCore.getCountyLayer();
    if (forestLayer && map.hasLayer(forestLayer)) forestLayer.bringToFront();
    if (countyLayer) countyLayer.bringToFront();

    let currentFrame = 0;

    // Show first frame
    console.debug("[DEBUG] Showing frame 0...");
    wildfireFrames[0].bringToFront();
    wildfireFrames[0].setOpacity(CONFIG.DEFAULT_WILDFIRE_OPACITY);

    console.info(`[DEBUG] Animation started: frame 0 of ${wildfireFrames.length}`);

    // Animation loop
    wildfireAnimTimer = setInterval(() => {
        console.debug(`[DEBUG] ===== Timer tick =====`);
        
        // Hide current frame
        wildfireFrames[currentFrame].setOpacity(0);
        console.debug(`[DEBUG] Hidden frame ${currentFrame}`);

        // Advance to next frame
        currentFrame++;
        console.debug(`[DEBUG] Advanced to frame ${currentFrame}`);

        // Check if animation complete
        if (currentFrame >= wildfireFrames.length) {
            console.info("[DEBUG] Animation complete.");
            stopAnimation();
            
            // Restore original z-index order
            restoreLayerOrder();
            
            showToast("Wildfire simulation complete.");
            return;
        }

        // Show next frame (bring to front to ensure visibility)
        wildfireFrames[currentFrame].bringToFront();
        wildfireFrames[currentFrame].setOpacity(CONFIG.DEFAULT_WILDFIRE_OPACITY);
        console.debug(`[DEBUG] Showing frame ${currentFrame}`);

    }, WILDFIRE_ANIMATION_INTERVAL);
    
    console.debug(`[DEBUG] Interval timer set: ${wildfireAnimTimer}`);
}

function stopAnimation() {
    if (wildfireAnimTimer) {
        console.debug("[DEBUG] Stopping animation timer");
        clearInterval(wildfireAnimTimer);
        wildfireAnimTimer = null;
    }
}

// Restore original layer order (forest, county on top)
function restoreLayerOrder() {
    const map = MapCore.getMap();
    if (!map) return;
    
    const forestLayer = ForestLayer.getForestLayer();
    const countyLayer = MapCore.getCountyLayer();
    
    if (forestLayer && map.hasLayer(forestLayer)) forestLayer.bringToFront();
    if (countyLayer) countyLayer.bringToFront();
    
    console.debug("[DEBUG] Restored original layer order");
}

function resetSimulation() {
    const map = MapCore.getMap();
    if (!map) return;

    stopAnimation();
    wildfireFrames.forEach(frame => {
        try { map.removeLayer(frame); } catch {}
    });
    wildfireFrames = [];
    wildfireFramesLoaded = false;
}

export default {
    loadWildfireFrames,
    startAnimation,
    stopAnimation,
    resetSimulation,
    getFrames: () => wildfireFrames
};