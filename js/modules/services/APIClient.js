// Name: js/modules/services/ApiClient.js

const API_URL = 'http://127.0.0.1:5000/simulate';

async function runSimulation(payload) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('API Client Error:', error);
        alert("Error computing counterfactual. See console for details.");
        return null;
    }
}

export { runSimulation };