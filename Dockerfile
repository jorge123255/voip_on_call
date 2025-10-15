FROM debian:bullseye-slim

# Install Asterisk and dependencies
RUN apt-get update && \
    apt-get install -y \
    asterisk \
    python3 \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create necessary directories
RUN mkdir -p /etc/asterisk \
    /var/lib/asterisk/agi-bin \
    /var/log/asterisk \
    /var/spool/asterisk \
    /app/config \
    /app/web

# Copy requirements and install Python dependencies
COPY requirements.txt /tmp/
RUN pip3 install --no-cache-dir -r /tmp/requirements.txt

# Copy Asterisk configuration files
COPY asterisk/configs/sip.conf /etc/asterisk/sip.conf
COPY asterisk/configs/extensions.conf /etc/asterisk/extensions.conf
COPY asterisk/configs/modules.conf /etc/asterisk/modules.conf
COPY asterisk/configs/logger.conf /etc/asterisk/logger.conf

# Copy AGI script
COPY asterisk/agi-bin/call_router.py /var/lib/asterisk/agi-bin/call_router.py
RUN chmod +x /var/lib/asterisk/agi-bin/call_router.py

# Copy web application
COPY scripts/oncall_app.py /app/oncall_app.py
RUN chmod +x /app/oncall_app.py

# Copy web frontend files
COPY web/ /app/web/

# Copy default on-call configuration
COPY config/oncall.json /app/config/oncall.json

# Set environment variables
ENV ONCALL_CONFIG=/app/config/oncall.json
ENV API_PORT=8080

# Expose SIP port (UDP) and management API port
EXPOSE 5060/udp
EXPOSE 5060/tcp
EXPOSE 8080/tcp

# Create startup script
RUN echo '#!/bin/bash\n\
set -e\n\
echo "Starting VOIP Call Forwarder with Web UI..."\n\
\n\
# Start Asterisk in the background\n\
echo "Starting Asterisk PBX..."\n\
asterisk -c -vvv -g &\n\
ASTERISK_PID=$!\n\
\n\
# Wait for Asterisk to start\n\
sleep 5\n\
\n\
# Start enhanced management API with web UI\n\
echo "Starting Management Web UI on port 8080..."\n\
python3 /app/oncall_app.py &\n\
API_PID=$!\n\
\n\
echo "VOIP Call Forwarder started successfully"\n\
echo "Asterisk PID: $ASTERISK_PID"\n\
echo "API PID: $API_PID"\n\
echo "Web UI: http://192.168.1.106:8080"\n\
\n\
# Wait for Asterisk process\n\
wait $ASTERISK_PID\n\
' > /start.sh && chmod +x /start.sh

CMD ["/start.sh"]
