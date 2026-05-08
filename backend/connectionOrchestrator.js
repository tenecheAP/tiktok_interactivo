/**
 * Connection Orchestrator – Orquesta múltiples conexiones TikTok
 * Responsable de: selección de cuenta, failover automatizado, health monitoring
 */

const { AccountPool, AccountStatus } = require('./accountPool');

class ConnectionOrchestrator {
    constructor(accountPool) {
        this.pool = accountPool;
        this.connections = new Map();           // roomName → { accountId, tiktokConnection }
        this.roomAssignments = new Map();       // roomName → accountId (activo)
        this.healthInterval = null;
        this.eventHandlers = new Map();         // room → callback para eventos
    }

    startHealthLoop() {
        if (this.healthInterval) clearInterval(this.healthInterval);
        this.healthInterval = setInterval(() => this.runHealthChecks(), this.pool.config.healthCheckInterval);
        console.log('[ORCHESTRATOR] Health check loop iniciado (cada 30s)');
    }

    stopHealthLoop() {
        if (this.healthInterval) clearInterval(this.healthInterval);
    }

    async runHealthChecks() {
        for (const acc of this.pool.getAll()) {
            if (acc.status === AccountStatus.ACTIVE) {
                // Verificar si la cuenta sigue viva
                const connection = this.connections.get(acc.id);
                if (!connection) {
                    console.warn(`[ORCHESTRATOR] Cuenta ${acc.username} marcada ACTIVE pero sin conexión → STANDBY`);
                    this.pool.markDisconnected(acc.id, 'missing_connection');
                    continue;
                }

                // Medir actividad reciente
                const timeSinceLastEvent = Date.now() - (acc.lastEventAt || Date.now());
                if (timeSinceLastEvent > 120000) { // 2min sin eventos
                    console.warn(`[ORCHESTRATOR] Cuenta ${acc.username} inactiva por ${timeSinceLastEvent/1000}s → ERROR`);
                    this.pool.recordFailure(acc.id, 'inactive_timeout');
                    await this.triggerFailover(acc);
                }
            }
        }
    }

    async acquireForRoom(roomUsername) {
        // Si ya hay una cuenta asignada a esta sala, reutilizar (sticky)
        const existing = this.roomAssignments.get(roomUsername);
        if (existing) {
            const acc = this.pool.getAccount(existing);
            if (acc && acc.status === AccountStatus.ACTIVE) {
                console.log(`[ORCHESTRATOR] Reutilizando cuenta ${acc.username} para sala ${roomUsername}`);
                return acc;
            } else {
                // Limpiar asignación stale
                this.roomAssignments.delete(roomUsername);
            }
        }

        // Seleccionar mejor cuenta disponible
        const best = this.pool.getBestAccountForRoom(roomUsername);
        if (!best) {
            console.error('[ORCHESTRATOR] No hay cuentas healthy disponibles.');
            return null;
        }

        // Asignar sticky mapping
        this.roomAssignments.set(roomUsername, best.id);
        return best;
    }

    async connect(accountId, roomUsername, eventCallback) {
        const acc = this.pool.getAccount(accountId);
        if (!acc) throw new Error(`Cuenta ${accountId} no encontrada`);

        // Marcar como conectando
        acc.status = 'connecting';
        this.pool.persist();

        try {
            const { WebcastPushConnection } = require('tiktok-live-connector');
            const tiktokConn = new WebcastPushConnection(acc.username, {
                processInitialData: false,
                enableExtendedGiftInfo: true,
                enableWebsocketUpgrade: true,
                requestPollingIntervalMs: 2000,
                clientParams: {
                    "app_language": "es-US",
                    "webcast_language": "es-US"
                }
            });

            // Setup event handlers
            tiktokConn.on('roomUser', data => {
                eventCallback({ type: 'live_info', payload: {
                    viewerCount: data.viewerCount,
                    totalViewers: data.totalViewers
                }});
            });

            tiktokConn.on('gift', data => {
                eventCallback({ type: 'live_gift', payload: this.normalizeGift(data) });
            });

            tiktokConn.on('like', data => {
                eventCallback({ type: 'live_like', payload: data });
            });

            tiktokConn.on('follow', data => {
                eventCallback({ type: 'live_follow', payload: data });
            });

            tiktokConn.on('chat', data => {
                eventCallback({ type: 'live_chat', payload: this.normalizeChat(data) });
            });

            tiktokConn.on('error', err => {
                console.error(`[ORCHESTRATOR] Error en cuenta ${acc.username}:`, err.message);
                this.pool.recordFailure(accountId, err.message);
                this.triggerFailover(acc);
            });

            tiktokConn.on('disconnect', () => {
                console.log(`[ORCHESTRATOR] Cuenta ${acc.username} desconectada`);
                this.pool.markDisconnected(accountId, 'disconnected');
                this.connections.delete(accountId);
                this.triggerFailover(acc);
            });

            // Connect with timeout
            const connectPromise = tiktokConn.connect();
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Timeout 10s')), 10000);
            });

            const state = await Promise.race([connectPromise, timeoutPromise]);

            // Éxito
            this.connections.set(accountId, tiktokConn);
            this.pool.markActive(accountId, roomUsername);
            this.pool.recordActivity(accountId, 'connect');

            console.info(`[ORCHESTRATOR] Conectado: ${acc.username} → ${roomUsername} (RoomID: ${state.roomId})`);

            return state;

        } catch (err) {
            console.error(`[ORCHESTRATOR] Fallo conexión ${acc.username}:`, err.message);
            this.pool.recordFailure(accountId, err.message);
            this.pool.markDisconnected(accountId, 'error');
            return null;
        }
    }

    async releaseForRoom(roomUsername) {
        const accountId = this.roomAssignments.get(roomUsername);
        if (accountId) {
            const conn = this.connections.get(accountId);
            if (conn) {
                try { conn.disconnect(); } catch (e) {}
                this.connections.delete(accountId);
            }
            const acc = this.pool.getAccount(accountId);
            if (acc) {
                this.pool.markDisconnected(accountId, 'released');
            }
            this.roomAssignments.delete(roomUsername);
            console.log(`[ORCHESTRATOR] Sala ${roomUsername} liberada (cuenta ${accountId})`);
            return true;
        }
        return false;
    }

    async triggerFailover(failedAccount) {
        console.log(`[ORCHESTRATOR] Iniciando failover desde ${failedAccount.username}...`);
        const affectedRooms = Array.from(this.roomAssignments.entries())
            .filter(([_, accId]) => accId === failedAccount.id)
            .map(([room, _]) => room);

        // Desconectar cuentas fallidas
        const conn = this.connections.get(failedAccount.id);
        if (conn) {
            try { conn.disconnect(); } catch (e) {}
            this.connections.delete(failedAccount.id);
        }

        // Para cada sala afectada, asignar nueva cuenta
        for (const room of affectedRooms) {
            const next = this.pool.getBestAccountForRoom(room);
            if (next) {
                console.log(`[ORCHESTRATOR] Failover: ${room} → ${next.username}`);
                this.roomAssignments.set(room, next.id);
                // La reconexión la maneja el frontend al hacer set_username again, O podemos
                // automáticamente re-conectar si tenemos un eventHandler registrado
                // Por ahora, notificamos al frontend
                global.io?.to(room)?.emit('failover_event', {
                    oldAccount: failedAccount.username,
                    newAccount: next.username,
                    timestamp: Date.now()
                });
            } else {
                console.error(`[ORCHESTRATOR] No hay cuentas disponibles para ${room}!`);
                global.io?.to(room)?.emit('connection_status', {
                    status: 'error',
                    error: 'Todas las cuentas en pool fallaron. Sin backup disponible.'
                });
            }
        }
    }

    getSystemHealth() {
        const accounts = this.pool.getAll();
        const scores = accounts.map(a => a.healthScore);
        const overall = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
        return {
            overall,
            perAccount: accounts.map(a => ({
                username: a.username,
                status: a.status,
                healthScore: a.healthScore
            }))
        };
    }

    // Helpers
    normalizeChat(data) {
        return {
            uniqueId: data.uniqueId || data.userId || data.user?.uniqueId || null,
            userId: data.userId || data.user?.userId || null,
            nickname: data.nickname || data.user?.nickname || 'Anónimo',
            comment: data.comment ?? '',
            ts: Date.now()
        };
    }

    normalizeGift(data) {
        const name = data.giftName || data.giftId || 'Regalo';
        return {
            ...data,
            giftName: name,
            nickname: data.nickname || 'Anónimo',
            giftValue: data.giftValue ?? 0,
            repeatCount: data.repeatCount ?? 1,
            badgeLevel: data.badgeLevel ?? 0,
            uniqueId: data.uniqueId || data.userId || null,
            ts: Date.now()
        };
    }
}

module.exports = ConnectionOrchestrator;
