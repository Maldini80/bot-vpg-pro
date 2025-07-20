// src/commands/admin-gestionar-equipo.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Team = require('../models/team.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin-gestionar-equipo')
        .setDescription('Abre el panel de gestión avanzado para un equipo específico.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('equipo')
                .setDescription('El nombre del equipo a gestionar (autocompletado).')
                .setRequired(true)
                .setAutocomplete(true)),
    
    // Dejamos el execute vacío por ahora. Lo implementaremos en el index.js
    // para mantener toda la lógica de interacciones centralizada.
    async execute(interaction) {} 
};
