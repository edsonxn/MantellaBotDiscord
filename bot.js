require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { OpenAI } = require('openai');
const fs = require('fs');

// Configura Discord y OpenAI
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});


// Función para cargar la personalidad desde el archivo
const loadPersonality = () => {
    try {
        const personality = fs.readFileSync('personality.txt', 'utf8');
        return personality.trim(); // Elimina espacios en blanco innecesarios
    } catch (error) {
        console.error('Error al cargar el archivo de personalidad:', error);
        return `Eres un asistente estándar. Responde de forma genérica pero útil.`; // Personalidad por defecto
    }
};

// Archivo para guardar el historial de conversaciones
const historyFile = 'conversationHistory.json';
let conversationHistory = {};

// Cargar el historial de conversaciones desde el archivo
if (fs.existsSync(historyFile)) {
    try {
        const data = fs.readFileSync(historyFile, 'utf8');
        conversationHistory = JSON.parse(data);
    } catch (error) {
        console.error('Error al leer el archivo de historial:', error);
    }
}

// Función para guardar el historial en el archivo
const saveConversationHistory = () => {
    try {
        fs.writeFileSync(historyFile, JSON.stringify(conversationHistory, null, 2), 'utf8');
    } catch (error) {
        console.error('Error al guardar el archivo de historial:', error);
    }
};

client.once('ready', () => {
    console.log(`¡Bot conectado como ${client.user.tag}!`);
});


client.on('messageCreate', async (message) => {
    const allowedChannelIds = ['1315348238202704003']; // Lista de IDs de canales permitidos

    if (!allowedChannelIds.includes(message.channel.id) || message.author.bot) return;

    // Inicializa el historial de conversación para el canal si no existe
    if (!conversationHistory[message.channel.id]) {
        conversationHistory[message.channel.id] = [];
    }

    if (message.attachments.size > 0) {
        const imageAttachment = message.attachments.first();

        if (imageAttachment.contentType.startsWith('image/')) {
            try {
                const personality = loadPersonality(); // Cargar la personalidad configurada
        
                // Agregar el historial de conversación del canal
                const chatHistory = conversationHistory[message.channel.id]?.map(msg => ({
                    role: msg.role,
                    content: msg.content
                })) || [];
        
                const response = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: personality }, // Incluir la personalidad
                        ...chatHistory, // Incluir el historial de conversación
                        {
                            role: "user",
                            content: [
                                { type: "text", text: "si es un error explica por qué podría ser y si no es un error responde sarcastico, ironico acido" },
                                { type: "image_url", image_url: { url: imageAttachment.url } },
                            ],
                        },
                    ],
                    max_tokens: 300,
                });
        
                const reply = response.choices[0]?.message?.content || "No estoy seguro de qué es esta imagen.";
                
                // Agregar la respuesta al historial de conversación
                conversationHistory[message.channel.id].push({ role: "assistant", content: reply });
                saveConversationHistory(); // Guardar el historial actualizado
                
                message.reply(reply);
            } catch (error) {
                console.error('Error al procesar la imagen:', error);
                message.reply("Hubo un problema al analizar la imagen. Intenta con otra.");
            }
        } else {
            message.reply("Adjunta una imagen para que pueda analizarla.");
        }
        
        return;
    }

    // Agrega el mensaje del usuario al historial del canal
    conversationHistory[message.channel.id].push({
        role: "user",
        content: `${message.author.username} dijo: ${message.content}`,
    });

    // Limita el tamaño del historial a 20 mensajes por canal
    if (conversationHistory[message.channel.id].length > 20) {
        conversationHistory[message.channel.id].shift();
    }

    saveConversationHistory(); // Guarda el historial de todos los canales

    try {
        const personality = loadPersonality(); // Carga la personalidad
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: personality },
                ...conversationHistory[message.channel.id]
            ],
        });

        const gptReply = completion.choices[0]?.message?.content || 'No tengo respuesta para eso.';
        conversationHistory[message.channel.id].push({ role: "assistant", content: gptReply });

        saveConversationHistory(); // Guarda el historial actualizado
        message.channel.send(gptReply);
    } catch (error) {
        console.error(error);
        message.channel.send("Hubo un error al procesar tu mensaje. Inténtalo nuevamente más tarde.");
    }
});




// Inicia sesión en Discord con tu token
client.login(process.env.DISCORD_TOKEN);
