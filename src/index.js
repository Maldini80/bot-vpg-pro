const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits, WebhookClient, StringSelectMenuBuilder } = require('discord.js');
const mongoose = require('mongoose');
require('dotenv').config();

const Team = require('./models/team.js');
const { ROL_APROBADOR_ID, CANAL_APROBACIONES_ID, MANAGER_CHANNEL_ID } = require('./utils/config.js');

mongoose.connect(process.env.DATABASE_URL).then(() => console.log('Conectado a MongoDB.')).catch(err => console.error('Error MongoDB:', err));

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) { client.commands.set(command.data.name, command); }
}

client.once(Events.ClientReady, async () => {
    console.log(`¡Listo! ${client.user.tag} está online.`);
    try {
        const managerChannel = await client.channels.fetch(MANAGER_CHANNEL_ID);
        if (managerChannel) {
            const embed = new EmbedBuilder().setTitle('Panel de Control de Mánager').setDescription('Usa los botones de abajo para gestionar tu equipo. Tu equipo se detectará automáticamente.').setColor('#e67e22');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('manager_invite_player').setLabel('📧 Invitar Jugador').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('manager_manage_roster').setLabel('📋 Gestionar Plantilla').setStyle(ButtonStyle.Primary)
            );
            const messages = await managerChannel.messages.fetch({ limit: 10 });
            await managerChannel.bulkDelete(messages);
            await managerChannel.send({ embeds: [embed], components: [row] });
        }
    } catch (error) { console.error("Error al crear el panel de mánager:", error.message); }
});

const webhookChannelIds = process.env.WEBHOOK_CHANNEL_IDS ? process.env.WEBHOOK_CHANNEL_IDS.split(',') : [];
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !webhookChannelIds.includes(message.channelId) || message.content.startsWith('/')) return;
    const member = message.member;
    const isManager = member.roles.cache.has(process.env.MANAGER_ROLE_ID);
    const isCaptain = member.roles.cache.has(process.env.CAPTAIN_ROLE_ID);

    if (isManager || isCaptain) {
        const team = await Team.findOne({ guildId: message.guildId, $or: [{ managerId: member.id }, { captains: member.id }] });
        if (team && team.webhookId && team.webhookToken) {
            try {
                const webhook = new WebhookClient({ id: team.webhookId, token: team.webhookToken });
                await message.delete();
                await webhook.send({
                    content: message.content,
                    username: member.displayName.split(' | ')[0],
                    avatarURL: team.logoUrl,
                    allowedMentions: { parse: ['users', 'roles', 'everyone'] }
                });
            } catch (error) {
                console.error(`Error de Webhook para el equipo ${team.name}:`, error.message);
            }
        }
    }
});

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (command) await command.execute(interaction);
        } 
        // Lógica de botones y modales irá aquí
    } catch (error) {
        console.error("Fallo crítico de interacción:", error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'Ha ocurrido un error al procesar tu solicitud.', ephemeral: true });
        } else {
            await interaction.followUp({ content: 'Ha ocurrido un error al procesar tu solicitud.', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
