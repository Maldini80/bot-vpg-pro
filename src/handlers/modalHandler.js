// src/handlers/modalHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, StringSelectMenuBuilder } = require('discord.js');
const Team = require('../models/team.js');
const League = require('../models/league.js');
const PlayerApplication = require('../models/playerApplication.js');
const VPGUser = require('../models/user.js');
const FreeAgent = require('../models/freeAgent.js');
const TeamOffer = require('../models/teamOffer.js');

const POSITIONS = ['POR', 'DFC', 'CARR', 'MCD', 'MV', 'MCO', 'DC'];

module.exports = async (client, interaction) => {
    const { customId, fields, guild, user, member, message } = interaction;

    // --- LÓGICA NUEVA PARA EL REGISTRO DE JUGADOR ---
    if (customId === 'player_registration_modal') {
        // CORRECCIÓN: deferReply() ya estaba aquí, lo cual es correcto.
        await interaction.deferReply({ ephemeral: true }); 

        const vpgUsername = fields.getTextInputValue('vpgUsernameInput');
        const twitterHandle = fields.getTextInputValue('twitterInput');
        const psnId = fields.getTextInputValue('psnIdInput');
        const eaId = fields.getTextInputValue('eaIdInput');

        await VPGUser.findOneAndUpdate(
            { discordId: user.id },
            { vpgUsername, twitterHandle, psnId, eaId },
            { upsert: true, new: true }
        );

        const positionOptions = POSITIONS.map(p => ({ label: p, value: p }));
        
        const primaryMenu = new StringSelectMenuBuilder()
            .setCustomId('register_select_primary_position')
            .setPlaceholder('Selecciona tu Posición Principal (Obligatorio)')
            .addOptions(positionOptions);

        const secondaryMenu = new StringSelectMenuBuilder()
            .setCustomId('register_select_secondary_position')
            .setPlaceholder('Selecciona tu Posición Secundaria (Opcional)')
            .addOptions({ label: 'Ninguna', value: 'NINGUNA' }, ...positionOptions);

        return interaction.editReply({
            content: '**Paso 2 de 2:** ¡Casi hemos terminado! Ahora selecciona tus posiciones en el campo.',
            components: [
                new ActionRowBuilder().addComponents(primaryMenu),
                new ActionRowBuilder().addComponents(secondaryMenu)
            ],
            ephemeral: true
        });
    }

    if (customId === 'edit_profile_modal') {
    // Aplazamos la respuesta para tener tiempo de procesar todo.
    await interaction.deferReply({ ephemeral: true });

    // Recogemos los datos del formulario.
    const vpgUsername = fields.getTextInputValue('vpgUsernameInput');
    const twitterHandle = fields.getTextInputValue('twitterInput');
    const psnId = fields.getTextInputValue('psnIdInput') || null;
    const eaId = fields.getTextInputValue('eaIdInput') || null;

    // Actualizamos la base de datos y pedimos que nos devuelva el perfil actualizado.
    const updatedProfile = await VPGUser.findOneAndUpdate(
        { discordId: user.id },
        { vpgUsername, twitterHandle, psnId, eaId },
        { upsert: true, new: true } // `new: true` es clave para obtener los datos más recientes.
    );

    // Preparamos el mensaje de respuesta.
    let responseMessage = '✅ ¡Tu perfil ha sido actualizado con éxito!';
    const playerRoleId = process.env.PLAYER_ROLE_ID;

    // --- INICIO DE LA NUEVA LÓGICA ---
    // Comprobamos si el usuario tiene una posición principal (perfil completo),
    // si tenemos configurado el rol de jugador, y si el usuario NO tiene ese rol.
    if (updatedProfile && updatedProfile.primaryPosition && playerRoleId && !member.roles.cache.has(playerRoleId)) {
        try {
            // Si cumple las condiciones, le añadimos el rol.
            await member.roles.add(playerRoleId);
            // Y modificamos el mensaje de respuesta para notificarle.
            responseMessage += '\n\n¡Hemos detectado que no tenías el rol de Jugador y te lo hemos asignado!';
        } catch (error) {
            // Si hay un error (ej. el bot no tiene permisos), lo notificamos en consola y al usuario.
            console.error(`Error al asignar rol de jugador a ${user.tag} tras actualizar perfil:`, error);
            responseMessage += '\n\nHubo un problema al intentar asignarte el rol de Jugador. Por favor, contacta a un administrador.';
        }
    }
    // --- FIN DE LA NUEVA LÓGICA ---

    // Enviamos la respuesta final, que puede incluir o no la notificación del rol.
    return interaction.editReply({ content: responseMessage });
}

    if (customId === 'market_agent_modal' || customId.startsWith('market_agent_modal_edit')) {
        await interaction.deferReply({ ephemeral: true });

        const isEditing = customId.startsWith('market_agent_modal_edit');
        
        // --- Lógica de Cooldown ---
        const existingAd = await FreeAgent.findOne({ userId: user.id });
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        if (existingAd && existingAd.updatedAt > threeDaysAgo && !isEditing) { // Solo se aplica al crear.
            return interaction.editReply({ content: `❌ Ya has actualizado tu anuncio en los últimos 3 días.` });
        }
        
        const experience = fields.getTextInputValue('experienceInput');
        const seeking = fields.getTextInputValue('seekingInput');
        const availability = fields.getTextInputValue('availabilityInput');

        const channelId = process.env.PLAYERS_AD_CHANNEL_ID;
        if (!channelId) return interaction.editReply({ content: '❌ Error de configuración: El canal de anuncios para jugadores no está definido.' });
        
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) return interaction.editReply({ content: '❌ Error: No se pudo encontrar el canal de anuncios para jugadores.' });

        const profile = await VPGUser.findOne({ discordId: user.id }).lean();
        if (!profile || !profile.primaryPosition) {
            return interaction.editReply({ content: '❌ Debes completar tu perfil de jugador (con al menos la posición principal) antes de poder anunciarte.' });
        }
        
        const playerAdEmbed = new EmbedBuilder()
            .setAuthor({ name: member.displayName, iconURL: user.displayAvatarURL() })
            .setThumbnail(user.displayAvatarURL())
            .setTitle(`Jugador en busca de equipo: ${member.displayName}`)
            .setColor('Blue')
            .addFields(
                { name: 'Posiciones', value: `**${profile.primaryPosition}** / ${profile.secondaryPosition || 'N/A'}`, inline: true },
                { name: 'Contacto', value: `<@${user.id}>`, inline: true },
                { name: 'IDs de Juego', value: `PSN: ${profile.psnId || 'N/A'}\nEA ID: ${profile.eaId || 'N/A'}`, inline: false },
                { name: 'Experiencia', value: experience, inline: false },
                { name: 'Busco un equipo que...', value: seeking, inline: false },
                { name: 'Disponibilidad', value: availability, inline: false }
            )
            .setTimestamp();
        
        let messageId;
        let responseMessage;

        if (isEditing && existingAd && existingAd.messageId) {
            // --- LÓGICA DE EDICIÓN ---
            try {
                const adMessage = await channel.messages.fetch(existingAd.messageId);
                await adMessage.edit({ embeds: [playerAdEmbed] });
                messageId = existingAd.messageId;
                responseMessage = '✅ ¡Tu anuncio ha sido actualizado con éxito!';
            } catch (error) {
                const newMessage = await channel.send({ embeds: [playerAdEmbed] });
                messageId = newMessage.id;
                responseMessage = '✅ Tu anuncio anterior no se encontró, así que se ha publicado uno nuevo.';
            }
        } else {
            // --- LÓGICA DE CREACIÓN ---
            if (existingAd && existingAd.messageId) {
                try { await channel.messages.delete(existingAd.messageId); } catch(e) {}
            }
            const newMessage = await channel.send({ embeds: [playerAdEmbed] });
            messageId = newMessage.id;
            responseMessage = '✅ ¡Tu anuncio ha sido publicado con éxito!';
        }

        await FreeAgent.findOneAndUpdate(
            { userId: user.id }, 
            { guildId: guild.id, experience, seeking, availability, status: 'ACTIVE', messageId }, 
            { upsert: true, new: true }
        );

        return interaction.editReply({ content: `${responseMessage} en el canal ${channel}` });
    }
    if (customId.startsWith('offer_add_requirements_')) {
    await interaction.deferReply({ ephemeral: true });

    const parts = customId.split('_');
    const teamId = parts[3];
    const positions = parts[4].split('-');
    const requirements = fields.getTextInputValue('requirementsInput');

    const channelId = process.env.TEAMS_AD_CHANNEL_ID;
    if (!channelId) return interaction.editReply({ content: '❌ Error: El canal de ofertas de equipos no está configurado.' });

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return interaction.editReply({ content: '❌ Error: No se pudo encontrar el canal de ofertas de equipos.' });

    const team = await Team.findById(teamId).lean();
    if (!team.logoUrl) {
        return interaction.editReply({ content: '❌ Error: Tu equipo necesita tener un logo configurado para poder publicar.' });
    }

    const teamOfferEmbed = new EmbedBuilder()
        .setAuthor({ name: `${team.name} busca fichajes`, iconURL: team.logoUrl })
        .setColor('#2ECC71')
        .setThumbnail(team.logoUrl)
        .addFields(
            { name: '📄 Posiciones Vacantes', value: `\`\`\`${positions.join(' | ')}\`\`\`` },
            { name: '📋 Requisitos', value: `> ${requirements.replace(/\n/g, '\n> ')}` },
            { name: '🏆 Liga', value: team.league, inline: true },
            { name: '📞 Contacto', value: `<@${team.managerId}>`, inline: true },
            { name: '🐦 Twitter', value: team.twitterHandle ? `[@${team.twitterHandle}](https://twitter.com/${team.twitterHandle})` : 'No especificado', inline: true }
        )
        .setTimestamp();

    // --- INICIO DE LA NUEVA LÓGICA DE EDICIÓN/CREACIÓN ---
    const existingOffer = await TeamOffer.findOne({ teamId: teamId });
    let offerMessage;
    let responseText;

    if (existingOffer && existingOffer.messageId) {
        try {
            // Intenta editar el mensaje existente
            const oldMessage = await channel.messages.fetch(existingOffer.messageId);
            offerMessage = await oldMessage.edit({ embeds: [teamOfferEmbed] });
            responseText = 'actualizada';
        } catch (error) {
            // Si el mensaje fue borrado, crea uno nuevo
            offerMessage = await channel.send({ embeds: [teamOfferEmbed] });
            responseText = 're-publicada (el mensaje anterior no se encontró)';
        }
    } else {
        // Si no hay oferta o no tiene messageId, crea un mensaje nuevo
        offerMessage = await channel.send({ embeds: [teamOfferEmbed] });
        responseText = 'publicada';
    }
    
    // Actualiza la base de datos con el ID del mensaje correcto
    await TeamOffer.findOneAndUpdate(
        { teamId: teamId },
        { guildId: guild.id, postedById: user.id, positions, requirements, messageId: offerMessage.id, status: 'ACTIVE' },
        { upsert: true, new: true }
    );

    return interaction.editReply({ content: `✅ ¡La oferta de tu equipo ha sido ${responseText} con éxito en el canal ${channel}!` });
    // --- FIN DE LA NUEVA LÓGICA ---
}

    if (customId.startsWith('manager_request_modal_')) {
        // CORRECCIÓN: Añadido deferReply al inicio.
        await interaction.deferReply({ ephemeral: true });
        
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
        // CORRECCIÓN: Añadido deferReply al inicio.
        await interaction.deferReply({ ephemeral: true });

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
            // --- INICIO DEL CÓDIGO REEMPLAZADO: Guía completa para el Mánager ---
try {
    const managerGuideEmbed = new EmbedBuilder()
        .setTitle(`👑 ¡Felicidades, Mánager! Tu equipo "${teamName}" ha sido aprobado.`)
        .setColor('Gold')
        .setImage('https://i.imgur.com/KjamtCg.jpeg')
        .setDescription('¡Bienvenido a la élite de la comunidad! Aquí tienes una guía detallada de tus nuevas responsabilidades y herramientas. Tu centro de mando principal es el panel del canal <#1396815967685705738>.')
        .addFields(
            { 
                name: 'Paso 1: Construye tu Plantilla', 
                value: 'Tu prioridad es formar tu equipo. Desde el submenú `Gestionar Plantilla` puedes:\n' +
                       '• **`Invitar Jugador`**: Añade miembros directamente a tu plantilla.\n' +
                       '• **`Ascender a Capitán`**: Delega responsabilidades en jugadores de confianza para que te ayuden con la gestión diaria (amistosos, fichajes).'
            },
            {
                name: 'Paso 2: Mantén tu Equipo Activo',
                value: 'La actividad es clave para el éxito. Desde los submenús correspondientes puedes:\n' +
                       '• **`Gestionar Amistosos`**: Usa `Programar Búsqueda` para anunciar tu disponibilidad con antelación o `Buscar Rival (Ahora)` para un partido inmediato.\n' +
                       '• **`Gestionar Fichajes`**: Usa `Crear / Editar Oferta` para publicar que buscas jugadores. Tu oferta será visible para todos los agentes libres.'
            },
            {
                name: 'Paso 3: Administración y Consejos',
                value: '• **`Editar Datos del Equipo`**: Mantén actualizados el nombre, abreviatura, logo y Twitter de tu equipo.\n' +
                       '• **`Abrir/Cerrar Reclutamiento`**: Controla si tu equipo acepta solicitudes de nuevos miembros.\n' +
                       '• **Consejo Pro**: Usa el comando `/activar-chat-canal` en un canal privado. Esto hará que los mensajes de tus jugadores aparezcan con el logo y nombre del equipo, creando una identidad única.'
            }
        );

    await applicantMember.send({ embeds: [managerGuideEmbed] });
} catch (dmError) {
    console.log(`AVISO: No se pudo enviar el MD de guía al nuevo mánager ${applicantMember.user.tag}.`);
}
// --- FIN DEL CÓDIGO REEMPLAZADO ---
            return interaction.editReply({ content: `✅ Equipo **${teamName}** creado en la liga **${leagueName}**. ${applicantMember.user.tag} es ahora Mánager.` });
        } catch (error) {
            console.error("Error en aprobación de equipo:", error);
            return interaction.editReply({ content: 'Ocurrió un error inesperado.' });
        }
    }
    
    if (customId.startsWith('edit_data_modal_')) {
        // CORRECCIÓN: Añadido deferReply al inicio.
        await interaction.deferReply({ ephemeral: true });

        const teamId = customId.split('_')[3];
        const team = await Team.findById(teamId);
        if (!team) return interaction.editReply({ content: 'El equipo ya no existe.' });
        const isManager = team.managerId === user.id;
        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isManager && !isAdmin) return interaction.editReply({ content: 'No tienes permiso.' });
        const newName = fields.getTextInputValue('newName') || team.name;
        const newAbbr = fields.getTextInputValue('newAbbr')?.toUpperCase() || team.abbreviation;
        const newLogo = fields.getTextInputValue('newLogo') || team.logoUrl;
        const newTwitter = fields.getTextInputValue('newTwitter') || team.twitterHandle;
        if (isManager && !isAdmin) {
            const approvalChannelId = process.env.APPROVAL_CHANNEL_ID;
            if (!approvalChannelId) return interaction.editReply({ content: 'Error: Canal de aprobaciones no configurado.' });
            const approvalChannel = await client.channels.fetch(approvalChannelId);
            const embed = new EmbedBuilder().setTitle('✏️ Solicitud de Cambio de Datos').setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() }).addFields({ name: 'Equipo', value: team.name }, { name: 'Solicitante', value: `<@${user.id}>` }, { name: 'Nuevo Nombre', value: newName }, { name: 'Nueva Abreviatura', value: newAbbr }, { name: 'Nuevo Logo', value: newLogo }, { name: 'Nuevo Twitter', value: newTwitter }).setColor('Blue');
            await approvalChannel.send({ embeds: [embed] });
            return interaction.editReply({ content: '✅ Tu solicitud de cambio ha sido enviada para aprobación.' });
        } else {
            team.name = newName;
            team.abbreviation = newAbbr;
            team.logoUrl = newLogo;
            team.twitterHandle = newTwitter;
            await team.save();
            return interaction.editReply({ content: `✅ Los datos del equipo **${team.name}** han sido actualizados.` });
        }
    }

    if (customId.startsWith('invite_player_modal_')) {
        // CORRECCIÓN: Añadido deferReply al inicio.
        await interaction.deferReply({ ephemeral: true });

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
        // CORRECCIÓN: Añadido deferReply al inicio.
        await interaction.deferReply({ ephemeral: true });

        const leagueName = fields.getTextInputValue('leagueNameInput');
        const existingLeague = await League.findOne({ name: leagueName, guildId: guild.id });
        if (existingLeague) return interaction.editReply({ content: `La liga **${leagueName}** ya existe.` });
        await new League({ name: leagueName, guildId: guild.id }).save();
        return interaction.editReply({ content: `✅ La liga **${leagueName}** ha sido creada.` });
    }

    if (customId.startsWith('confirm_dissolve_modal_')) {
        // CORRECCIÓN: Añadido deferReply al inicio.
        await interaction.deferReply({ ephemeral: true });

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
        // CORRECCIÓN: Añadido deferReply al inicio.
        await interaction.deferReply({ ephemeral: true });

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
};
