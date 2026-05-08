const sound = require('sound-play');
const fs = require('fs');

/**
 * Reproduce un archivo de audio local nativamente en Windows.
 * Esta función es "blocking" (síncrona para la promesa), lo que significa que
 * no se resolverá hasta que el audio termine de sonar.
 * @param {string} filePath - Ruta absoluta al archivo mp3
 * @returns {Promise<boolean>} true si se reprodujo con éxito
 */
async function playAudio(filePath) {
    try {
        // En Windows, esto utiliza powershell/VBS script por detrás para reproducir sin interfaz
        await sound.play(filePath);
        
        // Limpieza: Borrar el archivo una vez que ya sonó para no saturar el disco duro
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        return true;
    } catch (error) {
        console.error('[PLAYER] Error reproduciendo audio:', error.message);
        // Intentar limpiar de todas formas si hubo error
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return false;
    }
}

module.exports = { playAudio };
