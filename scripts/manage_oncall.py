#!/usr/bin/env python3
"""
On-Call Management Script
Web API to manage on-call schedule
"""

from flask import Flask, request, jsonify
import json
import os
import logging
from datetime import datetime

app = Flask(__name__)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

ONCALL_CONFIG_FILE = os.getenv('ONCALL_CONFIG', '/app/config/oncall.json')


def load_config():
    """Load on-call configuration"""
    try:
        with open(ONCALL_CONFIG_FILE, 'r') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading config: {e}")
        return {}


def save_config(config):
    """Save on-call configuration"""
    try:
        with open(ONCALL_CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
        logger.info(f"Configuration saved: {config}")
        return True
    except Exception as e:
        logger.error(f"Error saving config: {e}")
        return False


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'service': 'oncall-manager'}), 200


@app.route('/api/oncall', methods=['GET'])
def get_oncall():
    """Get current on-call configuration and active on-call person"""
    config = load_config()

    # Determine current on-call
    current_oncall = None
    if 'schedule' in config and config['schedule']:
        now = datetime.now()
        current_day = now.strftime('%A').lower()
        current_hour = now.hour

        for entry in config['schedule']:
            day = entry.get('day', '').lower()
            start_hour = entry.get('start_hour', 0)
            end_hour = entry.get('end_hour', 24)

            if day == current_day and start_hour <= current_hour < end_hour:
                current_oncall = entry
                break

    if not current_oncall and 'primary' in config:
        current_oncall = {
            'number': config['primary'],
            'name': 'Primary On-Call'
        }

    return jsonify({
        'current_oncall': current_oncall,
        'config': config,
        'timestamp': datetime.now().isoformat()
    }), 200


@app.route('/api/oncall/primary', methods=['PUT'])
def update_primary():
    """Update primary on-call number"""
    data = request.get_json()

    if not data or 'number' not in data:
        return jsonify({'error': 'Missing number field'}), 400

    config = load_config()
    config['primary'] = data['number']

    if 'name' in data:
        config['primary_name'] = data['name']

    if save_config(config):
        return jsonify({'status': 'success', 'primary': config['primary']}), 200
    else:
        return jsonify({'error': 'Failed to save configuration'}), 500


@app.route('/api/oncall/schedule', methods=['GET'])
def get_schedule():
    """Get on-call schedule"""
    config = load_config()
    return jsonify({'schedule': config.get('schedule', [])}), 200


@app.route('/api/oncall/schedule', methods=['PUT'])
def update_schedule():
    """Update entire on-call schedule"""
    data = request.get_json()

    if not data or 'schedule' not in data:
        return jsonify({'error': 'Missing schedule field'}), 400

    config = load_config()
    config['schedule'] = data['schedule']

    if save_config(config):
        return jsonify({'status': 'success', 'schedule': config['schedule']}), 200
    else:
        return jsonify({'error': 'Failed to save configuration'}), 500


@app.route('/api/oncall/schedule/<day>', methods=['PUT'])
def update_day_schedule(day):
    """Update on-call schedule for a specific day"""
    data = request.get_json()

    if not data or 'number' not in data:
        return jsonify({'error': 'Missing number field'}), 400

    config = load_config()

    if 'schedule' not in config:
        config['schedule'] = []

    # Find and update the day's schedule
    day_lower = day.lower()
    found = False

    for entry in config['schedule']:
        if entry.get('day', '').lower() == day_lower:
            entry['number'] = data['number']
            if 'name' in data:
                entry['name'] = data['name']
            if 'start_hour' in data:
                entry['start_hour'] = data['start_hour']
            if 'end_hour' in data:
                entry['end_hour'] = data['end_hour']
            found = True
            break

    # If day not found, create new entry
    if not found:
        new_entry = {
            'day': day_lower,
            'start_hour': data.get('start_hour', 0),
            'end_hour': data.get('end_hour', 24),
            'number': data['number']
        }
        if 'name' in data:
            new_entry['name'] = data['name']
        config['schedule'].append(new_entry)

    if save_config(config):
        return jsonify({'status': 'success', 'day': day_lower}), 200
    else:
        return jsonify({'error': 'Failed to save configuration'}), 500


@app.route('/api/oncall/config', methods=['GET'])
def get_full_config():
    """Get complete configuration"""
    config = load_config()
    return jsonify(config), 200


@app.route('/api/oncall/config', methods=['PUT'])
def update_full_config():
    """Replace entire configuration"""
    data = request.get_json()

    if not data:
        return jsonify({'error': 'Missing configuration data'}), 400

    if save_config(data):
        return jsonify({'status': 'success', 'config': data}), 200
    else:
        return jsonify({'error': 'Failed to save configuration'}), 500


if __name__ == '__main__':
    port = int(os.getenv('API_PORT', '8080'))
    app.run(host='0.0.0.0', port=port, debug=False)
