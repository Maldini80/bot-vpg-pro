// src/handlers/buttonHandler.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Team = require('../models/team.js');
const League = require('../models/league.js');
const PlayerApplication = require('../models/playerApplication.js');
const AvailabilityPanel = require('../models/availabilityPanel.js');
const VPGUser = require('../models/user.js');

async function updatePanelMessage(client, panelId) {
    try {
        const panel = await AvailabilityPanel.findById(panelId).populate('teamId').lean();
        if (!panel) return;
        const channel = await client.channels.fetch(panel.channelId);
        const webhook = await getOrCreateWebhook(channel, client);
        const hostTeam = panel.teamId;
        let description = `**Anfitrión:** ${hostTeam.name}\n**Contacto:** <@${panel.postedById}>`;
        if (panel.leagues && panel.leagues.length > 0) {
            description += `\n**Filtro de liga:** \`${panel.leagues.join(', ')}\``;
        }
        const embed = new EmbedBuilder().setDescription(description).setThumbnail(hostTeam.logoUrl);
        const components = [];
        let currentRow = new ActionRowBuilder();
        for (const slot of panel.timeSlots) {
            let buttonSet = [];
            if (slot.status === 'CONFIRMED') {
                const challengerTeam = await Team.findById(slot.challengerTeamId).lean();
                embed.setTitle(`Partido: ${hostTeam.name} vs ${challengerTeam.name}`).setColor("Green");
                if (panel.panelType === 'SCHEDULED') {
                    embed.addFields({ name: `🕕 ${slot.time}`, value: `⚔️ **CONFIRMADO**`, inline: true });
                }
                const contactButton = new ButtonBuilder().setCustomId(`contact_opponent_${panel.teamId._id}_${challengerTeam._id}`).setLabel(`💬 Contactar`).setStyle(ButtonStyle.Primary);
                const abandonButton = new ButtonBuilder().setCustomId(`abandon_challenge_${panel._id}_${slot.time}`).setLabel('❌ Abandonar').setStyle(ButtonStyle.Danger);
                buttonSet.push(contactButton, abandonButton);
            } else { 
                const pendingCount = slot.pendingChallenges.length;
                const statusText = pendingCount > 0 ? `⏳ ${pendingCount} Petición(es)` : `✅ Disponible`;
                embed.setTitle(`Buscando Rival - ${hostTeam.name} (${statusText})`).setColor("Orange");
                if (panel.panelType === 'SCHEDULED') {
                    embed.addFields({ name: `🕕 ${slot.time}`, value: statusText, inline: true });
                }
                const label = slot.time === 'INSTANT' ? `⚔️ Desafiar Ahora` : `⚔️ Desafiar (${slot.time})`;
                buttonSet.push(new ButtonBuilder().setCustomId(`challenge_slot_${panel._id}_${slot.time}`).setLabel(label).setStyle(ButtonStyle.Success));
            }
            if (currentRow.components.length + buttonSet.length > 5) {
                components.push(currentRow);
                currentRow = new ActionRowBuilder();
            }
            currentRow.addComponents(...buttonSet);
        }
        if (currentRow.components.length > 0) {
            components.push(currentRow);
        }
        await webhook.editMessage(panel.messageId, {
            username: hostTeam.name,
            avatarURL: hostTeam.logoUrl,
            embeds: [embed],
            components
        });
    } catch (error) {
        if (error.code !== 10008) console.error("Error fatal al actualizar el panel de amistosos:", error);
    }
}

async function getOrCreateWebhook(channel, client) {
    const webhookName = 'VPG Bot Amistosos';
    const webhooks = await channel.fetchWebhooks();
    let webhook = webhooks.find(wh => wh.name === webhookName);
    if (!webhook) {
        webhook = await channel.createWebhook({ name: webhookName, avatar: client.user.displayAvatarURL() });
    }
    return webhook;
}

const handler = async (client, interaction) => {
    if (!interaction.inGuild()) {
        const { customId } = interaction;
        if (customId.startsWith('accept_challenge_') || customId.startsWith('reject_challenge_')) {
            await interaction.deferUpdate();
            const [, action, panelId, time, challengeId] = customId.split('_');
            const panel = await AvailabilityPanel.findById(panelId).populate('teamId');
            if (!panel) return interaction.editReply({ content: 'Este panel de amistosos ya no existe.', components: [] });
            const slot = panel.timeSlots.find(s => s.time === time);
            if (!slot) return interaction.editReply({ content: 'Este horario ya no existe.', components: [] });
            if (slot.status === 'CONFIRMED') {
                await interaction.editReply({ content: '❌ ¡Demasiado tarde! Ya has aceptado otro desafío para este horario.', components: [], embeds: [] });
                const lateChallenger = slot.pendingChallenges.find(c => c._id.toString() === challengeId);
                if(lateChallenger) {
                    const lateUser = await client.users.fetch(lateChallenger.userId).catch(()=>{});
                    if(lateUser) await lateUser.send(`El equipo **${panel.teamId.name}** intentó aceptar tu desafío, pero ya habían confirmado otro partido.`).catch(()=>{});
                }
                return;
            }
            const challengeIndex = slot.pendingChallenges.findIndex(c => c._id.toString() === challengeId);
            if (challengeIndex === -1) return interaction.editReply({ content: 'Esta petición de desafío ya no es válida.', components: [] });
            const [challenge] = slot.pendingChallenges.splice(challengeIndex, 1);
            const remainingChallenges = slot.pendingChallenges;
            slot.pendingChallenges = [];
            if (action === 'accept') {
                slot.status = 'CONFIRMED';
                slot.challengerTeamId = challenge.teamId;
                const winnerTeam = await Team.findById(challenge.teamId);
                const winnerUser = await client.users.fetch(challenge.userId);
                await winnerUser.send(`✅ ¡Enhorabuena! Tu desafío contra **${panel.teamId.name}** para las **${time}** ha sido **ACEPTADO**!`).catch(()=>{});
                await interaction.editReply({ content: `✅ Has aceptado el desafío de **${winnerTeam.name}**.`, components: [], embeds: [] });
                for (const loser of remainingChallenges) {
                    const loserUser = await client.users.fetch(loser.userId).catch(() => null);
                    if (loserUser) await loserUser.send(`Lo sentimos, tu desafío contra **${panel.teamId.name}** para las **${time}** no pudo ser aceptado.`).catch(()=>{});
                }
            } else { 
                await interaction.editReply({ content: `❌ Has rechazado el desafío.`, components: [], embeds: [] });
                 const rejectedUser = await client.users.fetch(challenge.userId);
                 await rejectedUser.send(`Tu desafío contra **${panel.teamId.name}** para las **${time}** ha sido **RECHAZADO**.`).catch(()=>{});
            }
            await panel.save();
            await updatePanelMessage(client, panel._id);
            return;
        }
        if (customId.startsWith('accept_application_') || customId.startsWith('reject_application_')) {
            await interaction.deferUpdate();
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
            } else {
                application.status = 'rejected';
                if(applicantUser) await applicantUser.send(`Lo sentimos, tu solicitud para unirte a **${application.teamId.name}** ha sido **rechazada**.`);
                await interaction.editReply({ content: `Has rechazado la solicitud de ${applicantUser ? applicantUser.tag : 'un usuario'}.`, components: [], embeds: [] });
            }
            await application.teamId.save();
            await application.save();
        }
        return;
    }

    const { customId, member, guild, user } = interaction;
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
    const esAprobador = isAdmin || member.roles.cache.has(process.env.APPROVER_ROLE_ID);
    
    if (customId.startsWith('challenge_slot_')) {
        await interaction.deferReply({ ephemeral: true });
        const challengerTeam = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }, { players: user.id }] });
        if (!challengerTeam) return interaction.editReply({ content: 'Debes pertenecer a un equipo para desafiar.' });
        const [, , panelId, time] = customId.split('_');
        const panel = await AvailabilityPanel.findById(panelId).populate('teamId');
        if (!panel) return interaction.editReply({ content: 'Este panel de amistosos ya no existe.' });
        if (panel.teamId._id.equals(challengerTeam._id)) return interaction.editReply({ content: 'No puedes desafiar a tu propio equipo.' });
        if (panel.leagues && panel.leagues.length > 0 && !panel.leagues.includes(challengerTeam.league)) {
            return interaction.editReply({ content: `Este amistoso está filtrado solo para equipos de la(s) liga(s): **${panel.leagues.join(', ')}**.` });
        }
        const slot = panel.timeSlots.find(s => s.time === time);
        if (!slot || slot.status === 'CONFIRMED') return interaction.editReply({ content: 'Este horario ya no está disponible.' });
        if (slot.pendingChallenges.some(c => c.teamId.equals(challengerTeam._id))) {
            return interaction.editReply({ content: 'Ya has enviado una petición para este horario.' });
        }
        const newChallenge = { teamId: challengerTeam._id, userId: user.id };
        slot.pendingChallenges.push(newChallenge);
        await panel.save();
        const hostManager = await client.users.fetch(panel.teamId.managerId).catch(() => null);
        if (hostManager) {
            const embed = new EmbedBuilder().setTitle('⚔️ ¡Nuevo Desafío!').setDescription(`El equipo **${challengerTeam.name}** te ha desafiado para un partido a las **${time}**.`).setColor('Gold').setThumbnail(challengerTeam.logoUrl);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`accept_challenge_${panel._id}_${time}_${newChallenge._id}`).setLabel('Aceptar').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`reject_challenge_${panel._id}_${time}_${newChallenge._id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
            );
            await hostManager.send({ embeds: [embed], components: [row] }).catch(async () => {
                panel.timeSlots.find(s => s.time === time).pendingChallenges.pop();
                await panel.save();
                interaction.editReply({ content: 'No se pudo enviar el desafío. El mánager rival tiene los MDs cerrados.' });
                await updatePanelMessage(client, panel._id);
                return;
            });
        }
        await updatePanelMessage(client, panel._id);
        return interaction.editReply({ content: '✅ ¡Desafío enviado!' });
    }

    if (customId.startsWith('abandon_challenge_')) {
        await interaction.deferReply({ ephemeral: true });
        const [, , panelId, time] = customId.split('_');
        const panel = await AvailabilityPanel.findById(panelId);
        if (!panel) return interaction.editReply({ content: 'Este panel ya no existe.' });
        const slot = panel.timeSlots.find(s => s.time === time);
        if (!slot || slot.status !== 'CONFIRMED') return interaction.editReply({ content: 'No hay un partido que abandonar aquí.' });
        const userTeam = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        const isHost = userTeam?._id.equals(panel.teamId);
        const isChallenger = userTeam?._id.equals(slot.challengerTeamId);
        if (!isHost && !isChallenger) return interaction.editReply({ content: 'No eres parte de este enfrentamiento.' });
        const otherTeamId = isHost ? slot.challengerTeamId : panel.teamId;
        const otherTeam = await Team.findById(otherTeamId);
        const otherManager = await client.users.fetch(otherTeam.managerId).catch(() => null);
        slot.status = 'AVAILABLE';
        slot.challengerTeamId = null;
        await panel.save();
        await updatePanelMessage(client, panel._id);
        await interaction.editReply({ content: '✅ El partido ha sido cancelado.' });
        if (otherManager) await otherManager.send(`⚠️ El equipo **${userTeam.name}** ha cancelado vuestro partido.`).catch(()=>{});
        return;
    }

    if (customId.startsWith('contact_opponent_')) {
        await interaction.deferReply({ ephemeral: true });
        const [, , teamId1, teamId2] = customId.split('_');
        const userTeam = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!userTeam) return interaction.editReply({ content: 'No tienes permisos.' });
        let opponentTeamId = userTeam._id.equals(teamId1) ? teamId2 : (userTeam._id.equals(teamId2) ? teamId1 : null);
        if (!opponentTeamId) return interaction.editReply({ content: 'No eres parte de este enfrentamiento.' });
        const opponentTeam = await Team.findById(opponentTeamId).lean();
        return interaction.editReply({ content: `Para hablar con el rival, contacta a su mánager: <@${opponentTeam.managerId}>` });
    }

    if (customId === 'admin_create_league_button' || customId.startsWith('admin_dissolve_team_') || customId.startsWith('approve_request_') || customId.startsWith('admin_change_data_') || customId === 'team_edit_data_button' || customId === 'team_invite_player_button') {
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
    
    if (customId.startsWith('reject_request_') || customId.startsWith('promote_player_') || customId.startsWith('demote_captain_') || customId.startsWith('kick_player_') || customId.startsWith('toggle_mute_player_')) {
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

    if (customId === 'post_scheduled_panel' || customId === 'post_instant_panel') {
        const panelType = customId === 'post_scheduled_panel' ? 'SCHEDULED' : 'INSTANT';
        const existingPanel = await AvailabilityPanel.findOne({ teamId: userTeam._id, panelType });
        if (existingPanel) return interaction.editReply({ content: `Tu equipo ya tiene un panel de amistosos de tipo ${panelType} activo. Bórralo primero.` });
        const leagues = await League.find({ guildId: guild.id });
        const components = [];
        if (leagues.length > 0) {
            const leagueOptions = leagues.map(l => ({ label: l.name, value: l.name }));
            const selectMenu = new StringSelectMenuBuilder().setCustomId(`select_league_filter_${panelType}`).setPlaceholder('Filtrar por ligas (opcional)').addOptions(leagueOptions).setMinValues(0).setMaxValues(leagues.length);
            components.push(new ActionRowBuilder().addComponents(selectMenu));
        }
        const button = new ButtonBuilder().setCustomId(`continue_panel_creation_${panelType}_all`).setLabel('Buscar en TODAS las Ligas').setStyle(ButtonStyle.Primary);
        components.push(new ActionRowBuilder().addComponents(button));
        return interaction.editReply({ content: 'Selecciona las ligas para las que quieres buscar rival, o busca en todas.', components: components, ephemeral: true });
    }

    if (customId.startsWith('continue_panel_creation_')) {
        const parts = customId.split('_');
        const panelType = parts[3];
        const leaguesString = parts.slice(4).join('_');
        const leagues = leaguesString === 'all' || leaguesString === 'none' || !leaguesString ? [] : leaguesString.split(',');
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.editReply({ content: 'No se ha podido encontrar tu equipo.' });
        if (panelType === 'SCHEDULED') {
            const timeSlots = ['22:00', '22:20', '22:40', '23:00', '23:20', '23:40'];
            const timeOptions = timeSlots.map(time => ({ label: time, value: time }));
            const selectMenu = new StringSelectMenuBuilder().setCustomId(`select_available_times_${leagues.join(',') || 'all'}`).setPlaceholder('Selecciona tus horarios disponibles').addOptions(timeOptions).setMinValues(1).setMaxValues(timeSlots.length);
            return interaction.editReply({ content: 'Elige los horarios en los que tu equipo está disponible:', components: [new ActionRowBuilder().addComponents(selectMenu)] });
        } else {
            const channelId = process.env.INSTANT_FRIENDLY_CHANNEL_ID;
            if (!channelId) return interaction.editReply({ content: 'Error: El ID del canal de amistosos instantáneos no está configurado.' });
            const channel = await client.channels.fetch(channelId).catch(()=>null);
            if (!channel) return interaction.editReply({ content: 'Error: No se encontró el canal de amistosos instantáneos.' });
            const webhook = await getOrCreateWebhook(channel, client);
            const message = await webhook.send({ content: "Creando panel...", username: team.name, avatarURL: team.logoUrl });
            const panel = new AvailabilityPanel({ 
                guildId: guild.id, channelId, messageId: message.id, teamId: team._id, postedById: user.id, panelType: 'INSTANT', leagues,
                timeSlots: [{ time: 'INSTANT', status: 'AVAILABLE' }] 
            });
            await panel.save();
            await updatePanelMessage(client, panel._id);
            return interaction.editReply({ content: '✅ Tu panel de amistoso instantáneo ha sido publicado.' });
        }
    }

    if (customId === 'delete_friendly_panel') {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`confirm_delete_panel_SCHEDULED`).setLabel('Borrar Panel Programado').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`confirm_delete_panel_INSTANT`).setLabel('Borrar Panel Instantáneo').setStyle(ButtonStyle.Danger)
        );
        return interaction.editReply({ content: '¿Qué tipo de búsqueda de amistoso quieres borrar?', components: [row] });
    }
    
    if (customId.startsWith('confirm_delete_panel_')) {
        const [, , , panelType] = customId.split('_');
        const teamToDeleteFrom = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!teamToDeleteFrom) {
            return interaction.editReply({ content: "No se pudo encontrar tu equipo para realizar esta acción." });
        }
        const existingPanel = await AvailabilityPanel.findOneAndDelete({ teamId: teamToDeleteFrom._id, panelType: panelType });
        if (!existingPanel) {
            return interaction.editReply({ content: `No se encontró un panel de tipo **${panelType}** activo que pertenezca a tu equipo.` });
        }
        try {
            const channel = await client.channels.fetch(existingPanel.channelId);
            const message = await channel.messages.fetch(existingPanel.messageId);
            await message.delete();
        } catch(e) {
            console.log(`No se pudo borrar el mensaje del panel (ID: ${existingPanel.messageId}) porque probablemente ya no existía.`);
        }
        return interaction.editReply({ content: `✅ Tu panel de amistosos de tipo **${panelType}** ha sido eliminado.` });
    }
};

handler.updatePanelMessage = updatePanelMessage;
handler.getOrCreateWebhook = getOrCreateWebhook;
module.exports = handler;
