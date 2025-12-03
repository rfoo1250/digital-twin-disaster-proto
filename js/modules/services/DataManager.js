import CONFIG from '../../config.js';
import { appState, setState } from '../state.js';
import {
    runWildfireSimulation,
    getGEEClippedLayer,
    startForestExport,
    checkExportStatus
} from './ApiClient.js';
import { showToast } from '../../utils/toast.js';
// import { showLoader, hideLoader } from "../../utils/loader.js";

async function loadAllData() {
    try {
        const response = await fetch(CONFIG.COUNTY_GEOJSON_URL);
        const countiesGeo = await response.json();

        setState('allData', { countiesGeo });
        setState('isDataLoaded', true);

        console.log('[INFO] DataManager: County GeoJSON loaded successfully.');
    } catch (error) {
        console.error('[ERROR] DataManager: Failed to load base data.', error);
    }
}

async function loadWildfireSimulation({ countyKey, igniPointLat, igniPointLon }) {
    try {
        const response = await runWildfireSimulation(countyKey, igniPointLat, igniPointLon);
        if (!response) {
            console.warn('[WARN] No wildfire simulation response received.');
            return { success: false };
        }

        if (response.success && response.output_dir) {
            setState('wildfireOutputDir', response.output_dir);
            console.log(`[INFO] Wildfire simulation completed for ${countyKey}. Output directory: ${response.output_dir}`);

            return response;
        } else {
            console.warn('[WARN] Wildfire simulation returned an error:', response.message);
            showToast(`Wildfire simulation error.`, true); // errors only
            return { success: false };
        }

    } catch (error) {
        console.error('[ERROR] DataManager: Failed to load wildfire simulation.', error);
        showToast('Failed to run wildfire simulation.', true);
        return { success: false };
    }
}


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
 * ** Old one **
 * STEP 1: Starts the asynchronous GEE export task. - old one
 * Handles the FOREST-ONLY Dynamic World export task.
 *
 * This version exports only the forest-cover mask (label == 1),
 * kept for backward compatibility with earlier system behavior.
 *
 * @param {Object} geometry - GeoJSON geometry for clipping
 * @returns {Promise<void>}
 */
async function startForestCoverExport(geometry) {
    try {
        const countyName = getCurrrentCountyName();
        const stateAbbr = getCurrentStateAbbr();
        const countyKey = getCurrentCountyKey();
        if (!countyKey) {
            // need fixing
            throw new Error("County key is undefined. Cannot start export.");
        }
        // Optimistically set a pending state
        setState('currentForestCoverExportTask', { id: null, countyKey: countyKey, status: 'PENDING', localPath: null });

        const taskResponse = await startForestExport(geometry, countyName, stateAbbr);

        if (!taskResponse || !taskResponse.status) {
            throw new Error("Invalid response from start-export API.");
        }

        if (taskResponse.status === 'COMPLETED') {
            // CACHE HIT!
            console.log('[INFO] DataManager: Cache hit. File already exists at:', taskResponse.local_path);
            setState('currentForestCoverGeoJSON', taskResponse.local_path);
            setState('currentForestCoverExportTask', {
                id: null, // No GEE task ID needed
                countyKey: taskResponse.filename_key,
                status: 'COMPLETED',
                localPath: taskResponse.local_path
            });
            console.log("[INFO] Cached forest data loaded.", false);

        } else if (taskResponse.status === 'PROCESSING') {
            // CACHE MISS. Task is running.
            // This is where we link the GEE ID to our county key
            setState('currentForestCoverExportTask', {
                id: taskResponse.task_id, // <-- GEE's ID (e.g., P7NDW...)
                countyKey: taskResponse.filename_key, // <-- Our key (e.g., Maricopa_AZ)
                status: 'PROCESSING',
                localPath: null
            });
            console.log(`[INFO] DataManager: Forest export started. Task ID: ${taskResponse.task_id} for ${taskResponse.filename_key}`);
            // alert("Starting forest data export. This may take several minutes.");
        }

    } catch (error) {
        console.error('[ERROR] DataManager: Failed to start forest export.', error);
        setState('currentForestCoverExportTask', { id: null, countyKey: null, status: 'FAILED', localPath: null });
        // alert("Failed to start the export task. See console for details.");
    }
}

/**
 * ** Old one **
 * STEP 2: Checks the status of the ongoing export task (On-Demand).
 * Polls the status of the FOREST-ONLY export task.
 * This checks whether the forest mask GeoTIFF is done exporting.
 *
 * @returns {Promise<'NONE'|'PROCESSING'|'COMPLETED'|'FAILED'>}
 */
async function checkForestCoverExportStatus() {
    const task = appState.currentForestCoverExportTask;
    // TODO: should change this to current selected county
    // get countyKey, check if it matches, run

    if (!task || !task.status || task.status === 'NONE') {
        console.warn('[WARN] No export task is active. Cannot check status.');
        return 'NONE';
    }

    // If it's already done, just return
    if (task.status === 'COMPLETED') {
        return 'COMPLETED';
    }

    // If it's pending but has no GEE ID, it can't be checked
    if (task.status === 'PROCESSING' && !task.id) {
        console.error('[ERROR] Task is processing but has no GEE task ID to poll.');
        return 'FAILED';
    }

    console.log(`[INFO] DataManager: Checking status for task ${task.id} (${task.countyKey})`);

    try {
        const statusResponse = await checkExportStatus(task.id, task.countyKey); // Poll using GEE's ID

        if (!statusResponse) throw new Error("No response from status check API.");

        switch (statusResponse.status) {
            case 'COMPLETED':
                console.log('[INFO] DataManager: Export complete. Local path:', statusResponse.local_path);
                // Save the final file path
                setState('currentForestCoverGeoJSON', statusResponse.local_path);
                // Update the task state to COMPLETED
                setState('currentForestCoverExportTask', {
                    ...task,
                    status: 'COMPLETED',
                    localPath: statusResponse.local_path
                });
                return 'COMPLETED';

            case 'PROCESSING':
                console.log('[INFO] DataManager: Export is still processing.');
                setState('currentForestCoverExportTask', { ...task, status: 'PROCESSING' });
                return 'PROCESSING';

            case 'FAILED':
                console.error('[ERROR] DataManager: Forest export task failed:', statusResponse.error);
                setState('currentForestCoverExportTask', { ...task, status: 'FAILED' });
                return 'FAILED';

            default:
                console.warn('[WARN] DataManager: Unknown task status:', statusResponse.status);
                return 'UNKNOWN';
        }

    } catch (error) {
        console.error('[ERROR] DataManager: Failed to check export status.', error);
        setState('currentForestCoverExportTask', { ...task, status: 'FAILED' });
        return 'FAILED';
    }
}

/**
 * Starts the FULL Dynamic World export (all 10 bands).
 *
 * This version exports:
 *   - 9 probability bands
 *   - 1 label band
 *
 * It uses the *same backend endpoint* (startForestExport),
 * but the backend must now return the multi-band TIFF.
 *
 * @param {Object} geometry - GeoJSON geometry for clipping
 * @returns {Promise<void>}
 */
async function startDynamicWorldAllBandsExport(geometry) {
    try {
        const countyName = getCurrrentCountyName();
        const stateAbbr = getCurrentStateAbbr();
        const countyKey = getCurrentCountyKey();
        if (!countyKey) throw new Error("County key missing.");

        // Mark Dynamic World all-bands export as pending
        setState('currentDynamicWorldAllBandsTask', {
            id: null,
            countyKey,
            status: 'PENDING',
            localPath: null
        });

        // Reuse same backend endpoint — now producing full DW TIFF
        const taskResponse = await startForestExport(geometry, countyName, stateAbbr);

        if (!taskResponse || !taskResponse.status)
            throw new Error("Invalid export response.");

        // Completed immediately (cached)
        if (taskResponse.status === 'COMPLETED') {
            setState('currentDynamicWorldAllBandsPath', taskResponse.local_path);
            setState('currentDynamicWorldAllBandsTask', {
                id: null,
                countyKey: taskResponse.filename_key,
                status: 'COMPLETED',
                localPath: taskResponse.local_path
            });
        }

        // Export task running on GEE
        else if (taskResponse.status === 'PROCESSING') {
            setState('currentDynamicWorldAllBandsTask', {
                id: taskResponse.task_id,
                countyKey: taskResponse.filename_key,
                status: 'PROCESSING',
                localPath: null
            });
        }

    } catch (err) {
        console.error('[ERROR] DW all-bands export failed', err);

        // Mark failure
        setState('currentDynamicWorldAllBandsTask', { status: 'FAILED' });
    }
}

/**
 * Polls the status of the all-bands Dynamic World export task.
 *
 * @returns {Promise<'NONE'|'PROCESSING'|'COMPLETED'|'FAILED'>}
 */
async function checkDynamicWorldAllBandsStatus() {
    const task = appState.currentDynamicWorldAllBandsTask;

    if (!task || task.status === 'NONE') return 'NONE';
    if (task.status === 'COMPLETED') return 'COMPLETED';

    try {
        // Poll backend for completion / failure
        const r = await checkExportStatus(task.id, task.countyKey);

        if (r.status === 'COMPLETED') {
            // Save file path
            setState('currentDynamicWorldAllBandsPath', r.local_path);
            setState('currentDynamicWorldAllBandsTask', {
                ...task,
                status: 'COMPLETED',
                localPath: r.local_path
            });
        } else {
            // Still processing (or failed)
            setState('currentDynamicWorldAllBandsTask', { ...task, status: r.status });
        }

        return r.status;

    } catch (err) {
        console.error('[ERROR] DW all-bands status check failed', err);
        return 'FAILED';
    }
}


function setCurrentCountyNameAndStateAbbr(countyName, stateAbbr) {
    setState('currentCountyName', countyName);
    setState('currentStateAbbr', stateAbbr);
}

function getCurrrentCountyName() {
    return appState.currentCountyName || null;
}

function getCurrentStateAbbr() {
    return appState.currentStateAbbr || null;
}

function getCurrentCountyKey() {
    if (!getCurrrentCountyName() || !getCurrentStateAbbr()) return null;
    return `${getCurrrentCountyName()}_${getCurrentStateAbbr()}`;
}

function getCountyGeoData() {
    return appState.allData?.countiesGeo || null;
}

function getWildfireData() {
    return appState.wildfireData || null;
}

function getGEEUrl() {
    return appState.geeLayerUrl || null;
}

function getCurrentForestCoverGeoJSON() {
    return appState.currentForestCoverGeoJSON || null;
}

function getForestCoverExportStatus() {
    return appState.currentForestCoverExportTask || { id: null, status: 'NONE', localPath: null };
}

function getCurrentDynamicWorldAllBandsPath() {
    return appState.currentDynamicWorldAllBandsPath || null;
}

function getDynamicWorldAllBandsExportStatus() {
    return appState.currentDynamicWorldAllBandsTask || { status: 'NONE' };
}


export {
    // forest
    startForestCoverExport,
    checkForestCoverExportStatus,
    getCurrentForestCoverGeoJSON,
    getForestCoverExportStatus,

    // all-bands
    startDynamicWorldAllBandsExport,
    checkDynamicWorldAllBandsStatus,
    getCurrentDynamicWorldAllBandsPath,
    getDynamicWorldAllBandsExportStatus,

    // existing functions
    loadAllData,
    loadGEEClippedLayer,
    getCurrentCountyKey,
    getCurrrentCountyName,
    getCurrentStateAbbr,
    setCurrentCountyNameAndStateAbbr,
    getGEEUrl,
    getCountyGeoData,
    getWildfireData,
    loadWildfireSimulation
};
