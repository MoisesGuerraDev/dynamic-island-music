# Instalar Dynamic Island Music

**Mac** (macOS 14 o más nuevo). En **Terminal**:

```bash
curl -fsSL https://moisesguerradev.github.io/dynamic-island-music/mac | bash
```

La app queda en tu escritorio y se abre sola. Para dejarla en Aplicaciones: `... | bash -s -- --applications`.
Si ese link no responde, el mismo instalador está en `https://raw.githubusercontent.com/MoisesGuerraDev/dynamic-island-music/main/install.sh`.

**Windows** (10 u 11). Baja `DynamicIslandMusic-Setup.exe` desde [Releases](../../releases/latest) y ábrelo. No pide administrador.
Si sale "Windows protegió tu PC": **Más información › Ejecutar de todas formas** (solo la primera vez).
O en PowerShell: `irm https://raw.githubusercontent.com/MoisesGuerraDev/dynamic-island-music/main/windows/install.ps1 | iex`

## Si algo falla

- **Mac, bajaste el `.dmg` desde el navegador y no abre:** clic derecho sobre la app › **Abrir**, o *Ajustes del Sistema › Privacidad y seguridad › Abrir de todos modos*. Pasa porque la app no está firmada con una cuenta de pago de Apple.
- **Compilarla tú (con Xcode):** `git clone https://github.com/MoisesGuerraDev/dynamic-island-music.git && cd dynamic-island-music && ./build-mac.sh`

## Desinstalar

- **Mac:** arrastra la app a la papelera.
- **Windows:** Configuración › Aplicaciones.
