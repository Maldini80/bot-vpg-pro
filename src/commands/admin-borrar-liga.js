// src/commands/admin-borrar-liga.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const League = require('../models/league.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin-borrar-liga')
        .setDescription('Elimina una liga de la lista de opciones.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('nombre_liga')
                .setDescription('El nombre de la liga a eliminar (autocompletado).')
                .setRequired(true)
                .setAutocomplete(true)), // <-- Autocompletado para facilidad

    async execute(interaction) {
        const leagueName = interaction.options.getString('nombre_liga');
        const result = await League.deleteOne({ name: leagueName, guildId: interaction.guildId });

        if (result.deletedCount === 0) {
            return interaction.reply({ content: 'No se encontró esa liga para eliminar.', ephemeral: true });
        }
        await interaction.reply({ content: `❌ Liga "${leagueName}" eliminada con éxito.`, ephemeral: true });
    }
};
