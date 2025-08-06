// src/index.js

// 1. DEPENDENCIAS
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const mongoose = require('mongoose');
const cron = require('node-cron');
const axios = require('axios'); // Herramienta para el despertador
const AvailabilityPanel = require('./models/availabilityPanel.js');
const TeamChatChannel = require('./models/teamChatChannel.js');
const Team = require('./models/team.js');

// 2. CONEXIÓN A BASE DE DATOS
mongoose.connect(process.env.DATABASE_URL)
    .then(() => console.log('Conectado a MongoDB.'))
    .catch(err => console.error('Error de conexión con MongoDB:', err));

// 3. CONFIGURACIÓN DEL CLIENTE DE DISCORD
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// 4. CARGA DE COMANDOS
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFilesToExclude = ['panel-amistosos.js', 'admin-gestionar-equipo.js'];
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') && !commandFilesToExclude.includes(file));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
}

// 5. CARGA DE HANDLERS
client.handlers = new Map();
const handlersPath = path.join(__dirname, 'handlers');
if (fs.existsSync(handlersPath)) {
    const handlerFiles = fs.readdirSync(handlersPath).filter(file => file.endsWith('.js'));
    for (const file of handlerFiles) {
        const handlerName = path.basename(file, '.js');
        client.handlers.set(handlerName, require(path.join(handlersPath, file)));
    }
}

// 6. EVENTO CLIENT READY
client.once(Events.ClientReady, () => {
    console.log(`¡Listo! ${client.user.tag} está online.`);
    
    // Tarea de limpieza diaria
    cron.schedule('0 6 * * *', async () => {
        // ... (código de limpieza, no es necesario cambiarlo)
    }, { scheduled: true, timezone: "Europe/Madrid" });
});

// 7. EVENTO DE MENSAJES
client.on(Events.MessageCreate, async message => {
    // ... (código del chat de equipo, no es necesario cambiarlo)
});

// 8. GESTOR DE INTERACCIONES (SIMPLIFICADO)
client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (command) await command.execute(interaction);
        } else if (interaction.isButton()) {
            const buttonHandler = client.handlers.get('buttonHandler');
            if (buttonHandler) await buttonHandler(client, interaction);
        } else if (interaction.isStringSelectMenu()) {
            const selectMenuHandler = client.handlers.get('selectMenuHandler');
            if (selectMenuHandler) await selectMenuHandler(client, interaction);
        } else if (interaction.isModalSubmit()) {
            const modalHandler = client.handlers.get('modalHandler');
            if (modalHandler) await modalHandler(client, interaction);
        } else if (interaction.isAutocomplete()) {
            const autocompleteHandler = client.handlers.get('autocompleteHandler');
            if (autocompleteHandler) await autocompleteHandler(client, interaction);
        }
    } catch (error) {
        console.error("Fallo crítico durante el procesamiento de una interacción:", error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'Ha ocurrido un error al procesar esta solicitud.', flags: 64 }).catch(() => {});
        } else {
            if (error.code !== 'InteractionAlreadyReplied' && error.code !== 10062) {
                await interaction.reply({ content: 'Ha ocurrido un error al procesar esta solicitud.', flags: 64 }).catch(() => {});
            }
        }
    }
});

// =======================================================
// == DESPERTADOR INTERNO (LA SOLUCIÓN DEFINITIVA) =======
// =======================================================
const selfPingUrl = `https://bot-vpg-pro.onrender.com`; // Usamos la URL aunque dé error
setInterval(() => {
    if (selfPingUrl) {
        axios.get(selfPingUrl).catch(err => {
            // Es normal que dé error 404, lo ignoramos.
            // Solo nos interesa que la petición se haga para mantener el bot activo.
            if (err.response && err.response.status !== 404) {
                console.error("Error en el self-ping:", err.message);
            } else {
                console.log("Ping para mantener activo realizado.");
            }
        });
    }
}, 4 * 60 * 1000); // Cada 4 minutos
// =======================================================

// 9. LOGIN FINAL
client.login(process.env.DISCORD_TOKEN);
