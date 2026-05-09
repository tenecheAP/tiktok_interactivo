const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'config.json');

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
    return config;
}

function saveConfig(newConfig) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 4));
        config = newConfig;
        console.log('[CONFIG] Configuración guardada en archivo.');
    } catch (err) {
        console.error('[CONFIG] Error al guardar configuración:', err);
    }
}

function getConfig() {
    return config;
}

function setConfig(newConfig) {
    config = newConfig;
}

module.exports = {
    DEFAULT_CONFIG,
    loadConfig,
    saveConfig,
    getConfig,
    setConfig
};
