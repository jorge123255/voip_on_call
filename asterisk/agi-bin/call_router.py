#!/usr/bin/env python3
"""
Asterisk AGI Script for Call Routing
Determines which on-call person to forward the call to
"""

import sys
import json
import os
from datetime import datetime


class AGI:
    """Simple AGI interface for Asterisk"""

    def __init__(self):
        self.env = {}
        self._read_environment()

    def _read_environment(self):
        """Read AGI environment variables"""
        while True:
            line = sys.stdin.readline().strip()
            if not line:
                break
            key, value = line.split(':', 1)
            self.env[key.strip()] = value.strip()

    def verbose(self, message, level=1):
        """Log verbose message"""
        sys.stdout.write(f'VERBOSE "{message}" {level}\n')
        sys.stdout.flush()
        sys.stdin.readline()

    def set_variable(self, name, value):
        """Set a channel variable"""
        sys.stdout.write(f'SET VARIABLE {name} "{value}"\n')
        sys.stdout.flush()
        sys.stdin.readline()

    def get_variable(self, name):
        """Get a channel variable"""
        sys.stdout.write(f'GET VARIABLE {name}\n')
        sys.stdout.flush()
        result = sys.stdin.readline().strip()
        if '200 result=1' in result:
            # Extract value from parentheses
            start = result.find('(')
            end = result.find(')')
            if start != -1 and end != -1:
                return result[start + 1:end]
        return ''


def load_oncall_config():
    """Load on-call configuration from JSON file"""
    config_file = os.getenv('ONCALL_CONFIG', '/app/config/oncall.json')

    try:
        with open(config_file, 'r') as f:
            return json.load(f)
    except Exception as e:
        return {'error': str(e)}


def get_escalation_chain():
    """Get the full escalation chain from the API"""
    import urllib.request
    import urllib.error

    try:
        api_url = 'http://localhost:8080/api/escalation-chain'
        req = urllib.request.Request(api_url)

        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            return data

    except Exception as e:
        sys.stderr.write(f"Escalation chain API call failed: {str(e)}\n")
        return None


def get_oncall_number():
    """Determine the on-call person's phone number by calling the API"""
    import urllib.request
    import urllib.error

    try:
        # Call the API endpoint that handles overrides, rotations, and schedules
        api_url = 'http://localhost:8080/api/oncall/current'
        req = urllib.request.Request(api_url)

        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))

            if 'oncall' in data:
                oncall_info = data['oncall']

                # Check if user object has phone number (from users/overrides/rotations)
                if 'user' in oncall_info and 'phone' in oncall_info['user']:
                    return oncall_info['user']['phone']

                # Fall back to direct number (from legacy schedule)
                if 'number' in oncall_info:
                    return oncall_info['number']

        return None

    except Exception as e:
        # If API fails, fall back to reading the config file directly
        sys.stderr.write(f"API call failed: {str(e)}, falling back to config file\n")

        config = load_oncall_config()
        if 'error' in config:
            return None

        # Check for active schedule
        if 'schedule' in config and config['schedule']:
            now = datetime.now()
            current_day = now.strftime('%A').lower()
            current_hour = now.hour

            for entry in config['schedule']:
                day = entry.get('day', '').lower()
                start_hour = entry.get('start_hour', 0)
                end_hour = entry.get('end_hour', 24)

                if day == current_day:
                    if start_hour <= current_hour < end_hour:
                        return entry.get('number')

        # Fall back to primary on-call
        if 'primary' in config:
            return config['primary']

        # Fall back to default
        if 'default' in config:
            return config['default']

        return None


def main():
    """Main AGI script execution"""
    agi = AGI()

    # Log the call
    caller_id = agi.env.get('agi_callerid', 'Unknown')
    agi.verbose(f"Call Router AGI: Processing call from {caller_id}")

    # Get the on-call number
    oncall_number = get_oncall_number()

    if oncall_number:
        agi.verbose(f"Call Router AGI: Primary routing to {oncall_number}")
        agi.set_variable('ONCALL_NUMBER', oncall_number)
        agi.set_variable('ONCALL_LEVEL1', oncall_number)
    else:
        agi.verbose("Call Router AGI: No on-call number found")
        agi.set_variable('ONCALL_NUMBER', '')
        agi.set_variable('ONCALL_LEVEL1', '')

    # Get escalation chain
    escalation_data = get_escalation_chain()

    if escalation_data and escalation_data.get('escalation_enabled'):
        chain = escalation_data.get('chain', [])
        agi.verbose(f"Call Router AGI: Escalation enabled with {len(chain)} levels")

        # Set escalation variables
        agi.set_variable('ESCALATION_ENABLED', '1')
        agi.set_variable('ESCALATION_LEVELS', str(len(chain)))

        # Set each escalation level
        for idx, level in enumerate(chain, start=2):  # Start at level 2 (primary is level 1)
            if 'user' in level and 'phone' in level['user']:
                phone = level['user']['phone']
                timeout = level.get('timeout', 30)
                agi.verbose(f"Call Router AGI: Level {idx} = {phone} (timeout: {timeout}s)")
                agi.set_variable(f'ONCALL_LEVEL{idx}', phone)
                agi.set_variable(f'ONCALL_TIMEOUT{idx}', str(timeout))
    else:
        agi.verbose("Call Router AGI: Escalation disabled")
        agi.set_variable('ESCALATION_ENABLED', '0')
        agi.set_variable('ESCALATION_LEVELS', '1')

    # Log additional info
    config = load_oncall_config()
    agi.verbose(f"Call Router AGI: Config loaded: {json.dumps(config)}")


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        # Log error to stderr (will appear in Asterisk logs)
        sys.stderr.write(f"AGI ERROR: {str(e)}\n")
        sys.exit(1)
