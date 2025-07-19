const axios = require('axios');
const cheerio = require('cheerio');

async function getVpgProfile(vpgUsername) {
    try {
        // Etapa 1: Visitar la página del jugador para encontrar su equipo
        const userUrl = `https://virtualprogaming.com/user/${vpgUsername}`;
        const userPageResponse = await axios.get(userUrl);
        const $user = cheerio.load(userPageResponse.data);

        // Buscar el enlace a la página del equipo
        const teamLinkElement = $user('div.module-player-card-item:contains("EQUIPO")').next('a');
        if (teamLinkElement.length === 0) {
            return { error: `El usuario **${vpgUsername}** no parece tener un equipo asignado.` };
        }

        const teamName = teamLinkElement.text().trim();
        const teamUrl = `https://virtualprogaming.com${teamLinkElement.attr('href')}`;

        // Etapa 2: Visitar la página del equipo para obtener el resto de datos
        const teamPageResponse = await axios.get(teamUrl);
        const $team = cheerio.load(teamPageResponse.data);

        // Extraer la URL del logo
        const logoElement = $team('div.profile-team-logo img');
        const teamLogoUrl = logoElement.length ? logoElement.attr('src') : null;

        // Extraer el nombre del Mánager
        const managerElement = $team('div.module-player-card-item:contains("MANAGER")').next('a');
        const managerName = managerElement.length ? managerElement.text().trim() : null;
        const isManager = managerName?.toLowerCase() === vpgUsername.toLowerCase();

        // Devolver un objeto con toda la información
        return {
            vpgUsername,
            teamName,
            teamLogoUrl,
            isManager,
            error: null,
        };

    } catch (error) {
        if (error.response && error.response.status === 404) {
            return { error: `No se pudo encontrar al usuario de VPG **${vpgUsername}**. Revisa que el nombre sea correcto.` };
        }
        console.error("Error en el scraper:", error);
        return { error: "Ocurrió un error inesperado al intentar obtener los datos de VPG." };
    }
}

module.exports = { getVpgProfile };
