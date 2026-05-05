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
        // Ejemplo de mapeo con múltiples actuadores para regalos valiosos
        { id: 4, event: 'gift', giftName: 'Universe', action: ['relay_1', 'relay_2', 'relay_3', 'relay_4', 'led_pulse', 'servo_wave'], duration: 5000, sound: 'gift.mp3' }
    ],
    levels: {
        follower: { priority: 1, color: '#00ff00' },
        fan: { priority: 2, color: '#0000ff' },
        super_fan: { priority: 3, color: '#ff0000' }
    }
};

let config = DEFAULT_CONFIG;

// Cargar configuración desde el archivo
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

// Guardar configuración al archivo
function saveConfig(newConfig) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 4));
        console.log('[CONFIG] Configuración guardada en archivo.');
    } catch (err) {
        console.error('[CONFIG] Error al guardar configuración:', err);
    }
}

// Inicializar configuración
loadConfig();

/** Normaliza payload para clientes (bot lector / dashboard). */
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

let currentLikes = 0;

// Sistema de Colas para Actuadores
const queues = {
    relay_1: { items: [], processing: false },
    relay_2: { items: [], processing: false },
    led_pulse: { items: [], processing: false },
    servo_wave: { items: [], processing: false }
};

function addToQueue(actuator, actionData) {
    if (!queues[actuator]) {
        queues[actuator] = { items: [], processing: false };
    }
    
    queues[actuator].items.push(actionData);
    console.log(`[QUEUE] Añadido a ${actuator}. Total en cola: ${queues[actuator].items.length}`);
    
    // Notificar al frontend sobre el estado de la cola
    io.emit('queue_update', {
        actuator: actuator,
        count: queues[actuator].items.length
    });

    processQueue(actuator);
}

async function processQueue(actuator) {
    if (queues[actuator].processing || queues[actuator].items.length === 0) return;

    queues[actuator].processing = true;
    const currentAction = queues[actuator].items[0];

    console.log(`[EXEC] Ejecutando acción en ${actuator} para ${currentAction.user}`);
    
    // Enviar comando al ESP32 y Dashboard
    io.emit('action_executing', currentAction);

    // Esperar la duración de la acción
    await new Promise(resolve => setTimeout(resolve, currentAction.duration));

    // Eliminar de la cola y continuar
    queues[actuator].items.shift();
    queues[actuator].processing = false;
    
    io.emit('queue_update', {
        actuator: actuator,
        count: queues[actuator].items.length
    });

    processQueue(actuator);
}

let tiktokUsername = "";
let tiktokConnection = null;
let connectionStartTime = null;

io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);

    socket.emit('config_update', config);

    socket.on('set_username', (username) => {
        tiktokUsername = username;
        connectToTikTok(username, socket);
    });

    socket.on('update_config', (newConfig) => {
        config = newConfig;
        saveConfig(config);
        io.emit('config_update', config);
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

    // Evento de simulación para pruebas
    socket.on('simulate_event', (type) => {
        console.log(`Simulando evento: ${type}`);

        if (type === 'chat') {
            const mockChat = {
                nickname: `User_${Math.floor(Math.random() * 1000)}`,
                comment: `Comentario de prueba ${Date.now()}`,
                uniqueId: `mock_${Math.random().toString(36).slice(2, 12)}`
            };
            io.emit('live_chat', normalizeLiveChat(mockChat));
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
            io.emit('live_gift', normalizeLiveGift(mockData));
        }

        processEvent(type, mockData);
    });
});

function connectToTikTok(username, socket) {
    if (tiktokConnection) {
        tiktokConnection.disconnect();
    }

    tiktokConnection = new WebcastPushConnection(username, {
        processInitialData: false,
        enableExtendedGiftInfo: true,
        enableWebsocketUpgrade: true,
        requestPollingIntervalMs: 2000,
        clientParams: {
            "app_language": "es-US",
            "webcast_language": "es-US"
        }
    });

    const connectPromise = tiktokConnection.connect();

    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Tiempo de espera agotado (10s). Revisa si el usuario está en vivo o intenta nuevamente.')), 10000);
    });

    Promise.race([connectPromise, timeoutPromise]).then(state => {
        console.info(`Conectado al live de ${username}, Room ID: ${state.roomId}`);
        connectionStartTime = Date.now();
        console.log(`[SOCKET] Emitiendo connection_status: connected solo a ${socket.id}`);
        socket.emit('connection_status', {
            status: 'connected',
            roomId: state.roomId,
            startTime: connectionStartTime
        });
    }).catch(err => {
        console.error('Error al conectar:', err.message || err);
        console.log(`[SOCKET] Emitiendo connection_status: error solo a ${socket.id}`);
        socket.emit('connection_status', { status: 'error', error: err.message || err.toString() });
    });

    // Evento: Info de la sala (Espectadores)
    tiktokConnection.on('roomUser', data => {
        io.emit('live_info', {
            viewerCount: data.viewerCount,
            totalViewers: data.totalViewers
        });
    });

    // Evento: Regalos
    tiktokConnection.on('gift', data => {
        // TikTok envía los regalos a veces con nombres localizados o IDs
        // Forzamos que siempre haya un nombre para el dashboard
        const name = data.giftName || data.giftId || 'Regalo';
        console.log(`[GIFT] ${data.nickname} envió ${name} x${data.repeatCount}`);
        
        // Aseguramos que data tenga giftName para el resto de la lógica
        data.giftName = name;
        io.emit('live_gift', normalizeLiveGift(data));
        processEvent('gift', data);
    });

    // Evento: Likes
    tiktokConnection.on('like', data => {
        console.log(`Likes: ${data.likeCount} de ${data.nickname}`);
        processEvent('like', data);
    });

    // Evento: Seguidores
    tiktokConnection.on('follow', data => {
        console.log(`Nuevo seguidor: ${data.nickname}`);
        processEvent('follow', data);
    });

    // Evento: Chat
    tiktokConnection.on('chat', data => {
        console.log(`${data.nickname}: ${data.comment}`);
        io.emit('live_chat', normalizeLiveChat(data));
    });
}

function processEvent(eventType, data) {
    // Manejo especial para likes y metas
    if (eventType === 'like') {
        currentLikes += (data.likeCount || 1);
        const goalMapping = config.mappings.find(m => m.event === 'like_goal');
        if (goalMapping && currentLikes >= goalMapping.threshold) {
            triggerAction(goalMapping, data);
            
            if (goalMapping.autoReset) {
                currentLikes = 0; // Reiniciar meta
                console.log(`[GOAL] Meta alcanzada y reiniciada.`);
            } else {
                currentLikes = goalMapping.threshold; // Mantener al máximo
                console.log(`[GOAL] Meta alcanzada (Sin reinicio).`);
            }
        }
        io.emit('likes_update', { current: currentLikes, goal: goalMapping?.threshold || 1000 });
        return;
    }

    // Manejo para regalos específicos
    if (eventType === 'gift') {
        const giftName = data.giftName || 'Regalo';
        const giftValue = data.giftValue || 0;
        
        // 1. Buscar mapeo por nombre exacto
        const giftMapping = config.mappings.find(m => 
            m.event === 'gift' && 
            m.giftName.toLowerCase() === giftName.toLowerCase()
        );
        
        // 2. Buscar mapeo por rango de valor (Monedas)
        const valueMapping = config.mappings.find(m => 
            m.event === 'gift_value' && 
            giftValue >= (m.minValue || 0) &&
            giftValue <= (m.maxValue || Infinity)
        );

        if (giftMapping) {
            triggerAction(giftMapping, data);
        } else if (valueMapping) {
            // Si no hay por nombre, pero cae en un rango de valor configurado
            triggerAction(valueMapping, data);
        } else {
            // Si no hay mapeo, igual notificamos al frontend para el muro de regalos
            io.emit('action', {
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

    // Otros eventos (follow, etc)
    const mapping = config.mappings.find(m => m.event === eventType);
    if (mapping) {
        triggerAction(mapping, data);
    }
}

function triggerAction(mapping, data) {
    // Determinar nivel de usuario
    let userLevel = 'follower';
    if (data.badgeLevel >= 10 || data.giftValue > 50) userLevel = 'super_fan';
    else if (data.badgeLevel > 0) userLevel = 'fan';

    // Manejar múltiples acciones (array) o una sola acción (string)
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

        // En lugar de emitir directamente, añadir a la cola del actuador
        addToQueue(action, actionData);
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(
            `[ERR] El puerto ${PORT} ya está en uso. Cierra el otro proceso Node o en PowerShell: $env:PORT=4000; npm start`
        );
    } else {
        console.error('[ERR] Error del servidor HTTP:', err);
    }
    process.exit(1);
});
