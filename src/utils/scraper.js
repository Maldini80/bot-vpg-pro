const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

async function getVpgProfile(vpgUsername) {
    let browser = null;
    let page = null; // Definimos page aquí para poder acceder a ella en el catch
    try {
        console.log(`PUPPETEER: Iniciando navegador para ${vpgUsername}...`);
        
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        page = await browser.newPage();
        const userUrl = `https://virtualprogaming.com/user/${vpgUsername}`;

        await page.goto(userUrl, { waitUntil: 'networkidle2' });
        await page.waitForSelector('.profile-info-container', { timeout: 30000 });

        const content = await page.content();
        const $ = cheerio.load(content);
        
        await browser.close();
        browser = null;

        const teamLinkElement = $('div.text-muted:contains("EQUIPO")').next().find('a');
        if (teamLinkElement.length === 0) {
            return { error: `No se pudo encontrar un equipo en el perfil de **${vpgUsername}**.` };
        }

        const teamName = teamLinkElement.text().trim();
        const teamUrl = teamLinkElement.attr('href');

        const teamPageResponse = await axios.get(teamUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $team = cheerio.load(teamPageResponse.data);
        const teamLogoUrl = $team('.profile-team-emblem img').attr('src');
        let isManager = false;
        const managerHeader = $team('h5:contains("MANAGER")');
        if (managerHeader.length > 0) {
            if (managerHeader.next().find(`a[href*="/user/${vpgUsername}"]`).length > 0) isManager = true;
        }

        return { vpgUsername, teamName, teamLogoUrl: teamLogoUrl || null, isManager };

    } catch (error) {
        console.error(`PUPPETEER ERROR para ${vpgUsername}:`, error.message);

        // --- LÓGICA DE DEPURACIÓN CON CAPTURA DE PANTALLA ---
        let screenshotUrl = 'No se pudo generar la captura.';
        if (page) {
            try {
                // Genera un nombre de archivo único para la captura de pantalla
                const screenshotPath = `error_screenshot_${Date.now()}.png`;
                await page.screenshot({ path: screenshotPath, fullPage: true });
                console.log(`Captura de pantalla guardada en: ${screenshotPath}`);

                // Prepara el formulario para subir la imagen
                const form = new FormData();
                form.append('key', process.env.FREEIMAGE_API_KEY);
                form.append('action', 'upload');
                form.append('source', fs.createReadStream(screenshotPath));

                // Sube la imagen a freeimage.host
                const response = await axios.post('https://freeimage.host/api/1/upload', form, {
                    headers: form.getHeaders()
                });
                
                screenshotUrl = response.data.image.url;
                fs.unlinkSync(screenshotPath); // Borra la imagen local después de subirla para no ocupar espacio

            } catch (uploadError) {
                console.error("Error al subir la captura de pantalla:", uploadError.message);
                screenshotUrl = `Error al subir la captura: ${uploadError.message}`;
            }
        }
        
        // Devuelve el mensaje de error junto con el enlace a la captura de pantalla
        return { 
            error: `No se pudo cargar el perfil de VPG para **${vpgUsername}**. El sitio puede estar lento o protegido.\n\n**Depuración:** Revisa esta captura de lo que vio el bot: ${screenshotUrl}`
        };
    } finally {
        // Asegura que el navegador siempre se cierre, incluso si hay un error
        if (browser) {
            await browser.close();
        }
    }
}

module.exports = { getVpgProfile };
