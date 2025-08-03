#!/usr/bin/env node

// --CODIGO--
import fs from 'fs';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import readline from 'readline';

// Importar funciones propias
import { gptInit } from './utils/gptUtils.js'; // Funciones Auxiliares
import { pausaGauss, browserInit, navigateAndFullFill, navigateAndClick } from './utils/puppeteerUtils.js';
import { ordenarArchivos_js } from './utils/fileManager.js';

puppeteer.use(StealthPlugin())

async function gptGetImage(page, prompt, x0, y0, respuestasDOM = 0) {

    let x1, y1, respuesta, aparentesRespuestas = [];
    let diagnostico = "";
    try {

        // Selector del área de texto para introducir el prompt
        const selectorIntroducirPrompt = 'div[id="prompt-textarea"]';

        // Rellena el area de texto con el mensaje
        ({ x1, y1 } = await navigateAndFullFill(page, selectorIntroducirPrompt, prompt, "fast", x0, y0, true));

        // 1. Envía el mensaje
        await pausaGauss(300, 20);
        await page.keyboard.press('Enter');
        await pausaGauss(500, 20);

        // 2. Espera a que la respuesta se complete
        let generatedFlag = false;
        let secondsWaiting = 0;
        let aparentesRespuestas = [];
        let nAparentesRespuestas = respuestasDOM;
        while (nAparentesRespuestas <= respuestasDOM && secondsWaiting < 120) {

            // 2.1 Extraer contenedores en el DOM
            aparentesRespuestas = await page.$$('button[aria-label="Download this image"]')
            nAparentesRespuestas = aparentesRespuestas.length

            // 2.2 Detectar nueva respuesta
            if (nAparentesRespuestas > respuestasDOM) {
                generatedFlag = true;
                console.log("INFO (gptSendMessage): Respuesta completada encontrada, intentando dar a boton 'download'...")
                break
            } else {
                secondsWaiting += 0.5;
                await pausaGauss(500, 1);
                //console.log(`INFO: ${secondsWaiting}s esperando. RespuestasDOM -> ${respuestasDOM}, Respuestas Nuevas ${nAparentesRespuestas}`)
            }

        }

        if (!generatedFlag) { throw new Error(`No se ha encontrado contenedor de imagen en 120s.`) }

        // ---- Descargar Imagen ----
        if (aparentesRespuestas.length > respuestasDOM) {

            const botonDownload = aparentesRespuestas[aparentesRespuestas.length - 1]
            await page.mouse.wheel({ deltaY: 600 });
            // A.2.1 Hace clic en 'Copiar código' o 'Copy code', según corresponda
            ({ x1, y1 } = await navigateAndClick(page, botonDownload, x1, y1));
            await pausaGauss(8000, 1000);
        }


    } catch (error) { // Errores conocidos 
        console.log(`ERROR AL DESCARGAR IMAGEN ${respuestasDOM + 1}: `, error)
        try {
            // 1. Recogemos texto del contenedor
            aparentesRespuestas = await page.$$('div[class="markdown prose dark:prose-invert w-full break-words dark"]')
            const textContainers = await aparentesRespuestas.at(-1)?.$$('p[data-start][data-end]');
            if (!textContainers || textContainers.length === 0) { throw new Error("No hay contenedores 'p[data-start][data-end]' dentro del contenedor markdown.prose") }
            for(const container of textContainers){
                const containerText = await container.getProperty('textContent');
                respuesta += await containerText.jsonValue()
            }

            // 2. Generamos diagnóstico
            // E2.1 Límite uso
            const limitRelatedWords = ['limit', 'limite', 'límite', 'frecuencia', 'velocidad', 'frecuency', 'temporal', 'minutos', 'minutes'];
            for (let word of limitRelatedWords) {
                if (respuesta.includes(word)) {
                    // (Estamos jodidos)
                    diagnostico = "(E2.1) Limite de uso..."
                    // E.2.1 - Intentamos saber cuanto hay que esperar y esperamos
                    const matchMin = respuesta.match(/(\d+)\s*minutos?/i);
                    if (matchMin) {
                        const minutos = parseInt(matchMin[1], 10);
                        const delayMs = minutos * 60 * 1000;
                        console.log(`WARNING (bot_Sora): Rate limit – esperando ${minutos} minutos (${delayMs} ms) antes de reintentar.`);
                        await pausaGauss(delayMs, 10);
                        break;
                    }
                }
            }
            // E2.2 - Violacion políticas
            const politicsRelatedWords = ['políticas', 'infringe', 'infring', 'infringir', 'violate', 'violates', 'polices', 'viola'];
            for (let word of politicsRelatedWords) {
                if (respuesta.includes(word)) {
                    diagnostico = '(E2.2) Create the MOST SIMILAR IMAGE THAT YOU DO CAN create without violation your norms. Do not include the critical elements that violate the norms, but I NEED A RESPONSE, please answer with an image, even if it doesnt approach the prompt i gave you. '
                    break;
                }
            }
        } catch (error) {
            console.log(`No se ha logrado identificar o solucionar la causa del error: ${error}. Cambiando estado de diagnostico a = " ".`);
            diagnostico = " ";
        }
    }
    return { x1, y1, diagnostico }
}

async function bot_Sora(jsonPrompts, contentType, imagesStyle) {

    let AR;
    let page, browser, x1, y1, carpetaDescargas, respuestasDOM = 0;
    
    if (contentType === 'video') {
        AR = '16:9'
    } else if (contentType === 'short') {
        AR = '9:16'
    }

    try {

        // Inicialización del navegador y nueva página
        ({ browser, page, x0: x1, y0: y1, carpetaDescargas } = await browserInit(puppeteer));
        // Comprobacion inical necesaria
        // Comprobación inicial de archivos .png en descargas
        const initCount = ordenarArchivos_js(carpetaDescargas, 'png').length;
        if (initCount > 0) {
            console.log(`WARNING: Se han detectado ${initCount} archivos .png en el directorio de descargas (${carpetaDescargas}).`);
            // Preguntar al usuario si desea limpiar antes de continuar
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            const answer = await new Promise(resolve => rl.question('¿Deseas eliminar estos archivos y continuar? (y/n): ', resolve));
            rl.close();

            if (answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes') {
                console.log('Eliminando archivos existentes...');
                const existingFiles = ordenarArchivos_js(carpetaDescargas, 'png');
                existingFiles.forEach(file => fs.unlinkSync(file));
            } else {
                console.log('Abortando proceso. No se ha modificado el directorio de descargas.');
                if (browser) await browser.close();
                process.exit(1);
            }
        }

        // Declaracion funcion de comprobacion (se pasa directorio descargas devuelto x browserInit)
        async function waitAndCheckImage(imageIndex) {
            console.log("INFO (waitAndCheckImage): Procediendo a validar descarga…");

            const timeoutMs = 10_000;   // 10 s
            const intervalMs = 1_000;    // 1 s
            const t0 = Date.now();

            while (Date.now() - t0 < timeoutMs) {
                
                const pngFiles = ordenarArchivos_js(carpetaDescargas, "png"); // refresca siempre
                const outputsDirectory = './outputs';

                if (pngFiles.length === 1) {
                    
                    // ---- Se ha descargado la imagen esperada ----
                    const rutaVieja = pngFiles.at(-1);               // último PNG
                    let rutaNueva = path.join(outputsDirectory, `${imageIndex}_calliopeBot_image.png`);
                    

                    try {
                        // 1) Cambiar Nombre y Mover
                        fs.mkdirSync(outputsDirectory, { recursive: true }); fs.renameSync(rutaVieja, rutaNueva);
                        console.log(`INFO (waitAndCheckImage): Imagen #${imageIndex} detectada y renombrada a '${path.basename(rutaNueva)}' y movida al su directorio`);
                    } catch (e) {
                        console.log(`WARNING (waitAndCheckImage): No se pudo renombrar '${rutaVieja}' → '${rutaNueva}':`, e.message);
                    }
                    return ""; // sin diagnóstico: todo OK
                }

                if (pngFiles.length < 1) {
                    console.log(`INFO (waitAndCheckImage): 0 imágenes en descargas; esperando…`);
                } else {
                    // Esto no debería ocurrir, pero por si acaso:
                    console.log(`WARNING (waitAndCheckImage): Hay más PNGs de los esperados (${pngFiles.length}).`);
                    throw new Error("Hay mas imagenes de las esperadas, algo ha sucedido, necesaria revision manual...");
                }

                await pausaGauss(intervalMs, 10);
            }

            // ---- Timeout ----
            const pngCount = ordenarArchivos_js(carpetaDescargas, "png").length;
            console.log(`WARNING (waitAndCheckImage): Timeout de 10 s – sólo ${pngCount}/${imageIndex} imágenes detectadas`);
            return `Faltan imágenes: ${pngCount}/${imageIndex} encontradas`;
        }

        // Declaracion funcion de reinicio de seision
        async function resetChatSession() {
            if (browser) { await browser.close() }
            ({ browser, page, x0: x1, y0: y1, carpetaDescargas } = await browserInit(puppeteer));
            await pausaGauss(600, 100)
            await gptInit(page, 'https://chatgpt.com/?model=gpt-4o');
            respuestasDOM = 0;
            await pausaGauss(600, 100);
            return { browser, page, x1, y1 }
        }

        // 1. Entrando al gpt personalizado
        await gptInit(page, 'https://chatgpt.com/?model=gpt-4o');
        await pausaGauss(600, 100);

        // 2. Generar N imagenes  

        let diagnostico = "";
        for (let i=0; i < jsonPrompts.length; i++) {
            const prompts4Img = Object.values(jsonPrompts[i]);
            let prompt = `Create the following image in ${AR} AR for a YouTube ${contentType}. Stick to the image. You can put words in objects but DO NOT INCLUDE RAW TEXT (never inlude the title or any text in the image further tan words on top of objets). Keep in mind that each of the following prompts corresponds to a phrase from the ${contentType} script. Each image will be placed synchronously with that phrase in the ${contentType} montage. Therefore, stick to the positive prompt and avoid the negative. The image title is for reference only (DO NOT INCLUDE THAT TEXT IN THE IMAGE). REMEMBER ${AR}. Remember to include the text if specific text is mentioned in the prompt. positive prompt (include this in the image): ${prompts4Img[0]}; negative prompt (what you must not include): ${prompts4Img[1]}.`;    
            prompt += `${imagesStyle}`;
            
            // Parte crítica (SE DEBE GENERAR LA IMAGEN SI o SI)
            try {
                // 1er Posible cambio de diagnostico
                ({ x1, y1, diagnostico } = await gptGetImage(page, prompt, x1, y1, respuestasDOM));
                respuestasDOM++
                await pausaGauss(5000, 100)
                // 2ndo Posible cambio de diagnostico
                diagnostico += await waitAndCheckImage(i + 1)

                // ERROR - Imagen no se genera
                if (diagnostico !== "") {
                    let abrirNuevaVentana = true;
                    let promptRetry = prompt;
                    let trials = 1;
                    const maxDelay = 30 * 60 * 1000 // mm * ss * ms
                    const ratio = Math.pow(maxDelay / 5000, 1 / (10 - 1)); // (maxDelay / initialDelay, 1 / (maxAttempts - 1)) -> apro: [5000, 10653, 22688, 48370, 103007, 219323, 466891, 995132, 2122451, 1800000]

                    while (diagnostico !== "" && trials <= 10) {

                        // Caso infraccion politicas PT.1
                        if( diagnostico.includes('violation') ){ 
                            promptRetry = `${diagnostico}!. `
                            abrirNuevaVentana = false;
                        };
                                                
                        // 1. Reiniciar diagnostico
                        console.log(`WARNING (bot_Sora): Se ha detectado diagnostico: '${diagnostico}'.`);
                        diagnostico = "";
                        console.log(`WARNING (bot_Sora): Abriendo nuevo navegador y chat...`);
                        // 2. Reiniciar respuestasDOM
                        if(abrirNuevaVentana){
                            ({ browser, page, x1, y1 } = await resetChatSession()) // Esta funcion ya reseteao respuestasDOM a 0.
                        }
                        // 3. Reintentar
                        console.log("WARNING (bot_Sora): Reintentando descarga...");
                        ({ x1, y1, diagnostico } = await gptGetImage(page, promptRetry, x1, y1, respuestasDOM));
                        respuestasDOM++
                        await pausaGauss(5000, 100)
                        diagnostico += await waitAndCheckImage(i + 1)

                        // 4. Espera geometricamente incremental (30min Max.)
                        if (diagnostico !== "") {
                            // Caso infraccion politicas PT.2
                            if(diagnostico.includes('violation') && trials > 3){
                                abrirNuevaVentana = true;
                                promptRetry = prompt + diagnostico; 
                                console.log(`WARNING (bot_Sora): (E2.2) - Tras 3 intentos, procedemos a abrir un nuevo chat/ventana.`)
                            }
                            // Resto de casos
                            let delay = Math.round(5000 * Math.pow(ratio, trials - 1)); // (initialDelay * Math.pow(ratio, attempt - 1))
                            console.log(`WARNING (bot_Sora): Intento ${trials} fallido. Esperando ${Math.round(delay / 1000)}s antes del siguiente intento...`);
                            await pausaGauss(delay, 500);
                            trials++;
                        }
                    }
                    if (trials > 10) {
                        const imagenesDetectadas = ordenarArchivos_js(carpetaDescargas, 'png')
                        throw new Error(`Lamentablemente no se ha detectado la descarga despues de ${trials - 1} intentos. Se requiere intervencion manual. Hasta el momento, ordenarArchivos_js detecta ${imagenesDetectadas.length} imagenes '.png' en descargas; la iteracion actual del bucle era i=${i}`)
                    }
                }
            } catch (error) {
                // Aquí atrapas cualquier error imprevisto
                console.log(`WARNING (bot_Sora): Error imprevisto en imagen #${i + 1}:`, error);
                console.log(`WARNING (bot_Sora): Recogiendo diagnostico de lo ocurrido...`)
                // 1. Comprobar si estan las i+1 imagenes
                let diagnosticoDeUrgencia = await waitAndCheckImage(i + 1)
                if (diagnosticoDeUrgencia !== "") {
                    console.log(`WARNING (bot_Sora): Sabemos que NO se ha generado la imagen #${i + 1}. Diagnostico de urgencia -> ${diagnosticoDeUrgencia}`)
                    console.log(`WARNING (bot_Sora): Vamos a reiniciar el navegador, abrir nuevo chat y proseguir a reintentar la imagen no generada. `)
                    // A.1 Disminuir indice (reintentar imagen)
                    i--
                    // A.2 Reiniciar navegador y página
                    ({ browser, page, x1, y1 } = await resetChatSession())
                    // A.3 Volver al bucle
                    continue;

                } else {
                    console.log(`WARNING (bot_Sora): A pesar del error, se ha generado la imagen #${i + 1}.`);
                    console.log(`WARNING (bot_Sora): Vamos a reiniciar el navegador, abrir nuevo chat y proseguir con la siguiente imagen`);
                    // B.1 Reiniciar navegador y página
                    ({ browser, page, x1, y1 } = await resetChatSession())
                    // B.2 Volver al bucle
                    continue;
                }
            }
        }

        // Cerrar navegador
        console.log(`Script finalizado sin fallos.`)

        if (browser) await browser.close()

    } catch (error) { // Captura de pantalla en caso de error. Lanzar Error

        if (browser && page) {
            const screenshotPath = path.join(process.cwd(), 'error-screenshot.png');
            await page.screenshot({ path: screenshotPath });
            console.log(`WARNING (bot_Sora): Se ha realizado una Captura de pantalla para identificar el ERROR. Guardada en: ${screenshotPath}`);
            await pausaGauss(1000, 200);
            await browser.close(); // Cerrar el navegador
        }

        // Lanzar error
        throw (`ERROR (bot_Sora): ${error}`); // Relanzar para que el maestro lo maneje
    };

};


// ENTRY POINT:
const thisFileUrl = pathToFileURL(process.argv[1]).href;
if (import.meta.url === thisFileUrl) {
    const [,, promptsPath, contentTypeArg, imageStyleArg] = process.argv;
    if (!promptsPath) {
        console.error('Uso: calliope-sora <ruta_prompts.json> [video|short] ["estilo_imagen"]');
        process.exit(1);
    }

    // Leer JSON de prompts
    let parsedPrompts;
    try {
        parsedPrompts = JSON.parse(fs.readFileSync(path.resolve(promptsPath), 'utf-8'));
    } catch (err) {
        console.error('Error al leer el archivo de prompts:', err);
        process.exit(1);
    }


    bot_Sora(parsedPrompts, contentTypeArg, imageStyleArg)
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}