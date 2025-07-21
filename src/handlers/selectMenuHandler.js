// src/handlers/selectMenuHandler.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const Team = require('../models/team.js');
const VPGUser = require('../models/user.js');
const League = require('../models/league.js');
const AvailabilityPanel = require('../models/availabilityPanel.js');

module.exports = async (client, interaction) => {
    const { customId, values, guild, user } = interaction;
    const selectedValue = values[0];

    // Interacciones que muestran un modal, no necesitan defer.
    if (customId === 'apply_to_team_select') {
        const teamId = selectedValue;
        const modal = new ModalBuilder().setCustomId(`application_modal_${teamId}`).setTitle('Aplicar a Equipo');
        const presentationInput = new TextInputBuilder().setCustomId('presentation').setLabel('Escribe una breve presentación').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(200);
        modal.addComponents(new ActionRowBuilder().addComponents(presentationInput));
        return interaction.showModal(modal);
    }
    
    if (customId === 'select_league_for_registration') {
        const leagueName = selectedValue;
        const modal = new ModalBuilder().setCustomId(`manager_request_modal_${leagueName}`).setTitle(`Registrar Equipo en ${leagueName}`);
        const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsername').setLabel("Tu nombre de usuario en VPG").setStyle(TextInputStyle.Short).setRequired(true);
        const teamNameInput = new TextInputBuilder().setCustomId('teamName').setLabel("Nombre de tu equipo").setStyle(TextInputStyle.Short).setRequired(true);
        const teamAbbrInput = new TextInputBuilder().setCustomId('teamAbbr').setLabel("Abreviatura (3 letras)").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3).setMaxLength(3);
        modal.addComponents(new ActionRowBuilder().addComponents(vpgUsernameInput), new ActionRowBuilder().addComponents(teamNameInput), new ActionRowBuilder().addComponents(teamAbbrInput));
        return interaction.showModal(modal);
    }

    // Interacciones que actualizan el mensaje, necesitan deferUpdate.
    if (customId.startsWith('select_league_filter_') || customId === 'admin_select_team_to_manage' || customId === 'roster_management_menu' || customId === 'admin_change_league_menu') {
        await interaction.deferUpdate();

        if (customId.startsWith('select_league_filter_')) {
            const panelType = customId.split('_')[3];
            const selectedLeagues = values;
            const leaguesString = selectedLeagues.length > 0 ? selectedLeagues.join(',') : 'none';
            const continueButton = new ButtonBuilder()
                .setCustomId(`continue_panel_creation_${panelType}_${leaguesString}`)
                .setLabel('Continuar con la Creación del Panel')
                .setStyle(ButtonStyle.Success);
            return interaction.editReply({
                content: `Has seleccionado las ligas: **${selectedLeagues.length > 0 ? selectedLeagues.join(', ') : 'Ninguna'}**. Pulsa continuar.`,
                components: [new ActionRowBuilder().addComponents(continueButton)]
            });
        }

        if (customId === 'admin_select_team_to_manage') {
            const teamId = selectedValue;
            const team = await Team.findById(teamId).lean();
            if (!team) return interaction.editReply({ content: 'Este equipo ya no existe.', components: [], embeds: [] });
            const leagues = await League.find({ guildId: guild.id }).sort({ name: 1 });
            const leagueOptions = leagues.map(l => ({ label: l.name, value: `admin_set_league_${teamId}_${l._id}`, default: team.league === l.name }));
            const leagueMenu = new StringSelectMenuBuilder().setCustomId('admin_change_league_menu').setPlaceholder('Cambiar la liga del equipo').addOptions(leagueOptions);
            const embed = new EmbedBuilder().setTitle(`Gestión: ${team.name}`).setColor('DarkRed').setThumbnail(team.logoUrl);
            const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_change_data_${teamId}`).setLabel('Cambiar Datos').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`admin_manage_members_${teamId}`).setLabel('Gestionar Miembros').setStyle(ButtonStyle.Primary));
            const row2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`admin_dissolve_team_${teamId}`).setLabel('DISOLVER EQUIPO').setStyle(ButtonStyle.Danger));
            const row3 = new ActionRowBuilder().addComponents(leagueMenu);
            return interaction.editReply({ content: '', embeds: [embed], components: [row1, row2, row3] });
        }

        if (customId === 'roster_management_menu') {
            const targetId = selectedValue;
            const managerTeam = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
            if (!managerTeam) return interaction.editReply({content: "Ya no tienes permisos sobre este equipo.", components: []});
            const isManager = managerTeam.managerId === user.id;
            const targetMember = await guild.members.fetch(targetId).catch(()=>null);
            if(!targetMember) return interaction.editReply({ content: "El miembro seleccionado ya no está en el servidor.", components: []});
            const isTargetCaptain = managerTeam.captains.includes(targetId);
            const row = new ActionRowBuilder();
            if (isManager) {
                if (isTargetCaptain) { row.addComponents(new ButtonBuilder().setCustomId(`demote_captain_${targetId}`).setLabel('Degradar a Jugador').setStyle(ButtonStyle.Secondary)); }
                else { row.addComponents(new ButtonBuilder().setCustomId(`promote_player_${targetId}`).setLabel('Ascender a Capitán').setStyle(ButtonStyle.Success)); }
            }
            row.addComponents(new ButtonBuilder().setCustomId(`kick_player_${targetId}`).setLabel('Expulsar del Equipo').setStyle(ButtonStyle.Danger));
            row.addComponents(new ButtonBuilder().setCustomId(`toggle_mute_player_${targetId}`).setLabel('Mutear/Desmutear Chat').setStyle(ButtonStyle.Secondary));
            return interaction.editReply({ content: `Acciones para **${targetMember.user.username}**:`, components: [row] });
        }

        if (customId === 'admin_change_league_menu') {
            const parts = selectedValue.split('_');
            const teamId = parts[3];
            const leagueId = parts[4];
            const team = await Team.findById(teamId);
            const league = await League.findById(leagueId);
            if (!team || !league) return interaction.followUp({ content: 'El equipo o la liga ya no existen.', ephemeral: true });
            team.league = league.name;
            await team.save();
            return interaction.followUp({ content: `✅ La liga del equipo **${team.name}** ha sido cambiada a **${league.name}**.`, ephemeral: true });
        }
        return;
    }
    
    // Interacciones que crean un nuevo mensaje o tienen un flujo más largo.
    await interaction.deferReply({ flags: 64 });
    
    if (customId.startsWith('select_available_times')) {
        const parts = customId.split('_');
        const leaguesString = parts.slice(3).join('_');
        const leagues = leaguesString === 'all' || !leaguesString || leaguesString === 'none' ? [] : leaguesString.split(',');
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.editReply({ content: 'No se encontró tu equipo.' });
        
        const channelId = process.env.SCHEDULED_FRIENDLY_CHANNEL_ID;
        if (!channelId) return interaction.editReply({ content: 'Error: El ID del canal de amistosos programados no está configurado.' });
        
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return interaction.editReply({ content: 'Error: No se encontró el canal de amistosos programados.' });

        const existingConfirmedMatches = await AvailabilityPanel.find({
            "timeSlots.status": "CONFIRMED",
            $or: [ { teamId: team._id }, { "timeSlots.challengerTeamId": team._id } ]
        }).lean();

        const confirmedSlotsMap = new Map();
        for (const panel of existingConfirmedMatches) {
            for (const slot of panel.timeSlots) {
                if (slot.status === 'CONFIRMED' && (team._id.equals(panel.teamId) || (slot.challengerTeamId && team._id.equals(slot.challengerTeamId)))) {
                    const opponentTeamId = team._id.equals(panel.teamId) ? slot.challengerTeamId : panel.teamId;
                    confirmedSlotsMap.set(slot.time, opponentTeamId);
                }
            }
        }
        
        const timeSlots = values.map(time => {
            if (confirmedSlotsMap.has(time)) {
                return { time, status: 'CONFIRMED', challengerTeamId: confirmedSlotsMap.get(time), pendingChallenges: [] };
            } else {
                return { time, status: 'AVAILABLE', pendingChallenges: [] };
            }
        });
        
        const buttonHandler = client.handlers.get('buttonHandler');
        const webhook = await buttonHandler.getOrCreateWebhook(channel, client);

        const initialEmbed = new EmbedBuilder().setTitle(`Panel de Amistosos de ${team.name}`).setColor("Greyple");
        const message = await webhook.send({ embeds: [initialEmbed], username: team.name, avatarURL: team.logoUrl });

        const panel = new AvailabilityPanel({ 
            guildId: guild.id, channelId, messageId: message.id, teamId: team._id, postedById: user.id, panelType: 'SCHEDULED', 
            leagues: leagues,
            timeSlots 
        });
        await panel.save();

        if (typeof buttonHandler.updatePanelMessage === 'function') {
            await buttonHandler.updatePanelMessage(client, panel._id);
        }
        
        return interaction.editReply({ content: '​' });
    }
    
    if (customId === 'view_team_roster_select') {
        const team = await Team.findById(selectedValue).lean();
        if (!team) return interaction.editReply({ content: 'Este equipo ya no existe.' });
        const allMemberIds = [team.managerId, ...team.captains, ...team.players].filter(id => id);
        if (allMemberIds.length === 0) return interaction.editReply({ content: 'Este equipo no tiene miembros.' });
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
        await fetchMemberInfo([team.managerId].filter(Boolean), '👑 Mánager');
        await fetchMemberInfo(team.captains, '🛡️ Capitanes');
        await fetchMemberInfo(team.players, 'Jugadores');
        const embed = new EmbedBuilder().setTitle(`Plantilla de ${team.name} (${team.abbreviation})`).setDescription(rosterString.trim() || 'Este equipo no tiene miembros.').setColor('#3498db').setThumbnail(team.logoUrl).setFooter({ text: `Liga: ${team.league}` });
        return interaction.editReply({ embeds: [embed] });
    }
    
    if (customId === 'delete_league_select_menu') {
        const leaguesToDelete = values;
        const result = await League.deleteMany({ guildId: guild.id, name: { $in: leaguesToDelete } });
        return interaction.editReply({ content: `✅ Se han eliminado ${result.deletedCount} ligas.` });
    }
};
