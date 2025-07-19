const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const axios = require('axios');

async function getVpgProfile(vpgUsername) {
    let browser = null; // Definimos el navegador aquí para poder cerrarlo en el bloque 'finally'
    try {
        console.log(`PUPPETEER: Iniciando navegador para ${vpgUsername}...`);
        
        // Inicia una instancia del navegador sin cabeza (headless).
        // Los argumentos '--no-sandbox' y '--disable-setuid-sandbox' son cruciales
        // para que funcione en entornos de servidor como Render.
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        // Abre una nueva pestaña en el navegador
        const page = await browser.newPage();
        const userUrl = `https://virtualprogaming.com/user/${vpgUsername}`;

        // Navega a la URL del perfil y espera a que la red esté inactiva,
        // lo que usualmente significa que la página ha terminado de cargar.
        await page.goto(userUrl, { waitUntil: 'networkidle2' });

        // Espera explícitamente a que aparezca un elemento específico que solo
        // existe después de que el JavaScript se haya ejecutado.
        // Esto confirma que el contenido dinámico está presente.
        await page.waitForSelector('.profile-info-container', { timeout: 30000 });

        // Obtiene el HTML completo de la página después de la ejecución de JavaScript.
        const content = await page.content();
        const $ = cheerio.load(content);
        
        // Cierra el navegador tan pronto como ya no lo necesitemos para liberar recursos.
        await browser.close();
        browser = null;

        // A partir de aquí, usamos Cheerio para analizar el HTML que obtuvimos.
        const teamLinkElement = $('div.text-muted:contains("EQUIPO")').next().find('a');
        if (teamLinkElement.length === 0) {
            return { error: `No se pudo encontrar un equipo en el perfil de **${vpgUsername}**.` };
        }

        const teamName = teamLinkElement.text().trim();
        const teamUrl = teamLinkElement.attr('href');

        // Para la segunda página (la del equipo), podemos usar axios que es más rápido,
        // ya que no parece requerir una renderización de JS tan compleja.
        const teamPageResponse = await axios.get(teamUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $team = cheerio.load(teamPageResponse.data);
        const teamLogoUrl = $team('.profile-team-emblem img').attr('src');
        
        let isManager = false;
        const managerHeader = $team('h5:contains("MANAGER")');
        if (managerHeader.length > 0) {
            if (managerHeader.next().find(`a[href*="/user/${vpgUsername}"]`).length > 0) {
                isManager = true;
            }
        }

        // Devuelve el objeto con toda la información recopilada.
        return { 
            vpgUsername, 
            teamName, 
            teamLogoUrl: teamLogoUrl || null, 
            isManager 
        };

    } catch (error) {
        // Captura cualquier error que ocurra durante el proceso.
        console.error(`PUPPETEER ERROR para ${vpgUsername}:`, error.message);
        return { error: `No se pudo cargar el perfil de VPG para **${vpgUsername}**. El sitio puede estar lento o el perfil no existe.` };
    } finally {
        // Este bloque se asegura de que el navegador se cierre siempre,
        // incluso si ocurre un error, para evitar procesos fantasma.
        if (browser) {
            await browser.close();
        }
    }
}

module.exports = { getVpgProfile };
