# Instalar Dynamic Island Music

## Mac (macOS 14 o más nuevo)

En **Terminal**:

```bash
curl -fsSL https://raw.githubusercontent.com/MoisesGuerraDev/dynamic-island-music/main/install.sh | bash -s -- MoisesGuerraDev/dynamic-island-music
```

Descarga la app, comprueba que no esté alterada, la deja en tu **escritorio** y la abre. No pide administrador y no sale ningún aviso de macOS.
Para dejarla en Aplicaciones, agrega `--applications` al final.

¿Prefieres compilarla tú? Con Xcode: `git clone https://github.com/MoisesGuerraDev/dynamic-island-music.git && cd dynamic-island-music && ./build-mac.sh`

¿Bajaste el `.dmg` desde el navegador y macOS no la abre? Clic derecho sobre la app › **Abrir**, o *Ajustes del Sistema › Privacidad y seguridad › Abrir de todos modos*.
(Apple solo quita ese aviso a apps firmadas con cuenta de pago; esta es gratuita y de código abierto.)

## Windows (10 u 11)

Baja `DynamicIslandMusic-Setup.exe` desde **Releases** y ábrelo. Queda en el menú Inicio.
Si sale "Windows protegió tu PC": **Más información › Ejecutar de todas formas**.

O en PowerShell, una línea: `$env:DIM_REPO = 'MoisesGuerraDev/dynamic-island-music'; irm https://raw.githubusercontent.com/MoisesGuerraDev/dynamic-island-music/main/windows/install.ps1 | iex`

## Desinstalar

- **Mac:** arrastra la app a la papelera.
- **Windows:** Configuración › Aplicaciones.
