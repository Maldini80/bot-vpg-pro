const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const mongoose = require('mongoose');
require('dotenv').config();

// Importamos los modelos y la config
const User = require('./models/user.js'); // Aunque no lo usemos aún, lo dejamos para el futuro
const Team = require('./models/team.js'); // <-- ¡NUEVO! Importamos el modelo de equipo
const { CANAL_APROBACIONES_ID, ROL_APROBADOR_ID } = require('./utils/config.js');

mongoose.connect(process.env.DATABASE_URL)
    .then(() => console.log('Conectado a la base de datos MongoDB.'))
    .catch(err => console.error('No se pudo conectar a MongoDB:', err));

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages]
});

// ... Carga de comandos (sin cambios)
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
            // ... (sin cambios)
        } else if (interaction.isButton()) {
            // ... (sin cambios)
        } else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'manager_request_modal') {
                // ... (sin cambios, esta parte ya funciona)
            } 
            // --- ¡AQUÍ ESTÁ LA LÓGICA ACTUALIZADA! ---
            else if (interaction.customId.startsWith('approve_modal_')) {
                const parts = interaction.customId.split('_');
                const applicantId = parts[2];
                // Recuperamos el nombre del equipo y la liga del embed original para más seguridad
                const originalRequestMessage = (await interaction.channel.messages.fetch({ limit: 50 })).find(msg => msg.embeds[0]?.fields[0]?.value.includes(applicantId) && !msg.components[0]?.components[0]?.disabled);

                if (!originalRequestMessage) {
                    return interaction.reply({ content: 'No se pudo encontrar la solicitud original. Puede que ya haya sido procesada.', ephemeral: true });
                }

                const teamName = originalRequestMessage.embeds[0].fields.find(f => f.name === 'Nombre del Equipo').value;
                const leagueName = originalRequestMessage.embeds[0].fields.find(f => f.name === 'Liga').value;
                const teamLogoUrl = interaction.fields.getTextInputValue('teamLogoUrl');
                const applicant = await interaction.guild.members.fetch(applicantId);

                // 1. Verificamos que el equipo no exista ya en la base de datos
                const existingTeam = await Team.findOne({ name: teamName, guildId: interaction.guildId });
                if (existingTeam) {
                    return interaction.reply({ content: `Error: Ya existe un equipo llamado **${teamName}**. Por favor, rechaza esta solicitud.`, ephemeral: true });
                }

                // 2. Creamos los 3 roles para el equipo en Discord
                const managerRole = await interaction.guild.roles.create({ name: `[${teamName}] Manager`, color: '#e67e22', mentionable: true });
                const captainRole = await interaction.guild.roles.create({ name: `[${teamName}] Capitán`, color: '#3498db' });
                const playerRole = await interaction.guild.roles.create({ name: `[${teamName}] Jugador`, color: '#95a5a6' });

                // 3. Creamos la nueva entrada del equipo en la base de datos
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

                // 4. Asignamos el rol de Mánager al solicitante
                await applicant.roles.add(managerRole);

                // 5. Deshabilitamos los botones de la solicitud original
                const disabledRow = new ActionRowBuilder().addComponents(
                    ButtonBuilder.from(originalRequestMessage.components[0].components[0]).setDisabled(true).setLabel('Aprobado'),
                    ButtonBuilder.from(originalRequestMessage.components[0].components[1]).setDisabled(true)
                );
                await originalRequestMessage.edit({ components: [disabledRow] });

                // 6. Confirmamos y notificamos
                await interaction.reply({ content: `¡Equipo **${teamName}** aprobado y creado con éxito! Se han generado los roles y **${applicant.user.tag}** ha sido asignado como Mánager.`, ephemeral: false });
                await applicant.send(`¡Felicidades! Tu solicitud para registrar el equipo **${teamName}** ha sido APROBADA. Ya tienes tu rol de mánager.`).catch(() => {});
            }
        }
    } catch (error) {
        console.error("Fallo crítico de interacción:", error.message, error.stack);
    }
});

client.login(process.env.DISCORD_TOKEN);
