// src/commands/panel-solicitud.js
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-solicitud')
        .setDescription('Crea el panel de control general para todos los usuarios.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ flags: 64 });

        const embed = new EmbedBuilder()
            .setTitle('Centro de Control del Jugador VPG')
            .setDescription('Utiliza los botones de abajo para gestionar tu carrera o tu equipo.')
            .setColor('#3498db')
            .setImage('https://i.imgur.com/T7hXuuA.jpeg'); // Imagen del panel

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('manager_actions_button')
                .setLabel('Acciones de Mánager')
                .setStyle(ButtonStyle.Success)
                .setEmoji('👑'),
            new ButtonBuilder()
                .setCustomId('view_teams_button')
                .setLabel('Ver Equipos')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('👥'),
            new ButtonBuilder()
                .setCustomId('player_actions_button')
                .setLabel('Acciones de Jugador')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('👤')
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.editReply({ content: '✅ Panel de solicitud creado con éxito.' });
    }
};
