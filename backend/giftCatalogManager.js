const fs = require('fs');
const path = require('path');

class GiftCatalogManager {
    constructor() {
        this.filePath = path.join(__dirname, 'gifts.json');
        this.gifts = [];
        this.isDirty = false;
        this.saveTimeout = null;
    }

    /**
     * Cargar el catálogo desde el archivo gifts.json
     */
    async load() {
        try {
            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf-8');
                this.gifts = JSON.parse(raw).map(g => {
                    if (g.icon && typeof g.icon === 'object') {
                        const url = g.icon.url?.[0] || g.icon.url_list?.[0] || g.icon.urlList?.[0] || '';
                        return { ...g, icon: url };
                    }
                    return g;
                });
                console.info(`[CATALOG] ${this.gifts.length} regalos cargados y normalizados desde gifts.json`);
            } else {
                this.gifts = [];
                console.info(`[CATALOG] Archivo gifts.json no encontrado, inicializando vacío.`);
            }
        } catch (err) {
            console.error(`[CATALOG] Error al cargar gifts.json:`, err);
            this.gifts = [];
        }
    }

    /**
     * Guardar el catálogo de forma inmediata
     */
    save() {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(this.gifts, null, 2), 'utf-8');
            this.isDirty = false;
            if (this.saveTimeout) {
                clearTimeout(this.saveTimeout);
                this.saveTimeout = null;
            }
            console.info(`[CATALOG] Catálogo guardado en disco con éxito.`);
        } catch (err) {
            console.error(`[CATALOG] Error al guardar gifts.json:`, err);
        }
    }

    /**
     * Actualiza o inserta un regalo en el catálogo
     */
    updateGift(giftEvent) {
        const giftId = parseInt(giftEvent.giftId || giftEvent.id);
        if (!giftId) return;

        const now = new Date().toISOString();
        const giftName = giftEvent.giftName || giftEvent.name || 'Unknown';
               const diamonds = parseInt(giftEvent.diamondCount || giftEvent.giftValue || giftEvent.diamonds || 0);
        
        let icon = '';
        if (giftEvent.icon) {
            if (typeof giftEvent.icon === 'string') {
                icon = giftEvent.icon;
            } else if (typeof giftEvent.icon === 'object') {
                icon = giftEvent.icon.url?.[0] || giftEvent.icon.url_list?.[0] || giftEvent.icon.urlList?.[0] || '';
            }
        }
        if (!icon && giftEvent.image_url) {
            icon = giftEvent.image_url;
        }

        const description = giftEvent.describe || giftEvent.description || '';
        const type = giftEvent.giftType || giftEvent.type || 1;
        const repeatable = giftEvent.repeatable ?? true;
        const increment = parseInt(giftEvent.repeatCount || 1);

        let giftIndex = this.gifts.findIndex(g => parseInt(g.id) === giftId);

        let updated = false;

        if (giftIndex === -1) {
            // Registrar nuevo regalo
            const newGift = {
                id: giftId,
                name: giftName,
                diamonds: diamonds,
                icon: icon,
                description: description,
                type: type,
                repeatable: repeatable,
                firstSeen: now,
                lastSeen: now,
                timesReceived: increment,
                lastModified: now
            };
            this.gifts.push(newGift);
            updated = true;
            console.log(`[CATALOG] Nuevo regalo detectado: ${giftName} (ID: ${giftId})`);
        } else {
            // Actualizar regalo existente
            const gift = this.gifts[giftIndex];
            
            // Verificar si hay campos modificados
            if (gift.name !== giftName || 
                gift.diamonds !== diamonds || 
                gift.icon !== icon || 
                gift.description !== description || 
                gift.type !== type || 
                gift.repeatable !== repeatable) {
                
                gift.name = giftName;
                gift.diamonds = diamonds;
                gift.icon = icon;
                gift.description = description;
                gift.type = type;
                gift.repeatable = repeatable;
                updated = true;
            }

            gift.timesReceived = (gift.timesReceived || 0) + increment;
            gift.lastSeen = now;
            gift.lastModified = now;
        }

        // Marcar cambios y programar persistencia inteligente (5s debounce)
        this.isDirty = true;
        this.scheduleDelayedSave();

        // Notificar en tiempo real por websockets
        if (global.io) {
            global.io.emit('gift_catalog_updated', this.gifts);
        }
    }

    /**
     * Planifica el guardado en disco con retraso de 5 segundos
     */
    scheduleDelayedSave() {
        if (this.saveTimeout) return; // Ya hay un guardado programado

        this.saveTimeout = setTimeout(() => {
            if (this.isDirty) {
                this.save();
            }
        }, 5000);
    }

    getGift(giftId) {
        return this.gifts.find(g => parseInt(g.id) === parseInt(giftId)) || null;
    }

    getAll() {
        return this.gifts;
    }

    exists(giftId) {
        return this.gifts.some(g => parseInt(g.id) === parseInt(giftId));
    }

    search(query) {
        if (!query) return this.gifts;
        const q = query.toLowerCase().trim();
        return this.gifts.filter(g => 
            g.name.toLowerCase().includes(q) || 
            g.id.toString().includes(q)
        );
    }

    exportCSV() {
        const headers = ['id', 'name', 'diamonds', 'icon', 'description', 'type', 'repeatable', 'firstSeen', 'lastSeen', 'timesReceived', 'lastModified'];
        const csvRows = [headers.join(',')];

        for (const g of this.gifts) {
            const values = [
                g.id,
                `"${g.name.replace(/"/g, '""')}"`,
                g.diamonds,
                `"${g.icon}"`,
                `"${(g.description || '').replace(/"/g, '""')}"`,
                g.type,
                g.repeatable,
                g.firstSeen,
                g.lastSeen,
                g.timesReceived,
                g.lastModified
            ];
            csvRows.push(values.join(','));
        }
        return csvRows.join('\n');
    }

    exportJSON() {
        return JSON.stringify(this.gifts, null, 2);
    }

    stats() {
        if (this.gifts.length === 0) {
            return {
                totalGifts: 0,
                mostSentGift: null,
                mostDiamondsGift: null,
                accumulatedDiamonds: 0,
                averageDiamonds: 0,
                firstSeenGift: null,
                lastSeenGift: null
            };
        }

        let totalGifts = this.gifts.length;
        let mostSentGift = this.gifts[0];
        let mostDiamondsGift = this.gifts[0];
        let accumulatedDiamonds = 0;
        let firstSeenGift = this.gifts[0];
        let lastSeenGift = this.gifts[0];

        for (const g of this.gifts) {
            if (g.timesReceived > mostSentGift.timesReceived) {
                mostSentGift = g;
            }
            if (g.diamonds > mostDiamondsGift.diamonds) {
                mostDiamondsGift = g;
            }
            accumulatedDiamonds += (g.timesReceived * g.diamonds);

            if (new Date(g.firstSeen) < new Date(firstSeenGift.firstSeen)) {
                firstSeenGift = g;
            }
            if (new Date(g.lastSeen) > new Date(lastSeenGift.lastSeen)) {
                lastSeenGift = g;
            }
        }

        return {
            totalGifts,
            mostSentGift: { id: mostSentGift.id, name: mostSentGift.name, timesReceived: mostSentGift.timesReceived },
            mostDiamondsGift: { id: mostDiamondsGift.id, name: mostDiamondsGift.name, diamonds: mostDiamondsGift.diamonds },
            accumulatedDiamonds,
            averageDiamonds: parseFloat((accumulatedDiamonds / this.gifts.reduce((sum, g) => sum + g.timesReceived, 0)).toFixed(2)) || 0,
            firstSeenGift: { id: firstSeenGift.id, name: firstSeenGift.name, firstSeen: firstSeenGift.firstSeen },
            lastSeenGift: { id: lastSeenGift.id, name: lastSeenGift.name, lastSeen: lastSeenGift.lastSeen }
        };
    }
}

module.exports = new GiftCatalogManager();
