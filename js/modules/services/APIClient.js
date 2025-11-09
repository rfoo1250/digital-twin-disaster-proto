/**
 * APIClient.js
 * ---------------------------------------------
 * Handles communication between the frontend and backend Flask API
 * for the Wildfire Simulation and GEE operations.
 */

const LOCAL_API_BASE_URL = 'http://127.0.0.1:5000';

/**
 * Run wildfire simulation.
 * Sends ignition coordinates to the backend and returns simulation results.
 * @param {{ lat: number, lng: number }} params - Ignition point coordinates
 * @returns {Promise<Object|null>} - Parsed wildfire simulation response
 */
async function runWildfireSimulation(params) {
    try {
        const response = await fetch(`${LOCAL_API_BASE_URL}/api/simulate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('[API Error] Wildfire Simulation:', error);
        alert('Error running wildfire simulation. See console for details.');
        return null;
    }
}

/**
 * Get a dynamic GEE layer URL.
 * Sends a GeoJSON geometry to the backend, which returns
 * a clipped Google Earth Engine tile URL.
 * @param {Object} geometry - GeoJSON geometry object
 * @returns {Promise<string|null>} - Tile URL string
 */
async function getGEEClippedLayer(geometry) {
    try {
        const response = await fetch(`${LOCAL_API_BASE_URL}/api/get_layer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ geometry }),
        });

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const data = await response.json();
        if (data.url) {
            console.log('[INFO] GEE tile URL retrieved:', data.url);
            return data.url;
        } else {
            console.warn('[WARN] No "url" field returned from backend.');
            return null;
        }
    } catch (error) {
        console.error('[API Error] GEE Layer Fetch:', error);
        alert('Error fetching GEE layer. Check console for details.');
        return null;
    }
}

export { runWildfireSimulation, getGEEClippedLayer };
