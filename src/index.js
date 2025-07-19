const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/user.js');
const Team = require('./models/team.js');
const { CANAL_APROBACIONES_ID, ROL_APROBADOR_ID } = require('./utils/config.js');

mongoose.connect(process.env.DATABASE_URL)
    .then(() => console.log('Conectado a la base de datos MongoDB.'))
    .catch(err => console.error('No se pudo conectar a MongoDB:', err));

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages]
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) { client.commands.set(command.data.name, command); }
}

client.once(Events.ClientReady, () => {
    console.log(`¡Listo! El bot ${client.user.tag} está online.`);
});

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            await command.execute(interaction);
        } else if (interaction.isButton()) {
            const esAprobador = interaction.member.roles.cache.has(ROL_APROBADOR_ID) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);

            if (interaction.customId === 'request_manager_role_button') {
                const modal = new ModalBuilder().setCustomId('manager_request_modal').setTitle('Formulario de Solicitud de Mánager');
                const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsername').setLabel("Tu nombre de usuario en VPG").setStyle(TextInputStyle.Short).setRequired(true);
                const teamNameInput = new TextInputBuilder().setCustomId('teamName').setLabel("Nombre de tu equipo en VPG").setStyle(TextInputStyle.Short).setRequired(true);
                const leagueNameInput = new TextInputBuilder().setCustomId('leagueName').setLabel("Liga de VPG en la que compites").setStyle(TextInputStyle.Short).setRequired(true);
                // --- LÍNEA CORREGIDA ---
                // Se ha corregido 'ActionRowRowBuilder' a 'ActionRowBuilder'.
                modal.addComponents(new ActionRowBuilder().addComponents(vpgUsernameInput), new ActionRowBuilder().addComponents(teamNameInput), new ActionRowBuilder().addComponents(leagueNameInput));
                await interaction.showModal(modal);
            } else if (interaction.customId.startsWith('approve_request_')) {
                if (!esAprobador) {
                    return interaction.reply({ content: 'No tienes permiso para aprobar solicitudes.', ephemeral: true });
                }
                const parts = interaction.customId.split('_');
                const applicantId = parts[2];
                const teamName = parts.slice(3).join(' ');
                const modal = new ModalBuilder().setCustomId(`approve_modal_${applicantId}_${teamName}`).setTitle(`Aprobar Equipo: ${teamName}`);
                const teamLogoInput = new TextInputBuilder().setCustomId('teamLogoUrl').setLabel("URL del Escudo del Equipo").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(teamLogoInput));
                await interaction.showModal(modal);
            } else if (interaction.customId.startsWith('reject_request_')) {
                if (!esAprobador) {
                    return interaction.reply({ content: 'No tienes permiso para rechazar solicitudes.', ephemeral: true });
                }
                const applicantId = interaction.customId.split('_')[2];
                const applicant = await interaction.guild.members.fetch(applicantId);
                const disabledRow = new ActionRowBuilder().addComponents(
                    ButtonBuilder.from(interaction.message.components[0].components[0]).setDisabled(true),
                    ButtonBuilder.from(interaction.message.components[0].components[1]).setDisabled(true)
                );
                await interaction.message.edit({ components: [disabledRow] });
                await interaction.reply({ content: `La solicitud de **${applicant.user.tag}** ha sido rechazada.`, ephemeral: false });
                await applicant.send(`Tu solicitud para registrar un equipo ha sido rechazada por un administrador.`).catch(() => {});
            }
        } else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'manager_request_modal') {
                const vpgUsername = interaction.fields.getTextInputValue('vpgUsername');
                const teamName = interaction.fields.getTextInputValue('teamName');
                const leagueName = interaction.fields.getTextInputValue('leagueName');
                const approvalChannel = await client.channels.fetch(CANAL_APROBACIONES_ID);
                if (!approvalChannel) {
                    return interaction.reply({ content: 'Hubo un error al procesar tu solicitud.', ephemeral: true });
                }
                const embed = new EmbedBuilder().setTitle('Nueva Solicitud de Mánager').setColor('#f1c40f').addFields({ name: 'Solicitante', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true }, { name: 'Usuario VPG', value: vpgUsername, inline: true }, { name: 'Nombre del Equipo', value: teamName, inline: false }, { name: 'Liga', value: leagueName, inline: false }).setTimestamp();
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`approve_request_${interaction.user.id}_${teamName}`).setLabel("✅ Aprobar").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`reject_request_${interaction.user.id}`).setLabel("❌ Rechazar").setStyle(ButtonStyle.Danger));
                await approvalChannel.send({ embeds: [embed], components: [row] });
                await interaction.reply({ content: 'Tu solicitud ha sido enviada a los administradores para su revisión.', ephemeral: true });
            } else if (interaction.customId.startsWith('approve_modal_')) {
                const parts = interaction.customId.split('_');
                const applicantId = parts[2];
                
                const approvalChannel = await client.channels.fetch(CANAL_APROBACIONES_ID);
                const messages = await approvalChannel.messages.fetch({ limit: 50 });
                const originalRequestMessage = messages.find(msg => msg.embeds[0]?.fields[0]?.value.includes(applicantId) && !msg.components[0]?.components[0]?.disabled);
                
                if (!originalRequestMessage) {
                    return interaction.reply({ content: 'No se pudo encontrar la solicitud original o ya fue procesada.', ephemeral: true });
                }

                const teamName = originalRequestMessage.embeds[0].fields.find(f => f.name === 'Nombre del Equipo').value;
                const leagueName = originalRequestMessage.embeds[0].fields.find(f => f.name === 'Liga').value;
                const teamLogoUrl = interaction.fields.getTextInputValue('teamLogoUrl');
                const applicant = await interaction.guild.members.fetch(applicantId);

                const existingTeam = await Team.findOne({ name: teamName, guildId: interaction.guildId });
                if (existingTeam) {
                    return interaction.reply({ content: `Error: Ya existe un equipo llamado **${teamName}**.`, ephemeral: true });
                }

                const managerRole = await interaction.guild.roles.create({ name: `[${teamName}] Manager`, color: '#e67e22', mentionable: true });
                const captainRole = await interaction.guild.roles.create({ name: `[${teamName}] Capitán`, color: '#3498db' });
                const playerRole = await interaction.guild.roles.create({ name: `[${teamName}] Jugador`, color: '#95a5a6' });

                const newTeam = new Team({
                    name: teamName,
                    guildId: interaction.guildId,
                    league: leagueName,
                    logoUrl: teamLogoUrl,
                    managerRoleId: managerRole.id,
                    captainRoleId: captainRole.id,
                    playerRoleId: playerRole.id,
                    managerId: applicant.id,
                });
                await newTeam.save();

                await applicant.roles.add(managerRole);

                const disabledRow = new ActionRowBuilder().addComponents(
                    ButtonBuilder.from(originalRequestMessage.components[0].components[0]).setDisabled(true).setLabel('Aprobado'),
                    ButtonBuilder.from(originalRequestMessage.components[0].components[1]).setDisabled(true)
                );
                await originalRequestMessage.edit({ components: [disabledRow] });

                await interaction.reply({ content: `¡Equipo **${teamName}** aprobado y creado con éxito!`, ephemeral: false });
                await applicant.send(`¡Felicidades! Tu solicitud para registrar el equipo **${teamName}** ha sido APROBADA.`).catch(() => {});
            }
        }
    } catch (error) {
        console.error("Fallo crítico de interacción:", error.message, error.stack);
    }
});

client.login(process.env.DISCORD_TOKEN);
