// src/commands/panel-amistosos.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-amistosos')
        .setDescription('Crea el panel de búsqueda de amistosos en este canal.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Búsqueda de Partidos Amistosos')
            .setDescription('¿Tu equipo está listo para competir? Publica aquí tu oferta de partido.')
            .addFields(
                { name: '🗓️ Programar Amistoso', value: 'Busca un rival para una hora específica.' },
                { name: '⚡ Amistoso (Ahora)', value: 'Encuentra un oponente para jugar inmediatamente.' }
            )
            .setColor('#5865F2')
            .setFooter({ text: 'Solo los Mánagers y Capitanes pueden usar estos botones.'});

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('post_scheduled_friendly')
                .setLabel('Programar Amistoso')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('post_instant_friendly')
                .setLabel('Amistoso (Ahora)')
                .setStyle(ButtonStyle.Success)
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: 'Panel de amistosos creado con éxito.', ephemeral: true });
    }
};
