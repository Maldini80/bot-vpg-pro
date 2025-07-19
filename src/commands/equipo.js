const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('equipo')
        .setDescription('Comandos para la gestión de tu equipo.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('invitar')
                .setDescription('Invita a un jugador a unirse a tu equipo.')
                .addUserOption(option => 
                    option.setName('usuario')
                        .setDescription('El miembro de Discord que quieres invitar.')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('expulsar')
                .setDescription('Expulsa a un jugador o capitán de tu equipo.')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('El miembro a expulsar.')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('ascender')
                .setDescription('Asciende a un jugador a capitán.')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('El jugador a ascender.')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('degradar')
                .setDescription('Degrada a un capitán a jugador.')
                .addUserOption(option =>
                    option.setName('usuario')
                        .setDescription('El capitán a degradar.')
                        .setRequired(true))
        ),
    
    // La función 'execute' queda vacía a propósito.
    // Moveremos toda la lógica al manejador de interacciones principal en `index.js`
    // para evitar la duplicación de código (como la comprobación de si el usuario es mánager).
    async execute(interaction) {
        // Esta función será manejada en el archivo principal index.js
    },
};
