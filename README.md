# VoIP On-Call Management System

A complete on-call management and call forwarding system with web-based UI, built with Flask, Asterisk, and Docker.

## Features

- **On-Call Scheduling**: Flexible rotation system with daily, weekly, monthly, and yearly rotations
- **Manual Schedule Management**: Import existing schedules via CSV/JSON or click-to-assign on calendar
- **Schedule Overrides**: Temporary overrides for vacations, swaps, or emergencies
- **Escalation Policy**: Automatic cascading to backup on-call personnel
- **VoIP Integration**: Direct integration with voip.ms (and other SIP providers)
- **Call Forwarding**: Automatic call routing to current on-call person
- **Web Interface**: Modern, responsive UI with dark mode support
- **Webhook Notifications**: Send alerts to Slack, Discord, Teams, or custom endpoints
- **Audit Logging**: Complete audit trail of all changes
- **Call History**: Track all forwarded calls
- **Test Call Feature**: Test your call forwarding setup

## Quick Start

### Using Docker (Recommended)

```bash
docker run -d \
  --name voip-call-forwarder \
  --network=bridge \
  -p 8765:8765 \
  -v /path/to/config:/app/config \
  sunnyside1/voip_on_call:latest
```

### Using Docker Compose

```yaml
version: '3.8'
services:
  voip-forwarder:
    image: sunnyside1/voip_on_call:latest
    container_name: voip-call-forwarder
    ports:
      - "8765:8765"
    volumes:
      - ./config:/app/config
    restart: unless-stopped
```

## Configuration

Access the web interface at http://localhost:8765

1. Configure VoIP provider credentials
2. Add team members
3. Create rotation schedules or import existing schedule
4. Set up escalation policy (optional)
5. Configure webhooks for notifications (optional)

## Manual Schedule Import

Import your existing schedules via CSV or JSON, or click any calendar day to assign on-call personnel!

See full documentation in the repository.

## License

MIT License
