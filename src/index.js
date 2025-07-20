require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits, WebhookClient, StringSelectMenuBuilder } = require('discord.js');
const mongoose = require('mongoose');

// --- CARGA DE MODELOS ---
const Team = require('./models/team.js');
const League = require('./models/league.js');
const VPGUser = require('./models/user.js');
const TeamChatChannel = require('./models/teamChatChannel.js');

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
});

// --- LÓGICA DE CHAT AUTOMÁTICO (CON COMPROBACIÓN DE MUTEO) ---
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
// === GESTIÓN DE INTERACCIONES (COMPLETA) ===
// =========================================================================================
client.on(Events.InteractionCreate, async interaction => {
    try {
        if (!interaction.inGuild()) return;

        // --- AUTOCOMPLETADO ---
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
                const teamId = interaction.options.getString('equipo');
                const team = await Team.findById(teamId);
                if (!team) return interaction.reply({ content: 'No se ha encontrado un equipo con ese ID.', ephemeral: true });
                const embed = new EmbedBuilder().setTitle(`Panel de Gestión: ${team.name}`).setDescription('Selecciona una acción para administrar este equipo.').setThumbnail(team.logoUrl).setColor('#e74c3c');
                const row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`admin_change_name_${teamId}`).setLabel('Cambiar Nombre').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`admin_change_logo_${teamId}`).setLabel('Cambiar Logo').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`admin_expel_manager_${teamId}`).setLabel('Destituir Mánager').setStyle(ButtonStyle.Danger).setDisabled(!team.managerId)
                );
                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`admin_assign_manager_${teamId}`).setLabel('Asignar Mánager').setStyle(ButtonStyle.Success).setDisabled(!!team.managerId),
                    new ButtonBuilder().setCustomId(`admin_manage_members_${teamId}`).setLabel('Gestionar Miembros').setStyle(ButtonStyle.Secondary)
                );
                await interaction.reply({ embeds: [embed], components: [row1, row2], ephemeral: true });
            } else {
                 await command.execute(interaction);
            }
            return;
        }
        
        if (interaction.isButton()) {
            const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
            const customId = interaction.customId;

            // --- BOTONES DEL PANEL DE GESTIÓN DEL ADMIN ---
            if (customId.startsWith('admin_')) {
                if (!isAdmin) return interaction.reply({ content: 'Solo los administradores pueden usar estos botones.', ephemeral: true });

                const parts = customId.split('_');
                const action = parts[1];
                const teamId = customId.substring(customId.lastIndexOf('_') + 1);

                switch (action) {
                    case 'change': {
                        const subAction = parts[2]; // name o logo
                        const modal = new ModalBuilder().setCustomId(`admin_edit_${subAction}_${teamId}`).setTitle(`Cambiar ${subAction === 'name' ? 'Nombre' : 'Logo'} del Equipo`);
                        const input = new TextInputBuilder().setCustomId('newValue').setLabel(`Nuevo ${subAction === 'name' ? 'nombre' : 'URL del logo'}`).setStyle(TextInputStyle.Short).setRequired(true);
                        modal.addComponents(new ActionRowBuilder().addComponents(input));
                        await interaction.showModal(modal);
                        break;
                    }
                    case 'expel': {
                        const team = await Team.findById(teamId);
                        if (!team || !team.managerId) return interaction.reply({ content: 'El equipo no tiene un mánager para destituir.', ephemeral: true });
                        const managerId = team.managerId;
                        team.managerId = null;
                        await team.save();
                        const managerMember = await interaction.guild.members.fetch(managerId).catch(() => null);
                        if (managerMember) {
                            await managerMember.roles.remove(process.env.MANAGER_ROLE_ID);
                            if (managerMember.id !== interaction.guild.ownerId) await managerMember.setNickname(managerMember.user.username).catch(()=>{});
                            await managerMember.send(`Has sido destituido como Mánager del equipo **${team.name}** por un administrador.`).catch(()=>{});
                        }
                        await interaction.reply({ content: `✅ Mánager destituido. El equipo **${team.name}** ahora no tiene mánager.`, ephemeral: true });
                        break;
                    }
                    case 'assign': {
                        const modal = new ModalBuilder().setCustomId(`admin_assign_manager_modal_${teamId}`).setTitle('Asignar Nuevo Mánager');
                        const userIdInput = new TextInputBuilder().setCustomId('userId').setLabel('ID del nuevo Mánager').setStyle(TextInputStyle.Short).setRequired(true);
                        modal.addComponents(new ActionRowBuilder().addComponents(userIdInput));
                        await interaction.showModal(modal);
                        break;
                    }
                    case 'manage': {
                        const team = await Team.findById(teamId);
                        if (!team) return interaction.reply({ content: 'Equipo no encontrado.', ephemeral: true });
                        const memberIds = [team.managerId, ...team.captains, ...team.players].filter(id => id);
                        if (memberIds.length === 0) return interaction.reply({ content: 'Este equipo no tiene miembros para gestionar.', ephemeral: true });
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
                        if (memberOptions.length === 0) return interaction.reply({ content: 'No se encontraron miembros en el servidor.', ephemeral: true });
                        const selectMenu = new StringSelectMenuBuilder().setCustomId(`admin_roster_menu_${teamId}`).setPlaceholder('Selecciona un miembro').addOptions(memberOptions);
                        await interaction.reply({ content: `Gestionando miembros de **${team.name}**:`, components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
                        break;
                    }
                    case 'promote':
                    case 'demote':
                    case 'make': // make manager
                    case 'kick': {
                        const targetId = parts[parts.length - 1];
                        const team = await Team.findById(teamId);
                        if(!team) return interaction.update({content: 'Equipo no encontrado.', components: []});
                        const targetMember = await interaction.guild.members.fetch(targetId);
                        
                        if (action === 'kick') {
                            team.players = team.players.filter(p => p !== targetId);
                            team.captains = team.captains.filter(c => c !== targetId);
                            if(team.managerId === targetId) team.managerId = null;
                            await targetMember.roles.remove([process.env.PLAYER_ROLE_ID, process.env.CAPTAIN_ROLE_ID, process.env.MANAGER_ROLE_ID]);
                            await interaction.update({ content: `✅ **${targetMember.user.username}** expulsado.`, components: [] });
                        } else if (action === 'promote') {
                            team.players = team.players.filter(p => p !== targetId);
                            team.captains.push(targetId);
                            await targetMember.roles.remove(process.env.PLAYER_ROLE_ID).catch(()=>{});
                            await targetMember.roles.add(process.env.CAPTAIN_ROLE_ID);
                            await interaction.update({ content: `✅ **${targetMember.user.username}** ascendido a Capitán.`, components: [] });
                        } else if (action === 'demote') {
                            team.captains = team.captains.filter(c => c !== targetId);
                            team.players.push(targetId);
                            await targetMember.roles.remove(process.env.CAPTAIN_ROLE_ID).catch(()=>{});
                            await targetMember.roles.add(process.env.PLAYER_ROLE_ID);
                            await interaction.update({ content: `✅ **${targetMember.user.username}** degradado a Jugador.`, components: [] });
                        } else if (action === 'make') { // make manager
                            // Quitar al antiguo manager si lo hay
                            if(team.managerId) {
                                const oldManager = await interaction.guild.members.fetch(team.managerId).catch(()=>{});
                                if(oldManager) await oldManager.roles.remove(process.env.MANAGER_ROLE_ID).catch(()=>{});
                            }
                            team.managerId = targetId;
                            team.players = team.players.filter(p => p !== targetId);
                            team.captains = team.captains.filter(c => c !== targetId);
                            await targetMember.roles.remove([process.env.PLAYER_ROLE_ID, process.env.CAPTAIN_ROLE_ID]);
                            await targetMember.roles.add(process.env.MANAGER_ROLE_ID);
                            await interaction.update({ content: `👑 **${targetMember.user.username}** es ahora el nuevo Mánager.`, components: [] });
                        }
                        await team.save();
                        break;
                    }
                }
                return;
            }

            // --- BOTÓN DE MUTEAR/DESMUTEAR ---
            if (customId.startsWith('toggle_mute_player_')) {
                const parts = customId.split('_');
                const targetId = parts[parts.length - 1];
                const team = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: interaction.user.id }, { captains: interaction.user.id }] });
                if (!team) return interaction.reply({ content: 'No tienes permiso para esta acción.', ephemeral: true });

                const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
                if (!targetMember) return interaction.update({ content: 'No se encontró al miembro.', components: [] });
                if (team.captains.includes(targetId)) return interaction.update({ content: 'No puedes mutear a un capitán.', components: [] });

                const hasMutedRole = targetMember.roles.cache.has(process.env.MUTED_ROLE_ID);
                if (hasMutedRole) {
                    await targetMember.roles.remove(process.env.MUTED_ROLE_ID);
                    await interaction.update({ content: `✅ **${targetMember.user.username}** ha sido desmuteado.`, components: [] });
                } else {
                    await targetMember.roles.add(process.env.MUTED_ROLE_ID);
                    await interaction.update({ content: `🔇 **${targetMember.user.username}** ha sido muteado.`, components: [] });
                }
                return;
            }
            
            // --- EL RESTO DE BOTONES ---
            const esAprobador = interaction.member.roles.cache.has(process.env.APPROVER_ROLE_ID) || isAdmin;
            
            if (customId === 'admin_create_league_button') {
                if (!isAdmin) return interaction.reply({ content: 'Solo los administradores pueden usar este botón.', ephemeral: true });
                const modal = new ModalBuilder().setCustomId('create_league_modal').setTitle('Crear Nueva Liga');
                const leagueNameInput = new TextInputBuilder().setCustomId('leagueNameInput').setLabel("Nombre de la nueva liga").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(leagueNameInput));
                await interaction.showModal(modal);
            }
            else if (customId === 'admin_delete_league_button') {
                if (!isAdmin) return interaction.reply({ content: 'Solo los administradores pueden usar este botón.', ephemeral: true });
                const leagues = await League.find({ guildId: interaction.guildId });
                if (leagues.length === 0) return interaction.reply({ content: 'No hay ligas para borrar.', ephemeral: true });
                const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));
                const selectMenu = new StringSelectMenuBuilder().setCustomId('delete_league_select_menu').setPlaceholder('Selecciona las ligas a eliminar').addOptions(leagueOptions).setMinValues(1).setMaxValues(leagueOptions.length);
                const row = new ActionRowBuilder().addComponents(selectMenu);
                await interaction.reply({ content: 'Selecciona del menú las ligas que quieres borrar permanentemente:', components: [row], ephemeral: true });
            }
            else if (customId === 'view_teams_button') {
                const teams = await Team.find({ guildId: interaction.guildId }).limit(25);
                if (teams.length === 0) return interaction.reply({ content: 'No hay equipos registrados en este servidor.', ephemeral: true });
                const teamOptions = teams.map(t => ({ label: t.name, description: `Liga: ${t.league}`, value: t._id.toString() }));
                const selectMenu = new StringSelectMenuBuilder().setCustomId('view_team_roster_select').setPlaceholder('Selecciona un equipo para ver su plantilla').addOptions(teamOptions);
                await interaction.reply({ content: 'Elige un equipo del menú desplegable:', components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
            }
            else if (customId === 'request_manager_role_button') {
                const existingTeam = await Team.findOne({ managerId: interaction.user.id, guildId: interaction.guildId });
                if (existingTeam) return interaction.reply({ content: `Ya eres el Mánager del equipo **${existingTeam.name}**.`, ephemeral: true });
                const leagues = await League.find({ guildId: interaction.guildId });
                if (leagues.length === 0) return interaction.reply({ content: 'No hay ligas registradas. Contacta a un administrador.', ephemeral: true });
                const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));
                const modal = new ModalBuilder().setCustomId('manager_request_modal').setTitle('Formulario de Solicitud de Mánager');
                const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsername').setLabel("Tu nombre de usuario en VPG").setStyle(TextInputStyle.Short).setRequired(true);
                const teamNameInput = new TextInputBuilder().setCustomId('teamName').setLabel("Nombre de tu equipo en VPG").setStyle(TextInputStyle.Short).setRequired(true);
                const teamAbbrInput = new TextInputBuilder().setCustomId('teamAbbr').setLabel("Abreviatura del equipo (3-4 letras)").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3).setMaxLength(4);
                const leagueSelect = new StringSelectMenuBuilder().setCustomId('leagueSelect').setPlaceholder('Selecciona la liga').addOptions(leagueOptions);
                modal.addComponents(new ActionRowBuilder().addComponents(vpgUsernameInput), new ActionRowBuilder().addComponents(teamNameInput), new ActionRowBuilder().addComponents(teamAbbrInput), new ActionRowBuilder().addComponents(leagueSelect));
                await interaction.showModal(modal);
            }
            else if (customId === 'leave_team_button') {
                const team = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: interaction.user.id }, { captains: interaction.user.id }, { players: interaction.user.id }] });
                if (!team) return interaction.reply({ content: 'No perteneces a ningún equipo.', ephemeral: true });
                if (team.managerId === interaction.user.id) return interaction.reply({ content: 'Los Mánagers no pueden abandonar su equipo.', ephemeral: true });
                team.players = team.players.filter(p => p !== interaction.user.id);
                team.captains = team.captains.filter(c => c !== interaction.user.id);
                await team.save();
                await interaction.member.roles.remove([process.env.PLAYER_ROLE_ID, process.env.CAPTAIN_ROLE_ID]).catch(() => {});
                if (interaction.member.id !== interaction.guild.ownerId) await interaction.member.setNickname(interaction.member.user.username).catch(()=>{});
                await interaction.reply({ content: `Has abandonado el equipo **${team.name}**.`, ephemeral: true });
                const manager = await client.users.fetch(team.managerId).catch(() => null);
                if (manager) await manager.send(`El jugador **${interaction.user.tag}** ha abandonado tu equipo.`);
            }
            else if (customId.startsWith('accept_invite_')) {
                const teamId = customId.split('_')[2];
                const team = await Team.findById(teamId);
                if (!team) return interaction.reply({ content: 'Este equipo ya no existe.', ephemeral: true });
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
                const applicantId = customId.split('_')[2];
                const applicant = await interaction.guild.members.fetch(applicantId);
                const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true), ButtonBuilder.from(interaction.message.components[0].components[1]).setDisabled(true));
                await interaction.message.edit({ components: [disabledRow] });
                await interaction.reply({ content: `La solicitud de **${applicant.user.tag}** ha sido rechazada.`, ephemeral: false });
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
            else if (customId === 'manager_invite_player') {
                const team = await Team.findOne({ guildId: interaction.guildId, managerId: interaction.user.id });
                if (!team) return interaction.reply({ content: 'Solo los mánagers registrados pueden invitar.', ephemeral: true });
                const modal = new ModalBuilder().setCustomId('manager_invite_modal').setTitle(`Invitar Jugador a ${team.name}`);
                const playerIdInput = new TextInputBuilder().setCustomId('playerId').setLabel("ID del usuario de Discord a invitar").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(playerIdInput));
                await interaction.showModal(modal);
            }
            else if (customId === 'manager_manage_roster') {
                const team = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: interaction.user.id }, { captains: interaction.user.id }] });
                if (!team) return interaction.reply({ content: 'Debes ser mánager o capitán de un equipo.', ephemeral: true });
                const memberIds = [...team.captains, ...team.players];
                if (memberIds.length === 0) return interaction.reply({ content: 'Tu equipo no tiene miembros para gestionar.', ephemeral: true });
                const memberOptions = [];
                for (const memberId of memberIds) {
                    const member = await interaction.guild.members.fetch(memberId).catch(() => null);
                    if (member) memberOptions.push({ label: member.user.username, description: team.captains.includes(memberId) ? 'Capitán' : 'Jugador', value: memberId });
                }
                if (memberOptions.length === 0) return interaction.reply({ content: 'No se encontraron miembros en el servidor.', ephemeral: true });
                const selectMenu = new StringSelectMenuBuilder().setCustomId('roster_management_menu').setPlaceholder('Selecciona un jugador para gestionar').addOptions(memberOptions);
                await interaction.reply({ content: 'Selecciona un miembro de tu plantilla:', components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
            }
            else if (customId.startsWith('promote_player_')) {
                const team = await Team.findOne({ guildId: interaction.guildId, managerId: interaction.user.id });
                if (!team) return interaction.reply({ content: 'Solo el mánager puede ascender.', ephemeral: true });
                const targetId = customId.split('_')[2];
                team.players = team.players.filter(p => p !== targetId);
                team.captains.push(targetId);
                await team.save();
                const targetMember = await interaction.guild.members.fetch(targetId);
                await targetMember.roles.remove(process.env.PLAYER_ROLE_ID);
                await targetMember.roles.add(process.env.CAPTAIN_ROLE_ID);
                await targetMember.setNickname(`|C| ${targetMember.user.username}`).catch(err => console.error(`Fallo al cambiar apodo de Capitán: ${err.message}`));
                await interaction.update({ content: `✅ **${targetMember.user.username}** ha sido ascendido a Capitán.`, components: [] });
            }
            else if (customId.startsWith('demote_captain_')) {
                const team = await Team.findOne({ guildId: interaction.guildId, managerId: interaction.user.id });
                if (!team) return interaction.reply({ content: 'Solo el mánager puede degradar.', ephemeral: true });
                const targetId = customId.split('_')[2];
                team.captains = team.captains.filter(c => c !== targetId);
                team.players.push(targetId);
                await team.save();
                const targetMember = await interaction.guild.members.fetch(targetId);
                await targetMember.roles.remove(process.env.CAPTAIN_ROLE_ID);
                await targetMember.roles.add(process.env.PLAYER_ROLE_ID);
                if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(targetMember.user.username).catch(err => console.error(`Fallo al cambiar apodo a Jugador: ${err.message}`));
                await interaction.update({ content: `✅ **${targetMember.user.username}** ha sido degradado a Jugador.`, components: [] });
            }
            else if (customId.startsWith('kick_player_')) {
                const team = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: interaction.user.id }, { captains: interaction.user.id }] });
                if (!team) return interaction.reply({ content: 'No tienes permiso para expulsar.', ephemeral: true });
                const targetId = customId.split('_')[2];
                const isTargetCaptain = team.captains.includes(targetId);
                const isManager = team.managerId === interaction.user.id;
                if (isTargetCaptain && !isManager) return interaction.update({ content: '❌ Los capitanes no pueden expulsar a otros capitanes.', components: [] });
                team.players = team.players.filter(p => p !== targetId);
                team.captains = team.captains.filter(c => c !== targetId);
                await team.save();
                const targetMember = await interaction.guild.members.fetch(targetId);
                await targetMember.roles.remove([process.env.PLAYER_ROLE_ID, process.env.CAPTAIN_ROLE_ID]).catch(() => {});
                if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(targetMember.user.username).catch(err => console.error(`Fallo al resetear apodo: ${err.message}`));
                await interaction.update({ content: `✅ **${targetMember.user.username}** ha sido expulsado del equipo.`, components: [] });
            }
        } 
        
        else if (interaction.isStringSelectMenu()) {
            const customId = interaction.customId;
            if (customId === 'delete_league_select_menu') {
                if (!isAdmin) return interaction.reply({ content: 'Acción no permitida.', ephemeral: true });
                const selectedLeagues = interaction.values;
                await League.deleteMany({ guildId: interaction.guildId, name: { $in: selectedLeagues } });
                await interaction.update({ content: `✅ Ligas eliminadas con éxito: **${selectedLeagues.join(', ')}**`, components: [] });
            }
            else if (customId === 'view_team_roster_select') {
                const teamId = interaction.values[0];
                const team = await Team.findById(teamId);
                if (!team) return interaction.update({ content: 'Este equipo ya no existe.', components: [] });
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
                await interaction.update({ content: '', embeds: [embed], components: [] });
            }
            else if (customId === 'roster_management_menu') {
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
                if (!isTargetCaptain) row.addComponents(new ButtonBuilder().setCustomId(`toggle_mute_player_${team._id}_${targetId}`).setLabel(isMuted ? '🔊 Desmutear' : '🔇 Mutear').setStyle(isMuted ? ButtonStyle.Success : ButtonStyle.Secondary));
                if (isManager || !isTargetCaptain) row.addComponents(new ButtonBuilder().setCustomId(`kick_player_${targetId}`).setLabel('❌ Expulsar').setStyle(ButtonStyle.Danger));
                await interaction.reply({ content: `Gestionando a **${targetMember.user.username}**:`, components: [row], ephemeral: true });
            }
            else if (customId.startsWith('admin_roster_menu_')) {
                if(!isAdmin) return;
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
                await interaction.reply({ content: `Acciones de admin para **${targetMember.user.username}**:`, components: [row], ephemeral: true });
            }
        } 
        
        else if (interaction.isModalSubmit()) {
            const customId = interaction.customId;
            if (customId === 'create_league_modal') {
                if (!isAdmin) return interaction.reply({ content: 'Acción no permitida.', ephemeral: true });
                const leagueName = interaction.fields.getTextInputValue('leagueNameInput');
                const existing = await League.findOne({ name: leagueName, guildId: interaction.guildId });
                if (existing) return interaction.reply({ content: `La liga "${leagueName}" ya existe.`, ephemeral: true });
                const newLeague = new League({ name: leagueName, guildId: interaction.guildId });
                await newLeague.save();
                await interaction.reply({ content: `✅ Liga "${leagueName}" creada con éxito.`, ephemeral: true });
            }
            else if (customId.startsWith('admin_edit_')) {
                const parts = customId.split('_');
                const action = parts[2];
                const teamId = parts[3];
                const newValue = interaction.fields.getTextInputValue('newValue');
                const update = {};
                update[action === 'name' ? 'name' : 'logoUrl'] = newValue;
                await Team.findByIdAndUpdate(teamId, { $set: update });
                await interaction.reply({ content: `✅ El ${action === 'name' ? 'nombre' : 'logo'} del equipo ha sido actualizado.`, ephemeral: true });
            }
            else if (customId.startsWith('admin_assign_manager_modal_')) {
                const teamId = customId.split('_')[4];
                const newManagerId = interaction.fields.getTextInputValue('userId');
                try {
                    const newManagerMember = await interaction.guild.members.fetch(newManagerId);
                    const team = await Team.findById(teamId);
                    team.managerId = newManagerId;
                    await team.save();
                    await newManagerMember.roles.add(process.env.MANAGER_ROLE_ID);
                    if (newManagerMember.id !== interaction.guild.ownerId) await newManagerMember.setNickname(`|MG| ${newManagerMember.user.username}`).catch(()=>{});
                    await interaction.reply({ content: `✅ **${newManagerMember.user.tag}** es ahora el nuevo Mánager de **${team.name}**.`, ephemeral: true });
                } catch (e) {
                    await interaction.reply({ content: `Error: No se pudo encontrar o asignar al usuario con ID ${newManagerId}.`, ephemeral: true });
                }
            }
            else if (customId === 'manager_request_modal') {
                const vpgUsername = interaction.fields.getTextInputValue('vpgUsername');
                const teamName = interaction.fields.getTextInputValue('teamName');
                const teamAbbr = interaction.fields.getTextInputValue('teamAbbr');
                const leagueName = interaction.fields.getTextInputValue('leagueSelect');
                const approvalChannel = await client.channels.fetch(process.env.APPROVAL_CHANNEL_ID);
                if (!approvalChannel) return interaction.reply({ content: 'Error: Canal de aprobaciones no encontrado.', ephemeral: true });
                const embed = new EmbedBuilder().setTitle('Nueva Solicitud de Mánager').setColor('#f1c40f').addFields({ name: 'Solicitante', value: `<@${interaction.user.id}> (${interaction.user.tag})` }, { name: 'Usuario VPG', value: vpgUsername }, { name: 'Nombre del Equipo', value: teamName }, { name: 'Abreviatura', value: teamAbbr }, { name: 'Liga', value: leagueName }).setTimestamp();
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`approve_request_${interaction.user.id}_${teamName}`).setLabel("✅ Aprobar").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`reject_request_${interaction.user.id}`).setLabel("❌ Rechazar").setStyle(ButtonStyle.Danger));
                await approvalChannel.send({ embeds: [embed], components: [row] });
                await interaction.reply({ content: 'Tu solicitud ha sido enviada para revisión.', ephemeral: true });
            } 
            else if (customId.startsWith('player_join_modal_')) {
                const teamId = customId.split('_')[2];
                const team = await Team.findById(teamId);
                if (!team) return interaction.reply({ content: 'Error: El equipo ya no existe.', ephemeral: true });
                const vpgUsername = interaction.fields.getTextInputValue('vpgUsername');
                const position = interaction.fields.getTextInputValue('positionSelect');
                await VPGUser.findOneAndUpdate({ discordId: interaction.user.id }, { discordId: interaction.user.id, vpgUsername, position, teamName: team.name, isManager: false, lastUpdated: new Date() }, { upsert: true, new: true });
                team.players.push(interaction.user.id);
                await team.save();
                await interaction.member.roles.add(process.env.PLAYER_ROLE_ID);
                if (interaction.member.id !== interaction.guild.ownerId) await interaction.member.setNickname(interaction.user.username).catch(err => console.error(`Fallo al cambiar apodo de Jugador: ${err.message}`));
                await interaction.reply({ content: `¡Felicidades! Te has unido a **${team.name}** como ${position}.`, ephemeral: true });
                const manager = await client.users.fetch(team.managerId);
                await manager.send(`✅ **${interaction.user.username}** (Usuario VPG: ${vpgUsername}) ha aceptado tu invitación a **${team.name}** y jugará de ${position}.`);
                interaction.message.delete().catch(() => {});
            }
            else if (customId.startsWith('approve_modal_')) {
                const applicantId = customId.split('_')[2];
                const originalRequestMessage = (await interaction.channel.messages.fetch({ limit: 100 })).find(msg => msg.embeds[0]?.fields[0]?.value.includes(applicantId) && !msg.components[0]?.components[0]?.disabled);
                if (!originalRequestMessage) return interaction.reply({ content: 'Error: No se pudo encontrar el mensaje de solicitud original.', ephemeral: true });
                const teamName = originalRequestMessage.embeds[0].fields.find(f => f.name === 'Nombre del Equipo').value;
                const teamAbbr = originalRequestMessage.embeds[0].fields.find(f => f.name === 'Abreviatura').value;
                const leagueName = originalRequestMessage.embeds[0].fields.find(f => f.name === 'Liga').value;
                const teamLogoUrl = interaction.fields.getTextInputValue('teamLogoUrl');
                let applicant;
                try {
                    applicant = await interaction.guild.members.fetch(applicantId);
                } catch (fetchError) {
                    return interaction.reply({ content: 'Error: No se pudo encontrar al miembro solicitante en el servidor.', ephemeral: true });
                }
                const existingTeam = await Team.findOne({ name: teamName, guildId: interaction.guildId });
                if (existingTeam) return interaction.reply({ content: `Error: Ya existe un equipo llamado **${teamName}**.`, ephemeral: true });
                const isAlreadyManaged = await Team.findOne({ managerId: applicant.id });
                if (isAlreadyManaged) return interaction.reply({ content: `Error: Este usuario ya es mánager del equipo **${isAlreadyManaged.name}**.`, ephemeral: true });
                const newTeam = new Team({ name: teamName, abbreviation: teamAbbr, guildId: interaction.guildId, league: leagueName, logoUrl: teamLogoUrl, managerId: applicant.id });
                await newTeam.save();
                await applicant.roles.add(process.env.MANAGER_ROLE_ID);
                if (applicant.id !== interaction.guild.ownerId) {
                    try {
                        await applicant.setNickname(`|MG| ${applicant.user.username}`);
                    } catch (nicknameError) {
                        console.error(`FALLO AL CAMBIAR APODO: ${nicknameError.message}`);
                    }
                }
                const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(originalRequestMessage.components[0].components[0]).setDisabled(true).setLabel('Aprobado'), ButtonBuilder.from(originalRequestMessage.components[0].components[1]).setDisabled(true));
                await originalRequestMessage.edit({ components: [disabledRow] });
                await interaction.reply({ content: `¡Equipo **${teamName}** aprobado! **${applicant.user.tag}** es ahora Mánager.`, ephemeral: false });
                await applicant.send(`¡Felicidades! Tu equipo **${teamName}** ha sido APROBADO.`).catch(() => {});
            }
        }
    } catch (error) {
        console.error("Fallo crítico de interacción:", error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'Ha ocurrido un error al procesar tu solicitud.', ephemeral: true }).catch(()=>{});
        } else {
            await interaction.reply({ content: 'Ha ocurrido un error al procesar tu solicitud.', ephemeral: true }).catch(()=>{});
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
