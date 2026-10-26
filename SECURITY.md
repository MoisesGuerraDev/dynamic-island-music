# Seguridad y privacidad

## Qué hace la app con tus datos
- **No tiene telemetría ni analíticas.** No envía datos de uso a nadie.
- Todo se guarda en tu Mac: ajustes, notas, historial del portapapeles y del chat.
- La app solo se conecta a internet cuando tú lo pides:
  - El **chat de IA**: abre la página oficial de tu IA (Claude, ChatGPT, Gemini, DeepSeek) dentro del notch y entras con tu propia cuenta. Opcional y avanzado: usar tu propia clave de API (se guarda en el Llavero de macOS) o Ollama en tu Mac.
  - Las **letras de las canciones** (pide el título y el artista a un servicio de letras).
- Las **notas** son archivos `.md` en la carpeta que elijas. Si es una carpeta de iCloud Drive, la sincroniza iCloud con tu cuenta; la app no ve ni guarda tu cuenta.
- El **portapapeles** ignora las apps de contraseñas y todo lo que el sistema marca como secreto.
- La app **mide** tu Mac (modelo, pantalla, CPU, memoria) para ajustarse. No captura ni graba tu pantalla.
- Las actualizaciones automáticas están desactivadas.

## Reportar un problema de seguridad
Usa **Security › Report a vulnerability** en la página del repositorio en GitHub (reporte privado). No abras un issue público con detalles de una vulnerabilidad.

## Conexiones de red (todas opcionales)

| A dónde | Para qué | Qué se envía |
|---|---|---|
| `itunes.apple.com` | Buscar la carátula en HD cuando el reproductor solo da una imagen diminuta (videos del navegador) | El título y el artista de la canción. Se apaga en Ajustes › Reproductor. |
| Sitios de las IA (`claude.ai`, `chatgpt.com`, `gemini.google.com`, `chat.deepseek.com`) | El chat dentro del notch es la página oficial de cada una | Lo que escribes allí. La app no ve tu contraseña ni tus mensajes. |
| `lrclib.net` | Letras de canciones, si las activas | Título y artista |

La app no tiene telemetría ni cuentas propias.

## Instalación segura

- **Mac:** `install.sh` descarga la app desde las versiones de este repositorio, comprueba su suma SHA-256 y la copia a tu escritorio. No usa `sudo`, no instala servicios ni toca otros archivos. La app corre en la caja de seguridad de macOS (App Sandbox), no puede abrir puertos para recibir conexiones y solo accede a lo que le das permiso.
- **Windows:** el instalador se instala solo para tu usuario, sin administrador; `install.ps1` comprueba la suma SHA-256 antes de ejecutarlo.
- **Código y compilación:** todo el código está aquí y las versiones se compilan en GitHub Actions desde ese mismo código.
- Las apps no están firmadas con certificado de pago, por eso Windows y macOS pueden mostrar un aviso la primera vez si las abres desde el navegador; no significa que haya un virus.
