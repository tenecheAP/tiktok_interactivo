const express = require('express');
const { AccountStatus } = require('./accountPool');
const { cachedGiftLists } = require('./tiktokConnection');
const giftCatalogManager = require('./giftCatalogManager');

function setupRoutes(app, accountPool, orchestrator) {
    app.get('/', (req, res) => {
        res.send('Servidor funcionando 🔥');
    });

    // === GIFT LIST ENDPOINT ===
    app.get('/api/gifts/:username', (req, res) => {
        const username = req.params.username.toLowerCase().trim().replace(/^@/, '');
        const list = cachedGiftLists.get(username);
        if (!list) return res.status(404).json({ error: 'No hay lista de regalos para este usuario. Conéctate primero al live.' });
        res.json(list);
    });

    // === HEALTH CHECK ENDPOINT ===
    app.get('/api/accounts/:id/health', (req, res) => {
        const acc = accountPool.getAccount(req.params.id);
        if (!acc) return res.status(404).json({ error: 'Cuenta no encontrada' });
        res.json({
            account: acc,
            healthDetails: {
                score: acc.healthScore,
                status: acc.status,
                consecutiveFails: acc.consecutiveFails,
                timeSinceLastEvent: acc.lastEventAt ? Date.now() - acc.lastEventAt : null,
                uptime: acc.lastConnectedAt ? (Date.now() - new Date(acc.lastConnectedAt)) / 1000 : null
            }
        });
    });

    app.get('/api/system/health', (req, res) => {
        const health = orchestrator.getSystemHealth();
        res.json(health);
    });

    // === ACCOUNT POOL API ===
    app.get('/api/accounts', (req, res) => {
        res.json(accountPool.getSnapshot());
    });

    app.post('/api/accounts', (req, res) => {
        try {
            const { username, uniqueId, sessionId, cookies, priority, weight } = req.body;
            if (!username || !uniqueId) {
                return res.status(400).json({ error: 'username y uniqueId requeridos' });
            }
            const acc = accountPool.addAccount({
                username, uniqueId, sessionId, cookies, priority: priority || 10, weight: weight || 100
            });
            accountPool.persist();
            res.status(201).json(acc);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.put('/api/accounts/:id', (req, res) => {
        const acc = accountPool.getAccount(req.params.id);
        if (!acc) return res.status(404).json({ error: 'Cuenta no encontrada' });
        Object.assign(acc, req.body);
        acc.updatedAt = new Date().toISOString();
        accountPool.persist();
        res.json(acc);
    });

    app.delete('/api/accounts/:id', (req, res) => {
        const acc = accountPool.removeAccount(req.params.id);
        if (!acc) return res.status(404).json({ error: 'Cuenta no encontrada' });
        res.json({ message: 'Cuenta eliminada (soft delete)', account: acc });
    });

    app.post('/api/accounts/:id/connect', async (req, res) => {
        const acc = accountPool.getAccount(req.params.id);
        if (!acc) return res.status(404).json({ error: 'Cuenta no encontrada' });
        // Forzar conexión a una sala específica (envía roomUsername en body)
        const { roomUsername } = req.body;
        if (!roomUsername) return res.status(400).json({ error: 'roomUsername requerido' });

        try {
            // Marcar como activa y conectar
            accountPool.markActive(acc.id, roomUsername);
            const state = await orchestrator.connect(acc.id, roomUsername, (events) => {
                if (global.io) {
                    global.io.to(roomUsername).emit(events.type, events.payload);
                }
                accountPool.recordActivity(acc.id, events.type);
            });
            if (state) {
                res.json({ message: 'Conexión exitosa', roomId: state.roomId, account: acc });
            } else {
                res.status(500).json({ error: 'Falló la conexión' });
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/accounts/:id/disconnect', (req, res) => {
        const success = orchestrator.releaseForRoom(req.params.id); // simplificado
        accountPool.markDisconnected(req.params.id, 'manual');
        res.json({ message: 'Desconexión solicitada' });
    });

    app.post('/api/accounts/:id/ban', (req, res) => {
        const acc = accountPool.getAccount(req.params.id);
        if (!acc) return res.status(404).json({ error: 'Cuenta no encontrada' });
        acc.status = AccountStatus.BANNED;
        acc.lastDisconnectedAt = new Date().toISOString();
        accountPool.persist();
        res.json({ message: 'Cuenta baneada (cooldown activado)', account: acc });
    });

    app.post('/api/accounts/:id/reset-health', (req, res) => {
        const acc = accountPool.getAccount(req.params.id);
        if (!acc) return res.status(404).json({ error: 'Cuenta no encontrada' });
        acc.healthScore = 1.0;
        acc.consecutiveFails = 0;
        acc.status = AccountStatus.STANDBY;
        accountPool.persist();
        res.json({ message: 'Health reseteado', account: acc });
    });

    app.get('/api/pool/rotation-policy', (req, res) => {
        res.json(accountPool.config);
    });

    app.put('/api/pool/rotation-policy', (req, res) => {
        accountPool.config = { ...accountPool.config, ...req.body };
        accountPool.persist();
        res.json(accountPool.config);
    });

    // === INTELLIGENT GIFT CATALOG ENDPOINTS ===
    app.get('/api/catalog/gifts', (req, res) => {
        const query = req.query.q;
        if (query) {
            return res.json(giftCatalogManager.search(query));
        }
        res.json(giftCatalogManager.getAll());
    });

    app.get('/api/catalog/stats', (req, res) => {
        res.json(giftCatalogManager.stats());
    });

    app.get('/api/catalog/export/csv', (req, res) => {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=gifts.csv');
        res.send(giftCatalogManager.exportCSV());
    });

    app.get('/api/catalog/export/json', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=gifts.json');
        res.send(giftCatalogManager.exportJSON());
    });
}

module.exports = { setupRoutes };
