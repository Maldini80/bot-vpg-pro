const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-verificacion')
        .setDescription('Crea el panel con el botón de verificación en el canal actual.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Solo los administradores pueden usar este comando
    
    async execute(interaction) {
        // Crea una fila de componentes para añadir el botón
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_button') // Este es el ID único que identificará nuestro botón
                    .setLabel('✅ Verificar mi Cuenta de VPG')
                    .setStyle(ButtonStyle.Success) // Le da al botón un color verde
            );

        // Envía el mensaje al canal donde se usó el comando
        await interaction.channel.send({
            content: 'Haga clic en el botón de abajo para vincular su cuenta de Discord con su perfil de Virtual Pro Gaming y obtener sus roles de equipo y nivel.',
            components: [row] // Añade la fila con el botón al mensaje
        });
        
        // Envía una confirmación invisible para el administrador que usó el comando
        await interaction.reply({ content: 'Panel de verificación creado con éxito.', ephemeral: true });
    },
};
