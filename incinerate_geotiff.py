import os
import time
import numpy as np
import matplotlib.pyplot as plt
import networkx as nx
import logging
import random as rnd
import rasterio
import matplotlib
import argparse
from matplotlib.colors import ListedColormap

# Use 'Agg' backend for non-interactive (server) environments
matplotlib.use('Agg')

# =========================================================================
# Default Simulation Parameters
# (Can be overridden by command-line arguments)
# =========================================================================
DEFAULT_OUTPUT_BASE = "./wildfire_output"
DEFAULT_TIMESTEPS = 100
DEFAULT_THRESHOLD = 0.1   # Uniform ignition threshold for all nodes
FOREST_PIXEL_VALUE = 1    # The value in your TIF that means "forest"
MAX_WIND_SPEED = 40
PP_FACTOR = 2
EMBER_PROB = 0.02
EMBER_RADIUS = 5
EDGE_WEIGHT_NOISE_LOW = 0.6
EDGE_WEIGHT_NOISE_HIGH = 1.6
THRESHOLD_NOISE_LOW = 0.8      # Fixed: Added missing constant
THRESHOLD_NOISE_HIGH = 1.2     # Fixed: Added missing constant
DEFAULT_IGNITION = "random"

# Setup logging
logger = logging.getLogger(__name__)

# --- Simple color mapping for raster output ---
CUSTOM_CMAP = ListedColormap([
    (1.0, 1.0, 1.0),  # 0: empty (white)
    (0.0, 0.6, 0.0),  # 1: not_burnt (green)
    (1.0, 0.5, 0.0),  # 2: burning (orange)
    (0.4, 0.2, 0.0)   # 3: burnt (dark brown)
])
STATE_TO_INT = {
    'empty': 0,
    'not_burnt': 1,
    'burning': 2,
    'burnt': 3
}

# =========================================================================
# Core Simulation Functions (Mostly unchanged)
# =========================================================================

def count_burning(g):
    """Counts the number of currently burning nodes."""
    return sum(1 for i in g.nodes if g.nodes[i]['fire_state'] == 'burning')

def count_burnt(g):
    """Counts the number of burnt-out nodes."""
    return sum(1 for i in g.nodes if g.nodes[i]['fire_state'] == 'burnt')

def dist(pair1, pair2, dist_scale):
    """Calculate scaled distance between two (x, y) pos tuples."""
    x1, y1 = pair1
    x2, y2 = pair2
    return np.sqrt((x2 - x1)**2 + (y2 - y1)**2) * dist_scale

def edge_weight(max_speed, eps, edge_strength, wind_direction, distance):
    """Calculates wind-influenced edge weight."""
    psi = max_speed
    epss = 1 if edge_strength in [0, 1] else eps
    gamma = rnd.uniform(0.01, 1) * psi * epss
    tau = wind_direction * np.pi / 180
    delta = distance
    if delta == 0: return 0.01
    beta = max(2 / np.pi * np.arctan(1 * gamma * np.cos(tau) / delta), 0.01)
    return round(beta, 2)

def get_angle(pair1, pair2):
    """Calculate angle between two (x, y) pos tuples."""
    x1, y1 = pair1
    x2, y2 = pair2
    if x1 == x2:
        return 90 if y2 > y1 else 270
    angle = np.arctan((y2 - y1) / (x2 - x1)) * 180 / np.pi
    if x2 < x1:
        angle += 180
    return angle

def get_burning(g, lst):
    """Filters a list of nodes, returning only those that are 'burning'."""
    return [item for item in lst if g.has_node(item) and g.nodes[item]['fire_state'] == 'burning']

def life_edge_update(g, edge_list):
    """Reduces 'life' of burning edges, turning them 'brown' (burnt)."""
    for p, q in edge_list:
        if g.has_edge(p,q) and g[p][q]['color'] == 'orange':
            g[p][q]['life'] -= 1
            if g[p][q]['life'] < 0:
                g[p][q]['color'] = 'brown'

def update_active_neighbors(g):
    """Updates the 'num_of_active_neighbors' attribute for each node."""
    for itemm in g.nodes():
        num = sum(1 for item in g.neighbors(itemm) if g.has_node(item) and g.nodes[item]['fire_state'] == 'burning')
        g.nodes[itemm]['num_of_active_neighbors'] = num

def lifeline_update(g):
    """Reduces 'life' of burning nodes, turning them 'burnt'."""
    for node in g.nodes():
        if g.nodes[node]['fire_state'] == 'burning':
            g.nodes[node]['life'] -= 1
            if g.nodes[node]['life'] < 0:
                g.nodes[node]['fire_state'] = 'burnt'
                g.nodes[node]['color'] = 'brown'

def incinerate(g, edge_list, grid_width, grid_height):
    """
    Main fire spread logic for one timestep.
    Calculates ignition from neighbors and ember spotting.
    """
    cell_scale = 100.0 / grid_width # Scale based on 100x100 unit area
    
    burning_nodes = get_burning(g, [n for n in g.nodes])
    nodes_to_ignite = []

    # 1. Neighbor-based ignition
    for ignition_node in burning_nodes:
        for nb in g.neighbors(ignition_node):
            if g.nodes[nb]['fire_state'] == 'not_burnt':
                active_neighbors = get_burning(g, list(g.neighbors(nb)))
                s = 0
                for burning_nb in active_neighbors:
                    if g.has_edge(burning_nb, nb):
                        w = g.get_edge_data(burning_nb, nb).get('w', 0)
                        w_eff = w * rnd.uniform(EDGE_WEIGHT_NOISE_LOW, EDGE_WEIGHT_NOISE_HIGH)
                        s = min(1, s + w_eff)
                
                ths = g.nodes[nb]['threshold_switch']
                ths_eff = ths * rnd.uniform(THRESHOLD_NOISE_LOW, THRESHOLD_NOISE_HIGH)

                if s >= ths_eff:
                    nodes_to_ignite.append((nb, ignition_node))

    for nb, ignition_node in nodes_to_ignite:
        if g.nodes[nb]['fire_state'] != 'burning':
            g.nodes[nb]['fire_state'] = 'burning'
            g.nodes[nb]['color'] = 'orange'
            if g.has_edge(ignition_node, nb):
                g[ignition_node][nb]['color'] = 'orange'

    # 2. Ember mechanic (spotting)
    non_empty_nodes = [n for n in g.nodes if g.nodes[n]['fire_state'] not in ('empty', 'burning', 'burnt')]
    for bnode in burning_nodes:
        if not non_empty_nodes:
            break
        if rnd.random() < EMBER_PROB:
            bx, by = g.nodes[bnode]['pos']
            candidates = []
            for n in non_empty_nodes:
                nxp, nyp = g.nodes[n]['pos']
                dx = abs(nxp - bx) / cell_scale
                dy = abs(nyp - by) / cell_scale
                if dx <= EMBER_RADIUS and dy <= EMBER_RADIUS:
                    candidates.append(n)
            
            if not candidates and rnd.random() < 0.1:
                candidates = non_empty_nodes
            
            if candidates:
                target = rnd.choice(candidates)
                if rnd.random() < 0.5:
                    if g.nodes[target]['fire_state'] == 'not_burnt':
                        g.nodes[target]['fire_state'] = 'burning'
                        g.nodes[target]['color'] = 'orange'
                        if g.has_edge(bnode, target):
                            g[bnode][target]['color'] = 'orange'

    # 3. Update node/edge lifelines
    lifeline_update(g)
    life_edge_update(g, edge_list)
    update_active_neighbors(g)

    # 4. Final state check
    for nd in list(g.nodes()):
        if g.nodes[nd]['fire_state'] == 'burnt':
            g.nodes[nd]['color'] = 'brown'
            for neighbor in g.neighbors(nd):
                if g.has_edge(nd, neighbor):
                    g[nd][neighbor]['color'] = 'brown'
    return g

def simulate_wind(g, edge_list, max_speed, epsilon, dist_scale):
    """Applies a random wind ellipse to the graph, modifying edge weights."""
    nn = g.number_of_nodes()
    snn = int(np.ceil(np.sqrt(nn))) # Approx grid size
    non_empty_nodes = [n for n in g.nodes if g.nodes[n]['fire_state'] != 'empty']
    if not non_empty_nodes:
        return (None, 0, 0)
    
    center_node = rnd.choice(non_empty_nodes)
    center_node_pos = g.nodes[center_node]['pos']
    random_bound = 4
    a, b = 0, 0
    while a == b:
        a = rnd.randint(1, random_bound)
        b = rnd.randint(1, random_bound)
    c_max = max(a, b) - 1
    c = rnd.randint(1, c_max) * rnd.choice([-1, 1]) if c_max > 0 else 0
    center_x, center_y = g.nodes[center_node]['pos']
    
    cell_scale = 100.0 / snn
    scaled_a = a * cell_scale * 5 
    scaled_b = b * cell_scale * 5

    elliptical_nodes = []
    for node, data in g.nodes(data=True):
        if data['fire_state'] != 'empty':
            x, y = g.nodes[node]['pos']
            if ((x - center_x)**2 / scaled_a**2) + ((y - center_y)**2 / scaled_b**2) <= 1:
                elliptical_nodes.append(node)
    
    focus = center_node
    posf = g.nodes[focus]['pos']

    for n1 in elliptical_nodes:
        for n2 in elliptical_nodes:
            if n1 >= n2 or not g.has_edge(n1, n2):
                continue
            
            pos1 = g.nodes[n1]['pos']
            pos2 = g.nodes[n2]['pos']
            
            if a > b: # Horizontal ellipse
                angle = 0 if (pos1[0] > posf[0] and pos2[0] > posf[0]) else 180
            else: # Vertical ellipse
                angle = 90 if (pos1[1] > posf[1] and pos2[1] > posf[1]) else 270
            
            w_e = edge_weight(max_speed, epsilon, 1, angle, dist(pos1, pos2, 30))
            g[n1][n2]['w'] = w_e
            g[n1][n2]['wind_dir'] = angle
            g[n1][n2]['edge_strength'] = 1
            
    return (center_node_pos, a, b)

# =========================================================================
# NEW/REWRITTEN Simulation Runner
# =========================================================================

def draw_forest_snapshot(g, grid_height, grid_width, timestep, output_dir):
    """
    Renders the current state of the graph as a raster image.
    Node IDs (r, c) are used as pixel coordinates.
    """
    img_data = np.zeros((grid_height, grid_width), dtype=int)
    
    # Map node states to integer values for the image
    for node_id, data in g.nodes(data=True):
        r, c = node_id # Node ID is the (row, col) tuple
        state_int = STATE_TO_INT.get(data['fire_state'], 0)
        
        if 0 <= r < grid_height and 0 <= c < grid_width:
            img_data[r, c] = state_int
        else:
            logger.warning(f"Node {node_id} is out-of-bounds. Skipping.")

    plt.figure(figsize=(10, 10))
    # 'origin=upper' matches raster (row 0 is at the top)
    plt.imshow(img_data, cmap=CUSTOM_CMAP, interpolation='nearest', origin='upper', vmin=0, vmax=len(STATE_TO_INT) - 1)
    plt.axis('off')
    filepath = os.path.join(output_dir, f"timestep_{timestep:04d}.png")
    plt.savefig(filepath, bbox_inches='tight', pad_inches=0, dpi=150)
    plt.close()

def run_wildfire_simulation(geotiff_path, output_dir, timesteps, threshold, ignition_point):
    """
    Main function to load GeoTIFF, build graph, and run simulation.
    """
    logger.info(f"Starting simulation from GeoTIFF: {geotiff_path}")
    
    # --- 1. Load GeoTIFF and build graph ---
    try:
        with rasterio.open(geotiff_path) as src:
            forest_data = src.read(1)
            grid_height, grid_width = src.shape
            transform = src.transform
            logger.info(f"Loaded {grid_width}x{grid_height} grid.")
    except Exception as e:
        logger.error(f"[ERROR] Could not load GeoTIFF: {e}")
        return {"success": False, "error": f"Could not load GeoTIFF at {geotiff_path}"}

    dist_scale = 30
    g = nx.Graph()
    pos_dict = {}
    
    logger.info("Building graph from raster...")
    for r in range(grid_height):
        for c in range(grid_width):
            node_id = (r, c) # Node ID is its (row, col)
            x, y = transform * (c + 0.5, r + 0.5) # center of pixel
            pos = (x, y)
            pos_dict[node_id] = pos
            lf = rnd.randint(3, 7) # Lifeline
            
            # Check if pixel is forest
            if forest_data[r, c] == FOREST_PIXEL_VALUE:
                g.add_node(
                    node_id, 
                    threshold_switch=threshold, # Use the uniform threshold
                    color='green', 
                    num_of_active_neighbors=0,
                    fire_state='not_burnt', 
                    life=lf, 
                    pos=pos
                )
            else: # Not a forest pixel
                g.add_node(
                    node_id, 
                    threshold_switch=999.0, # High threshold for non-burnable
                    color='black', 
                    num_of_active_neighbors=0,
                    fire_state='empty', 
                    life=lf, 
                    pos=pos
                )

    # --- 2. Build graph edges (8-neighbor grid) ---
    logger.info("Building grid edges...")
    edge_list = []
    for r in range(grid_height):
        for c in range(grid_width):
            node_id = (r, c)
            if g.nodes[node_id]['fire_state'] == 'empty':
                continue
            
            for dr in [-1, 0, 1]:
                for dc in [-1, 0, 1]:
                    if dr == 0 and dc == 0: continue
                    nr, nc = r + dr, c + dc
                    neighbor_id = (nr, nc)
                    
                    if 0 <= nr < grid_height and 0 <= nc < grid_width and \
                       g.nodes[neighbor_id]['fire_state'] != 'empty' and \
                       not g.has_edge(node_id, neighbor_id):
                        
                        edge_list.append((node_id, neighbor_id))

    logger.info(f"Adding {len(edge_list)} edges...")
    for n1, n2 in edge_list:
        p1, p2 = g.nodes[n1]['pos'], g.nodes[n2]['pos']
        angle = get_angle(p1, p2)
        pp = edge_weight(MAX_WIND_SPEED, 0.1, 0, angle, dist(p1, p2, dist_scale)) * PP_FACTOR
        lf = np.floor((g.nodes[n1]['life'] + g.nodes[n2]['life']) / 2)
        g.add_edge(n1, n2, w=pp, color='green', life=int(lf), edge_strength=0, wind_speed=0.01, wind_dir=angle, eb=0)

    # --- 3. Set Ignition Point ---
    non_burnt_nodes = [n for n in g.nodes if g.nodes[n]['fire_state'] == 'not_burnt']
    if not non_burnt_nodes:
        logger.warning("No nodes available to ignite. Forest is empty.")
        return {"success": False, "error": "No nodes available to ignite"}

    ignition_node = None
    if ignition_point == "random":
        ignition_node = rnd.choice(non_burnt_nodes)
    else:
        try:
            # Try to parse as "row,col"
            r, c = map(int, ignition_point.split(','))
            ignition_node = (r, c)
            if not g.has_node(ignition_node) or g.nodes[ignition_node]['fire_state'] != 'not_burnt':
                 logger.warning(f"Ignition point {ignition_node} is invalid or not in forest. Reverting to random.")
                 ignition_node = rnd.choice(non_burnt_nodes)
        except:
             logger.warning(f"Could not parse ignition point '{ignition_point}'. Reverting to random.")
             ignition_node = rnd.choice(non_burnt_nodes)
    
    g.nodes[ignition_node]['fire_state'] = 'burning'
    g.nodes[ignition_node]['color'] = 'orange'
    logger.info(f"Ignition set at node {ignition_node} (pos {g.nodes[ignition_node]['pos']})")

    # --- 4. Setup Unique Output Directory ---
    run_output_dir = os.path.join(output_dir, f"wildfire_run_{int(time.time())}")
    os.makedirs(run_output_dir, exist_ok=True)
    logger.info(f"Saving simulation frames to: {run_output_dir}")

    # --- 5. Main Simulation Loop ---
    final_timestep = 0
    for i in range(timesteps + 1):
        final_timestep = i
        
        # Draw the state *before* this step's incineration
        draw_forest_snapshot(g, grid_height, grid_width, i, run_output_dir)
        
        current_burning_forests = count_burning(g)
        if current_burning_forests == 0 and i > 0:
            logger.info(f"Fire simulation stopped at timestep {i}: no more burning nodes.")
            break
        
        if i == timesteps:
             logger.info(f"Simulation reached max timesteps ({timesteps}).")

        # Run fire spread logic
        g = incinerate(g, edge_list, grid_width, grid_height)

        # Run wind logic
        if i > 0:
            simulate_wind(g, edge_list, MAX_WIND_SPEED, 0.1, dist_scale)

    logger.info(f"Simulation complete. Final timestep: {final_timestep}")

    return {
        "success": True,
        "message": f"Simulation complete. {final_timestep+1} frames saved.",
        "output_dir": run_output_dir,
        "grid_size": (grid_width, grid_height),
        "final_timestep": final_timestep
    }

# =========================================================================
# COMMAND-LINE INTERFACE
# =========================================================================
if __name__ == "__main__":
    
    # --- Setup Argument Parser ---
    parser = argparse.ArgumentParser(description="Run a wildfire simulation from a GeoTIFF file.")
    
    parser.add_argument(
        '--input', '-i',
        dest='geotiff_path',
        required=True,
        help="Path to the input forest cover GeoTIFF file. (Required)"
    )
    
    parser.add_argument(
        '--output', '-o',
        dest='output_dir',
        default=DEFAULT_OUTPUT_BASE,
        help=f"Base directory to save simulation frames. (Default: {DEFAULT_OUTPUT_BASE})"
    )
    
    parser.add_argument(
        '--timesteps', '-t',
        dest='timesteps',
        type=int,
        default=DEFAULT_TIMESTEPS,
        help=f"Maximum number of timesteps to run. (Default: {DEFAULT_TIMESTEPS})"
    )
    
    parser.add_argument(
        '--threshold',
        dest='threshold',
        type=float,
        default=DEFAULT_THRESHOLD,
        help=f"Uniform ignition threshold for all forest nodes. (Default: {DEFAULT_THRESHOLD})"
    )
    
    parser.add_argument(
        '--ignition',
        dest='ignition_point',
        default=DEFAULT_IGNITION,
        help=f"Ignition point. 'random' or 'row,col' (e.g., '150,120'). (Default: {DEFAULT_IGNITION})"
    )
    
    args = parser.parse_args()

    # --- Setup Logging ---
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

    # --- Ensure base output directory exists ---
    try:
        os.makedirs(args.output_dir, exist_ok=True)
    except Exception as e:
        logger.error(f"Could not create output directory at {args.output_dir}: {e}")
        exit(1)

    # --- Run the simulation ---
    start_time = time.time()
    result = run_wildfire_simulation(
        geotiff_path=args.geotiff_path,
        output_dir=args.output_dir,
        timesteps=args.timesteps,
        threshold=args.threshold,
        ignition_point=args.ignition_point
    )
    end_time = time.time()

    # --- Print final status ---
    if result["success"]:
        logger.info(f"Success: {result['message']}")
        logger.info(f"Output saved to: {result['output_dir']}")
        logger.info(f"Total simulation time: {end_time - start_time:.2f} seconds")
    else:
        logger.error(f"Error: {result['error']}")