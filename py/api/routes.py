"""
routes.py
---------------------------------------------
Defines and registers all API blueprints for the application.
"""

from flask import Blueprint, request, jsonify
import logging
import traceback

# 1. Import the central prefix
from config import API_PREFIX

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

@api_bp.route('/simulate', methods=['POST'])  # <-- Note: /api prefix removed
def simulate_wildfire():
    """Run the wildfire simulation using the ignition point (lat/lng)."""
    try:
        if not request.is_json:
            return jsonify({'error': 'Content-Type must be application/json'}), 400

        data = request.get_json()
        lat = data.get('lat')
        lng = data.get('lng')

        if lat is None or lng is None:
            return jsonify({'error': 'Missing required parameters: lat and lng'}), 400

        logger.info(f"Running wildfire simulation for point: ({lat}, {lng})")
        result = run_wildfire_simulation(lat, lng)

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