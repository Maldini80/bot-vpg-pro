require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits, WebhookClient, StringSelectMenuBuilder } = require('discord.js');
const mongoose = require('mongoose');

const Team = require('./models/team.js');

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
        const managerChannel = await client.channels.fetch(process.env.MANAGER_CHANNEL_ID);
        if (managerChannel) {
            const embed = new EmbedBuilder().setTitle('Panel de Control de Mánager').setDescription('Usa los botones de abajo para gestionar tu equipo. Tu equipo se detectará automáticamente.').setColor('#e67e22');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('manager_invite_player').setLabel('📧 Invitar Jugador').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('manager_manage_roster').setLabel('📋 Gestionar Plantilla').setStyle(ButtonStyle.Primary)
            );
            const messages = await managerChannel.messages.fetch({ limit: 10 });
            if (messages.size > 0) await managerChannel.bulkDelete(messages);
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
        
        else if (interaction.isButton()) {
            const esAprobador = interaction.member.roles.cache.has(process.env.APPROVER_ROLE_ID) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            
            if (interaction.customId === 'request_manager_role_button') {
                const modal = new ModalBuilder().setCustomId('manager_request_modal').setTitle('Formulario de Solicitud de Mánager');
                const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsername').setLabel("Tu nombre de usuario en VPG").setStyle(TextInputStyle.Short).setRequired(true);
                const teamNameInput = new TextInputBuilder().setCustomId('teamName').setLabel("Nombre de tu equipo en VPG").setStyle(TextInputStyle.Short).setRequired(true);
                const leagueNameInput = new TextInputBuilder().setCustomId('leagueName').setLabel("Liga de VPG en la que compites").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(vpgUsernameInput), new ActionRowBuilder().addComponents(teamNameInput), new ActionRowBuilder().addComponents(leagueNameInput));
                await interaction.showModal(modal);
            }
            else if (interaction.customId.startsWith('approve_request_')) {
                if (!esAprobador) return interaction.reply({ content: 'No tienes permiso.', ephemeral: true });
                const parts = interaction.customId.split('_');
                const applicantId = parts[2];
                const teamName = parts.slice(3).join(' ');
                const modal = new ModalBuilder().setCustomId(`approve_modal_${applicantId}_${teamName}`).setTitle(`Aprobar Equipo: ${teamName}`);
                const teamLogoInput = new TextInputBuilder().setCustomId('teamLogoUrl').setLabel("URL del Escudo del Equipo").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(teamLogoInput));
                await interaction.showModal(modal);
            }
            else if (interaction.customId.startsWith('reject_request_')) {
                 if (!esAprobador) return interaction.reply({ content: 'No tienes permiso.', ephemeral: true });
                const applicantId = interaction.customId.split('_')[2];
                const applicant = await interaction.guild.members.fetch(applicantId);
                const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true), ButtonBuilder.from(interaction.message.components[0].components[1]).setDisabled(true));
                await interaction.message.edit({ components: [disabledRow] });
                await interaction.reply({ content: `La solicitud de **${applicant.user.tag}** ha sido rechazada.`, ephemeral: false });
                await applicant.send(`Tu solicitud para registrar un equipo ha sido rechazada.`).catch(() => {});
            }
            else if (interaction.customId.startsWith('accept_invite_')) {
                const teamId = interaction.customId.split('_')[2];
                const team = await Team.findById(teamId);
                if (!team) return interaction.reply({ content: 'Este equipo ya no existe.', ephemeral: true });
                const isAlreadyInTeam = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: interaction.user.id }, { captains: interaction.user.id }, { players: interaction.user.id }] });
                if (isAlreadyInTeam) {
                    await interaction.message.delete();
                    return interaction.reply({ content: `Ya perteneces al equipo **${isAlreadyInTeam.name}**.`, ephemeral: true });
                }
                team.players.push(interaction.user.id);
                await team.save();
                await interaction.member.roles.add(process.env.PLAYER_ROLE_ID);
                await interaction.member.setNickname(`${interaction.user.username} | ${team.name}`);
                await interaction.reply({ content: `¡Felicidades! Te has unido a **${team.name}**.`, ephemeral: true });
                const manager = await client.users.fetch(team.managerId);
                await manager.send(`✅ **${interaction.user.username}** ha aceptado tu invitación a **${team.name}**.`);
                await interaction.message.edit({ components: [] });
            }
            else if (interaction.customId.startsWith('reject_invite_')) {
                const teamId = interaction.customId.split('_')[2];
                const team = await Team.findById(teamId);
                await interaction.reply({ content: 'Has rechazado la invitación.', ephemeral: true });
                if (team) {
                    const manager = await client.users.fetch(team.managerId);
                    await manager.send(`❌ **${interaction.user.username}** ha rechazado tu invitación para unirse a **${team.name}**.`);
                }
                await interaction.message.edit({ components: [] });
            }
            else if (interaction.customId === 'admin_manage_team_button') {
                if (!esAprobador) return interaction.reply({ content: 'No tienes permiso.', ephemeral: true });
                const modal = new ModalBuilder().setCustomId('admin_search_team_modal').setTitle('Gestionar Equipo');
                const teamNameInput = new TextInputBuilder().setCustomId('teamName').setLabel("Nombre exacto del equipo a gestionar").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(teamNameInput));
                await interaction.showModal(modal);
            }
            else if (interaction.customId === 'manager_invite_player') {
                const team = await Team.findOne({ guildId: interaction.guildId, managerId: interaction.user.id });
                if (!team) return interaction.reply({ content: 'Solo los mánagers registrados pueden invitar.', ephemeral: true });
                const modal = new ModalBuilder().setCustomId('manager_invite_modal').setTitle(`Invitar Jugador a ${team.name}`);
                const playerIdInput = new TextInputBuilder().setCustomId('playerId').setLabel("ID del usuario de Discord a invitar").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(playerIdInput));
                await interaction.showModal(modal);
            }
            else if (interaction.customId === 'manager_manage_roster') {
                const team = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: interaction.user.id }, { captains: interaction.user.id }] });
                if (!team) return interaction.reply({ content: 'Debes ser mánager o capitán de un equipo.', ephemeral: true });
                const memberIds = [...team.captains, ...team.players];
                if (memberIds.length === 0) return interaction.reply({ content: 'Tu equipo no tiene miembros para gestionar.', ephemeral: true });
                const memberOptions = [];
                for (const memberId of memberIds) {
                    const member = await interaction.guild.members.fetch(memberId).catch(() => null);
                    if (member) {
                        memberOptions.push({ label: member.user.username, description: team.captains.includes(memberId) ? 'Capitán' : 'Jugador', value: memberId });
                    }
                }
                if (memberOptions.length === 0) return interaction.reply({ content: 'No se encontraron los miembros de tu equipo en el servidor.', ephemeral: true });
                const selectMenu = new StringSelectMenuBuilder().setCustomId('roster_management_menu').setPlaceholder('Selecciona un jugador para gestionar').addOptions(memberOptions);
                await interaction.reply({ content: 'Selecciona un miembro de tu plantilla:', components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
            }
        } 
        
        else if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'roster_management_menu') {
                const team = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: interaction.user.id }, { captains: interaction.user.id }] });
                const isManager = team.managerId === interaction.user.id;
                const targetId = interaction.values[0];
                const isTargetCaptain = team.captains.includes(targetId);
                const targetMember = await interaction.guild.members.fetch(targetId);
                const row = new ActionRowBuilder();
                if (isManager && !isTargetCaptain) row.addComponents(new ButtonBuilder().setCustomId(`promote_player_${targetId}`).setLabel('⬆️ Ascender a Capitán').setStyle(ButtonStyle.Success));
                if (isManager && isTargetCaptain) row.addComponents(new ButtonBuilder().setCustomId(`demote_captain_${targetId}`).setLabel('⬇️ Degradar a Jugador').setStyle(ButtonStyle.Secondary));
                if (isManager || !isTargetCaptain) row.addComponents(new ButtonBuilder().setCustomId(`kick_player_${targetId}`).setLabel('❌ Expulsar del Equipo').setStyle(ButtonStyle.Danger));
                await interaction.reply({ content: `Gestionando a **${targetMember.user.username}**:`, components: [row], ephemeral: true });
            }
        }

        else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'manager_request_modal') {
                const vpgUsername = interaction.fields.getTextInputValue('vpgUsername');
                const teamName = interaction.fields.getTextInputValue('teamName');
                const leagueName = interaction.fields.getTextInputValue('leagueName');
                const approvalChannel = await client.channels.fetch(process.env.APPROVAL_CHANNEL_ID);
                if (!approvalChannel) return interaction.reply({ content: 'Error: Canal de aprobaciones no encontrado.', ephemeral: true });
                const embed = new EmbedBuilder().setTitle('Nueva Solicitud de Mánager').setColor('#f1c40f').addFields({ name: 'Solicitante', value: `<@${interaction.user.id}> (${interaction.user.tag})` }, { name: 'Usuario VPG', value: vpgUsername }, { name: 'Nombre del Equipo', value: teamName }, { name: 'Liga', value: leagueName }).setTimestamp();
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`approve_request_${interaction.user.id}_${teamName}`).setLabel("✅ Aprobar").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`reject_request_${interaction.user.id}`).setLabel("❌ Rechazar").setStyle(ButtonStyle.Danger));
                await approvalChannel.send({ embeds: [embed], components: [row] });
                await interaction.reply({ content: 'Tu solicitud ha sido enviada para revisión.', ephemeral: true });
            }
            if (interaction.customId.startsWith('approve_modal_')) {
                const applicantId = interaction.customId.split('_')[2];
                const originalRequestMessage = (await interaction.channel.messages.fetch({ limit: 50 })).find(msg => msg.embeds[0]?.fields[0]?.value.includes(applicantId) && !msg.components[0]?.components[0]?.disabled);
                if (!originalRequestMessage) return interaction.reply({ content: 'No se pudo encontrar la solicitud original.', ephemeral: true });

                const teamName = originalRequestMessage.embeds[0].fields.find(f => f.name === 'Nombre del Equipo').value;
                const leagueName = originalRequestMessage.embeds[0].fields.find(f => f.name === 'Liga').value;
                const teamLogoUrl = interaction.fields.getTextInputValue('teamLogoUrl');
                const applicant = await interaction.guild.members.fetch(applicantId);

                const existingTeam = await Team.findOne({ name: teamName, guildId: interaction.guildId });
                if (existingTeam) return interaction.reply({ content: `Error: Ya existe un equipo llamado **${teamName}**.`, ephemeral: true });
                const isAlreadyManager = await Team.findOne({ managerId: applicant.id });
                if (isAlreadyManager) return interaction.reply({ content: `Error: Este usuario ya es mánager del equipo **${isAlreadyManager.name}**.`, ephemeral: true });
                
                const webhookChannel = await client.channels.fetch(webhookChannelIds[0]);
                const webhook = await webhookChannel.createWebhook({ name: teamName, avatar: teamLogoUrl, reason: `Webhook para el equipo ${teamName}` });
                
                const newTeam = new Team({ name: teamName, guildId: interaction.guildId, league: leagueName, logoUrl: teamLogoUrl, managerId: applicant.id, webhookId: webhook.id, webhookToken: webhook.token });
                await newTeam.save();
                
                await applicant.roles.add(process.env.MANAGER_ROLE_ID);
                await applicant.setNickname(`${applicant.user.username} | ${teamName}`);
                
                const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(originalRequestMessage.components[0].components[0]).setDisabled(true).setLabel('Aprobado'), ButtonBuilder.from(originalRequestMessage.components[0].components[1]).setDisabled(true));
                await originalRequestMessage.edit({ components: [disabledRow] });

                await interaction.reply({ content: `¡Equipo **${teamName}** aprobado! **${applicant.user.tag}** es ahora Mánager.`, ephemeral: false });
                await applicant.send(`¡Felicidades! Tu equipo **${teamName}** ha sido APROBADO.`).catch(() => {});
            }
            if (interaction.customId === 'admin_search_team_modal') {
                if (!esAprobador) return interaction.reply({ content: 'No tienes permiso.', ephemeral: true });
                const teamName = interaction.fields.getTextInputValue('teamName');
                const team = await Team.findOne({ guildId: interaction.guildId, name: teamName });
                if (!team) return interaction.reply({ content: `No se encontró el equipo **${teamName}**.`, ephemeral: true });

                const manager = team.managerId ? await interaction.guild.members.fetch(team.managerId).catch(() => ({ user: { tag: 'No Asignado' } })) : { user: { tag: 'No Asignado' } };
                
                const embed = new EmbedBuilder().setTitle(`Gestión del Equipo: ${team.name}`).setThumbnail(team.logoUrl).addFields({ name: 'Mánager', value: manager.user.tag });
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }
    } catch (error) {
        console.error("Fallo crítico de interacción:", error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'Ha ocurrido un error al procesar tu solicitud.', ephemeral: true });
        } else {
            await interaction.reply({ content: 'Ha ocurrido un error al procesar tu solicitud.', ephemeral: true });
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
