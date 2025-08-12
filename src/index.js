// src/index.js
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
// LÍNEA MODIFICADA: Se añaden los componentes necesarios
const { Client, Collection, GatewayIntentBits, Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
const cron = require('node-cron');
const axios = require('axios');
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

// =================================================================
// == INICIO DE BIENVENIDA POR MENSAJE DIRECTO (MD) - CÓDIGO NUEVO ==
// =================================================================
client.on(Events.GuildMemberAdd, async member => {
    if (member.user.bot) return;

    // Comprobamos si ya tiene un rol de equipo (por si salió y volvió a entrar)
    const hasTeamRole = member.roles.cache.some(role => [
        process.env.PLAYER_ROLE_ID,
        process.env.CAPTAIN_ROLE_ID,
        process.env.MANAGER_ROLE_ID
    ].includes(role.id));
    if (hasTeamRole) return;

    // Preparamos el mensaje y el botón de bienvenida.
    const welcomeEmbed = new EmbedBuilder()
        .setTitle(`¡Bienvenido a la comunidad VPG, ${member.displayName}!`)
        .setDescription('Para poder participar plenamente, primero debes completar tu perfil de jugador.\n\n**Haz clic en el botón de abajo para empezar el registro.**')
        .setColor('Green')
        .setImage('https://i.imgur.com/Ode1MEI.jpeg'); // La imagen para nuevos miembros

    const registerButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('start_player_registration')
            .setLabel('📝 Iniciar Registro de Jugador')
            .setStyle(ButtonStyle.Success)
    );

    // Intentamos enviar el MD. Si falla, lo registramos en la consola.
    try {
        await member.send({ embeds: [welcomeEmbed], components: [registerButton] });
    } catch (error) {
        console.log(`AVISO: No se pudo enviar el MD de bienvenida a ${member.user.tag}. Posiblemente los tiene desactivados.`);
    }
});
// =================================================================
// == FIN DE BIENVENIDA POR MENSAJE DIRECTO (MD) ===================
// =================================================================

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
    let handler;
    let handlerName = '';

    try {
        if (interaction.isChatInputCommand()) {
            handlerName = 'comando';
            handler = client.commands.get(interaction.commandName);
            if (handler) await handler.execute(interaction);

        } else if (interaction.isButton()) {
            handlerName = 'buttonHandler';
            handler = client.handlers.get('buttonHandler');
            if (handler) await handler(client, interaction);

        } else if (interaction.isStringSelectMenu()) {
            handlerName = 'selectMenuHandler';
            handler = client.handlers.get('selectMenuHandler');
            if (handler) await handler(client, interaction);

        } else if (interaction.isModalSubmit()) {
            handlerName = 'modalHandler';
            handler = client.handlers.get('modalHandler');
            if (handler) await handler(client, interaction);

        } else if (interaction.isAutocomplete()) {
            handlerName = 'autocompleteHandler';
            handler = client.handlers.get('autocompleteHandler');
            if (handler) await handler(client, interaction);
        }

    } catch (error) {
    // Si el error es "Unknown Interaction" (código 10062), es probable que sea por un "arranque en frío" de Render.
    // En este caso, simplemente lo registramos en la consola y no intentamos responder al usuario,
    // porque la interacción ya ha expirado y causaría otro error.
    if (error.code === 10062) {
        console.warn(`Se ignoró un error de "Interacción Desconocida" (código 10062), probablemente debido a un arranque en frío.`);
        return; // Detenemos la ejecución aquí para este caso específico.
    }

    // Para todos los demás errores, mantenemos la lógica de notificar al usuario.
    console.error(`Fallo crítico durante el procesamiento de una interacción de tipo [${handlerName}]:`, error);
    
    const errorMessage = { 
        content: 'Ha ocurrido un error al procesar esta solicitud. Por favor, inténtalo de nuevo.', 
        flags: MessageFlags.Ephemeral 
    };
    
    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    } catch (followUpError) {
        // Este catch interno previene un crash si el envío del mensaje de error también falla.
        console.error("No se pudo enviar el mensaje de error al usuario:", followUpError);
    }
}
});

// DESPERTADOR INTERNO
const selfPingUrl = `https://bot-vpg-pro.onrender.com`;
setInterval(() => {
    axios.get(selfPingUrl).catch(() => {}); // Simplemente hacemos la petición, ignoramos el error 404
}, 2 * 60 * 1000); // Cada 2 minutos

client.login(process.env.DISCORD_TOKEN);
