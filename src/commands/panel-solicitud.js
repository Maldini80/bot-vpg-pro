const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-solicitud')
        .setDescription('Crea el panel para que los usuarios soliciten ser mánager.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        if (interaction.channelId !== process.env.REQUEST_CHANNEL_ID) {
            return interaction.reply({ content: `Este comando solo se puede usar en el canal de solicitudes designado.`, ephemeral: true });
        }
        const embed = new EmbedBuilder()
            .setTitle('📝 Solicitud para Registrar un Equipo de VPG')
            .setDescription('Haz clic en el botón de abajo para iniciar el proceso de solicitud.')
            .setColor('#2ecc71');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('request_manager_role_button').setLabel('Quiero Registrar mi Equipo').setStyle(ButtonStyle.Success)
        );
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: 'Panel de solicitud creado con éxito.', ephemeral: true });
    },
};
