/**
 * Map.js
 *
 * This module is responsible for rendering and managing the D3 choropleth map.
 * It consolidates all map, legend, and interaction logic from the original `main.js`.
 *
 * Responsibilities:
 * 1. Render the primary "data features" map or the secondary "NRI" map.
 * 2. Handle the map mode switcher UI to toggle between map types.
 * 3. Update the map legend based on the current map mode.
 * 4. Handle mouseover tooltips for counties.
 * 5. On-click, update the central application state with the selected FIPS code.
 */

import { appState, setState } from '../state.js';
// These functions will be provided by your DataManager service
import {
    getDataFeatures,
    getCountyTopoData,
    getNriData
} from '../services/DataManager.js';

// --- Module-level variables ---
const tooltip = d3.select("#tip");

/**
 * Initializes the Map module.
 * Sets up event listeners for UI controls and central state changes.
 */
function init() {
    // Listen for UI controls specific to the map
    d3.select("#map-mode").on("change", render);
    window.addEventListener("resize", render);

    // Listen for central state changes
    document.addEventListener('state:changed', (e) => {
        const { key, value } = e.detail;
        // When data is first loaded, perform the initial render.
        if (key === 'isDataLoaded' && value === true) {
            console.log('Map module detected data has loaded. Rendering map.');
            render();
        }
    });

    console.log('Map module initialized.');
}

/**
 * Main render function for the map.
 * Decides which map version to draw based on the dropdown selector.
 */
function render() {
    // Don't try to render if the core data isn't loaded yet.
    if (!appState.isDataLoaded) {
        return;
    }

    const mode = d3.select("#map-mode").property("value");
    updateLegend(mode);

    if (mode === "nri") {
        drawMapNRI();
    } else {
        drawMapDefault();
    }
}

/**
 * Draws the default map based on `data_features.csv`.
 * Consolidated from `drawMap()` in `main.js`.
 */
function drawMapDefault() {
    const svg = d3.select("#map");
    const W = svg.node().clientWidth;
    const H = svg.node().clientHeight;
    svg.selectAll("*").remove();

    const dataFeatures = getDataFeatures();
    const countiesTopo = getCountyTopoData();

    const proj = d3.geoAlbersUsa().fitSize([W, H], { type: "FeatureCollection", features: countiesTopo });
    const pathGen = d3.geoPath().projection(proj);

    const counts = d3.rollups(dataFeatures, vs => vs.length, d => String(d.FIPS).padStart(5, '0'));
    const countMap = new Map(counts);

    svg.selectAll("path")
        .data(countiesTopo)
        .join("path")
        .attr("d", pathGen)
        .attr("fill", d => countMap.has(String(d.id).padStart(5, '0')) ? "#3182bd" : "#eee")
        .attr("stroke", "#999")
        .attr("stroke-width", 1)
        .on("click", (e, d) => {
            const fips = String(d.id).padStart(5, "0");
            console.log(`Map clicked. Setting selected FIPS to: ${fips}`);
            // THIS IS THE KEY CHANGE: Update the central state.
            // Other modules (like Charts.js) will listen for this change.
            setState('selectedFips', fips);

            // Also update the static text display on the map itself
            d3.select("#selected-county-text").text(`Selected: FIPS ${fips}`);
        })
        .on("mouseover", (e, d) => {
            const fips = String(d.id).padStart(5, '0');
            const c = countMap.get(fips) || 0;
            tooltip.style("opacity", 0.9)
                .html(`<strong>FIPS ${fips}</strong><br>${c} record${c===1?"":"s"}`)
                .style("left", (e.pageX + 10) + "px")
                .style("top", (e.pageY - 28) + "px");
            d3.select(e.currentTarget).attr("stroke", "#000").attr("stroke-width", 2);
        })
        .on("mouseout", (e, d) => {
            tooltip.style("opacity", 0);
            d3.select(e.currentTarget).attr("stroke", "#999").attr("stroke-width", 1);
        });

    svg.append("text")
        .attr("id", "selected-county-text")
        .attr("x", W - 20).attr("y", 30)
        .attr("text-anchor", "end")
        .style("font-size", "16px").style("font-weight", "600")
        .text(appState.selectedFips ? `Selected: FIPS ${appState.selectedFips}` : "Select a county!");

    svg.append("text")
        .attr("x", W / 2).attr("y", 30)
        .attr("text-anchor", "middle").style("font-size", "1.2rem").style("font-weight", "600")
        .text("Counties of Importance (from data_features.csv)");
}

/**
 * Draws the National Risk Index (NRI) map.
 * Consolidated from `drawMapNRI()` in `main.js`.
 */
function drawMapNRI() {
    const svg = d3.select("#map");
    const W = svg.node().clientWidth;
    const H = svg.node().clientHeight;
    svg.selectAll("*").remove();
    
    const nriData = getNriData();
    const countiesTopo = getCountyTopoData();

    const proj = d3.geoAlbersUsa().fitSize([W, H], { type: "FeatureCollection", features: countiesTopo });
    const pathGen = d3.geoPath().projection(proj);

    const nriMap = new Map(nriData.map(r => [String(r.STCOFIPS).padStart(5, "0"), String(r.RISK_RATNG).toLowerCase()]));

    const ratings = ["very low", "relatively low", "relatively moderate", "moderate", "relatively high", "very high"];
    const colors = ["#ffffcc", "#ffeda0", "#feb24c", "#fd8d3c", "#f03b20", "#bd0026"];
    const colorRamp = d3.scaleOrdinal().domain(ratings).range(colors);

    svg.selectAll("path")
        .data(countiesTopo)
        .join("path")
        .attr("d", pathGen)
        .attr("fill", d => {
            const fips = String(d.id).padStart(5, '0');
            const rating = nriMap.get(fips);
            return rating ? colorRamp(rating) : "#eee";
        })
        .attr("stroke", "#999")
        .attr("stroke-width", 1)
        .on("mouseover", (e, d) => {
            const fips = String(d.id).padStart(5, '0');
            const rating = nriMap.get(fips) || "No data";
            tooltip.style("opacity", 0.9)
                .html(`<strong>FIPS ${fips}</strong><br>Risk: ${rating}`)
                .style("left", (e.pageX + 8) + "px")
                .style("top", (e.pageY - 28) + "px");
        })
        .on("mouseout", () => tooltip.style("opacity", 0));

    svg.append("text")
       .attr("x", W/2).attr("y", 28)
       .attr("text-anchor","middle").style("font-size","1.2rem").style("font-weight","600")
       .text("National Risk Index by County");
}

/**
 * Rebuilds the map legend based on the current map mode.
 * Consolidated from `updateLegend()` in `main.js`.
 * @param {string} mode - The current map mode ('nri' or 'default').
 */
function updateLegend(mode) {
    const lg = d3.select("#legend").html("");
    const titleCase = str => str.replace(/\b\w/g, c => c.toUpperCase());

    if (mode === "nri") {
        const ratings = ["very low", "relatively low", "relatively moderate", "moderate", "relatively high", "very high"];
        const colors = ["#ffffcc", "#ffeda0", "#feb24c", "#fd8d3c", "#f03b20", "#bd0026"];

        ratings.forEach((r, i) => {
            const item = lg.append("div").attr("class", "legend-item");
            item.append("div").attr("class", "legend-swatch").style("background", colors[i]);
            item.append("span").text(titleCase(r));
        });
    } else {
        const items = [
            { label: "County in data", color: "#3182bd" },
            { label: "Other county", color: "#eee" }
        ];
        items.forEach(d => {
            const item = lg.append("div").attr("class", "legend-item");
            item.append("div").attr("class", "legend-swatch").style("background", d.color);
            item.append("span").text(d.label);
        });
    }
}


// Export the module's public API.
export default {
    init
};
