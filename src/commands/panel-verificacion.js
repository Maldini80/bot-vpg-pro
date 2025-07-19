const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-verificacion')
        .setDescription('Crea el panel con el botón de verificación en el canal actual.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        // --- LÓGICA CORREGIDA ---

        // 1. Primero, respondemos a la interacción de forma privada y segura.
        //    Esto confirma inmediatamente a Discord que hemos recibido el comando.
        await interaction.reply({ 
            content: 'Panel de verificación creado con éxito.', 
            ephemeral: true // Usamos ephemeral aquí ya que es la respuesta directa a la interacción.
        });

        // 2. Después, realizamos la acción principal de enviar el panel al canal.
        //    Como ya hemos respondido, usamos channel.send.
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
    },
};
