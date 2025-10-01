// src/commands/notificar-no-inscritos.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
const t = require('../utils/translator.js');
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('notificar-no-inscritos')
        .setDescription('Envía un recordatorio por MD a los jugadores verificados que no están en el draft activo.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('short_id_del_draft')
                .setDescription('Opcional: ID corto del draft específico. Si no se pone, busca el activo.')
                .setRequired(false))
        // --- OPCIONES NUEVAS AÑADIDAS ---
        .addStringOption(option =>
            option.setName('fecha')
                .setDescription('Opcional: Fecha límite para inscribirse (formato DD/MM/AAAA).')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('hora')
                .setDescription('Opcional: Hora límite para inscribirse (formato HH:MM, ej: 23:00).')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let dbA_connection;
        // --- VARIABLES NUEVAS AÑADIDAS ---
        const fecha = interaction.options.getString('fecha');
        const hora = interaction.options.getString('hora');
        let failedUsers = []; // Aquí guardaremos los IDs de los usuarios a los que no se pudo enviar el MD

        try {
            dbA_connection = await mongoose.createConnection(process.env.DATABASE_URL, {
                dbName: 'tournamentBotDb'
            });

            const draftsCollection = dbA_connection.collection('drafts');
            const verifiedUsersCollection = dbA_connection.collection('verified_users');

            const draftId = interaction.options.getString('short_id_del_draft');
            let activeDraft;

            if (draftId) {
                activeDraft = await draftsCollection.findOne({ shortId: draftId });
                if (!activeDraft) {
                    return interaction.editReply({ content: `❌ No se encontró ningún draft con el ID corto: \`${draftId}\`.` });
                }
            } else {
                activeDraft = await draftsCollection.findOne({ status: { $nin: ['finalizado', 'torneo_generado', 'cancelado'] } });
                if (!activeDraft) {
                    return interaction.editReply({ content: '❌ No se encontró ningún draft activo en la base de datos del bot de torneos.' });
                }
            }

            const draftPlayerIds = new Set(activeDraft.players.map(p => p.userId));
            const allVerifiedUsers = await verifiedUsersCollection.find({}).toArray();

            console.log(`[Diagnóstico] Draft activo encontrado: ${activeDraft.name}`);
            console.log(`[Diagnóstico] Total de jugadores verificados en la DB: ${allVerifiedUsers.length}`);
            console.log(`[Diagnóstico] Total de jugadores YA inscritos en el draft: ${draftPlayerIds.size}`);

            const usersToNotify = allVerifiedUsers.filter(verifiedUser => !draftPlayerIds.has(verifiedUser.discordId));

            console.log(`[Diagnóstico] Jugadores a notificar: ${usersToNotify.length}`);

            if (usersToNotify.length === 0) {
                return interaction.editReply({ content: `✅ ¡Buenas noticias! Todos los jugadores verificados ya están inscritos en el draft **${activeDraft.name}**.` });
            }

            await interaction.editReply({ content: `🔎 Se encontraron ${usersToNotify.length} jugadores verificados no inscritos. Iniciando el envío de notificaciones por MD... (recibirás una actualización cada 10 notificaciones)` });

            let notifiedCount = 0;
            let failedCount = 0;
            let processedCount = 0;

            const draftImage = 'https://i.imgur.com/abcdef.png';

            for (const user of usersToNotify) {
                processedCount++;
                try {
                    const member = await interaction.guild.members.fetch(user.discordId);

                    // --- BLOQUE DE EMBED MODIFICADO ---
                    const guideEmbed = new EmbedBuilder()
                        .setTitle(t('unregisteredNotificationTitle', member))
                        .setColor('Orange')
                        .setDescription(t('unregisteredNotificationDescription', member).replace('{draftName}', activeDraft.name))
                        .addFields({
                            name: t('unregisteredNotificationHowToTitle', member),
                            value: t('unregisteredNotificationHowToValue', member)
                        })
                        .setImage(draftImage);

                    // Si el admin proporcionó fecha y hora, añadimos un campo extra al mensaje
                    if (fecha && hora) {
                        guideEmbed.addFields({
                            name: t('profileReminderField4Title', member), // Clave de traducción nueva
                            value: t('profileReminderField4Value', member).replace('{fecha}', fecha).replace('{hora}', hora) // Clave de traducción nueva
                        });
                    }
                    // --- FIN DEL BLOQUE MODIFICADO ---

                    const actionRow = new ActionRowBuilder();
                    actionRow.addComponents(
                        new ButtonBuilder()
                            .setLabel(t('unregisteredNotificationButton', member))
                            .setStyle(ButtonStyle.Link)
                            .setURL(`https://discord.com/channels/${interaction.guild.id}/1413906746258362398`)
                            .setEmoji('➡️')
                    );

                    await member.send({ embeds: [guideEmbed], components: [actionRow] });
                    notifiedCount++;
                } catch (error) {
                    console.log(`[Notificar-No-Inscritos] No se pudo notificar a ${user.discordId}. Motivo: ${error.message}`);
                    failedCount++;
                    failedUsers.push(user.discordId); // <-- GUARDAMOS EL ID DEL USUARIO FALLIDO
                }

                if (processedCount % 10 === 0 && processedCount < usersToNotify.length) {
                    await interaction.followUp({
                        content: `⏳ Procesando... ${processedCount} de ${usersToNotify.length} notificaciones enviadas.`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                await wait(1000);
            }

            // --- BLOQUE DE MENSAJE FINAL MODIFICADO ---
            let finalMessage = `✅ **Proceso completado.**\n` +
                               `- **${notifiedCount}** jugadores notificados correctamente.\n` +
                               `- **${failedCount}** no pudieron ser notificados (MDs cerrados o fuera del servidor).`;

            if (failedUsers.length > 0) {
                // Creamos una lista de menciones. Si es muy larga, la cortamos para no superar el límite de caracteres de Discord.
                const failedMentions = failedUsers.map(id => `<@${id}>`).join(', ');
                if (failedMentions.length < 1800) {
                    finalMessage += `\n\n**Usuarios no notificados:**\n${failedMentions}`;
                } else {
                    finalMessage += `\n\nSe encontraron demasiados usuarios fallidos para mostrarlos en una lista.`;
                }
            }

            await interaction.followUp({
                content: finalMessage,
                flags: MessageFlags.Ephemeral
            });
            // --- FIN DEL BLOQUE MODIFICADO ---

        } catch (error) {
            console.error('Error en /notificar-no-inscritos:', error);
            await interaction.editReply({ content: '❌ Ocurrió un error al ejecutar el comando.' });
        } finally {
            if (dbA_connection) {
                await dbA_connection.close();
            }
        }
    },
};
