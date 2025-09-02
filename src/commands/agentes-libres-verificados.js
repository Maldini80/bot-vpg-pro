const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('agentes-libres-verificados')
        .setDescription('Muestra jugadores verificados que no están inscritos en un draft activo.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('short_id_del_draft')
                .setDescription('Opcional: El ID corto del draft específico que quieres comprobar.')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let dbA_connection;

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
                    return interaction.editReply({ content: `❌ No se encontró ningún draft con el ID corto: \`${draftId}\` en la base de datos del Bot A.` });
                }
            } else {
                activeDraft = await draftsCollection.findOne({ status: { $nin: ['finalizado', 'torneo_generado', 'cancelado'] } });
                if (!activeDraft) {
                    return interaction.editReply({ content: '❌ No se encontró ningún draft activo en la base de datos del Bot A.' });
                }
            }

            const draftPlayerIds = new Set(activeDraft.players.map(p => p.userId));
            const allVerifiedUsers = await verifiedUsersCollection.find({}).toArray();
            const freeVerifiedAgents = allVerifiedUsers.filter(verifiedUser => !draftPlayerIds.has(verifiedUser.discordId));

            if (freeVerifiedAgents.length === 0) {
                return interaction.editReply({ content: `✅ ¡Buenas noticias! Todos los jugadores verificados ya están inscritos en el draft **${activeDraft.name}**.` });
            }

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
                    .setTitle(`🔎 Jugadores Verificados No Inscritos en "${activeDraft.name}"`)
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

            const collector = message.createMessageComponentCollector({ time: 120000 });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id) return i.reply({ content: 'Esta interacción no es para ti.', flags: MessageFlags.Ephemeral });

                if (i.customId === 'prev_page') currentPage--;
                else if (i.customId === 'next_page') currentPage++;

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
            await interaction.editReply({ content: '❌ Ocurrió un error al consultar la base de datos del Bot A.' });
        } finally {
            if (dbA_connection) {
                await dbA_connection.close();
                console.log('[agentes-libres-verificados] Conexión temporal a la DB del Bot A cerrada.');
            }
        }
    },
};
