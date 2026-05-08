const { WebcastPushConnection } = require('tiktok-live-connector');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

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

const activeTikTokConnections = new Map();

io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);

    socket.emit('config_update', config);

    socket.on('set_username', (username) => {
        const normalizedUser = username.toLowerCase().trim();
        socket.tiktokRoom = normalizedUser;
        socket.join(normalizedUser);
        console.log(`Socket ${socket.id} unido a sala ${normalizedUser}`);
        connectToTikTok(normalizedUser, socket);
    });

    socket.on('register_esp32', (targetUsername) => {
        const normalizedUser = targetUsername.toLowerCase().trim();
        socket.tiktokRoom = normalizedUser;
        socket.join(normalizedUser);
        console.log(`[ESP32] Registrado y unido a sala ${normalizedUser}`);
    });

    socket.on('update_config', (newConfig) => {
        config = newConfig;
        saveConfig(config);
        io.emit('config_update', config); // Config is global
    });

    socket.on('reset_config', () => {
        config = DEFAULT_CONFIG;
        saveConfig(config);
        io.emit('config_update', config);
        console.log('[CONFIG] Configuración restablecida a valores por defecto.');
    });

    socket.on('request_config', () => {
        socket.emit('config_update', config);
    });

    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
        if (socket.tiktokRoom) {
            const room = socket.tiktokRoom;
            // Verificar si hay más sockets en la sala
            const clients = io.sockets.adapter.rooms.get(room);
            if (!clients || clients.size === 0) {
                console.log(`[CLEANUP] Sala ${room} vacía. Desconectando TikTok...`);
                const conn = activeTikTokConnections.get(room);
                if (conn) {
                    conn.disconnect();
                    activeTikTokConnections.delete(room);
                }
                roomStates.delete(room);
            }
        }
    });

    socket.on('simulate_event', (type) => {
        const room = socket.tiktokRoom;
        if (!room) {
            console.log('No se puede simular sin una sala conectada');
            return;
        }
        console.log(`Simulando evento: ${type} en sala ${room}`);

        if (type === 'chat') {
            const mockChat = {
                nickname: `User_${Math.floor(Math.random() * 1000)}`,
                comment: `Comentario de prueba ${Date.now()}`,
                uniqueId: `mock_${Math.random().toString(36).slice(2, 12)}`
            };
            io.to(room).emit('live_chat', normalizeLiveChat(mockChat));
            return;
        }

        const mockData = {
            nickname: `User_${Math.floor(Math.random() * 1000)}`,
            giftName: type === 'gift' ? (Math.random() > 0.5 ? 'Rose' : 'TikTok') : null,
            repeatCount: Math.floor(Math.random() * 5) + 1,
            likeCount: type === 'like' ? 100 : 0,
            badgeLevel: Math.floor(Math.random() * 15),
            giftValue: type === 'gift' ? Math.floor(Math.random() * 100) : 0,
            uniqueId: type === 'gift' ? `mock_${Math.random().toString(36).slice(2, 12)}` : undefined
        };

        if (type === 'gift') {
            const name = mockData.giftName || 'Rose';
            mockData.giftName = name;
            io.to(room).emit('live_gift', normalizeLiveGift(mockData));
        }

        processEvent(type, mockData, room);
    });
});

function connectToTikTok(username, socket) {
    if (activeTikTokConnections.has(username)) {
        const state = getRoomState(username);
        console.log(`[SOCKET] Emitiendo connection_status: connected a ${socket.id} (Conexión existente)`);
        socket.emit('connection_status', {
            status: 'connected',
            roomId: username,
            startTime: state.connectionStartTime
        });
        return;
    }

    const tiktokConnection = new WebcastPushConnection(username, {
        processInitialData: false,
        enableExtendedGiftInfo: true,
        enableWebsocketUpgrade: true,
        requestPollingIntervalMs: 2000,
        clientParams: {
            "app_language": "es-US",
            "webcast_language": "es-US"
        }
    });

    activeTikTokConnections.set(username, tiktokConnection);

    const connectPromise = tiktokConnection.connect();

    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Tiempo de espera agotado (10s). Revisa si el usuario está en vivo o intenta nuevamente.')), 10000);
    });

    Promise.race([connectPromise, timeoutPromise]).then(state => {
        console.info(`Conectado al live de ${username}, Room ID: ${state.roomId}`);
        const roomState = getRoomState(username);
        roomState.connectionStartTime = Date.now();
        io.to(username).emit('connection_status', {
            status: 'connected',
            roomId: state.roomId,
            startTime: roomState.connectionStartTime
        });
    }).catch(err => {
        console.error(`Error al conectar a ${username}:`, err.message || err);
        io.to(username).emit('connection_status', { status: 'error', error: err.message || err.toString() });
        activeTikTokConnections.delete(username);
    });

    tiktokConnection.on('roomUser', data => {
        io.to(username).emit('live_info', {
            viewerCount: data.viewerCount,
            totalViewers: data.totalViewers
        });
    });

    tiktokConnection.on('gift', data => {
        const name = data.giftName || data.giftId || 'Regalo';
        console.log(`[GIFT][${username}] ${data.nickname} envió ${name} x${data.repeatCount}`);
        data.giftName = name;
        io.to(username).emit('live_gift', normalizeLiveGift(data));
        processEvent('gift', data, username);
    });

    tiktokConnection.on('like', data => {
        console.log(`Likes en ${username}: ${data.likeCount} de ${data.nickname}`);
        processEvent('like', data, username);
    });

    tiktokConnection.on('follow', data => {
        console.log(`Nuevo seguidor en ${username}: ${data.nickname}`);
        processEvent('follow', data, username);
    });

    tiktokConnection.on('chat', data => {
        // No imprimimos los mensajes en la consola para evitar llenar los logs
        io.to(username).emit('live_chat', normalizeLiveChat(data));
    });
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
