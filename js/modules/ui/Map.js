// Updated Map.js - Fixed redrawing issues
import * as turf from '@turf/turf';
import parseGeoraster from 'georaster';
import GeoRasterLayer from 'georaster-layer-for-leaflet';

import CONFIG from '../../config.js';
import {
    getCountyGeoData,
    loadWildfireSimulation,
    loadGEEClippedLayer,
    getGEEUrl,
    startForestDataExport,
    checkForestDataStatus,
    getCurrentGEEForestGeoJSON,
    setCurrentCountyNameAndStateAbbr,
    getCurrentCountyKey
} from '../services/DataManager.js';
import { fipsToState } from '../../utils/constants.js';
import { showToast } from '../../utils/toast.js';

let isFocused = false;
let geotiffLoaded = false;
let isSettingIgnitionPoint = false;
let map, countyLayer, forestLayer;
let selectedCounty = null;
let ignitionMarker = null;
let geoRaster = null;
let onMapClickHandler = null;

function init() {
    console.log('[INFO] Initializing Leaflet map...');

    map = L.map('map').setView(CONFIG.MAP_DEFAULT_CENTER, CONFIG.MAP_DEFAULT_ZOOM);

    // Create custom panes for controlled layer ordering
    map.createPane('tilePane');     // default base tile pane
    map.createPane('forestPane');   // GeoTIFF raster layer pane
    map.createPane('wildfireSimPane'); // wildfire simulation layer pane
    map.createPane('overlayPane');  // vector polygons (default)
    map.createPane('markerPane');   // markers on top

    // Set z-index order (lower = below)
    map.getPane('tilePane').style.zIndex = 200;
    map.getPane('forestPane').style.zIndex = 300;
    map.getPane('wildfireSimPane').style.zIndex = 400;
    map.getPane('overlayPane').style.zIndex = 500;
    map.getPane('markerPane').style.zIndex = 600;

    L.tileLayer(CONFIG.TILE_LAYER_URL, {
        attribution: CONFIG.TILE_LAYER_ATTRIBUTION,
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

const defaultCountyStyle = { color: '#333', weight: 1, opacity: 0.6, fillOpacity: 0 };
const highlightCountyStyle = { color: '#111', weight: 3, opacity: 0.95, fillOpacity: 0.08 };
const dimCountyStyle = { color: '#999', weight: 0.5, opacity: 0.2, fillOpacity: 0 };

function onEachCountyFeature(feature, layer) {
    layer.on('click', () => {
        selectedCounty = layer;
        isFocused = false;

        const name = feature.properties.NAME || 'Unknown';
        let stateCode = '';
        if (feature.properties.STATE) {
            const code = feature.properties.STATE.toString().padStart(2, '0');
            stateCode = fipsToState[code] || code;
        }

        updateCountyLabel(`Selected: ${name}${stateCode ? ', ' + stateCode : ''}`);

        countyLayer.eachLayer((l) => {
            if (l === layer) l.setStyle(highlightCountyStyle);
            else l.setStyle(defaultCountyStyle);
        });

        updateButtonStates();
    });
}


async function handleCountySelectionForGEE(feature) {
    try {
        const countyName = feature.properties.NAME || 'Unknown';
        let stateAbbr = '';
        if (feature.properties.STATE) {
            const fipsCode = feature.properties.STATE.toString().padStart(2, '0');
            stateAbbr = fipsToState[fipsCode] || fipsCode;
        }

        if (countyName === 'Unknown' || !stateAbbr) {
            showToast('Cannot identify selected county. Please try again.', true);
            return;
        }

        console.log(`[INFO] Initiating forest layer load for: ${countyName}, ${stateAbbr}`);
        setCurrentCountyNameAndStateAbbr(countyName, stateAbbr);

        const countyKey = getCurrentCountyKey();
        const geotiffUrl = `${CONFIG.API_BASE_URL}${CONFIG.GEOTIFF_URL}ForestCover_${countyKey}_2024.tif`;
        console.log(`[INFO] Checking for local GeoTIFF at: ${geotiffUrl}`);
        // Try to load local GeoTIFF first
        // TODO: handle geotiffLoaded flags
        try {
            const headResponse = await fetch(geotiffUrl, { method: 'HEAD' });
            if (headResponse.ok) {
                console.log(`[INFO] Found local GeoTIFF for ${countyKey}: ${geotiffUrl}`);
                const response = await fetch(geotiffUrl);
                if (!response.ok) {
                    throw new Error(`GeoTIFF not found: ${response.statusText}`);
                }
                const contentType = response.headers.get('content-type');
                if (!contentType.includes('tiff')) {
                    console.warn('[WARN] Response is not a TIFF file:', contentType);
                    const text = await response.text();
                    console.log('Response preview:', text.slice(0, 200));
                }
                const arrayBuffer = await response.arrayBuffer();
                geoRaster = await parseGeoraster(arrayBuffer);

                // Remove old layer if present
                if (forestLayer) {
                    try { map.removeLayer(forestLayer); } catch {}
                }

                // Create a mask polygon from the current county geometry
                const countyMask = L.geoJSON(feature.geometry, {
                    style: { color: '#00FF00', weight: 2, opacity: 0.6, fillOpacity: 0 }
                });

                // Create the GeoTIFF layer clipped to county boundary
                forestLayer = new GeoRasterLayer({
                    georaster: geoRaster,
                    pane: 'forestPane', // draw below county borders
                    opacity: 1.0,
                    resolution: 128,
                    pixelValuesToColorFn: function(values) {
                        const val = values[0];
                        if (val === 1) return 'rgba(0, 150, 0, 0.9)'; // forest = green
                        return 'rgba(0, 0, 0, 0)'; // transparent
                    },
                    mask: feature.geometry
                }).addTo(map);

                // Re-apply border styling to ensure black outline stays on top
                countyLayer.eachLayer((l) => {
                    if (l === selectedCounty) {
                        l.bringToFront();
                        l.setStyle(highlightCountyStyle); // Black bold border
                    } else {
                        l.setStyle(dimCountyStyle);
                    }
                });

                // forestLayer.addTo(map);
                // countyMask.addTo(map);
                
                // Ensure proper layer ordering after adding forest layer
                if (countyLayer) {
                    countyLayer.bringToFront();
                }
                
                showToast('Forest GeoTIFF loaded successfully.');
                geotiffLoaded = true;
            } else {
                console.warn(`[WARN] No local GeoTIFF found for ${countyKey}, falling back to GEE.`);
            }
        } catch (err) {
            console.warn(`[WARN] Error loading local GeoTIFF for ${countyKey}:`, err);
        }

        // If GeoTIFF not found, fallback to GEE Tile URL
        if (!geotiffLoaded) {
            await Promise.all([
                loadGEEClippedLayer(feature.geometry),
                startForestDataExport(feature.geometry)
            ]);

            const tileUrl = getGEEUrl();
            if (tileUrl) {
                console.log(`[INFO] Using GEE tile URL for ${countyKey}: ${tileUrl}`);
                const tileLayer = L.tileLayer(tileUrl, {
                    opacity: CONFIG.DEFAULT_FOREST_OPACITY,
                    attribution: 'GEE Forest Cover'
                });

                if (forestLayer) {
                    try { map.removeLayer(forestLayer); } catch {}
                }

                forestLayer = tileLayer.addTo(map);
                showToast('Loaded GEE forest layer (fallback).');
            } else {
                console.warn('[WARN] No valid GEE URL returned.');
                showToast('Failed to load any forest layer.', true);
            }
        }
    } catch (error) {
        console.error('[GEE ERROR] Failed to load forest layer:', error);
        showToast('Failed to load forest layer.', true);
    }
}

function setupButtons() {
    const focusBtn = document.getElementById('focus-on-county');
    const resetBtn = document.getElementById('reset-focus');
    const setIgnitionPointBtn = document.getElementById('set-ignition-point');
    const startWildfireSimBtn = document.getElementById('start-wildfire-sim');
    const removeIgnitionPointBtn = document.getElementById('remove-ignition-point');

    if (focusBtn) {
        focusBtn.addEventListener('click', async () => {
            if (!selectedCounty) {
                showToast('Please click a county first.', true);
                return;
            }

            const bounds = selectedCounty.getBounds();
            map.flyToBounds(bounds, {
                padding: CONFIG.MAP_COUNTY_PADDING,
                duration: CONFIG.MAP_FLY_DURATION
            });

            countyLayer.eachLayer((l) => {
                if (l === selectedCounty) l.setStyle(highlightCountyStyle);
                else l.setStyle(dimCountyStyle);
            });

            const forestCheckbox = document.getElementById('toggle-forest');
            if (forestCheckbox && forestCheckbox.checked) {
                await handleCountySelectionForGEE(selectedCounty.feature);
            }

            isFocused = true;
            updateButtonStates();
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            map.flyTo(CONFIG.MAP_DEFAULT_CENTER, CONFIG.MAP_DEFAULT_ZOOM, {
                duration: CONFIG.MAP_FLY_DURATION
            });

            selectedCounty = null;
            isFocused = false;
            updateButtonStates();

            countyLayer.eachLayer((l) => l.setStyle(defaultCountyStyle));
            updateCountyLabel('No county selected');
            showToast('Reset to default view.');

            // Remove all layers except tile and overlay panes
            map.eachLayer((layer) => {
                const paneName = layer.options?.pane;
                if (paneName !== 'tilePane' && paneName !== 'overlayPane') {
                    map.removeLayer(layer);
                }
            });

            // Reset stored data
            forestLayer = null;
            ignitionMarker = null;
            geoRaster = null;
            geotiffLoaded = false;
            map.wildfireSimLayer = null;
            localStorage.removeItem('ignitionPoint');
        });
    }

    if (setIgnitionPointBtn) {
        setIgnitionPointBtn.addEventListener('click', () => {
            if (!isFocused) {
                showToast('Focus on a county first.', true);
                return;
            }

            if (!isSettingIgnitionPoint) {
                isSettingIgnitionPoint = true;
                setIgnitionPointBtn.textContent = 'Cancel set point of ignition';
                showToast('Click on a forest pixel within the selected county.');

                onMapClickHandler = async (e) => {
                    if (!isSettingIgnitionPoint) return;

                    const { lat, lng } = e.latlng;
                    const point = turf.point([lng, lat]);
                    const inside = turf.booleanPointInPolygon(point, selectedCounty.feature);

                    if (!inside) {
                        showToast('Please click inside the focused county.', true);
                        return; // keep looping
                    }

                    if (!geoRaster) {
                        showToast('Forest GeoTIFF not loaded yet.', true);
                        return;
                    }

                    try {
                        const x = Math.floor((lng - geoRaster.xmin) / geoRaster.pixelWidth);
                        const y = Math.floor((geoRaster.ymax - lat) / Math.abs(geoRaster.pixelHeight));

                        if (y >= 0 && y < geoRaster.height && x >= 0 && x < geoRaster.width) {
                            const forestVal = geoRaster.values[0][y][x];

                            if (forestVal === 1) {
                                if (ignitionMarker) map.removeLayer(ignitionMarker);
                                ignitionMarker = L.marker([lat, lng], { pane: 'markerPane' }).addTo(map);

                                localStorage.setItem('ignitionPoint', JSON.stringify({ lat, lng }));
                                showToast(`Ignition point set at (${lat.toFixed(5)}, ${lng.toFixed(5)}).`);

                                document.getElementById('start-wildfire-sim').disabled = false;

                                isSettingIgnitionPoint = false;
                                setIgnitionPointBtn.textContent = 'Set point of ignition';
                                map.off('click', onMapClickHandler);
                            } else {
                                showToast('That point is not on a forest pixel. Try again.', true);
                            }
                        } else {
                            showToast('Clicked point outside GeoTIFF bounds. Try again.', true);
                        }
                    } catch (err) {
                        console.error('[IGNITION ERROR] Failed to read pixel value:', err);
                        showToast('Error reading GeoTIFF pixel value.', true);
                    }
                };

                map.on('click', onMapClickHandler);
            } else {
                isSettingIgnitionPoint = false;
                setIgnitionPointBtn.textContent = 'Set point of ignition';
                showToast('Cancelled ignition point selection.');
                if (onMapClickHandler) map.off('click', onMapClickHandler);
            }
        });
    }

    if (removeIgnitionPointBtn) {
        removeIgnitionPointBtn.addEventListener('click', () => {
            if (ignitionMarker) {
                map.removeLayer(ignitionMarker);
                ignitionMarker = null;
                localStorage.removeItem('ignitionPoint');
                showToast('Ignition point removed.');

                // Disable wildfire sim since no ignition exists
                const startWildfireSimBtn = document.getElementById('start-wildfire-sim');
                if (startWildfireSimBtn) startWildfireSimBtn.disabled = true;
            } else {
                showToast('No ignition point to remove.', true);
            }
        });
    }

    if (startWildfireSimBtn) {
        startWildfireSimBtn.addEventListener('click', async () => {
            if (startWildfireSimBtn.disabled) return;

            // If frames already loaded and animation stopped, just replay
            if (map.wildfireFrames && map.wildfireFrames.length > 0 && !map.wildfireAnimTimer) {
                startWildfireAnimation();
                return;
            }

            if (!selectedCounty) {
                showToast('Please select a county first.', true);
                return;
            }

            if (!geotiffLoaded && !forestLayer) {
                showToast('Forest data not loaded yet. Enable the forest layer first.', true);
                return;
            }

            const ignition = JSON.parse(localStorage.getItem('ignitionPoint'));
            if (!ignition || !ignition.lat || !ignition.lng) {
                showToast('Please set an ignition point before running the simulation.', true);
                return;
            }

            const countyKey = getCurrentCountyKey();
            if (!countyKey) {
                showToast('Missing county key. Please select a valid county.', true);
                return;
            }

            showToast('Running wildfire simulation...');
            console.log(`[INFO] Starting wildfire simulation for ${countyKey}`);

            try {
                // const response = await loadWildfireSimulation({
                //     countyKey,
                //     igniPointLat: ignition.lat,
                //     igniPointLon: ignition.lng
                // });

                const response = {
                    success: true,
                    output_dir: `wildfire_output/sim_run_Door_WI_20251121_150709`
                };

                if (response && response.success && response.output_dir) {
                    const outputDir = response.output_dir;
                    const baseUrl = `${CONFIG.API_BASE_URL}/${outputDir}`;
                    
                    console.log('[INFO] Preloading wildfire frames...');
                    showToast('Loading wildfire simulation frames...');

                    // Clean up any previous wildfire animation
                    if (map.wildfireAnimTimer) {
                        clearInterval(map.wildfireAnimTimer);
                        map.wildfireAnimTimer = null;
                    }
                    if (map.wildfireFrames) {
                        map.wildfireFrames.forEach((layer) => {
                            try { map.removeLayer(layer); } catch {}
                        });
                    }
                    map.wildfireFrames = [];

                    // Preload all frames as GeoRasterLayers
                    let timestep = 0;
                    const maxTimesteps = 100; // Safety limit
                    
                    while (timestep < maxTimesteps) {
                        const rasterUrl = `${baseUrl}/wildfire_t_${timestep.toString().padStart(3, '0')}.tif`;
                        
                        try {
                            const headResp = await fetch(rasterUrl, { method: 'HEAD' });
                            if (!headResp.ok) {
                                console.log(`[INFO] Found ${timestep} wildfire frames`);
                                break;
                            }

                            const resp = await fetch(rasterUrl);
                            const arrayBuffer = await resp.arrayBuffer();
                            const simGeoRaster = await parseGeoraster(arrayBuffer);

                            const frameLayer = new GeoRasterLayer({
                                georaster: simGeoRaster,
                                pane: 'wildfireSimPane',
                                opacity: 0, // All frames start hidden
                                resolution: 256,
                                pixelValuesToColorFn: function(values) {
                                    const val = values[0];
                                    switch (val) {
                                        case 1: return 'rgba(0,0,0,0)';
                                        case 2: return 'rgba(255,165,0,0.9)';
                                        case 3: return 'rgba(255,0,0,0.9)';
                                        default: return 'rgba(0,0,0,0)';
                                    }
                                },
                                mask: selectedCounty.feature.geometry
                            });

                            frameLayer.addTo(map);
                            map.wildfireFrames.push(frameLayer);
                            
                            console.log(`[INFO] Loaded frame ${timestep}`);
                            timestep++;
                        } catch (err) {
                            console.error(`[ERROR] Failed to load frame ${timestep}:`, err);
                            break;
                        }
                    }

                    if (map.wildfireFrames.length === 0) {
                        showToast('No wildfire frames found.', true);
                        return;
                    }

                    // Ensure proper layer ordering
                    if (forestLayer && map.hasLayer(forestLayer)) {
                        forestLayer.bringToFront();
                    }
                    if (countyLayer) {
                        countyLayer.bringToFront();
                    }

                    showToast(`Loaded ${map.wildfireFrames.length} frames. Starting animation...`);
                    
                    // Start the animation
                    startWildfireAnimation();
                }
            } catch (err) {
                console.error('[SIMULATION ERROR]', err);
                showToast('Wildfire simulation failed. Check console for details.', true);
            }

        });
    }

    // Separate function to start/restart animation
    function startWildfireAnimation() {
        if (!map.wildfireFrames || map.wildfireFrames.length === 0) {
            console.warn('[WARN] No wildfire frames to animate');
            return;
        }

        // Stop any existing animation
        if (map.wildfireAnimTimer) {
            clearInterval(map.wildfireAnimTimer);
        }

        // Hide all frames first
        map.wildfireFrames.forEach(frame => frame.setOpacity(0));

        console.log(`[INFO] Starting animation with ${map.wildfireFrames.length} frames`);
        showToast('Playing wildfire animation...');

        let currentFrame = 0;
        
        // Show first frame immediately
        map.wildfireFrames[0].setOpacity(0.95);

        map.wildfireAnimTimer = setInterval(() => {
            // Move to next frame
            currentFrame++;
            
            // Check if we've finished the loop
            if (currentFrame >= map.wildfireFrames.length) {
                clearInterval(map.wildfireAnimTimer);
                map.wildfireAnimTimer = null;
                console.log('[INFO] Animation complete - displaying final frame');
                showToast('Wildfire simulation complete. Click button to replay.');
                
                // Update button text to indicate replay option
                const btn = document.getElementById('start-wildfire-sim');
                if (btn) {
                    btn.textContent = 'Replay wildfire simulation';
                }
                return;
            }
            
            // Hide previous frame
            if (currentFrame > 0) {
                map.wildfireFrames[currentFrame - 1].setOpacity(0);
            }
            
            // Show next frame
            map.wildfireFrames[currentFrame].setOpacity(0.95);
            console.log(`[INFO] Displaying frame ${currentFrame}`);
        }, 500); // 0.5 seconds per frame
    }

    updateButtonStates();
}

function updateButtonStates() {
    const setIgnitionPointBtn = document.getElementById('set-ignition-point');
    const startWildfireSimBtn = document.getElementById('start-wildfire-sim');

    const ignitionPoint = localStorage.getItem('ignitionPoint');
    const disabled = !isFocused;

    // Only disable the ignition button if not focused and no ignition point set
    if (setIgnitionPointBtn) {
        setIgnitionPointBtn.disabled = !isFocused && !ignitionPoint;
    }

    if (startWildfireSimBtn) {
        startWildfireSimBtn.disabled = !ignitionPoint;
    }
}


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
                    showToast('Select a county first.', true);
                    return;
                }
                if (!isFocused) {
                    showToast('Focus on the county first to load forest cover.', true);
                    return;
                }
                await handleCountySelectionForGEE(selectedCounty.feature);
            } else if (forestLayer) {
                try { map.removeLayer(forestLayer); } catch { }
            }
        });
    }

    const wildfireCheckbox = document.getElementById('toggle-wildfire');
    if (wildfireCheckbox) {
        wildfireCheckbox.addEventListener('change', (e) => {
            if (!map.wildfireFrames) return;
            map.wildfireFrames.forEach(frame => {
                if (e.target.checked) frame.addTo(map);
                else map.removeLayer(frame);
            });
        });
    }
}

function updateCountyLabel(text) {
    const container = document.getElementById('county_selected_text');
    if (!container) return;

    container.textContent = text;
    container.classList.add('label-flash');

    setTimeout(() => {
        container.classList.remove('label-flash');
    }, CONFIG.COUNTY_LABEL_FLASH_DURATION);
}

export default { init };