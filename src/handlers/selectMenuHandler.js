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

// MODIFICADO: La función ahora acepta el array de ligas para mostrarlo en el panel.
async function buildScheduledPanel(team, userId, timeSlotsData, panelId, leagues = []) {
    let description = `**Buscando rivales para los siguientes horarios:**\n\n*Contacto:* <@${userId}>`;
    if (leagues && leagues.length > 0) {
        description += `\n*Filtro de liga:* \`${leagues.join(', ')}\``;
    }

    const embed = new EmbedBuilder().setColor('#5865F2').setDescription(description);
    const components = [];
    let currentRow = new ActionRowBuilder();

    for (const slot of timeSlotsData) {
        let fieldText = `✅ **DISPONIBLE**`;
        let button = new ButtonBuilder().setCustomId(`challenge_slot_${panelId}_${slot.time}`).setLabel(`⚔️ ${slot.time}`).setStyle(ButtonStyle.Success);
        embed.addFields({ name: `🕕 ${slot.time}`, value: fieldText, inline: true });
        
        if (currentRow.components.length >= 5) {
            components.push(currentRow);
            currentRow = new ActionRowBuilder();
        }
        currentRow.addComponents(button);
    }
    
    if (currentRow.components.length > 0) {
        components.push(currentRow);
    }
    return { embed, components };
}

module.exports = async (client, interaction) => {
    const { customId, values, guild, user } = interaction;
    const selectedValue = values[0];

    // ======================================================================
    // Lógica para aplicar a un equipo (Sin cambios)
    // ======================================================================
    if (customId === 'apply_to_team_select') {
        const teamId = selectedValue;
        const modal = new ModalBuilder().setCustomId(`application_modal_${teamId}`).setTitle('Aplicar a Equipo');
        const presentationInput = new TextInputBuilder().setCustomId('presentation').setLabel('Escribe una breve presentación').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(200);
        modal.addComponents(new ActionRowBuilder().addComponents(presentationInput));
        return interaction.showModal(modal);
    }
    
    // ======================================================================
    // Lógica para registrar un equipo (Sin cambios)
    // ======================================================================
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

    // ======================================================================
    // AÑADIDO: Lógica para el nuevo menú de filtro de ligas de amistosos
    // ======================================================================
    if (customId.startsWith('select_league_filter_')) {
        await interaction.deferUpdate();
        const panelType = customId.split('_')[3];
        const selectedLeagues = values;
        
        const leaguesString = selectedLeagues.join(',');
        const continueButton = new ButtonBuilder()
            .setCustomId(`continue_panel_creation_${panelType}_${leaguesString}`)
            .setLabel('Continuar con la Creación del Panel')
            .setStyle(ButtonStyle.Success);
            
        await interaction.editReply({
            content: `Has seleccionado las ligas: **${selectedLeagues.join(', ')}**. Pulsa continuar.`,
            components: [new ActionRowBuilder().addComponents(continueButton)]
        });
        return;
    }

    // ======================================================================
    // Lógica de gestión de administradores (Sin cambios)
    // ======================================================================
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

    // ======================================================================
    // MODIFICADO: Lógica para la selección de horarios de amistosos
    // ======================================================================
    if (customId.startsWith('select_available_times')) {
        await interaction.deferReply({ ephemeral: true });
        
        const parts = customId.split('_');
        // Se extraen las ligas (si existen) del customId
        const leaguesString = parts.slice(3).join('_');
        const leagues = leaguesString === 'all' || !leaguesString ? [] : leaguesString.split(',');

        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        if (!team) return interaction.editReply({ content: 'No se encontró tu equipo.' });
        
        const channelId = process.env.SCHEDULED_FRIENDLY_CHANNEL_ID;
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return interaction.editReply({ content: 'Error: No se encontró el canal de amistosos programados.' });

        const timeSlots = values.map(time => ({ time, status: 'AVAILABLE' }));
        
        const panel = new AvailabilityPanel({ 
            guildId: guild.id, channelId, messageId: 'temp', teamId: team._id, postedById: user.id, panelType: 'SCHEDULED', 
            leagues: leagues, // Se guardan las ligas en la BD
            timeSlots 
        });
        
        // La función ahora pasa el array de ligas para que se muestre en el panel
        const panelContent = await buildScheduledPanel(team, user.id, timeSlots, panel._id, leagues);
        const webhook = await getOrCreateWebhook(channel, client);
        const message = await webhook.send({ username: team.name, avatarURL: team.logoUrl, embeds: [panelContent.embed], components: panelContent.components });
        
        panel.messageId = message.id;
        await panel.save();
        
        return interaction.editReply({ content: '✅ Tu panel de amistosos programados ha sido publicado.' });
    }
    
    // ======================================================================
    // El resto de la lógica del fichero (Sin cambios)
    // ======================================================================
    await interaction.deferReply({ ephemeral: true });

    if (customId === 'view_team_roster_select') {
        const team = await Team.findById(selectedValue).lean();
        if (!team) return interaction.editReply({ content: 'Este equipo ya no existe.' });
        const allMemberIds = [team.managerId, ...team.captains, ...team.players].filter(id => id);
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
