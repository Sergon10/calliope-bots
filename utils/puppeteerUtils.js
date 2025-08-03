import fs from 'fs';
import path from 'path';
import { copiarTextoLargoPortapapeles } from './fileManager.js';

// Para numeros aleatorios
export function gauss(media, desviacion) {
    let u = 1 - Math.random(); // Valor aleatorio entre 0 y 1
    let v = 1 - Math.random();
    let z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    let resultado = z * desviacion + media; // Ajuste con media y desviación estándar
    return Math.abs(resultado);
}

// Para pausas en PUPPETEER (o cualquier script de javaScript)
export async function pausaGauss(tiempo_pausa, desviacion_tipica) {
    const pausaCalculada = Math.abs(gauss(tiempo_pausa, desviacion_tipica));
    // console.log(`Pausando por "${pausaCalculada.toFixed(2)}" ms`);
    return await new Promise(resolve => setTimeout(resolve, pausaCalculada));
}

export async function browserInit(puppeteer, incognito = false) {

    // Inicialización del navegador y nueva página
    try {

        // Cargar la configuración del usuario desde donde se ejecuta el comando                                                                                                                                                               
        const configPath = path.join(process.cwd(), 'config.json');
        if (!fs.existsSync(configPath)) {
            throw new Error('ERROR: No se encuentra el archivo config.json. Asegúrate de crearlo en la misma carpeta desde donde ejecutas el comando.');
        }
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

        // Objeto con las configuraciones del navegador
        const browserOptions = {
            headless: false, // Navegador visible
            args: incognito ? [
                '--incognito',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1280,720']
                : [
                    '--disable-blink-features=AutomationControlled',
                    '--remote-debugging-port=0',
                    '--start-maximized'
                ],
            executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
            //userDataDir: incognito ? undefined : path.join(PROJECT_ROOT, 'user_data') // Directorio para guardar datos de sesión
            executablePath: config.chromeExecutablePath,
            userDataDir: incognito ? undefined : config.chromeUserDataDir
        };

        // Verificar si el ejecutable de Chrome existe
        if (!fs.existsSync(browserOptions.executablePath)) {
            throw new Error(`El ejecutable de Chrome no se encuentra en la ruta especificada: ${browserOptions.executablePath}`);
        }

        // Iniciar navegador
        let browser = await puppeteer.launch(browserOptions);
        let context = browser.defaultBrowserContext();
        let page = (await context.pages())[0];

        // Configuración de la carpeta de descargas
        const carpetaDescargas = config.downloadsPath;
        if (!fs.existsSync(carpetaDescargas)) fs.mkdirSync(carpetaDescargas, {recursive: true}); // Si la carptea no existe la crea

        // Configuración de DevTools para descargas en esta primera página
        const client = await page.target().createCDPSession(); // target: bajo nivel navegador; ..CDPSess..: DevTools
        await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: carpetaDescargas }); // (behavior: descargas automáticas)

        // Configuración del ratón
        let x0, y0;
        try {

            await page.setViewport({ width: 1280, height: 720 });

            // Obtener el tamaño del viewport
            const viewport = page.viewport();

            // Generar coordenadas iniciales del ratón con aleatoriedad
            x0 = gauss(viewport.width / 2, viewport.width / 4);
            y0 = gauss(viewport.height / 2, viewport.height / 4);
            console.log(`INFO (browserInit): Coordenadas -> x0:${x0}, y0:${y0}.`)

            // Mover el ratón a una posición inicial aleatoria
            await page.mouse.move(x0, y0);

        } catch (error) {
            console.error("No se ha podido definir posicion inicial para el raton. ERROR: ", error.message, "\nEstableciendo valores por defecto en x=0:y=0");
            x0 = 0; // Valores por defecto en caso de error
            y0 = 0;
        }

        console.info(`INFO: Navegador iniciado. Raton posicionado en x=${x0}, y=${y0}`);
        return { browser, page, x0, y0, carpetaDescargas }; // Retorna el navegador, la página y pos inicial del raton

    } catch (error) {
        console.log('ERROR (browserINit): Ha sucedido un error al intentar iniciar el navegador y abrir una nueva pagina: ', error.message);
        throw error; // Lnaza el rror para manejarlo desde donde se llama
    }

}

// Navega y hace click
export async function navigateAndClick(page, selector, x0, y0, clickOption = 1) {
    let x1, y1; // Posiciones finales del click
    let element; // Sera un elementHandle

    // 1. Obtener el elemento según el tipo de parametro
    try {
        if (typeof selector === 'string') {
            await page.waitForSelector(selector, { timeout: 60000 }); // 60s
            element = await page.$(selector);
        } else {
            element = selector; // Se asume que ya es elementHandle
        }
        if (!element) {
            throw new Error(`No se pudo encontrar el elemento: "${selector}" en el DOM`);
        }
    } catch (error) {
        console.log(`ERROR (navigateAndClick): Error con selector "${selector}": ${error.message}`);
        return { x1: x0, y1: y0 };
    }

    // 2. Mover el ratón (si es posible)
    try {
        const elementBox = await element.boundingBox();
        if (elementBox && Number.isFinite(x0) && Number.isFinite(y0)) {
            // BoundingBox valido, se simula el movimiento del raton
            x1 = elementBox.x + elementBox.width / 2 + gauss(0, elementBox.width / 4);
            y1 = elementBox.y + elementBox.height / 2 + gauss(0, elementBox.height / 4);
            // Asegurarse de que x1 e y1 esten dentro del boundingBox
            x1 = Math.max(elementBox.x, Math.min(x1, elementBox.x + elementBox.width));
            y1 = Math.max(elementBox.y, Math.min(y1, elementBox.y + elementBox.height));

            // Generar trayectoria suave (curva Bezier) para simular el movimiento
            const controlPoint = {
                x: (x0 + x1) / 2 + gauss(0, Math.abs(x1 - x0) / 2),
                y: (y0 + y1) / 2 + gauss(0, Math.abs(y1 - y0) / 2)
            };
            const path = [];
            const pasos = 20;
            for (let i = 0; i <= pasos; i++) {
                const t = i / pasos;
                const x = Math.pow(1 - t, 2) * x0 + 2 * (1 - t) * t * controlPoint.x + Math.pow(t, 2) * x1;
                const y = Math.pow(1 - t, 2) * y0 + 2 * (1 - t) * t * controlPoint.y + Math.pow(t, 2) * y1;
                path.push({ x, y });
            }
            for (const punto of path) {
                await page.mouse.move(punto.x, punto.y);
                await pausaGauss(30, 10); // Pausa breve entre movimientos
            }
            await pausaGauss(100, 10);
        } else {
            console.log(`INFO (navigateAndClick): BoundingBox no valido para: "${selector}". No se moverá el ratón.`);
            x1 = x0;
            y1 = y0;
        }
    } catch (error) {
        console.log(`WARNING (navigateAndClick): No se pudo mover el ratón hacia "${selector}": ${error.message}`);
        x1 = x0;
        y1 = y0;
    }

    // 3. Hacer click según la opción especificada
    try {
        switch (clickOption) {
            case 1:
                console.log(`INFO (navigateAndClick): Usando OPCION 1 (click simulado) para: "${selector}".`);
                await element.click({ delay: Math.abs(gauss(70, 10)), button: 'left', clickCount: 1 });
                break;
            case 2:
                console.log(`INFO (navigateAndClick): Usando OPCION 2 (click directo) para: "${selector}".`);
                await element.click({ delay: Math.abs(gauss(70, 10)), button: 'left', clickCount: 1 });
                break;
            case 3:
                console.log(`INFO (navigateAndClick): Usando OPCION 3 (evaluate) para: "${selector}".`);
                await page.evaluate(el => el.click(), element);
                break;
            default:
                console.log(`INFO (navigateAndClick): Opción de click no válida. Usando OPCION 1 por defecto.`);
                await element.click({ delay: Math.abs(gauss(70, 10)), button: 'left', clickCount: 1 });
                break;
        }
        console.log(`INFO (navigateAndClick): Click realizado con éxito en: "${selector}" usando opción ${clickOption}`);

    } catch (clickError) {
        console.log(`WARNING (navigateAndClick): Falló la opción de click ${clickOption} para "${selector}": ${clickError.message}`);
        // Fallback a evaluate si el error es de "not clickable"
        if (clickError.message.includes("not clickable") || clickError.message.includes("not an Element")) {
            try {
                console.log(`INFO (navigateAndClick): Fallback a OPCION 3 (evaluate) para: "${selector}".`);
                await page.evaluate(el => el.click(), element);
                console.log(`INFO (navigateAndClick): Click (fallback) realizado con éxito en: "${selector}"`);
            } catch (evalError) {
                throw new Error(`No se pudo hacer click mediante evaluate (fallback): ${evalError.message}`);
            }
        } else {
            throw clickError;
        }
    }

    return { x1, y1 };
}

// Navega, hace click y rellena con texto un campo
export async function navigateAndFullFill(page, selector, texto, rapidez_escritura = "slow=(100,600)", x0, y0, pegarTexto = true) {

    let x1;
    let y1;

    try {

        // Hacer clic en el elemento seleccionado
        ({ x1, y1 } = await navigateAndClick(page, selector, x0, y0, 3));
        await pausaGauss(600, 200);

        // Limpiar contenedor
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await pausaGauss(50, 10)
        await page.keyboard.press('Delete');

        await pausaGauss(100, 20)

        // PAUSA ENTRE LETRAS
        let pausa = 100;
        let variacion = 600;
        if (rapidez_escritura === "fast") {
            variacion = 20;
        }

        // Escribiendo o pegando texto
        if (pegarTexto) {

            console.log(`INFO (navigateAndFullFill): Pegando texto...\nINFO (navigateAndFullFill): Texto: (${texto})`);

            // Copia el texto al portapapeles usando PowerShell
            try {

                copiarTextoLargoPortapapeles(texto); // Copia usando archivo temporal

            } catch (error) {
                throw new Error("ERROR: No se pudo copiar el texto al portapapeles: " + error.message);
            }

            // Simula la acción de pegar (Ctrl+V)
            await page.keyboard.down('Control');
            await page.keyboard.press('V');
            await page.keyboard.up('Control');

        } else {

            console.log(`INFO (navigateAndFullFill): Escribiendo ${rapidez_escritura}...`)

            const longitudTexto = texto.length;
            for (let i = 0; i < longitudTexto; i++) {

                await page.keyboard.type(texto[i]);

                // En lugar de usar pausaGauss, para que no se imprima cada pausa: ->
                const pausaCalculada = Math.abs(gauss(pausa, variacion));
                await new Promise(resolve => setTimeout(resolve, pausaCalculada));
            }
        }

    } catch (error) {
        // Manejo de errores si el selector no se encuentra o falla el clic
        console.log(`ERROR (navigateAndFullFill): Con selector "${selector}": `, error);
    }

    return { x1, y1 };

}