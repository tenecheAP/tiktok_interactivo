const fs = require('fs');
const path = require('path');

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

module.exports = { appendLogFile };
