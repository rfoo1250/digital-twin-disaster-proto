// Map.js
// High-level orchestrator connecting MapCore, DynamicWorldLayer, IgnitionManager, and WildfireSimulationLayer

import MapCore from "./MapCore.js";
import DynamicWorldLayer from "./DynamicWorldLayer.js";
import IgnitionManager from "./IgnitionManager.js";
import WildfireSimulationLayer from "./WildfireSimulationLayer.js";
import { showToast } from "../../utils/toast.js";
import { showLoader, hideLoader } from "../../utils/loader.js";
import {
    loadWildfireSimulation,
    getCurrentCountyKey
} from "../services/DataManager.js";
import CONFIG from "../../config.js";

// Internal state
let isFocused = false;

function init() {
    MapCore.init();
    setupButtons();
    setupLayerToggles();
    // restoreIgnitionPointIfAny();
}

// ---------------- BUTTON SETUP ----------------
function setupButtons() {
    const focusBtn = document.getElementById("focus-on-county");
    const resetBtn = document.getElementById("reset-focus");
    const setIgnitionBtn = document.getElementById("set-ignition-point");
    const removeIgnitionBtn = document.getElementById("remove-ignition-point");
    const startSimBtn = document.getElementById("start-wildfire-sim");

    if (focusBtn) {
        focusBtn.addEventListener("click", async () => {
            const selected = MapCore.getSelectedCounty();
            const map = MapCore.getMap();

            if (!selected) return showToast("Please select a county.", true);

            map.flyToBounds(selected.getBounds(), {
                padding: [40, 40],
                duration: 1.5
            });

            MapCore.getCountyLayer().eachLayer((l) => {
                if (l === selected) l.setStyle(MapCore.highlightCountyStyle);
                else l.setStyle(MapCore.dimCountyStyle);
            });

            const dwToggle = document.getElementById("toggle-dynamicworld");
            if (dwToggle && dwToggle.checked) {
                await DynamicWorldLayer.handleCountySelectionForDynamicWorld(selected.feature);
            }

            isFocused = true;
            updateButtonStates();
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            const map = MapCore.getMap();

            map.flyTo([37.8, -96], 4, { duration: 1.2 });
            isFocused = false;
            MapCore.setSelectedCounty(null);

            MapCore.getCountyLayer().eachLayer(l => l.setStyle(MapCore.defaultCountyStyle));

            DynamicWorldLayer.resetDynamicWorld();
            WildfireSimulationLayer.resetSimulation();
            IgnitionManager.removeIgnitionPoint();

            showToast("Reset to default view.");
            updateButtonStates();
        });
    }

    if (setIgnitionBtn) {
        setIgnitionBtn.addEventListener("click", () => {
            if (!isFocused) return showToast("Please focus on a county first.", true);
            IgnitionManager.enableIgnitionSelection();
        });
    }

    if (removeIgnitionBtn) {
        removeIgnitionBtn.addEventListener("click", () => {
            IgnitionManager.removeIgnitionPoint();
            updateButtonStates();
        });
    }

    if (startSimBtn) {
        startSimBtn.addEventListener("click", async () => {
            const ignition = JSON.parse(localStorage.getItem("ignitionPoint"));
            const selected = MapCore.getSelectedCounty();
            if (!ignition) return showToast("Please set an ignition point first.", true);
            if (!selected) return showToast("Please select a county first.", true);

            showLoader("Loading wildfire simulation...");

            const countyKey = getCurrentCountyKey();
            if (!countyKey) {
                hideLoader();
                return showToast("Missing county key.", true);
            }

            // --- REAL CALL (future) ---
            const response = await loadWildfireSimulation({
                countyKey,
                igniPointLat: ignition.lat,
                igniPointLon: ignition.lng
            });

            // --- TEST RESPONSE (current) ---
            // const response = {
            //     success: true,
            //     // output_dir: `wildfire_output/sim_run_Door_WI_20251126_111442`
            //     output_dir: `wildfire_output/sim_run_Door_WI_20251121_150709`
            //     // output_dir: `wildfire_output/sim_run_Door_WI_20251121_134457`
            // };

            if (!response.success) {
                hideLoader();
                return showToast("Simulation failed.", true);
            }

            const loaded = await WildfireSimulationLayer.loadWildfireFrames(response.output_dir);
            if (!loaded) {
                hideLoader();
                return showToast("Failed to load simulation frames.", true);
            }

            // Finished loading — now hide loader BEFORE starting animation
            hideLoader();

            // Optional toast for user feedback (if you want)
            showToast("Starting animation...");

            WildfireSimulationLayer.startAnimation();
            enableTimestepControls();

        });
    }

    // ---------------- WILDFIRE TIMESTEP CONTROLS ----------------
    const timestepPanel = document.getElementById("wildfire-timestep-controls");
    const timestepValueLabel = document.getElementById("timestep-value");
    const timestepLeftBtn = document.getElementById("timestep-left");
    const timestepRightBtn = document.getElementById("timestep-right");

    // Internal UI state
    let currentTimestep = 0;
    let maxTimestep = 0;

    // Called only after animation finishes
    function enableTimestepControls() {
        const frames = WildfireSimulationLayer.getFrames();
        if (!frames || frames.length === 0) return;

        maxTimestep = frames.length - 1; // last index
        currentTimestep = maxTimestep;   // animation finished at final frame

        // Show panel
        timestepPanel.style.display = "block";

        updateTimestepControlsUI();
    }

    // Update UI state — disables / enables arrows
    function updateTimestepControlsUI() {
        timestepValueLabel.textContent = currentTimestep;

        // Disable left button at timestep 0
        timestepLeftBtn.disabled = currentTimestep <= 0;
        // Disable right button at max timestep
        timestepRightBtn.disabled = currentTimestep >= maxTimestep;
    }

    // Move to a specific timestep (no animation)
    function showTimestep(ts) {
        const frames = WildfireSimulationLayer.getFrames();
        if (!frames || frames.length === 0) return;

        // Hide all frames
        frames.forEach(f => f.setOpacity(0));

        // Show the selected frame
        frames[ts].setOpacity(CONFIG.DEFAULT_WILDFIRE_OPACITY);

        // Force Leaflet to refresh rendering
        const map = MapCore.getMap();
        const c = map.getCenter();
        map.setView(c, map.getZoom(), { animate: false });

        currentTimestep = ts;
        updateTimestepControlsUI();
    }

    // Arrow button events
    if (timestepLeftBtn) {
        timestepLeftBtn.addEventListener("click", () => {
            if (currentTimestep > 0) {
                showTimestep(currentTimestep - 1);
            }
        });
    }

    if (timestepRightBtn) {
        timestepRightBtn.addEventListener("click", () => {
            if (currentTimestep < maxTimestep) {
                showTimestep(currentTimestep + 1);
            }
        });
    }


    updateButtonStates();
}

// ---------------- TOGGLES ----------------
function setupLayerToggles() {
    const countyToggle = document.getElementById("toggle-counties");
    const dynamicWorldToggle = document.getElementById("toggle-dynamic-world");
    const wildfireToggle = document.getElementById("toggle-wildfire");

    const map = MapCore.getMap();

    if (countyToggle) {
        countyToggle.addEventListener("change", (e) => {
            if (e.target.checked) MapCore.getCountyLayer().addTo(map);
            else map.removeLayer(MapCore.getCountyLayer());
        });
    }

    if (dynamicWorldToggle) {
        dynamicWorldToggle.addEventListener("change", async (e) => {
            const selected = MapCore.getSelectedCounty();
            if (e.target.checked) {
                if (!selected) return showToast("Please select a county first.", true);
                if (!isFocused) return showToast("Please focus on the county first.", true);
                await DynamicWorldLayer.handleCountySelectionForDynamicWorld(selected.feature);
            } else {
                const layer = DynamicWorldLayer.getDynamicWorldLayer();
                if (layer) map.removeLayer(layer);
            }
        });
    }

    if (wildfireToggle) {
        wildfireToggle.addEventListener("change", (e) => {
            const frames = WildfireSimulationLayer.getFrames();
            frames.forEach(frame => {
                if (e.target.checked) frame.addTo(map);
                else map.removeLayer(frame);
            });
        });
    }
}

// ---------------- STATE RESTORE ----------------
// function restoreIgnitionPointIfAny() {
//     const map = MapCore.getMap();
//     const saved = localStorage.getItem("ignitionPoint");
//     if (!saved) return;

//     const { lat, lng } = JSON.parse(saved);
//     const marker = L.marker([lat, lng], { pane: "markerPane" }).addTo(map);
//     showToast("Restored ignition point.");

//     if (typeof updateButtonStates === "function") updateButtonStates();
// }

// ---------------- BUTTON STATE ----------------
function updateButtonStates() {
    const setIgnBtn = document.getElementById("set-ignition-point");
    const removeIgnBtn = document.getElementById("remove-ignition-point");
    const startSimBtn = document.getElementById("start-wildfire-sim");

    const hasIgnition = localStorage.getItem("ignitionPoint") !== null;

    if (setIgnBtn) setIgnBtn.disabled = !isFocused;
    if (removeIgnBtn) removeIgnBtn.disabled = !hasIgnition || !isFocused;
    if (startSimBtn) startSimBtn.disabled = !hasIgnition || !isFocused;
}

window.updateButtonStates = updateButtonStates;

export default { init };