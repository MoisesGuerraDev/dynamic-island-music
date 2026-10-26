<p align="center">
  <img src="branding/app-icon.svg" width="128" alt="Dynamic Island Music">
</p>

<h1 align="center">Dynamic Island Music</h1>

<p align="center">
  Tu música, un Pomodoro con el tiempo que quieras, notas sincronizadas con iCloud, un chat con tu IA favorita y más, en el notch de tu Mac.<br>
  Gratis, de código abierto y sin telemetría.
</p>

## Instalar

**Mac.** Pega esto en la app **Terminal** y pulsa Intro:

```bash
curl -fsSL https://raw.githubusercontent.com/MoisesGuerraDev/dynamic-island-music/main/install.sh | bash -s -- MoisesGuerraDev/dynamic-island-music
```

La app queda en tu escritorio y se abre sola. Sin avisos de macOS. (Necesita macOS 14 o más nuevo.)

**Windows.** Baja `DynamicIslandMusic-Setup.exe` desde [Releases](../../releases/latest) y ábrelo. Se instala como cualquier programa.
Si sale "Windows protegió tu PC": **Más información › Ejecutar de todas formas** (solo la primera vez).

Más opciones y soluciones: [INSTALAR.md](INSTALAR.md).

## Qué trae

| | |
|---|---|
| **Reproductor** | Lee lo que suene en tu Mac: Spotify, Apple Music, YouTube en el navegador. Los colores del brillo salen de la carátula. |
| **Pomodoro** | Cualquier duración (`25`, `1:30`, `1:30:00`), sprints, sonido configurable al terminar, aviso y vista con el notch cerrado. |
| **Notas y tareas** | Un archivo `.md` por nota en la carpeta que elijas. En una carpeta de iCloud Drive se sincronizan solas con tu iPhone y tus otras computadoras. |
| **Chat de IA** | Claude, ChatGPT, Gemini u Ollama con tu propia clave (guardada en el Llavero). Sin servidor intermedio. |
| **Portapapeles** | Historial que ignora apps de contraseñas y datos secretos. |
| **Bandeja, Juego, Cámara, Calendario, Rendimiento** | Más componentes, todos opcionales. |
| **Todo editable** | Lápiz en el notch: arrastra para ordenar, tira de la esquina para cambiar el tamaño, quita y agrega. Si no caben, pasan a otra página. |
| **Se adapta a tu Mac** | Detecta el modelo y la pantalla (notch o sin notch) y ajusta el ancho. |
| **Liquid Glass** | Botones con el vidrio del sistema (macOS 26) y un brillo alrededor del notch con el color de la carátula. |

## Privacidad

Sin telemetría. Todo se guarda en tu equipo. Detalles en [SECURITY.md](SECURITY.md).

Sobre el chat de IA: cada persona usa su propia clave de API y paga solo lo que use. No se usa la suscripción de ChatGPT ni de Claude,
porque sus términos no lo permiten en apps de terceros.

## Compilar desde el código

**Windows:** `cd windows && npm ci && npm test && npm run dist` (en un Mac: `npm run dist:mac`, genera el instalador y el .zip sin Wine). La app se ve con `npm run start:mock` (música simulada).

**Mac:** necesitas Xcode 26 o más nuevo.

```bash
git clone https://github.com/MoisesGuerraDev/dynamic-island-music.git
cd dynamic-island-music
xcodebuild -project boringNotch.xcodeproj -scheme boringNotch -configuration Release \
  -derivedDataPath build -destination 'platform=macOS' \
  CODE_SIGN_IDENTITY="-" ENABLE_HARDENED_RUNTIME=NO DEVELOPMENT_TEAM="" CODE_SIGN_STYLE=Manual \
  -skipMacroValidation -skipPackagePluginValidation build
```

La app queda en `build/Build/Products/Release/Dynamic Island Music.app`. Para generar el `.dmg`: `scripts/make-dmg.sh`.
El código nuevo está en `boringNotch/islandmusic/`. El logo se regenera con `branding/make-icons.sh`.

## Licencia y créditos

GPL-3.0 (ver [LICENSE](LICENSE)). Basada en [Boring Notch](https://github.com/TheBoredTeam/boring.notch) de TheBoredTeam y colaboradores.
Más en [NOTICE.md](NOTICE.md). "Dynamic Island" es una marca de Apple Inc.; este proyecto no está afiliado a Apple.
