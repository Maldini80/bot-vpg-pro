// src/commands/panel-manager.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-manager')
        .setDescription('Crea el panel de control para mánagers en el canal actual.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Panel de Control de Mánager y Capitán')
            .setDescription('Usa los botones de abajo para gestionar tu equipo. Tu equipo se detectará automáticamente.')
            .setColor('#e67e22')
            .setFooter({ text: 'VPG Order Management' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('manager_invite_player_button') // Botón para invitar
                .setLabel('📧 Invitar Jugador')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('manager_manage_roster') // Botón para gestionar (promover, expulsar, mutear)
                .setLabel('📋 Gestionar Plantilla')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('manager_view_roster') // Botón para ver la plantilla
                .setLabel('👥 Ver Plantilla')
                .setStyle(ButtonStyle.Secondary)
        );
        
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: 'Panel de mánager creado con éxito en este canal.', ephemeral: true });
    },
};
