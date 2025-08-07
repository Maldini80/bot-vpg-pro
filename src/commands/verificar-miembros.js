// src/commands/verificar-miembros.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const VPGUser = require('../models/user.js');

// Una pequeña función de utilidad para esperar.
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verificar-miembros')
        .setDescription('Busca miembros sin rol de jugador o perfil incompleto y les envía un recordatorio por MD.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        // IDs de roles a excluir de la verificación
        const exclusionRoles = [
            process.env.ADMIN_ROLE_ID,
            process.env.CASTER_ROLE_ID,
            process.env.ARBITER_ROLE_ID
        ].filter(Boolean);

        // IDs de roles de equipo
        const teamRoles = [
            process.env.PLAYER_ROLE_ID,
            process.env.CAPTAIN_ROLE_ID,
            process.env.MANAGER_ROLE_ID
        ].filter(Boolean);

        const members = await interaction.guild.members.fetch();
        let notifiedCount = 0;
        let failedCount = 0;
        let processedCount = 0;

        const targetChannelId = '1396815232122228827';

        const reminderEmbed = new EmbedBuilder()
            .setTitle('📝 Tienes pendiente completar tu perfil de jugador')
            .setDescription(`Hemos detectado que tu perfil de jugador está incompleto o no tienes el rol correspondiente. Para poder acceder a todas las funciones del servidor, por favor, sigue estos pasos:`)
            .addFields(
                { name: 'Paso 1: Ve al canal de control', value: `Haz clic aquí para ir al canal <#${targetChannelId}>.` },
                { name: 'Paso 2: Abre el menú de jugador', value: `Pulsa el botón **"Acciones de Jugador"**.` },
                { name: 'Paso 3: Completa tu perfil', value: `En el menú que aparecerá, pulsa **"Actualizar Perfil"** y rellena todos tus datos.` }
            )
            .setColor('Orange')
            .setImage('https://i.imgur.com/JDxmInz.jpeg') // La imagen para los recordatorios
            .setFooter({ text: 'Una vez completado, recibirás el rol de Jugador automáticamente.' });
        
        await interaction.editReply({ content: `Iniciando verificación de ${members.size} miembros... Esto puede tardar.` });

        for (const member of members.values()) {
            processedCount++;
            if (processedCount % 20 === 0) {
                 await interaction.followUp({ content: `Procesados ${processedCount} de ${members.size} miembros...`, ephemeral: true });
            }

            if (member.user.bot || 
                member.roles.cache.some(role => exclusionRoles.includes(role.id)) || 
                member.roles.cache.some(role => teamRoles.includes(role.id))) {
                continue;
            }

            const userProfile = await VPGUser.findOne({ discordId: member.id });

            if (!userProfile || !userProfile.primaryPosition) {
                try {
                    await member.send({ embeds: [reminderEmbed] });
                    notifiedCount++;
                } catch (error) {
                    failedCount++;
                }
                
                // Pausa de 1 segundo para no saturar a Discord
                await wait(1000); 
            }
        }

        await interaction.followUp({
            content: `✅ **Verificación completada.**\n` +
                     `- Se procesaron **${members.size}** miembros en total.\n` +
                     `- **${notifiedCount}** miembro(s) fueron notificados correctamente por MD.\n` +
                     `- **${failedCount}** miembro(s) no pudieron ser notificados (MDs cerrados).`,
            ephemeral: true
        });
    },
};
