const axios = require('axios');
const cheerio = require('cheerio');

async function getVpgProfile(vpgUsername) {
    try {
        const userUrl = `https://virtualprogaming.com/user/${vpgUsername}`;
        const userPageResponse = await axios.get(userUrl);
        const $user = cheerio.load(userPageResponse.data);

        // --- CÓDIGO DE DEPURACIÓN ---
        // Vamos a buscar el div que contiene la palabra "EQUIPO"
        const teamInfoDiv = $user('div:contains("EQUIPO")');

        // Si no encontramos NADA que contenga la palabra "EQUIPO"
        if (teamInfoDiv.length === 0) {
            console.log("DEBUG: No se encontró ningún div con la palabra 'EQUIPO'.");
            return { error: `No se encontró la sección de equipo en el perfil de **${vpgUsername}**.` };
        }

        // Si SÍ lo encontramos, vamos a ver qué hay a su alrededor
        const siblingHtml = teamInfoDiv.next().html(); // Cogemos el HTML del siguiente elemento
        console.log("DEBUG: Se encontró el div 'EQUIPO'. El siguiente elemento es:", siblingHtml);

        // Devolvemos un mensaje de depuración para verlo en Discord
        return { error: `Debug exitoso. Revisa los logs de Render para ver la información.` };
        // --- FIN DEL CÓDIGO DE DEPURACIÓN ---

    } catch (error) {
        if (error.response && (error.response.status === 404 || error.response.status === 400)) {
            return { error: `No se pudo encontrar al usuario de VPG **${vpgUsername}**.` };
        }
        console.error("Error en el scraper:", error.message);
        return { error: "Ocurrió un error inesperado en el scraper." };
    }
}

module.exports = { getVpgProfile };
