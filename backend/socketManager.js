const { getConfig, saveConfig, DEFAULT_CONFIG } = require('./configManager');
const { connectToTikTok, activeTikTokConnections } = require('./tiktokConnection');
const { processEvent, normalizeLiveChat, normalizeLiveGift } = require('./tiktokEvents');

function setupSockets(io, orchestrator) {
    io.on('connection', (socket) => {
        console.log('Cliente conectado:', socket.id);

        socket.emit('config_update', getConfig());

        socket.on('set_username', async (username) => {
            const normalizedUser = username.toLowerCase().trim().replace(/^@/, '');
            socket.tiktokRoom = normalizedUser;
            socket.join(normalizedUser);
            console.log(`Socket ${socket.id} unido a sala ${normalizedUser}`);

            // Intentar usar AccountPool
            const bestAcc = await orchestrator.acquireForRoom(normalizedUser);
            if (bestAcc) {
                console.log(`Usando cuenta del pool: ${bestAcc.username} para conectar a ${normalizedUser}`);
                const state = await orchestrator.connect(bestAcc.id, normalizedUser, (events) => {
                    io.to(normalizedUser).emit(events.type, events.payload);
                    if (events.type !== 'live_chat' && events.type !== 'live_info') {
                        processEvent(events.type.replace('live_', ''), events.payload, normalizedUser);
                    }
                });
                if (state) {
                    socket.emit('connection_status', {
                        status: 'connected',
                        roomId: state.roomId,
                        startTime: Date.now()
                    });
                } else {
                    socket.emit('connection_status', { status: 'error', error: 'Falló la conexión usando el pool' });
                }
            } else {
                // Fallback
                console.log(`No hay cuentas en el pool. Usando conexión directa para ${normalizedUser}`);
                connectToTikTok(normalizedUser, socket);
            }
        });

        socket.on('register_esp32', (targetUsername) => {
            const normalizedUser = targetUsername.toLowerCase().trim();
            socket.tiktokRoom = normalizedUser;
            socket.join(normalizedUser);
            console.log(`[ESP32] Registrado y unido a sala ${normalizedUser}`);
        });

        socket.on('update_config', (newConfig) => {
            saveConfig(newConfig);
            io.emit('config_update', getConfig());
        });

        socket.on('reset_config', () => {
            saveConfig(DEFAULT_CONFIG);
            io.emit('config_update', getConfig());
            console.log('[CONFIG] Configuración restablecida a valores por defecto.');
        });

        socket.on('request_config', () => {
            socket.emit('config_update', getConfig());
        });

        socket.on('disconnect', () => {
            console.log('Cliente desconectado:', socket.id);
            if (socket.tiktokRoom) {
                const room = socket.tiktokRoom;
                const clients = io.sockets.adapter.rooms.get(room);
                if (!clients || clients.size === 0) {
                    console.log(`[CLEANUP] Sala ${room} vacía. Desconectando TikTok...`);
                    orchestrator.releaseForRoom(room);
                    const conn = activeTikTokConnections.get(room);
                    if (conn) {
                        conn.disconnect();
                        activeTikTokConnections.delete(room);
                    }
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
}

module.exports = { setupSockets };
