const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('agentes-libres-verificados')
        .setDescription('Muestra una lista de jugadores verificados que no están en el draft activo.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const db = mongoose.connection.db;

            // 1. Encontrar el draft activo (asumimos que es el que está en "inscripcion")
            const activeDraft = await db.collection('drafts').findOne({ status: 'inscripcion' });

            if (!activeDraft) {
                return interaction.editReply({ content: '❌ No se encontró ningún draft con las inscripciones abiertas en este momento.' });
            }

            // 2. Obtener los IDs de todos los jugadores ya inscritos en el draft
            const draftPlayerIds = new Set(activeDraft.players.map(p => p.userId));

            // 3. Obtener todos los usuarios verificados de la base de datos
            const allVerifiedUsers = await db.collection('verified_users').find({}).toArray();

            // 4. Filtrar para encontrar los que NO están en el draft
            const freeVerifiedAgents = allVerifiedUsers.filter(verifiedUser => !draftPlayerIds.has(verifiedUser.discordId));

            if (freeVerifiedAgents.length === 0) {
                return interaction.editReply({ content: `✅ ¡Buenas noticias! Todos los jugadores verificados ya están inscritos en el draft **${activeDraft.name}**.` });
            }

            // 5. Paginación y visualización del resultado
            const ITEMS_PER_PAGE = 10;
            const pages = [];
            let currentPageDescription = '';

            for (let i = 0; i < freeVerifiedAgents.length; i++) {
                const agent = freeVerifiedAgents[i];
                currentPageDescription += `• <@${agent.discordId}> (ID Juego: \`${agent.gameId}\`)\n`;

                if ((i + 1) % ITEMS_PER_PAGE === 0 || i === freeVerifiedAgents.length - 1) {
                    pages.push(currentPageDescription);
                    currentPageDescription = '';
                }
            }
            
            let currentPage = 0;
            const totalPages = pages.length;

            const createEmbed = (pageIndex) => {
                return new EmbedBuilder()
                    .setTitle(`🔎 Jugadores Verificados No Inscritos`)
                    .setDescription(pages[pageIndex])
                    .setColor('Blue')
                    .setFooter({ text: `Mostrando ${freeVerifiedAgents.length} jugadores en total. Página ${pageIndex + 1} de ${totalPages}` });
            };

            const createButtons = (pageIndex) => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('prev_page').setLabel('◀️').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === 0),
                    new ButtonBuilder().setCustomId('next_page').setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === totalPages - 1)
                );
            };

            const message = await interaction.editReply({ 
                embeds: [createEmbed(currentPage)],
                components: [createButtons(currentPage)]
            });

            const collector = message.createMessageComponentCollector({ time: 120000 }); // 2 minutos

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) return i.reply({ content: 'Esta interacción no es para ti.', flags: MessageFlags.Ephemeral });

                if (i.customId === 'prev_page') {
                    currentPage--;
                } else if (i.customId === 'next_page') {
                    currentPage++;
                }

                await i.update({
                    embeds: [createEmbed(currentPage)],
                    components: [createButtons(currentPage)]
                });
            });

            collector.on('end', () => {
                const disabledButtons = createButtons(currentPage);
                disabledButtons.components.forEach(c => c.setDisabled(true));
                interaction.editReply({ components: [disabledButtons] }).catch(() => {});
            });

        } catch (error) {
            console.error('Error en el comando /agentes-libres-verificados:', error);
            await interaction.editReply({ content: '❌ Ocurrió un error al consultar la base de datos.' });
        }
    },
};
