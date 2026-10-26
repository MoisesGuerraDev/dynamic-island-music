# Instalar Dynamic Island Music (macOS)

Dos formas. La primera es la más fácil y no muestra ningún aviso de macOS.

## 1. Con un comando (recomendado)

Abre la app **Terminal** y pega esto (cambia `OWNER/REPO` por el repositorio del proyecto):

```bash
curl -fsSL https://raw.githubusercontent.com/OWNER/REPO/main/install.sh | bash -s -- OWNER/REPO
```

Qué hace, en este orden: descarga la última versión, comprueba su suma de verificación (SHA-256), la copia a
`/Applications` y la abre. No usa `sudo` y no toca nada más. El script tiene unas 40 líneas: puedes leerlo antes.

Por qué no sale ningún aviso: los archivos que baja `curl` no llevan la marca de cuarentena que pone el navegador, y
esa marca es la que dispara el aviso de macOS.

## 2. Con el `.dmg`

1. Baja `DynamicIslandMusic.dmg` desde la sección **Releases** del repositorio.
2. Ábrelo y arrastra la app a **Applications**.
3. La primera vez, haz **clic derecho sobre la app › Abrir › Abrir**.

### Si macOS dice que no puede abrirla

| Lo que ves | Qué hacer |
|---|---|
| "No se puede abrir porque no se puede verificar al desarrollador" | Ajustes del Sistema › **Privacidad y seguridad**, baja hasta el final y pulsa **Abrir de todos modos**. Solo la primera vez. |
| "La app está dañada y no se puede abrir" | En Terminal: `xattr -dr com.apple.quarantine "/Applications/Dynamic Island Music.app"` y vuelve a abrirla. |
| Nada pasa al hacer doble clic | Clic derecho › Abrir (no doble clic). |

### Por qué sale ese aviso

Apple solo quita el aviso a las apps firmadas con una cuenta de desarrollador de pago (US$99 al año) y revisadas
por ellos ("notarizadas"). Este proyecto es gratuito y de código abierto, así que por ahora no lo está. El aviso no significa que haya un virus:
todo el código se puede leer en este repositorio y cada descarga publica su suma SHA-256 para comprobar que no la cambió nadie
(`shasum -a 256 DynamicIslandMusic.dmg`).

Cuando el proyecto tenga cuenta de desarrollador, la app se publicará notarizada y este manual dejará de hacer falta
(para quien mantiene el proyecto: ver `scripts/notarize.sh`).

## Permisos que pide

| Permiso | Para qué |
|---|---|
| Calendario y Recordatorios | Mostrar tus eventos en el notch |
| Cámara | El espejo (solo mientras lo abres) |
| Notificaciones | El aviso cuando termina el Pomodoro |
| Carpeta de notas | La carpeta de iCloud Drive que tú eliges |

No pide grabación de pantalla ni acceso a tus archivos. La música se lee del control de reproducción del sistema.

## Desinstalar

Arrastra la app de Applications a la papelera. Para borrar también sus ajustes:
`rm -rf ~/Library/Containers/app.dynamicislandmusic.mac`
