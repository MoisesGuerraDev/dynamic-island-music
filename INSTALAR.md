# Instalar Dynamic Island Music

La app se instala con un comando y queda en tu **escritorio**. Cambia `OWNER/REPO` por el repositorio del proyecto.

## macOS (14 o más nuevo)

### 1. Un comando, sin aviso de macOS (recomendado)

En la app **Terminal**:

```bash
curl -fsSL https://raw.githubusercontent.com/OWNER/REPO/main/install.sh | bash -s -- OWNER/REPO
```

Qué hace, en este orden: descarga la última versión, comprueba su suma de verificación (SHA-256), la copia a tu escritorio y la abre.
No usa `sudo` y no toca nada más. El script tiene unas 80 líneas: puedes leerlo antes. Para dejarla en Aplicaciones agrega `--applications`.

Por qué no sale ningún aviso: los archivos que baja `curl` no llevan la marca de cuarentena que pone el navegador, y esa marca es la que dispara el aviso de macOS.

### 2. Compilarla tú (necesita Xcode, gratis en la App Store)

```bash
git clone https://github.com/OWNER/REPO.git && cd REPO && ./build-mac.sh
```

Compila y deja la app en el escritorio (unos 3 minutos la primera vez). Funciona aunque no haya una versión publicada. Si falla, muestra las últimas líneas del registro, que quedan en `build/xcodebuild.log`.
Si es la primera vez que usas Xcode, ábrelo una vez para aceptar la licencia.

### 3. Con el `.dmg` (sale un aviso de macOS)

1. Baja `DynamicIslandMusic.dmg` desde la sección **Releases** del repositorio.
2. Ábrelo y arrastra la app a tu escritorio o a **Applications**.
3. La primera vez, haz **clic derecho sobre la app › Abrir › Abrir**.

| Lo que ves | Qué hacer |
|---|---|
| "No se puede abrir porque no se puede verificar al desarrollador" | Ajustes del Sistema › **Privacidad y seguridad**, baja hasta el final y pulsa **Abrir de todos modos**. Solo la primera vez. |
| "La app está dañada y no se puede abrir" | En Terminal: `xattr -dr com.apple.quarantine "$HOME/Desktop/Dynamic Island Music.app"` y vuelve a abrirla. |
| Nada pasa al hacer doble clic | Clic derecho › Abrir (no doble clic). |

### Por qué sale ese aviso

Apple solo quita el aviso a las apps firmadas con una cuenta de desarrollador de pago (US$99 al año) y revisadas por ellos ("notarizadas").
Este proyecto es gratuito y de código abierto, así que por ahora no lo está. El aviso no significa que haya un virus: todo el código se puede leer
en este repositorio y cada descarga publica su suma SHA-256 (`shasum -a 256 DynamicIslandMusic.dmg`).
Cuando el proyecto tenga cuenta de desarrollador, se publicará notarizada (para quien mantiene el proyecto: ver `scripts/notarize.sh`).

## Windows (10 u 11, 64 bits)

### 1. Instalador de un clic

Baja `DynamicIslandMusic-Setup.exe` desde **Releases** y ábrelo. Se instala solo para tu usuario (sin administrador), queda en el menú Inicio y tiene desinstalador.
Si sale "Windows protegió tu PC": **Más información › Ejecutar de todas formas** (la primera vez; el programa no está firmado).

### 2. Una línea en PowerShell (SmartScreen no avisa)

```powershell
$env:DIM_REPO = 'OWNER/REPO'; irm https://raw.githubusercontent.com/OWNER/REPO/main/windows/install.ps1 | iex
```

Descarga el instalador, comprueba su suma de verificación y lo ejecuta en silencio.

### 3. Portátil

Baja `DynamicIslandMusic-Windows-x64.zip`, extráelo en una carpeta que no vayas a mover y abre `Dynamic Island Music.exe`.

## Permisos que pide

| Permiso | Para qué |
|---|---|
| Calendario y Recordatorios | Mostrar tus eventos en el notch |
| Cámara | El espejo (solo mientras lo abres) |
| Notificaciones | El aviso cuando termina el Pomodoro |
| Carpeta de notas | La carpeta de iCloud Drive que tú eliges |
| Música / Spotify (Automatización) | Controlar la reproducción cuando suena ahí |
| Audio del sistema (opcional) | Solo si activas que los colores sigan el sonido real |
| Accesibilidad (opcional) | Medir el espacio libre de la barra de menú |

No pide grabación de pantalla ni acceso a tus archivos.

## Desinstalar

- **Mac:** arrastra la app a la papelera. Para borrar también sus ajustes: `rm -rf ~/Library/Containers/app.dynamicislandmusic.mac`
- **Windows:** Configuración › Aplicaciones, o `Desinstalar` en el menú Inicio.
