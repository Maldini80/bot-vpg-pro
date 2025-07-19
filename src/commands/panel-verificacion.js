const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('panel-verificacion')
        .setDescription('Crea el panel con el botón de verificación en el canal actual.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        // --- LÓGICA FINAL Y ROBUSTA ---

        // 1. DIFIERE LA RESPUESTA INMEDIATAMENTE.
        //    Esto le dice a Discord "recibido" y nos da 15 minutos.
        //    Lo hacemos efímero para que el "Bot está pensando..." solo lo vea el admin.
        await interaction.deferReply({ ephemeral: true });

        // 2. Realiza la acción principal (enviar el panel).
        //    Esto ahora puede tardar lo que necesite sin causar un error.
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

        // 3. EDITA LA RESPUESTA ORIGINAL.
        //    Ahora que todo ha terminado, editamos el "Bot está pensando..."
        //    con el mensaje de éxito final.
        await interaction.editReply({ content: 'Panel de verificación creado con éxito.' });
    },
};
