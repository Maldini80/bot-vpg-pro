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
            .setTitle('🇪🇸 Centro de Control del Jugador VPG / 🇬🇧 VPG Player Control Center')
            .setDescription(
                '🇪🇸 Utiliza los botones de abajo para gestionar tu carrera o tu equipo.\n' +
                '----------------------------------------------------------------------\n' +
                '🇬🇧 Use the buttons below to manage your career or your team.'
            )
            .setColor('#3498db')
            .setImage('https://i.imgur.com/T7hXuuA.jpeg'); // Imagen del panel

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('manager_actions_button')
                .setLabel('Acciones de Mánager / Manager Actions')
                .setStyle(ButtonStyle.Success)
                .setEmoji('👑'),
            new ButtonBuilder()
                .setCustomId('view_teams_button')
                .setLabel('Ver Equipos / View Teams')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('👥'),
            new ButtonBuilder()
                .setCustomId('player_actions_button')
                .setLabel('Acciones de Jugador / Player Actions')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('👤')
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.editReply({ content: '✅ Panel de solicitud creado con éxito.' });
    }
};
