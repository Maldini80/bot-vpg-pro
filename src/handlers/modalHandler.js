// src/handlers/modalHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const Team = require('../models/team.js');
const League = require('../models/league.js');
const PlayerApplication = require('../models/playerApplication.js');
const VPGUser = require('../models/user.js');
const FreeAgent = require('../models/freeAgent.js');

module.exports = async (client, interaction) => {
    // CORRECCIÓN: Responder inmediatamente a la interacción del modal.
    // Usamos flags: 64 que es lo mismo que ephemeral: true, para evitar el warning de deprecación.
    await interaction.deferReply({ flags: 64 });

    const { customId, fields, guild, user, member, message } = interaction;
    
    if (customId === 'edit_profile_modal') {
        const vpgUsername = fields.getTextInputValue('vpgUsernameInput');
        const twitterHandle = fields.getTextInputValue('twitterInput');
        await VPGUser.findOneAndUpdate(
            { discordId: user.id },
            { vpgUsername: vpgUsername, twitterHandle: twitterHandle, lastUpdated: Date.now() },
            { upsert: true, new: true }
        );
        return interaction.editReply({ content: '✅ ¡Perfil actualizado con éxito!' });
    }

    if (customId === 'market_agent_modal') {
        const userProfile = await VPGUser.findOne({ discordId: user.id });
        if (!userProfile || !userProfile.primaryPosition) {
            return interaction.editReply({ content: '❌ Antes de anunciarte, debes configurar tu perfil y tu posición principal usando el botón "✏️ Editar Perfil".' });
        }
        const description = fields.getTextInputValue('descriptionInput');
        const availability = fields.getTextInputValue('availabilityInput');
        await FreeAgent.findOneAndUpdate(
            { userId: user.id },
            { guildId: guild.id, description: description, availability: availability, status: 'ACTIVE' },
            { upsert: true, new: true }
        );
        return interaction.editReply({ content: '✅ ¡Tu anuncio como agente libre ha sido publicado/actualizado! Los mánagers ahora podrán encontrarte usando el buscador.' });
    }
    
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
