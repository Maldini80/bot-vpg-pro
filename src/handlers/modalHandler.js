// src/handlers/modalHandler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const Team = require('../models/team.js');
const League = require('../models/league.js');
const PlayerApplication = require('../models/playerApplication.js');
const VPGUser = require('../models/user.js');
const FreeAgent = require('../models/freeAgent.js');
const TeamOffer = require('../models/teamOffer.js');

const POSITIONS = ['POR', 'DFC', 'CARR', 'MCD', 'MV', 'MCO', 'DC'];

// --- Función de Ayuda para Parsear Datos (la necesitamos aquí) ---
function parseTeamData(dataString) {
    const data = {};
    dataString.split('|||').forEach(part => {
        const [key, value] = part.split(':', 2);
        data[key] = value === 'none' ? null : value;
    });
    return data;
}

// --- Función de Ayuda para Enviar Solicitud (la necesitamos aquí) ---
async function sendApprovalRequest(interaction, client, { vpg, name, abbr, twitter, leagueName, logoUrl }) {
    const approvalChannelId = process.env.APPROVAL_CHANNEL_ID;
    if (!approvalChannelId) return;
    const approvalChannel = await client.channels.fetch(approvalChannelId).catch(() => null);
    if (!approvalChannel) return;

    const embed = new EmbedBuilder()
        .setTitle('📝 Nueva Solicitud de Registro')
        .setColor('Orange')
        .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
        .setThumbnail(logoUrl && logoUrl.startsWith('http') ? logoUrl : null)
        .addFields(
            { name: 'Usuario VPG', value: vpg },
            { name: 'Nombre del Equipo', value: name },
            { name: 'Abreviatura', value: abbr },
            { name: 'Twitter del Equipo', value: twitter || 'No especificado' },
            { name: 'URL del Logo', value: `[Ver Logo](${logoUrl})` },
            { name: 'Liga Seleccionada', value: leagueName }
        )
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`approve_request_${interaction.user.id}_${leagueName}`).setLabel('Aprobar').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`reject_request_${interaction.user.id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger)
    );
    await approvalChannel.send({ content: `**Solicitante:** <@${interaction.user.id}>`, embeds: [embed], components: [row] });
}


module.exports = async (client, interaction) => {
    const { customId, fields, guild, user, member, message } = interaction;

    if (customId === 'player_registration_modal') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 

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
            flags: MessageFlags.Ephemeral
        });
    }

    if (customId === 'edit_profile_modal') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const vpgUsername = fields.getTextInputValue('vpgUsernameInput');
        const twitterHandle = fields.getTextInputValue('twitterInput');
        const psnId = fields.getTextInputValue('psnIdInput') || null;
        const eaId = fields.getTextInputValue('eaIdInput') || null;

        const updatedProfile = await VPGUser.findOneAndUpdate(
            { discordId: user.id },
            { vpgUsername, twitterHandle, psnId, eaId },
            { upsert: true, new: true }
        );

        let responseMessage = '✅ ¡Tu perfil ha sido actualizado con éxito!';
        const playerRoleId = process.env.PLAYER_ROLE_ID;

        if (updatedProfile && updatedProfile.primaryPosition && playerRoleId && !member.roles.cache.has(playerRoleId)) {
            try {
                await member.roles.add(playerRoleId);
                responseMessage += '\n\n¡Hemos detectado que no tenías el rol de Jugador y te lo hemos asignado!';
            } catch (error) {
                console.error(`Error al asignar rol de jugador a ${user.tag} tras actualizar perfil:`, error);
                responseMessage += '\n\nHubo un problema al intentar asignarte el rol de Jugador. Por favor, contacta a un administrador.';
            }
        }
        
        const managerRoleId = process.env.MANAGER_ROLE_ID;
        const captainRoleId = process.env.CAPTAIN_ROLE_ID;
        const isManagerOrCaptain = member.roles.cache.has(managerRoleId) || member.roles.cache.has(captainRoleId);

        if (!isManagerOrCaptain) {
            try {
                const playerGuideEmbed = new EmbedBuilder()
                    .setTitle('✅ ¡Perfil Actualizado! Aquí tienes tu Guía de Jugador.')
                    .setColor('Green')
                    .setImage('https://i.imgur.com/7sB0gaa.jpg')
                    .setDescription(`¡Hola, ${member.user.username}! Hemos actualizado tu perfil. Te recordamos las herramientas que tienes a tu disposición como jugador:`)
                    .addFields(
                        { name: '➡️ ¿Ya tienes equipo pero necesitas unirte en Discord?', value: 'Tienes dos formas de hacerlo:\n1. **La más recomendada:** Habla con tu **Mánager o Capitán**. Ellos pueden usar la función `Invitar Jugador` desde su panel para añadirte al instante.\n2. **Si prefieres tomar la iniciativa:** Puedes ir al panel de <#1396815232122228827>, pulsar `Acciones de Jugador` -> `Aplicar a un Equipo`, buscar tu club en la lista y enviarles una solicitud formal.' },
                        { name: '🔎 ¿Buscas un nuevo reto? Guía Completa del Mercado de Fichajes', value: 'El canal <#1402608609724072040> es tu centro de operaciones.\n• **Para anunciarte**: Usa `Anunciarse como Agente Libre`. Si ya tenías un anuncio publicado, **este será reemplazado automáticamente por el nuevo**, nunca tendrás duplicados. Esta acción de publicar/reemplazar tu anuncio solo se puede realizar **una vez cada 3 días**.\n• **Para buscar**: Usa `Buscar Ofertas de Equipo` para ver qué equipos han publicado vacantes y qué perfiles necesitan.\n• **Para administrar tu anuncio**: Usa `Gestionar mi Anuncio` en cualquier momento para **editar** los detalles o **borrarlo** definitivamente si encuentras equipo.'},
                        { name: '⚙️ Herramientas Clave de tu Carrera', value: 'Desde el panel principal de <#1396815232122228827> (`Acciones de Jugador`) tienes control total:\n• **`Actualizar Perfil`**: Es crucial que mantengas tus IDs de juego (PSN, EA) actualizados.\n• **`Abandonar Equipo`**: Si en el futuro decides dejar tu equipo actual, esta opción te dará total independencia para hacerlo.'}
                    );
                
                await member.send({ embeds: [playerGuideEmbed] });
                responseMessage += '\n\nℹ️ Te hemos enviado un recordatorio de tu guía de jugador por MD.';

            } catch (dmError) {
                console.log(`AVISO: No se pudo enviar el MD de recordatorio al jugador ${member.user.tag} (flujo de actualización).`);
            }
        }

        return interaction.editReply({ content: responseMessage });
    }

    if (customId.startsWith('manager_request_modal_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const leagueName = customId.split('_')[3];
        const vpgUsername = fields.getTextInputValue('vpgUsername');
        const teamName = fields.getTextInputValue('teamName');
        const teamAbbr = fields.getTextInputValue('teamAbbr').toUpperCase();
        const teamTwitter = fields.getTextInputValue('teamTwitterInput');

        const teamDataString = `vpg:${vpgUsername}|||name:${teamName}|||abbr:${teamAbbr}|||twitter:${teamTwitter || 'none'}`;

        const embed = new EmbedBuilder()
            .setTitle('✅ Datos guardados. ¿Quieres añadir un logo a tu equipo?')
            .setDescription('Este paso es opcional. Puedes subir un logo personalizado para tu club o usar uno genérico proporcionado por la comunidad.')
            .setColor('Green');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ask_logo_yes_${leagueName}_${teamDataString}`)
                .setLabel('Sí, añadir logo')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🖼️'),
            new ButtonBuilder()
                .setCustomId(`ask_logo_no_${leagueName}_${teamDataString}`)
                .setLabel('No, usar logo por defecto')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🛡️')
        );
        
        await interaction.editReply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    }

    if (customId.startsWith('final_logo_submit_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const parts = customId.split('_');
        const leagueName = parts[3];
        const teamDataString = parts.slice(4).join('_');
        
        const teamData = parseTeamData(teamDataString);
        const logoUrl = fields.getTextInputValue('teamLogoUrlInput');

        await sendApprovalRequest(interaction, client, { ...teamData, vpg: teamData.vpg, name: teamData.name, abbr: teamData.abbr, twitter: teamData.twitter, leagueName, logoUrl });
        
        await interaction.editReply({ content: '✅ ¡Perfecto! Tu solicitud ha sido enviada con tu logo personalizado. Un administrador la revisará.', components: [] });
    }

    if (customId.startsWith('edit_data_modal_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const teamId = customId.split('_')[3];
        const team = await Team.findById(teamId);
        if (!team) return interaction.editReply({ content: 'El equipo ya no existe.' });

        const isManager = team.managerId === user.id;
        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isManager && !isAdmin) return interaction.editReply({ content: 'No tienes permiso.' });

        const oldData = {
            name: team.name,
            abbreviation: team.abbreviation,
            logoUrl: team.logoUrl,
            twitterHandle: team.twitterHandle
        };

        const newName = fields.getTextInputValue('newName') || oldData.name;
        const newAbbr = fields.getTextInputValue('newAbbr')?.toUpperCase() || oldData.abbreviation;
        const newLogo = fields.getTextInputValue('newLogo') || oldData.logoUrl;
        const newTwitter = fields.getTextInputValue('newTwitter') || oldData.twitterHandle;

        team.name = newName;
        team.abbreviation = newAbbr;
        team.logoUrl = newLogo;
        team.twitterHandle = newTwitter;
        await team.save();

        if (isManager && !isAdmin) {
            try {
                const logChannelId = process.env.APPROVAL_CHANNEL_ID;
                if (logChannelId) {
                    const logChannel = await client.channels.fetch(logChannelId);
                    
                    const changes = [];
                    if (oldData.name !== newName) changes.push(`**Nombre:** \`\`\`diff\n- ${oldData.name}\n+ ${newName}\`\`\``);
                    if (oldData.abbreviation !== newAbbr) changes.push(`**Abreviatura:** \`\`\`diff\n- ${oldData.abbreviation}\n+ ${newAbbr}\`\`\``);
                    if (oldData.logoUrl !== newLogo) changes.push(`**Logo:** Se ha cambiado la URL del logo.`);
                    if ((oldData.twitterHandle || '') !== (newTwitter || '')) changes.push(`**Twitter:** \`\`\`diff\n- ${oldData.twitterHandle || 'Ninguno'}\n+ ${newTwitter || 'Ninguno'}\`\`\``);

                    if (changes.length > 0) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle(`📢 Notificación: Datos de "${team.name}" Editados`)
                            .setColor('Blue')
                            .setAuthor({ name: `Realizado por: ${user.tag}`, iconURL: user.displayAvatarURL() })
                            .setDescription(`El mánager ha actualizado los siguientes datos:\n\n${changes.join('\n')}`)
                            .setThumbnail(newLogo && newLogo.startsWith('http') ? newLogo : null)
                            .setFooter({ text: `ID del Equipo: ${team._id}` })
                            .setTimestamp();
                        await logChannel.send({ embeds: [logEmbed] });
                    }
                }
            } catch (error) {
                console.error("Error al enviar la notificación de cambio de datos:", error);
            }
        }
        return interaction.editReply({ content: `✅ Los datos del equipo **${team.name}** han sido actualizados.` });
    }

    // El resto de los manejadores de modales (market_agent_modal, offer_add_requirements, etc.) van aquí sin cambios...
    // (Asegúrate de que el resto de tu código original de este archivo esté aquí)
    if (customId === 'market_agent_modal' || customId.startsWith('market_agent_modal_edit')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const isEditing = customId.startsWith('market_agent_modal_edit');
        
        const existingAd = await FreeAgent.findOne({ userId: user.id });
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        if (existingAd && existingAd.updatedAt > threeDaysAgo && !isEditing) {
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
                { name: 'IDs de Juego', value: `PSN: ${profile.psnId || 'N/A'}\nEA ID: ${profile.eaId || 'N/A'}`, inline: false },
                { name: 'Experiencia', value: experience, inline: false },
                { name: 'Busco un equipo que...', value: seeking, inline: false },
                { name: 'Disponibilidad', value: availability, inline: false }
            )
            .setTimestamp();
        
        let messageId;
        let responseMessage;
        
        const messagePayload = {
            content: `**Contacto:** <@${user.id}>`,
            embeds: [playerAdEmbed]
        };

        if (isEditing && existingAd && existingAd.messageId) {
            try {
                const adMessage = await channel.messages.fetch(existingAd.messageId);
                await adMessage.edit(messagePayload);
                messageId = existingAd.messageId;
                responseMessage = '✅ ¡Tu anuncio ha sido actualizado con éxito!';
            } catch (error) {
                const newMessage = await channel.send(messagePayload);
                messageId = newMessage.id;
                responseMessage = '✅ Tu anuncio anterior no se encontró, así que se ha publicado uno nuevo.';
            }
        } else {
            if (existingAd && existingAd.messageId) {
                try { await channel.messages.delete(existingAd.messageId); } catch(e) {}
            }
            const newMessage = await channel.send(messagePayload);
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
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
                { name: '🐦 Twitter', value: team.twitterHandle ? `[@${team.twitterHandle}](https://twitter.com/${team.twitterHandle})` : 'No especificado', inline: true }
            )
            .setTimestamp();

        const existingOffer = await TeamOffer.findOne({ teamId: teamId });
        let offerMessage;
        let responseText;

        const messagePayload = {
            content: `**Contacto:** <@${team.managerId}>`,
            embeds: [teamOfferEmbed]
        };
            
        if (existingOffer && existingOffer.messageId) {
            try {
                const oldMessage = await channel.messages.fetch(existingOffer.messageId);
                offerMessage = await oldMessage.edit(messagePayload);
                responseText = 'actualizada';
            } catch (error) {
                offerMessage = await channel.send(messagePayload);
                responseText = 're-publicada (el mensaje anterior no se encontró)';
            }
        } else {
            offerMessage = await channel.send(messagePayload);
            responseText = 'publicada';
        }
        
        await TeamOffer.findOneAndUpdate(
            { teamId: teamId },
            { guildId: guild.id, postedById: user.id, positions, requirements, messageId: offerMessage.id, status: 'ACTIVE' },
            { upsert: true, new: true }
        );

        return interaction.editReply({ content: `✅ ¡La oferta de tu equipo ha sido ${responseText} con éxito en el canal ${channel}!` });
    }
    
    // El bloque approve_modal_ ya no es necesario, lo hemos eliminado del flujo.

   
    if (customId === 'create_league_modal') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const leagueName = fields.getTextInputValue('leagueNameInput');
        const existingLeague = await League.findOne({ name: leagueName, guildId: guild.id });
        if (existingLeague) return interaction.editReply({ content: `La liga **${leagueName}** ya existe.` });
        await new League({ name: leagueName, guildId: guild.id }).save();
        return interaction.editReply({ content: `✅ La liga **${leagueName}** ha sido creada.` });
    }

    if (customId.startsWith('confirm_dissolve_modal_')) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
