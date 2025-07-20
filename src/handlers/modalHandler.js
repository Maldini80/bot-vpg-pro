// src/handlers/modalHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Team = require('../models/team.js');
const League = require('../models/league.js');
const PlayerApplication = require('../models/playerApplication.js');
const VPGUser = require('../models/user.js');

module.exports = async (client, interaction) => {
    const { customId, fields, guild, user } = interaction;
    
    // --- Modal de Admin para crear una nueva liga ---
    if (customId === 'create_league_modal') {
        await interaction.deferReply({ ephemeral: true });
        const leagueName = fields.getTextInputValue('leagueNameInput');
        const existingLeague = await League.findOne({ name: leagueName, guildId: guild.id });
        if (existingLeague) {
            return interaction.editReply({ content: `La liga **${leagueName}** ya existe.` });
        }
        await new League({ name: leagueName, guildId: guild.id }).save();
        await interaction.editReply({ content: `✅ La liga **${leagueName}** ha sido creada con éxito.` });
        return;
    }

    // --- Modal para solicitar el registro de un nuevo equipo ---
    if (customId === 'manager_request_modal') {
        await interaction.deferReply({ ephemeral: true });
        const vpgUsername = fields.getTextInputValue('vpgUsername');
        const teamName = fields.getTextInputValue('teamName');
        const teamAbbr = fields.getTextInputValue('teamAbbr').toUpperCase();
        
        const approvalChannelId = process.env.APPROVAL_CHANNEL_ID;
        if (!approvalChannelId) return interaction.editReply({ content: 'El canal de aprobaciones no está configurado. Contacta a un administrador.' });
        
        const approvalChannel = await client.channels.fetch(approvalChannelId);
        if(!approvalChannel) return interaction.editReply({ content: 'Error al encontrar el canal de aprobaciones.' });

        // Normalizamos el nombre del equipo para usarlo en el customId
        const normalizedTeamName = teamName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');

        const embed = new EmbedBuilder()
            .setTitle('📝 Nueva Solicitud de Registro de Equipo')
            .setColor('Orange')
            .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
            .addFields(
                { name: 'Solicitante', value: `<@${user.id}>`, inline: true },
                { name: 'ID del Solicitante', value: `\`${user.id}\``, inline: true },
                { name: 'Usuario VPG', value: vpgUsername, inline: false },
                { name: 'Nombre del Equipo', value: teamName, inline: true },
                { name: 'Abreviatura', value: teamAbbr, inline: true },
            )
            .setTimestamp();
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`approve_request_${user.id}_${normalizedTeamName}`).setLabel('Aprobar').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_request_${user.id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
        );

        await approvalChannel.send({ embeds: [embed], components: [row] });
        await interaction.editReply({ content: '✅ ¡Tu solicitud ha sido enviada! Un administrador la revisará pronto.' });
        return;
    }
    
    // --- Modal de confirmación para disolver un equipo ---
    if (customId.startsWith('confirm_dissolve_modal_')) {
        await interaction.deferReply({ ephemeral: true });
        const teamId = customId.split('_')[3];
        const team = await Team.findById(teamId);
        if (!team) return interaction.editReply({ content: 'El equipo ya no existe.' });

        const confirmationText = fields.getTextInputValue('confirmation_text');
        if (confirmationText !== team.name) {
            return interaction.editReply({ content: `❌ Confirmación incorrecta. La disolución del equipo **${team.name}** ha sido cancelada.` });
        }

        const memberIds = [team.managerId, ...team.captains, ...team.players].filter(id => id);
        
        for (const memberId of memberIds) {
            try {
                const member = await guild.members.fetch(memberId);
                if (member) {
                    await member.roles.remove([process.env.MANAGER_ROLE_ID, process.env.CAPTAIN_ROLE_ID, process.env.PLAYER_ROLE_ID, process.env.MUTED_ROLE_ID]).catch(() => {});
                    if (member.id !== guild.ownerId) await member.setNickname(member.user.username).catch(() => {});
                    await member.send(`El equipo **${team.name}** ha sido disuelto por un administrador. Has sido desvinculado del equipo.`).catch(() => {});
                }
            } catch (error) {
                console.log(`No se pudo procesar al miembro ${memberId} durante la disolución. Probablemente ya no está en el servidor.`);
            }
        }
        
        await Team.deleteOne({ _id: teamId });
        await PlayerApplication.deleteMany({ teamId: teamId });
        await VPGUser.updateMany({ teamName: team.name }, { $set: { teamName: null, teamLogoUrl: null, isManager: false } });

        await interaction.editReply({ content: `✅ El equipo **${team.name}** ha sido disuelto exitosamente.` });

        const logChannelId = process.env.LOG_CHANNEL_ID;
        if(logChannelId) {
            const logChannel = await client.channels.fetch(logChannelId).catch(()=>null);
            if(logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('Equipo Disuelto')
                    .setDescription(`El equipo **${team.name}** fue disuelto por ${user.tag}.`)
                    .setColor('Red')
                    .setTimestamp();
                logChannel.send({ embeds: [logEmbed] });
            }
        }
        return;
    }

    // --- Modal para cuando un jugador aplica a un equipo ---
    if (customId.startsWith('application_modal_')) {
        await interaction.deferReply({ ephemeral: true });
        const teamId = customId.split('_')[2];
        const team = await Team.findById(teamId);
        if(!team || !team.recruitmentOpen) {
            return interaction.editReply({ content: 'Este equipo ya no existe o ha cerrado su reclutamiento.' });
        }

        const manager = await client.users.fetch(team.managerId).catch(()=>null);
        if(!manager) {
            return interaction.editReply({ content: 'No se pudo encontrar al mánager de este equipo para enviar tu solicitud.' });
        }

        const presentation = fields.getTextInputValue('presentation');

        const application = await PlayerApplication.create({
            userId: user.id,
            teamId: teamId,
            presentation: presentation,
        });

        const embed = new EmbedBuilder()
            .setTitle(`✉️ Nueva solicitud para unirse a ${team.name}`)
            .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
            .setDescription(presentation)
            .setColor('Blue')
            .setFooter({ text: 'Puedes aceptar o rechazar esta solicitud a continuación.' });
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`accept_application_${application._id}`).setLabel('Aceptar').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_application_${application._id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
        );

        try {
            await manager.send({ embeds: [embed], components: [row] });
            await interaction.editReply({ content: `✅ Tu solicitud para unirte a **${team.name}** ha sido enviada al mánager.` });
        } catch (error) {
            await interaction.editReply({ content: `❌ No se pudo enviar la solicitud. Es posible que el mánager del equipo tenga los MDs cerrados.` });
            await PlayerApplication.findByIdAndDelete(application._id); // Limpia la aplicación fallida
        }
        return;
    }
    
    // Si ninguna de las condiciones anteriores se cumple
    await interaction.reply({ content: 'Este formulario se ha procesado, pero no se ha encontrado una acción correspondiente.', ephemeral: true });
};
