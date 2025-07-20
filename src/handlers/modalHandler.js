// src/handlers/modalHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const Team = require('../models/team.js');
const League = require('../models/league.js');
const PlayerApplication = require('../models/playerApplication.js');
const VPGUser = require('../models/user.js');

module.exports = async (client, interaction) => {
    const { customId, fields, guild, user, member } = interaction;
    
    await interaction.deferReply({ ephemeral: true });

    // --- Lógica de Aprobación Final de Equipo ---
    if (customId.startsWith('approve_modal_')) {
        const esAprobador = member.permissions.has(PermissionFlagsBits.Administrator) || member.roles.cache.has(process.env.APPROVER_ROLE_ID);
        if (!esAprobador) return interaction.editReply({ content: 'No tienes permiso.' });

        try {
            // 1. Extraer datos
            const parts = customId.split('_');
            const applicantId = parts[2];
            const originalTeamName = parts.slice(3).join(' '); // No necesitamos el nombre del modal, lo leemos del embed original por seguridad.
            const teamLogoUrl = fields.getTextInputValue('teamLogoUrl');

            // 2. Leer datos del embed original en el canal de aprobaciones
            const originalMessage = interaction.message;
            if (!originalMessage || !originalMessage.embeds[0]) {
                return interaction.editReply({ content: 'Error: No se pudo encontrar la solicitud original.' });
            }
            const embed = originalMessage.embeds[0];
            const teamName = embed.fields.find(f => f.name === 'Nombre del Equipo').value;
            const teamAbbr = embed.fields.find(f => f.name === 'Abreviatura').value;
            const vpgUsername = embed.fields.find(f => f.name === 'Usuario VPG').value;

            // 3. Validaciones
            const applicantMember = await guild.members.fetch(applicantId).catch(() => null);
            if (!applicantMember) {
                return interaction.editReply({ content: `Error: El usuario solicitante (ID: ${applicantId}) ya no está en el servidor.` });
            }
            const existingTeam = await Team.findOne({ $or: [{ name: teamName }, { managerId: applicantId }], guildId: guild.id });
            if (existingTeam) {
                return interaction.editReply({ content: `Error: Ya existe un equipo con el nombre "${teamName}" o el usuario ya es mánager de otro equipo.` });
            }

            // 4. Crear el equipo en la base de datos
            const newTeam = new Team({
                name: teamName,
                abbreviation: teamAbbr,
                guildId: guild.id,
                league: 'Por asignar', // O puedes añadir un selector de liga
                logoUrl: teamLogoUrl,
                managerId: applicantId,
                captains: [],
                players: [],
                recruitmentOpen: true
            });
            await newTeam.save();

            // 5. Actualizar roles y apodo del nuevo mánager
            await applicantMember.roles.add(process.env.MANAGER_ROLE_ID);
            await applicantMember.roles.add(process.env.PLAYER_ROLE_ID); // Los mánagers suelen ser también jugadores
            await applicantMember.setNickname(`|MG| ${teamAbbr} ${applicantMember.user.username}`).catch(err => console.log(`No se pudo cambiar el apodo de ${applicantMember.user.tag}: ${err.message}`));

            // 6. Deshabilitar botones en el mensaje de solicitud
            const disabledRow = new ActionRowBuilder().addComponents(
                ButtonBuilder.from(originalMessage.components[0].components[0]).setDisabled(true).setLabel('Aprobado'),
                ButtonBuilder.from(originalMessage.components[0].components[1]).setDisabled(true)
            );
            await originalMessage.edit({ components: [disabledRow] });

            // 7. Notificar
            await applicantMember.send(`¡Felicidades! Tu solicitud para el equipo **${teamName}** ha sido **aprobada**. Ahora eres el Mánager.`).catch(() => {});
            return interaction.editReply({ content: `✅ ¡Éxito! El equipo **${teamName}** ha sido creado y ${applicantMember.user.tag} ha sido asignado como Mánager.` });

        } catch (error) {
            console.error("Error durante la aprobación final del equipo:", error);
            return interaction.editReply({ content: 'Ocurrió un error inesperado al procesar la aprobación.' });
        }
    }
    
    if (customId === 'manager_request_modal') {
        const vpgUsername = fields.getTextInputValue('vpgUsername');
        const teamName = fields.getTextInputValue('teamName');
        const teamAbbr = fields.getTextInputValue('teamAbbr').toUpperCase();
        const approvalChannelId = process.env.APPROVAL_CHANNEL_ID;
        if (!approvalChannelId) return interaction.editReply({ content: 'Error: El canal de aprobaciones no está configurado. Contacta a un administrador.' });
        const approvalChannel = await client.channels.fetch(approvalChannelId).catch(() => null);
        if(!approvalChannel) return interaction.editReply({ content: 'Error: No se pudo encontrar el canal de aprobaciones.' });
        const normalizedTeamName = teamName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
        const embed = new EmbedBuilder().setTitle('📝 Nueva Solicitud de Registro de Equipo').setColor('Orange').setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() }).addFields({ name: 'Solicitante', value: `<@${user.id}>`, inline: true }, { name: 'ID del Solicitante', value: `\`${user.id}\``, inline: true }, { name: 'Usuario VPG', value: vpgUsername, inline: false }, { name: 'Nombre del Equipo', value: teamName, inline: true }, { name: 'Abreviatura', value: teamAbbr, inline: true }).setTimestamp();
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`approve_request_${user.id}_${normalizedTeamName}`).setLabel('Aprobar').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`reject_request_${user.id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger));
        await approvalChannel.send({ embeds: [embed], components: [row] });
        return interaction.editReply({ content: '✅ ¡Tu solicitud ha sido enviada! Un administrador la revisará pronto.' });
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
                    await member.send(`El equipo **${team.name}** ha sido disuelto por un administrador.`).catch(() => {});
                }
            } catch (error) { /* Ignorar si el miembro ya no está en el servidor */ }
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
        if(!manager) return interaction.editReply({ content: 'No se pudo encontrar al mánager de este equipo.' });
        const presentation = fields.getTextInputValue('presentation');
        const application = await PlayerApplication.create({ userId: user.id, teamId: teamId, presentation: presentation });
        const embed = new EmbedBuilder().setTitle(`✉️ Nueva solicitud para ${team.name}`).setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() }).setDescription(presentation).setColor('Blue');
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`accept_application_${application._id}`).setLabel('Aceptar').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`reject_application_${application._id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger));
        try {
            await manager.send({ embeds: [embed], components: [row] });
            return interaction.editReply({ content: `✅ Tu solicitud para unirte a **${team.name}** ha sido enviada.` });
        } catch (error) {
            await PlayerApplication.findByIdAndDelete(application._id);
            return interaction.editReply({ content: `❌ No se pudo enviar la solicitud. El mánager tiene los MDs cerrados.` });
        }
    }

    return interaction.editReply({ content: 'Acción no reconocida.' });
};
