const { WebcastPushConnection } = require('tiktok-live-connector');
const { getRoomState } = require('./queueManager');
const { normalizeLiveGift, normalizeLiveChat, processEvent } = require('./tiktokEvents');

const activeTikTokConnections = new Map();
const cachedGiftLists = new Map(); // username -> [{id, name, value, image_url}]

function connectToTikTok(username, socket) {
    if (activeTikTokConnections.has(username)) {
        const state = getRoomState(username);
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
        disableEulerFallbacks: true,
        clientParams: {
            "app_language": "es-US",
            "webcast_language": "es-US"
        }
    });

    activeTikTokConnections.set(username, tiktokConnection);
    const connectPromise = tiktokConnection.connect();
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Tiempo de espera agotado (10s). Revisa si el usuario está en vivo.')), 10000);
    });

    Promise.race([connectPromise, timeoutPromise]).then(state => {
        console.info(`Conectado al live de ${username}, Room ID: ${state.roomId}`);
        const roomState = getRoomState(username);
        roomState.connectionStartTime = Date.now();

        // Intentar extraer la lista de regalos disponibles
        try {
            const gifts = tiktokConnection.getAvailableGifts();
            if (gifts && gifts.length > 0) {
                const mapped = gifts.map(g => ({
                    id: g.id || g.giftId,
                    name: g.name || g.describe || 'Unknown',
                    value: g.diamond_count || g.diamondCount || 0,
                    image_url: g.image?.url_list?.[0] || g.icon?.url_list?.[0] || null,
                }));
                cachedGiftLists.set(username, mapped);
                console.info(`[GIFTS] ${mapped.length} regalos cacheados para ${username}`);
                if (global.io) {
                    global.io.to(username).emit('gift_list', mapped);
                }
            } else {
                console.warn('[GIFTS] No se obtuvieron regalos del conector.');
            }
        } catch (giftErr) {
            console.warn('[GIFTS] Error al obtener lista de regalos:', giftErr.message);
        }

        if (global.io) {
            global.io.to(username).emit('connection_status', {
                status: 'connected',
                roomId: state.roomId,
                startTime: roomState.connectionStartTime
            });
        }
    }).catch(err => {
        console.error(`Error al conectar a ${username}:`, err.message || err);
        if (global.io) {
            global.io.to(username).emit('connection_status', { status: 'error', error: err.message || err.toString() });
        }
        activeTikTokConnections.delete(username);
    });

    tiktokConnection.on('roomUser', data => {
        if (global.io) {
            global.io.to(username).emit('live_info', { viewerCount: data.viewerCount, totalViewers: data.totalViewers });
        }
        processEvent('viewer_count', data, username);
    });
    tiktokConnection.on('share', data => {
        processEvent('share', data, username);
    });
    tiktokConnection.on('gift', data => {
        const name = data.giftName || data.giftId || 'Regalo';
        data.giftName = name;
        if (global.io) {
            global.io.to(username).emit('live_gift', normalizeLiveGift(data));
        }
        processEvent('gift', data, username);
    });
    tiktokConnection.on('like', data => {
        processEvent('like', data, username);
    });
    tiktokConnection.on('follow', data => {
        processEvent('follow', data, username);
    });
    tiktokConnection.on('chat', data => {
        if (global.io) {
            global.io.to(username).emit('live_chat', normalizeLiveChat(data));
        }
    });
}

module.exports = {
    activeTikTokConnections,
    cachedGiftLists,
    connectToTikTok
};
