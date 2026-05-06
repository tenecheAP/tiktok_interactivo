/** Configuración por defecto del bot lector (solo cliente; localStorage). */
export const DEFAULT_BOT_CONFIG = {
  activationGiftNames: ['Rose'],
  continuationGiftNames: ['Rose'],
  commentsPerBlock: 5,
  maxCommentsPerViewerSession: 50,
  vipMinCoinValue: 500,
  vipGiftNames: ['Universe', 'TikTok Universe'],
  priorityVipFirst: false,
  readUsername: false,
};

export const STORAGE_KEY = 'tiktok_bot_lector_config';

/** @returns {BotConfig} */
export function loadBotConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BOT_CONFIG };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_BOT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_BOT_CONFIG };
  }
}

/** @param {BotConfig} cfg */
export function saveBotConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}
