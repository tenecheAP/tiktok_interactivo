const { WebcastPushConnection } = require('tiktok-live-connector');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Account Pool System – High Availability Multi-Account Orchestrator
const { AccountPool, AccountStatus } = require('./accountPool');
const ConnectionOrchestrator = require('./connectionOrchestrator');

// === MANAGERS ===
const accountPool = new AccountPool();
const orchestrator = new ConnectionOrchestrator(accountPool);

// Copia consola -> proyecto/logs/backend.log (detectar errores después)
const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'backend.log');
function appendLogFile(level, args) {
    try {
        if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
        const msg = args.map((a) => {
            if (a instanceof Error) return a.stack || a.message;
            if (typeof a === 'object' && a !== null) {
                try {
                    return JSON.stringify(a);
                } catch {
                    return String(a);
                }
            }
            return String(a);
        }).join(' ');
        const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
        fs.appendFileSync(LOG_FILE, line);
    } catch {
        /* no romper el servidor si falla el disco */
    }
}
const _clog = console.log.bind(console);
const _cerr = console.error.bind(console);
console.log = (...a) => {
    _clog(...a);
    appendLogFile('LOG', a);
};
console.error = (...a) => {
    _cerr(...a);
    appendLogFile('ERR', a);
};

const app = express();
app.use(cors());
app.use(express.json()); // Para API REST

app.get('/', (req, res) => {
    res.send('Servidor funcionando 🔥');
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Exponer io globalmente para el orchestrator (inyección simple)
global.io = io;

// === INICIAR ACCOUNT POOL ===
accountPool.load().then(() => {
    console.log('[ACCOUNT_POOL] Cuentas cargadas:', accountPool.size());
    orchestrator.startHealthLoop();
}).catch(err => {
    console.error('[ACCOUNT_POOL] Error cargando cuentas:', err);
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
            io.to(roomUsername).emit(events.type, events.payload);
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

const CONFIG_FILE = path.join(__dirname, 'config.json');

// Configuración por defecto
const DEFAULT_CONFIG = {
    mappings: [
        { id: 1, event: 'gift', giftName: 'Rose', action: ['relay_1'], duration: 1000, sound: 'gift.mp3' },
        { id: 2, event: 'like_goal', threshold: 1000, action: ['relay_2'], duration: 2000, sound: 'welcome.mp3', autoReset: true },
        { id: 3, event: 'follow', action: ['led_pulse'], duration: 500, sound: 'like.mp3' },
        { id: 4, event: 'gift', giftName: 'Universe', action: ['relay_1', 'relay_2', 'relay_3', 'relay_4', 'led_pulse', 'servo_wave'], duration: 5000, sound: 'gift.mp3' }
    ],
    levels: {
        follower: { priority: 1, color: '#00ff00' },
        fan: { priority: 2, color: '#0000ff' },
        super_fan: { priority: 3, color: '#ff0000' }
    }
};

let config = DEFAULT_CONFIG;

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            config = JSON.parse(data);
            console.log('[CONFIG] Configuración cargada desde archivo.');
        } else {
            saveConfig(DEFAULT_CONFIG);
            console.log('[CONFIG] Archivo no encontrado, usando valores por defecto.');
        }
    } catch (err) {
        console.error('[CONFIG] Error al cargar configuración:', err);
        config = DEFAULT_CONFIG;
    }
}

function saveConfig(newConfig) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 4));
        console.log('[CONFIG] Configuración guardada en archivo.');
    } catch (err) {
        console.error('[CONFIG] Error al guardar configuración:', err);
    }
}

loadConfig();

function normalizeLiveChat(data) {
    return {
        uniqueId: data.uniqueId || data.userId || data.user?.uniqueId || null,
        userId: data.userId || data.user?.userId || null,
        nickname: data.nickname || data.user?.nickname || 'Anónimo',
        comment: data.comment ?? '',
        ts: Date.now()
    };
}

function normalizeLiveGift(data) {
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

const roomStates = new Map();

function getRoomState(username) {
    if (!roomStates.has(username)) {
        roomStates.set(username, {
            currentLikes: 0,
            connectionStartTime: null,
            queues: {
                relay_1: { items: [], processing: false },
                relay_2: { items: [], processing: false },
                relay_3: { items: [], processing: false },
                relay_4: { items: [], processing: false },
                led_pulse: { items: [], processing: false },
                servo_wave: { items: [], processing: false }
            }
        });
    }
    return roomStates.get(username);
}

function addToQueue(username, actuator, actionData) {
    const state = getRoomState(username);
    if (!state.queues[actuator]) {
        state.queues[actuator] = { items: [], processing: false };
    }
    
    state.queues[actuator].items.push(actionData);
    console.log(`[QUEUE][${username}] Añadido a ${actuator}. Total en cola: ${state.queues[actuator].items.length}`);
    
    io.to(username).emit('queue_update', {
        actuator: actuator,
        count: state.queues[actuator].items.length
    });

    processQueue(username, actuator);
}

async function processQueue(username, actuator) {
    const state = getRoomState(username);
    if (state.queues[actuator].processing || state.queues[actuator].items.length === 0) return;

    state.queues[actuator].processing = true;
    const currentAction = state.queues[actuator].items[0];

    console.log(`[EXEC][${username}] Ejecutando acción en ${actuator} para ${currentAction.user}`);
    
    io.to(username).emit('action_executing', currentAction);

    await new Promise(resolve => setTimeout(resolve, currentAction.duration));

    state.queues[actuator].items.shift();
    state.queues[actuator].processing = false;
    
    io.to(username).emit('queue_update', {
        actuator: actuator,
        count: state.queues[actuator].items.length
    });

    processQueue(username, actuator);
}

function processEvent(eventType, data, username) {
    const state = getRoomState(username);
    if (eventType === 'like') {
        state.currentLikes += (data.likeCount || 1);
        const goalMapping = config.mappings.find(m => m.event === 'like_goal');
        if (goalMapping && state.currentLikes >= goalMapping.threshold) {
            triggerAction(goalMapping, data, username);
            
            if (goalMapping.autoReset) {
                state.currentLikes = 0;
                console.log(`[GOAL][${username}] Meta alcanzada y reiniciada.`);
            } else {
                state.currentLikes = goalMapping.threshold;
                console.log(`[GOAL][${username}] Meta alcanzada (Sin reinicio).`);
            }
        }
        io.to(username).emit('likes_update', { current: state.currentLikes, goal: goalMapping?.threshold || 1000 });
        return;
    }

    if (eventType === 'gift') {
        const giftName = data.giftName || 'Regalo';
        const giftValue = data.giftValue || 0;
        
        const giftMapping = config.mappings.find(m => 
            m.event === 'gift' && 
            m.giftName.toLowerCase() === giftName.toLowerCase()
        );
        
        const valueMapping = config.mappings.find(m => 
            m.event === 'gift_value' && 
            giftValue >= (m.minValue || 0) &&
            giftValue <= (m.maxValue || Infinity)
        );

        if (giftMapping) {
            triggerAction(giftMapping, data, username);
        } else if (valueMapping) {
            triggerAction(valueMapping, data, username);
        } else {
            io.to(username).emit('action', {
                user: data.nickname,
                giftName: giftName,
                giftValue: giftValue,
                repeatCount: data.repeatCount || 1,
                level: data.badgeLevel >= 10 ? 'super_fan' : (data.badgeLevel > 0 ? 'fan' : 'follower'),
                eventName: 'Regalo Recibido',
                action: 'Sin acción física',
                sound: null
            });
        }
        return;
    }

    const mapping = config.mappings.find(m => m.event === eventType);
    if (mapping) {
        triggerAction(mapping, data, username);
    }
}

function triggerAction(mapping, data, username) {
    let userLevel = 'follower';
    if (data.badgeLevel >= 10 || data.giftValue > 50) userLevel = 'super_fan';
    else if (data.badgeLevel > 0) userLevel = 'fan';

    const actions = Array.isArray(mapping.action) ? mapping.action : [mapping.action];
    
    actions.forEach(action => {
        const actionData = {
            action: action,
            duration: mapping.duration,
            color: config.levels[userLevel].color,
            sound: mapping.sound,
            user: data.nickname,
            level: userLevel,
            eventName: mapping.event === 'like_goal' ? 'Meta de Likes Alcanzada!' : mapping.event,
            giftName: data.giftName || null,
            repeatCount: data.repeatCount || 1
        };

        addToQueue(username, action, actionData);
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[ERR] El puerto ${PORT} ya está en uso.`);
    } else {
        console.error('[ERR] Error del servidor HTTP:', err);
    }
    process.exit(1);
});
