"""
routes.py
---------------------------------------------
Defines and registers all API blueprints for the application.
"""

from flask import Blueprint, request, jsonify
import logging
import traceback
import json
import os

# 1. Import the central prefix
from config import (
    API_PREFIX,
    FOREST_GEOJSON_DIR
)

# 2. Import your new GEE blueprint
from earthengine.routes import gee_bp 

# 3. Import your simulation logic (as you had before)
from wildfire_sim.incinerate import run_wildfire_simulation

logger = logging.getLogger(__name__)

# --- SIMULATION BLUEPRINT ---
api_bp = Blueprint('api', __name__)

@api_bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({'status': 'healthy', 'message': 'Wildfire API is running'})


@api_bp.route('/simulate_wildfire', methods=['GET'])
def simulate_wildfire():
    """Run wildfire simulation based on local GeoJSON from FOREST_GEOJSON_DIR using countyKey."""
    try:
        county_key = request.args.get('countyKey')
        if not county_key:
            return jsonify({'error': 'Missing required query parameter: countyKey'}), 400

        local_file_path = os.path.join(FOREST_GEOJSON_DIR, f"{county_key}.geojson")
        if not os.path.exists(local_file_path):
            return jsonify({'error': f'GeoJSON not found for countyKey: {county_key}', 'path': local_file_path}), 404

        with open(local_file_path, 'r', encoding='utf-8') as f:
            forest_geojson = json.load(f)

        logger.info(f"Running wildfire simulation for county: {county_key} (GeoJSON: {local_file_path})")
        result = run_wildfire_simulation(forest_shape=forest_geojson)

        return jsonify(result)

    except Exception as e:
        logger.error("Wildfire simulation failed", exc_info=True)
        return jsonify({
            'error': 'Internal server error during wildfire simulation',
            'message': str(e),
            'traceback': traceback.format_exc()
        }), 500

# IMPORTANT PART
# --- CENTRAL REGISTRATION FUNCTION ---
def register_routes(app):
    """Registers all API blueprints with the Flask app."""
    
    # Register both blueprints with the central prefix
    app.register_blueprint(api_bp, url_prefix=API_PREFIX)
    app.register_blueprint(gee_bp, url_prefix=API_PREFIX)