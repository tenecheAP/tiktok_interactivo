const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GEMINI_API_KEY } = require('./config');

if (!GEMINI_API_KEY) {
    console.error('ERROR: Falta GEMINI_API_KEY en el archivo .env');
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
// Usamos el modelo flash porque es rapidísimo, barato (gratis en la capa base) y excelente para chat
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Mantener contexto (Memoria a corto plazo para que la IA sepa de qué se estaba hablando)
let chatHistory = [
    {
        role: "user",
        parts: [{ text: `Eres un streamer de TikTok sarcástico, gracioso y entretenido, o el co-anfitrión del stream. 
Reglas absolutas:
1. Tus respuestas deben ser ULTRA CORTAS (máximo 15 palabras).
2. Tono natural, usa jerga de internet (bro, pana, gg, f, wtf, epico).
3. Humor ligero, un poco sarcástico pero no tóxico ni ofensivo.
4. Ignora cosas sin sentido o insultos fuertes.
5. NO USES EMOJIS en tu respuesta porque un sistema TTS (Text-to-Speech) los leerá y sonará robótico.
6. Háblale directamente al usuario que te escribe si es relevante.` }]
    },
    {
        role: "model",
        parts: [{ text: "Entendido bro. A darle átomos, directo al grano y sin rodeos." }]
    }
];

/**
 * Genera una respuesta inteligente basada en el comentario del usuario
 * @param {string} username - Usuario que comentó
 * @param {string} comment - Texto del comentario
 * @returns {Promise<string|null>} - Respuesta generada o null si falla
 */
async function generateResponse(username, comment) {
    try {
        const prompt = `El usuario ${username} dice en el chat: "${comment}"`;
        
        // Clonamos el historial actual y le añadimos el nuevo mensaje
        const currentChat = [...chatHistory, { role: "user", parts: [{ text: prompt }] }];
        
        const result = await model.generateContent({
            contents: currentChat,
            generationConfig: {
                temperature: 0.8,     // Un poco de creatividad
                maxOutputTokens: 60,  // Forzar respuesta corta a nivel de token
            }
        });

        // Limpiar asteriscos u otros caracteres Markdown que el TTS pueda leer raro
        let responseText = result.response.text().trim();
        responseText = responseText.replace(/\*/g, '');
        
        // Evitar que el historial crezca demasiado (limite de memoria)
        // Mantenemos el primer par (las instrucciones) y los últimos 10 mensajes
        if (chatHistory.length > 20) {
            chatHistory = chatHistory.slice(0, 2).concat(chatHistory.slice(-10));
        }

        // Guardamos la interacción en el historial
        chatHistory.push({ role: "user", parts: [{ text: prompt }] });
        chatHistory.push({ role: "model", parts: [{ text: responseText }] });

        return responseText;
    } catch (error) {
        console.error('[AI] Error generando respuesta:', error.message);
        return null;
    }
}

module.exports = { generateResponse };
