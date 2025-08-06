// src/commands/panel-fichajes.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-fichajes')
        .setDescription('Crea el panel de control del mercado de fichajes.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.reply({ content: 'Creando el panel de fichajes...', flags: 64 });

        const embed = new EmbedBuilder()
            .setTitle('CENTRO DE OPERACIONES: MERCADO DE FICHAJES')
            .setDescription('Interactúa con los botones de abajo para navegar por el mercado. La mayoría de acciones se realizarán por mensajes privados para mantener este canal limpio.')
            .setColor('Gold')
            .setFooter({ text: 'VPG Transfer Market' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('market_search_players').setLabel('Buscar Jugadores').setStyle(ButtonStyle.Primary).setEmoji('🔎'),
            new ButtonBuilder().setCustomId('market_search_teams').setLabel('Buscar Equipos').setStyle(ButtonStyle.Primary).setEmoji('🔎'),
            new ButtonBuilder().setCustomId('market_post_agent').setLabel('Anunciarse como Agente Libre').setStyle(ButtonStyle.Success).setEmoji('📣'),
            new ButtonBuilder().setCustomId('market_post_offer').setLabel('Publicar Oferta de Equipo').setStyle(ButtonStyle.Secondary).setEmoji('📄')
            new ButtonBuilder().setCustomId('market_manage_ad').setLabel('Mi Anuncio').setStyle(ButtonStyle.Danger).setEmoji('⚙️')
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.editReply({ content: '✅ ¡Panel de fichajes creado con éxito!' });
    },
};
