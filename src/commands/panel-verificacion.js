const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-verificacion')
        .setDescription('Crea el panel con el botón de verificación en este canal.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Solo admins pueden usarlo
    async execute(interaction) {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_button') // Un ID único para nuestro botón
                    .setLabel('✅ Verificar mi Cuenta de VPG')
                    .setStyle(ButtonStyle.Success),
            );

        // Mensaje que acompañará al botón
        await interaction.channel.send({
            content: 'Haga clic en el botón de abajo para vincular su cuenta de Discord con su perfil de Virtual Pro Gaming y obtener sus roles de equipo y nivel.',
            components: [row]
        });
        
        // Confirmación efímera para el admin
        await interaction.reply({ content: 'Panel de verificación creado con éxito.', ephemeral: true });
    },
};
