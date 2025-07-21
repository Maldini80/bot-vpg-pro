// src/handlers/selectMenuHandler.js
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const Team = require('../models/team.js');
const VPGUser = require('../models/user.js');
const League = require('../models/league.js');
const AvailabilityPanel = require('../models/availabilityPanel.js');

module.exports = async (client, interaction) => {
    const { customId, values, guild, user } = interaction;
    const selectedValue = values[0];

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
};```

### **2. `src/handlers/modalHandler.js` (Archivo Completo y Corregido)**

```javascript
// src/handlers/modalHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const Team = require('../models/team.js');
const League = require('../models/league.js');
const PlayerApplication = require('../models/playerApplication.js');
const VPGUser = require('../models/user.js');

module.exports = async (client, interaction) => {
    await interaction.deferReply({ flags: 64 });
    const { customId, fields, guild, user, member, message } = interaction;
    
    if (customId.startsWith('manager_request_modal_')) {
        const leagueName = customId.split('_')[3];
        const vpgUsername = fields.getTextInputValue('vpgUsername');
        const teamName = fields.getTextInputValue('teamName');
        const teamAbbr = fields.getTextInputValue('teamAbbr').toUpperCase();
        const approvalChannelId = process.env.APPROVAL_CHANNEL_ID;
        if (!approvalChannelId) return interaction.editReply({ content: 'Error: El canal de aprobaciones no está configurado.' });
        const approvalChannel = await client.channels.fetch(approvalChannelId).catch(() => null);
        if(!approvalChannel) return interaction.editReply({ content: 'Error: No se pudo encontrar el canal de aprobaciones.' });
        const embed = new EmbedBuilder().setTitle('📝 Nueva Solicitud de Registro').setColor('Orange').setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() }).addFields({ name: 'Solicitante', value: `<@${user.id}>` }, { name: 'Usuario VPG', value: vpgUsername }, { name: 'Nombre del Equipo', value: teamName }, { name: 'Abreviatura', value: teamAbbr }, { name: 'Liga Seleccionada', value: leagueName }).setTimestamp();
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`approve_request_${user.id}_${leagueName}`).setLabel('Aprobar').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`reject_request_${user.id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger));
        await approvalChannel.send({ embeds: [embed], components: [row] });
        return interaction.editReply({ content: '✅ ¡Tu solicitud ha sido enviada!' });
    }
    
    if (customId.startsWith('approve_modal_')) {
        const esAprobador = member.permissions.has(PermissionFlagsBits.Administrator) || member.roles.cache.has(process.env.APPROVER_ROLE_ID);
        if (!esAprobador) return interaction.editReply({ content: 'No tienes permiso.' });
        try {
            const parts = customId.split('_');
            const applicantId = parts[2];
            const leagueName = parts[3];
            const teamLogoUrl = fields.getTextInputValue('teamLogoUrl');
            const originalMessage = message;
            if (!originalMessage || !originalMessage.embeds[0]) return interaction.editReply({ content: 'Error: No se pudo encontrar la solicitud original.' });
            const embed = originalMessage.embeds[0];
            const teamName = embed.fields.find(f => f.name === 'Nombre del Equipo').value;
            const teamAbbr = embed.fields.find(f => f.name === 'Abreviatura').value;
            const applicantMember = await guild.members.fetch(applicantId).catch(() => null);
            if (!applicantMember) return interaction.editReply({ content: `Error: El usuario solicitante ya no está en el servidor.` });
            const existingTeam = await Team.findOne({ $or: [{ name: teamName }, { managerId: applicantId }], guildId: guild.id });
            if (existingTeam) return interaction.editReply({ content: `Error: Ya existe un equipo con ese nombre o el usuario ya es mánager.` });
            const newTeam = new Team({ name: teamName, abbreviation: teamAbbr, guildId: guild.id, league: leagueName, logoUrl: teamLogoUrl, managerId: applicantId });
            await newTeam.save();
            await applicantMember.roles.add(process.env.MANAGER_ROLE_ID);
            await applicantMember.roles.add(process.env.PLAYER_ROLE_ID);
            await applicantMember.setNickname(`|MG| ${teamAbbr} ${applicantMember.user.username}`).catch(err => console.log(`No se pudo cambiar apodo: ${err.message}`));
            const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(originalMessage.components[0].components[0]).setDisabled(true).setLabel('Aprobado'), ButtonBuilder.from(originalMessage.components[0].components[1]).setDisabled(true));
            await originalMessage.edit({ components: [disabledRow] });
            await applicantMember.send(`¡Felicidades! Tu solicitud para el equipo **${teamName}** ha sido **aprobada**.`).catch(() => {});
            return interaction.editReply({ content: `✅ Equipo **${teamName}** creado en la liga **${leagueName}**. ${applicantMember.user.tag} es ahora Mánager.` });
        } catch (error) {
            console.error("Error en aprobación de equipo:", error);
            return interaction.editReply({ content: 'Ocurrió un error inesperado.' });
        }
    }
    
    if (customId.startsWith('edit_data_modal_')) {
        const teamId = customId.split('_')[3];
        const team = await Team.findById(teamId);
        if (!team) return interaction.editReply({ content: 'El equipo ya no existe.' });
        const isManager = team.managerId === user.id;
        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isManager && !isAdmin) return interaction.editReply({ content: 'No tienes permiso.' });
        const newName = fields.getTextInputValue('newName') || team.name;
        const newAbbr = fields.getTextInputValue('newAbbr')?.toUpperCase() || team.abbreviation;
        const newLogo = fields.getTextInputValue('newLogo') || team.logoUrl;
        if (isManager && !isAdmin) {
            const approvalChannelId = process.env.APPROVAL_CHANNEL_ID;
            if (!approvalChannelId) return interaction.editReply({ content: 'Error: Canal de aprobaciones no configurado.' });
            const approvalChannel = await client.channels.fetch(approvalChannelId);
            const embed = new EmbedBuilder().setTitle('✏️ Solicitud de Cambio de Datos').setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() }).addFields({ name: 'Equipo', value: team.name }, { name: 'Solicitante', value: `<@${user.id}>` }, { name: 'Nuevo Nombre', value: newName }, { name: 'Nueva Abreviatura', value: newAbbr }, { name: 'Nuevo Logo', value: newLogo }).setColor('Blue');
            await approvalChannel.send({ embeds: [embed] });
            return interaction.editReply({ content: '✅ Tu solicitud de cambio ha sido enviada para aprobación.' });
        } else {
            team.name = newName;
            team.abbreviation = newAbbr;
            team.logoUrl = newLogo;
            await team.save();
            return interaction.editReply({ content: `✅ Los datos del equipo **${team.name}** han sido actualizados.` });
        }
    }

    if (customId.startsWith('invite_player_modal_')) {
        const teamId = customId.split('_')[3];
        const team = await Team.findById(teamId);
        if (!team) return interaction.editReply({ content: 'Tu equipo ya no existe.' });

        const playerNameInput = fields.getTextInputValue('playerName').toLowerCase();
        
        const members = await guild.members.fetch();
        const targetMembers = members.filter(m => 
            !m.user.bot && (
                m.user.username.toLowerCase().includes(playerNameInput) || 
                (m.nickname && m.nickname.toLowerCase().includes(playerNameInput))
            )
        );

        if (targetMembers.size === 0) {
            return interaction.editReply({ content: `❌ No se encontró a ningún miembro que contenga "${playerNameInput}" en su nombre.` });
        }

        if (targetMembers.size > 1) {
            const memberNames = targetMembers.map(m => m.user.tag).slice(0, 10).join(', ');
            return interaction.editReply({ content: `Se encontraron varios miembros: **${memberNames}**... Por favor, sé más específico.` });
        }

        const targetMember = targetMembers.first();

        const isManager = await Team.findOne({ managerId: targetMember.id });
        if (isManager) {
            return interaction.editReply({ content: `❌ No puedes invitar a **${targetMember.user.tag}** porque ya es Mánager del equipo **${isManager.name}**.` });
        }

        const embed = new EmbedBuilder().setTitle(`📩 Invitación de Equipo`).setDescription(`Has sido invitado a unirte a **${team.name}**.`).setColor('Green').setThumbnail(team.logoUrl);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`accept_invite_${team._id}_${targetMember.id}`).setLabel('Aceptar').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`reject_invite_${team._id}_${targetMember.id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger));
        
        try {
            await targetMember.send({ embeds: [embed], components: [row] });
            return interaction.editReply({ content: `✅ Invitación enviada a **${targetMember.user.tag}**.` });
        } catch (error) {
            return interaction.editReply({ content: `❌ No se pudo enviar la invitación a ${targetMember.user.tag}. Es posible que tenga los MDs cerrados.` });
        }
    }

    if (customId === 'create_league_modal') {
        const leagueName = fields.getTextInputValue('leagueNameInput');
        const existingLeague = await League.findOne({ name: leagueName, guildId: guild.id });
        if (existingLeague) return interaction.editReply({ content: `La liga **${leagueName}** ya existe.` });
        await new League({ name: leagueName, guildId: guild.id }).save();
        return interaction.editReply({ content: `✅ La liga **${leagueName}** ha sido creada.` });
    }

    if (customId.startsWith('confirm_dissolve_modal_')) {
        const teamId = customId.split('_')[3];
        const team = await Team.findById(teamId);
        if (!team) return interaction.editReply({ content: 'El equipo ya no existe.' });
        const confirmationText = fields.getTextInputValue('confirmation_text');
        if (confirmationText !== team.name) return interaction.editReply({ content: `❌ Confirmación incorrecta. Disolución cancelada.` });
        const memberIds = [team.managerId, ...team.captains, ...team.players].filter(id => id);
        for (const memberId of memberIds) {
            try {
                const member = await guild.members.fetch(memberId);
                if (member) {
                    await member.roles.remove([process.env.MANAGER_ROLE_ID, process.env.CAPTAIN_ROLE_ID, process.env.PLAYER_ROLE_ID, process.env.MUTED_ROLE_ID]).catch(() => {});
                    if (member.id !== guild.ownerId) await member.setNickname(member.user.username).catch(() => {});
                    await member.send(`El equipo **${team.name}** ha sido disuelto.`).catch(() => {});
                }
            } catch (error) { /* Ignorar */ }
        }
        await Team.deleteOne({ _id: teamId });
        await PlayerApplication.deleteMany({ teamId: teamId });
        await VPGUser.updateMany({ teamName: team.name }, { $set: { teamName: null, teamLogoUrl: null, isManager: false } });
        return interaction.editReply({ content: `✅ El equipo **${team.name}** ha sido disuelto.` });
    }
    
    if (customId.startsWith('application_modal_')) {
        const teamId = customId.split('_')[2];
        const team = await Team.findById(teamId);
        if(!team || !team.recruitmentOpen) return interaction.editReply({ content: 'Este equipo ya no existe o ha cerrado su reclutamiento.' });
        const manager = await client.users.fetch(team.managerId).catch(()=>null);
        if(!manager) return interaction.editReply({ content: 'No se pudo encontrar al mánager.' });
        const presentation = fields.getTextInputValue('presentation');
        const application = await PlayerApplication.create({ userId: user.id, teamId: teamId, presentation: presentation });
        const embed = new EmbedBuilder().setTitle(`✉️ Nueva solicitud para ${team.name}`).setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() }).setDescription(presentation).setColor('Blue');
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`accept_application_${application._id}`).setLabel('Aceptar').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`reject_application_${application._id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger));
        try {
            await manager.send({ embeds: [embed], components: [row] });
            return interaction.editReply({ content: `✅ Tu solicitud para **${team.name}** ha sido enviada.` });
        } catch (error) {
            await PlayerApplication.findByIdAndDelete(application._id);
            return interaction.editReply({ content: `❌ No se pudo enviar la solicitud. El mánager tiene los MDs cerrados.` });
        }
    }
    
    if (customId.startsWith('challenge_modal_')) {
        const parts = customId.split('_');
        const panelId = parts[2];
        const time = parts[3];
        const challengerTeamId = parts[4];
        
        const presentation = fields.getTextInputValue('presentation');
        const panel = await AvailabilityPanel.findOne({ _id: panelId }).populate('teamId');
        if (!panel) return interaction.editReply({ content: 'Este panel de amistosos ya no existe.' });
        
        const hostManager = await client.users.fetch(panel.postedById).catch(() => null);
        if (!hostManager) return interaction.editReply({ content: 'No se pudo encontrar al creador del panel.' });
        
        const challengerTeam = await Team.findById(challengerTeamId);
        
        const embed = new EmbedBuilder()
            .setTitle(`⚔️ ¡Nuevo Desafío para las ${time}!`)
            .setAuthor({ name: challengerTeam.name, iconURL: challengerTeam.logoUrl })
            .setDescription(`**El equipo ${challengerTeam.name} quiere jugar contra vosotros.**\n\nMensaje:\n>>> ${presentation}`)
            .setColor('Yellow')
            .setFooter({ text: `Puedes aceptar o rechazar este desafío a continuación.` });
            
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`accept_challenge_${panel._id}_${time}_${challengerTeamId}_${user.id}`).setLabel('Aceptar Desafío').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_challenge_${panel._id}_${time}_${challengerTeamId}_${user.id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
        );
        
        try {
            await hostManager.send({ embeds: [embed], components: [row] });
            return interaction.editReply({ content: `✅ Tu desafío para las **${time}** ha sido enviado a **${panel.teamId.name}**.` });
        } catch (error) {
            return interaction.editReply({ content: `❌ No se pudo enviar el desafío. El mánager de ${panel.teamId.name} podría tener los MDs cerrados.` });
        }
    }
};
