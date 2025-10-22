// js/modules/ui/Wildfire.js
import { loadWildfireSimulation, getWildfireData } from '../services/DataManager.js';

async function startSimulation(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    await loadWildfireSimulation();

    const wildfire = getWildfireData();
    const timesteps = wildfire.timesteps;
    const gridSize = wildfire.gridSize;

    const cellSize = Math.min(canvas.width / gridSize, canvas.height / gridSize);

    let stepIndex = 0;
    const finalStepIndex = timesteps.length - 1;
    addTooltip(canvas, gridSize, cellSize, timesteps, () => (stepIndex <= finalStepIndex ? stepIndex : finalStepIndex));

    function drawStep() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const ts = timesteps[stepIndex];

        ts.nodes.forEach(node => {
            // To mimic matplotlib: top row (row=0) appears at top of canvas.
            // Invert the Y-axis mapping for drawing.
            const x = node.col * cellSize;
            const y = (gridSize - 1 - node.row) * cellSize; // invert Y-axis

            if (node.state === 'empty') {
                ctx.fillStyle = 'white';
                ctx.strokeStyle = '#ccc';
                ctx.fillRect(x, y, cellSize, cellSize);
                ctx.strokeRect(x, y, cellSize, cellSize);
            } else {
                ctx.fillStyle = node.color || 'gray';
                ctx.fillRect(x, y, cellSize, cellSize);
            }
        });

        ctx.strokeStyle = '#ccc';
        for (let i = 0; i <= gridSize; i++) {
            ctx.beginPath();
            ctx.moveTo(0, i * cellSize);
            ctx.lineTo(gridSize * cellSize, i * cellSize);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(i * cellSize, 0);
            ctx.lineTo(i * cellSize, gridSize * cellSize);
            ctx.stroke();
        }

        stepIndex++;
        if (stepIndex < timesteps.length) {
            setTimeout(drawStep, 500);
        }
    }

    drawStep();
}

function addTooltip(canvas, gridSize, cellSize, timesteps, getStepIndex) {
    const tooltip = document.createElement('div');
    tooltip.style.position = 'absolute';
    tooltip.style.background = 'rgba(0,0,0,0.75)';
    tooltip.style.color = 'white';
    tooltip.style.padding = '4px 6px';
    tooltip.style.fontSize = '12px';
    tooltip.style.borderRadius = '4px';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Adjust for inverted Y-axis
        const col = Math.floor(x / cellSize);
        const invertedRow = Math.floor(y / cellSize);
        const row = gridSize - 1 - invertedRow; // invert mapping back

        const stepIndex = getStepIndex();
        const ts = timesteps[stepIndex];
        const node = ts.nodes.find(n => n.row === row && n.col === col);

        if (row >= 0 && row < gridSize && col >= 0 && col < gridSize) {
            tooltip.style.display = 'block';
            tooltip.style.left = `${e.pageX + 10}px`;
            tooltip.style.top = `${e.pageY + 10}px`;

            if (node) {
                tooltip.innerHTML = `ID: ${node.id}<br>Row: ${row}, Col: ${col}<br>State: ${node.state}`;
            } else {
                tooltip.innerHTML = `Row: ${row}, Col: ${col}`;
            }
        } else {
            tooltip.style.display = 'none';
        }
    });

    canvas.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
    });
}

function init() {
    const container = document.getElementById('wildfire-sim-container');
    const canvas = container.querySelector('#wildfire-canvas');
    const runBtn = container.querySelector('#run-wildfire-sim');

    runBtn.addEventListener('click', () => {
        startSimulation(canvas);
    });

}

export default {
    init
};