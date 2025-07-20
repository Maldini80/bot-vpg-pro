// src/handlers/autocompleteHandler.js
const Team = require('../models/team.js');

module.exports = async (client, interaction) => {
    // Este es el manejador para las interacciones de autocompletado.
    // Actualmente no tenemos comandos activos que usen autocompletado,
    // pero mantenemos la estructura para futuras implementaciones.

    /*
    EJEMPLO DE USO FUTURO:
    Si tuvieras un comando como /ver-equipo con una opción "nombre" que se autocompleta:

    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'nombre') {
        const teams = await Team.find({ 
            guildId: interaction.guildId, 
            name: { $regex: focusedOption.value, $options: 'i' } 
        }).limit(25);
        
        await interaction.respond(
            teams.map(team => ({ name: `${team.name} (${team.abbreviation})`, value: team._id.toString() }))
        );
    }
    */
};
