const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('test-apodo')
        .setDescription('Una prueba simple para cambiar un apodo.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option => 
            option.setName('usuario')
                .setDescription('El usuario al que cambiar el apodo')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('nuevo_apodo')
                .setDescription('El nuevo apodo para el usuario')
                .setRequired(true)),

    async execute(interaction) {
        const member = interaction.options.getMember('usuario');
        const newNickname = interaction.options.getString('nuevo_apodo');

        if (!member) {
            return interaction.reply({ content: 'No pude encontrar a ese miembro.', ephemeral: true });
        }

        try {
            const oldNickname = member.displayName;
            await member.setNickname(newNickname);
            await interaction.reply({ content: `¡Éxito! El apodo de ${oldNickname} ha sido cambiado a ${newNickname}.`, ephemeral: true });
        } catch (error) {
            console.error('Error en /test-apodo:', error);
            await interaction.reply({ content: `FALLO al cambiar el apodo. Revisa los logs del bot. Error: ${error.message}`, ephemeral: true });
        }
    },
};
