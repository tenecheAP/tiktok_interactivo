/**
 * Motor de reglas del bot lector (sin efectos secundarios de audio).
 * @typedef {{
 *   activationGiftNames: string[],
 *   continuationGiftNames: string[],
 *   commentsPerBlock: number,
 *   maxCommentsPerViewerSession: number,
 *   vipMinCoinValue: number,
 *   vipGiftNames: string[],
 *   priorityVipFirst: boolean,
 * }} BotConfig
 */

/** @typedef {'inactive'|'active_reading'|'blocked_need_gift'|'exhausted'} ViewerFsmState */

/**
 * @typedef {Object} ViewerState
 * @property {ViewerFsmState} state
 * @property {number} totalRead
 * @property {number} blockRemaining
 * @property {boolean} [vipBoost] lecturas con prioridad si priorityVipFirst
 */

/** @typedef {{ type: 'utterance', text: string, viewerKey: string, nickname: string, priority: number }} UtteranceOutput */
/** @typedef {{ type: 'log', level: 'info'|'warn', message: string }} LogOutput */

export function getViewerKey(payload) {
  return String(payload.uniqueId || payload.userId || payload.nickname || 'unknown');
}

/** @returns {ViewerState} */
export function createDefaultViewerState() {
  return {
    state: 'inactive',
    totalRead: 0,
    blockRemaining: 0,
    vipBoost: false,
  };
}

function matchesName(names, giftName) {
  if (!names?.length) return false;
  const g = (giftName || '').toLowerCase().trim();
  return names.some((n) => (n || '').toLowerCase().trim() === g);
}

/**
 * @param {BotConfig} config
 * @param {object} gift
 */
export function isVipActivation(config, gift) {
  const min = config.vipMinCoinValue;
  if (typeof min === 'number' && min > 0 && (gift.giftValue ?? 0) >= min) {
    return true;
  }
  if (matchesName(config.vipGiftNames || [], gift.giftName)) {
    return true;
  }
  return false;
}

function refillBlock(config, viewer) {
  const quotaLeft = Math.max(
    0,
    config.maxCommentsPerViewerSession - viewer.totalRead
  );
  return Math.min(config.commentsPerBlock, quotaLeft);
}

/**
 * Un evento de regalo cuenta como una sola activación (no se multiplica por repeatCount).
 * @param {BotConfig} config
 * @param {Record<string, ViewerState>} viewers
 * @param {object} gift
 */
export function reduceGift(config, viewers, gift) {
  const key = getViewerKey(gift);
  /** @type {LogOutput[]} */
  const outputs = [];

  let v = viewers[key] ? { ...viewers[key] } : createDefaultViewerState();

  if (v.state === 'exhausted') {
    outputs.push({
      type: 'log',
      level: 'warn',
      message: `${gift.nickname}: cota de lectura agotada para esta sesión.`,
    });
    return { viewers: { ...viewers, [key]: v }, outputs };
  }

  const vip = isVipActivation(config, gift);
  const activation = matchesName(config.activationGiftNames, gift.giftName);
  const continuation = matchesName(config.continuationGiftNames, gift.giftName);
  const canUnblock = continuation || vip || activation;

  if (v.state === 'blocked_need_gift') {
    if (canUnblock) {
      const block = refillBlock(config, v);
      if (block <= 0) {
        v = { ...v, state: 'exhausted' };
        outputs.push({
          type: 'log',
          level: 'warn',
          message: `${gift.nickname}: sin cupo restante.`,
        });
      } else {
        const boost = vip ? true : v.vipBoost === true;
        v = { ...v, state: 'active_reading', blockRemaining: block, vipBoost: boost };
        outputs.push({
          type: 'log',
          level: 'info',
          message: `${gift.nickname}: bloque de lectura reabierto (${block} comentarios).`,
        });
      }
      return { viewers: { ...viewers, [key]: v }, outputs };
    }
    outputs.push({
      type: 'log',
      level: 'info',
      message: `${gift.nickname}: debe enviar regalo de continuación para seguir leyendo.`,
    });
    return { viewers: { ...viewers, [key]: v }, outputs };
  }

  if (v.state === 'inactive') {
    if (vip || activation) {
      const block = refillBlock(config, v);
      if (block <= 0) {
        v = { ...v, state: 'exhausted' };
      } else {
        v = {
          ...v,
          state: 'active_reading',
          blockRemaining: block,
          vipBoost: !!vip,
        };
        outputs.push({
          type: 'log',
          level: 'info',
          message: `${gift.nickname}: activado para lectura (${block} comentarios en este bloque).`,
        });
      }
      return { viewers: { ...viewers, [key]: v }, outputs };
    }
    return { viewers: { ...viewers, [key]: v }, outputs };
  }

  if (v.state === 'active_reading') {
    if (vip || activation || continuation) {
      const block = refillBlock(config, v);
      if (block <= 0) {
        v = { ...v, state: 'exhausted' };
      } else {
        const boost = vip ? true : v.vipBoost === true;
        v = { ...v, blockRemaining: block, vipBoost: boost };
        outputs.push({
          type: 'log',
          level: 'info',
          message: `${gift.nickname}: bloque recargado (${block} comentarios).`,
        });
      }
      return { viewers: { ...viewers, [key]: v }, outputs };
    }
    return { viewers: { ...viewers, [key]: v }, outputs };
  }

  return { viewers: { ...viewers, [key]: v }, outputs };
}

/**
 * @param {BotConfig} config
 * @param {Record<string, ViewerState>} viewers
 * @param {object} chat
 */
export function reduceChat(config, viewers, chat) {
  const key = getViewerKey(chat);
  /** @type {(UtteranceOutput|LogOutput)[]} */
  const outputs = [];

  const freeForAll = !config.activationGiftNames || config.activationGiftNames.length === 0;

  // Filtrar emojis y dejar solo texto
  const cleanComment = (chat.comment || '')
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .trim();

  // Si el mensaje estaba compuesto solo de emojis y quedó vacío, lo ignoramos
  if (!cleanComment) {
    return { viewers, outputs: [] };
  }

  if (!viewers[key] && !freeForAll) {
    return { viewers, outputs: [] };
  }

  let v = viewers[key] ? { ...viewers[key] } : createDefaultViewerState();

  if (freeForAll) {
    v.state = 'active_reading';
    v.blockRemaining = Infinity;
  } else if (v.state !== 'active_reading') {
    return { viewers, outputs: [] };
  }

  if (v.blockRemaining <= 0) {
    v = { ...v, state: 'blocked_need_gift' };
    outputs.push({
      type: 'log',
      level: 'info',
      message: `${chat.nickname}: bloque agotado; enviar regalo de continuación.`,
    });
    return { viewers: { ...viewers, [key]: v }, outputs };
  }

  const quotaLeft = freeForAll ? Infinity : (config.maxCommentsPerViewerSession - v.totalRead);
  if (quotaLeft <= 0) {
    v = { ...v, state: 'exhausted' };
    return { viewers: { ...viewers, [key]: v }, outputs };
  }

  const text = config.readUsername ? `${chat.nickname} dice: ${cleanComment}` : cleanComment;
  const priority =
    config.priorityVipFirst && v.vipBoost ? 1 : 0;

  v = {
    ...v,
    totalRead: v.totalRead + 1,
    blockRemaining: freeForAll ? Infinity : (v.blockRemaining - 1),
  };

  outputs.push({
    type: 'utterance',
    text,
    viewerKey: key,
    nickname: chat.nickname,
    priority,
  });

  if (!freeForAll) {
    if (v.totalRead >= config.maxCommentsPerViewerSession) {
      v.state = 'exhausted';
      outputs.push({
        type: 'log',
        level: 'info',
        message: `${chat.nickname}: cota total de la sesión alcanzada.`,
      });
    } else if (v.blockRemaining === 0) {
      v.state = 'blocked_need_gift';
      outputs.push({
        type: 'log',
        level: 'info',
        message: `${chat.nickname}: bloque completo; enviar regalo de continuación para más lecturas.`,
      });
    }
  }

  return { viewers: { ...viewers, [key]: v }, outputs };
}
