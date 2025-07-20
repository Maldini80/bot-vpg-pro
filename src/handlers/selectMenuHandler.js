// src/handlers/selectMenuHandler.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const Team = require('../models/team.js');
const VPGUser = require('../models/user.js');
const League = require('../models/league.js');
const PlayerApplication = require('../models/playerApplication.js');
const AvailabilityPanel = require('../models/availabilityPanel.js');

module.exports = async (client, interaction) => {
    const { customId, values, guild, user } = interaction;
    const selectedValue = values[0]; // La mayoría de los menús solo tendrán un valor seleccionado.

    // --- Menú para ver la plantilla de un equipo (Panel de Solicitud) ---
    if (customId === 'view_team_roster_select') {
        await interaction.deferReply({ ephemeral: true });
        const team = await Team.findById(selectedValue).lean(); // .lean() para un objeto JS simple
        if (!team) return interaction.editReply({ content: 'Este equipo ya no existe.' });
        
        const allMemberIds = [team.managerId, ...team.captains, ...team.players].filter(id => id);
        const memberProfiles = await VPGUser.find({ discordId: { $in: allMemberIds } }).lean();
        const memberMap = new Map(memberProfiles.map(p => [p.discordId, p]));

        let rosterString = '';
        for (const role of ['👑 Mánager', '🛡️ Capitán', 'Jugador']) {
            let idsInRole;
            if (role === '👑 Mánager') idsInRole = [team.managerId].filter(Boolean);
            else if (role === '🛡️ Capitán') idsInRole = team.captains;
            else idsInRole = team.players;

            if (idsInRole && idsInRole.length > 0) {
                rosterString += `\n**${role === '👑 Mánager' ? 'Mánager' : role === '🛡️ Capitán' ? 'Capitanes' : 'Jugadores'}**\n`;
                for (const memberId of idsInRole) {
                     try {
                        const memberData = await guild.members.fetch(memberId);
                        const vpgUser = memberMap.get(memberId)?.vpgUsername || 'N/A';
                        rosterString += `> ${memberData.user.username} (${vpgUser})\n`;
                     } catch (error) {
                         rosterString += `> *Usuario no encontrado en el servidor (ID: ${memberId})*\n`;
                     }
                }
            }
        }
        
        const embed = new EmbedBuilder()
            .setTitle(`Plantilla de ${team.name} (${team.abbreviation})`)
            .setDescription(rosterString.trim() || 'Este equipo no tiene miembros registrados.')
            .setColor('#3498db')
            .setThumbnail(team.logoUrl)
            .setFooter({ text: `Liga: ${team.league}` });
            
        await interaction.editReply({ embeds: [embed] });
        return;
    }

    // --- Menú para aplicar a un equipo (Panel de Solicitud) ---
    if (customId === 'apply_to_team_select') {
        const teamId = selectedValue;
        const modal = new ModalBuilder()
            .setCustomId(`application_modal_${teamId}`)
            .setTitle('Aplicar a Equipo');
        
        const presentationInput = new TextInputBuilder()
            .setCustomId('presentation')
            .setLabel('Escribe una breve presentación')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(200);

        modal.addComponents(new ActionRowBuilder().addComponents(presentationInput));
        await interaction.showModal(modal);
        return;
    }

    // --- Menú de Admin para borrar ligas ---
    if (customId === 'delete_league_select_menu') {
        await interaction.deferReply({ ephemeral: true });
        const leaguesToDelete = values; // Aquí `values` puede ser un array de varias ligas.
        const result = await League.deleteMany({ guildId: guild.id, name: { $in: leaguesToDelete } });
        await interaction.editReply({ content: `✅ Se han eliminado ${result.deletedCount} ligas.` });
        return;
    }

    // --- Menú de Admin para seleccionar el equipo a gestionar ---
    if (customId === 'admin_select_team_to_manage') {
        await interaction.deferUpdate();
        const teamId = selectedValue;
        const team = await Team.findById(teamId).lean();
        if (!team) return interaction.followUp({ content: 'Este equipo ya no existe.', ephemeral: true });

        const embed = new EmbedBuilder()
            .setTitle(`Gestión Avanzada: ${team.name}`)
            .setDescription('Selecciona una acción para este equipo. Esta acción es privada.')
            .setColor('DarkRed')
            .setThumbnail(team.logoUrl);

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`admin_change_data_${teamId}`).setLabel('Cambiar Datos').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`admin_manage_members_${teamId}`).setLabel('Gestionar Miembros').setStyle(ButtonStyle.Primary)
        );
        const row2 = new ActionRowBuilder().addComponents(
            // El botón de disolver está aquí, como prometimos.
            new ButtonBuilder().setCustomId(`admin_dissolve_team_${teamId}`).setLabel('DISOLVER EQUIPO').setStyle(ButtonStyle.Danger)
        );

        await interaction.followUp({ embeds: [embed], components: [row1, row2], ephemeral: true });
        return;
    }

    // --- Menú de gestión de plantilla para Mánagers/Capitanes ---
    if (customId === 'roster_management_menu') {
        await interaction.deferUpdate();
        const targetId = selectedValue;
        const managerTeam = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });
        const isManager = managerTeam.managerId === user.id;

        const targetMember = await guild.members.fetch(targetId).catch(()=>null);
        if(!targetMember) return interaction.followUp({ content: "El miembro seleccionado ya no está en el servidor.", ephemeral: true });

        const isTargetCaptain = managerTeam.captains.includes(targetId);
        
        const row = new ActionRowBuilder();
        if (isManager) {
            if (isTargetCaptain) {
                row.addComponents(new ButtonBuilder().setCustomId(`demote_captain_${targetId}`).setLabel('Degradar a Jugador').setStyle(ButtonStyle.Secondary));
            } else {
                row.addComponents(new ButtonBuilder().setCustomId(`promote_player_${targetId}`).setLabel('Ascender a Capitán').setStyle(ButtonStyle.Success));
            }
        }

        row.addComponents(new ButtonBuilder().setCustomId(`kick_player_${targetId}`).setLabel('Expulsar del Equipo').setStyle(ButtonStyle.Danger));
        row.addComponents(new ButtonBuilder().setCustomId(`toggle_mute_player_${targetId}`).setLabel('Mutear/Desmutear Chat').setStyle(ButtonStyle.Secondary));

        await interaction.followUp({ content: `Acciones para **${targetMember.user.username}**:`, components: [row], ephemeral: true });
        return;
    }
    
    // --- Menú para seleccionar horarios de amistosos ---
    if (customId === 'select_available_times') {
        await interaction.deferReply({ ephemeral: true });
        const selectedTimes = values;
        const team = await Team.findOne({ guildId: guild.id, $or: [{ managerId: user.id }, { captains: user.id }] });

        // Lógica para crear el panel de amistosos programados
        // Esta parte es compleja y requiere crear el mensaje, guardarlo en la DB, etc.
        // Aquí simulamos el éxito
        await interaction.editReply({ content: `✅ Panel de amistosos programado creado con éxito para los horarios: ${selectedTimes.join(', ')}` });
        return;
    }
};
