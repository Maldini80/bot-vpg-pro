// src/index.js
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const mongoose = require('mongoose');
const cron = require('node-cron');

const AvailabilityPanel = require('./models/availabilityPanel.js');
const TeamChatChannel = require('./models/teamChatChannel.js');
const Team = require('./models/team.js');

mongoose.connect(process.env.DATABASE_URL)
    .then(() => console.log('Conectado a MongoDB.'))
    .catch(err => console.error('Error de conexión con MongoDB:', err));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

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

client.handlers = new Map();
const handlersPath = path.join(__dirname, 'handlers');
if (fs.existsSync(handlersPath)) {
    const handlerFiles = fs.readdirSync(handlersPath).filter(file => file.endsWith('.js'));
    for (const file of handlerFiles) {
        const handlerName = path.basename(file, '.js');
        client.handlers.set(handlerName, require(path.join(handlersPath, file)));
    }
}

client.once(Events.ClientReady, () => {
    console.log(`¡Listo! ${client.user.tag} está online.`);
    cron.schedule('0 6 * * *', async () => {
        console.log('Ejecutando limpieza diaria de amistosos a las 6:00 AM (Madrid)...');
        try {
            await AvailabilityPanel.deleteMany({});
            console.log(`Base de datos de paneles de disponibilidad limpiada.`);
            const scheduledChannelId = process.env.SCHEDULED_FRIENDLY_CHANNEL_ID;
            const instantChannelId = process.env.INSTANT_FRIENDLY_CHANNEL_ID;
            const clearChannel = async (channelId, channelName) => {
                if (!channelId) return;
                try {
                    const channel = await client.channels.fetch(channelId);
                    if (!channel || !channel.isTextBased()) return;
                    let fetched;
                    do {
                        fetched = await channel.messages.fetch({ limit: 100 });
                        if (fetched.size > 0) await channel.bulkDelete(fetched, true);
                    } while (fetched.size > 0);
                    console.log(`Canal de ${channelName} limpiado con éxito.`);
                } catch (e) { console.error(`Error limpiando el canal de ${channelName} (${channelId}):`, e.message); }
            };
            await clearChannel(scheduledChannelId, "Amistosos Programados");
            await clearChannel(instantChannelId, "Amistosos Instantáneos");
            console.log('Limpieza diaria completada.');
        } catch (error) { console.error('Error fatal durante la limpieza diaria:', error); }
    }, { scheduled: true, timezone: "Europe/Madrid" });
});

// --- EVENTO DE CREACIÓN DE MENSAJE (CORREGIDO) ---
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.inGuild()) return;
    const activeChannel = await TeamChatChannel.findOne({ channelId: message.channel.id, guildId: message.guildId });
    if (!activeChannel) return;
    if (message.member.roles.cache.has(process.env.MUTED_ROLE_ID)) return;
    const team = await Team.findOne({ guildId: message.guildId, $or: [{ managerId: message.member.id }, { captains: message.member.id }, { players: message.member.id }] });
    if (!team) return;
    try {
        await message.delete();
        const webhooks = await message.channel.fetchWebhooks();
        // CORRECCIÓN: Usar un nombre único y específico para el webhook del chat para evitar conflictos.
        const webhookName = 'VPG Team Chat';
        let webhook = webhooks.find(wh => wh.name === webhookName);
        if (!webhook) {
            webhook = await message.channel.createWebhook({ name: webhookName, avatar: client.user.displayAvatarURL(), reason: 'Webhook para el chat de equipos' });
        }
        await webhook.send({
            content: message.content,
            username: message.member.displayName,
            avatarURL: team.logoUrl,
            allowedMentions: { parse: ['users', 'roles', 'everyone'] }
        });
    } catch (error) {
        if (error.code !== 10008) {
            console.error(`Error en la lógica del chat de equipo:`, error);
        }
    }
});

client.on(Events.InteractionCreate, async interaction => {
    // ==================================================================
    // == INICIO DE LA SOLUCIÓN DEFINITIVA =============================
    // ==================================================================
    // Esto reconoce el envío del formulario al instante para evitar que se cancele por tiempo.
    if (interaction.isModalSubmit() && interaction.customId === 'edit_profile_modal') {
        try {
            // Le decimos a Discord "recibido, estoy pensando...", de forma privada.
            await interaction.deferReply({ flags: 64 });
        } catch (e) {
            // Si incluso esto falla, lo registramos y nos detenemos.
            console.error("Fallo al intentar aplazar la respuesta del modal:", e);
            return;
        }
    }
    // ==================================================================
    // == FIN DE LA SOLUCIÓN DEFINITIVA ================================
    // ==================================================================

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
            // Solo intentamos responder si el error no es que ya se ha respondido.
            if (error.code !== 'InteractionAlreadyReplied' && error.code !== 10062) {
                await interaction.reply({ content: 'Ha ocurrido un error al procesar esta solicitud.', flags: 64 }).catch(() => {});
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
