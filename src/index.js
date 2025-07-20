require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits, WebhookClient, StringSelectMenuBuilder } = require('discord.js');
const mongoose = require('mongoose');
const cron = require('node-cron');

// --- CARGA DE MODELOS ---
const Team = require('./models/team.js');
const League = require('./models/league.js');
const VPGUser = require('./models/user.js');
const TeamChatChannel = require('./models/teamChatChannel.js');
const AvailabilityPanel = require('./models/availabilityPanel.js');
const PlayerApplication = require('./models/playerApplication.js');

mongoose.connect(process.env.DATABASE_URL).then(() => console.log('Conectado a MongoDB.')).catch(err => console.error('Error MongoDB:', err));

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- CARGA DE COMANDOS ---
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) { client.commands.set(command.data.name, command); }
}

client.once(Events.ClientReady, () => {
    console.log(`¡Listo! ${client.user.tag} está online.`);

    // --- LIMPIEZA DIARIA AUTOMÁTICA ---
    cron.schedule('0 6 * * *', async () => {
        console.log('Ejecutando limpieza diaria de amistosos a las 6:00 AM...');
        try {
            await AvailabilityPanel.deleteMany({});
            console.log('Base de datos de paneles de disponibilidad limpiada.');

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
            
            await clearChannel('1396284750850949142'); // Programados
            await clearChannel('1396367574882717869'); // Instantáneos

            console.log('Limpieza diaria completada.');
        } catch (error) {
            console.error('Error durante la limpieza diaria:', error);
        }
    }, {
        scheduled: true,
        timezone: "Europe/Madrid"
    });
});

// --- LÓGICA DE CHAT AUTOMÁTICO ---
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
        if (!webhook) { webhook = await message.channel.createWebhook({ name: `VPG Bot - Chat`, avatar: client.user.displayAvatarURL() }); }
        await webhook.send({ content: message.content, username: message.member.displayName, avatarURL: team.logoUrl, allowedMentions: { parse: ['users', 'roles', 'everyone'] } });
    } catch (error) {
        if (error.code !== 10008) console.error(`Error en chat de equipo:`, error.message);
    }
});

// =========================================================================================
// === GESTIÓN DE INTERACCIONES (CON TODAS LAS FUNCIONALIDADES) ===
// =========================================================================================
client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isAutocomplete()) {
            const commandName = interaction.commandName;
            const focusedOption = interaction.options.getFocused(true);
            if (commandName === 'admin-gestionar-equipo' && focusedOption.name === 'equipo') {
                const teams = await Team.find({ guildId: interaction.guildId, name: { $regex: focusedOption.value, $options: 'i' } }).limit(25);
                await interaction.respond(teams.map(team => ({ name: `${team.name} (${team.abbreviation})`, value: team._id.toString() })));
            }
            return;
        }

        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            if (interaction.commandName === 'admin-gestionar-equipo') {
                await interaction.deferReply({ ephemeral: true });
                const teamId = interaction.options.getString('equipo');
                const team = await Team.findById(teamId);
                if (!team) return interaction.editReply({ content: 'No se ha encontrado un equipo con ese ID.' });
                const embed = new EmbedBuilder().setTitle(`Panel de Gestión: ${team.name}`).setDescription('Selecciona una acción para administrar este equipo.').setThumbnail(team.logoUrl).setColor('#e74c3c');
                const row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`admin_change_name_${teamId}`).setLabel('Cambiar Nombre').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`admin_change_logo_${teamId}`).setLabel('Cambiar Logo').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`admin_change_abbr_${teamId}`).setLabel('Cambiar Abreviatura').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`admin_expel_manager_${teamId}`).setLabel('Destituir Mánager').setStyle(ButtonStyle.Danger).setDisabled(!team.managerId)
                );
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`admin_assign_manager_${teamId}`).setLabel('Asignar Mánager').setStyle(ButtonStyle.Success).setDisabled(!!team.managerId),
                    new ButtonBuilder().setCustomId(`admin_manage_members_${teamId}`).setLabel('Gestionar Miembros').setStyle(ButtonStyle.Secondary)
                );
                await interaction.editReply({ embeds: [embed], components: [row1, row2] });
            } else {
                 await command.execute(interaction);
            }
            return;
        }
        
        if (interaction.isButton()) {
            const customId = interaction.customId;

            // --- AMISTOSOS: ACEPTAR/RECHAZAR EN MD ---
            if (customId.startsWith('accept_challenge_') || customId.startsWith('reject_challenge_')) {
                const parts = customId.split('_');
                const panelId = parts[2];
                const timeSlot = parts[3];
                const challengerUserId = parts[4];
                const challengerTeamId = parts[5];

                await interaction.deferUpdate();
                const panel = await AvailabilityPanel.findById(panelId).populate('teamId');
                if (!panel) return interaction.editReply({ content: 'Este panel de amistosos ya no existe.', components: [], embeds: [] });
                const slot = panel.timeSlots.find(s => s.time === timeSlot);
                if (!slot || slot.status === 'CONFIRMED') return interaction.editReply({ content: 'Este horario ya ha sido confirmado con otro equipo.', components: [], embeds: [] });

                if (customId.startsWith('accept_challenge_')) {
                    slot.status = 'CONFIRMED';
                    slot.challengerUserId = challengerUserId;
                    slot.challengerTeamId = challengerTeamId;
                    await panel.save();
                    const challengerUser = await client.users.fetch(challengerUserId);
                    const challengerTeam = await Team.findById(challengerTeamId);
                    await challengerUser.send(`✅ ¡Tu desafío ha sido **ACEPTADO**! Jugarás contra **${panel.teamId.name}** a las **${timeSlot}**.\n\nPonte en contacto con <@${panel.postedById}> para los detalles.`);
                    const originalChannel = await client.channels.fetch(panel.channelId).catch(() => null);
                    if (originalChannel) {
                        const originalMessage = await originalChannel.messages.fetch(panel.messageId).catch(() => null);
                        if (originalMessage) {
                            const updatedPanel = await buildScheduledPanel(panel.teamId, panel.postedById, panel.timeSlots, panel._id);
                            await originalMessage.edit({ embeds: [updatedPanel.embed], components: updatedPanel.components });
                        }
                    }
                    await interaction.editReply({ content: `Has aceptado el desafío de **${challengerTeam.name}** para las **${timeSlot}**.`, components: [], embeds: [] });
                } else { // Rechazar
                    const challengerUser = await client.users.fetch(challengerUserId);
                    await challengerUser.send(`❌ Tu desafío contra **${panel.teamId.name}** para las **${timeSlot}** ha sido rechazado.`);
                    await interaction.editReply({ content: 'Has rechazado el desafío.', components: [], embeds: [] });
                }
                return;
            }

            if (!interaction.inGuild()) return;
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            const esAprobador = isAdmin || interaction.member.roles.cache.has(process.env.APPROVER_ROLE_ID);

            // --- AMISTOSOS: GESTIÓN DE PANELES Y DESAFÍOS ---
            if (customId === 'post_scheduled_panel' || customId === 'post_instant_panel' || customId === 'delete_my_panel') {
                await interaction.deferReply({ ephemeral: true });
                const team = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: interaction.user.id }, { captains: interaction.user.id }] });
                if (!team) return interaction.editReply({ content: 'Solo Mánagers y Capitanes pueden gestionar paneles de amistosos.' });
                let existingPanel;
                if (customId === 'post_scheduled_panel' || (customId === 'delete_my_panel' && interaction.channelId === '1396284750850949142')) {
                    existingPanel = await AvailabilityPanel.findOne({ teamId: team._id, panelType: 'SCHEDULED' });
                } else {
                    existingPanel = await AvailabilityPanel.findOne({ teamId: team._id, panelType: 'INSTANT' });
                }
                if(customId === 'delete_my_panel') {
                    if (!existingPanel) return interaction.editReply({ content: 'Tu equipo no tiene un panel de amistosos de este tipo activo para borrar.' });
                    const channel = await client.channels.fetch(existingPanel.channelId).catch(()=>null);
                    if(channel) {
                        const message = await channel.messages.fetch(existingPanel.messageId).catch(()=>null);
                        if(message) await message.delete();
                    }
                    await AvailabilityPanel.deleteOne({ _id: existingPanel._id });
                    return interaction.editReply({ content: '✅ Tu panel de amistosos ha sido eliminado.' });
                }
                if (existingPanel) return interaction.editReply({ content: `Tu equipo ya tiene un panel de amistosos de este tipo activo. Bórralo primero para crear uno nuevo.` });
                if (customId === 'post_scheduled_panel') {
                    const timeSlots = ['22:00', '22:20', '22:40', '23:00', '23:20', '23:40'];
                    const timeOptions = timeSlots.map(time => ({ label: time, value: time }));
                    const selectMenu = new StringSelectMenuBuilder().setCustomId('select_available_times').setPlaceholder('Selecciona tus horarios disponibles').addOptions(timeOptions).setMinValues(1).setMaxValues(timeSlots.length);
                    await interaction.editReply({ content: 'Elige los horarios en los que tu equipo está disponible para jugar:', components: [new ActionRowBuilder().addComponents(selectMenu)] });
                } else { // post_instant_panel
                    const channelId = '1396367574882717869';
                    const channel = await client.channels.fetch(channelId).catch(() => null);
                    if (!channel) return interaction.editReply({ content: 'Error: No se encontró el canal de amistosos instantáneos.' });
                    const webhook = await getOrCreateWebhook(channel, client);
                    const embed = new EmbedBuilder().setColor('Green').setDescription(`**Buscando rival para jugar AHORA**\n\n> Pulsa el botón de abajo si quieres desafiarnos.\n\n*Contacto:* <@${interaction.user.id}> ([Enviar MD](https://discord.com/users/${interaction.user.id}))`);
                    const message = await webhook.send({ username: team.name, avatarURL: team.logoUrl, embeds: [embed] });
                    const panel = new AvailabilityPanel({
                        guildId: interaction.guildId, channelId, messageId: message.id, teamId: team._id, postedById: interaction.user.id, panelType: 'INSTANT',
                        timeSlots: [{ time: 'INSTANT', status: 'AVAILABLE' }]
                    });
                    await panel.save();
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`challenge_slot_${panel._id}_INSTANT`).setLabel('⚔️ Desafiar Ahora').setStyle(ButtonStyle.Success));
                    await client.channels.cache.get(channelId).messages.edit(message.id, { components: [row] });
                    await interaction.editReply({ content: '✅ Tu panel de amistoso instantáneo ha sido publicado.' });
                }
                return;
            }
            if (customId.startsWith('challenge_slot_')) {
                await interaction.deferReply({ ephemeral: true });
                const parts = customId.split('_');
                const panelId = parts[2];
                const timeSlot = parts[3];
                const challengerTeam = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: interaction.user.id }, { captains: interaction.user.id }] });
                if (!challengerTeam) return interaction.editReply({ content: 'Solo Mánagers o Capitanes pueden desafiar.' });
                const panel = await AvailabilityPanel.findById(panelId).populate('teamId');
                if (!panel) return interaction.editReply({ content: 'Esta oferta de amistoso ya no existe.' });
                if (panel.teamId._id.equals(challengerTeam._id)) return interaction.editReply({ content: 'No puedes desafiar a tu propio equipo.' });
                const slot = panel.timeSlots.find(s => s.time === timeSlot);
                if (!slot || slot.status !== 'AVAILABLE') return interaction.editReply({ content: 'Este horario ya no está disponible.' });
                const originalPoster = await client.users.fetch(panel.postedById);
                const approvalEmbed = new EmbedBuilder().setTitle('⚔️ ¡Has recibido un desafío!').setDescription(`El equipo **${challengerTeam.name}** quiere jugar contra vosotros.\n**Horario:** ${timeSlot === 'INSTANT' ? 'Ahora Mismo' : `a las ${timeSlot}`}`).setColor('Yellow');
                const approvalRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`accept_challenge_${panel._id}_${timeSlot}_${interaction.user.id}_${challengerTeam._id}`).setLabel('✅ Aceptar').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`reject_challenge_${panel._id}_${timeSlot}_${interaction.user.id}_${challengerTeam._id}`).setLabel('❌ Rechazar').setStyle(ButtonStyle.Danger)
                );
                await originalPoster.send({ embeds: [approvalEmbed], components: [approvalRow] });
                await interaction.editReply({ content: `✅ Tu desafío para el horario de las **${timeSlot}** ha sido enviado.` });
                return;
            }
            
            if (customId.startsWith('admin_')) {
                if (!isAdmin) return interaction.reply({ content: 'Solo los administradores pueden usar estos botones.', ephemeral: true });
                const parts = customId.split('_');
                const action = parts[1];
                const teamId = customId.substring(customId.lastIndexOf('_') + 1);

                switch (action) {
                    case 'change': {
                        const subAction = parts[2];
                        const modal = new ModalBuilder().setCustomId(`admin_edit_${subAction}_${teamId}`).setTitle(`Cambiar ${subAction === 'name' ? 'Nombre' : subAction === 'logo' ? 'Logo' : 'Abreviatura'} del Equipo`);
                        const input = new TextInputBuilder().setCustomId('newValue').setLabel(`Nuevo ${subAction === 'name' ? 'nombre' : subAction === 'logo' ? 'URL del logo' : 'abreviatura'}`).setStyle(TextInputStyle.Short).setRequired(true);
                        if (subAction === 'abbr') { input.setMinLength(3).setMaxLength(3); }
                        modal.addComponents(new ActionRowBuilder().addComponents(input));
                        await interaction.showModal(modal);
                        break;
                    }
                    case 'expel': {
                        await interaction.deferReply({ ephemeral: true });
                        const team = await Team.findById(teamId);
                        if (!team || !team.managerId) return interaction.editReply({ content: 'El equipo no tiene un mánager para destituir.' });
                        const managerId = team.managerId;
                        team.managerId = null;
                        await team.save();
                        const managerMember = await interaction.guild.members.fetch(managerId).catch(() => null);
                        if (managerMember) {
                            await managerMember.roles.remove(process.env.MANAGER_ROLE_ID);
                            if (managerMember.id !== interaction.guild.ownerId) await managerMember.setNickname(managerMember.user.username).catch(()=>{});
                            await managerMember.send(`Has sido destituido como Mánager del equipo **${team.name}** por un administrador.`).catch(()=>{});
                        }
                        await interaction.editReply({ content: `✅ Mánager destituido. El equipo **${team.name}** ahora no tiene mánager.` });
                        break;
                    }
                    case 'assign': {
                        const modal = new ModalBuilder().setCustomId(`admin_assign_manager_modal_${teamId}`).setTitle('Asignar Nuevo Mánager');
                        const userIdInput = new TextInputBuilder().setCustomId('userId').setLabel('ID o Nombre del nuevo Mánager').setStyle(TextInputStyle.Short).setRequired(true);
                        modal.addComponents(new ActionRowBuilder().addComponents(userIdInput));
                        await interaction.showModal(modal);
                        break;
                    }
                    case 'manage': {
                        await interaction.deferReply({ ephemeral: true });
                        const team = await Team.findById(teamId);
                        if (!team) return interaction.editReply({ content: 'Equipo no encontrado.' });
                        const memberIds = [team.managerId, ...team.captains, ...team.players].filter(id => id);
                        if (memberIds.length === 0) return interaction.editReply({ content: 'Este equipo no tiene miembros para gestionar.' });
                        const memberOptions = [];
                        for (const memberId of memberIds) {
                            const member = await interaction.guild.members.fetch(memberId).catch(() => null);
                            if (member) {
                                let description = 'Jugador';
                                if (team.managerId === memberId) description = 'Mánager';
                                else if (team.captains.includes(memberId)) description = 'Capitán';
                                memberOptions.push({ label: member.user.username, description, value: memberId });
                            }
                        }
                        if (memberOptions.length === 0) return interaction.editReply({ content: 'No se encontraron miembros en el servidor.' });
                        const selectMenu = new StringSelectMenuBuilder().setCustomId(`admin_roster_menu_${teamId}`).setPlaceholder('Selecciona un miembro').addOptions(memberOptions);
                        await interaction.editReply({ content: `Gestionando miembros de **${team.name}**:`, components: [new ActionRowBuilder().addComponents(selectMenu)] });
                        break;
                    }
                    case 'promote':
                    case 'demote':
                    case 'make':
                    case 'kick': {
                        await interaction.deferUpdate();
                        const targetId = parts[parts.length - 1];
                        const team = await Team.findById(teamId);
                        if(!team) return interaction.editReply({content: 'Equipo no encontrado.', components: []});
                        const targetMember = await interaction.guild.members.fetch(targetId);
                        if (action === 'kick') {
                            team.players = team.players.filter(p => p !== targetId);
                            team.captains = team.captains.filter(c => c !== targetId);
                            if(team.managerId === targetId) team.managerId = null;
                            await targetMember.roles.remove([process.env.PLAYER_ROLE_ID, process.env.CAPTAIN_ROLE_ID, process.env.MANAGER_ROLE_ID, process.env.MUTED_ROLE_ID]).catch(()=>{});
                            if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(targetMember.user.username).catch(()=>{});
                            await interaction.editReply({ content: `✅ **${targetMember.user.username}** expulsado.`, components: [] });
                        } else if (action === 'promote') {
                            team.players = team.players.filter(p => p !== targetId);
                            team.captains.push(targetId);
                            await targetMember.roles.remove(process.env.PLAYER_ROLE_ID).catch(()=>{});
                            await targetMember.roles.add(process.env.CAPTAIN_ROLE_ID);
                            if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(`|C| ${team.abbreviation} ${targetMember.user.username}`).catch(()=>{});
                            await interaction.editReply({ content: `✅ **${targetMember.user.username}** ascendido a Capitán.`, components: [] });
                        } else if (action === 'demote') {
                            team.captains = team.captains.filter(c => c !== targetId);
                            team.players.push(targetId);
                            await targetMember.roles.remove(process.env.CAPTAIN_ROLE_ID).catch(()=>{});
                            await targetMember.roles.add(process.env.PLAYER_ROLE_ID);
                            if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(`${team.abbreviation} ${targetMember.user.username}`).catch(()=>{});
                            await interaction.editReply({ content: `✅ **${targetMember.user.username}** degradado a Jugador.`, components: [] });
                        } else if (action === 'make') {
                            if(team.managerId) {
                                const oldManager = await interaction.guild.members.fetch(team.managerId).catch(()=>{});
                                if(oldManager) await oldManager.roles.remove(process.env.MANAGER_ROLE_ID).catch(()=>{});
                            }
                            team.managerId = targetId;
                            team.players = team.players.filter(p => p !== targetId);
                            team.captains = team.captains.filter(c => c !== targetId);
                            await targetMember.roles.remove([process.env.PLAYER_ROLE_ID, process.env.CAPTAIN_ROLE_ID, process.env.MUTED_ROLE_ID]);
                            await targetMember.roles.add(process.env.MANAGER_ROLE_ID);
                            if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(`|MG| ${team.abbreviation} ${targetMember.user.username}`).catch(()=>{});
                            await interaction.editReply({ content: `👑 **${targetMember.user.username}** es ahora el nuevo Mánager.`, components: [] });
                        }
                        await team.save();
                        break;
                    }
                }
                return;
            }
            if (customId.startsWith('toggle_mute_player_')) {
                await interaction.deferUpdate();
                const targetId = customId.substring(customId.lastIndexOf('_') + 1);
                const team = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: interaction.user.id }, { captains: interaction.user.id }] });
                if (!team) return interaction.editReply({ content: 'No tienes permiso para esta acción.', components: [] });
                const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
                if (!targetMember) return interaction.editReply({ content: 'No se encontró al miembro.', components: [] });
                if (team.captains.includes(targetId)) return interaction.editReply({ content: 'No puedes mutear a un capitán.', components: [] });
                const hasMutedRole = targetMember.roles.cache.has(process.env.MUTED_ROLE_ID);
                if (hasMutedRole) {
                    await targetMember.roles.remove(process.env.MUTED_ROLE_ID);
                    await interaction.editReply({ content: `✅ **${targetMember.user.username}** ha sido desmuteado.`, components: [] });
                } else {
                    await targetMember.roles.add(process.env.MUTED_ROLE_ID);
                    await interaction.editReply({ content: `🔇 **${targetMember.user.username}** ha sido muteado.`, components: [] });
                }
                return;
            }
            
            if (customId === 'admin_create_league_button') {
                if (!isAdmin) return interaction.reply({ content: 'Solo los administradores pueden usar este botón.', ephemeral: true });
                const modal = new ModalBuilder().setCustomId('create_league_modal').setTitle('Crear Nueva Liga');
                const leagueNameInput = new TextInputBuilder().setCustomId('leagueNameInput').setLabel("Nombre de la nueva liga").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(leagueNameInput));
                await interaction.showModal(modal);
            }
            else if (customId === 'admin_delete_league_button') {
                await interaction.deferReply({ ephemeral: true });
                if (!isAdmin) return interaction.editReply({ content: 'Solo los administradores pueden usar este botón.' });
                const leagues = await League.find({ guildId: interaction.guildId });
                if (leagues.length === 0) return interaction.editReply({ content: 'No hay ligas para borrar.' });
                const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));
                const selectMenu = new StringSelectMenuBuilder().setCustomId('delete_league_select_menu').setPlaceholder('Selecciona las ligas a eliminar').addOptions(leagueOptions).setMinValues(1).setMaxValues(leagueOptions.length);
                const row = new ActionRowBuilder().addComponents(selectMenu);
                await interaction.editReply({ content: 'Selecciona del menú las ligas que quieres borrar permanentemente:', components: [row] });
            }
            else if (customId === 'view_teams_button') {
                await interaction.deferReply({ ephemeral: true });
                const teams = await Team.find({ guildId: interaction.guildId }).limit(25);
                if (teams.length === 0) return interaction.editReply({ content: 'No hay equipos registrados en este servidor.' });
                const teamOptions = teams.map(t => ({ label: t.name, description: `Liga: ${t.league}`, value: t._id.toString() }));
                const selectMenu = new StringSelectMenuBuilder().setCustomId('view_team_roster_select').setPlaceholder('Selecciona un equipo para ver su plantilla').addOptions(teamOptions);
                await interaction.editReply({ content: 'Elige un equipo del menú desplegable:', components: [new ActionRowBuilder().addComponents(selectMenu)] });
            }
            else if (customId === 'request_manager_role_button') {
                await interaction.deferReply({ ephemeral: true });
                const existingTeam = await Team.findOne({ managerId: interaction.user.id, guildId: interaction.guildId });
                if (existingTeam) return interaction.editReply({ content: `Ya eres el Mánager del equipo **${existingTeam.name}**.` });
                const leagues = await League.find({ guildId: interaction.guildId });
                if (leagues.length === 0) return interaction.editReply({ content: 'No hay ligas registradas. Contacta a un administrador.' });
                const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));
                const modal = new ModalBuilder().setCustomId('manager_request_modal').setTitle('Formulario de Solicitud de Mánager');
                const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsername').setLabel("Tu nombre de usuario en VPG").setStyle(TextInputStyle.Short).setRequired(true);
                const teamNameInput = new TextInputBuilder().setCustomId('teamName').setLabel("Nombre de tu equipo en VPG").setStyle(TextInputStyle.Short).setRequired(true);
                const teamAbbrInput = new TextInputBuilder().setCustomId('teamAbbr').setLabel("Abreviatura del equipo (3 letras)").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3).setMaxLength(3);
                const leagueSelect = new StringSelectMenuBuilder().setCustomId('leagueSelect').setPlaceholder('Selecciona la liga').addOptions(leagueOptions);
                modal.addComponents(new ActionRowBuilder().addComponents(vpgUsernameInput), new ActionRowBuilder().addComponents(teamNameInput), new ActionRowBuilder().addComponents(teamAbbrInput), new ActionRowBuilder().addComponents(leagueSelect));
                await interaction.showModal(modal);
            }
            else if (customId === 'leave_team_button') {
                await interaction.deferReply({ ephemeral: true });
                const team = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: interaction.user.id }, { captains: interaction.user.id }, { players: interaction.user.id }] });
                if (!team) return interaction.editReply({ content: 'No perteneces a ningún equipo.' });
                if (team.managerId === interaction.user.id) return interaction.editReply({ content: 'Los Mánagers no pueden abandonar su equipo.' });
                team.players = team.players.filter(p => p !== interaction.user.id);
                team.captains = team.captains.filter(c => c !== interaction.user.id);
                await team.save();
                await interaction.member.roles.remove([process.env.PLAYER_ROLE_ID, process.env.CAPTAIN_ROLE_ID, process.env.MUTED_ROLE_ID]).catch(() => {});
                if (interaction.member.id !== interaction.guild.ownerId) await interaction.member.setNickname(interaction.member.user.username).catch(()=>{});
                await interaction.editReply({ content: `Has abandonado el equipo **${team.name}**.` });
                const manager = await client.users.fetch(team.managerId).catch(() => null);
                if (manager) await manager.send(`El jugador **${interaction.user.tag}** ha abandonado tu equipo.`);
            }
            else if (customId.startsWith('accept_invite_')) {
                await interaction.deferUpdate();
                const teamId = customId.split('_')[2];
                const team = await Team.findById(teamId);
                if (!team) return interaction.followUp({ content: 'Este equipo ya no existe.', ephemeral: true });
                const existingTeamMembership = await Team.findOne({ guildId: interaction.guildId, $or: [{ players: interaction.user.id }, { captains: interaction.user.id }] });
                if (existingTeamMembership) {
                    existingTeamMembership.players = existingTeamMembership.players.filter(p => p !== interaction.user.id);
                    existingTeamMembership.captains = existingTeamMembership.captains.filter(c => c !== interaction.user.id);
                    await existingTeamMembership.save();
                }
                const modal = new ModalBuilder().setCustomId(`player_join_modal_${teamId}`).setTitle(`Únete a ${team.name}`);
                const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsername').setLabel("Tu nombre de usuario en VPG").setStyle(TextInputStyle.Short).setRequired(true);
                const positionSelect = new StringSelectMenuBuilder().setCustomId('positionSelect').setPlaceholder('Selecciona tu posición principal').addOptions([ { label: 'Portero (GK)', value: 'GK' }, { label: 'Defensa Central (DFC/CB)', value: 'DFC' }, { label: 'Carrilero (CARR/RB/LB)', value: 'CARR' }, { label: 'Medio Defensivo (MCD/CDM)', value: 'MCD' }, { label: 'Mediocentro (MC/CM)', value: 'MC' }, { label: 'Medio Ofensivo (MCO/CAM)', value: 'MCO' }, { label: 'Delantero Centro (DC/ST)', value: 'DC' } ]);
                modal.addComponents( new ActionRowBuilder().addComponents(vpgUsernameInput), new ActionRowBuilder().addComponents(positionSelect) );
                await interaction.showModal(modal);
            }
            else if (customId.startsWith('approve_request_')) {
                if (!esAprobador) return interaction.reply({ content: 'No tienes permiso.', ephemeral: true });
                const parts = customId.split('_');
                const applicantId = parts[2];
                const teamName = parts.slice(3).join(' ');
                const modal = new ModalBuilder().setCustomId(`approve_modal_${applicantId}_${teamName}`).setTitle(`Aprobar Equipo: ${teamName}`);
                const teamLogoInput = new TextInputBuilder().setCustomId('teamLogoUrl').setLabel("URL del Escudo del Equipo").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(teamLogoInput));
                await interaction.showModal(modal);
            }
            else if (customId.startsWith('reject_request_')) {
                if (!esAprobador) return interaction.reply({ content: 'No tienes permiso.', ephemeral: true });
                await interaction.deferUpdate();
                const applicantId = customId.split('_')[2];
                const applicant = await interaction.guild.members.fetch(applicantId);
                const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true), ButtonBuilder.from(interaction.message.components[0].components[1]).setDisabled(true));
                await interaction.message.edit({ components: [disabledRow] });
                await interaction.followUp({ content: `La solicitud de **${applicant.user.tag}** ha sido rechazada.`, ephemeral: false });
                await applicant.send(`Tu solicitud para registrar un equipo ha sido rechazada.`).catch(() => {});
            }
            else if (customId.startsWith('reject_invite_')) {
                const teamId = customId.split('_')[2];
                const team = await Team.findById(teamId);
                await interaction.reply({ content: 'Has rechazado la invitación.', ephemeral: true });
                if (team) {
                    const manager = await client.users.fetch(team.managerId);
                    await manager.send(`❌ **${interaction.user.username}** ha rechazado tu invitación para unirse a **${team.name}**.`);
                }
                await interaction.message.edit({ components: [] });
            }
            else if (customId === 'team_invite_player_button') {
                const isManager = await Team.findOne({ guildId: interaction.guildId, managerId: interaction.user.id });
                if (!isManager) return interaction.reply({ content: 'Solo los mánagers de equipo pueden invitar a jugadores.', ephemeral: true });
                const modal = new ModalBuilder().setCustomId('invite_player_modal').setTitle('Invitar Jugador por Nombre');
                const playerNameInput = new TextInputBuilder().setCustomId('playerName').setLabel("Nombre de usuario (o parte) del jugador").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(playerNameInput));
                await interaction.showModal(modal);
            }
            else if (customId === 'team_manage_roster_button') {
                await interaction.deferReply({ ephemeral: true });
                const team = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: interaction.user.id }, { captains: interaction.user.id }] });
                if (!team) return interaction.editReply({ content: 'Debes ser mánager o capitán de un equipo.' });
                const memberIds = [...team.captains, ...team.players];
                if (memberIds.length === 0) return interaction.editReply({ content: 'Tu equipo no tiene miembros para gestionar.' });
                const memberOptions = [];
                for (const memberId of memberIds) {
                    const member = await interaction.guild.members.fetch(memberId).catch(() => null);
                    if (member) memberOptions.push({ label: member.user.username, description: team.captains.includes(memberId) ? 'Capitán' : 'Jugador', value: memberId });
                }
                if (memberOptions.length === 0) return interaction.editReply({ content: 'No se encontraron miembros en el servidor.' });
                const selectMenu = new StringSelectMenuBuilder().setCustomId('roster_management_menu').setPlaceholder('Selecciona un jugador para gestionar').addOptions(memberOptions);
                await interaction.editReply({ content: 'Selecciona un miembro de tu plantilla:', components: [new ActionRowBuilder().addComponents(selectMenu)] });
            }
            else if (customId === 'team_view_roster_button') {
                await interaction.deferReply({ ephemeral: true });
                const team = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: interaction.user.id }, { captains: interaction.user.id }] });
                if (!team) return interaction.editReply({ content: 'Debes pertenecer a un equipo para ver su plantilla.' });
                const allMemberIds = [team.managerId, ...team.captains, ...team.players].filter(id => id);
                if (allMemberIds.length === 0) return interaction.editReply({ content: 'Tu equipo no tiene miembros.' });
                const memberProfiles = await VPGUser.find({ discordId: { $in: allMemberIds } });
                const memberMap = new Map(memberProfiles.map(p => [p.discordId, p]));
                let rosterString = '';
                for (const memberId of allMemberIds) {
                    const member = await interaction.guild.members.fetch(memberId).catch(()=>null);
                    if(member) {
                        const vpgUser = memberMap.get(memberId)?.vpgUsername || 'N/A';
                        const position = memberMap.get(memberId)?.position || 'N/A';
                        let role = 'Jugador';
                        if (team.managerId === memberId) role = '👑 Mánager';
                        else if (team.captains.includes(memberId)) role = '🛡️ Capitán';
                        rosterString += `**${member.user.username}** (${vpgUser}) - ${position} - *${role}*\n`;
                    }
                }
                const embed = new EmbedBuilder().setTitle(`Plantilla de ${team.name}`).setDescription(rosterString || 'No se pudo obtener la información de la plantilla.').setColor('#3498db').setThumbnail(team.logoUrl);
                await interaction.editReply({ embeds: [embed] });
            }
            else if (customId === 'team_edit_data_button') {
                 const team = await Team.findOne({ guildId: interaction.guildId, managerId: interaction.user.id });
                 if (!team) return interaction.reply({ content: 'Solo los mánagers pueden editar los datos del equipo.', ephemeral: true });
                 const modal = new ModalBuilder().setCustomId(`team_edit_data_modal_${team._id}`).setTitle('Solicitar Cambio de Datos');
                 const newNameInput = new TextInputBuilder().setCustomId('newName').setLabel("Nuevo Nombre del Equipo (opcional)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.name);
                 const newAbbrInput = new TextInputBuilder().setCustomId('newAbbr').setLabel("Nueva Abreviatura (opcional, 3 letras)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.abbreviation).setMinLength(3).setMaxLength(3);
                 const newLogoInput = new TextInputBuilder().setCustomId('newLogo').setLabel("Nueva URL del Logo (opcional)").setStyle(TextInputStyle.Short).setRequired(false);
                 modal.addComponents(new ActionRowBuilder().addComponents(newNameInput), new ActionRowBuilder().addComponents(newAbbrInput), new ActionRowBuilder().addComponents(newLogoInput));
                 await interaction.showModal(modal);
            }
            else if (customId.startsWith('promote_player_')) {
                await interaction.deferUpdate();
                const targetId = customId.split('_')[2];
                const team = await Team.findOne({ guildId: interaction.guildId, managerId: interaction.user.id });
                if (!team) return interaction.editReply({ content: 'Solo el mánager puede ascender.', components: [] });
                team.players = team.players.filter(p => p !== targetId);
                team.captains.push(targetId);
                await team.save();
                const targetMember = await interaction.guild.members.fetch(targetId);
                await targetMember.roles.remove(process.env.PLAYER_ROLE_ID);
                await targetMember.roles.add(process.env.CAPTAIN_ROLE_ID);
                if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(`|C| ${team.abbreviation} ${targetMember.user.username}`).catch(err => console.error(`Fallo al cambiar apodo de Capitán: ${err.message}`));
                await interaction.editReply({ content: `✅ **${targetMember.user.username}** ha sido ascendido a Capitán.`, components: [] });
            }
            else if (customId.startsWith('demote_captain_')) {
                await interaction.deferUpdate();
                const targetId = customId.split('_')[2];
                const team = await Team.findOne({ guildId: interaction.guildId, managerId: interaction.user.id });
                if (!team) return interaction.editReply({ content: 'Solo el mánager puede degradar.', components: [] });
                team.captains = team.captains.filter(c => c !== targetId);
                team.players.push(targetId);
                await team.save();
                const targetMember = await interaction.guild.members.fetch(targetId);
                await targetMember.roles.remove(process.env.CAPTAIN_ROLE_ID);
                await targetMember.roles.add(process.env.PLAYER_ROLE_ID);
                if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(`${team.abbreviation} ${targetMember.user.username}`).catch(err => console.error(`Fallo al cambiar apodo a Jugador: ${err.message}`));
                await interaction.editReply({ content: `✅ **${targetMember.user.username}** ha sido degradado a Jugador.`, components: [] });
            }
            else if (customId.startsWith('kick_player_')) {
                await interaction.deferUpdate();
                const targetId = customId.split('_')[2];
                const team = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: interaction.user.id }, { captains: interaction.user.id }] });
                if (!team) return interaction.editReply({ content: 'No tienes permiso para expulsar.', components: [] });
                const isTargetCaptain = team.captains.includes(targetId);
                const isManager = team.managerId === interaction.user.id;
                if (isTargetCaptain && !isManager) return interaction.editReply({ content: '❌ Los capitanes no pueden expulsar a otros capitanes.', components: [] });
                team.players = team.players.filter(p => p !== targetId);
                team.captains = team.captains.filter(c => c !== targetId);
                await team.save();
                const targetMember = await interaction.guild.members.fetch(targetId);
                await targetMember.roles.remove([process.env.PLAYER_ROLE_ID, process.env.CAPTAIN_ROLE_ID, process.env.MUTED_ROLE_ID]).catch(() => {});
                if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(targetMember.user.username).catch(err => console.error(`Fallo al resetear apodo: ${err.message}`));
                await interaction.editReply({ content: `✅ **${targetMember.user.username}** ha sido expulsado del equipo.`, components: [] });
            }
            else if (customId === 'apply_to_team_button') {
                await interaction.deferReply({ ephemeral: true });
                const existingApplication = await PlayerApplication.findOne({ userId: interaction.user.id, status: 'pending' });
                if (existingApplication) {
                    return interaction.editReply({ content: 'Ya tienes una solicitud de aplicación pendiente. No puedes enviar otra hasta que se resuelva la actual.' });
                }
                const openTeams = await Team.find({ guildId: interaction.guildId, recruitmentOpen: true });
                if (openTeams.length === 0) {
                    return interaction.editReply({ content: 'Actualmente no hay equipos con el reclutamiento abierto.' });
                }
                const teamOptions = openTeams.map(t => ({ label: t.name, value: t._id.toString() }));
                const selectMenu = new StringSelectMenuBuilder().setCustomId('apply_to_team_select').setPlaceholder('Elige un equipo').addOptions(teamOptions);
                await interaction.editReply({ content: 'Selecciona el equipo al que quieres aplicar:', components: [new ActionRowBuilder().addComponents(selectMenu)] });
            }
            else if (customId.startsWith('accept_application_')) {
                // ... (Lógica de aceptar aplicación)
            }
            else if (customId.startsWith('reject_application_')) {
                // ... (Lógica de rechazar aplicación)
            }
        } 
        
        else if (interaction.isStringSelectMenu()) {
            const customId = interaction.customId;
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            if (customId === 'schedule_time_select') {
                await interaction.deferReply({ ephemeral: true });
                const team = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: interaction.user.id }, { captains: interaction.user.id }] });
                if (!team) return interaction.editReply({ content: 'Error: No se encontró tu equipo.'});
                const selectedTimes = interaction.values;
                const channelId = '1396284750850949142';
                const channel = await client.channels.fetch(channelId).catch(() => null);
                if (!channel) return interaction.editReply({ content: 'Error: No se encontró el canal de amistosos programados.' });

                const allTimeSlots = ['22:00', '22:20', '22:40', '23:00', '23:20', '23:40'];
                const timeSlotsData = allTimeSlots.map(time => ({
                    time,
                    status: selectedTimes.includes(time) ? 'AVAILABLE' : 'UNAVAILABLE'
                }));

                const webhook = await getOrCreateWebhook(channel, client);
                const panelData = await buildScheduledPanel(team, interaction.user.id, timeSlotsData);
                const message = await webhook.send({ username: team.name, avatarURL: team.logoUrl, embeds: [panelData.embed], components: panelData.components });

                const panel = new AvailabilityPanel({
                    guildId: interaction.guildId, channelId, messageId: message.id, teamId: team._id, postedById: interaction.user.id, panelType: 'SCHEDULED', timeSlots: timeSlotsData
                });
                await panel.save();
                
                const finalComponents = await buildScheduledPanel(team, interaction.user.id, timeSlotsData, panel._id);
                await client.channels.cache.get(channelId).messages.edit(message.id, { components: finalComponents.components });

                await interaction.editReply({ content: '✅ Tu panel de disponibilidad ha sido publicado.' });
            }
            else if (customId === 'delete_league_select_menu') {
                if (!isAdmin) return interaction.reply({ content: 'Acción no permitida.', ephemeral: true });
                const selectedLeagues = interaction.values;
                await League.deleteMany({ guildId: interaction.guildId, name: { $in: selectedLeagues } });
                await interaction.update({ content: `✅ Ligas eliminadas con éxito: **${selectedLeagues.join(', ')}**`, components: [] });
            }
            else if (customId === 'view_team_roster_select') {
                await interaction.deferUpdate();
                const teamId = interaction.values[0];
                const team = await Team.findById(teamId);
                if (!team) return interaction.editReply({ content: 'Este equipo ya no existe.', components: [] });
                const allMemberIds = [team.managerId, ...team.captains, ...team.players].filter(id => id);
                const memberProfiles = await VPGUser.find({ discordId: { $in: allMemberIds } });
                const memberMap = new Map(memberProfiles.map(p => [p.discordId, p]));
                const positionOrder = ['GK', 'DFC', 'CARR', 'MCD', 'MC', 'MCO', 'DC', null];
                const sortedMemberIds = allMemberIds.sort((a, b) => {
                    const posA = memberMap.get(a)?.position; const posB = memberMap.get(b)?.position;
                    return positionOrder.indexOf(posA) - positionOrder.indexOf(posB);
                });
                let managerString = "Sin Mánager";
                if(team.managerId) managerString = `<@${team.managerId}> (${memberMap.get(team.managerId)?.vpgUsername || 'N/A'})`;
                const getMemberString = (id) => `<@${id}> (${memberMap.get(id)?.vpgUsername || 'N/A'} - ${memberMap.get(id)?.position || 'N/A'})`;
                const captainsStrings = sortedMemberIds.filter(id => team.captains.includes(id)).map(getMemberString);
                const playersStrings = sortedMemberIds.filter(id => !team.captains.includes(id) && id !== team.managerId).map(getMemberString);
                const embed = new EmbedBuilder().setTitle(`Plantilla de ${team.name} [${team.abbreviation}]`).setThumbnail(team.logoUrl).setColor('#3498db')
                    .addFields(
                        { name: '👑 Mánager', value: managerString },
                        { name: '🛡️ Capitanes', value: captainsStrings.length > 0 ? captainsStrings.join('\n') : 'Sin Capitanes' },
                        { name: '👥 Jugadores', value: playersStrings.length > 0 ? playersStrings.join('\n') : 'Sin Jugadores' }
                    ).setFooter({ text: `Liga: ${team.league}`});
                await interaction.editReply({ content: '', embeds: [embed], components: [] });
            }
            else if (customId === 'roster_management_menu') {
                await interaction.deferReply({ ephemeral: true });
                const team = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: interaction.user.id }, { captains: interaction.user.id }] });
                if (!team) return;
                const isManager = team.managerId === interaction.user.id;
                const targetId = interaction.values[0];
                const targetMember = await interaction.guild.members.fetch(targetId);
                const isTargetCaptain = team.captains.includes(targetId);
                const row = new ActionRowBuilder();
                if (isManager && !isTargetCaptain) row.addComponents(new ButtonBuilder().setCustomId(`promote_player_${targetId}`).setLabel('⬆️ Ascender a Capitán').setStyle(ButtonStyle.Success));
                if (isManager && isTargetCaptain) row.addComponents(new ButtonBuilder().setCustomId(`demote_captain_${targetId}`).setLabel('⬇️ Degradar a Jugador').setStyle(ButtonStyle.Secondary));
                const isMuted = targetMember.roles.cache.has(process.env.MUTED_ROLE_ID);
                if (!isTargetCaptain) row.addComponents(new ButtonBuilder().setCustomId(`toggle_mute_player_${targetId}`).setLabel(isMuted ? '🔊 Desmutear' : '🔇 Mutear').setStyle(isMuted ? ButtonStyle.Success : ButtonStyle.Secondary));
                if (isManager || !isTargetCaptain) row.addComponents(new ButtonBuilder().setCustomId(`kick_player_${targetId}`).setLabel('❌ Expulsar').setStyle(ButtonStyle.Danger));
                await interaction.editReply({ content: `Gestionando a **${targetMember.user.username}**:`, components: [row] });
            }
            else if (customId.startsWith('admin_roster_menu_')) {
                if(!isAdmin) return;
                await interaction.deferReply({ ephemeral: true });
                const teamId = customId.split('_')[3];
                const targetId = interaction.values[0];
                const team = await Team.findById(teamId);
                const isTargetCaptain = team.captains.includes(targetId);
                const targetMember = await interaction.guild.members.fetch(targetId);
                const row = new ActionRowBuilder();
                if (!isTargetCaptain) row.addComponents(new ButtonBuilder().setCustomId(`admin_promote_${teamId}_${targetId}`).setLabel('⬆️ Ascender a Capitán').setStyle(ButtonStyle.Success));
                if (isTargetCaptain) row.addComponents(new ButtonBuilder().setCustomId(`admin_demote_${teamId}_${targetId}`).setLabel('⬇️ Degradar a Jugador').setStyle(ButtonStyle.Secondary));
                row.addComponents(new ButtonBuilder().setCustomId(`admin_make_manager_${teamId}_${targetId}`).setLabel('👑 Hacer Mánager').setStyle(ButtonStyle.Success).setDisabled(!!team.managerId));
                row.addComponents(new ButtonBuilder().setCustomId(`admin_kick_${teamId}_${targetId}`).setLabel('❌ Expulsar').setStyle(ButtonStyle.Danger));
                await interaction.editReply({ content: `Acciones de admin para **${targetMember.user.username}**:`, components: [row] });
            }
             else if (customId === 'apply_to_team_select') {
                const teamId = interaction.values[0];
                const modal = new ModalBuilder().setCustomId(`player_application_modal_${teamId}`).setTitle('Aplicar a Equipo');
                const presentationInput = new TextInputBuilder().setCustomId('presentation').setLabel('Escribe una breve presentación').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(200);
                modal.addComponents(new ActionRowBuilder().addComponents(presentationInput));
                await interaction.showModal(modal);
            }
        } 
        
        else if (interaction.isModalSubmit()) {
            const customId = interaction.customId;
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            if (customId === 'create_league_modal') {
                if (!isAdmin) return interaction.reply({ content: 'Acción no permitida.', ephemeral: true });
                await interaction.deferReply({ ephemeral: true });
                const leagueName = interaction.fields.getTextInputValue('leagueNameInput');
                const existing = await League.findOne({ name: leagueName, guildId: interaction.guildId });
                if (existing) return interaction.editReply({ content: `La liga "${leagueName}" ya existe.` });
                const newLeague = new League({ name: leagueName, guildId: interaction.guildId });
                await newLeague.save();
                await interaction.editReply({ content: `✅ Liga "${leagueName}" creada con éxito.` });
            }
            else if (customId.startsWith('admin_edit_')) {
                await interaction.deferReply({ ephemeral: true });
                const parts = customId.split('_');
                const action = parts[2];
                const teamId = parts[3];
                const newValue = action === 'abbr' ? interaction.fields.getTextInputValue('newValue').toUpperCase() : interaction.fields.getTextInputValue('newValue');
                const update = {};
                const fieldName = action === 'name' ? 'name' : action === 'logo' ? 'logoUrl' : 'abbreviation';
                update[fieldName] = newValue;
                await Team.findByIdAndUpdate(teamId, { $set: update });
                await interaction.editReply({ content: `✅ La propiedad del equipo ha sido actualizada.` });
            }
            else if (customId.startsWith('admin_assign_manager_modal_')) {
                await interaction.deferReply({ ephemeral: true });
                const teamId = customId.split('_')[4];
                const userInput = interaction.fields.getTextInputValue('userId');
                let targetMember;
                try {
                    const members = await interaction.guild.members.search({ query: userInput, limit: 1 });
                    targetMember = members.first();
                    if (!targetMember) throw new Error();
                } catch(e) {
                     return interaction.editReply({ content: `Error: No se pudo encontrar al usuario que coincida con "${userInput}".` });
                }
                const team = await Team.findById(teamId);
                team.managerId = targetMember.id;
                await team.save();
                await targetMember.roles.add(process.env.MANAGER_ROLE_ID);
                if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(`|MG| ${team.abbreviation} ${targetMember.user.username}`).catch(()=>{});
                await interaction.editReply({ content: `✅ **${targetMember.user.tag}** es ahora el nuevo Mánager de **${team.name}**.` });
            }
            else if (customId === 'manager_request_modal') {
                await interaction.deferReply({ ephemeral: true });
                const vpgUsername = interaction.fields.getTextInputValue('vpgUsername');
                const teamName = interaction.fields.getTextInputValue('teamName');
                const teamAbbr = interaction.fields.getTextInputValue('teamAbbr').toUpperCase();
                const leagueName = interaction.fields.getTextInputValue('leagueSelect');
                const approvalChannel = await client.channels.fetch(process.env.APPROVAL_CHANNEL_ID);
                if (!approvalChannel) return interaction.editReply({ content: 'Error: Canal de aprobaciones no encontrado.' });
                const embed = new EmbedBuilder().setTitle('Nueva Solicitud de Mánager').setColor('#f1c40f').addFields({ name: 'Solicitante', value: `<@${interaction.user.id}> (${interaction.user.tag})` }, { name: 'Usuario VPG', value: vpgUsername }, { name: 'Nombre del Equipo', value: teamName }, { name: 'Abreviatura', value: teamAbbr }, { name: 'Liga', value: leagueName }).setTimestamp();
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`approve_request_${interaction.user.id}_${teamName}`).setLabel("✅ Aprobar").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`reject_request_${interaction.user.id}`).setLabel("❌ Rechazar").setStyle(ButtonStyle.Danger));
                await approvalChannel.send({ embeds: [embed], components: [row] });
                await interaction.editReply({ content: 'Tu solicitud ha sido enviada para revisión.' });
            } 
            else if (customId === 'invite_player_modal') {
                await interaction.deferReply({ ephemeral: true });
                const team = await Team.findOne({ guildId: interaction.guildId, managerId: interaction.user.id });
                if (!team) return interaction.editReply({ content: 'Ha ocurrido un error, no se encontró tu equipo.' });
                const playerName = interaction.fields.getTextInputValue('playerName');
                const members = await interaction.guild.members.search({ query: playerName, limit: 1 });
                const targetMember = members.first();
                if (!targetMember) return interaction.editReply({ content: `No se encontró ningún usuario que coincida con "${playerName}".` });
                if (targetMember.user.bot) return interaction.editReply({ content: 'No puedes invitar a un bot.' });
                if (targetMember.id === interaction.user.id) return interaction.editReply({ content: 'No puedes invitarte a ti mismo.' });
                const isManager = await Team.findOne({ guildId: interaction.guildId, managerId: targetMember.id });
                if (isManager) return interaction.editReply({ content: `**${targetMember.user.username}** ya es mánager de otro equipo.` });
                const embed = new EmbedBuilder().setTitle('💌 Tienes una invitación').setDescription(`**${interaction.user.username}**, mánager de **${team.name}**, te ha invitado a unirte.`).setColor('#3498db').setThumbnail(team.logoUrl);
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`accept_invite_${team._id}`).setLabel('✅ Aceptar').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`reject_invite_${team._id}`).setLabel('❌ Rechazar').setStyle(ButtonStyle.Danger));
                try {
                    await targetMember.send({ embeds: [embed], components: [row] });
                    await interaction.editReply({ content: `✅ Invitación enviada a **${targetMember.user.username}**.` });
                } catch (error) {
                    await interaction.editReply({ content: `❌ No se pudo enviar la invitación a **${targetMember.user.username}**. Puede que tenga los MDs bloqueados.` });
                }
            }
            else if (customId.startsWith('player_join_modal_')) {
                await interaction.deferReply({ ephemeral: true });
                const teamId = customId.split('_')[2];
                const team = await Team.findById(teamId);
                if (!team) return interaction.editReply({ content: 'Error: El equipo ya no existe.' });
                const vpgUsername = interaction.fields.getTextInputValue('vpgUsername');
                const position = interaction.fields.getTextInputValue('positionSelect');
                await VPGUser.findOneAndUpdate({ discordId: interaction.user.id }, { discordId: interaction.user.id, vpgUsername, position, teamName: team.name, isManager: false, lastUpdated: new Date() }, { upsert: true, new: true });
                team.players.push(interaction.user.id);
                await team.save();
                await interaction.member.roles.add(process.env.PLAYER_ROLE_ID);
                if (interaction.member.id !== interaction.guild.ownerId) await interaction.member.setNickname(`${team.abbreviation} ${interaction.user.username}`).catch(err => console.error(`Fallo al cambiar apodo de Jugador: ${err.message}`));
                await interaction.editReply({ content: `¡Felicidades! Te has unido a **${team.name}** como ${position}.` });
                const manager = await client.users.fetch(team.managerId);
                await manager.send(`✅ **${interaction.user.username}** (Usuario VPG: ${vpgUsername}) ha aceptado tu invitación a **${team.name}** y jugará de ${position}.`);
                interaction.message.delete().catch(() => {});
            }
            else if (customId.startsWith('approve_modal_')) {
                await interaction.deferReply({ ephemeral: true });
                const applicantId = customId.split('_')[2];
                const originalRequestMessage = (await interaction.channel.messages.fetch({ limit: 100 })).find(msg => msg.embeds[0]?.fields[0]?.value.includes(applicantId) && !msg.components[0]?.components[0]?.disabled);
                if (!originalRequestMessage) return interaction.editReply({ content: 'Error: No se pudo encontrar el mensaje de solicitud original.' });
                const teamName = originalRequestMessage.embeds[0].fields.find(f => f.name === 'Nombre del Equipo').value;
                const teamAbbr = originalRequestMessage.embeds[0].fields.find(f => f.name === 'Abreviatura').value;
                const leagueName = originalRequestMessage.embeds[0].fields.find(f => f.name === 'Liga').value;
                const teamLogoUrl = interaction.fields.getTextInputValue('teamLogoUrl');
                let applicant;
                try {
                    applicant = await interaction.guild.members.fetch(applicantId);
                } catch (fetchError) {
                    return interaction.editReply({ content: 'Error: No se pudo encontrar al miembro solicitante en el servidor.' });
                }
                const existingTeam = await Team.findOne({ name: teamName, guildId: interaction.guildId });
                if (existingTeam) return interaction.editReply({ content: `Error: Ya existe un equipo llamado **${teamName}**.` });
                const isAlreadyManaged = await Team.findOne({ managerId: applicant.id });
                if (isAlreadyManaged) return interaction.editReply({ content: `Error: Este usuario ya es mánager del equipo **${isAlreadyManaged.name}**.` });
                const newTeam = new Team({ name: teamName, abbreviation: teamAbbr, guildId: interaction.guildId, league: leagueName, logoUrl: teamLogoUrl, managerId: applicant.id });
                await newTeam.save();
                await applicant.roles.add(process.env.MANAGER_ROLE_ID);
                if (applicant.id !== interaction.guild.ownerId) {
                    try {
                        await applicant.setNickname(`|MG| ${newTeam.abbreviation} ${applicant.user.username}`);
                    } catch (nicknameError) {
                        console.error(`FALLO AL CAMBIAR APODO: ${nicknameError.message}`);
                    }
                }
                const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(originalRequestMessage.components[0].components[0]).setDisabled(true).setLabel('Aprobado'), ButtonBuilder.from(originalRequestMessage.components[0].components[1]).setDisabled(true));
                await originalRequestMessage.edit({ components: [disabledRow] });
                await interaction.editReply({ content: `¡Equipo **${teamName}** aprobado! **${applicant.user.tag}** es ahora Mánager.` });
                await applicant.send(`¡Felicidades! Tu equipo **${teamName}** ha sido APROBADO.`).catch(() => {});
            }
            else if (customId.startsWith('player_application_modal_')) {
                await interaction.deferReply({ ephemeral: true });
                const teamId = customId.split('_')[3];
                const team = await Team.findById(teamId);
                if (!team || !team.managerId) return interaction.editReply({ content: 'Este equipo ya no existe o no tiene mánager.' });
                const presentation = interaction.fields.getTextInputValue('presentation');
                const application = new PlayerApplication({
                    userId: interaction.user.id,
                    teamId: team._id,
                    presentation: presentation,
                });
                await application.save();
                const manager = await client.users.fetch(team.managerId).catch(() => null);
                if (manager) {
                    const embed = new EmbedBuilder()
                        .setTitle('📩 Nueva Solicitud para tu Equipo')
                        .setDescription(`**${interaction.user.tag}** quiere unirse a **${team.name}**.`)
                        .addFields({ name: 'Presentación', value: presentation })
                        .setColor('Blue');
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`accept_application_${application._id}`).setLabel('Aceptar').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`reject_application_${application._id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
                    );
                    await manager.send({ embeds: [embed], components: [row] });
                }
                await interaction.editReply({ content: '✅ Tu solicitud ha sido enviada al mánager del equipo.' });
            }
             else if (customId.startsWith('team_edit_data_modal_')) {
                await interaction.deferReply({ ephemeral: true });
                const teamId = customId.split('_')[4];
                const team = await Team.findById(teamId);
                if (!team || team.managerId !== interaction.user.id) return interaction.editReply({ content: 'Acción no permitida.' });
                const newName = interaction.fields.getTextInputValue('newName');
                const newAbbr = interaction.fields.getTextInputValue('newAbbr').toUpperCase();
                const newLogo = interaction.fields.getTextInputValue('newLogo');
                if (newName === team.name && newAbbr === team.abbreviation && !newLogo) {
                    return interaction.editReply({ content: 'No has realizado ningún cambio.' });
                }
                const approvalChannel = await client.channels.fetch(process.env.APPROVAL_CHANNEL_ID);
                const embed = new EmbedBuilder()
                    .setTitle('📝 Solicitud de Cambio de Datos')
                    .setDescription(`El mánager <@${interaction.user.id}> ha solicitado cambiar los datos de **${team.name}**.`)
                    .setColor('Orange');
                if (newName !== team.name) embed.addFields({ name: 'Nuevo Nombre', value: `De \`${team.name}\` a \`${newName}\`` });
                if (newAbbr !== team.abbreviation) embed.addFields({ name: 'Nueva Abreviatura', value: `De \`${team.abbreviation}\` a \`${newAbbr}\`` });
                if (newLogo) embed.addFields({ name: 'Nuevo Logo', value: `Se ha solicitado un nuevo logo.` });
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`approve_team_edit_${teamId}`).setLabel('Aprobar Cambios').setStyle(ButtonStyle.Success)
                );
                await approvalChannel.send({ embeds: [embed], components: [row] });
                await interaction.editReply({ content: '✅ Tu solicitud de cambio ha sido enviada a los administradores para su revisión.' });
            }
        }
    } catch (error) {
        console.error("Fallo crítico de interacción:", error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'Ha ocurrido un error al procesar tu solicitud.', ephemeral: true }).catch(()=>{});
        } else {
            if (error.code !== 10062) {
                await interaction.reply({ content: 'Ha ocurrido un error al procesar tu solicitud.', ephemeral: true }).catch(()=>{});
            }
        }
    }
});

// --- FUNCIONES HELPER PARA AMISTOSOS ---
async function getOrCreateWebhook(channel, client) {
    const webhooks = await channel.fetchWebhooks();
    let webhook = webhooks.find(wh => wh.owner.id === client.user.id && wh.name === 'VPG Amistosos');
    if (!webhook) {
        webhook = await channel.createWebhook({ name: 'VPG Amistosos', avatar: client.user.displayAvatarURL() });
    }
    return webhook;
}

async function buildScheduledPanel(team, userId, timeSlotsData, panelId = null) {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setDescription(`**Buscando rivales para los siguientes horarios:**\n\n*Contacto:* <@${userId}> ([Enviar MD](https://discord.com/users/${userId}))`);
    
    const components = [];
    let currentRow = new ActionRowBuilder();

    for (const slot of timeSlotsData) {
        let fieldText = '';
        let button = null;

        switch (slot.status) {
            case 'AVAILABLE':
                fieldText = `✅ **DISPONIBLE**`;
                button = new ButtonBuilder().setCustomId(`challenge_slot_${panelId}_${slot.time}`).setLabel(`⚔️`).setStyle(ButtonStyle.Success);
                break;
            case 'CONFIRMED':
                const challengerTeam = await Team.findById(slot.challengerTeamId);
                fieldText = `🔹 **VS** [${challengerTeam.name}](https://discord.com/users/${slot.challengerUserId})`;
                button = new ButtonBuilder().setCustomId(`disabled_${slot.time}`).setLabel(`🔒`).setStyle(ButtonStyle.Secondary).setDisabled(true);
                break;
            case 'UNAVAILABLE':
                fieldText = `❌ No disponible`;
                break;
        }
        if(fieldText) embed.addFields({ name: `🕕 ${slot.time}`, value: fieldText, inline: true });
        
        if (button) {
            if (currentRow.components.length >= 5) {
                components.push(currentRow);
                currentRow = new ActionRowBuilder();
            }
            currentRow.addComponents(button);
        }
    }
    if (currentRow.components.length > 0) {
        components.push(currentRow);
    }
    
    return { embed, components };
}

client.login(process.env.DISCORD_TOKEN);
