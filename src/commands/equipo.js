// Archivo: src/commands/equipo.js

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Team = require('../models/team.js');
const { MANAGER_CHANNEL_ID } = require('../utils/config.js');

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
        ),
        // Aquí añadiremos más subcomandos como 'expulsar', 'ascender', etc.
    
    async execute(interaction) {
        // Solo permitimos que se use en el canal de mánagers
        if (interaction.channelId !== MANAGER_CHANNEL_ID) {
            return interaction.reply({ content: 'Este comando solo se puede usar en el canal de gestión de equipos.', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();
        const manager = interaction.member;

        // Buscamos el equipo del mánager que ejecuta el comando
        const team = await Team.findOne({ guildId: interaction.guildId, managerId: manager.id });

        if (!team) {
            return interaction.reply({ content: 'No eres el mánager de ningún equipo registrado.', ephemeral: true });
        }

        // --- Lógica del subcomando INVITAR ---
        if (subcommand === 'invitar') {
            const targetUser = interaction.options.getUser('usuario');
            const targetMember = await interaction.guild.members.fetch(targetUser.id);

            // Verificaciones
            if (targetUser.bot) {
                return interaction.reply({ content: 'No puedes invitar a un bot.', ephemeral: true });
            }
            if (targetUser.id === manager.id) {
                return interaction.reply({ content: 'No puedes invitarte a ti mismo.', ephemeral: true });
            }
            // Comprobamos si el jugador ya está en algún equipo
            const isAlreadyInTeam = await Team.findOne({
                guildId: interaction.guildId,
                $or: [
                    { managerId: targetUser.id },
                    { captains: targetUser.id },
                    { players: targetUser.id }
                ]
            });
            if (isAlreadyInTeam) {
                return interaction.reply({ content: `Este jugador ya pertenece al equipo **${isAlreadyInTeam.name}**.`, ephemeral: true });
            }

            // Creamos la invitación
            const embed = new EmbedBuilder()
                .setTitle(`💌 ¡Has recibido una invitación!`)
                .setDescription(`**${manager.user.username}**, mánager de **${team.name}**, te ha invitado a unirte a su equipo.`)
                .setColor('#3498db')
                .setThumbnail(team.logoUrl)
                .setFooter({ text: 'Tienes 24 horas para aceptar o rechazar esta invitación.' });
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`accept_invite_${team.id}`).setLabel("✅ Aceptar").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`reject_invite_${team.id}`).setLabel("❌ Rechazar").setStyle(ButtonStyle.Danger)
            );

            try {
                // Enviamos el mensaje privado al jugador
                await targetUser.send({ embeds: [embed], components: [row] });
                await interaction.reply({ content: `¡Invitación enviada con éxito a **${targetUser.username}**!`, ephemeral: true });
            } catch (error) {
                console.error("Error al enviar MD de invitación:", error);
                await interaction.reply({ content: `No se pudo enviar la invitación a **${targetUser.username}**. Es posible que tenga los mensajes privados desactivados.`, ephemeral: true });
            }
        }
    },
};
