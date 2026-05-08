/**
 * Seed inicial de cuentas para el Account Pool
 * IMPORTANTE: Cambia estos valores por cuentas reales antes de producción
 */

const { AccountPool, AccountStatus } = require('./accountPool');
const path = require('path');

const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');

async function seed() {
    const pool = new AccountPool();

    // Datos de ejemplo – REEMPLAZAR con credenciales reales
    const demoAccounts = [
        {
            username: '@streamer_main',
            uniqueId: '1234567890123456789', // Ejemplo – obtener de TikTok
            sessionId: 'session_id_ejemplo_abc123', // sesión activa en TikTok web
            cookies: '', // EN PROD: encriptar con crypto-js
            status: AccountStatus.STANDBY,
            healthScore: 1.0,
            priority: 1,
            weight: 100,
            metadata: {
                followers: 15000,
                isVerified: false,
                country: 'MX',
                notes: 'Cuenta principal, más segura'
            }
        },
        {
            username: '@backup_streamer_1',
            uniqueId: '9876543210987654321',
            sessionId: '',
            cookies: '',
            status: AccountStatus.STANDBY,
            healthScore: 1.0,
            priority: 2,
            weight: 80,
            metadata: {
                followers: 5000,
                isVerified: false,
                country: 'MX',
                notes: 'Backup primario'
            }
        },
        {
            username: '@backup_streamer_2',
            uniqueId: '4567891234567891234',
            sessionId: '',
            cookies: '',
            status: AccountStatus.STANDBY,
            healthScore: 1.0,
            priority: 3,
            weight: 60,
            metadata: {
                followers: 2000,
                isVerified: false,
                country: 'MX',
                notes: 'Backup secundario'
            }
        }
    ];

    for (const accData of demoAccounts) {
        pool.addAccount(accData);
        console.log(`[SEED] Añadida cuenta: ${accData.username}`);
    }

    pool.config = {
        failoverThreshold: 0.3,
        cooldownAfterBan: 3600000,
        cooldownAfterError: 300000,
        maxConcurrentPerAccount: 1,
        healthCheckInterval: 30000,
        autoRecoverEnabled: true,
        requireAllAccountsHealthy: false
    };

    await pool.persist();
    console.log(`[SEED] Pool inicializado con ${pool.size()} cuentas.`);
}

seed().catch(console.error);
