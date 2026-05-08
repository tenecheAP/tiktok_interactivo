/**
 * Account Pool – Gestión centralizada de múltiples cuentas TikTok
 * Objetivo: Alta disponibilidad, failover automático, distribución de riesgo
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ACCOUNTS_FILE = path.join(__dirname, '..', 'accounts.json');
const POOL_CONFIG_FILE = path.join(__dirname, '..', 'poolConfig.json');

// Estados de cuenta
const AccountStatus = {
    ACTIVE: 'active',
    STANDBY: 'standby',
    BANNED: 'banned',
    ERROR: 'error',
    COOLDOWN: 'cooldown'
};

class Account {
    constructor(data) {
        this.id = data.id || crypto.randomUUID();
        this.username = data.username;          // @streamer_main
        this.uniqueId = data.uniqueId;          // numeric ID de TikTok
        this.sessionId = data.sessionId;        // sessionID de TikTok
        this.cookies = data.cookies || '';       // cookies completas (encriptadas)
        this.status = data.status || AccountStatus.STANDBY;
        this.healthScore = data.healthScore ?? 1.0; // 0-1
        this.consecutiveFails = data.consecutiveFails || 0;
        this.lastEventAt = data.lastEventAt || null;
        this.lastConnectedAt = data.lastConnectedAt || null;
        this.lastDisconnectedAt = data.lastDisconnectedAt || null;
        this.priority = data.priority || 10;     // menor = mayor prioridad
        this.weight = data.weight || 100;        // para weighted round-robin
        this.metadata = data.metadata || {};
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = new Date().toISOString();
    }

    toJSON() {
        return {
            id: this.id,
            username: this.username,
            uniqueId: this.uniqueId,
            sessionId: this.sessionId,
            cookies: this.cookies, // encriptado en disco
            status: this.status,
            healthScore: this.healthScore,
            consecutiveFails: this.consecutiveFails,
            lastEventAt: this.lastEventAt,
            lastConnectedAt: this.lastConnectedAt,
            lastDisconnectedAt: this.lastDisconnectedAt,
            priority: this.priority,
            weight: this.weight,
            metadata: this.metadata,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

class AccountPool {
    constructor() {
        this.accounts = new Map(); // id → Account
        this.config = {
            failoverThreshold: 0.3,      // salud <30% → failover
            cooldownAfterBan: 3600000,   // 1h
            cooldownAfterError: 300000,  // 5min
            maxConcurrentPerAccount: 1,  // por ahora 1 stream/cuenta
            healthCheckInterval: 30000,  // 30s
            autoRecoverEnabled: true,
            requireAllAccountsHealthy: false // false = sigue aunque todas no estén 100%
        };
    }

    async load() {
        try {
            if (fs.existsSync(ACCOUNTS_FILE)) {
                const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
                const data = JSON.parse(raw);
                for (const accData of data.accounts) {
                    const acc = new Account(accData);
                    this.accounts.set(acc.id, acc);
                }
                console.log(`[ACCOUNT_POOL] Cargadas ${this.accounts.size} cuentas.`);
            }

            if (fs.existsSync(POOL_CONFIG_FILE)) {
                const cfg = JSON.parse(fs.readFileSync(POOL_CONFIG_FILE, 'utf8'));
                this.config = { ...this.config, ...cfg };
            }
        } catch (err) {
            console.error('[ACCOUNT_POOL] Error cargando datos:', err);
        }
    }

    async persist() {
        try {
            const data = {
                accounts: Array.from(this.accounts.values()).map(a => a.toJSON()),
                config: this.config
            };
            fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2));
            fs.writeFileSync(POOL_CONFIG_FILE, JSON.stringify(this.config, null, 2));
        } catch (err) {
            console.error('[ACCOUNT_POOL] Error persistiendo:', err);
        }
    }

    addAccount(data) {
        const acc = new Account(data);
        this.accounts.set(acc.id, acc);
        this.persist();
        return acc;
    }

    removeAccount(id) {
        const acc = this.accounts.get(id);
        if (acc) {
            acc.status = AccountStatus.BANNED; // soft delete
            this.persist();
        }
        return acc;
    }

    getAccount(id) {
        return this.accounts.get(id);
    }

    getAll() {
        return Array.from(this.accounts.values());
    }

    getHealthyAccounts() {
        return this.getAll().filter(a =>
            a.status === AccountStatus.ACTIVE || a.status === AccountStatus.STANDBY
        ).filter(a => a.healthScore >= this.config.failoverThreshold);
    }

    getBestAccountForRoom(roomUsername) {
        // Selecciona la cuenta con mejor healthScore + priority
        const healthy = this.getHealthyAccounts();
        if (healthy.length === 0) return null;

        // Ordenar por healthScore desc, luego priority asc
        healthy.sort((a, b) => {
            if (b.healthScore !== a.healthScore) return b.healthScore - a.healthScore;
            return a.priority - b.priority;
        });

        return healthy[0];
    }

    markActive(accountId, room) {
        const acc = this.accounts.get(accountId);
        if (acc) {
            acc.status = AccountStatus.ACTIVE;
            acc.lastConnectedAt = new Date().toISOString();
            acc.consecutiveFails = 0;
            this.persist();
            console.log(`[ACCOUNT_POOL] Cuenta ${acc.username} → ACTIVE para sala ${room}`);
        }
    }

    markDisconnected(accountId, reason = 'normal') {
        const acc = this.accounts.get(accountId);
        if (acc) {
            acc.status = reason === 'error' ? AccountStatus.ERROR : AccountStatus.STANDBY;
            acc.lastDisconnectedAt = new Date().toISOString();
            this.persist();
            console.log(`[ACCOUNT_POOL] Cuenta ${acc.username} → ${acc.status} (${reason})`);
        }
    }

    recordActivity(accountId, eventType) {
        const acc = this.accounts.get(accountId);
        if (acc) {
            acc.lastEventAt = Date.now();
            // Mejorar healthScore levemente por actividad
            acc.healthScore = Math.min(1.0, acc.healthScore + 0.001);
            this.persist();
        }
    }

    recordFailure(accountId, error) {
        const acc = this.accounts.get(accountId);
        if (acc) {
            acc.consecutiveFails = (acc.consecutiveFails || 0) + 1;
            // Disminuir healthScore según gravedad
            const penalty = error.includes('banned') ? 0.5 : 0.1;
            acc.healthScore = Math.max(0, acc.healthScore - penalty);
            this.persist();
            console.warn(`[ACCOUNT_POOL] Cuenta ${acc.username} health ↓ ${(acc.healthScore*100).toFixed(1)}%`);

            // Si health muy baja, marcar como ERROR
            if (acc.healthScore < this.config.failoverThreshold) {
                acc.status = AccountStatus.ERROR;
                this.persist();
            }
        }
    }

    getSnapshot() {
        return this.getAll().map(a => ({
            id: a.id,
            username: a.username,
            status: a.status,
            healthScore: a.healthScore,
            priority: a.priority,
            lastConnectedAt: a.lastConnectedAt,
            lastEventAt: a.lastEventAt
        }));
    }

    size() {
        return this.accounts.size;
    }
}

module.exports = { AccountPool, Account, AccountStatus };
