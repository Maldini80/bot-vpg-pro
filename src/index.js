// src/index.js
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const mongoose = require('mongoose');
const cron = require('node-cron');

// --- CARGA DE MODELOS ---
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

// --- CARGA DE COMANDOS (Sin cambios) ---
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

// --- CARGA DE HANDLERS DE INTERACCIONES (Sin cambios) ---
client.handlers = new Map();
const handlersPath = path.join(__dirname, 'handlers');
if (fs.existsSync(handlersPath)) {
    const handlerFiles = fs.readdirSync(handlersPath).filter(file => file.endsWith('.js'));
    for (const file of handlerFiles) {
        const handlerName = path.basename(file, '.js');
        client.handlers.set(handlerName, require(path.join(handlersPath, file)));
    }
}

// --- EVENTO CLIENT READY ---
client.once(Events.ClientReady, () => {
    console.log(`¡Listo! ${client.user.tag} está online.`);

    // ======================================================================
    // AÑADIDO: TAREA PROGRAMADA DE LIMPIEZA DIARIA DE AMISTOSOS
    // ======================================================================
    cron.schedule('0 6 * * *', async () => {
        console.log('Ejecutando limpieza diaria de amistosos a las 6:00 AM (Madrid)...');
        try {
            // 1. Limpia la base de datos de paneles de disponibilidad
            await AvailabilityPanel.deleteMany({});
            console.log(`Base de datos de paneles de disponibilidad limpiada.`);
            
            // 2. Lee los IDs de los canales desde las variables de entorno
            const scheduledChannelId = process.env.SCHEDULED_FRIENDLY_CHANNEL_ID;
            const instantChannelId = process.env.INSTANT_FRIENDLY_CHANNEL_ID;

            const clearChannel = async (channelId, channelName) => {
                if (!channelId) {
                    console.log(`No se ha configurado el ID para el canal de ${channelName}, se omite la limpieza.`);
                    return;
                }
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
                    console.log(`Canal de ${channelName} limpiado con éxito.`);
                } catch (e) {
                    console.error(`Error limpiando el canal de ${channelName} (${channelId}):`, e.message);
                }
            };
            
            await clearChannel(scheduledChannelId, "Amistosos Programados");
            await clearChannel(instantChannelId, "Amistosos Instantáneos");

            console.log('Limpieza diaria completada.');
        } catch (error) {
            console.error('Error fatal durante la limpieza diaria:', error);
        }
    }, {
        scheduled: true,
        timezone: "Europe/Madrid"
    });
});

// --- EVENTO DE CREACIÓN DE MENSAJE (Sin cambios) ---
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
        if (error.code !== 10008) {
            console.error(`Error en la lógica del chat de equipo:`, error.message);
        }
    }
});

// --- DESPACHADOR CENTRAL DE INTERACCIONES (Sin cambios) ---
client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            await command.execute(interaction);
        } 
        else if (interaction.isButton()) {
            const buttonHandler = client.handlers.get('buttonHandler');
            if (buttonHandler) await buttonHandler(client, interaction);
        } 
        else if (interaction.isStringSelectMenu()) {
            const selectMenuHandler = client.handlers.get('selectMenuHandler');
            if (selectMenuHandler) await selectMenuHandler(client, interaction);
        } 
        else if (interaction.isModalSubmit()) {
            const modalHandler = client.handlers.get('modalHandler');
            if (modalHandler) await modalHandler(client, interaction);
        } 
        else if (interaction.isAutocomplete()) {
            const autocompleteHandler = client.handlers.get('autocompleteHandler');
            if (autocompleteHandler) await autocompleteHandler(client, interaction);
        }
    } catch (error) {
        console.error("Fallo crítico durante el procesamiento de una interacción:", error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'Ha ocurrido un error inesperado al procesar tu solicitud.', ephemeral: true }).catch(() => {});
        } else {
            if (error.code !== 10062) {
                await interaction.reply({ content: 'Ha ocurrido un error inesperado al procesar tu solicitud.', ephemeral: true }).catch(() => {});
            }
        }
    }
});

// --- INICIO DE SESIÓN DEL BOT ---
client.login(process.env.DISCORD_TOKEN);```

#### Archivo 2: `src/models/availabilityPanel.js` (Actualizado)

He modificado el modelo de la base de datos para que un mismo horario pueda recibir múltiples desafíos pendientes a la vez.

**Acción:** Reemplaza el contenido de tu archivo `src/models/availabilityPanel.js` con este.

```javascript
// src/models/availabilityPanel.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// AÑADIDO: Schema para guardar las peticiones pendientes por separado
const pendingChallengeSchema = new Schema({
    _id: { type: Schema.Types.ObjectId, required: true, default: () => new mongoose.Types.ObjectId() },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    userId: { type: String, required: true }
});

const timeSlotSchema = new Schema({
    time: { type: String, required: true },
    status: { type: String, required: true, default: 'AVAILABLE', enum: ['AVAILABLE', 'CONFIRMED'] }, // MODIFICADO: 'PENDING' ya no es un estado del slot
    challengerTeamId: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
    // MODIFICADO: Array para múltiples desafíos pendientes
    pendingChallenges: [pendingChallengeSchema]
});

const availabilityPanelSchema = new Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true, unique: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    postedById: { type: String, required: true },
    panelType: { type: String, required: true, enum: ['SCHEDULED', 'INSTANT'] },
    leagues: [{ type: String }], // AÑADIDO: Para guardar las ligas filtradas
    timeSlots: [timeSlotSchema]
}, { timestamps: true });

// MODIFICADO: Se elimina 'unique: true' del campo teamId para permitir varios paneles, pero se añade un índice compuesto.
availabilityPanelSchema.index({ teamId: 1, panelType: 1 }, { unique: true });

module.exports = mongoose.model('AvailabilityPanel', availabilityPanelSchema);
