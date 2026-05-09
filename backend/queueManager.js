const roomStates = new Map();

function getRoomState(username) {
    if (!roomStates.has(username)) {
        roomStates.set(username, {
            currentLikes: 0,
            currentFollows: 0,
            currentShares: 0,
            currentDiamonds: 0,
            connectionStartTime: null,
            queues: {
                relay_1: { items: [], processing: false },
                relay_2: { items: [], processing: false },
                relay_3: { items: [], processing: false },
                relay_4: { items: [], processing: false },
                led_pulse: { items: [], processing: false },
                servo_wave: { items: [], processing: false }
            }
        });
    }
    return roomStates.get(username);
}

function addToQueue(username, actuator, actionData) {
    const state = getRoomState(username);
    if (!state.queues[actuator]) {
        state.queues[actuator] = { items: [], processing: false };
    }
    
    state.queues[actuator].items.push(actionData);
    console.log(`[QUEUE][${username}] Añadido a ${actuator}. Total en cola: ${state.queues[actuator].items.length}`);
    
    if (global.io) {
        global.io.to(username).emit('queue_update', {
            actuator: actuator,
            count: state.queues[actuator].items.length
        });
    }

    processQueue(username, actuator);
}

async function processQueue(username, actuator) {
    const state = getRoomState(username);
    if (state.queues[actuator].processing || state.queues[actuator].items.length === 0) return;

    state.queues[actuator].processing = true;
    const currentAction = state.queues[actuator].items[0];

    console.log(`[EXEC][${username}] Ejecutando acción en ${actuator} para ${currentAction.user}`);
    
    if (global.io) {
        global.io.to(username).emit('action_executing', currentAction);
    }

    await new Promise(resolve => setTimeout(resolve, currentAction.duration));

    state.queues[actuator].items.shift();
    state.queues[actuator].processing = false;
    
    if (global.io) {
        global.io.to(username).emit('queue_update', {
            actuator: actuator,
            count: state.queues[actuator].items.length
        });
    }

    processQueue(username, actuator);
}

module.exports = {
    roomStates,
    getRoomState,
    addToQueue,
    processQueue
};
