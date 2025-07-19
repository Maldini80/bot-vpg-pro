// ... (todas las importaciones iniciales, asegúrate de que están completas)
const { Client, ... , ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Team = require('./models/team.js');
// ... (el resto del código hasta el manejador de interacciones)

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            await command.execute(interaction);
        } else if (interaction.isButton()) {
            // ... (código anterior de los botones de aprobación)
            
            // --- ¡NUEVA LÓGICA PARA INVITACIONES! ---

            // Si el jugador ACEPTA la invitación
            if (interaction.customId.startsWith('accept_invite_')) {
                const teamId = interaction.customId.split('_')[2];
                const team = await Team.findById(teamId);

                if (!team) {
                    return interaction.reply({ content: 'Este equipo ya no existe.', ephemeral: true });
                }

                // Verificamos de nuevo por si el jugador se unió a otro equipo mientras tanto
                const isAlreadyInTeam = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: interaction.user.id }, { captains: interaction.user.id }, { players: interaction.user.id }] });
                if (isAlreadyInTeam) {
                    await interaction.message.delete(); // Borramos el mensaje de invitación
                    return interaction.reply({ content: `Ya perteneces al equipo **${isAlreadyInTeam.name}**. No puedes unirte a otro.`, ephemeral: true });
                }

                // 1. Añadimos al jugador a la base de datos del equipo
                team.players.push(interaction.user.id);
                await team.save();

                // 2. Le asignamos el rol de Jugador y actualizamos su apodo
                const playerRoleId = process.env.PLAYER_ROLE_ID;
                await interaction.member.roles.add(playerRoleId);
                await interaction.member.setNickname(`${interaction.user.username} | ${team.name}`);

                // 3. Confirmamos al jugador y notificamos al mánager
                await interaction.reply({ content: `¡Felicidades! Te has unido a **${team.name}**.`, ephemeral: true });
                const manager = await client.users.fetch(team.managerId);
                await manager.send(`✅ **${interaction.user.username}** ha aceptado tu invitación y se ha unido a **${team.name}**.`);

                // 4. Deshabilitamos los botones de la invitación
                await interaction.message.edit({ components: [] });
            }
            // Si el jugador RECHAZA la invitación
            else if (interaction.customId.startsWith('reject_invite_')) {
                const teamId = interaction.customId.split('_')[2];
                const team = await Team.findById(teamId);

                await interaction.reply({ content: 'Has rechazado la invitación.', ephemeral: true });
                if (team) {
                    const manager = await client.users.fetch(team.managerId);
                    await manager.send(`❌ **${interaction.user.username}** ha rechazado tu invitación para unirse a **${team.name}**.`);
                }
                
                await interaction.message.edit({ components: [] });
            }

        } else if (interaction.isModalSubmit()) {
            // ... (lógica anterior de los modales de aprobación)
        }
    } catch (error) {
        console.error("Fallo crítico de interacción:", error.message, error.stack);
    }
});

client.login(process.env.DISCORD_TOKEN);
