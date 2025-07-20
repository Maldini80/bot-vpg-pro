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
            .setDescription('¿Tu equipo está listo para competir? Publica aquí tu panel de disponibilidad.')
            .setColor('#5865F2')
            .setFooter({ text: 'Solo los Mánagers y Capitanes pueden usar estos botones.'});

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('post_scheduled_panel')
                .setLabel('🗓️ Programar Disponibilidad')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('post_instant_panel')
                .setLabel('⚡ Buscar Partido (Ahora)')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('delete_my_panel')
                .setLabel('🗑️ Borrar mi Panel')
                .setStyle(ButtonStyle.Danger)
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: 'Panel de amistosos creado con éxito.', ephemeral: true });
    }
};
