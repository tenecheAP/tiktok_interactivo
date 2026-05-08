const { EdgeTTS } = require('node-edge-tts');
const { VOICE_NAME, PITCH, RATE } = require('./config');

// Instancia de Edge TTS configurada con la voz de Azure (gratis)
const tts = new EdgeTTS({
    voice: VOICE_NAME,
    pitch: PITCH, // e.g. '+0Hz'
    rate: RATE    // e.g. '+0%'
});

/**
 * Convierte texto a un archivo MP3 de forma asíncrona
 * @param {string} text - Texto a hablar
 * @param {string} outputPath - Ruta absoluta donde se guardará el mp3
 * @returns {Promise<boolean>} true si tuvo éxito
 */
async function generateAudio(text, outputPath) {
    try {
        // Llama a la API de Microsoft Edge TTS
        await tts.ttsPromise(text, outputPath);
        return true;
    } catch (error) {
        console.error('[TTS] Error generando audio:', error.message);
        return false;
    }
}

module.exports = { generateAudio };
