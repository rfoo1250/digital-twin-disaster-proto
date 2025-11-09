import { getCountyGeoData, loadGEEClippedLayer, getGEEUrl } from '../services/DataManager.js';
import { fipsToState } from '../../utils/constants.js';
import { showToast } from '../../utils/toast.js';

/**
 * I will handle the double click function to zoom in on a county when clicked myself
 * 
 * caching the forest layer tile layer is a good idea too
 * 
 */

let map, countyLayer, forestLayer;
let selectedCounty = null;
let isFocused = false;

function init() {
    console.log('[INFO] Initializing Leaflet map...');

    map = L.map('map').setView([37.8, -96], 4);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const countyData = getCountyGeoData();
    if (countyData) {
        countyLayer = L.geoJSON(countyData, {
            style: defaultCountyStyle,
            onEachFeature: onEachCountyFeature,
        }).addTo(map);
    }

    setupLayerToggles();
    setupButtons();

    console.log('[INFO] Leaflet map initialized successfully.');
}

/* ---------- Styles ---------- */
const defaultCountyStyle = { color: '#333', weight: 1, opacity: 0.6, fillOpacity: 0 };
const highlightCountyStyle = { color: '#111', weight: 3, opacity: 0.95, fillOpacity: 0.08 };
const dimCountyStyle = { color: '#999', weight: 0.5, opacity: 0.2, fillOpacity: 0 };

/* ---------- County interactivity ---------- */
function onEachCountyFeature(feature, layer) {
    layer.on('click', () => {
        selectedCounty = layer;
        isFocused = false; // reset focus whenever user changes county

        const name = feature.properties.NAME || 'Unknown';
        let stateCode = '';
        if (feature.properties.STATE) {
            const code = feature.properties.STATE.toString().padStart(2, '0');
            stateCode = fipsToState[code] || code;
        }

        updateCountyLabel(`Selected: ${name}${stateCode ? ', ' + stateCode : ''}`);
        showToast(`Selected: ${name}${stateCode ? ', ' + stateCode : ''}`);
        // console.log(`[COUNTY DEBUG] Selected: ${name}`);

        countyLayer.eachLayer((l) => {
            if (l === layer) l.setStyle(highlightCountyStyle);
            else l.setStyle(defaultCountyStyle);
        });
    });
}

/* ---------- Fetch and display GEE layer when focused ---------- */
async function handleCountySelectionForGEE(feature) {
    try {
        await loadGEEClippedLayer(feature.geometry);
        const url = getGEEUrl();
        if (!url) {
            console.warn('[GEE WARN] No URL returned.');
            showToast('No forest layer available.');
            return;
        }

        // Remove old layer if any
        if (forestLayer) {
            try { map.removeLayer(forestLayer); } catch {}
            forestLayer = null;
        }

        forestLayer = L.tileLayer(url, {
            attribution: 'Google Earth Engine — County forest cover',
            opacity: 0.6,
        });

        forestLayer.on('tileload', e => console.log(`[FOREST DEBUG] Loaded: ${e.tile.src}`));

        const forestCheckbox = document.getElementById('toggle-forest');
        if (isFocused && forestCheckbox && forestCheckbox.checked) {
            forestLayer.addTo(map);
            showToast('Forest cover loaded for focused county.');
        } else {
            console.log('[GEE DEBUG] Forest layer cached but not added (focus or toggle inactive).');
        }
    } catch (error) {
        console.error('[GEE ERROR] Failed to load forest layer:', error);
        showToast('Failed to load forest layer.');
    }
}

/* ---------- Buttons for focus/reset ---------- */
function setupButtons() {
    const focusBtn = document.getElementById('focus-on-county');
    const resetBtn = document.getElementById('reset-focus');

    if (focusBtn) {
        focusBtn.addEventListener('click', async () => {
            if (!selectedCounty) {
                alert('Please click a county first.');
                return;
            }

            const bounds = selectedCounty.getBounds();
            map.flyToBounds(bounds, { padding: [20, 20], duration: 0.8 });
            // console.log('[COUNTY DEBUG] Focused on selected county.');
            isFocused = true;

            countyLayer.eachLayer((l) => {
                if (l === selectedCounty) l.setStyle(highlightCountyStyle);
                else l.setStyle(dimCountyStyle);
            });

            // Only load forest data if toggle is ON
            const forestCheckbox = document.getElementById('toggle-forest');
            if (forestCheckbox && forestCheckbox.checked) {
                await handleCountySelectionForGEE(selectedCounty.feature);
            }
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            map.flyTo([37.8, -96], 4, { duration: 0.8 });
            selectedCounty = null;
            isFocused = false;

            countyLayer.eachLayer((l) => l.setStyle(defaultCountyStyle));
            updateCountyLabel('No county selected');
            showToast('Reset to default view.');

            if (forestLayer) {
                try { map.removeLayer(forestLayer); } catch {}
                forestLayer = null;
            }
        });
    }
}

/* ---------- Layer toggles ---------- */
function setupLayerToggles() {
    const countyCheckbox = document.getElementById('toggle-counties');
    if (countyCheckbox) {
        countyCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) countyLayer.addTo(map);
            else map.removeLayer(countyLayer);
        });
    }

    const forestCheckbox = document.getElementById('toggle-forest');
    if (forestCheckbox) {
        forestCheckbox.addEventListener('change', async (e) => {
            if (e.target.checked) {
                if (!selectedCounty) {
                    showToast('Select a county first.');
                    return;
                }
                if (!isFocused) {
                    showToast('Focus on the county first to load forest cover.');
                    return;
                }
                await handleCountySelectionForGEE(selectedCounty.feature);
            } else {
                if (forestLayer) {
                    try { map.removeLayer(forestLayer); } catch {}
                }
            }
        });
    }
}

/* ---------- Label ---------- */
function updateCountyLabel(text) {
    const container = document.getElementById('county_selected_text');
    if (container) container.textContent = text;
}

export default { init };
