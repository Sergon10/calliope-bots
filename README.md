# Calliope-Sora Bot ✨

¡Bienvenido! Este bot es una pequeña herramienta creada para la comunidad de TikTok que te permite usar tu propia cuenta de ChatGPT para generar imágenes con IA de forma masiva, directamente desde tu ordenador.

## ¿Cómo Funciona?

El bot utiliza una tecnología llamada Puppeteer para abrir una ventana de tu navegador Chrome. Lo especial es que **utiliza tu propio perfil de usuario**, donde ya tienes iniciada la sesión de ChatGPT. De esta forma, el bot puede interactuar con la web como si fueras tú, pero de forma automatizada. ¡Por eso es crucial que configures bien tus rutas!

---

## ✅ Requisitos Previos

Antes de empezar, asegúrate de tener todo esto:

1.  **Node.js**: Es el entorno que ejecuta el bot. Si no lo tienes, descárgalo e instálalo desde [nodejs.org](https://nodejs.org/).
2.  **Google Chrome**: El bot está diseñado para funcionar con este navegador.
3.  **Suscripción a ChatGPT Plus**: Necesitas una cuenta con mayor límite (actualmente 120 imagenes cada 24h) para la generación de imágenes. Con Plan Gratuito el bot también funciona,pero estarás muy limitado por OpenAI.

---

## 🚀 Guía de Instalación y Uso

Sigue estos pasos con calma. ¡Solo tienes que hacerlo una vez!

### Paso 1: Instalar el Bot

Abre una terminal en tu ordenador (puedes buscar "CMD" o "PowerShell" en Windows) y escribe el siguiente comando. Esto instalará el bot de forma global en tu sistema.

```bash
npm install -g calliope-bots
```

### Paso 2: Configuración (¡La Parte Importante!)

Esta es la clave para que el bot funcione.

1.  **Crea tu Carpeta de Trabajo**: Ve a cualquier lugar de tu ordenador (por ejemplo, el Escritorio) y crea una nueva carpeta. Llámala como quieras, por ejemplo, `MisCreaciones`.

2.  **Crea el Archivo `config.json`**: Dentro de tu carpeta `MisCreaciones`, crea un archivo de texto y llámalo `config.json`. Ábrelo y pega el siguiente contenido:

    ```json
    {
       "chromeExecutablePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
       "chromeUserDataDir": "C:\\Users\\TU_NOMBRE_DE_USUARIO\\AppData\\Local\\Google\\Chrome\\User Data",
       "downloadsPath": "C:\\Users\\TU_NOMBRE_DE_USUARIO\\Downloads\\CalliopeBot"
    }
    ```
    *   **¡MUY IMPORTANTE!**
        *   Reemplaza `TU_NOMBRE_DE_USUARIO` con tu nombre de usuario real de Windows.
        *   La ruta `downloadsPath` es donde se guardarán las imágenes. Puedes cambiarla si quieres.
        *   Si tu Chrome no está instalado en la ruta por defecto, tendrás que encontrar el `chrome.exe` y poner la ruta correcta.

3.  **Crea el Archivo `prompts.json`**: En la misma carpeta, crea otro archivo llamado `prompts.json`. Aquí es donde pondrás la lista de imágenes que quieres generar. Pega este ejemplo y modifícalo a tu gusto:

    ```json
    [
        {
            "positivePrompt": "Un astronauta surfeando en un anillo de Saturno, estilo acuarela.",
            "negativePrompt": "planetas, estrellas, galaxias, realismo"
        },
        {
            "positivePrompt": "Un zorro rojo leyendo un libro en un bosque mágico de noche, con setas que brillan.",
            "negativePrompt": "oscuridad, miedo, personas"
        }
    ]
    ```

### Paso 3: ¡A Generar Imágenes!

1.  **Cierra Google Chrome COMPLETAMENTE**. Esto es fundamental. Si Chrome está abierto, el bot no podrá usar tu perfil y fallará.

2.  **Abre una Terminal en tu Carpeta**: Vuelve a la terminal (CMD/PowerShell) y navega hasta tu carpeta de trabajo con el comando `cd`.
    *   *Ejemplo*: `cd C:\Users\TU_NOMBRE_DE_USUARIO\Desktop\MisCreaciones`

3.  **Ejecuta el Comando**: Ahora, lanza el bot con la siguiente estructura:

    ```bash
    calliope-sora <ruta_a_tus_prompts> <tipo_de_contenido> "<tu_estilo_de_imagen>"
    ```
    *   **Ejemplo Práctico**:
        ```bash
        calliope-sora ./prompts.json video "Estilo Ghibli, colores pastel, arte conceptual"
        ```

¡Listo! El bot se iniciará y comenzará a generar tus imágenes una por una. Las encontrarás en la carpeta de outputs ordenadas. En caso de error, encontrarás una captura `error-screeshot.png` en tu directorio.

---

## 🚑 Solución de Problemas (FAQ)

*   **"El comando `calliope-sora` no se reconoce"**: Asegúrate de que Node.js se instaló correctamente y de que reiniciaste la terminal después de la instalación.
*   **"Error: No se encuentra `config.json`"**: Significa que no estás ejecutando el comando desde dentro de tu carpeta de trabajo (`MisCreaciones`). Usa el comando `cd` para navegar a ella primero.
*   **"El bot se abre pero no inicia sesión en ChatGPT"**: La causa más probable es que no cerraste todas las ventanas de Google Chrome antes de ejecutar el bot, o que la ruta `chromeUserDataDir` en tu `config.json` es incorrecta.

Para cualquier otra duda, ¡nos vemos en TikTok!
