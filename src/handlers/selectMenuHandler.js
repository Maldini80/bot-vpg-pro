// src/handlers/selectMenuHandler.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const Team = require('../models/team.js');
const VPGUser = require('../models/user.js');
const League = require('../models/league.js');
const AvailabilityPanel = require('../models/availabilityPanel.js');

async function getOrCreateWebhook(channel, client) {
    const webhooks = await channel.fetchWebhooks();
    let webhook = webhooks.find(wh => wh.owner.id === client.user.id && wh.name.startsWith('VPG Bot'));
    if (!webhook) {
        webhook = await channel.createWebhook({ name: `VPG Bot Amistosos`, avatar: client.user.displayAvatarURL() });
    }
    return webhook;
}

async function buildPanel(panelData) {
    const { team, postedById, timeSlots, _id, allowedLeagues } = panelData;
    
    let description = `**Buscando rival para jugar AHORA**\n\n*Contacto:* <@${postedById}>`;
    if (panelData.panelType === 'SCHEDULED') {
        description = `**Buscando rivales para los siguientes horarios:**\n\n*Contacto:* <@${postedById}>`;
    }
    if (allowedLeagues && allowedLeagues.length > 0) {
        description += `\n*Filtro de Liga(s): ${allowedLeagues.join(', ')}*`;
    }

    const embed = new EmbedBuilder()
        .setColor(timeSlots.some(ts => ts.status === 'AVAILABLE') ? 'Green' : '#5865F2')
        .setAuthor({ name: team.name, iconURL: team.logoUrl })
        .setDescription(description);

    const components = [];
    let currentRow = new ActionRowBuilder();

    for (const slot of timeSlots) {
        let button;
        if (slot.status === 'AVAILABLE') {
            button = new ButtonBuilder().setCustomId(`challenge_${_id}_${slot.time}`).setLabel(`⚔️ Desafiar (${slot.time})`).setStyle(ButtonStyle.Success);
        } else { // CONFIRMED
            embed.addFields({ name: `🕕 ${slot.time}`, value: `**VS ${slot.challengerTeamName}**`, inline: true });
            button = new ButtonBuilder().setCustomId(`contact_${postedById}_${slot.challengerUserId}`).setLabel(`MDs (${slot.time})`).setStyle(ButtonStyle.Primary);
            const cancelButton = new ButtonBuilder().setCustomId(`cancel_match_${_id}_${slot.time}`).setLabel('Cancelar').setStyle(ButtonStyle.Danger);
            if (currentRow.components.length > 3) {
                components.push(currentRow);
                currentRow = new ActionRowBuilder();
            }
            currentRow.addComponents(button, cancelButton);
            continue; // Evita añadir el botón de desafío
        }
        
        if (currentRow.components.length >= 5) {
            components.push(currentRow);
            currentRow = new ActionRowBuilder();
        }
        currentRow.addComponents(button);
    }

    if (currentRow.components.length > 0) {
        components.push(currentRow);
    }
    
    return { embeds: [embed], components };
}

module.exports = async (client, interaction) => {
    const { customId, values, guild, user } = interaction;
    const selectedValue = values[0];

    // --- Menús que abren modales ---
    if (customId === 'apply_to_team_select') {
        const teamId = selectedValue;
        const modal = new ModalBuilder().setCustomId(`application_modal_${teamId}`).setTitle('Aplicar a Equipo');
        const presentationInput = new TextInputBuilder().setCustomId('presentation').setLabel('Escribe una breve presentación').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(200);
        modal.addComponents(new ActionRowBuilder().addComponents(presentationInput));
        return interaction.showModal(modal);
    }
    
    if (customId === 'select_league_for_registration') {
        await interaction.deferUpdate();
        const leagueName = selectedValue;
        const modal = new ModalBuilder().setCustomId(`manager_request_modal_${leagueName}`).setTitle(`Registrar Equipo en ${leagueName}`);
        const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsername').setLabel("Tu nombre de usuario en VPG").setStyle(TextInputStyle.Short).setRequired(true);
        const teamNameInput = new TextInputBuilder().setCustomId('teamName').setLabel("Nombre de tu equipo").setStyle(TextInputStyle.Short).setRequired(true);
        const teamAbbrInput = new TextInputBuilder().setCustomId('teamAbbr').setLabel("Abreviatura (3 letras)").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3).setMaxLength(3);
        modal.addComponents(new ActionRowBuilder().addComponents(vpgUsernameInput), new ActionRowBuilder().addComponents(teamNameInput), new ActionRowBuilder().addComponents(teamAbbrInput));
        return interaction.showModal(modal);
    }

    // --- Menús que actualizan un mensaje ---
    if (customId === 'admin_select_team_to_manage' || customId === 'roster_management_menu' || customId === 'admin_change_league_menu') {
        await interaction.deferUpdate();
        
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
                if (isTargetCaptain) row.addComponents(new ButtonBuilder().setCustomId(`demote_captain_${targetId}`).setLabel('Degradar a Jugador').setStyle(ButtonStyle.Secondary));
                else row.addComponents(new ButtonBuilder().setCustomId(`promote_player_${targetId}`).setLabel('Ascender a Capitán').setStyle(ButtonStyle.Success));
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
    
    // --- Lógica para el filtro de ligas en amistosos ---
    if (customId.startsWith('friendly_league_filter')) {
        await interaction.deferReply({ ephemeral: true });
        const panelType = customId.split('_')[3];
        const allowedLeagues = values;
        
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.editReply({ content: 'No se encontró tu equipo.' });

        const channelId = panelType === 'SCHEDULED' ? '1396284750850949142' : '1396367574882717869';
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return interaction.editReply({ content: `Error: No se encontró el canal de amistosos para ${panelType}.` });

        if (panelType === 'SCHEDULED') {
            const timeSlots = ['22:00', '22:20', '22:40', '23:00', '23:20', '23:40'];
            const timeOptions = timeSlots.map(time => ({ label: time, value: time }));
            const timeMenu = new StringSelectMenuBuilder().setCustomId(`select_available_times_${allowedLeagues.join(',')}`).setPlaceholder('Selecciona tus horarios disponibles').addOptions(timeOptions).setMinValues(1).setMaxValues(timeSlots.length);
            return interaction.editReply({ content: `Filtro de liga(s) aplicado: **${allowedLeagues.join(', ')}**. Ahora, elige los horarios:`, components: [new ActionRowBuilder().addComponents(timeMenu)] });
        } else { // INSTANT
            const webhook = await getOrCreateWebhook(channel, client);
            const panelData = { team, postedById: user.id, _id: new mongoose.Types.ObjectId(), allowedLeagues, panelType, timeSlots: [{ time: 'INSTANT', status: 'AVAILABLE' }] };
            const { embeds, components } = await buildPanel(panelData);
            const message = await webhook.send({ username: team.name, avatarURL: team.logoUrl, embeds, components });
            const panel = new AvailabilityPanel({ guildId: guild.id, channelId, messageId: message.id, teamId: team._id, postedById: user.id, panelType, allowedLeagues, timeSlots: panelData.timeSlots });
            await panel.save();
            return interaction.editReply({ content: '✅ Tu panel de amistoso instantáneo con filtro de liga ha sido publicado.' });
        }
    }

    // --- Menú de Amistosos Programados ---
    if (customId.startsWith('select_available_times')) {
        await interaction.deferReply({ ephemeral: true });
        const allowedLeagues = customId.substring('select_available_times_'.length).split(',');
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.editReply({ content: 'No se encontró tu equipo.' });
        const channelId = '1396284750850949142';
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return interaction.editReply({ content: 'Error: No se encontró el canal de amistosos programados.' });

        const timeSlots = values.map(time => ({ time, status: 'AVAILABLE' }));
        const webhook = await getOrCreateWebhook(channel, client);
        const panelData = { team, postedById: user.id, _id: new mongoose.Types.ObjectId(), allowedLeagues, panelType: 'SCHEDULED', timeSlots };
        const { embeds, components } = await buildPanel(panelData);
        const message = await webhook.send({ username: team.name, avatarURL: team.logoUrl, embeds, components });
        
        const panel = new AvailabilityPanel({ guildId: guild.id, channelId, messageId: message.id, teamId: team._id, postedById: user.id, panelType: 'SCHEDULED', allowedLeagues, timeSlots });
        await panel.save();
        
        return interaction.editReply({ content: '✅ Tu panel de amistosos programados ha sido publicado.' });
    }
    
    // --- Menús con deferReply ---
    await interaction.deferReply({ ephemeral: true });

    if (customId === 'view_team_roster_select') {
        const team = await Team.findById(selectedValue).lean();
        if (!team) return interaction.editReply({ content: 'Este equipo ya no existe.' });
        // (Lógica de ver plantilla que ya funcionaba)
        return interaction.editReply({ content: `Mostrando plantilla de ${team.name}` });
    }
    
    if (customId === 'delete_league_select_menu') {
        const leaguesToDelete = values;
        const result = await League.deleteMany({ guildId: guild.id, name: { $in: leaguesToDelete } });
        return interaction.editReply({ content: `✅ Se han eliminado ${result.deletedCount} ligas.` });
    }
};
