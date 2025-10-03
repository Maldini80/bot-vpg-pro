// src/commands/panel-fichajes.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-fichajes')
        .setDescription('Crea el panel de control del mercado de fichajes para jugadores.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
    await interaction.reply({ content: 'Creando panel de fichajes para jugadores...', ephemeral: true });

    // Textos bilingües para los botones
    const postAdLabel = 'Anunciarse / Post Ad';
    const searchTeamsLabel = 'Buscar Ofertas / Search Offers';
    const manageAdLabel = 'Gestionar Anuncio / Manage Ad';

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🇪🇸 MERCADO DE FICHAJES / 🇬🇧 TRANSFER MARKET')
        .setDescription(
            '🇪🇸 Como jugador, aquí puedes buscar un nuevo destino o promocionarte.\n' +
            '----------------------------------------------------------------------\n' +
            '🇬🇧 As a player, here you can find a new team or promote yourself.'
        )
        .setImage('https://i.imgur.com/7sB0gaa.jpg');

    const playerRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('market_post_agent').setLabel(postAdLabel).setStyle(ButtonStyle.Success).setEmoji('📣'),
        new ButtonBuilder().setCustomId('market_search_teams').setLabel(searchTeamsLabel).setStyle(ButtonStyle.Primary).setEmoji('🔎'),
        new ButtonBuilder().setCustomId('market_manage_ad').setLabel(manageAdLabel).setStyle(ButtonStyle.Secondary).setEmoji('⚙️')
    );

    await interaction.channel.send({ embeds: [embed], components: [playerRow] });
    await interaction.editReply({ content: '✅ ¡Panel de fichajes para jugadores creado!' });
},
};
