const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const mongoose = require('mongoose');
require('dotenv').config();

// Importamos los modelos y la config
const Team = require('./models/team.js');
const { CANAL_APROBACIONES_ID, ROL_APROBADOR_ID } = require('./utils/config.js');

// Conexión a la base de datos
mongoose.connect(process.env.DATABASE_URL)
    .then(() => console.log('Conectado a la base de datos MongoDB.'))
    .catch(err => console.error('No se pudo conectar a MongoDB:', err));

// Creación del cliente del bot con los permisos (intents) necesarios
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// Carga dinámica de comandos desde la carpeta /commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
}

// Evento que se dispara una vez que el bot está listo y online
client.once(Events.ClientReady, () => {
    console.log(`¡Listo! El bot ${client.user.tag} está online.`);
});

// Manejador principal de todas las interacciones (comandos, botones, modales)
client.on(Events.InteractionCreate, async interaction => {
    try {
        // --- MANEJO DE COMANDOS DE BARRA (/) ---
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            await command.execute(interaction);
        } 
        // --- MANEJO DE BOTONES ---
        else if (interaction.isButton()) {
            const esAprobador = interaction.member.roles.cache.has(ROL_APROBADOR_ID) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);

            // --- Botones del Flujo de Solicitud de Mánager ---
            if (interaction.customId === 'request_manager_role_button') {
                const modal = new ModalBuilder().setCustomId('manager_request_modal').setTitle('Formulario de Solicitud de Mánager');
                const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsername').setLabel("Tu nombre de usuario en VPG").setStyle(TextInputStyle.Short).setRequired(true);
                const teamNameInput = new TextInputBuilder().setCustomId('teamName').setLabel("Nombre de tu equipo en VPG").setStyle(TextInputStyle.Short).setRequired(true);
                const leagueNameInput = new TextInputBuilder().setCustomId('leagueName').setLabel("Liga de VPG en la que compites").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(vpgUsernameInput), new ActionRowBuilder().addComponents(teamNameInput), new ActionRowBuilder().addComponents(leagueNameInput));
                await interaction.showModal(modal);
            } else if (interaction.customId.startsWith('approve_request_')) {
                if (!esAprobador) return interaction.reply({ content: 'No tienes permiso para aprobar solicitudes.', ephemeral: true });
                const parts = interaction.customId.split('_');
                const applicantId = parts[2];
                const teamName = parts.slice(3).join(' ');
                const modal = new ModalBuilder().setCustomId(`approve_modal_${applicantId}_${teamName}`).setTitle(`Aprobar Equipo: ${teamName}`);
                const teamLogoInput = new TextInputBuilder().setCustomId('teamLogoUrl').setLabel("URL del Escudo del Equipo").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(teamLogoInput));
                await interaction.showModal(modal);
            } else if (interaction.customId.startsWith('reject_request_')) {
                if (!esAprobador) return interaction.reply({ content: 'No tienes permiso para rechazar solicitudes.', ephemeral: true });
                const applicantId = interaction.customId.split('_')[2];
                const applicant = await interaction.guild.members.fetch(applicantId);
                const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true), ButtonBuilder.from(interaction.message.components[0].components[1]).setDisabled(true));
                await interaction.message.edit({ components: [disabledRow] });
                await interaction.reply({ content: `La solicitud de **${applicant.user.tag}** ha sido rechazada.`, ephemeral: false });
                await applicant.send(`Tu solicitud para registrar un equipo ha sido rechazada por un administrador.`).catch(() => {});
            }

            // --- Botones del Flujo de Invitaciones de Equipo ---
            else if (interaction.customId.startsWith('accept_invite_')) {
                const teamId = interaction.customId.split('_')[2];
                const team = await Team.findById(teamId);
                if (!team) return interaction.reply({ content: 'Este equipo ya no existe.', ephemeral: true });
                const isAlreadyInTeam = await Team.findOne({ guildId: interaction.guildId, $or: [{ managerId: interaction.user.id }, { captains: interaction.user.id }, { players: interaction.user.id }] });
                if (isAlreadyInTeam) {
                    await interaction.message.delete();
                    return interaction.reply({ content: `Ya perteneces al equipo **${isAlreadyInTeam.name}**. No puedes unirte a otro.`, ephemeral: true });
                }
                team.players.push(interaction.user.id);
                await team.save();
                const playerRoleId = process.env.PLAYER_ROLE_ID;
                await interaction.member.roles.add(playerRoleId);
                await interaction.member.setNickname(`${interaction.user.username} | ${team.name}`);
                await interaction.reply({ content: `¡Felicidades! Te has unido a **${team.name}**.`, ephemeral: true });
                const manager = await client.users.fetch(team.managerId);
                await manager.send(`✅ **${interaction.user.username}** ha aceptado tu invitación y se ha unido a **${team.name}**.`);
                await interaction.message.edit({ components: [] });
            } else if (interaction.customId.startsWith('reject_invite_')) {
                const teamId = interaction.customId.split('_')[2];
                const team = await Team.findById(teamId);
                await interaction.reply({ content: 'Has rechazado la invitación.', ephemeral: true });
                if (team) {
                    const manager = await client.users.fetch(team.managerId);
                    await manager.send(`❌ **${interaction.user.username}** ha rechazado tu invitación para unirse a **${team.name}**.`);
                }
                await interaction.message.edit({ components: [] });
            }

            // --- Botones del Panel de Administrador ---
            else if (interaction.customId === 'admin_search_team_button') {
                if (!esAprobador) return interaction.reply({ content: 'No tienes permiso para usar esta función.', ephemeral: true });
                const modal = new ModalBuilder().setCustomId('admin_search_team_modal').setTitle('Buscar Equipo por Nombre');
                const teamNameInput = new TextInputBuilder().setCustomId('teamName').setLabel("Introduce el nombre exacto del equipo").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(teamNameInput));
                await interaction.showModal(modal);
            }
        } 
        // --- MANEJO DE FORMULARIOS (MODALS) ---
        else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'manager_request_modal') {
                const vpgUsername = interaction.fields.getTextInputValue('vpgUsername');
                const teamName = interaction.fields.getTextInputValue('teamName');
                const leagueName = interaction.fields.getTextInputValue('leagueName');
                const approvalChannel = await client.channels.fetch(CANAL_APROBACIONES_ID);
                if (!approvalChannel) return interaction.reply({ content: 'Hubo un error al procesar tu solicitud.', ephemeral: true });
                const embed = new EmbedBuilder().setTitle('Nueva Solicitud de Mánager').setColor('#f1c40f').addFields({ name: 'Solicitante', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true }, { name: 'Usuario VPG', value: vpgUsername, inline: true }, { name: 'Nombre del Equipo', value: teamName, inline: false }, { name: 'Liga', value: leagueName, inline: false }).setTimestamp();
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`approve_request_${interaction.user.id}_${teamName}`).setLabel("✅ Aprobar").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`reject_request_${interaction.user.id}`).setLabel("❌ Rechazar").setStyle(ButtonStyle.Danger));
                await approvalChannel.send({ embeds: [embed], components: [row] });
                await interaction.reply({ content: 'Tu solicitud ha sido enviada a los administradores para su revisión.', ephemeral: true });
            } else if (interaction.customId.startsWith('approve_modal_')) {
                const applicantId = interaction.customId.split('_')[2];
                const originalRequestMessage = (await interaction.channel.messages.fetch({ limit: 50 })).find(msg => msg.embeds[0]?.fields[0]?.value.includes(applicantId) && !msg.components[0]?.components[0]?.disabled);
                if (!originalRequestMessage) return interaction.reply({ content: 'No se pudo encontrar la solicitud original.', ephemeral: true });
                const teamName = originalRequestMessage.embeds[0].fields.find(f => f.name === 'Nombre del Equipo').value;
                const leagueName = originalRequestMessage.embeds[0].fields.find(f => f.name === 'Liga').value;
                const teamLogoUrl = interaction.fields.getTextInputValue('teamLogoUrl');
                const applicant = await interaction.guild.members.fetch(applicantId);
                const existingTeam = await Team.findOne({ name: teamName, guildId: interaction.guildId });
                if (existingTeam) return interaction.reply({ content: `Error: Ya existe un equipo llamado **${teamName}**.`, ephemeral: true });
                const isAlreadyManager = await Team.findOne({ managerId: applicant.id });
                if (isAlreadyManager) return interaction.reply({ content: `Error: Este usuario ya es mánager del equipo **${isAlreadyManager.name}**.`, ephemeral: true });
                const newTeam = new Team({ name: teamName, guildId: interaction.guildId, league: leagueName, logoUrl: teamLogoUrl, managerId: applicant.id });
                await newTeam.save();
                const managerRoleId = process.env.MANAGER_ROLE_ID;
                if (!managerRoleId) {
                    console.error("Variable de entorno MANAGER_ROLE_ID no configurada!");
                    return interaction.reply({ content: 'Error de configuración: No se ha definido el rol de mánager.', ephemeral: true });
                }
                await applicant.roles.add(managerRoleId);
                await applicant.setNickname(`${applicant.user.username} | ${teamName}`);
                const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(originalRequestMessage.components[0].components[0]).setDisabled(true).setLabel('Aprobado'), ButtonBuilder.from(originalRequestMessage.components[0].components[1]).setDisabled(true));
                await originalRequestMessage.edit({ components: [disabledRow] });
                await interaction.reply({ content: `¡Equipo **${teamName}** aprobado! **${applicant.user.tag}** ha recibido el rol de Mánager.`, ephemeral: false });
                await applicant.send(`¡Felicidades! Tu equipo **${teamName}** ha sido APROBADO.`).catch(() => {});
            } else if (interaction.customId === 'admin_search_team_modal') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                     return interaction.reply({ content: 'No tienes permiso para realizar esta acción.', ephemeral: true });
                }
                const teamName = interaction.fields.getTextInputValue('teamName');
                const team = await Team.findOne({ guildId: interaction.guildId, name: teamName });
                if (!team) return interaction.reply({ content: `No se encontró ningún equipo llamado **${teamName}**.`, ephemeral: true });

                const manager = await interaction.guild.members.fetch(team.managerId).catch(() => ({ user: { tag: 'No Encontrado' } }));
                
                const embed = new EmbedBuilder()
                    .setTitle(`Información del Equipo: ${team.name}`)
                    .setThumbnail(team.logoUrl)
                    .setColor('#ecf0f1')
                    .addFields(
                        { name: 'Liga', value: team.league, inline: true },
                        { name: 'Mánager Actual', value: manager.user.tag, inline: true }
                    );

                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }
    } catch (error) {
        console.error("Fallo crítico de interacción:", error.message, error.stack);
    }
});

// Inicio de sesión del bot con el token
client.login(process.env.DISCORD_TOKEN);
