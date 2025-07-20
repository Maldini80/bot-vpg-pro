// src/commands/admin-crear-liga.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const League = require('../models/league.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin-crear-liga')
        .setDescription('Añade una nueva liga a la lista de opciones para los equipos.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('nombre_liga')
                .setDescription('El nombre exacto de la liga a crear.')
                .setRequired(true)),

    async execute(interaction) {
        const leagueName = interaction.options.getString('nombre_liga');
        const { guildId } = interaction;

        const existing = await League.findOne({ name: leagueName, guildId });
        if (existing) {
            return interaction.reply({ content: `La liga "${leagueName}" ya existe.`, ephemeral: true });
        }

        const newLeague = new League({ name: leagueName, guildId });
        await newLeague.save();
        await interaction.reply({ content: `✅ Liga "${leagueName}" creada con éxito. Ahora aparecerá en el formulario de registro.`, ephemeral: true });
    }
};
