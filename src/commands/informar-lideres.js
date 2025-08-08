// src/commands/informar-lideres.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const Team = require('../models/team.js');

// Función de utilidad para la pausa
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('informar-lideres')
        .setDescription('Envía una guía sobre amistosos y fichajes a todos los Mánagers y Capitanes.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        // ID del canal de gestión de equipo, insertado directamente como solicitaste.
        const panelChannelId = '1396815967685705738';

        // Creación del Embed con el tono profesional.
        const infoEmbed = new EmbedBuilder()
            .setTitle('Comunicado para Líderes de Equipo: Amistosos y Fichajes')
            .setColor(0x4A90E2) // Un color azul corporativo
            .setDescription(`Le contactamos para informarle sobre las funcionalidades clave a su disposición para la gestión y competitividad de su plantilla.\n\nLe recordamos que el centro de operaciones para todas las gestiones de equipo se encuentra en el canal: <#${panelChannelId}>.`)
            .addFields(
                {
                    name: '1. Gestión de Amistosos',
                    value: 'Para mantener la actividad y el nivel competitivo de su equipo, puede organizar partidos amistosos de manera eficiente a través del panel de gestión.\n' +
                           '• **Procedimiento:** Acceda al canal de gestión y seleccione la opción `Gestionar Amistosos`.\n' +
                           '• **Modalidades:**\n' +
                           '  - `Programar Búsqueda`: Le permite publicar la disponibilidad de su equipo en franjas horarias específicas.\n' +
                           '  - `Buscar Rival (Ahora)`: Inicia una búsqueda de oponente para un partido inmediato.'
                },
                {
                    name: '2. Mercado de Fichajes',
                    value: 'Si necesita reforzar su plantilla, puede publicar una oferta oficial en el mercado de fichajes de la comunidad.\n' +
                           '• **Procedimiento:** Desde el mismo panel, seleccione `Gestionar Fichajes`.\n' +
                           '• **Acción:** Utilice la opción `Crear / Editar Oferta` para detallar las posiciones y requisitos que busca. Su anuncio será público para todos los jugadores aspirantes.'
                }
            )
            .setFooter({ text: 'El uso regular de estas herramientas es fundamental para el desarrollo y la visibilidad de su equipo.' });

        // Obtener todos los equipos del servidor
        const teams = await Team.find({ guildId: interaction.guild.id });
        if (teams.length === 0) {
            return interaction.editReply({ content: 'No se encontraron equipos registrados en el servidor.' });
        }

        // Usamos un Set para evitar enviar múltiples MDs al mismo usuario si es capitán y mánager.
        const leaderIds = new Set();
        teams.forEach(team => {
            if (team.managerId) leaderIds.add(team.managerId);
            team.captains.forEach(captainId => leaderIds.add(captainId));
        });

        const uniqueLeaderIds = [...leaderIds];
        let notifiedCount = 0;
        let failedCount = 0;

        await interaction.editReply({ content: `Iniciando envío de comunicados a ${uniqueLeaderIds.length} líderes de equipo...` });

        for (const userId of uniqueLeaderIds) {
            try {
                const member = await interaction.guild.members.fetch(userId);
                await member.send({ embeds: [infoEmbed] });
                notifiedCount++;
            } catch (error) {
                // El usuario no está en el servidor o tiene los MDs cerrados
                failedCount++;
            }
            // Pausa de 1 segundo para no saturar la API de Discord
            await wait(1000);
        }

        await interaction.followUp({
            content: `✅ **Proceso completado.**\n` +
                     `- Se encontraron **${uniqueLeaderIds.length}** líderes únicos.\n` +
                     `- **${notifiedCount}** líderes fueron notificados correctamente.\n` +
                     `- **${failedCount}** líderes no pudieron ser notificados (MDs cerrados o fuera del servidor).`,
            ephemeral: true
        });
    },
};
