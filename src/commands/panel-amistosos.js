// src/commands/panel-amistosos.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-amistosos')
        .setDescription('Crea el panel de búsqueda de amistosos y gestión de equipo.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Centro de Control de Amistosos y Equipos')
            .setDescription('Usa los botones de abajo para buscar partidos o gestionar tu equipo.')
            .setColor('#5865F2')
            .setFooter({ text: 'Algunos botones solo son visibles para Mánagers y Capitanes.'});

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
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('open_my_team_panel')
                .setLabel('🛡️ Mi Equipo')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: 'Panel de amistosos y gestión de equipo creado con éxito.', ephemeral: true });
    }
};
