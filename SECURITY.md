# Seguridad y privacidad

## Qué hace la app con tus datos
- **No tiene telemetría ni analíticas.** No envía datos de uso a nadie.
- Todo se guarda en tu Mac: ajustes, notas, historial del portapapeles y del chat.
- La app solo se conecta a internet cuando tú lo pides:
  - El **chat de IA**, directo a tu proveedor (Claude, ChatGPT o Gemini) con **tu propia clave de API**, o a Ollama en tu Mac. La clave se guarda en el Llavero de macOS.
  - Las **letras de las canciones** (pide el título y el artista a un servicio de letras).
- Las **notas** son archivos `.md` en la carpeta que elijas. Si es una carpeta de iCloud Drive, la sincroniza iCloud con tu cuenta; la app no ve ni guarda tu cuenta.
- El **portapapeles** ignora las apps de contraseñas y todo lo que el sistema marca como secreto.
- La app **mide** tu Mac (modelo, pantalla, CPU, memoria) para ajustarse. No captura ni graba tu pantalla.
- Las actualizaciones automáticas están desactivadas.

## Reportar un problema de seguridad
Usa **Security › Report a vulnerability** en la página del repositorio en GitHub (reporte privado). No abras un issue público con detalles de una vulnerabilidad.
