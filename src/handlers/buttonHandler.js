// src/handlers/buttonHandler.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Team = require('../models/team.js');
const League = require('../models/league.js');
const PlayerApplication = require('../models/playerApplication.js');
const AvailabilityPanel = require('../models/availabilityPanel.js');
const VPGUser = require('../models/user.js');

module.exports = async (client, interaction) => {
    const { customId, member, guild, user } = interaction;
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
    const esAprobador = isAdmin || member.roles.cache.has(process.env.APPROVER_ROLE_ID);

    // ======================================================================
    // == SECCIÓN 1: BOTONES QUE ABREN UN MODAL (RESPUESTA INSTANTÁNEA)   ==
    // ======================================================================
    
    if (customId === 'request_manager_role_button') {
        const existingTeam = await Team.findOne({ $or: [{ managerId: user.id }, { captains: user.id }, { players: user.id }], guildId: guild.id });
        if (existingTeam) return interaction.reply({ content: `Ya perteneces al equipo **${existingTeam.name}**.`, ephemeral: true });
        
        const modal = new ModalBuilder().setCustomId('manager_request_modal').setTitle('Formulario de Solicitud de Mánager');
        const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsername').setLabel("Tu nombre de usuario en VPG").setStyle(TextInputStyle.Short).setRequired(true);
        const teamNameInput = new TextInputBuilder().setCustomId('teamName').setLabel("Nombre de tu equipo").setStyle(TextInputStyle.Short).setRequired(true);
        const teamAbbrInput = new TextInputBuilder().setCustomId('teamAbbr').setLabel("Abreviatura (3 letras)").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3).setMaxLength(3);
        modal.addComponents(new ActionRowBuilder().addComponents(vpgUsernameInput), new ActionRowBuilder().addComponents(teamNameInput), new ActionRowBuilder().addComponents(teamAbbrInput));
        return interaction.showModal(modal);
    }
    
    if (customId === 'admin_create_league_button') {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });
        const modal = new ModalBuilder().setCustomId('create_league_modal').setTitle('Crear Nueva Liga');
        const leagueNameInput = new TextInputBuilder().setCustomId('leagueNameInput').setLabel("Nombre de la nueva liga").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(leagueNameInput));
        return interaction.showModal(modal);
    }

    if (customId.startsWith('admin_dissolve_team_')) {
        if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });
        const teamId = customId.split('_')[3];
        const team = await Team.findById(teamId);
        if (!team) return interaction.reply({ content: 'Equipo no encontrado.', ephemeral: true });
        const modal = new ModalBuilder().setCustomId(`confirm_dissolve_modal_${teamId}`).setTitle(`Disolver Equipo: ${team.name}`);
        const confirmationInput = new TextInputBuilder().setCustomId('confirmation_text').setLabel(`Escribe "${team.name}" para confirmar`).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(team.name);
        modal.addComponents(new ActionRowBuilder().addComponents(confirmationInput));
        return interaction.showModal(modal);
    }

    if (customId.startsWith('approve_request_')) {
        if (!esAprobador) return interaction.reply({ content: 'No tienes permiso.', ephemeral: true });
        const parts = customId.split('_');
        const applicantId = parts[2];
        const teamName = parts.slice(3).join(' ').replace(/-/g, ' ');
        const modal = new ModalBuilder().setCustomId(`approve_modal_${applicantId}_${teamName}`).setTitle(`Aprobar Equipo: ${teamName}`);
        const teamLogoInput = new TextInputBuilder().setCustomId('teamLogoUrl').setLabel("URL del Escudo del Equipo").setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(teamLogoInput));
        return interaction.showModal(modal);
    }
    
    // ======================================================================
    // == SECCIÓN 2: BOTONES QUE ACTUALIZAN UN MENSAJE (DEFERUPDATE)     ==
    // ======================================================================

    if (customId.startsWith('reject_request_') || customId.startsWith('accept_application_') || customId.startsWith('reject_application_') || customId.startsWith('promote_player_') || customId.startsWith('demote_captain_') || customId.startsWith('kick_player_') || customId.startsWith('toggle_mute_player_')) {
        await interaction.deferUpdate();
        
        if (customId.startsWith('reject_request_')) {
            if (!esAprobador) return interaction.followUp({ content: 'No tienes permiso.', ephemeral: true });
            const applicantId = customId.split('_')[2];
            const applicant = await guild.members.fetch(applicantId).catch(()=>null);
            const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true), ButtonBuilder.from(interaction.message.components[0].components[1]).setDisabled(true));
            await interaction.message.edit({ components: [disabledRow] });
            await interaction.followUp({ content: `La solicitud de **${applicant ? applicant.user.tag : 'un usuario'}** ha sido rechazada.`, ephemeral: true });
            if (applicant) await applicant.send(`Tu solicitud para registrar un equipo ha sido rechazada.`).catch(() => {});
        }
        
        if (customId.startsWith('accept_application_') || customId.startsWith('reject_application_')) {
            const applicationId = customId.split('_')[2];
            const application = await PlayerApplication.findById(applicationId).populate('teamId');
            if(!application || application.status !== 'pending') return interaction.editReply({ content: 'Esta solicitud ya no es válida o ya ha sido gestionada.', components: [], embeds: [] });
            const applicantUser = await client.users.fetch(application.userId).catch(()=>null);
            if (customId.startsWith('accept_application_')) {
                application.status = 'accepted';
                if (applicantUser) {
                    const targetGuild = await client.guilds.fetch(application.teamId.guildId);
                    const applicantMember = await targetGuild.members.fetch(application.userId).catch(()=>null);
                    if (applicantMember) {
                        await applicantMember.roles.add(process.env.PLAYER_ROLE_ID);
                        await applicantMember.setNickname(`${application.teamId.abbreviation} ${applicantUser.username}`).catch(()=>{});
                        application.teamId.players.push(applicantUser.id);
                    }
                    await applicantUser.send(`¡Enhorabuena! Tu solicitud para unirte a **${application.teamId.name}** ha sido **aceptada**.`);
                }
                await interaction.editReply({ content: `Has aceptado a ${applicantUser ? applicantUser.tag : 'un usuario'} en tu equipo.`, components: [], embeds: [] });
            } else { // Rechazar
                application.status = 'rejected';
                if(applicantUser) await applicantUser.send(`Lo sentimos, tu solicitud para unirte a **${application.teamId.name}** ha sido **rechazada**.`);
                await interaction.editReply({ content: `Has rechazado la solicitud de ${applicantUser ? applicantUser.tag : 'un usuario'}.`, components: [], embeds: [] });
            }
            await application.teamId.save();
            await application.save();
        }

        if(customId.startsWith('promote_player_') || customId.startsWith('demote_captain_') || customId.startsWith('kick_player_') || customId.startsWith('toggle_mute_player_')) {
            const targetId = customId.substring(customId.lastIndexOf('_') + 1);
            const team = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: user.id }, { captains: user.id }] });
            if(!team) return interaction.editReply({ content: 'No tienes permisos sobre este equipo.', components: []});
            const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
            if(!targetMember) return interaction.editReply({ content: 'Miembro no encontrado.', components: []});
            const isManagerAction = team.managerId === user.id;

            if(customId.startsWith('kick_player_')) {
                const isTargetCaptain = team.captains.includes(targetId);
                if(isTargetCaptain && !isManagerAction) return interaction.editReply({content: 'Un capitán no puede expulsar a otro capitán.', components: []});
                team.players = team.players.filter(p => p !== targetId);
                team.captains = team.captains.filter(c => c !== targetId);
                await targetMember.roles.remove([process.env.PLAYER_ROLE_ID, process.env.CAPTAIN_ROLE_ID, process.env.MUTED_ROLE_ID]).catch(() => {});
                if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(targetMember.user.username).catch(()=>{});
                await interaction.editReply({ content: `✅ **${targetMember.user.username}** ha sido expulsado del equipo.`, components: [] });
            } else if (customId.startsWith('promote_player_')) {
                if(!isManagerAction) return interaction.editReply({content: 'Solo el Mánager puede ascender.', components: []});
                team.players = team.players.filter(p => p !== targetId);
                team.captains.push(targetId);
                await targetMember.roles.remove(process.env.PLAYER_ROLE_ID);
                await targetMember.roles.add(process.env.CAPTAIN_ROLE_ID);
                if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(`|C| ${team.abbreviation} ${targetMember.user.username}`).catch(()=>{});
                await interaction.editReply({ content: `✅ **${targetMember.user.username}** ha sido ascendido a Capitán.`, components: [] });
            } else if (customId.startsWith('demote_captain_')) {
                if(!isManagerAction) return interaction.editReply({content: 'Solo el Mánager puede degradar.', components: []});
                team.captains = team.captains.filter(c => c !== targetId);
                team.players.push(targetId);
                await targetMember.roles.remove(process.env.CAPTAIN_ROLE_ID);
                await targetMember.roles.add(process.env.PLAYER_ROLE_ID);
                if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(`${team.abbreviation} ${targetMember.user.username}`).catch(()=>{});
                await interaction.editReply({ content: `✅ **${targetMember.user.username}** ha sido degradado a Jugador.`, components: [] });
            } else if (customId.startsWith('toggle_mute_player_')) {
                if(team.captains.includes(targetId) && !isManagerAction) return interaction.editReply({ content: 'No puedes mutear a un capitán.', components: [] });
                const hasMutedRole = targetMember.roles.cache.has(process.env.MUTED_ROLE_ID);
                if (hasMutedRole) {
                    await targetMember.roles.remove(process.env.MUTED_ROLE_ID);
                    await interaction.editReply({ content: `✅ **${targetMember.user.username}** ha sido desmuteado.`, components: [] });
                } else {
                    await targetMember.roles.add(process.env.MUTED_ROLE_ID);
                    await interaction.editReply({ content: `🔇 **${targetMember.user.username}** ha sido muteado.`, components: [] });
                }
            }
            await team.save();
        }
        return; 
    }
    
    // ======================================================================
    // == SECCIÓN 3: BOTONES QUE ENVÍAN RESPUESTAS PRIVADAS (DEFERREPLY)   ==
    // ======================================================================
    
    await interaction.deferReply({ ephemeral: true });

    if (customId === 'view_teams_button') {
        const teams = await Team.find({ guildId: guild.id }).limit(25).sort({ name: 1 });
        if (teams.length === 0) return interaction.editReply({ content: 'No hay equipos registrados.' });
        const teamOptions = teams.map(t => ({ label: `${t.name} (${t.abbreviation})`, value: t._id.toString() }));
        const selectMenu = new StringSelectMenuBuilder().setCustomId('view_team_roster_select').setPlaceholder('Selecciona un equipo').addOptions(teamOptions);
        return interaction.editReply({ content: 'Elige un equipo:', components: [new ActionRowBuilder().addComponents(selectMenu)] });
    }

    if (customId === 'apply_to_team_button') {
        const existingApplication = await PlayerApplication.findOne({ userId: user.id, status: 'pending' });
        if (existingApplication) return interaction.editReply({ content: 'Ya tienes una solicitud de aplicación pendiente.' });
        const openTeams = await Team.find({ guildId: guild.id, recruitmentOpen: true }).sort({ name: 1 });
        if (openTeams.length === 0) return interaction.editReply({ content: 'No hay equipos con reclutamiento abierto.' });
        const teamOptions = openTeams.map(t => ({ label: t.name, value: t._id.toString() }));
        const selectMenu = new StringSelectMenuBuilder().setCustomId('apply_to_team_select').setPlaceholder('Elige un equipo').addOptions(teamOptions);
        return interaction.editReply({ content: 'Selecciona el equipo al que quieres aplicar:', components: [new ActionRowBuilder().addComponents(selectMenu)] });
    }

    if (customId === 'leave_team_button') {
        const teamToLeave = await Team.findOne({ guildId: guild.id, $or: [{ captains: user.id }, { players: user.id }] });
        if (!teamToLeave) return interaction.editReply({ content: 'No perteneces a un equipo como jugador o capitán.' });
        teamToLeave.players = teamToLeave.players.filter(p => p !== user.id);
        teamToLeave.captains = teamToLeave.captains.filter(c => c !== user.id);
        await teamToLeave.save();
        await member.roles.remove([process.env.PLAYER_ROLE_ID, process.env.CAPTAIN_ROLE_ID, process.env.MUTED_ROLE_ID]).catch(() => {});
        if (member.id !== guild.ownerId) await member.setNickname(user.username).catch(()=>{});
        await interaction.editReply({ content: `Has abandonado el equipo **${teamToLeave.name}**.` });
        const manager = await client.users.fetch(teamToLeave.managerId).catch(() => null);
        if (manager) await manager.send(`El jugador **${user.tag}** ha abandonado tu equipo.`);
        return;
    }

    if (customId === 'admin_delete_league_button') {
        if (!isAdmin) return interaction.editReply({content: 'Acción restringida.'});
        const leagues = await League.find({ guildId: guild.id });
        if (leagues.length === 0) return interaction.editReply({ content: 'No hay ligas para borrar.' });
        const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));
        const selectMenu = new StringSelectMenuBuilder().setCustomId('delete_league_select_menu').setPlaceholder('Selecciona las ligas a eliminar').addOptions(leagueOptions).setMinValues(1).setMaxValues(leagues.length);
        return interaction.editReply({ content: 'Selecciona del menú las ligas que quieres borrar:', components: [new ActionRowBuilder().addComponents(selectMenu)] });
    }

    if (customId === 'admin_manage_team_button') {
        if (!isAdmin) return interaction.editReply({content: 'Acción restringida.'});
        const teams = await Team.find({ guildId: interaction.guildId }).limit(25).sort({ name: 1 });
        if (teams.length === 0) return interaction.editReply({ content: 'No hay equipos registrados para gestionar.' });
        const teamOptions = teams.map(t => ({ label: `${t.name} (${t.abbreviation})`, value: t._id.toString() }));
        const selectMenu = new StringSelectMenuBuilder().setCustomId('admin_select_team_to_manage').setPlaceholder('Selecciona un equipo para gestionar').addOptions(teamOptions);
        return interaction.editReply({ content: 'Selecciona el equipo que deseas gestionar desde el menú:', components: [new ActionRowBuilder().addComponents(selectMenu)] });
    }

    if (customId === 'admin_view_pending_requests') {
        if (!isAdmin) return interaction.editReply({content: 'Acción restringida.'});
        const approvalChannelId = process.env.APPROVAL_CHANNEL_ID;
        if (!approvalChannelId) return interaction.editReply({ content: 'El canal de aprobaciones no está configurado.' });
        const embed = new EmbedBuilder().setTitle('⏳ Solicitudes Pendientes').setColor('Yellow').setDescription(`Esta función te recuerda que debes revisar el canal de aprobaciones. Todas las solicitudes aparecen en <#${approvalChannelId}>.`);
        return interaction.editReply({ embeds: [embed] });
    }
    
    // --- Lógica del Panel de Equipo ---
    const userTeam = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
    if (!userTeam) return interaction.editReply({content: 'Debes ser mánager o capitán para usar este botón.'});
    
    if (customId === 'team_toggle_recruitment_button') {
        if (userTeam.managerId !== user.id) return interaction.editReply({ content: 'Solo los mánagers pueden cambiar el estado de reclutamiento.' });
        userTeam.recruitmentOpen = !userTeam.recruitmentOpen;
        await userTeam.save();
        return interaction.editReply({ content: `El reclutamiento de tu equipo ahora está **${userTeam.recruitmentOpen ? 'ABIERTO' : 'CERRADO'}**.` });
    }

    if (customId === 'delete_friendly_panel') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`confirm_delete_panel_SCHEDULED_${userTeam._id}`).setLabel('Borrar Panel Programado').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`confirm_delete_panel_INSTANT_${userTeam._id}`).setLabel('Borrar Panel Instantáneo').setStyle(ButtonStyle.Danger)
        );
        return interaction.editReply({ content: '¿Qué tipo de búsqueda de amistoso quieres borrar?', components: [row] });
    }
    
    if (customId.startsWith('confirm_delete_panel_')) {
        const parts = customId.split('_');
        const panelType = parts[3];
        const teamId = parts[4];
        if(userTeam._id.toString() !== teamId) return interaction.editReply({content: "No puedes borrar el panel de otro equipo."});
        const existingPanel = await AvailabilityPanel.findOneAndDelete({ teamId: userTeam._id, panelType });
        if (!existingPanel) return interaction.editReply({ content: `Tu equipo no tiene un panel de tipo **${panelType}** activo.` });
        try {
            const channel = await client.channels.fetch(existingPanel.channelId);
            const message = await channel.messages.fetch(existingPanel.messageId);
            await message.delete();
        } catch(e) { /* No hacer nada si el mensaje ya no existe */ }
        return interaction.editReply({ content: `✅ Tu panel de amistosos de tipo **${panelType}** ha sido eliminado.` });
    }
};
