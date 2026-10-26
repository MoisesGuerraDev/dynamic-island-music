# Probar Dynamic Island Music en Windows

Archivo: `DynamicIslandMusic-Windows-x64.zip` (Windows 10 u 11, 64 bits). No hace falta instalar nada ni ser administrador.

## 1. Copiar y abrir
1. Pasa el `.zip` a tu PC (USB, AirDrop, nube).
2. Clic derecho › **Extraer todo…** y elige una carpeta que no vayas a mover, por ejemplo `C:\DynamicIslandMusic`.
3. Abre `Dynamic Island Music.exe`.

La isla aparece **arriba y al centro** de la pantalla principal. Pasa el mouse por ahí y se abre. También hay un icono en la bandeja (junto al reloj, quizá dentro de la flecha ^).

## 2. Si Windows avisa (SmartScreen)
Sale "Windows protegió tu PC" porque la app no está firmada (es gratis y de código abierto). Pulsa **Más información › Ejecutar de todas formas**. Solo la primera vez.
Si tu antivirus protesta por PowerShell: la app usa dos scripts pequeños (`resources\ps\media.ps1` y `helper.ps1`) para leer la música del sistema y el estado del juego. Puedes leerlos, son cortos.

## 3. Qué probar
- **Música:** pon algo en Spotify, Apple Music o YouTube en el navegador. Debe salir carátula, título y botones; el color del brillo sale de la carátula.
- **Pomodoro:** toca el tiempo y escribe `25`, `1:30` o `1:30:00`. Al terminar suena y avisa.
- **Notas:** el `+` de Notas crea un archivo `.md`. En Ajustes › Notas puedes elegir tu carpeta de iCloud Drive.
- **Portapapeles:** copia texto; debe aparecer. Copia una contraseña desde tu gestor: no debe guardarse.
- **Tamaño:** la isla se adapta sola al tamaño de tu pantalla (a 1920 × 1080 mide 1077 × 187 px, como la de Mac; en una pantalla chica se achica y en una grande o ultrawide crece, todo a la vez). En Ajustes › Estilo puedes hacerla Chica (0.75), Mediana (1.0) o Grande (1.2) encima de eso.
- **Lápiz** (arriba a la derecha): arrastra, cambia el tamaño, quita y agrega componentes.
- **Ajustes** (rueda dentada): Estilo tiene un deslizador de negro a vidrio, otro para la intensidad del color, «Los colores bailan con la música» (el brillo late al ritmo de cada canción) y el contorno de la isla (por defecto sin borde). En vivo: qué se ve con la isla cerrada.
- **Bloqueo del chat de IA** (Ajustes › IA): por defecto pide Windows Hello (huella, cara o PIN de Windows) si tu PC lo tiene. Si no lo tiene, elige «Windows Hello o PIN de la app» y crea un PIN de 4 a 8 dígitos. «Volver a pedirlo»: siempre, a los 15 minutos (por defecto), a la hora o solo al abrir la app; también al bloquear o suspender Windows. No borra tu sesión guardada.
- **Escribir en las IA:** abre la pestaña de la chispa y haz clic en el cuadro de texto: debes poder poner tu correo o código. Al cerrar la isla vuelve a no robarle el foco a un juego.
- **Colores y luces** (botón del sol junto al lápiz, o Ajustes › Estilo): Automático (los dos colores de la carátula), Arcoíris o Mis colores (11 cuadros, rueda y gotero). Luz de adentro y luz de afuera, cada una con intensidad 40–500 %, tamaño y baile.
- **Carátulas en HD:** si la imagen del reproductor es chica (videos del navegador) busca la portada oficial en Apple (se puede apagar en Ajustes › Reproductor).
- **Sesiones guardadas** (Ajustes › IA): tus inicios de sesión de las IA se guardan cifrados en una carpeta de la app y vuelven solos si reinstalas. Para llevarlos a otra computadora: elige una carpeta (Documentos, USB, OneDrive…) y pon una contraseña propia; en la otra, la misma carpeta y la misma contraseña. El archivo `Sesiones-IA.dimsession` es el mismo que el de Mac.
- **Juego (PC gamer):** abre un juego en **pantalla completa sin bordes**; la isla debe verse encima y no robar el foco. Si el juego usa pantalla completa *exclusiva* la isla se oculta a propósito (Ajustes › Modo juego); `Ctrl+Shift+Espacio` la asoma un momento.
- Atajos: `Ctrl+Shift+N` abre/cierra, `Ctrl+Shift+P` pausa la música, `Ctrl+Shift+T` el Pomodoro, `Ctrl+Alt+Espacio` el chat.

## 4. Cerrarla
Clic derecho en el icono de la bandeja › **Salir** (o Ajustes › Acerca de › Salir).

## 5. Permisos y avisos
- **Notificaciones:** salen al terminar el Pomodoro (se pueden apagar en Ajustes › Pomodoro).
- **Cámara:** solo se pide si pulsas el espejo; se apaga al cerrar la isla.
- **Internet:** solo cuando usas el chat de IA. No hay telemetría.
- Al abrirse, la app se registra para iniciar con Windows (Ajustes › General lo apaga). Si mueves la carpeta, apágalo y vuelve a encenderlo.

## 6. Si algo falla
Cuéntame qué hiciste y qué pasó. Tus datos y ajustes están en `%APPDATA%\Dynamic Island Music` (Ajustes › General › Carpeta de datos). Para desinstalar: sal de la app, borra la carpeta y esa de datos.

> El baile de colores usa un pulso simulado con el tempo de cada canción (no escucha el audio). Seguir el volumen real con el audio del sistema (loopback) queda pendiente.

> Lo de Windows se escribió y probó solo en un Mac con música simulada: la música real (SMTC), GPU/pantalla completa, el cifrado de claves y el inicio con Windows se prueban por primera vez en tu PC.
