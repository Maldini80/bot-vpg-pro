const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-manager')
        .setDescription('Crea el panel de control para mánagers en el canal actual.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('Panel de Control de Mánager')
            .setDescription('Usa los botones de abajo para gestionar tu equipo. Tu equipo se detectará automáticamente al usar los botones.')
            .setColor('#e67e22')
            .setFooter({ text: 'VPG Order Management' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('manager_invite_player').setLabel('📧 Invitar Jugador').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('manager_manage_roster').setLabel('📋 Gestionar Plantilla').setStyle(ButtonStyle.Primary)
        );
        
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: 'Panel de mánager creado con éxito en este canal.', ephemeral: true });
    },
};
