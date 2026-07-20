const { getConfig } = require('./configManager');
const { addToQueue, getRoomState } = require('./queueManager');
const giftCatalogManager = require('./giftCatalogManager');

function normalizeLiveChat(data) {
    return {
        uniqueId: data.uniqueId || data.userId || data.user?.uniqueId || null,
        userId: data.userId || data.user?.userId || null,
        nickname: data.nickname || data.user?.nickname || 'Anónimo',
        comment: data.comment ?? '',
        ts: Date.now()
    };
}

function normalizeLiveGift(data) {
    const name = data.giftName || data.giftId || 'Regalo';
    const value = data.giftValue || data.diamondCount || 0;
    return {
        ...data,
        giftName: name,
        nickname: data.nickname || 'Anónimo',
        giftValue: value,
        repeatCount: data.repeatCount ?? 1,
        badgeLevel: data.badgeLevel ?? 0,
        uniqueId: data.uniqueId || data.userId || null,
        ts: Date.now()
    };
}

function triggerAction(mapping, data, username) {
    const config = getConfig();
    let userLevel = 'follower';
    if (data.badgeLevel >= 10 || data.giftValue > 50) userLevel = 'super_fan';
    else if (data.badgeLevel > 0) userLevel = 'fan';

    const actions = Array.isArray(mapping.action) ? mapping.action : [mapping.action];
    
    actions.forEach(action => {
        const actionData = {
            action: action,
            duration: mapping.duration,
            color: config.levels[userLevel].color,
            sound: mapping.sound,
            user: data.nickname,
            level: userLevel,
            eventName: mapping.event === 'like_goal' ? 'Meta de Likes Alcanzada!' : mapping.event,
            giftName: data.giftName || null,
            giftValue: data.giftValue || data.diamondCount || 0,
            repeatCount: data.repeatCount || 1,
            ts: Date.now()
        };

        addToQueue(username, action, actionData);
    });
}

function processEvent(eventType, data, username) {
    const config = getConfig();
    const state = getRoomState(username);

    // --- MANEJO DE METAS ---
    
    // 1. Likes
    if (eventType === 'like') {
        state.currentLikes += (data.likeCount || 1);
        const goal = config.mappings.find(m => m.event === 'like_goal');
        if (goal && state.currentLikes >= goal.threshold) {
            triggerAction(goal, data, username);
            if (goal.autoReset) state.currentLikes = 0;
            else state.currentLikes = goal.threshold;
        }
        if (global.io) global.io.to(username).emit('likes_update', { current: state.currentLikes, goal: goal?.threshold || 1000 });
        return;
    }

    // 2. Seguidores (Follow)
    if (eventType === 'follow') {
        state.currentFollows += 1;
        const goal = config.mappings.find(m => m.event === 'follow_goal');
        if (goal && state.currentFollows >= goal.threshold) {
            triggerAction(goal, data, username);
            if (goal.autoReset) state.currentFollows = 0;
            else state.currentFollows = goal.threshold;
        }
    }

    // 3. Compartidas (Share)
    if (eventType === 'share') {
        state.currentShares += 1;
        const goal = config.mappings.find(m => m.event === 'share_goal');
        if (goal && state.currentShares >= goal.threshold) {
            triggerAction(goal, data, username);
            if (goal.autoReset) state.currentShares = 0;
            else state.currentShares = goal.threshold;
        }
    }

    // 4. Espectadores (Viewer Record)
    if (eventType === 'viewer_count') {
        const count = data.viewerCount || 0;
        const goal = config.mappings.find(m => m.event === 'viewer_goal');
        if (goal && count >= goal.threshold) {
            // Nota: viewer_goal usualmente no se resetea automáticamente de la misma forma
            triggerAction(goal, data, username);
        }
        return;
    }

    // --- EVENTOS NORMALES ---

    if (eventType === 'gift') {
        const giftName = data.giftName || 'Regalo';
        const giftValue = data.giftValue || data.diamondCount || 0;
        
        // Actualizar catálogo de regalos inteligente
        giftCatalogManager.updateGift(data);
        
        // Meta de diamantes acumulados
        if (giftValue > 0) {
            state.currentDiamonds = (state.currentDiamonds || 0) + giftValue;
            const diamGoal = config.mappings.find(m => m.event === 'gift_value_goal');
            if (diamGoal && state.currentDiamonds >= diamGoal.threshold) {
                triggerAction(diamGoal, data, username);
                if (diamGoal.autoReset) state.currentDiamonds = 0;
                else state.currentDiamonds = diamGoal.threshold;
            }
        }

        const giftMapping = config.mappings.find(m => 
            m.event === 'gift' && 
            m.giftName.toLowerCase() === giftName.toLowerCase()
        );
        
        const valueMapping = config.mappings.find(m => 
            m.event === 'gift_value' && 
            giftValue >= (m.minValue || 0) &&
            giftValue <= (m.maxValue || Infinity)
        );

        if (giftMapping) {
            triggerAction(giftMapping, data, username);
        } else if (valueMapping) {
            triggerAction(valueMapping, data, username);
        } else {
            if (global.io) {
                global.io.to(username).emit('action', {
                    user: data.nickname,
                    giftName: giftName,
                    giftValue: giftValue,
                    repeatCount: data.repeatCount || 1,
                    ts: Date.now(),
                    level: data.badgeLevel >= 10 ? 'super_fan' : (data.badgeLevel > 0 ? 'fan' : 'follower'),
                    eventName: 'Regalo Recibido',
                    action: 'Sin acción física',
                    sound: null
                });
            }
        }
        return;
    }

    const mapping = config.mappings.find(m => m.event === eventType);
    if (mapping) {
        triggerAction(mapping, data, username);
    }
}

module.exports = {
    normalizeLiveChat,
    normalizeLiveGift,
    processEvent,
    triggerAction
};
