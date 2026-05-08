require('dotenv').config();

module.exports = {
    // API Keys y Credenciales
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    TIKTOK_USERNAME: process.env.TIKTOK_USERNAME,

    // Configuración de Voz (Edge-TTS)
    // es-CO-GonzaloNeural es una voz masculina muy natural y clara
    VOICE_NAME: process.env.VOICE_NAME || 'es-CO-GonzaloNeural',
    PITCH: '+0Hz',
    RATE: '+0%',

    // Configuración Anti-Spam y Límites
    MAX_MESSAGE_LENGTH: 100, // Evitar que la IA lea o procese biblias
    COOLDOWN_MS: 5000,       // 5 segundos de espera entre mensajes de la misma persona
};
