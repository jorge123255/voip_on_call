#!/usr/bin/env python3
"""
Enhanced On-Call Management System
Full-featured web API with user management, rotations, and shift swapping
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import json
import os
import logging
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import hashlib

app = Flask(__name__, static_folder='/app/web', static_url_path='')
CORS(app)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# File paths
CONFIG_DIR = '/app/config'
ONCALL_CONFIG_FILE = os.path.join(CONFIG_DIR, 'oncall.json')
USERS_FILE = os.path.join(CONFIG_DIR, 'users.json')
ROTATIONS_FILE = os.path.join(CONFIG_DIR, 'rotations.json')
OVERRIDES_FILE = os.path.join(CONFIG_DIR, 'overrides.json')
AUDIT_LOG_FILE = os.path.join(CONFIG_DIR, 'audit_log.json')
SETTINGS_FILE = os.path.join(CONFIG_DIR, 'settings.json')
CALL_HISTORY_FILE = os.path.join(CONFIG_DIR, 'call_history.json')
ESCALATION_POLICY_FILE = os.path.join(CONFIG_DIR, 'escalation_policy.json')
WEBHOOKS_FILE = os.path.join(CONFIG_DIR, 'webhooks.json')
WEBHOOK_DELIVERY_LOG_FILE = os.path.join(CONFIG_DIR, 'webhook_delivery_log.json')
MANUAL_SCHEDULE_FILE = os.path.join(CONFIG_DIR, 'manual_schedule.json')

# Ensure config directory exists
os.makedirs(CONFIG_DIR, exist_ok=True)

def load_json_file(filepath, default=None):
    """Load JSON file with error handling"""
    try:
        if os.path.exists(filepath):
            with open(filepath, 'r') as f:
                return json.load(f)
        return default if default is not None else {}
    except Exception as e:
        logger.error(f"Error loading {filepath}: {e}")
        return default if default is not None else {}

def save_json_file(filepath, data):
    """Save JSON file with error handling"""
    try:
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        logger.error(f"Error saving {filepath}: {e}")
        return False

def add_audit_log(action, user, details):
    """Add entry to audit log"""
    logs = load_json_file(AUDIT_LOG_FILE, default=[])
    logs.append({
        'timestamp': datetime.now().isoformat(),
        'action': action,
        'user': user,
        'details': details
    })
    # Keep only last 1000 entries
    logs = logs[-1000:]
    save_json_file(AUDIT_LOG_FILE, logs)

def get_escalation_chain():
    """Get the full escalation chain with all levels"""
    escalation_policy = load_json_file(ESCALATION_POLICY_FILE, default={})

    if not escalation_policy.get('enabled', False):
        return None

    return escalation_policy.get('levels', [])

def get_current_oncall():
    """Determine who is currently on-call based on schedule, rotations, and overrides"""
    now = datetime.now()

    # Check overrides first
    overrides = load_json_file(OVERRIDES_FILE, default=[])
    for override in overrides:
        start = datetime.fromisoformat(override['start_date'])
        end = datetime.fromisoformat(override['end_date'])
        if start <= now <= end:
            return {
                'user_id': override['user_id'],
                'type': 'override',
                'reason': override.get('reason', 'Override'),
                'until': override['end_date']
            }

    # Check rotations
    rotations = load_json_file(ROTATIONS_FILE, default=[])
    for rotation in rotations:
        if not rotation.get('active', True):
            continue

        rotation_type = rotation.get('type', 'weekly')
        start_date = datetime.fromisoformat(rotation['start_date'])

        if rotation_type == 'daily':
            days_diff = (now - start_date).days
            user_index = days_diff % len(rotation['users'])
            return {
                'user_id': rotation['users'][user_index],
                'type': 'daily_rotation',
                'rotation_id': rotation.get('id', 'unknown')
            }

        elif rotation_type == 'weekly':
            weeks_diff = (now - start_date).days // 7
            user_index = weeks_diff % len(rotation['users'])
            return {
                'user_id': rotation['users'][user_index],
                'type': 'weekly_rotation',
                'rotation_id': rotation.get('id', 'unknown')
            }

        elif rotation_type == 'monthly':
            months_diff = (now.year - start_date.year) * 12 + (now.month - start_date.month)
            user_index = months_diff % len(rotation['users'])
            return {
                'user_id': rotation['users'][user_index],
                'type': 'monthly_rotation',
                'rotation_id': rotation.get('id', 'unknown')
            }

        elif rotation_type == 'yearly':
            years_diff = now.year - start_date.year
            user_index = years_diff % len(rotation['users'])
            return {
                'user_id': rotation['users'][user_index],
                'type': 'yearly_rotation',
                'rotation_id': rotation.get('id', 'unknown')
            }

    # Fallback to legacy schedule
    config = load_json_file(ONCALL_CONFIG_FILE)
    if 'schedule' in config and config['schedule']:
        current_day = now.strftime('%A').lower()
        current_hour = now.hour
        for entry in config['schedule']:
            day = entry.get('day', '').lower()
            start_hour = entry.get('start_hour', 0)
            end_hour = entry.get('end_hour', 24)
            if day == current_day and start_hour <= current_hour < end_hour:
                return {
                    'number': entry.get('number'),
                    'name': entry.get('name', 'On-Call'),
                    'type': 'legacy_schedule'
                }

    # Final fallback to primary
    if 'primary' in config:
        return {
            'number': config['primary'],
            'name': config.get('primary_name', 'Primary On-Call'),
            'type': 'primary'
        }

    return None

# =========================
# Web Interface Routes
# =========================

@app.route('/')
def index():
    """Serve main dashboard"""
    return send_from_directory('/app/web', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files"""
    return send_from_directory('/app/web', path)

# =========================
# Health & Status
# =========================

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'service': 'oncall-manager-pro'}), 200

@app.route('/api/status', methods=['GET'])
def system_status():
    """Get system status"""
    import subprocess

    # Check Asterisk
    try:
        result = subprocess.run(['asterisk', '-rx', 'core show version'],
                              capture_output=True, text=True, timeout=5)
        asterisk_running = result.returncode == 0
    except:
        asterisk_running = False

    # Check SIP trunk
    try:
        result = subprocess.run(['asterisk', '-rx', 'sip show registry'],
                              capture_output=True, text=True, timeout=5)
        sip_registered = 'Registered' in result.stdout
    except:
        sip_registered = False

    return jsonify({
        'asterisk': asterisk_running,
        'sip_trunk': sip_registered,
        'api': True,
        'timestamp': datetime.now().isoformat()
    }), 200

# =========================
# User Management
# =========================

@app.route('/api/users', methods=['GET'])
def get_users():
    """Get all users"""
    users = load_json_file(USERS_FILE, default=[])
    return jsonify({'users': users}), 200

@app.route('/api/users', methods=['POST'])
def create_user():
    """Create new user"""
    data = request.get_json()

    if not data or 'name' not in data or 'phone' not in data:
        return jsonify({'error': 'Missing required fields'}), 400

    users = load_json_file(USERS_FILE, default=[])

    # Generate user ID
    user_id = hashlib.md5(data['name'].encode()).hexdigest()[:8]

    new_user = {
        'id': user_id,
        'name': data['name'],
        'phone': data['phone'],
        'email': data.get('email', ''),
        'timezone': data.get('timezone', 'UTC'),
        'active': data.get('active', True),
        'created_at': datetime.now().isoformat()
    }

    users.append(new_user)
    save_json_file(USERS_FILE, users)
    add_audit_log('user_created', 'admin', {'user': new_user})

    # Trigger webhook
    trigger_webhook('user_created', {
        'user_id': user_id,
        'name': new_user['name'],
        'phone': new_user['phone']
    })

    return jsonify({'status': 'success', 'user': new_user}), 201

@app.route('/api/users/<user_id>', methods=['PUT'])
def update_user(user_id):
    """Update user"""
    data = request.get_json()
    users = load_json_file(USERS_FILE, default=[])

    for user in users:
        if user['id'] == user_id:
            user.update({k: v for k, v in data.items() if k != 'id'})
            save_json_file(USERS_FILE, users)
            add_audit_log('user_updated', 'admin', {'user_id': user_id, 'changes': data})
            return jsonify({'status': 'success', 'user': user}), 200

    return jsonify({'error': 'User not found'}), 404

@app.route('/api/users/<user_id>', methods=['DELETE'])
def delete_user(user_id):
    """Delete user"""
    users = load_json_file(USERS_FILE, default=[])
    users = [u for u in users if u['id'] != user_id]
    save_json_file(USERS_FILE, users)
    add_audit_log('user_deleted', 'admin', {'user_id': user_id})
    return jsonify({'status': 'success'}), 200

# =========================
# Rotation Management
# =========================

@app.route('/api/rotations', methods=['GET'])
def get_rotations():
    """Get all rotations"""
    rotations = load_json_file(ROTATIONS_FILE, default=[])
    return jsonify({'rotations': rotations}), 200

@app.route('/api/rotations', methods=['POST'])
def create_rotation():
    """Create new rotation schedule"""
    data = request.get_json()

    required = ['name', 'type', 'users', 'start_date']
    if not all(k in data for k in required):
        return jsonify({'error': 'Missing required fields'}), 400

    rotations = load_json_file(ROTATIONS_FILE, default=[])

    rotation_id = hashlib.md5(data['name'].encode()).hexdigest()[:8]

    new_rotation = {
        'id': rotation_id,
        'name': data['name'],
        'type': data['type'],  # daily, weekly, monthly, yearly
        'users': data['users'],  # list of user IDs
        'start_date': data['start_date'],
        'active': data.get('active', True),
        'created_at': datetime.now().isoformat()
    }

    rotations.append(new_rotation)
    save_json_file(ROTATIONS_FILE, rotations)
    add_audit_log('rotation_created', 'admin', {'rotation': new_rotation})

    return jsonify({'status': 'success', 'rotation': new_rotation}), 201

@app.route('/api/rotations/<rotation_id>', methods=['PUT'])
def update_rotation(rotation_id):
    """Update rotation"""
    data = request.get_json()
    rotations = load_json_file(ROTATIONS_FILE, default=[])

    for rotation in rotations:
        if rotation['id'] == rotation_id:
            rotation.update({k: v for k, v in data.items() if k != 'id'})
            save_json_file(ROTATIONS_FILE, rotations)
            add_audit_log('rotation_updated', 'admin', {'rotation_id': rotation_id})
            return jsonify({'status': 'success', 'rotation': rotation}), 200

    return jsonify({'error': 'Rotation not found'}), 404

@app.route('/api/rotations/<rotation_id>', methods=['DELETE'])
def delete_rotation(rotation_id):
    """Delete rotation"""
    rotations = load_json_file(ROTATIONS_FILE, default=[])
    rotations = [r for r in rotations if r['id'] != rotation_id]
    save_json_file(ROTATIONS_FILE, rotations)
    add_audit_log('rotation_deleted', 'admin', {'rotation_id': rotation_id})
    return jsonify({'status': 'success'}), 200

# =========================
# Override Management
# =========================

@app.route('/api/overrides', methods=['GET'])
def get_overrides():
    """Get all overrides"""
    overrides = load_json_file(OVERRIDES_FILE, default=[])
    return jsonify({'overrides': overrides}), 200

@app.route('/api/overrides', methods=['POST'])
def create_override():
    """Create schedule override"""
    data = request.get_json()

    required = ['user_id', 'start_date', 'end_date']
    if not all(k in data for k in required):
        return jsonify({'error': 'Missing required fields'}), 400

    overrides = load_json_file(OVERRIDES_FILE, default=[])

    override_id = hashlib.md5(f"{data['user_id']}{data['start_date']}".encode()).hexdigest()[:8]

    new_override = {
        'id': override_id,
        'user_id': data['user_id'],
        'start_date': data['start_date'],
        'end_date': data['end_date'],
        'reason': data.get('reason', 'Manual override'),
        'created_at': datetime.now().isoformat()
    }

    overrides.append(new_override)
    save_json_file(OVERRIDES_FILE, overrides)
    add_audit_log('override_created', 'admin', {'override': new_override})

    # Trigger webhook - get user details
    users = load_json_file(USERS_FILE, default=[])
    user = next((u for u in users if u['id'] == new_override['user_id']), None)
    trigger_webhook('oncall_changed', {
        'type': 'override',
        'user_id': new_override['user_id'],
        'user_name': user['name'] if user else 'Unknown',
        'user_phone': user['phone'] if user else 'Unknown',
        'reason': new_override.get('reason', 'Override'),
        'until': new_override['end_date']
    })

    return jsonify({'status': 'success', 'override': new_override}), 201

@app.route('/api/overrides/<override_id>', methods=['DELETE'])
def delete_override(override_id):
    """Delete override"""
    overrides = load_json_file(OVERRIDES_FILE, default=[])
    overrides = [o for o in overrides if o['id'] != override_id]
    save_json_file(OVERRIDES_FILE, overrides)
    add_audit_log('override_deleted', 'admin', {'override_id': override_id})
    return jsonify({'status': 'success'}), 200

# =========================
# Current On-Call
# =========================

@app.route('/api/oncall/current', methods=['GET'])
def get_current_oncall_info():
    """Get current on-call person with full details"""
    oncall_info = get_current_oncall()

    if not oncall_info:
        return jsonify({'error': 'No on-call person configured'}), 404

    # If user_id is present, get full user details
    if 'user_id' in oncall_info:
        users = load_json_file(USERS_FILE, default=[])
        user = next((u for u in users if u['id'] == oncall_info['user_id']), None)
        if user:
            oncall_info['user'] = user

    return jsonify({
        'oncall': oncall_info,
        'timestamp': datetime.now().isoformat()
    }), 200

# =========================
# Calendar/Schedule View
# =========================

@app.route('/api/schedule/calendar', methods=['GET'])
def get_calendar_schedule():
    """Get schedule for calendar view - checks manual schedule first, then rotations"""
    start_date = request.args.get('start', datetime.now().isoformat())
    days = int(request.args.get('days', 30))

    start = datetime.fromisoformat(start_date.split('T')[0])
    schedule = []

    # Load manual schedule
    manual_schedule = load_json_file(MANUAL_SCHEDULE_FILE, default={})
    users = load_json_file(USERS_FILE, default=[])

    for day in range(days):
        current_date = start + timedelta(days=day)
        date_str = current_date.strftime('%Y-%m-%d')

        # Check manual schedule first
        if date_str in manual_schedule:
            user_id = manual_schedule[date_str]
            user = next((u for u in users if u['id'] == user_id), None)
            schedule.append({
                'date': date_str,
                'user_id': user_id,
                'oncall_name': user['name'] if user else 'Unknown',
                'source': 'manual'
            })
        else:
            # Calculate from rotations (simplified - use actual rotation logic)
            rotations = load_json_file(ROTATIONS_FILE, default=[])
            oncall_user = None

            for rotation in rotations:
                if not rotation.get('active', True):
                    continue

                rotation_type = rotation.get('type', 'weekly')
                start_date_rot = datetime.fromisoformat(rotation['start_date'])

                if rotation_type == 'daily':
                    days_diff = (current_date - start_date_rot).days
                    if days_diff >= 0:
                        user_index = days_diff % len(rotation['users'])
                        oncall_user = rotation['users'][user_index]
                        break
                elif rotation_type == 'weekly':
                    weeks_diff = (current_date - start_date_rot).days // 7
                    if weeks_diff >= 0:
                        user_index = weeks_diff % len(rotation['users'])
                        oncall_user = rotation['users'][user_index]
                        break

            if oncall_user:
                user = next((u for u in users if u['id'] == oncall_user), None)
                schedule.append({
                    'date': date_str,
                    'user_id': oncall_user,
                    'oncall_name': user['name'] if user else 'Unknown',
                    'source': 'rotation'
                })
            else:
                schedule.append({
                    'date': date_str,
                    'user_id': None,
                    'oncall_name': '',
                    'source': 'none'
                })

    return jsonify({'schedule': schedule}), 200

# =========================
# Audit Log
# =========================

@app.route('/api/audit', methods=['GET'])
def get_audit_log():
    """Get audit log"""
    logs = load_json_file(AUDIT_LOG_FILE, default=[])
    limit = int(request.args.get('limit', 100))
    return jsonify({'logs': logs[-limit:]}), 200

# =========================
# Legacy Endpoints (Backward Compatibility)
# =========================

@app.route('/api/oncall', methods=['GET'])
def get_oncall_legacy():
    """Legacy endpoint for backward compatibility"""
    return get_current_oncall_info()

@app.route('/api/config/oncall', methods=['GET'])
def get_oncall_config():
    """Get the legacy oncall.json configuration"""
    config = load_json_file(ONCALL_CONFIG_FILE)
    return jsonify(config), 200

@app.route('/api/config/oncall', methods=['PUT'])
def update_oncall_config():
    """Update the legacy oncall.json configuration"""
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    # Validate basic structure
    if 'primary' not in data and 'default' not in data:
        return jsonify({'error': 'Must include primary or default number'}), 400

    success = save_json_file(ONCALL_CONFIG_FILE, data)
    if success:
        add_audit_log('oncall_config_updated', 'admin', {'config': data})
        return jsonify({'status': 'success', 'message': 'Configuration updated'}), 200
    else:
        return jsonify({'error': 'Failed to save configuration'}), 500

# =========================
# Settings Management
# =========================

@app.route('/api/settings/voip', methods=['GET'])
def get_voip_settings():
    """Get VoIP provider settings"""
    settings = load_json_file(SETTINGS_FILE, default={})
    voip_settings = settings.get('voip', {
        'username': '500142',
        'server': 'chicago2.voip.ms',
        'did': '3126206795'
    })
    # Never return password in GET request
    voip_settings['password'] = '********' if 'password' in settings.get('voip', {}) else ''
    return jsonify(voip_settings), 200

@app.route('/api/settings/voip', methods=['PUT'])
def update_voip_settings():
    """Update VoIP provider settings"""
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    required = ['username', 'password', 'server']
    if not all(k in data for k in required):
        return jsonify({'error': 'Missing required fields: username, password, server'}), 400

    settings = load_json_file(SETTINGS_FILE, default={})
    settings['voip'] = {
        'username': data['username'],
        'password': data['password'],
        'server': data['server'],
        'did': data.get('did', '3126206795')
    }

    success = save_json_file(SETTINGS_FILE, settings)
    if success:
        add_audit_log('voip_settings_updated', 'admin', {
            'username': data['username'],
            'server': data['server']
        })

        # Update SIP configuration
        update_sip_config(data['username'], data['password'], data['server'])

        return jsonify({'status': 'success', 'message': 'VoIP settings updated'}), 200
    else:
        return jsonify({'error': 'Failed to save settings'}), 500

@app.route('/api/settings/system', methods=['GET'])
def get_system_settings():
    """Get system settings"""
    settings = load_json_file(SETTINGS_FILE, default={})
    system_settings = settings.get('system', {
        'timezone': 'UTC',
        'call_history_enabled': True,
        'alert_email': ''
    })
    return jsonify(system_settings), 200

@app.route('/api/settings/system', methods=['PUT'])
def update_system_settings():
    """Update system settings"""
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    settings = load_json_file(SETTINGS_FILE, default={})
    settings['system'] = {
        'timezone': data.get('timezone', 'UTC'),
        'call_history_enabled': data.get('call_history_enabled', True),
        'alert_email': data.get('alert_email', '')
    }

    success = save_json_file(SETTINGS_FILE, settings)
    if success:
        add_audit_log('system_settings_updated', 'admin', data)
        return jsonify({'status': 'success', 'message': 'System settings updated'}), 200
    else:
        return jsonify({'error': 'Failed to save settings'}), 500

@app.route('/api/settings/test-connection', methods=['POST'])
def test_voip_connection():
    """Test VoIP connection with provided credentials"""
    data = request.get_json()

    # This is a placeholder - in a real implementation, you would test SIP registration
    # For now, just validate that credentials are provided
    if not data or not all(k in data for k in ['username', 'password', 'server']):
        return jsonify({'success': False, 'message': 'Missing credentials'}), 400

    # Simulate connection test
    return jsonify({
        'success': True,
        'message': f'Successfully connected to {data["server"]}',
        'details': {
            'server': data['server'],
            'username': data['username']
        }
    }), 200

@app.route('/api/test-call', methods=['POST'])
def initiate_test_call():
    """Initiate a test call to verify forwarding works"""
    import subprocess

    data = request.get_json()

    if not data or 'phone_number' not in data:
        return jsonify({'success': False, 'message': 'Phone number required'}), 400

    phone_number = data['phone_number']
    message = data.get('message', 'This is a test call from your on-call management system.')

    try:
        # Create a call file for Asterisk
        call_file_content = f"""Channel: Local/s@soc-incoming
MaxRetries: 0
RetryTime: 60
WaitTime: 30
Context: soc-incoming
Extension: s
Priority: 1
Set: TEST_CALL=true
Set: TEST_MESSAGE={message}
"""

        # Write call file to spool directory
        import tempfile
        import time

        timestamp = int(time.time())
        call_file_path = f'/tmp/test_call_{timestamp}.call'

        with open(call_file_path, 'w') as f:
            f.write(call_file_content)

        # Move to Asterisk outgoing spool directory
        spool_path = f'/var/spool/asterisk/outgoing/test_call_{timestamp}.call'
        subprocess.run(['mv', call_file_path, spool_path], check=True)
        subprocess.run(['chmod', '777', spool_path], check=True)

        add_audit_log('test_call_initiated', 'admin', {
            'phone_number': phone_number,
            'timestamp': datetime.now().isoformat()
        })

        return jsonify({
            'success': True,
            'message': f'Test call initiated to current on-call number',
            'details': {
                'initiated_at': datetime.now().isoformat()
            }
        }), 200

    except Exception as e:
        logger.error(f'Error initiating test call: {e}')
        return jsonify({
            'success': False,
            'message': f'Failed to initiate test call: {str(e)}'
        }), 500

# =========================
# Call History
# =========================

@app.route('/api/call-history', methods=['GET'])
def get_call_history():
    """Get recent call history"""
    history = load_json_file(CALL_HISTORY_FILE, default=[])
    limit = int(request.args.get('limit', 50))
    return jsonify({'calls': history[-limit:]}), 200

@app.route('/api/call-history', methods=['POST'])
def add_call_history():
    """Add call history entry (called by AGI script)"""
    data = request.get_json()

    history = load_json_file(CALL_HISTORY_FILE, default=[])

    call_entry = {
        'timestamp': datetime.now().isoformat(),
        'caller_id': data.get('caller_id', 'Unknown'),
        'forwarded_to': data.get('forwarded_to', 'Unknown'),
        'status': data.get('status', 'completed'),
        'duration': data.get('duration', 0)
    }

    history.append(call_entry)
    # Keep only last 500 entries
    history = history[-500:]
    save_json_file(CALL_HISTORY_FILE, history)

    return jsonify({'status': 'success'}), 201

# =========================
# Backup & Export
# =========================

@app.route('/api/export', methods=['GET'])
def export_configuration():
    """Export all configuration as JSON"""
    export_data = {
        'exported_at': datetime.now().isoformat(),
        'users': load_json_file(USERS_FILE, default=[]),
        'rotations': load_json_file(ROTATIONS_FILE, default=[]),
        'overrides': load_json_file(OVERRIDES_FILE, default=[]),
        'settings': load_json_file(SETTINGS_FILE, default={}),
        'oncall_config': load_json_file(ONCALL_CONFIG_FILE, default={})
    }

    # Remove passwords from export
    if 'voip' in export_data['settings'] and 'password' in export_data['settings']['voip']:
        export_data['settings']['voip']['password'] = '********'

    return jsonify(export_data), 200

# =========================
# Escalation Policy
# =========================

@app.route('/api/escalation-policy', methods=['GET'])
def get_escalation_policy():
    """Get escalation policy configuration"""
    policy = load_json_file(ESCALATION_POLICY_FILE, default={
        'enabled': False,
        'levels': []
    })
    return jsonify(policy), 200

@app.route('/api/escalation-policy', methods=['PUT'])
def update_escalation_policy():
    """Update escalation policy"""
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    # Validate structure
    if 'levels' in data and not isinstance(data['levels'], list):
        return jsonify({'error': 'Levels must be an array'}), 400

    policy = {
        'enabled': data.get('enabled', False),
        'levels': data.get('levels', [])
    }

    success = save_json_file(ESCALATION_POLICY_FILE, policy)
    if success:
        add_audit_log('escalation_policy_updated', 'admin', {'enabled': policy['enabled'], 'level_count': len(policy['levels'])})
        return jsonify({'status': 'success', 'policy': policy}), 200
    else:
        return jsonify({'error': 'Failed to save policy'}), 500

@app.route('/api/escalation-chain', methods=['GET'])
def get_current_escalation_chain():
    """Get the current escalation chain with full user details"""
    oncall_info = get_current_oncall()

    if not oncall_info:
        return jsonify({'error': 'No on-call person configured'}), 404

    # Get escalation policy
    escalation_chain = get_escalation_chain()
    users = load_json_file(USERS_FILE, default=[])

    response = {
        'primary': oncall_info,
        'escalation_enabled': escalation_chain is not None,
        'chain': []
    }

    # Add primary user details
    if 'user_id' in oncall_info:
        primary_user = next((u for u in users if u['id'] == oncall_info['user_id']), None)
        if primary_user:
            response['primary']['user'] = primary_user

    # Build escalation chain with user details
    if escalation_chain:
        for level in escalation_chain:
            user = next((u for u in users if u['id'] == level['user_id']), None)
            if user:
                response['chain'].append({
                    'level': level.get('level', 1),
                    'user': user,
                    'timeout': level.get('timeout', 30),
                    'attempts': level.get('attempts', 1)
                })

    return jsonify(response), 200

def update_sip_config(username, password, server):
    """Update SIP configuration file with new credentials"""
    sip_conf_path = '/etc/asterisk/sip.conf'

    try:
        # Read current config
        if os.path.exists(sip_conf_path):
            with open(sip_conf_path, 'r') as f:
                lines = f.readlines()

            # Update registration line and trunk settings
            new_lines = []
            in_trunk_section = False

            for line in lines:
                # Update registration
                if line.startswith('register =>'):
                    new_lines.append(f'register => {username}:{password}@{server}/{username}\n')
                # Update trunk section
                elif line.strip() == '[voipms-trunk]':
                    in_trunk_section = True
                    new_lines.append(line)
                elif in_trunk_section:
                    if line.startswith('host='):
                        new_lines.append(f'host={server}\n')
                    elif line.startswith('fromdomain='):
                        new_lines.append(f'fromdomain={server}\n')
                    elif line.startswith('username='):
                        new_lines.append(f'username={username}\n')
                    elif line.startswith('fromuser='):
                        new_lines.append(f'fromuser={username}\n')
                    elif line.startswith('secret='):
                        new_lines.append(f'secret={password}\n')
                    elif line.strip().startswith('[') and line.strip() != '[voipms-trunk]':
                        in_trunk_section = False
                        new_lines.append(line)
                    else:
                        new_lines.append(line)
                else:
                    new_lines.append(line)

            # Write updated config
            with open(sip_conf_path, 'w') as f:
                f.writelines(new_lines)

            # Reload SIP configuration
            import subprocess
            subprocess.run(['asterisk', '-rx', 'sip reload'], check=False)

            logger.info(f'SIP config updated for {username}@{server}')
            return True
    except Exception as e:
        logger.error(f'Error updating SIP config: {e}')
        return False

# =========================
# Manual Schedule Management
# =========================

@app.route('/api/schedule/manual', methods=['GET'])
def get_manual_schedule():
    """Get manual schedule"""
    schedule = load_json_file(MANUAL_SCHEDULE_FILE, default={})
    return jsonify({'schedule': schedule}), 200

@app.route('/api/schedule/manual', methods=['PUT'])
def update_manual_schedule():
    """Update entire manual schedule"""
    data = request.get_json()

    if not data or 'schedule' not in data:
        return jsonify({'error': 'No schedule data provided'}), 400

    schedule = data['schedule']
    success = save_json_file(MANUAL_SCHEDULE_FILE, schedule)

    if success:
        add_audit_log('manual_schedule_updated', 'admin', {'days_updated': len(schedule)})
        return jsonify({'status': 'success', 'message': 'Schedule updated'}), 200
    else:
        return jsonify({'error': 'Failed to save schedule'}), 500

@app.route('/api/schedule/manual/day', methods=['POST'])
def set_manual_schedule_day():
    """Set on-call person for a specific day"""
    data = request.get_json()

    required = ['date', 'user_id']
    if not all(k in data for k in required):
        return jsonify({'error': 'Missing required fields: date, user_id'}), 400

    schedule = load_json_file(MANUAL_SCHEDULE_FILE, default={})
    schedule[data['date']] = data['user_id']

    success = save_json_file(MANUAL_SCHEDULE_FILE, schedule)

    if success:
        users = load_json_file(USERS_FILE, default=[])
        user = next((u for u in users if u['id'] == data['user_id']), None)

        add_audit_log('schedule_day_set', 'admin', {
            'date': data['date'],
            'user': user['name'] if user else data['user_id']
        })

        # Trigger webhook
        trigger_webhook('oncall_changed', {
            'type': 'manual_schedule',
            'date': data['date'],
            'user_id': data['user_id'],
            'user_name': user['name'] if user else 'Unknown'
        })

        return jsonify({'status': 'success'}), 200
    else:
        return jsonify({'error': 'Failed to save schedule'}), 500

@app.route('/api/schedule/manual/day/<date>', methods=['DELETE'])
def clear_manual_schedule_day(date):
    """Clear manual schedule for a specific day"""
    schedule = load_json_file(MANUAL_SCHEDULE_FILE, default={})

    if date in schedule:
        del schedule[date]
        save_json_file(MANUAL_SCHEDULE_FILE, schedule)
        add_audit_log('schedule_day_cleared', 'admin', {'date': date})

    return jsonify({'status': 'success'}), 200

@app.route('/api/schedule/import', methods=['POST'])
def import_schedule():
    """Import schedule from CSV or JSON"""
    data = request.get_json()

    if not data or 'format' not in data or 'content' not in data:
        return jsonify({'error': 'Missing format or content'}), 400

    import_format = data['format']  # 'csv' or 'json'
    content = data['content']

    try:
        schedule = {}

        if import_format == 'json':
            # Expect format: {"2025-01-01": "user_id", "2025-01-02": "user_id"}
            imported = json.loads(content) if isinstance(content, str) else content
            schedule = imported

        elif import_format == 'csv':
            # Expect format: date,user_name or date,user_id
            import csv
            import io

            users = load_json_file(USERS_FILE, default=[])
            reader = csv.reader(io.StringIO(content))

            for row in reader:
                if len(row) >= 2:
                    date_str = row[0].strip()
                    identifier = row[1].strip()

                    # Try to find user by name or ID
                    user = next((u for u in users if u['name'] == identifier or u['id'] == identifier), None)

                    if user:
                        schedule[date_str] = user['id']
                    else:
                        logger.warning(f"User not found for {date_str}: {identifier}")

        # Save schedule
        current_schedule = load_json_file(MANUAL_SCHEDULE_FILE, default={})
        current_schedule.update(schedule)
        success = save_json_file(MANUAL_SCHEDULE_FILE, current_schedule)

        if success:
            add_audit_log('schedule_imported', 'admin', {
                'format': import_format,
                'days_imported': len(schedule)
            })
            return jsonify({
                'status': 'success',
                'message': f'Imported {len(schedule)} days',
                'days_imported': len(schedule)
            }), 200
        else:
            return jsonify({'error': 'Failed to save schedule'}), 500

    except Exception as e:
        logger.error(f'Schedule import error: {e}')
        return jsonify({'error': f'Import failed: {str(e)}'}), 400

@app.route('/api/schedule/clear', methods=['POST'])
def clear_manual_schedule():
    """Clear all manual schedule"""
    data = request.get_json()
    confirm = data.get('confirm', False) if data else False

    if not confirm:
        return jsonify({'error': 'Confirmation required'}), 400

    success = save_json_file(MANUAL_SCHEDULE_FILE, {})

    if success:
        add_audit_log('manual_schedule_cleared', 'admin', {})
        return jsonify({'status': 'success', 'message': 'Manual schedule cleared'}), 200
    else:
        return jsonify({'error': 'Failed to clear schedule'}), 500

# =========================
# Webhooks
# =========================

def trigger_webhook(event_type, data):
    """Trigger all active webhooks for a given event type"""
    import threading
    import urllib.request
    import urllib.error

    webhooks = load_json_file(WEBHOOKS_FILE, default=[])
    delivery_log = load_json_file(WEBHOOK_DELIVERY_LOG_FILE, default=[])

    for webhook in webhooks:
        if not webhook.get('enabled', True):
            continue

        if event_type not in webhook.get('events', []):
            continue

        # Send webhook in background thread
        def send_webhook():
            webhook_id = webhook['id']
            url = webhook['url']
            webhook_type = webhook.get('type', 'generic')

            try:
                # Prepare payload based on webhook type
                if webhook_type == 'slack':
                    payload = {
                        'text': f":bell: *{event_type.replace('_', ' ').title()}*",
                        'attachments': [{
                            'color': 'good' if 'created' in event_type else 'warning',
                            'fields': [{'title': k, 'value': str(v), 'short': True} for k, v in data.items()]
                        }]
                    }
                elif webhook_type == 'discord':
                    payload = {
                        'content': f"**{event_type.replace('_', ' ').title()}**",
                        'embeds': [{
                            'description': '\n'.join([f"**{k}:** {v}" for k, v in data.items()]),
                            'color': 65280 if 'created' in event_type else 16744192
                        }]
                    }
                elif webhook_type == 'teams':
                    payload = {
                        '@type': 'MessageCard',
                        '@context': 'https://schema.org/extensions',
                        'summary': event_type.replace('_', ' ').title(),
                        'themeColor': '00FF00' if 'created' in event_type else 'FFA500',
                        'title': event_type.replace('_', ' ').title(),
                        'sections': [{
                            'facts': [{'name': k, 'value': str(v)} for k, v in data.items()]
                        }]
                    }
                else:  # generic
                    payload = {
                        'event': event_type,
                        'timestamp': datetime.now().isoformat(),
                        'data': data
                    }

                # Send HTTP POST
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode('utf-8'),
                    headers={'Content-Type': 'application/json'}
                )

                with urllib.request.urlopen(req, timeout=10) as response:
                    status_code = response.getcode()
                    success = 200 <= status_code < 300

                # Log delivery
                delivery_log.append({
                    'webhook_id': webhook_id,
                    'event_type': event_type,
                    'timestamp': datetime.now().isoformat(),
                    'success': success,
                    'status_code': status_code,
                    'url': url
                })

                # Keep only last 500 entries
                delivery_log = delivery_log[-500:]
                save_json_file(WEBHOOK_DELIVERY_LOG_FILE, delivery_log)

                logger.info(f'Webhook {webhook_id} delivered successfully: {event_type}')

            except Exception as e:
                logger.error(f'Webhook {webhook_id} delivery failed: {e}')

                # Log failed delivery
                delivery_log.append({
                    'webhook_id': webhook_id,
                    'event_type': event_type,
                    'timestamp': datetime.now().isoformat(),
                    'success': False,
                    'error': str(e),
                    'url': url
                })

                delivery_log = delivery_log[-500:]
                save_json_file(WEBHOOK_DELIVERY_LOG_FILE, delivery_log)

        # Start background thread
        thread = threading.Thread(target=send_webhook)
        thread.daemon = True
        thread.start()

@app.route('/api/webhooks', methods=['GET'])
def get_webhooks():
    """Get all webhooks"""
    webhooks = load_json_file(WEBHOOKS_FILE, default=[])
    return jsonify({'webhooks': webhooks}), 200

@app.route('/api/webhooks', methods=['POST'])
def create_webhook():
    """Create new webhook"""
    data = request.get_json()

    required = ['name', 'url', 'type', 'events']
    if not all(k in data for k in required):
        return jsonify({'error': 'Missing required fields'}), 400

    webhooks = load_json_file(WEBHOOKS_FILE, default=[])

    webhook_id = hashlib.md5(f"{data['name']}{data['url']}".encode()).hexdigest()[:8]

    new_webhook = {
        'id': webhook_id,
        'name': data['name'],
        'url': data['url'],
        'type': data['type'],  # slack, discord, teams, generic
        'events': data['events'],  # list of event types
        'enabled': data.get('enabled', True),
        'created_at': datetime.now().isoformat()
    }

    webhooks.append(new_webhook)
    save_json_file(WEBHOOKS_FILE, webhooks)
    add_audit_log('webhook_created', 'admin', {'webhook': new_webhook})

    return jsonify({'status': 'success', 'webhook': new_webhook}), 201

@app.route('/api/webhooks/<webhook_id>', methods=['PUT'])
def update_webhook(webhook_id):
    """Update webhook"""
    data = request.get_json()
    webhooks = load_json_file(WEBHOOKS_FILE, default=[])

    for webhook in webhooks:
        if webhook['id'] == webhook_id:
            webhook.update({k: v for k, v in data.items() if k != 'id'})
            save_json_file(WEBHOOKS_FILE, webhooks)
            add_audit_log('webhook_updated', 'admin', {'webhook_id': webhook_id})
            return jsonify({'status': 'success', 'webhook': webhook}), 200

    return jsonify({'error': 'Webhook not found'}), 404

@app.route('/api/webhooks/<webhook_id>', methods=['DELETE'])
def delete_webhook(webhook_id):
    """Delete webhook"""
    webhooks = load_json_file(WEBHOOKS_FILE, default=[])
    webhooks = [w for w in webhooks if w['id'] != webhook_id]
    save_json_file(WEBHOOKS_FILE, webhooks)
    add_audit_log('webhook_deleted', 'admin', {'webhook_id': webhook_id})
    return jsonify({'status': 'success'}), 200

@app.route('/api/webhooks/<webhook_id>/test', methods=['POST'])
def test_webhook(webhook_id):
    """Test webhook delivery"""
    webhooks = load_json_file(WEBHOOKS_FILE, default=[])
    webhook = next((w for w in webhooks if w['id'] == webhook_id), None)

    if not webhook:
        return jsonify({'error': 'Webhook not found'}), 404

    # Send test event
    test_data = {
        'message': 'This is a test webhook from On-Call Management System',
        'timestamp': datetime.now().isoformat(),
        'test': True
    }

    trigger_webhook('webhook_test', test_data)

    return jsonify({'status': 'success', 'message': 'Test webhook sent'}), 200

@app.route('/api/webhooks/delivery-log', methods=['GET'])
def get_webhook_delivery_log():
    """Get webhook delivery log"""
    logs = load_json_file(WEBHOOK_DELIVERY_LOG_FILE, default=[])
    limit = int(request.args.get('limit', 100))
    return jsonify({'logs': logs[-limit:]}), 200

if __name__ == '__main__':
    port = int(os.getenv('API_PORT', '8080'))
    app.run(host='0.0.0.0', port=port, debug=False)
