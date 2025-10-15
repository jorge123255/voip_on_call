// Main Application Logic
let currentUsers = [];
let currentRotations = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeTheme();
    updateClock();
    setInterval(updateClock, 1000);
    refreshAll();
    // Refresh activity feed every 30 seconds
    setInterval(() => {
        if (document.querySelector('[data-tab="dashboard"]').classList.contains('active')) {
            loadActivityFeed();
        }
    }, 30000);
});

// Clock
function updateClock() {
    const now = new Date();
    document.getElementById('currentTime').textContent = now.toLocaleTimeString();
}

// Tab Management
function initializeTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            switchTab(tab);
        });
    });
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(tabName).classList.add('active');

    // Load tab-specific data
    if (tabName === 'users') loadUsers();
    if (tabName === 'rotations') loadRotations();
    if (tabName === 'overrides') loadOverrides();
    if (tabName === 'audit') loadAuditLog();
    if (tabName === 'settings') loadSettings();
    if (tabName === 'schedule' || tabName === 'calendar') loadCalendar();
}

// Refresh All
async function refreshAll() {
    await Promise.all([
        loadDashboard(),
        loadUsers(),
        loadRotations(),
        loadOverrides()
    ]);
}

// Dashboard
async function loadDashboard() {
    try {
        const [oncall, status, users, rotations, overrides] = await Promise.all([
            API.getCurrentOncall(),
            API.getStatus(),
            API.getUsers(),
            API.getRotations(),
            API.getOverrides()
        ]);

        // Hero Section
        if (oncall.oncall) {
            const oc = oncall.oncall;
            const user = oc.user || {};
            document.getElementById('heroName').textContent = user.name || oc.name || 'Unknown';
            document.getElementById('heroPhone').textContent = user.phone || oc.number || 'No number';
            document.getElementById('heroBadge').textContent = oc.type || 'active';
        } else {
            document.getElementById('heroName').textContent = 'No On-Call Configured';
            document.getElementById('heroPhone').textContent = '';
            document.getElementById('heroBadge').textContent = 'Inactive';
        }

        // System Status
        const statusEl = document.getElementById('systemStatus');

        // Get VoIP settings to display current provider info
        let voipInfo = '';
        try {
            const voipSettings = await API.getVoipSettings();
            voipInfo = `
                <div class="status-item">
                    <span>VoIP Provider</span>
                    <span style="font-size: 0.9em">${voipSettings.server || 'chicago2.voip.ms'}</span>
                </div>
                <div class="status-item">
                    <span>Account</span>
                    <span style="font-size: 0.9em">${voipSettings.username || '500142'}</span>
                </div>
            `;
        } catch (e) {
            console.error('Failed to load VoIP settings:', e);
        }

        statusEl.innerHTML = `
            <div class="status-item">
                <span>Asterisk PBX</span>
                <span class="status-badge ${status.asterisk ? 'online' : 'offline'}">
                    ${status.asterisk ? 'Online' : 'Offline'}
                </span>
            </div>
            <div class="status-item">
                <span>SIP Trunk</span>
                <span class="status-badge ${status.sip_trunk ? 'online' : 'offline'}">
                    ${status.sip_trunk ? 'Registered' : 'Not Registered'}
                </span>
            </div>
            <div class="status-item">
                <span>API Server</span>
                <span class="status-badge online">Online</span>
            </div>
            ${voipInfo}
            <div class="status-item">
                <span>Last Updated</span>
                <span style="font-size: 0.85em">${new Date().toLocaleTimeString()}</span>
            </div>
        `;

        // Hero Stats
        document.getElementById('heroTotalUsers').textContent = users.users.length;
        document.getElementById('heroActiveRotations').textContent = rotations.rotations.filter(r => r.active).length;

        const now = new Date();
        const activeOverrides = overrides.overrides.filter(o => {
            const start = new Date(o.start_date);
            const end = new Date(o.end_date);
            return start <= now && end >= now;
        }).length;
        document.getElementById('heroActiveOverrides').textContent = activeOverrides;

        // Load activity feed
        await loadActivityFeed();

        // Load next week preview
        await loadNextWeekPreview();

    } catch (error) {
        console.error('Dashboard load error:', error);
        showToast('Error loading dashboard', error.message, 'error');
    }
}

// Users
async function loadUsers() {
    try {
        const data = await API.getUsers();
        currentUsers = data.users;
        renderUsers(data.users);
    } catch (error) {
        console.error('Load users error:', error);
    }
}

function renderUsers(users) {
    const container = document.getElementById('usersList');

    if (users.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👤</div><p>No users yet. Add your first team member!</p></div>';
        return;
    }

    container.innerHTML = users.map(user => `
        <div class="item-card">
            <div class="item-info">
                <h3>${user.name} ${user.active ? '' : '<span class="badge danger">Inactive</span>'}</h3>
                <p>${user.phone} ${user.email ? `• ${user.email}` : ''}</p>
                <small>Timezone: ${user.timezone}</small>
            </div>
            <div class="item-actions">
                <button class="btn btn-small btn-primary" onclick="editUser('${user.id}')">Edit</button>
                <button class="btn btn-small btn-danger" onclick="deleteUserConfirm('${user.id}', '${user.name}')">Delete</button>
            </div>
        </div>
    `).join('');
}

function showUserModal(userId = null) {
    const modal = document.getElementById('userModal');
    modal.classList.add('active');

    if (userId) {
        const user = currentUsers.find(u => u.id === userId);
        document.getElementById('userModalTitle').textContent = 'Edit User';
        document.getElementById('userName').value = user.name;
        document.getElementById('userPhone').value = user.phone;
        document.getElementById('userEmail').value = user.email || '';
        document.getElementById('userTimezone').value = user.timezone;
        document.getElementById('userActive').checked = user.active;
        document.getElementById('userForm').dataset.userId = userId;
    } else {
        document.getElementById('userModalTitle').textContent = 'Add User';
        document.getElementById('userForm').reset();
        delete document.getElementById('userForm').dataset.userId;
    }
}

function editUser(userId) {
    showUserModal(userId);
}

async function saveUser(event) {
    event.preventDefault();

    const form = event.target;
    const userId = form.dataset.userId;

    const userData = {
        name: document.getElementById('userName').value,
        phone: document.getElementById('userPhone').value,
        email: document.getElementById('userEmail').value,
        timezone: document.getElementById('userTimezone').value,
        active: document.getElementById('userActive').checked
    };

    try {
        if (userId) {
            await API.updateUser(userId, userData);
        } else {
            await API.createUser(userData);
        }
        closeModal('userModal');
        loadUsers();
        loadDashboard();
    } catch (error) {
        alert('Error saving user: ' + error.message);
    }
}

async function deleteUserConfirm(userId, userName) {
    if (confirm(`Delete user ${userName}?`)) {
        try {
            await API.deleteUser(userId);
            loadUsers();
            loadDashboard();
        } catch (error) {
            alert('Error deleting user: ' + error.message);
        }
    }
}

// Rotations
async function loadRotations() {
    try {
        const data = await API.getRotations();
        currentRotations = data.rotations;
        renderRotations(data.rotations);
    } catch (error) {
        console.error('Load rotations error:', error);
    }
}

function renderRotations(rotations) {
    const container = document.getElementById('rotationsList');

    if (rotations.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔄</div><p>No rotations configured. Create your first rotation schedule!</p></div>';
        return;
    }

    container.innerHTML = rotations.map(rotation => {
        const userNames = rotation.users.map(uid => {
            const user = currentUsers.find(u => u.id === uid);
            return user ? user.name : uid;
        }).join(', ');

        return `
            <div class="item-card">
                <div class="item-info">
                    <h3>${rotation.name} ${rotation.active ? '<span class="badge success">Active</span>' : '<span class="badge danger">Inactive</span>'}</h3>
                    <p><strong>Type:</strong> ${rotation.type.charAt(0).toUpperCase() + rotation.type.slice(1)}</p>
                    <p><strong>Started:</strong> ${new Date(rotation.start_date).toLocaleDateString()}</p>
                    <p><strong>Team:</strong> ${userNames}</p>
                </div>
                <div class="item-actions">
                    <button class="btn btn-small btn-danger" onclick="deleteRotationConfirm('${rotation.id}', '${rotation.name}')">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

async function showRotationModal() {
    const modal = document.getElementById('rotationModal');
    modal.classList.add('active');

    // Populate users dropdown
    const select = document.getElementById('rotationUsers');
    select.innerHTML = currentUsers.map(user =>
        `<option value="${user.id}">${user.name}</option>`
    ).join('');

    // Set default start date to today
    document.getElementById('rotationStartDate').valueAsDate = new Date();
}

async function saveRotation(event) {
    event.preventDefault();

    const selectedUsers = Array.from(document.getElementById('rotationUsers').selectedOptions)
        .map(option => option.value);

    if (selectedUsers.length === 0) {
        alert('Please select at least one user for the rotation');
        return;
    }

    const rotationData = {
        name: document.getElementById('rotationName').value,
        type: document.getElementById('rotationType').value,
        start_date: document.getElementById('rotationStartDate').value,
        users: selectedUsers,
        active: document.getElementById('rotationActive').checked
    };

    try {
        await API.createRotation(rotationData);
        closeModal('rotationModal');
        loadRotations();
        loadDashboard();
    } catch (error) {
        alert('Error creating rotation: ' + error.message);
    }
}

async function deleteRotationConfirm(rotationId, rotationName) {
    if (confirm(`Delete rotation "${rotationName}"?`)) {
        try {
            await API.deleteRotation(rotationId);
            loadRotations();
            loadDashboard();
        } catch (error) {
            alert('Error deleting rotation: ' + error.message);
        }
    }
}

// Overrides
async function loadOverrides() {
    try {
        const data = await API.getOverrides();
        renderOverrides(data.overrides);
    } catch (error) {
        console.error('Load overrides error:', error);
    }
}

function renderOverrides(overrides) {
    const container = document.getElementById('overridesList');

    if (overrides.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔀</div><p>No overrides configured.</p></div>';
        return;
    }

    const now = new Date();

    container.innerHTML = overrides.map(override => {
        const user = currentUsers.find(u => u.id === override.user_id);
        const start = new Date(override.start_date);
        const end = new Date(override.end_date);
        const isActive = start <= now && end >= now;

        return `
            <div class="item-card">
                <div class="item-info">
                    <h3>${user ? user.name : override.user_id} ${isActive ? '<span class="badge success">Active</span>' : ''}</h3>
                    <p><strong>From:</strong> ${start.toLocaleString()}</p>
                    <p><strong>To:</strong> ${end.toLocaleString()}</p>
                    ${override.reason ? `<p><strong>Reason:</strong> ${override.reason}</p>` : ''}
                </div>
                <div class="item-actions">
                    <button class="btn btn-small btn-danger" onclick="deleteOverrideConfirm('${override.id}')">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

function showOverrideModal() {
    const modal = document.getElementById('overrideModal');
    modal.classList.add('active');

    // Populate users dropdown
    const select = document.getElementById('overrideUser');
    select.innerHTML = currentUsers.map(user =>
        `<option value="${user.id}">${user.name}</option>`
    ).join('');

    // Set default times
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    document.getElementById('overrideStart').value = formatDateTimeLocal(now);
    document.getElementById('overrideEnd').value = formatDateTimeLocal(tomorrow);
}

async function saveOverride(event) {
    event.preventDefault();

    const overrideData = {
        user_id: document.getElementById('overrideUser').value,
        start_date: document.getElementById('overrideStart').value,
        end_date: document.getElementById('overrideEnd').value,
        reason: document.getElementById('overrideReason').value
    };

    try {
        await API.createOverride(overrideData);
        closeModal('overrideModal');
        loadOverrides();
        loadDashboard();
    } catch (error) {
        alert('Error creating override: ' + error.message);
    }
}

async function deleteOverrideConfirm(overrideId) {
    if (confirm('Delete this override?')) {
        try {
            await API.deleteOverride(overrideId);
            loadOverrides();
            loadDashboard();
        } catch (error) {
            alert('Error deleting override: ' + error.message);
        }
    }
}

// Audit Log
async function loadAuditLog() {
    try {
        const data = await API.getAuditLog();
        renderAuditLog(data.logs);
    } catch (error) {
        console.error('Load audit log error:', error);
    }
}

function renderAuditLog(logs) {
    const container = document.getElementById('auditLog');

    if (logs.length === 0) {
        container.innerHTML = '<div class="empty-state">No audit entries</div>';
        return;
    }

    container.innerHTML = logs.reverse().map(log => `
        <div class="audit-entry">
            <div class="audit-entry-header">
                <span class="audit-entry-action">${log.action}</span>
                <span>${new Date(log.timestamp).toLocaleString()}</span>
            </div>
            <div><strong>User:</strong> ${log.user}</div>
            <div><small>${JSON.stringify(log.details)}</small></div>
        </div>
    `).join('');
}

// Modal Management
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Close modals on background click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});

// Helper Functions
function formatDateTimeLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Calendar (simplified)
function previousMonth() {
    alert('Calendar navigation coming soon!');
}

function nextMonth() {
    alert('Calendar navigation coming soon!');
}

// =========================
// Settings
// =========================

async function loadSettings() {
    await Promise.all([
        loadVoipSettings(),
        loadSystemSettings(),
        loadEscalationPolicy(),
        loadCallHistory(),
        loadWebhooks()
    ]);
}

async function loadVoipSettings() {
    try {
        const data = await API.getVoipSettings();
        document.getElementById('voipUsername').value = data.username || '500142';
        document.getElementById('voipServer').value = data.server || 'chicago2.voip.ms';
        document.getElementById('voipDid').value = data.did || '3126206795';
        // Password field stays masked
        if (data.password && data.password !== '********') {
            document.getElementById('voipPassword').value = data.password;
        }
    } catch (error) {
        console.error('Load VoIP settings error:', error);
    }
}

async function loadSystemSettings() {
    try {
        const data = await API.getSystemSettings();
        document.getElementById('systemTimezone').value = data.timezone || 'UTC';
        document.getElementById('enableCallHistory').checked = data.call_history_enabled !== false;
        document.getElementById('alertEmail').value = data.alert_email || '';
    } catch (error) {
        console.error('Load system settings error:', error);
    }
}

async function saveVoipSettings(event) {
    event.preventDefault();

    const settingsData = {
        username: document.getElementById('voipUsername').value,
        password: document.getElementById('voipPassword').value,
        server: document.getElementById('voipServer').value,
        did: document.getElementById('voipDid').value
    };

    try {
        await API.updateVoipSettings(settingsData);
        alert('VoIP settings saved successfully! SIP configuration has been updated.');
        loadDashboard(); // Refresh dashboard to show updated status
    } catch (error) {
        alert('Error saving VoIP settings: ' + error.message);
    }
}

async function saveSystemSettings(event) {
    event.preventDefault();

    const settingsData = {
        timezone: document.getElementById('systemTimezone').value,
        call_history_enabled: document.getElementById('enableCallHistory').checked,
        alert_email: document.getElementById('alertEmail').value
    };

    try {
        await API.updateSystemSettings(settingsData);
        alert('System settings saved successfully!');
    } catch (error) {
        alert('Error saving system settings: ' + error.message);
    }
}

async function testVoipConnection() {
    const credentials = {
        username: document.getElementById('voipUsername').value,
        password: document.getElementById('voipPassword').value,
        server: document.getElementById('voipServer').value
    };

    if (!credentials.username || !credentials.password || !credentials.server) {
        alert('Please fill in all VoIP credentials before testing');
        return;
    }

    try {
        const result = await API.testVoipConnection(credentials);
        if (result.success) {
            alert('✓ Connection test successful!\n\n' + result.message);
        } else {
            alert('✗ Connection test failed\n\n' + result.message);
        }
    } catch (error) {
        alert('✗ Connection test failed\n\n' + error.message);
    }
}

async function loadCallHistory() {
    try {
        const data = await API.getCallHistory(50);
        renderCallHistory(data.calls || []);
    } catch (error) {
        console.error('Load call history error:', error);
    }
}

function renderCallHistory(calls) {
    const container = document.getElementById('callHistoryList');

    if (calls.length === 0) {
        container.innerHTML = '<div class="empty-state">No call history available</div>';
        return;
    }

    container.innerHTML = calls.reverse().map(call => `
        <div class="audit-entry">
            <div class="audit-entry-header">
                <span class="audit-entry-action">Call from ${call.caller_id}</span>
                <span>${new Date(call.timestamp).toLocaleString()}</span>
            </div>
            <div><strong>Forwarded to:</strong> ${call.forwarded_to}</div>
            <div><small>Status: ${call.status} | Duration: ${call.duration}s</small></div>
        </div>
    `).join('');
}

async function exportConfiguration() {
    try {
        const data = await API.exportConfiguration();

        // Create downloadable JSON file
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `oncall-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        alert('Configuration exported successfully!');
    } catch (error) {
        alert('Error exporting configuration: ' + error.message);
    }
}

function showImportModal() {
    alert('Import functionality coming soon! You can manually restore from exported JSON files.');
}

// =========================
// Escalation Policy
// =========================

let escalationLevels = [];

async function loadEscalationPolicy() {
    try {
        const data = await API.getEscalationPolicy();
        document.getElementById('escalationEnabled').checked = data.enabled || false;
        escalationLevels = data.levels || [];
        renderEscalationLevels();
    } catch (error) {
        console.error('Load escalation policy error:', error);
    }
}

function renderEscalationLevels() {
    const container = document.getElementById('escalationLevels');

    if (escalationLevels.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">No escalation levels configured. Add levels below.</p>';
        return;
    }

    container.innerHTML = escalationLevels.map((level, index) => {
        const user = currentUsers.find(u => u.id === level.user_id);
        return `
            <div class="item-card" style="margin-bottom: 12px;">
                <div class="item-info">
                    <h4 style="margin: 0 0 4px 0;">Level ${index + 1}: ${user ? user.name : 'Unknown User'}</h4>
                    <p style="margin: 0; font-size: 14px; color: var(--text-secondary);">
                        ${user ? user.phone : 'No phone'} • Timeout: ${level.timeout || 30}s
                    </p>
                </div>
                <div class="item-actions">
                    <button class="btn btn-small btn-secondary" onclick="editEscalationLevel(${index})">Edit</button>
                    <button class="btn btn-small btn-danger" onclick="removeEscalationLevel(${index})">Remove</button>
                </div>
            </div>
        `;
    }).join('');
}

function addEscalationLevel() {
    if (currentUsers.length === 0) {
        alert('Please add users first before configuring escalation levels.');
        return;
    }

    const userId = prompt('Enter user ID or select from:\n' + currentUsers.map(u => `${u.name} (${u.id})`).join('\n'));
    if (!userId) return;

    const user = currentUsers.find(u => u.id === userId || u.name === userId);
    if (!user) {
        alert('User not found. Please enter a valid user ID or name.');
        return;
    }

    const timeout = prompt('Enter timeout in seconds (default: 30):', '30');
    const timeoutNum = parseInt(timeout) || 30;

    escalationLevels.push({
        user_id: user.id,
        timeout: timeoutNum,
        level: escalationLevels.length + 1
    });

    renderEscalationLevels();
}

function editEscalationLevel(index) {
    const level = escalationLevels[index];
    const newTimeout = prompt(`Enter new timeout in seconds for level ${index + 1}:`, level.timeout || 30);

    if (newTimeout !== null) {
        escalationLevels[index].timeout = parseInt(newTimeout) || 30;
        renderEscalationLevels();
    }
}

function removeEscalationLevel(index) {
    if (confirm(`Remove escalation level ${index + 1}?`)) {
        escalationLevels.splice(index, 1);
        // Re-number levels
        escalationLevels.forEach((level, idx) => {
            level.level = idx + 1;
        });
        renderEscalationLevels();
    }
}

function toggleEscalation() {
    const enabled = document.getElementById('escalationEnabled').checked;
    if (enabled && escalationLevels.length === 0) {
        alert('Please add at least one escalation level before enabling.');
        document.getElementById('escalationEnabled').checked = false;
    }
}

async function saveEscalationPolicy() {
    const enabled = document.getElementById('escalationEnabled').checked;

    if (enabled && escalationLevels.length === 0) {
        showToast('Validation Error', 'Please add at least one escalation level before enabling.', 'warning');
        return;
    }

    const policyData = {
        enabled: enabled,
        levels: escalationLevels
    };

    try {
        await API.updateEscalationPolicy(policyData);
        showToast('Success', 'Escalation policy saved successfully!', 'success');
    } catch (error) {
        showToast('Error', 'Error saving escalation policy: ' + error.message, 'error');
    }
}

// =========================
// Dark Mode
// =========================

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeButtons(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeButtons(newTheme);
}

function updateThemeButtons(theme) {
    const lightBtn = document.getElementById('lightBtn');
    const darkBtn = document.getElementById('darkBtn');

    if (theme === 'dark') {
        lightBtn.classList.remove('active');
        darkBtn.classList.add('active');
    } else {
        lightBtn.classList.add('active');
        darkBtn.classList.remove('active');
    }
}

// =========================
// Toast Notifications
// =========================

function showToast(title, message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '✓',
        error: '✗',
        warning: '⚠',
        info: 'ℹ'
    };

    toast.innerHTML = `
        <div class="toast-icon">${icons[type]}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(toast);

    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'slideIn 0.3s ease-out reverse';
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);
}

// =========================
// Activity Feed
// =========================

async function loadActivityFeed() {
    try {
        const [auditLog, callHistory] = await Promise.all([
            API.getAuditLog(10),
            API.getCallHistory(5)
        ]);

        const activities = [];

        // Add call history
        (callHistory.calls || []).forEach(call => {
            activities.push({
                type: 'call',
                title: `Call from ${call.caller_id}`,
                details: `Forwarded to ${call.forwarded_to} • ${call.status}`,
                time: new Date(call.timestamp)
            });
        });

        // Add recent audit events
        (auditLog.logs || []).slice(-5).forEach(log => {
            let type = 'user';
            if (log.action.includes('rotation')) type = 'rotation';
            if (log.action.includes('call')) type = 'call';

            activities.push({
                type: type,
                title: log.action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                details: `By ${log.user}`,
                time: new Date(log.timestamp)
            });
        });

        // Sort by time
        activities.sort((a, b) => b.time - a.time);

        renderActivityFeed(activities.slice(0, 8));

    } catch (error) {
        console.error('Load activity feed error:', error);
    }
}

function renderActivityFeed(activities) {
    const container = document.getElementById('activityFeed');

    if (activities.length === 0) {
        container.innerHTML = '<div class="empty-state">No recent activity</div>';
        return;
    }

    container.innerHTML = activities.map(activity => {
        const timeAgo = getTimeAgo(activity.time);
        const icons = {
            call: '📞',
            user: '👤',
            rotation: '🔄'
        };

        return `
            <div class="activity-item">
                <div class="activity-icon ${activity.type}">
                    ${icons[activity.type] || '📋'}
                </div>
                <div class="activity-content">
                    <div class="activity-title">${activity.title}</div>
                    <div class="activity-details">${activity.details}</div>
                </div>
                <div class="activity-time">${timeAgo}</div>
            </div>
        `;
    }).join('');
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

// =========================
// Quick Actions
// =========================

function showQuickOverride() {
    const modal = document.getElementById('quickOverrideModal');
    modal.classList.add('active');

    const select = document.getElementById('quickOverrideUser');
    select.innerHTML = currentUsers.map(user =>
        `<option value="${user.id}">${user.name} (${user.phone})</option>`
    ).join('');

    document.getElementById('quickOverrideDuration').addEventListener('change', (e) => {
        document.getElementById('customDurationGroup').style.display =
            e.target.value === 'custom' ? 'block' : 'none';
    });
}

async function saveQuickOverride(event) {
    event.preventDefault();

    const userId = document.getElementById('quickOverrideUser').value;
    let hours = document.getElementById('quickOverrideDuration').value;

    if (hours === 'custom') {
        hours = document.getElementById('customDuration').value;
    }

    const now = new Date();
    const endTime = new Date(now.getTime() + hours * 60 * 60 * 1000);

    const overrideData = {
        user_id: userId,
        start_date: now.toISOString(),
        end_date: endTime.toISOString(),
        reason: `Quick override for ${hours} hour(s)`
    };

    try {
        await API.createOverride(overrideData);
        closeModal('quickOverrideModal');
        showToast('Success', `Override created for ${hours} hour(s)`, 'success');
        loadDashboard();
        loadOverrides();
    } catch (error) {
        showToast('Error', 'Failed to create override: ' + error.message, 'error');
    }
}

function showSwapModal() {
    const modal = document.getElementById('swapModal');
    modal.classList.add('active');

    const select = document.getElementById('swapWithUser');
    select.innerHTML = currentUsers.map(user =>
        `<option value="${user.id}">${user.name} (${user.phone})</option>`
    ).join('');
}

async function saveSwap(event) {
    event.preventDefault();

    const swapWithUserId = document.getElementById('swapWithUser').value;
    const hours = document.getElementById('swapDuration').value;

    const now = new Date();
    const endTime = new Date(now.getTime() + parseInt(hours) * 60 * 60 * 1000);

    const overrideData = {
        user_id: swapWithUserId,
        start_date: now.toISOString(),
        end_date: endTime.toISOString(),
        reason: `Swapped on-call for ${hours/24} day(s)`
    };

    try {
        await API.createOverride(overrideData);
        closeModal('swapModal');
        showToast('Success', 'On-call swapped successfully!', 'success');
        loadDashboard();
        loadOverrides();
    } catch (error) {
        showToast('Error', 'Failed to swap on-call: ' + error.message, 'error');
    }
}

// =========================
// Next Week Preview
// =========================

async function loadNextWeekPreview() {
    try {
        const today = new Date();
        const startDate = today.toISOString().split('T')[0];
        const data = await API.getCalendar(startDate, 7);

        renderNextWeekPreview(data.schedule || []);
    } catch (error) {
        console.error('Load next week preview error:', error);
        document.getElementById('nextWeekPreview').innerHTML =
            '<div class="empty-state">Unable to load schedule preview</div>';
    }
}

function renderNextWeekPreview(schedule) {
    const container = document.getElementById('nextWeekPreview');

    if (schedule.length === 0) {
        container.innerHTML = '<div class="empty-state">No schedule data available</div>';
        return;
    }

    container.innerHTML = schedule.map(day => {
        const date = new Date(day.date);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const dayNum = date.getDate();
        const isToday = date.toDateString() === new Date().toDateString();

        return `
            <div class="preview-day ${isToday ? 'today' : ''}">
                <div class="preview-day-name">${dayName}</div>
                <div class="preview-day-num">${dayNum}</div>
                <div class="preview-day-oncall">${day.oncall_name || 'TBD'}</div>
            </div>
        `;
    }).join('');
}

// =========================
// Visual Calendar
// =========================

let currentCalendarDate = new Date();

async function loadCalendar() {
    try {
        const year = currentCalendarDate.getFullYear();
        const month = currentCalendarDate.getMonth();

        // Get first day of month
        const firstDay = new Date(year, month, 1);
        const startDate = firstDay.toISOString().split('T')[0];

        // Get number of days in month
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const data = await API.getCalendar(startDate, daysInMonth);

        renderCalendar(data.schedule || []);
    } catch (error) {
        console.error('Load calendar error:', error);
        showToast('Error', 'Failed to load calendar', 'error');
    }
}

function renderCalendar(schedule) {
    const container = document.getElementById('calendarGrid');
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    // Update month/year display
    document.getElementById('currentMonth').textContent =
        currentCalendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday

    // Build calendar grid
    let html = '<div class="calendar-weekdays">';
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
        html += `<div class="calendar-weekday">${day}</div>`;
    });
    html += '</div><div class="calendar-days">';

    // Empty cells before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
        html += '<div class="calendar-day empty"></div>';
    }

    // Days of month
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateStr = date.toISOString().split('T')[0];
        const isToday = date.toDateString() === today.toDateString();

        // Find who's on-call this day
        const daySchedule = schedule.find(s => s.date === dateStr);
        const oncallName = daySchedule ? daySchedule.oncall_name : '';
        const oncallColor = daySchedule ? getColorForUser(daySchedule.oncall_name) : '';
        const source = daySchedule ? daySchedule.source : 'none';
        const isManual = source === 'manual';

        html += `
            <div class="calendar-day ${isToday ? 'today' : ''} ${isManual ? 'manual-assignment' : ''}"
                 style="${oncallColor ? `background-color: ${oncallColor}` : ''}"
                 onclick="selectCalendarDay('${dateStr}', '${oncallName}', '${source}')"
                 title="${oncallName ? oncallName + (isManual ? ' (Manual)' : ' (From Rotation)') : 'Click to assign'}">
                <div class="calendar-day-num">
                    ${day}
                    ${isManual ? '<span style="font-size: 10px;">📌</span>' : ''}
                </div>
                <div class="calendar-day-oncall">${oncallName}</div>
            </div>
        `;
    }

    html += '</div>';
    container.innerHTML = html;
}

function getColorForUser(userName) {
    // Generate consistent color for each user
    if (!userName) return '';

    let hash = 0;
    for (let i = 0; i < userName.length; i++) {
        hash = userName.charCodeAt(i) + ((hash << 5) - hash);
    }

    const hue = Math.abs(hash % 360);
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const saturation = 70;
    const lightness = isDark ? 35 : 85;

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function selectCalendarDay(dateStr, oncallName, source) {
    // Show modal to assign/change on-call for this day
    showScheduleDayModal(dateStr, oncallName, source);
}

function showScheduleDayModal(dateStr, currentName, source) {
    const modal = document.getElementById('scheduleDayModal');
    modal.classList.add('active');

    const formattedDate = new Date(dateStr).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    document.getElementById('scheduleDayDate').textContent = formattedDate;
    document.getElementById('scheduleDayDateValue').value = dateStr;
    document.getElementById('scheduleDayCurrentAssignment').textContent =
        currentName || 'Not assigned';
    document.getElementById('scheduleDaySource').textContent =
        source === 'manual' ? ' (Manual)' : source === 'rotation' ? ' (From Rotation)' : '';

    // Populate user dropdown
    const select = document.getElementById('scheduleDayUser');
    select.innerHTML = '<option value="">-- Clear Assignment --</option>' +
        currentUsers.map(user =>
            `<option value="${user.id}">${user.name}</option>`
        ).join('');
}

async function saveScheduleDay(event) {
    event.preventDefault();

    const dateStr = document.getElementById('scheduleDayDateValue').value;
    const userId = document.getElementById('scheduleDayUser').value;

    try {
        if (userId) {
            // Set assignment
            await API.setScheduleDay(dateStr, userId);
            const user = currentUsers.find(u => u.id === userId);
            showToast('Success', `${user.name} assigned to ${dateStr}`, 'success');
        } else {
            // Clear assignment
            await API.clearScheduleDay(dateStr);
            showToast('Success', `Cleared assignment for ${dateStr}`, 'success');
        }

        closeModal('scheduleDayModal');
        loadCalendar();  // Reload calendar to show changes
    } catch (error) {
        showToast('Error', 'Failed to update schedule: ' + error.message, 'error');
    }
}

function previousMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    loadCalendar();
}

function nextMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    loadCalendar();
}

function goToToday() {
    currentCalendarDate = new Date();
    loadCalendar();
}

// =========================
// Schedule Import/Export
// =========================

function showImportScheduleModal() {
    const modal = document.getElementById('importScheduleModal');
    modal.classList.add('active');
}

async function importSchedule(event) {
    event.preventDefault();

    const format = document.getElementById('importFormat').value;
    const content = document.getElementById('importContent').value;

    if (!content.trim()) {
        showToast('Error', 'Please provide schedule data', 'error');
        return;
    }

    try {
        const result = await API.importSchedule(format, content);
        closeModal('importScheduleModal');
        showToast('Success', `Imported ${result.days_imported} days successfully!`, 'success');
        loadCalendar();
    } catch (error) {
        showToast('Error', 'Failed to import schedule: ' + error.message, 'error');
    }
}

async function exportSchedule() {
    try {
        const data = await API.getManualSchedule();
        const schedule = data.schedule || {};

        if (Object.keys(schedule).length === 0) {
            showToast('Info', 'No manual schedule to export', 'info');
            return;
        }

        // Create CSV format
        const users = currentUsers;
        let csv = 'Date,User Name,User ID\n';

        Object.keys(schedule).sort().forEach(date => {
            const userId = schedule[date];
            const user = users.find(u => u.id === userId);
            csv += `${date},${user ? user.name : 'Unknown'},${userId}\n`;
        });

        // Download CSV
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `oncall-schedule-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('Success', 'Schedule exported to CSV', 'success');
    } catch (error) {
        showToast('Error', 'Failed to export schedule: ' + error.message, 'error');
    }
}

async function clearManualSchedule() {
    if (!confirm('Are you sure you want to clear the entire manual schedule? This will revert to using rotations only.')) {
        return;
    }

    try {
        await API.clearManualSchedule();
        showToast('Success', 'Manual schedule cleared', 'success');
        loadCalendar();
    } catch (error) {
        showToast('Error', 'Failed to clear schedule: ' + error.message, 'error');
    }
}

// =========================
// Test Call
// =========================

async function initiateTestCall() {
    try {
        // Get current on-call
        const oncallData = await API.getCurrentOncall();

        if (!oncallData || !oncallData.oncall) {
            showToast('Error', 'No on-call person configured', 'error');
            return;
        }

        const oncall = oncallData.oncall;
        const user = oncall.user;
        const phoneNumber = user ? user.phone : oncall.number;

        if (!phoneNumber) {
            showToast('Error', 'No phone number configured for on-call person', 'error');
            return;
        }

        // Confirm before initiating
        const userName = user ? user.name : oncall.name || 'on-call person';
        if (!confirm(`Initiate test call to ${userName} at ${phoneNumber}?`)) {
            return;
        }

        showToast('Test Call', 'Initiating test call...', 'info');

        const result = await API.testCall(phoneNumber, 'Test call from On-Call Management System');

        if (result.success) {
            showToast('Success', result.message, 'success');
            document.getElementById('testCallStatus').innerHTML = `
                <div style="padding: 12px; background: var(--success-color); color: white; border-radius: 6px;">
                    ✓ Test call initiated successfully to ${userName} (${phoneNumber})<br>
                    <small>Initiated at: ${new Date(result.details.initiated_at).toLocaleTimeString()}</small>
                </div>
            `;

            // Refresh call history after a few seconds
            setTimeout(() => {
                loadCallHistory();
            }, 3000);
        } else {
            showToast('Error', result.message, 'error');
            document.getElementById('testCallStatus').innerHTML = `
                <div style="padding: 12px; background: var(--danger-color); color: white; border-radius: 6px;">
                    ✗ Test call failed: ${result.message}
                </div>
            `;
        }
    } catch (error) {
        console.error('Test call error:', error);
        showToast('Error', 'Failed to initiate test call: ' + error.message, 'error');
        document.getElementById('testCallStatus').innerHTML = `
            <div style="padding: 12px; background: var(--danger-color); color: white; border-radius: 6px;">
                ✗ Test call failed: ${error.message}
            </div>
        `;
    }
}

// =========================
// Webhooks
// =========================

let currentWebhooks = [];

async function loadWebhooks() {
    try {
        const data = await API.getWebhooks();
        currentWebhooks = data.webhooks || [];
        renderWebhooks(currentWebhooks);
    } catch (error) {
        console.error('Load webhooks error:', error);
    }
}

function renderWebhooks(webhooks) {
    const container = document.getElementById('webhooksList');

    if (webhooks.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔔</div><p>No webhooks configured. Add your first webhook!</p></div>';
        return;
    }

    const typeIcons = {
        slack: '💬',
        discord: '🎮',
        teams: '👥',
        generic: '🔗'
    };

    container.innerHTML = webhooks.map(webhook => `
        <div class="item-card">
            <div class="item-info">
                <h3>
                    ${typeIcons[webhook.type] || '🔗'} ${webhook.name}
                    ${webhook.enabled ? '<span class="badge success">Enabled</span>' : '<span class="badge danger">Disabled</span>'}
                </h3>
                <p><strong>Type:</strong> ${webhook.type.charAt(0).toUpperCase() + webhook.type.slice(1)}</p>
                <p><strong>URL:</strong> <code style="font-size: 12px;">${webhook.url.substring(0, 50)}...</code></p>
                <p><strong>Events:</strong> ${webhook.events.join(', ')}</p>
            </div>
            <div class="item-actions">
                <button class="btn btn-small btn-secondary" onclick="testWebhookDelivery('${webhook.id}')">Test</button>
                <button class="btn btn-small btn-danger" onclick="deleteWebhookConfirm('${webhook.id}', '${webhook.name}')">Delete</button>
            </div>
        </div>
    `).join('');
}

function showWebhookModal() {
    const modal = document.getElementById('webhookModal');
    modal.classList.add('active');

    document.getElementById('webhookModalTitle').textContent = 'Add Webhook';
    document.getElementById('webhookForm').reset();

    // Uncheck all event checkboxes
    document.querySelectorAll('.webhook-event').forEach(cb => cb.checked = false);

    delete document.getElementById('webhookForm').dataset.webhookId;
}

async function saveWebhook(event) {
    event.preventDefault();

    const form = event.target;
    const webhookId = form.dataset.webhookId;

    // Get selected events
    const selectedEvents = Array.from(document.querySelectorAll('.webhook-event:checked'))
        .map(cb => cb.value);

    if (selectedEvents.length === 0) {
        showToast('Validation Error', 'Please select at least one event to monitor', 'warning');
        return;
    }

    const webhookData = {
        name: document.getElementById('webhookName').value,
        type: document.getElementById('webhookType').value,
        url: document.getElementById('webhookUrl').value,
        events: selectedEvents,
        enabled: document.getElementById('webhookEnabled').checked
    };

    try {
        if (webhookId) {
            await API.updateWebhook(webhookId, webhookData);
            showToast('Success', 'Webhook updated successfully!', 'success');
        } else {
            await API.createWebhook(webhookData);
            showToast('Success', 'Webhook created successfully!', 'success');
        }
        closeModal('webhookModal');
        loadWebhooks();
    } catch (error) {
        showToast('Error', 'Error saving webhook: ' + error.message, 'error');
    }
}

async function testWebhookDelivery(webhookId) {
    try {
        const result = await API.testWebhook(webhookId);
        showToast('Test Sent', 'Test webhook sent! Check your endpoint for delivery.', 'success');

        // Reload delivery log after a moment
        setTimeout(() => {
            loadWebhookDeliveryLog();
        }, 2000);
    } catch (error) {
        showToast('Error', 'Failed to send test webhook: ' + error.message, 'error');
    }
}

async function deleteWebhookConfirm(webhookId, webhookName) {
    if (confirm(`Delete webhook "${webhookName}"?`)) {
        try {
            await API.deleteWebhook(webhookId);
            showToast('Success', 'Webhook deleted', 'success');
            loadWebhooks();
        } catch (error) {
            showToast('Error', 'Error deleting webhook: ' + error.message, 'error');
        }
    }
}

async function loadWebhookDeliveryLog() {
    try {
        const data = await API.getWebhookDeliveryLog(50);
        renderWebhookDeliveryLog(data.logs || []);
    } catch (error) {
        console.error('Load webhook delivery log error:', error);
    }
}

function renderWebhookDeliveryLog(logs) {
    const container = document.getElementById('webhookDeliveryLog');

    if (logs.length === 0) {
        container.innerHTML = '<div class="empty-state">No webhook deliveries yet</div>';
        return;
    }

    container.innerHTML = logs.reverse().map(log => `
        <div class="audit-entry">
            <div class="audit-entry-header">
                <span class="audit-entry-action">
                    ${log.success ? '✓' : '✗'} ${log.event_type}
                </span>
                <span>${new Date(log.timestamp).toLocaleString()}</span>
            </div>
            <div><strong>Webhook ID:</strong> ${log.webhook_id}</div>
            <div><strong>URL:</strong> <code style="font-size: 11px;">${log.url}</code></div>
            ${log.success ?
                `<div><strong>Status:</strong> <span style="color: var(--success-color);">${log.status_code}</span></div>` :
                `<div><strong>Error:</strong> <span style="color: var(--danger-color);">${log.error}</span></div>`
            }
        </div>
    `).join('');
}
