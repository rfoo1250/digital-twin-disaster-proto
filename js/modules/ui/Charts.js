/**
 * Charts.js
 *
 * This module is responsible for rendering all D3-based charts, including
 * the various bar charts and the lollipop chart that appear in the side panel.
 * It consolidates all chart-drawing functions from the original `main.js`.
 *
 * Responsibilities:
 * 1. Listen for FIPS selection changes from the central state.
 * 2. Listen for clicks on the chart-switcher buttons (Instance, Group, Source).
 * 3. Render the appropriate chart based on the current state.
 * 4. Manage the UI for the lollipop chart's severity dropdown.
 */

import { appState } from '../state.js';
import {
    getInstanceNecessityData,
    getGroupNecessityData,
    getSourceNecessityData,
    getRecourseData,
    getFipsToInstanceMap
} from '../services/DataManager.js';

// --- Module State ---
let activeChartType = 'instance'; // Default chart to show
const tooltip = d3.select("#tip"); // Shared tooltip element

/**
 * Initializes the Charts module. Sets up event listeners for UI controls.
 */
function init() {
    // Listen for UI button clicks to switch chart types
    document.getElementById('feature-btn')?.addEventListener('click', () => switchChartType('instance'));
    document.getElementById('group-btn')?.addEventListener('click', () => switchChartType('group'));
    document.getElementById('source-btn')?.addEventListener('click', () => switchChartType('source'));

    // Listen for central state changes
    document.addEventListener('state:changed', (e) => {
        const { key, value } = e.detail;
        // When a new county is selected, re-render the currently active chart
        if ((key === 'selectedFips' || key === 'isDataLoaded') && appState.selectedFips && appState.isDataLoaded) {
            render();
        }
    });

    console.log('Charts module initialized.');
}

/**
 * Switches the active chart type and re-renders.
 * @param {string} type - The new chart type ('instance', 'group', or 'source').
 */
function switchChartType(type) {
    activeChartType = type;
    if (appState.selectedFips) {
        render();
    } else {
        alert("Please select a county on the map first.");
    }
}

/**
 * Main render function. Decides which chart to draw based on module state.
 */
function render() {
    if (!appState.selectedFips) return;

    const fips = appState.selectedFips;
    const chartContainer = d3.select("#bar");

    // Clear previous chart
    chartContainer.html("");

    switch (activeChartType) {
        case 'instance':
            drawEnrichedInstanceBar(chartContainer, fips);
            break;
        case 'group':
            drawEnrichedGroupBar(chartContainer, fips);
            break;
        case 'source':
            drawEnrichedSourceBar(chartContainer, fips);
            break;
        default:
            console.warn(`Unknown chart type: ${activeChartType}`);
    }
    
    // Always attempt to draw the lollipop chart in its own container
    drawLollipopChart(d3.select("#chart"), fips);
}


// --- Chart Drawing Functions (Consolidated from main.js) ---

/**
 * Draws the "Top 15 Features" bar chart for a given FIPS.
 * @param {d3.Selection} svg - The d3 selection of the SVG element to draw in.
 * @param {string} fips - The selected FIPS code.
 */
function drawEnrichedInstanceBar(svg, fips) {
    const W = svg.node().clientWidth, H = svg.node().clientHeight;
    const margin = { top: 40, right: 20, bottom: 60, left: 180 };
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;

    const data = getInstanceNecessityData(); // Assumes DataManager provides this
    const row = data.find(r => String(r.FIPS).padStart(5, "0") === fips);

    if (!row) {
        svg.append("text").attr("x", W/2).attr("y", H/2).attr("text-anchor","middle").style("fill","darkred").text(`No instance data for FIPS ${fips}`);
        return;
    }

    const feats = Object.keys(row)
        .filter(k => k !== 'FIPS')
        .map(k => ({ feature: k, value: +row[k] }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 15);

    const x = d3.scaleLinear().domain([0, d3.max(feats, d => d.value) || 1]).range([margin.left, margin.left + innerW]);
    const y = d3.scaleBand().domain(feats.map(d => d.feature)).range([margin.top, margin.top + innerH]).padding(0.1);

    svg.append("g").attr("transform", `translate(0,${margin.top+innerH})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".2f")));
    svg.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y));

    svg.append("text").attr("x", W/2).attr("y", margin.top/2).attr("text-anchor","middle").style("font-weight",600).text(`Top 15 Features for FIPS ${fips}`);
    
    svg.selectAll("rect").data(feats).join("rect")
        .attr("x", margin.left)
        .attr("y", d => y(d.feature))
        .attr("width", d => x(d.value) - margin.left)
        .attr("height", y.bandwidth())
        .attr("fill", "#3182bd");
}

/**
 * Draws the "Feature-Group Scores" bar chart.
 * @param {d3.Selection} svg - The d3 selection to draw in.
 * @param {string} fips - The selected FIPS code.
 */
function drawEnrichedGroupBar(svg, fips) {
    const W = svg.node().clientWidth, H = svg.node().clientHeight;
    const margin = { top: 40, right: 20, bottom: 60, left: 210 };
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;

    const data = getGroupNecessityData();
    const row = data.find(r => String(r.FIPS).padStart(5, "0") === fips);

    if (!row) {
        svg.append("text").attr("x", W/2).attr("y", H/2).attr("text-anchor","middle").style("fill","darkred").text(`No group data for FIPS ${fips}`);
        return;
    }

    const groups = Object.keys(row).filter(k => k !== 'FIPS').map(k => ({ feature: k, value: +row[k] }));
    
    const x = d3.scaleLinear().domain([0, d3.max(groups, d => d.value) || 1]).range([margin.left, margin.left + innerW]);
    const y = d3.scaleBand().domain(groups.map(d => d.feature)).range([margin.top, margin.top + innerH]).padding(0.2);

    svg.append("g").attr("transform", `translate(0,${margin.top+innerH})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".2f")));
    svg.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y));

    svg.append("text").attr("x", W/2).attr("y", margin.top/2).attr("text-anchor","middle").style("font-weight",600).text(`Feature-Group Scores for FIPS ${fips}`);

    svg.selectAll("rect").data(groups).join("rect")
        .attr("x", margin.left)
        .attr("y", d => y(d.feature))
        .attr("width", d => x(d.value) - margin.left)
        .attr("height", y.bandwidth())
        .attr("fill", "#3182bd");
}

/**
 * Draws the "Source Necessity" bar chart.
 * @param {d3.Selection} svg - The d3 selection to draw in.
 * @param {string} fips - The selected FIPS code.
 */
function drawEnrichedSourceBar(svg, fips) {
    const W = svg.node().clientWidth, H = svg.node().clientHeight;
    const margin = { top: 40, right: 20, bottom: 60, left: 130 };
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;

    const data = getSourceNecessityData();
    const row = data.find(r => String(r.FIPS).padStart(5, "0") === fips);
    
    if (!row) {
        svg.append("text").attr("x", W/2).attr("y", H/2).attr("text-anchor","middle").style("fill","darkred").text(`No source data for FIPS ${fips}`);
        return;
    }

    const sources = Object.keys(row).filter(k => k !== 'FIPS').map(k => ({ label: k, value: +row[k] }));

    const x = d3.scaleLinear().domain([0, d3.max(sources, d => d.value) || 1]).range([margin.left, margin.left + innerW]);
    const y = d3.scaleBand().domain(sources.map(d => d.label)).range([margin.top, margin.top + innerH]).padding(0.2);

    svg.append("g").attr("transform", `translate(0,${margin.top + innerH})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".2f")));
    svg.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y));

    svg.append("text").attr("x", W/2).attr("y", margin.top/2).attr("text-anchor","middle").style("font-weight",600).text(`Source Necessity for FIPS ${fips}`);

    svg.selectAll("rect").data(sources).join("rect")
        .attr("x", margin.left)
        .attr("y", d => y(d.label))
        .attr("width", d => x(d.value) - margin.left)
        .attr("height", y.bandwidth())
        .attr("fill", "#3182bd");
}


/**
 * Draws the "Algorithmic Recourse" lollipop chart.
 * Also manages the severity dropdown associated with it.
 * @param {d3.Selection} box - The d3 selection of the container DIV.
 * @param {string} fips - The selected FIPS code.
 */
function drawLollipopChart(box, fips) {
    // This function needs both the chart container and the user input container
    const userInputContainer = d3.select("#user-input").html("");
    box.html(""); // Clear previous chart

    const recourseResults = getRecourseData();
    const fipsToIdxMap = getFipsToInstanceMap();
    const instanceIdx = fipsToIdxMap.get(String(fips).padStart(5, '0'));
    const initialRecourse = recourseResults.find(r => r.instance_idx === instanceIdx);

    if (!initialRecourse) {
        box.html(`<p>No baseline recourse data for FIPS ${fips}</p>`);
        userInputContainer.html("");
        return;
    }

    // --- Create Severity Dropdown ---
    userInputContainer.append("label").attr("for", "severity-select").text("Set severity: ");
    const sel = userInputContainer.append("select").attr("id", "severity-select")
        .on("change", function() {
            renderLollipop(this.value); // Re-render on change
        });
    
    const severityLevels = ["low", "medium", "high"];
    sel.selectAll("option").data(severityLevels).join("option")
        .attr("value", d => d)
        .property("selected", d => d === ["low", "medium", "high"][initialRecourse.counterfactual_prediction])
        .text(d => d.charAt(0).toUpperCase() + d.slice(1));

    // --- Lollipop Rendering Logic ---
    function renderLollipop(userLvl) {
        box.html(""); // Clear for re-render

        const severityMap = { low: 0, medium: 1, high: 2 };
        const lvlIdx = severityMap[userLvl];
        const rec = recourseResults.find(r =>
            r.instance_idx === instanceIdx &&
            r.counterfactual_prediction === lvlIdx
        );

        if (!rec?.changed_features?.length) {
            box.html(`<p>No counterfactual data for FIPS ${fips} at "${userLvl}" severity</p>`);
            return;
        }

        const top5 = rec.changed_features;
        const W = box.node().clientWidth || 420;
        const H = Math.max(box.node().clientHeight, 240);
        const m = { t: 40, r: 30, b: 40, l: 110 };

        const svg = box.append("svg")
            .attr("viewBox", `0 0 ${W} ${H}`)
            .attr("width", "100%")
            .attr("height", "100%");

        // Scales & axes
        const rawMax = d3.max(top5, d => Math.max(d.original, d.cf));
        const x = d3.scaleLinear()
            .domain([0, rawMax * 1.1]).nice()
            .range([m.l, W - m.r]);

        const y = d3.scaleBand()
            .domain(top5.map(d => d.feature))
            .range([m.t - 10, H - m.b + 10])
            .padding(0.5);

        svg.append("g")
            .attr("transform", `translate(0,${H - m.b})`)
            .call(d3.axisBottom(x).ticks(6));

        svg.append("g")
            .attr("transform", `translate(${m.l},0)`)
            .call(d3.axisLeft(y));

        // Arrow marker
        svg.append("defs").append("marker")
            .attr("id", "arrowHead")
            .attr("viewBox", "0 0 10 10")
            .attr("refX", 10).attr("refY", 5)
            .attr("markerUnits", "userSpaceOnUse")
            .attr("markerWidth", 10).attr("markerHeight", 10)
            .attr("orient", "auto-start-reverse")
            .append("path")
            .attr("d", "M0,0L10,5L0,10Z")
            .attr("fill", "#000");

        // Connectors
        svg.append("g").selectAll("line")
            .data(top5)
            .join("line")
            .attr("x1", d => x(d.original))
            .attr("x2", d => x(d.cf))
            .attr("y1", d => y(d.feature) + y.bandwidth() / 2)
            .attr("y2", d => y(d.feature) + y.bandwidth() / 2)
            .attr("stroke", "#888")
            .attr("stroke-width", 1.5)
            .attr("marker-end", "url(#arrowHead)")
            .attr("pointer-events", "none");

        // Dots + tooltip
        const fmt = d3.format(".3f");
        const tip = (lbl, val) => `<strong>${lbl}</strong><br>${fmt(val)}`;

        // Current = black
        svg.append("g").selectAll(".model")
            .data(top5)
            .join("circle")
            .attr("class", "model")
            .attr("cx", d => x(d.original))
            .attr("cy", d => y(d.feature) + y.bandwidth() / 2)
            .attr("r", 6)
            .attr("fill", "#000")
            .on("mouseover", (e, d) => tooltip
                .style("opacity", 0.9)
                .html(tip(`${d.feature} (current)`, d.original))
                .style("left", `${e.pageX + 8}px`)
                .style("top", `${e.pageY - 28}px`))
            .on("mouseout", () => tooltip.style("opacity", 0));

        // User input = red
        svg.append("g").selectAll(".target")
            .data(top5.filter(d => d.cf !== d.original))
            .join("circle")
            .attr("class", "target")
            .attr("cx", d => x(d.cf))
            .attr("cy", d => y(d.feature) + y.bandwidth() / 2)
            .attr("r", 6)
            .attr("fill", "#e41a1c")
            .on("mouseover", (e, d) => tooltip
                .style("opacity", 0.9)
                .html(tip(`${d.feature} (user input)`, d.cf))
                .style("left", `${e.pageX + 8}px`)
                .style("top", `${e.pageY - 28}px`))
            .on("mouseout", () => tooltip.style("opacity", 0));

        // Title
        svg.append("text")
            .attr("x", W / 2).attr("y", m.t - 18)
            .attr("text-anchor", "middle")
            .attr("font-size", "1.05rem")
            .attr("font-weight", 600)
            .text(`Algorithmic Recourse for FIPS ${fips}`);

        // Legend
        const legendData = [
            { lbl: "Current value", color: "#000" },
            { lbl: "User target", color: "#e41a1c" }
        ];

        const legend = svg.append("g")
            .attr("transform", `translate(${W - m.r - 150},${m.t})`)
            .attr("font-size", ".85rem");

        const row = legend.selectAll("g")
            .data(legendData)
            .join("g")
            .attr("transform", (d, i) => `translate(0,${i * 16})`);

        row.append("rect")
            .attr("width", 12).attr("height", 12)
            .attr("fill", d => d.color);

        row.append("text")
            .attr("x", 18).attr("y", 10)
            .text(d => d.lbl);
    }

    
    // Initial render
    renderLollipop(sel.node().value);
}

// Export the init function as the public interface for this module.
export default {
    init
};
