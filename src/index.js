const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
require('dotenv').config();

const { CANAL_APROBACIONES_ID, ROL_APROBADOR_ID } = require('./utils/config.js');

// Conexión a MongoDB (asumimos que tienes modelos para equipos más adelante)
mongoose.connect(process.env.DATABASE_URL)
    .then(() => console.log('Conectado a la base de datos MongoDB.'))
    .catch(err => console.error('No se pudo conectar a MongoDB:', err));

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages]
});

// Carga de comandos
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

client.once(Events.ClientReady, () => {
    console.log(`¡Listo! El bot ${client.user.tag} está online.`);
});

// Manejador de interacciones
client.on(Events.InteractionCreate, async interaction => {
    try {
        // --- MANEJO DE COMANDOS ---
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            await command.execute(interaction);
        }
        // --- MANEJO DE BOTONES ---
        else if (interaction.isButton()) {
            // Botón para iniciar la solicitud de mánager
            if (interaction.customId === 'request_manager_role_button') {
                const modal = new ModalBuilder()
                    .setCustomId('manager_request_modal')
                    .setTitle('Formulario de Solicitud de Mánager');

                const vpgUsernameInput = new TextInputBuilder().setCustomId('vpgUsername').setLabel("Tu nombre de usuario en VPG").setStyle(TextInputStyle.Short).setRequired(true);
                const teamNameInput = new TextInputBuilder().setCustomId('teamName').setLabel("Nombre de tu equipo en VPG").setStyle(TextInputStyle.Short).setRequired(true);
                const leagueNameInput = new TextInputBuilder().setCustomId('leagueName').setLabel("Liga de VPG en la que compites").setStyle(TextInputStyle.Short).setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(vpgUsernameInput),
                    new ActionRowBuilder().addComponents(teamNameInput),
                    new ActionRowBuilder().addComponents(leagueNameInput)
                );
                
                await interaction.showModal(modal);
            }
            // Botón de APROBAR solicitud (para admins)
            else if (interaction.customId.startsWith('approve_request_')) {
                if (!interaction.member.roles.cache.has(ROL_APROBADOR_ID)) {
                    return interaction.reply({ content: 'No tienes permiso para aprobar solicitudes.', ephemeral: true });
                }
                
                // Extraemos los datos del ID del botón
                const parts = interaction.customId.split('_');
                const applicantId = parts[2];
                const teamName = parts.slice(3).join(' ');

                const modal = new ModalBuilder()
                    .setCustomId(`approve_modal_${applicantId}_${teamName}`)
                    .setTitle(`Aprobar Equipo: ${teamName}`);
                
                const teamLogoInput = new TextInputBuilder().setCustomId('teamLogoUrl').setLabel("URL del Escudo del Equipo").setStyle(TextInputStyle.Short).setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(teamLogoInput));
                await interaction.showModal(modal);
            }
            // Botón de RECHAZAR solicitud (para admins)
            else if (interaction.customId.startsWith('reject_request_')) {
                if (!interaction.member.roles.cache.has(ROL_APROBADOR_ID)) {
                    return interaction.reply({ content: 'No tienes permiso para rechazar solicitudes.', ephemeral: true });
                }
                
                const applicantId = interaction.customId.split('_')[2];
                const applicant = await interaction.guild.members.fetch(applicantId);

                // Deshabilitamos los botones del mensaje original
                const disabledRow = new ActionRowBuilder().addComponents(
                    interaction.message.components[0].components[0].setDisabled(true),
                    interaction.message.components[0].components[1].setDisabled(true)
                );
                await interaction.message.edit({ components: [disabledRow] });

                await interaction.reply({ content: `La solicitud de **${applicant.user.tag}** ha sido rechazada.`, ephemeral: false });
                await applicant.send(`Tu solicitud para registrar un equipo ha sido rechazada por un administrador.`).catch(() => {});
            }
        }
        // --- MANEJO DE FORMULARIOS (MODALS) ---
        else if (interaction.isModalSubmit()) {
            // Formulario enviado por el aspirante a mánager
            if (interaction.customId === 'manager_request_modal') {
                const vpgUsername = interaction.fields.getTextInputValue('vpgUsername');
                const teamName = interaction.fields.getTextInputValue('teamName');
                const leagueName = interaction.fields.getTextInputValue('leagueName');

                const approvalChannel = await client.channels.fetch(CANAL_APROBACIONES_ID);
                if (!approvalChannel) {
                    console.error("El canal de aprobaciones no se encontró.");
                    return interaction.reply({ content: 'Hubo un error al procesar tu solicitud. Por favor, contacta a un administrador.', ephemeral: true });
                }
                
                const embed = new EmbedBuilder()
                    .setTitle('Nueva Solicitud de Mánager')
                    .setColor('#f1c40f')
                    .addFields(
                        { name: 'Solicitante', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                        { name: 'Usuario VPG', value: vpgUsername, inline: true },
                        { name: 'Nombre del Equipo', value: teamName, inline: false },
                        { name: 'Liga', value: leagueName, inline: false }
                    )
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`approve_request_${interaction.user.id}_${teamName}`).setLabel("✅ Aprobar").setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`reject_request_${interaction.user.id}`).setLabel("❌ Rechazar").setStyle(ButtonStyle.Danger)
                );

                await approvalChannel.send({ embeds: [embed], components: [row] });
                await interaction.reply({ content: 'Tu solicitud ha sido enviada a los administradores para su revisión. ¡Recibirás una notificación con el resultado!', ephemeral: true });
            }
            // Formulario enviado por el admin para FINALIZAR la aprobación
            else if (interaction.customId.startsWith('approve_modal_')) {
                const parts = interaction.customId.split('_');
                const applicantId = parts[2];
                const teamName = parts.slice(3).join(' ');
                const teamLogoUrl = interaction.fields.getTextInputValue('teamLogoUrl');

                const applicant = await interaction.guild.members.fetch(applicantId);
                
                // --- ¡AQUÍ IRÍA LA LÓGICA FUTURA! ---
                // 1. Guardar el equipo, el mánager, la liga, el escudo, etc., en la base de datos.
                console.log(`EQUIPO APROBADO: Nombre=${teamName}, Mánager=${applicant.user.tag}, Escudo=${teamLogoUrl}`);
                // 2. Crear los roles para el equipo (ej: `ROL - ${teamName} (Manager)`).
                // 3. Asignar el rol de Mánager al 'applicant'.
                // 4. Darle acceso al canal privado de mánagers.

                // Por ahora, solo confirmamos la acción.
                const originalRequestMessage = await interaction.channel.messages.fetch(interaction.message.reference.messageId);
                const disabledRow = new ActionRowBuilder().addComponents(
                    originalRequestMessage.components[0].components[0].setDisabled(true).setLabel('Aprobado'),
                    originalRequestMessage.components[0].components[1].setDisabled(true)
                );
                await originalRequestMessage.edit({ components: [disabledRow] });

                await interaction.reply({ content: `¡Equipo **${teamName}** aprobado! El mánager **${applicant.user.tag}** ha sido notificado y configurado.`, ephemeral: false });
                await applicant.send(`¡Felicidades! Tu solicitud para registrar el equipo **${teamName}** ha sido APROBADA. Ya tienes acceso a las herramientas de mánager.`).catch(() => {});
            }
        }
    } catch (error) {
        console.error("Fallo crítico de interacción:", error.message, error.stack);
    }
});

client.login(process.env.DISCORD_TOKEN);
