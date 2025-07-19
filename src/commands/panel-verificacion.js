const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-verificacion')
        .setDescription('Crea el panel con el botón de verificación en el canal actual.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_button')
                    .setLabel('✅ Verificar mi Cuenta de VPG')
                    .setStyle(ButtonStyle.Success)
            );

        await interaction.channel.send({
            content: 'Haga clic en el botón de abajo para vincular su cuenta de Discord con su perfil de Virtual Pro Gaming y obtener sus roles de equipo y nivel.',
            components: [row]
        });

        await interaction.editReply({ content: 'Panel de verificación creado con éxito.' });
    },
};
