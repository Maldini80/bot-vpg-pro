// src/handlers/selectMenuHandler.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const Team = require('../models/team.js');
const VPGUser = require('../models/user.js');
const League = require('../models/league.js');

module.exports = async (client, interaction) => {
    const { customId, values, guild, user } = interaction;
    const selectedValue = values[0];

    // ======================================================================
    // SECCIÓN 1: MENÚS QUE ABREN MODALES (RESPUESTA INSTANTÁNEA)
    // ======================================================================

    if (customId === 'apply_to_team_select') {
        const teamId = selectedValue;
        const modal = new ModalBuilder().setCustomId(`application_modal_${teamId}`).setTitle('Aplicar a Equipo');
        const presentationInput = new TextInputBuilder().setCustomId('presentation').setLabel('Escribe una breve presentación').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(200);
        modal.addComponents(new ActionRowBuilder().addComponents(presentationInput));
        return interaction.showModal(modal);
    }
    
    // Nuevo flujo de registro: después de seleccionar la liga, se muestra el modal.
    if (customId === 'select_league_for_registration') {
        const leagueName = selectedValue;
        const modal = new ModalBuilder().setCustomId(`manager_request_modal_${leagueName}`).setTitle(`Registrar Equipo en ${leagueName}`);
        const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsername').setLabel("Tu nombre de usuario en VPG").setStyle(TextInputStyle.Short).setRequired(true);
        const teamNameInput = new TextInputBuilder().setCustomId('teamName').setLabel("Nombre de tu equipo").setStyle(TextInputStyle.Short).setRequired(true);
        const teamAbbrInput = new TextInputBuilder().setCustomId('teamAbbr').setLabel("Abreviatura (3 letras)").setStyle(TextInputStyle.Short).setRequired(true).setMinLength(3).setMaxLength(3);
        modal.addComponents(new ActionRowBuilder().addComponents(vpgUsernameInput), new ActionRowBuilder().addComponents(teamNameInput), new ActionRowBuilder().addComponents(teamAbbrInput));
        return interaction.showModal(modal);
    }

    // ======================================================================
    // SECCIÓN 2: MENÚS QUE ACTUALIZAN UN MENSAJE (USAN DEFERUPDATE)
    // ======================================================================

    if (customId === 'admin_select_team_to_manage' || customId === 'roster_management_menu') {
        await interaction.deferUpdate();
        
        if (customId === 'admin_select_team_to_manage') {
            const teamId = selectedValue;
            const team = await Team.findById(teamId).lean();
            if (!team) return interaction.editReply({ content: 'Este equipo ya no existe.', components: [] });

            const embed = new EmbedBuilder().setTitle(`Gestión: ${team.name}`).setColor('DarkRed').setThumbnail(team.logoUrl);
            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`admin_change_data_${teamId}`).setLabel('Cambiar Datos').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`admin_manage_members_${teamId}`).setLabel('Gestionar Miembros').setStyle(ButtonStyle.Primary)
            );
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`admin_dissolve_team_${teamId}`).setLabel('DISOLVER EQUIPO').setStyle(ButtonStyle.Danger)
            );
            return interaction.editReply({ content: '', embeds: [embed], components: [row1, row2] });
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
                if (isTargetCaptain) {
                    row.addComponents(new ButtonBuilder().setCustomId(`demote_captain_${targetId}`).setLabel('Degradar a Jugador').setStyle(ButtonStyle.Secondary));
                } else {
                    row.addComponents(new ButtonBuilder().setCustomId(`promote_player_${targetId}`).setLabel('Ascender a Capitán').setStyle(ButtonStyle.Success));
                }
            }
            row.addComponents(new ButtonBuilder().setCustomId(`kick_player_${targetId}`).setLabel('Expulsar del Equipo').setStyle(ButtonStyle.Danger));
            row.addComponents(new ButtonBuilder().setCustomId(`toggle_mute_player_${targetId}`).setLabel('Mutear/Desmutear Chat').setStyle(ButtonStyle.Secondary));
    
            return interaction.editReply({ content: `Acciones para **${targetMember.user.username}**:`, components: [row] });
        }
        return;
    }

    // ======================================================================
    // SECCIÓN 3: MENÚS QUE ENVÍAN RESPUESTAS PRIVADAS (DEFERREPLY)
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
                } catch (error) {
                    rosterString += `> *Usuario no encontrado (ID: ${memberId})*\n`;
                }
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
