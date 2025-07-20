require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const mongoose = require('mongoose');
const cron = require('node-cron');

// --- CARGA DE MODELOS (sin cambios) ---
const AvailabilityPanel = require('./models/availabilityPanel.js');
const TeamChatChannel = require('./models/teamChatChannel.js');
const Team = require('./models/team.js');

// --- CONEXIÓN A LA BASE DE DATOS ---
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

// --- CARGA DE COMANDOS ---
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
}

// --- CARGA DE HANDLERS DE INTERACCIONES ---
const handlersPath = path.join(__dirname, 'handlers');
const handlerFiles = fs.readdirSync(handlersPath).filter(file => file.endsWith('.js'));
for (const file of handlerFiles) {
    require(path.join(handlersPath, file));
}

// --- EVENTO CLIENT READY ---
client.once(Events.ClientReady, () => {
    console.log(`¡Listo! ${client.user.tag} está online.`);

    // Tarea programada de limpieza diaria
    cron.schedule('0 6 * * *', async () => {
        console.log('Ejecutando limpieza diaria de amistosos a las 6:00 AM...');
        try {
            await AvailabilityPanel.deleteMany({});
            console.log('Base de datos de paneles de disponibilidad limpiada.');

            const scheduledChannelId = process.env.SCHEDULED_FRIENDLY_CHANNEL_ID || 'ID_CANAL_PROGRAMADOS';
            const instantChannelId = process.env.INSTANT_FRIENDLY_CHANNEL_ID || 'ID_CANAL_INSTANTANEOS';

            const clearChannel = async (channelId) => {
                try {
                    const channel = await client.channels.fetch(channelId);
                    if (!channel || !channel.isTextBased()) return;
                    
                    let fetched;
                    do {
                        fetched = await channel.messages.fetch({ limit: 100 });
                        if (fetched.size > 0) {
                            await channel.bulkDelete(fetched, true);
                        }
                    } while (fetched.size > 0);
                    console.log(`Canal ${channel.name} limpiado.`);
                } catch (e) {
                    console.error(`Error limpiando el canal ${channelId}:`, e.message);
                }
            };
            
            await clearChannel(scheduledChannelId);
            await clearChannel(instantChannelId);

            console.log('Limpieza diaria completada.');
        } catch (error) {
            console.error('Error durante la limpieza diaria:', error);
        }
    }, {
        scheduled: true,
        timezone: "Europe/Madrid"
    });
});

// --- EVENTO DE CREACIÓN DE MENSAJE (PARA CHAT DE EQUIPO) ---
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
        let webhook = webhooks.find(wh => wh.owner.id === client.user.id && wh.name.startsWith('VPG Bot'));
        if (!webhook) {
            webhook = await message.channel.createWebhook({ name: `VPG Bot - Chat`, avatar: client.user.displayAvatarURL() });
        }
        await webhook.send({
            content: message.content,
            username: message.member.displayName,
            avatarURL: team.logoUrl,
            allowedMentions: { parse: ['users', 'roles', 'everyone'] }
        });
    } catch (error) {
        if (error.code !== 10008) { // Ignorar error "Unknown Message"
            console.error(`Error en chat de equipo:`, error.message);
        }
    }
});


// --- DESPACHADOR CENTRAL DE INTERACCIONES ---
client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) {
                console.error(`No se encontró el comando ${interaction.commandName}.`);
                return;
            }
            await command.execute(interaction);
        } 
        else if (interaction.isButton()) {
            // La lógica ahora está en su propio handler
            require('./handlers/buttonHandler')(client, interaction);
        } 
        else if (interaction.isStringSelectMenu()) {
            // La lógica ahora está en su propio handler
            require('./handlers/selectMenuHandler')(client, interaction);
        } 
        else if (interaction.isModalSubmit()) {
            // La lógica ahora está en su propio handler
            require('./handlers/modalHandler')(client, interaction);
        } 
        else if (interaction.isAutocomplete()) {
            // La lógica ahora está en su propio handler
            require('./handlers/autocompleteHandler')(client, interaction);
        }
    } catch (error) {
        console.error("Fallo crítico de interacción:", error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'Ha ocurrido un error al procesar tu solicitud.', ephemeral: true }).catch(() => {});
        } else {
            if (error.code !== 10062) { // 10062 = Interaction has already been acknowledged
                await interaction.reply({ content: 'Ha ocurrido un error al procesar tu solicitud.', ephemeral: true }).catch(() => {});
            }
        }
    }
});

// --- INICIO DE SESIÓN DEL BOT ---
client.login(process.env.DISCORD_TOKEN);
