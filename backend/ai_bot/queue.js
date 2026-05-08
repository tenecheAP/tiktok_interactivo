const { generateResponse } = require('./ai');
const { generateAudio } = require('./tts');
const { playAudio } = require('./player');
const path = require('path');
const fs = require('fs');

class AudioQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        
        // Crear carpeta temporal para audios si no existe
        this.tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Añade un mensaje a la cola (FIFO)
     */
    async add(username, comment, isSystem = false) {
        // Protección contra sobrecarga: Si la cola está muy llena, ignorar nuevos comentarios
        if (this.queue.length > 20) {
            console.log('[QUEUE] Cola llena (>20), ignorando mensaje de', username);
            return;
        }

        // Si isSystem es true, es una alerta del sistema (como un regalo), le damos prioridad (unshift)
        // O si no queremos romper el FIFO estricto, lo metemos normal.
        if (isSystem) {
            this.queue.unshift({ username, comment, isSystem });
        } else {
            this.queue.push({ username, comment, isSystem });
        }
        
        // Intentar procesar si la cola estaba inactiva
        this.process();
    }

    /**
     * Procesa el siguiente elemento de la cola
     */
    async process() {
        // Evitar procesamientos paralelos (dos audios sonando al mismo tiempo)
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        const currentTask = this.queue.shift();

        try {
            let textToRead = "";

            if (currentTask.isSystem) {
                // Si es un regalo u orden del sistema, no pasa por la IA (para ahorrar tokens y latencia)
                textToRead = currentTask.comment;
            } else {
                // Es un comentario del chat, lo pasamos por Gemini
                console.log(`[🤖 AI] Pensando respuesta para ${currentTask.username}...`);
                const aiResponse = await generateResponse(currentTask.username, currentTask.comment);
                if (aiResponse) {
                    textToRead = aiResponse;
                }
            }
            
            if (textToRead && textToRead.length > 0) {
                console.log(`[🗣️ TTS] Generando voz: "${textToRead}"`);
                
                const audioFileName = `tts_${Date.now()}.mp3`;
                const audioPath = path.join(this.tempDir, audioFileName);
                
                // 1. Sintetizar la voz
                const success = await generateAudio(textToRead, audioPath);
                
                if (success) {
                    console.log(`[🔊 PLAY] Reproduciendo...`);
                    // 2. Reproducir (esta línea bloquea hasta que termina el audio)
                    await playAudio(audioPath);
                }
            }
        } catch (error) {
            console.error('[QUEUE] Error grave en el pipeline:', error);
        } finally {
            // Liberar el estado de procesamiento
            this.isProcessing = false;
            // Recursividad controlada: procesar el siguiente en la cola
            this.process();
        }
    }
}

// Exportar como Singleton
const audioQueue = new AudioQueue();
module.exports = audioQueue;
