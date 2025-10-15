// API Client for On-Call Management System
const API_BASE = window.location.origin;

class API {
    static async request(endpoint, options = {}) {
        try {
            const response = await fetch(`${API_BASE}${endpoint}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // System
    static getStatus() {
        return this.request('/api/status');
    }

    // Users
    static getUsers() {
        return this.request('/api/users');
    }

    static createUser(userData) {
        return this.request('/api/users', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    }

    static updateUser(userId, userData) {
        return this.request(`/api/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify(userData)
        });
    }

    static deleteUser(userId) {
        return this.request(`/api/users/${userId}`, {
            method: 'DELETE'
        });
    }

    // Rotations
    static getRotations() {
        return this.request('/api/rotations');
    }

    static createRotation(rotationData) {
        return this.request('/api/rotations', {
            method: 'POST',
            body: JSON.stringify(rotationData)
        });
    }

    static updateRotation(rotationId, rotationData) {
        return this.request(`/api/rotations/${rotationId}`, {
            method: 'PUT',
            body: JSON.stringify(rotationData)
        });
    }

    static deleteRotation(rotationId) {
        return this.request(`/api/rotations/${rotationId}`, {
            method: 'DELETE'
        });
    }

    // Overrides
    static getOverrides() {
        return this.request('/api/overrides');
    }

    static createOverride(overrideData) {
        return this.request('/api/overrides', {
            method: 'POST',
            body: JSON.stringify(overrideData)
        });
    }

    static deleteOverride(overrideId) {
        return this.request(`/api/overrides/${overrideId}`, {
            method: 'DELETE'
        });
    }

    // On-Call
    static getCurrentOncall() {
        return this.request('/api/oncall/current');
    }

    // Audit
    static getAuditLog(limit = 100) {
        return this.request(`/api/audit?limit=${limit}`);
    }

    // Calendar
    static getCalendar(startDate, days = 30) {
        return this.request(`/api/schedule/calendar?start=${startDate}&days=${days}`);
    }

    // Manual Schedule
    static getManualSchedule() {
        return this.request('/api/schedule/manual');
    }

    static updateManualSchedule(schedule) {
        return this.request('/api/schedule/manual', {
            method: 'PUT',
            body: JSON.stringify({ schedule })
        });
    }

    static setScheduleDay(date, userId) {
        return this.request('/api/schedule/manual/day', {
            method: 'POST',
            body: JSON.stringify({ date, user_id: userId })
        });
    }

    static clearScheduleDay(date) {
        return this.request(`/api/schedule/manual/day/${date}`, {
            method: 'DELETE'
        });
    }

    static importSchedule(format, content) {
        return this.request('/api/schedule/import', {
            method: 'POST',
            body: JSON.stringify({ format, content })
        });
    }

    static clearManualSchedule() {
        return this.request('/api/schedule/clear', {
            method: 'POST',
            body: JSON.stringify({ confirm: true })
        });
    }

    // Legacy Config
    static getOncallConfig() {
        return this.request('/api/config/oncall');
    }

    static updateOncallConfig(configData) {
        return this.request('/api/config/oncall', {
            method: 'PUT',
            body: JSON.stringify(configData)
        });
    }

    // Settings
    static getVoipSettings() {
        return this.request('/api/settings/voip');
    }

    static updateVoipSettings(settingsData) {
        return this.request('/api/settings/voip', {
            method: 'PUT',
            body: JSON.stringify(settingsData)
        });
    }

    static getSystemSettings() {
        return this.request('/api/settings/system');
    }

    static updateSystemSettings(settingsData) {
        return this.request('/api/settings/system', {
            method: 'PUT',
            body: JSON.stringify(settingsData)
        });
    }

    static testVoipConnection(credentials) {
        return this.request('/api/settings/test-connection', {
            method: 'POST',
            body: JSON.stringify(credentials)
        });
    }

    static testCall(phoneNumber, message) {
        return this.request('/api/test-call', {
            method: 'POST',
            body: JSON.stringify({
                phone_number: phoneNumber,
                message: message
            })
        });
    }

    // Call History
    static getCallHistory(limit = 50) {
        return this.request(`/api/call-history?limit=${limit}`);
    }

    // Export
    static exportConfiguration() {
        return this.request('/api/export');
    }

    // Escalation Policy
    static getEscalationPolicy() {
        return this.request('/api/escalation-policy');
    }

    static updateEscalationPolicy(policyData) {
        return this.request('/api/escalation-policy', {
            method: 'PUT',
            body: JSON.stringify(policyData)
        });
    }

    static getEscalationChain() {
        return this.request('/api/escalation-chain');
    }

    // Webhooks
    static getWebhooks() {
        return this.request('/api/webhooks');
    }

    static createWebhook(webhookData) {
        return this.request('/api/webhooks', {
            method: 'POST',
            body: JSON.stringify(webhookData)
        });
    }

    static updateWebhook(webhookId, webhookData) {
        return this.request(`/api/webhooks/${webhookId}`, {
            method: 'PUT',
            body: JSON.stringify(webhookData)
        });
    }

    static deleteWebhook(webhookId) {
        return this.request(`/api/webhooks/${webhookId}`, {
            method: 'DELETE'
        });
    }

    static testWebhook(webhookId) {
        return this.request(`/api/webhooks/${webhookId}/test`, {
            method: 'POST'
        });
    }

    static getWebhookDeliveryLog(limit = 100) {
        return this.request(`/api/webhooks/delivery-log?limit=${limit}`);
    }
}
