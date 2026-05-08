require('dotenv').config();
const { WebcastPushConnection } = require('tiktok-live-connector');
const { isSpam } = require('./filtros');
const audioQueue = require('./queue');
const { TIKTOK_USERNAME } = require('./config');

if (!TIKTOK_USERNAME || TIKTOK_USERNAME === 'tu_usuario_aqui') {
    console.error('❌ ERROR: Debes configurar TIKTOK_USERNAME y GEMINI_API_KEY en el archivo .env');
    process.exit(1);
}

// Limpiamos el @ por si el usuario lo introdujo en el .env
const targetRoom = TIKTOK_USERNAME.replace(/^@/, '').trim();

// Configuración de la conexión a TikTok
const tiktokLiveConnection = new WebcastPushConnection(targetRoom, {
    processInitialData: false,
    enableExtendedGiftInfo: true,
    enableWebsocketUpgrade: true,
    requestPollingIntervalMs: 2000,
    disableEulerFallbacks: true // Previene el error confuso de Euler Stream si el usuario no está live
});

// 1. Conexión principal
tiktokLiveConnection.connect().then(state => {
    console.info(`[✅ TIKTOK] Conectado exitosamente al Live de ${state.roomId}`);
    console.info(`[🚀 BOT] Bot de voz IA activado. Escuchando comentarios...`);
    
    // Opcional: Mensaje de bienvenida del bot
    audioQueue.add("SYSTEM", "Conexión establecida. Hola a todos, el bot ya está activo.", true);
}).catch(err => {
    console.error('[❌ TIKTOK] Error crítico al conectar:', err.message);
    console.error('¿Estás seguro de que el usuario está en DIRECTO (Live) ahora mismo?');
});

// 2. Evento: Recibir un Comentario del Chat
tiktokLiveConnection.on('chat', data => {
    const username = data.uniqueId;
    const comment = data.comment;

    console.log(`[💬 CHAT] ${username}: ${comment}`);

    // Filtros de spam, comandos y limpieza
    if (!isSpam(username, comment)) {
        // Enviar a la cola para procesamiento con IA y lectura
        audioQueue.add(username, comment);
    } else {
        // Ocultar este log si es muy ruidoso
        // console.log(`[🛡️] Ignorado por spam/cooldown/filtro: ${username}`);
    }
});

// 3. Evento: Recibir un Regalo (Gifts)
tiktokLiveConnection.on('gift', data => {
    const username = data.uniqueId;
    const giftName = data.giftName || 'Regalo';
    const count = data.repeatCount || 1;
    
    // Ignorar regalos mientras la animación suma los combos (sólo avisar al final)
    // El TikTok Live Connector maneja esto con data.giftType. 
    // Para simplificar, leemos todos.
    
    console.log(`[🎁 GIFT] ${username} envió ${count}x ${giftName}`);
    
    // Los regalos son agradecimientos predeterminados sin usar IA (para mayor rapidez)
    // Se pasan con isSystem = true para tener prioridad en la cola
    const textoAgradecimiento = `Muchísimas gracias ${username} por los ${count} ${giftName}.`;
    audioQueue.add("SYSTEM", textoAgradecimiento, true);
});

// 4. Manejo de Errores
tiktokLiveConnection.on('error', err => {
    console.error('[⚠️ ERROR TIKTOK]', err.message);
});

tiktokLiveConnection.on('disconnected', () => {
    console.log('[🔴 DESCONECTADO] El Live ha terminado o se perdió la conexión.');
});
