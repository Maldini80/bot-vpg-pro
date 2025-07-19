const axios = require('axios');
const cheerio = require('cheerio');

async function getVpgProfile(vpgUsername) {
    try {
        const userUrl = `https://virtualprogaming.com/user/${vpgUsername}`;
        console.log(`SCRAPER DEBUG: Accediendo a la URL: ${userUrl}`);

        const userPageResponse = await axios.get(userUrl, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        const html = userPageResponse.data;

        // --- CÓDIGO DE DEPURACIÓN CRÍTICO ---
        // Imprimimos el HTML completo que el bot está recibiendo.
        console.log("--- INICIO DEL HTML RECIBIDO POR EL SCRAPER ---");
        console.log(html);
        console.log("--- FIN DEL HTML RECIBIDO POR EL SCRAPER ---");
        
        // Devolvemos un mensaje claro para que sepas qué hacer.
        return { error: `MODO DEBUG ACTIVADO. Se ha guardado el HTML de la página en los logs de Render. Por favor, revisa los logs y envía el contenido.` };

    } catch (error) {
        if (error.response) {
            console.error(`SCRAPER ERROR: Status ${error.response.status} al acceder a la URL.`);
            return { error: `No se pudo encontrar al usuario de VPG **${vpgUsername}** (Error: ${error.response.status}).` };
        }
        console.error("Error inesperado en el scraper:", error);
        return { error: "Ocurrió un error general en el scraper. Revisa los logs." };
    }
}

module.exports = { getVpgProfile };
