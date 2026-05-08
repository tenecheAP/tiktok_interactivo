const { MAX_MESSAGE_LENGTH, COOLDOWN_MS } = require('./config');

const userCooldowns = new Map();
const recentMessages = new Set();

/**
 * Función para determinar si un mensaje debe ser ignorado por el bot
 * @param {string} username - Nombre del usuario de TikTok
 * @param {string} comment - Texto del comentario
 * @returns {boolean} true si es spam, false si es un mensaje válido
 */
function isSpam(username, comment) {
    const now = Date.now();

    // 1. Filtrar por longitud excesiva (evita que el TTS hable por horas)
    if (comment.length > MAX_MESSAGE_LENGTH) return true;

    // 2. Cooldown por usuario (evita que un usuario acapare el bot)
    if (userCooldowns.has(username)) {
        const lastTime = userCooldowns.get(username);
        if (now - lastTime < COOLDOWN_MS) {
            return true; // Aún está en cooldown
        }
    }

    // 3. Filtrar comandos de sistema o moderación (ej: !play, /help)
    if (comment.startsWith('!') || comment.startsWith('/')) return true;

    // 4. Filtrar mensajes repetidos en un lapso corto de tiempo
    const msgHash = comment.toLowerCase().trim();
    if (recentMessages.has(msgHash)) {
        return true; // Alguien más o la misma persona ya dijo exactamente lo mismo
    }

    // Si pasa los filtros, registramos la actividad
    userCooldowns.set(username, now);
    recentMessages.add(msgHash);

    // Limpiar caché de mensajes recientes después de 30 segundos
    // para evitar que la memoria crezca infinitamente
    setTimeout(() => {
        recentMessages.delete(msgHash);
    }, 30000);

    return false;
}

module.exports = { isSpam };
