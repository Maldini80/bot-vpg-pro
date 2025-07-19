const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const mongoose = require('mongoose');
require('dotenv').config();

const Team = require('./models/team.js');
const { CANAL_APROBACIONES_ID, ROL_APROBADOR_ID } = require('./utils/config.js');

mongoose.connect(process.env.DATABASE_URL)
    .then(() => console.log('Conectado a la base de datos MongoDB.'))
    .catch(err => console.error('No se pudo conectar a MongoDB:', err));

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages]
});

// ... Carga de comandos ...
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
        if (interaction.isChatInputCommand()) { /* ... */ }
        else if (interaction.isButton()) { /* ... */ }
        else if (interaction.isModalSubmit()) {
            if (interaction.customId === 'manager_request_modal') { /* ... (sin cambios) */ }
            // --- LÓGICA DE APROBACIÓN ACTUALIZADA ---
            else if (interaction.customId.startsWith('approve_modal_')) {
                const applicantId = interaction.customId.split('_')[2];
                const originalRequestMessage = (await interaction.channel.messages.fetch({ limit: 50 })).find(msg => msg.embeds[0]?.fields[0]?.value.includes(applicantId) && !msg.components[0]?.components[0]?.disabled);
                if (!originalRequestMessage) return interaction.reply({ content: 'No se pudo encontrar la solicitud original.', ephemeral: true });

                const teamName = originalRequestMessage.embeds[0].fields.find(f => f.name === 'Nombre del Equipo').value;
                const leagueName = originalRequestMessage.embeds[0].fields.find(f => f.name === 'Liga').value;
                const teamLogoUrl = interaction.fields.getTextInputValue('teamLogoUrl');
                const applicant = await interaction.guild.members.fetch(applicantId);

                // 1. Verificaciones
                const existingTeam = await Team.findOne({ name: teamName, guildId: interaction.guildId });
                if (existingTeam) return interaction.reply({ content: `Error: Ya existe un equipo llamado **${teamName}**.`, ephemeral: true });
                const isAlreadyManager = await Team.findOne({ managerId: applicant.id });
                if (isAlreadyManager) return interaction.reply({ content: `Error: Este usuario ya es mánager del equipo **${isAlreadyManager.name}**.`, ephemeral: true });

                // 2. Guardamos el equipo en la base de datos (sin crear roles)
                const newTeam = new Team({
                    name: teamName,
                    guildId: interaction.guildId,
                    league: leagueName,
                    logoUrl: teamLogoUrl,
                    managerId: applicant.id,
                });
                await newTeam.save();

                // 3. Asignamos el ROL GENÉRICO de Mánager
                const managerRoleId = process.env.MANAGER_ROLE_ID;
                if (!managerRoleId) {
                    console.error("¡Variable de entorno MANAGER_ROLE_ID no configurada!");
                    return interaction.reply({ content: 'Error de configuración: No se ha definido el rol de mánager.', ephemeral: true });
                }
                await applicant.roles.add(managerRoleId);

                // 4. Actualizamos el apodo del mánager
                await applicant.setNickname(`${applicant.user.username} | ${teamName}`);
                
                // 5. Deshabilitamos botones y notificamos
                const disabledRow = new ActionRowBuilder().addComponents(ButtonBuilder.from(originalRequestMessage.components[0].components[0]).setDisabled(true).setLabel('Aprobado'), ButtonBuilder.from(originalRequestMessage.components[0].components[1]).setDisabled(true));
                await originalRequestMessage.edit({ components: [disabledRow] });

                await interaction.reply({ content: `¡Equipo **${teamName}** aprobado! **${applicant.user.tag}** ha recibido el rol de Mánager.`, ephemeral: false });
                await applicant.send(`¡Felicidades! Tu equipo **${teamName}** ha sido APROBADO.`).catch(() => {});
            }
        }
    } catch (error) {
        console.error("Fallo crítico de interacción:", error.message, error.stack);
    }
});

client.login(process.env.DISCORD_TOKEN);
