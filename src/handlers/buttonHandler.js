// src/handlers/buttonHandler.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Team = require('../models/team.js');
const League = require('../models/league.js');
const PlayerApplication = require('../models/playerApplication.js');
const AvailabilityPanel = require('../models/availabilityPanel.js');
const VPGUser = require('../models/user.js');

async function getOrCreateWebhook(channel, client) {
    const webhooks = await channel.fetchWebhooks();
    let webhook = webhooks.find(wh => wh.owner.id === client.user.id && wh.name.startsWith('VPG Bot'));
    if (!webhook) {
        webhook = await channel.createWebhook({ name: `VPG Bot Amistosos`, avatar: client.user.displayAvatarURL() });
    }
    return webhook;
}

async function buildPanel(panelData) {
    const { team, postedById, timeSlots, _id, allowedLeagues, panelType } = panelData;
    
    let description = panelType === 'SCHEDULED' 
        ? `**Buscando rivales para los siguientes horarios:**\n\n*Contacto:* <@${postedById}>`
        : `**Buscando rival para jugar AHORA**\n\n*Contacto:* <@${postedById}>`;

    if (allowedLeagues && allowedLeagues.length > 0 && allowedLeagues[0]) {
        description += `\n*Filtro de Liga(s): ${allowedLeagues.join(', ')}*`;
    }

    const embed = new EmbedBuilder()
        .setColor(timeSlots.some(ts => ts.status === 'AVAILABLE') ? 'Green' : '#5865F2')
        .setAuthor({ name: team.name, iconURL: team.logoUrl });

    const components = [];
    let currentRow = new ActionRowBuilder();

    if (panelType === 'INSTANT') {
        const slot = timeSlots[0];
        if (slot.status === 'AVAILABLE') {
            embed.setDescription(description);
            currentRow.addComponents(new ButtonBuilder().setCustomId(`challenge_${_id}_${slot.time}`).setLabel(`⚔️ Desafiar Ahora`).setStyle(ButtonStyle.Success));
        } else { // CONFIRMED
            embed.setDescription(`**Partido Confirmado**\n\n<@${postedById}> (Anfitrión) vs <@${slot.challengerUserId}> (Rival)`);
            embed.addFields({ name: `⚔️ ${team.name} vs ${slot.challengerTeamName}`, value: `¡Partido en curso!` });
            currentRow.addComponents(new ButtonBuilder().setCustomId(`contact_${postedById}_${slot.challengerUserId}`).setLabel(`Contactar por MD`).setStyle(ButtonStyle.Primary));
            currentRow.addComponents(new ButtonBuilder().setCustomId(`cancel_match_${_id}_${slot.time}`).setLabel('Expulsar Rival').setStyle(ButtonStyle.Danger));
        }
    } else { // SCHEDULED
        embed.setDescription(description);
        for (const slot of timeSlots) {
            if (slot.status === 'AVAILABLE') {
                embed.addFields({ name: `🕕 ${slot.time}`, value: `✅ **DISPONIBLE**`, inline: true });
                if (currentRow.components.length >= 5) {
                    components.push(currentRow);
                    currentRow = new ActionRowBuilder();
                }
                currentRow.addComponents(new ButtonBuilder().setCustomId(`challenge_${_id}_${slot.time}`).setLabel(`⚔️ ${slot.time}`).setStyle(ButtonStyle.Success));
            } else { // CONFIRMED
                embed.addFields({ name: `🕕 ${slot.time}`, value: `**VS ${slot.challengerTeamName}**`, inline: true });
            }
        }
        if (currentRow.components.length > 0) {
            components.push(currentRow);
        }
        const confirmedSlots = timeSlots.filter(s => s.status === 'CONFIRMED');
        if(confirmedSlots.length > 0) {
            let confirmedRow = new ActionRowBuilder();
            for(const slot of confirmedSlots) {
                if (confirmedRow.components.length >= 4) {
                    components.push(confirmedRow);
                    confirmedRow = new ActionRowBuilder();
                }
                confirmedRow.addComponents(new ButtonBuilder().setCustomId(`contact_${postedById}_${slot.challengerUserId}`).setLabel(`MDs (${slot.time})`).setStyle(ButtonStyle.Primary));
                confirmedRow.addComponents(new ButtonBuilder().setCustomId(`cancel_match_${_id}_${slot.time}`).setLabel(`Cancelar (${slot.time})`).setStyle(ButtonStyle.Danger));
            }
            components.push(confirmedRow);
        }
    }
    
    if (currentRow.components.length > 0 && panelType !== 'SCHEDULED') {
        components.push(currentRow);
    }
    
    return { embeds: [embed], components };
}

module.exports = async (client, interaction) => {
    // Si la interacción viene de un MD, no hay `member` ni `guild`.
    if (!interaction.inGuild()) {
        const { customId, user } = interaction;
        await interaction.deferUpdate();

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

        if (customId.startsWith('accept_challenge_') || customId.startsWith('reject_challenge_')) {
            const parts = customId.split('_');
            const panelId = parts[2];
            const time = parts[3];
            const challengerTeamId = parts[4];
            const challengerUserId = parts[5];

            const panel = await AvailabilityPanel.findById(panelId).populate('teamId');
            if(!panel) return interaction.editReply({ content: 'Este panel de amistosos ya no existe.', components: [] });
            
            const slot = panel.timeSlots.find(s => s.time === time);
            if (!slot || slot.status === 'CONFIRMED') return interaction.editReply({ content: 'Este horario ya ha sido confirmado o no existe.', components: [] });

            const challengerTeam = await Team.findById(challengerTeamId);
            const challengerUser = await client.users.fetch(challengerUserId);

            if (customId.startsWith('accept_challenge_')) {
                slot.status = 'CONFIRMED';
                slot.challengerTeamId = challengerTeamId;
                slot.challengerTeamName = challengerTeam.name;
                slot.challengerTeamLogo = challengerTeam.logoUrl;
                slot.challengerUserId = challengerUserId;
                await panel.save();

                await challengerUser.send(`✅ ¡Tu desafío ha sido **ACEPTADO**! Jugarás contra **${panel.teamId.name}** a las **${time}**.\nPuedes contactar con <@${panel.postedById}> usando los botones del panel público.`);
                await interaction.editReply({ content: `Has aceptado el desafío de **${challengerTeam.name}** para las **${time}**.`, components: [], embeds: [] });
                
                const originalChannel = await client.channels.fetch(panel.channelId);
                const originalMessage = await originalChannel.messages.fetch(panel.messageId);
                const panelContent = await buildPanel({ ...panel.toObject(), team: panel.teamId });
                await originalMessage.edit(panelContent);
            } else { // Rechazar
                await challengerUser.send(`❌ Tu desafío contra **${panel.teamId.name}** para las **${time}** ha sido rechazado.`);
                await interaction.editReply({ content: `Has rechazado el desafío de **${challengerTeam.name}**.`, components: [], embeds: [] });
            }
        }
        return; // Detiene la ejecución para interacciones en MDs
    }

    // A partir de aquí, todas las interacciones están garantizadas de ser de un servidor.
    const { customId, member, guild, user } = interaction;
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
    const esAprobador = isAdmin || member.roles.cache.has(process.env.APPROVER_ROLE_ID);
    // ======================================================================
    // SECCIÓN 1: BOTONES QUE ABREN UN MODAL (RESPUESTA INSTANTÁNEA)
    // ======================================================================
    
    if (customId.startsWith('challenge_') || customId === 'admin_create_league_button' || customId.startsWith('admin_dissolve_team_') || customId.startsWith('approve_request_') || customId.startsWith('admin_change_data_') || customId === 'team_edit_data_button' || customId === 'team_invite_player_button') {
        if (customId.startsWith('challenge_')) {
            const parts = customId.split('_');
            const panelId = parts[1];
            const time = parts[2];
            const challengerTeam = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
            if (!challengerTeam) return interaction.reply({ content: 'Debes ser mánager o capitán para desafiar.', ephemeral: true });
            const modal = new ModalBuilder().setCustomId(`challenge_modal_${panelId}_${time}_${challengerTeam._id}`).setTitle(`Desafiar a las ${time}`);
            const presentationInput = new TextInputBuilder().setCustomId('presentation').setLabel('Mensaje para el rival (opcional)').setStyle(TextInputStyle.Short).setRequired(false);
            modal.addComponents(new ActionRowBuilder().addComponents(presentationInput));
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
            const leagueName = parts[3];
            const modal = new ModalBuilder().setCustomId(`approve_modal_${applicantId}_${leagueName}`).setTitle(`Aprobar Equipo`);
            const teamLogoInput = new TextInputBuilder().setCustomId('teamLogoUrl').setLabel("URL del Escudo del Equipo").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(teamLogoInput));
            return interaction.showModal(modal);
        }
        if (customId.startsWith('admin_change_data_') || customId === 'team_edit_data_button') {
            let team;
            if (customId.startsWith('admin_change_data_')) {
                if (!isAdmin) return interaction.reply({ content: 'Acción restringida.', ephemeral: true });
                const teamId = customId.split('_')[3];
                team = await Team.findById(teamId);
            } else {
                team = await Team.findOne({ guildId: guild.id, managerId: user.id });
                if (!team) return interaction.reply({ content: 'Solo los mánagers pueden editar los datos.', ephemeral: true });
            }
            if (!team) return interaction.reply({ content: 'No se encontró el equipo.', ephemeral: true });
            const modal = new ModalBuilder().setCustomId(`edit_data_modal_${team._id}`).setTitle(`Editar Datos de ${team.name}`);
            const newNameInput = new TextInputBuilder().setCustomId('newName').setLabel("Nuevo Nombre (opcional)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.name);
            const newAbbrInput = new TextInputBuilder().setCustomId('newAbbr').setLabel("Nueva Abreviatura (opcional)").setStyle(TextInputStyle.Short).setRequired(false).setValue(team.abbreviation).setMinLength(3).setMaxLength(3);
            const newLogoInput = new TextInputBuilder().setCustomId('newLogo').setLabel("Nueva URL del Logo (opcional)").setStyle(TextInputStyle.Short).setRequired(false);
            modal.addComponents(new ActionRowBuilder().addComponents(newNameInput), new ActionRowBuilder().addComponents(newAbbrInput), new ActionRowBuilder().addComponents(newLogoInput));
            return interaction.showModal(modal);
        }
        if (customId === 'team_invite_player_button') {
            const team = await Team.findOne({ guildId: guild.id, managerId: user.id });
            if (!team) return interaction.reply({ content: 'Solo los mánagers pueden invitar.', ephemeral: true });
            const modal = new ModalBuilder().setCustomId(`invite_player_modal_${team._id}`).setTitle(`Invitar Jugador a ${team.name}`);
            const playerNameInput = new TextInputBuilder().setCustomId('playerName').setLabel("Nombre de usuario exacto del jugador").setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(playerNameInput));
            return interaction.showModal(modal);
        }
    }
    
    // ======================================================================
    // SECCIÓN 2: BOTONES QUE ACTUALIZAN UN MENSAJE (DEFERUPDATE)
    // ======================================================================

    if (customId.startsWith('reject_request_') || customId.startsWith('promote_player_') || customId.startsWith('demote_captain_') || customId.startsWith('kick_player_') || customId.startsWith('toggle_mute_player_') || customId.startsWith('cancel_match_')) {
        await interaction.deferUpdate();
        
        if(customId.startsWith('cancel_match_')) {
            const parts = customId.split('_');
            const panelId = parts[2];
            const time = parts[3];
            const panel = await AvailabilityPanel.findById(panelId).populate('teamId');
            if (!panel) return interaction.followUp({ content: 'Este panel ya no existe.', ephemeral: true });
            const isHost = panel.postedById === user.id;
            const slot = panel.timeSlots.find(s => s.time === time);
            const isChallenger = slot && slot.challengerUserId === user.id;
            if (!isHost && !isChallenger) return interaction.followUp({ content: 'No tienes permiso para cancelar este partido.', ephemeral: true });
            
            const otherPlayerId = isHost ? slot.challengerUserId : panel.postedById;
            const otherPlayer = await client.users.fetch(otherPlayerId);
            await otherPlayer.send(`🚨 El partido contra **${isHost ? panel.teamId.name : slot.challengerTeamName}** para las **${time}** ha sido **cancelado** por tu rival.`);
            
            slot.status = 'AVAILABLE';
            slot.challengerTeamId = null;
            slot.challengerTeamName = null;
            slot.challengerTeamLogo = null;
            slot.challengerUserId = null;
            await panel.save();

            const originalChannel = await client.channels.fetch(panel.channelId);
            const originalMessage = await originalChannel.messages.fetch(panel.messageId);
            const panelContent = await buildPanel({ ...panel.toObject(), team: panel.teamId });
            await originalMessage.edit(panelContent);
            return interaction.followUp({ content: `Has cancelado el partido de las **${time}**. El horario vuelve a estar disponible.`, ephemeral: true });
        }

        if (customId.startsWith('reject_request_')) {
            if (!esAprobador) return interaction.followUp({ content: 'No tienes permiso.', ephemeral: true });
            const applicantId = customId.split('_')[2];
            const applicant = await guild.members.fetch(applicantId).catch(()=>null);
            const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true), ButtonBuilder.from(interaction.message.components[0].components[1]).setDisabled(true));
            await interaction.message.edit({ components: [disabledRow] });
            await interaction.followUp({ content: `La solicitud de **${applicant ? applicant.user.tag : 'un usuario'}** ha sido rechazada.`, ephemeral: true });
            if (applicant) await applicant.send(`Tu solicitud para registrar un equipo ha sido rechazada.`).catch(() => {});
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
                await interaction.editReply({ content: `✅ **${targetMember.user.username}** ha sido expulsado.`, components: [] });
            } else if (customId.startsWith('promote_player_')) {
                if(!isManagerAction) return interaction.editReply({content: 'Solo el Mánager puede ascender.', components: []});
                team.players = team.players.filter(p => p !== targetId);
                team.captains.push(targetId);
                await targetMember.roles.remove(process.env.PLAYER_ROLE_ID);
                await targetMember.roles.add(process.env.CAPTAIN_ROLE_ID);
                if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(`|C| ${team.abbreviation} ${targetMember.user.username}`).catch(()=>{});
                await interaction.editReply({ content: `✅ **${targetMember.user.username}** ascendido a Capitán.`, components: [] });
            } else if (customId.startsWith('demote_captain_')) {
                if(!isManagerAction) return interaction.editReply({content: 'Solo el Mánager puede degradar.', components: []});
                team.captains = team.captains.filter(c => c !== targetId);
                team.players.push(targetId);
                await targetMember.roles.remove(process.env.CAPTAIN_ROLE_ID);
                await targetMember.roles.add(process.env.PLAYER_ROLE_ID);
                if (targetMember.id !== interaction.guild.ownerId) await targetMember.setNickname(`${team.abbreviation} ${targetMember.user.username}`).catch(()=>{});
                await interaction.editReply({ content: `✅ **${targetMember.user.username}** degradado a Jugador.`, components: [] });
            } else if (customId.startsWith('toggle_mute_player_')) {
                if(team.captains.includes(targetId) && !isManagerAction) return interaction.editReply({ content: 'No puedes mutear a un capitán.', components: [] });
                const hasMutedRole = targetMember.roles.cache.has(process.env.MUTED_ROLE_ID);
                if (hasMutedRole) {
                    await targetMember.roles.remove(process.env.MUTED_ROLE_ID);
                    await interaction.editReply({ content: `✅ **${targetMember.user.username}** desmuteado.`, components: [] });
                } else {
                    await targetMember.roles.add(process.env.MUTED_ROLE_ID);
                    await interaction.editReply({ content: `🔇 **${targetMember.user.username}** muteado.`, components: [] });
                }
            }
            await team.save();
        }
        return; 
    }
        // ======================================================================
    // SECCIÓN 3: BOTONES QUE ENVÍAN RESPUESTAS PRIVADAS (DEFERREPLY)
    // ======================================================================
    
    await interaction.deferReply({ ephemeral: true });

    if (customId === 'request_manager_role_button') {
        const existingTeam = await Team.findOne({ $or: [{ managerId: user.id }, { captains: user.id }, { players: user.id }], guildId: guild.id });
        if (existingTeam) return interaction.editReply({ content: `Ya perteneces al equipo **${existingTeam.name}**.` });
        const leagues = await League.find({ guildId: guild.id });
        if(leagues.length === 0) return interaction.editReply({ content: 'No hay ligas configuradas.' });
        const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));
        const selectMenu = new StringSelectMenuBuilder().setCustomId('select_league_for_registration').setPlaceholder('Selecciona la liga').addOptions(leagueOptions);
        return interaction.editReply({ content: 'Selecciona la liga para tu equipo:', components: [new ActionRowBuilder().addComponents(selectMenu)]});
    }

    if (customId === 'view_teams_button' || customId === 'team_view_roster_button') {
        let teamToView;
        if(customId === 'team_view_roster_button') {
             teamToView = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }, { players: user.id }] });
             if (!teamToView) return interaction.editReply({ content: 'No perteneces a ningún equipo.' });
             
             const allMemberIds = [teamToView.managerId, ...teamToView.captains, ...teamToView.players].filter(id => id);
             if (allMemberIds.length === 0) return interaction.editReply({ content: 'Tu equipo no tiene miembros.' });
             
             const memberProfiles = await VPGUser.find({ discordId: { $in: allMemberIds } }).lean();
             const memberMap = new Map(memberProfiles.map(p => [p.discordId, p]));
             let rosterString = '';
             const fetchMemberInfo = async (ids, roleName) => {
                 if (!ids || ids.length === 0) return;
                 rosterString += `\n**${roleName}**\n`;
                 for (const memberId of ids) {
                     try {
                        const memberData = await guild.members.fetch(memberId);
                        const vpgUser = memberMap.get(memberId)?.vpgUsername || 'N/A';
                        rosterString += `> ${memberData.user.username} (${vpgUser})\n`;
                     } catch (error) { rosterString += `> *Usuario no encontrado (ID: ${memberId})*\n`; }
                 }
             };
             await fetchMemberInfo([teamToView.managerId].filter(Boolean), '👑 Mánager');
             await fetchMemberInfo(teamToView.captains, '🛡️ Capitanes');
             await fetchMemberInfo(teamToView.players, 'Jugadores');
             const embed = new EmbedBuilder().setTitle(`Plantilla de ${teamToView.name}`).setDescription(rosterString.trim() || 'Este equipo no tiene miembros.').setColor('#3498db').setThumbnail(teamToView.logoUrl).setFooter({ text: `Liga: ${teamToView.league}` });
             return interaction.editReply({ embeds: [embed] });
        } else {
            const teams = await Team.find({ guildId: guild.id }).limit(25).sort({ name: 1 });
            if (teams.length === 0) return interaction.editReply({ content: 'No hay equipos registrados.' });
            const teamOptions = teams.map(t => ({ label: `${t.name} (${t.abbreviation})`, value: t._id.toString() }));
            const selectMenu = new StringSelectMenuBuilder().setCustomId('view_team_roster_select').setPlaceholder('Selecciona un equipo').addOptions(teamOptions);
            return interaction.editReply({ content: 'Elige un equipo:', components: [new ActionRowBuilder().addComponents(selectMenu)] });
        }
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
        const selectMenu = new StringSelectMenuBuilder().setCustomId('admin_select_team_to_manage').setPlaceholder('Selecciona un equipo').addOptions(teamOptions);
        return interaction.editReply({ content: 'Selecciona el equipo que deseas gestionar:', components: [new ActionRowBuilder().addComponents(selectMenu)] });
    }

    if (customId.startsWith('admin_manage_members_') || customId === 'team_manage_roster_button') {
        let teamToManage;
        if (customId.startsWith('admin_manage_members_')) {
            if (!isAdmin) return interaction.editReply({ content: 'Acción restringida.' });
            const teamId = customId.split('_')[3];
            teamToManage = await Team.findById(teamId);
        } else {
            teamToManage = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        }
        if (!teamToManage) return interaction.editReply({ content: 'No se encontró el equipo o no tienes permisos.' });
        const memberIds = [teamToManage.managerId, ...teamToManage.captains, ...teamToManage.players].filter(id => id);
        if (memberIds.length === 0) return interaction.editReply({ content: 'Este equipo no tiene miembros.' });
        const membersCollection = await guild.members.fetch({ user: memberIds });
        const memberOptions = membersCollection.map(member => {
            let description = 'Jugador';
            if (teamToManage.managerId === member.id) description = 'Mánager';
            else if (teamToManage.captains.includes(member.id)) description = 'Capitán';
            return { label: member.user.username, description: description, value: member.id, };
        });
        if (memberOptions.length === 0) return interaction.editReply({ content: 'No se encontraron miembros válidos.' });
        const selectMenu = new StringSelectMenuBuilder().setCustomId('roster_management_menu').setPlaceholder('Selecciona un miembro').addOptions(memberOptions);
        return interaction.editReply({ content: 'Gestionando miembros de **' + teamToManage.name + '**:', components: [new ActionRowBuilder().addComponents(selectMenu)] });
    }

    if (customId === 'admin_view_pending_requests') {
        if (!isAdmin) return interaction.editReply({content: 'Acción restringida.'});
        const approvalChannelId = process.env.APPROVAL_CHANNEL_ID;
        if (!approvalChannelId) return interaction.editReply({ content: 'El canal de aprobaciones no está configurado.' });
        const embed = new EmbedBuilder().setTitle('⏳ Solicitudes Pendientes').setColor('Yellow').setDescription(`Revisa el canal <#${approvalChannelId}> para gestionar las solicitudes.`);
        return interaction.editReply({ embeds: [embed] });
    }
    
    const userTeam = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
    if (!userTeam && (customId.startsWith('team_') || customId.startsWith('post_') || customId.startsWith('delete_'))) return interaction.editReply({content: 'Debes ser mánager o capitán para usar este botón.'});
    
    if (customId === 'team_toggle_recruitment_button') {
        if (userTeam.managerId !== user.id) return interaction.editReply({ content: 'Solo los mánagers pueden hacer esto.' });
        userTeam.recruitmentOpen = !userTeam.recruitmentOpen;
        await userTeam.save();
        return interaction.editReply({ content: `El reclutamiento está ahora **${userTeam.recruitmentOpen ? 'ABIERTO' : 'CERRADO'}**.` });
    }

    if (customId.startsWith('post_scheduled_panel') || customId.startsWith('post_instant_panel')) {
        const leagues = await League.find({ guildId: guild.id }).sort({ name: 1 });
        if (leagues.length === 0) return interaction.editReply({ content: 'No hay ligas configuradas para poder filtrar.' });
        const panelType = customId.startsWith('post_scheduled') ? 'SCHEDULED' : 'INSTANT';
        const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`friendly_league_filter_${panelType}`).setPlaceholder('Opcional: Filtrar por liga(s)').addOptions(leagueOptions).setMinValues(0).setMaxValues(leagues.length));
        const noFilterButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`no_filter_${panelType}`).setLabel('Buscar en TODAS las ligas').setStyle(ButtonStyle.Primary));
        return interaction.editReply({ content: '¿Quieres que solo equipos de ciertas ligas puedan desafiarte?', components: [row, noFilterButton] });
    }
    
    if (customId.startsWith('no_filter_')) {
        const panelType = customId.split('_')[2];
        if (panelType === 'SCHEDULED') {
            const timeSlots = ['22:00', '22:20', '22:40', '23:00', '23:20', '23:40'];
            const timeOptions = timeSlots.map(time => ({ label: time, value: time }));
            const timeMenu = new StringSelectMenuBuilder().setCustomId(`select_available_times_`).setPlaceholder('Selecciona tus horarios').addOptions(timeOptions).setMinValues(1).setMaxValues(timeSlots.length);
            return interaction.editReply({ content: `No has aplicado filtro de liga. Ahora, elige los horarios:`, components: [new ActionRowBuilder().addComponents(timeMenu)] });
        } else {
            const channelId = '1396367574882717869';
            const channel = await client.channels.fetch(channelId).catch(()=>null);
            if (!channel) return interaction.editReply({ content: 'Error: No se encontró el canal de amistosos instantáneos.' });
            const webhook = await getOrCreateWebhook(channel, client);
            const panelData = { team: userTeam, postedById: user.id, _id: new mongoose.Types.ObjectId(), allowedLeagues: [], panelType: 'INSTANT', timeSlots: [{ time: 'INSTANT', status: 'AVAILABLE' }] };
            const { embeds, components } = await buildPanel(panelData);
            const message = await webhook.send({ username: userTeam.name, avatarURL: userTeam.logoUrl, embeds, components });
            const panel = new AvailabilityPanel({ guildId: guild.id, channelId, messageId: message.id, teamId: userTeam._id, postedById: user.id, panelType: 'INSTANT', allowedLeagues: [], timeSlots: panelData.timeSlots });
            await panel.save();
            return interaction.editReply({ content: '✅ Tu panel de amistoso instantáneo ha sido publicado.' });
        }
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
        } catch(e) { /* Ignorar */ }
        return interaction.editReply({ content: `✅ Tu panel de amistosos de tipo **${panelType}** ha sido eliminado.` });
    }
};
