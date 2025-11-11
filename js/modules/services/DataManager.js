/**
 * DataManager.js — Leaflet version (no D3)
 * ---------------------------------------------
 * Loads GeoJSON county/state boundaries and handles
 * backend interactions for wildfire simulation and GEE layers.
 */

import CONFIG from '../../config.js';
import { appState, setState } from '../state.js';
import { runWildfireSimulation, getGEEClippedLayer } from './ApiClient.js';
/**
 * Loads U.S. county/state boundaries as GeoJSON (from public CDN)
 */
async function loadAllData() {
    try {
        // const countiesUrl = CONFIG.COUNTY_GEOJSON_URL;
        // const response = await fetch(countiesUrl);
        const response = await fetch(CONFIG.COUNTY_GEOJSON_URL);
        const countiesGeo = await response.json();

        const allData = { countiesGeo };
        setState('allData', allData);
        setState('isDataLoaded', true);

        console.log('[INFO] DataManager: County GeoJSON loaded successfully.');
    } catch (error) {
        console.error('[ERROR] DataManager: Failed to load base data.', error);
    }
}

/**
 * Fetch wildfire simulation data from backend and store it in state.
 */
async function loadWildfireSimulation(params) {
    try {
        const response = await runWildfireSimulation(params);
        if (!response) {
            console.warn('[WARN] No wildfire simulation response received.');
            return;
        }

        setState('wildfireData', response);
        console.log('[INFO] Wildfire simulation data stored in state.');
    } catch (error) {
        console.error('[ERROR] DataManager: Failed to load wildfire simulation.', error);
    }
}

/**
 * Fetch a clipped GEE layer URL for a specific geometry.
 * The backend returns a tile URL that can be used directly
 * in Leaflet via L.tileLayer(url).
 * @param {Object} geometry - GeoJSON geometry
 */
async function loadGEEClippedLayer(geometry) {
    try {
        const url = await getGEEClippedLayer(geometry);
        if (!url) {
            console.warn('[WARN] No GEE URL received.');
            return;
        }

        setState('geeLayerUrl', url);
        console.log('[INFO] GEE layer URL stored in state:', url);
    } catch (error) {
        console.error('[ERROR] DataManager: Failed to load GEE layer.', error);
    }
}

/**
 * Getter utilities
 */
function getCountyGeoData() {
    return appState.allData?.countiesGeo || null;
}

function getWildfireData() {
    return appState.wildfireData || null;
}

function getGEEUrl() {
    return appState.geeLayerUrl || null;
}

export {
    loadAllData,
    loadWildfireSimulation,
    loadGEEClippedLayer,
    getCountyGeoData,
    getWildfireData,
    getGEEUrl,
};
