// src/commands/panel-fichajes.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-fichajes')
        .setDescription('Crea el panel de control del mercado de fichajes para jugadores.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.reply({ content: 'Creando panel de fichajes para jugadores...', flags: 64 });
        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('CENTRAL DEL JUGADOR: MERCADO DE FICHAJES')
            .setDescription('Como jugador, aquí puedes buscar un nuevo destino o promocionarte.')
            .setImage('https://i.imgur.com/7sB0gaa.jpg');

        const playerRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('market_post_agent').setLabel('Anunciarse como Agente Libre').setStyle(ButtonStyle.Success).setEmoji('📣'),
            new ButtonBuilder().setCustomId('market_search_teams').setLabel('Buscar Ofertas de Equipo').setStyle(ButtonStyle.Primary).setEmoji('🔎'),
            new ButtonBuilder().setCustomId('market_manage_ad').setLabel('Gestionar mi Anuncio').setStyle(ButtonStyle.Secondary).setEmoji('⚙️')
        );

        await interaction.channel.send({ embeds: [embed], components: [playerRow] });
        await interaction.editReply({ content: '✅ ¡Panel de fichajes para jugadores creado!' });
    },
};
