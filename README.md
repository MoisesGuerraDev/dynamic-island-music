<p align="center">
  <img src="branding/app-icon.svg" width="128" alt="Dynamic Island Music">
</p>

<h1 align="center">Dynamic Island Music</h1>

<p align="center">
  Tu música, un Pomodoro con el tiempo que quieras, notas sincronizadas con iCloud, un chat con tu IA favorita y más, en el notch de tu Mac.<br>
  Gratis, de código abierto y sin telemetría.
</p>

## Instalar

**Mac** (macOS 14 o más nuevo): pega esto en **Terminal** y pulsa Intro.

```bash
curl -fsSL https://moisesguerradev.github.io/dynamic-island-music/mac | bash
```

**Windows** (10 u 11): baja `DynamicIslandMusic-Setup.exe` desde [Releases](../../releases/latest) y ábrelo.

Más opciones: [INSTALAR.md](INSTALAR.md).

## Qué trae

| | |
|---|---|
| **Reproductor** | Lee lo que suene en tu Mac: Spotify, Apple Music, YouTube en el navegador. Los colores del brillo salen de la carátula. |
| **Pomodoro** | Cualquier duración (`25`, `1:30`, `1:30:00`), sprints, sonido configurable al terminar, aviso y vista con el notch cerrado. |
| **Notas y tareas** | Un archivo `.md` por nota en la carpeta que elijas. En una carpeta de iCloud Drive se sincronizan solas con tu iPhone y tus otras computadoras. |
| **Agenda y recordatorios** | Una pestaña con tus tareas, notas y eventos del calendario: marca, edita, borra, filtra. Las tareas y eventos pueden avisarte unos minutos antes: salta un aviso bajo la isla, con sonido, además de la notificación del sistema. |
| **Chat de IA** | Claude, ChatGPT, Gemini o DeepSeek con tu propia cuenta, dentro del notch. Sin servidor intermedio. |
| **Portapapeles** | Historial que ignora apps de contraseñas y datos secretos. |
| **Bandeja, Juego, Cámara, Calendario, Rendimiento** | Más componentes, todos opcionales. |
| **Todo editable** | Lápiz en el notch: arrastra para ordenar, tira de la esquina para cambiar el tamaño, quita y agrega. Si no caben, pasan a otra página. |
| **Se adapta a tu Mac** | Detecta el modelo y la pantalla (notch o sin notch) y ajusta el ancho. |
| **Liquid Glass** | Botones con el vidrio del sistema (macOS 26) y un brillo alrededor del notch con el color de la carátula. |
| **Aviso de «sin sonido»** | Si el navegador toca música pero no sale audio, la isla te avisa y un interruptor te lleva directo a la pestaña que suena, para que le quites el silencio. Funciona con Chrome, Safari, Brave, Edge, Arc, Vivaldi y Opera. |
| **Luces a tu gusto** | Color automático (de la carátula), arcoíris o los tuyos. Tú decides si las luces bailan con la música y si la carátula también; en pausa nada se mueve. |
| **Siempre encajada** | La isla queda fija sobre el notch. Solo se mueve si lo activas en Ajustes y confirmas, y al apagarlo vuelve a su sitio. |

## Privacidad

Sin telemetría. Todo se guarda en tu equipo. Detalles en [SECURITY.md](SECURITY.md).

## Compilar desde el código

**Windows:** `cd windows && npm ci && npm test && npm run dist` (en un Mac: `npm run dist:mac`, genera el instalador y el .zip sin Wine). La app se ve con `npm run start:mock` (música simulada).

**Mac:** necesitas Xcode 26 o más nuevo.

```bash
git clone https://github.com/MoisesGuerraDev/dynamic-island-music.git
cd dynamic-island-music
xcodebuild -project DynamicIslandMusic.xcodeproj -scheme DynamicIslandMusic -configuration Release \
  -derivedDataPath build -destination 'platform=macOS' \
  CODE_SIGN_IDENTITY="-" ENABLE_HARDENED_RUNTIME=NO DEVELOPMENT_TEAM="" CODE_SIGN_STYLE=Manual \
  -skipMacroValidation -skipPackagePluginValidation build
```

La app queda en `build/Build/Products/Release/Dynamic Island Music.app`. Para generar el `.dmg`: `scripts/make-dmg.sh`.
El código nuevo está en `DynamicIslandMusic/islandmusic/`. El logo se regenera con `branding/make-icons.sh`.

## Licencia y créditos

GPL-3.0 (ver [LICENSE](LICENSE)). Basada en [Boring Notch](https://github.com/TheBoredTeam/boring.notch) de TheBoredTeam y colaboradores.
Más en [NOTICE.md](NOTICE.md). "Dynamic Island" es una marca de Apple Inc.; este proyecto no está afiliado a Apple.
