// Settings window. Every row is a real setting: changing it saves it at once and the island updates.
import { DEFAULTS, COMPONENT_META, AI_PROVIDERS, AI_META, WEB_AI, WEB_AI_META, POMO_SOUNDS, normalizeComponents } from '../shared/defaults.js';
import { capWidth, moveOnto, usage } from '../shared/layout.js';
import { formatDuration, parseDuration } from '../shared/time.js';
import { ic } from './icons.js';
import { esc, $, $$ } from './util.js';
import { lightsHTML, bindLights, throttledPatcher } from './lightui.js';

let dim;
const ctx = { session: { folder: '', isDefault: true, exists: false, savedAt: null, ownPassword: false }, lock: { mode: 'none', hello: false, pinSet: false, needsPin: false }, set: {}, info: null, notes: null, keys: {}, shortcuts: {}, enc: true, app: null, events: [], clip: { items: [] }, shelf: [] };
let curTab = 'general';

const SHORTCUT_NAMES = {
  shortcutToggle: 'Abrir o cerrar la isla',
  shortcutPlayer: 'Pausar o reanudar la música',
  shortcutPomodoro: 'Iniciar o pausar el temporizador',
  shortcutChat: 'Abrir el mini chat',
  shortcutPeek: 'Asomar la isla un momento (sobre un juego)',
};

// ---------- Row builders ----------

const T = (k, label, note, extra = {}) => ({ t: 'toggle', k, label, note, ...extra });
const SEL = (k, label, options, note, extra = {}) => ({ t: 'select', k, label, options, note, ...extra });
const RNG = (k, label, min, max, step, unit, note) => ({ t: 'range', k, label, min, max, step, unit, note });
const INT = (k, label, min, max, note) => ({ t: 'int', k, label, min, max, note });
const DUR = (k, label, note) => ({ t: 'dur', k, label, note });
const BTN = (label, btn, act, note, extra = {}) => ({ t: 'button', label, btn, act, note, ...extra });
const INFO = (label, value, note, cls) => ({ t: 'info', label, value, note, cls });
const HTML = (html, bind) => ({ t: 'html', html, bind });
const sec = (h, rows, note) => ({ h, rows, note });

const CLOSE_AFTER = [[-1, 'Nunca'], [0, 'Al instante'], [1, 'Después de 1 día'], [3, 'Después de 3 días'], [7, 'Después de 7 días']];

function modelRow(p) {
  return { t: 'text', k: '__model', provider: p, label: `Modelo de ${AI_META[p].name}`, placeholder: AI_META[p].model || 'nombre del modelo', note: p === 'custom' ? 'Obligatorio para otra IA' : 'Déjalo vacío para usar el predeterminado' };
}

function keyRow(p) {
  return HTML(() => {
    const has = ctx.keys[p];
    return `<div class="r"><span>Clave de API de ${esc(AI_META[p].name)}<small>${has ? 'Guardada y cifrada por Windows en este equipo.' : 'Pega aquí tu propia clave. Nunca se muestra de nuevo.'}</small></span>
      <span class="keyrow"><span class="tag ${has ? '' : 'off'}">${has ? 'Guardada' : 'Sin clave'}</span><input type="password" id="key-${p}" placeholder="${has ? '••••••••' : 'Pega tu clave'}" autocomplete="off" spellcheck="false" aria-label="Clave de ${esc(AI_META[p].name)}">
      <button class="btn primary" data-do="key-save" data-p="${p}">Guardar</button>${has ? `<button class="btn danger" data-do="key-clear" data-p="${p}">Borrar</button>` : ''}</span></div>`;
  });
}

function shortcutRow(k) {
  return HTML(() => {
    const st = ctx.shortcuts[k];
    const tag = st === 'ok' ? '<span class="tag">Activo</span>' : st === 'busy' ? '<span class="tag warn">En uso por otra app</span>' : st === 'invalid' ? '<span class="tag warn">No válido</span>' : '<span class="tag off">Apagado</span>';
    return `<div class="r"><span>${esc(SHORTCUT_NAMES[k])}</span><span class="keyrow">${tag}<button class="kbd" data-do="rec" data-k="${k}">${esc(showAccel(ctx.set[k]))}</button><button class="btn" data-do="rec-clear" data-k="${k}" aria-label="Quitar atajo">Quitar</button></span></div>`;
  });
}

const showAccel = (a) => (a ? a.replace(/Control/g, 'Ctrl').replace(/Super/g, 'Win') : 'Sin atajo');

function screenInfoRows() {
  const d = (ctx.info && ctx.info.displays) || [];
  if (!d.length) return [INFO('Pantallas', 'Detectando…')];
  return d.map((x, i) => INFO(`${x.label}${x.primary ? ' (principal)' : ''}`, `${x.pixels.width} × ${x.pixels.height} px · se ve como ${x.size.width} × ${x.size.height} · ${Math.round(x.scaleFactor * 100)} % · ${x.hz} Hz`));
}

function sessionPasswordHTML() {
  const own = ctx.session.ownPassword;
  return `<div class="r"><span>Contraseña propia (para abrir la copia en otra computadora)<small>${own ? 'Puesta: se usa en lugar de la clave automática. Se guarda cifrada por Windows.' : 'Sin ella se usa una clave automática de este PC.'}</small></span>
    <span class="keyrow"><input type="password" id="sess-pw" placeholder="${own ? '••••••••' : 'Contraseña propia'}" autocomplete="off" aria-label="Contraseña propia de las sesiones guardadas"><button class="btn primary" data-do="session-pw-save">Guardar</button>${own ? '<button class="btn danger" data-do="session-pw-clear">Quitar</button>' : ''}</span></div>`;
}

function pinHTML() {
  const L = ctx.lock;
  const need = L.needsPin ? '<small style="color:var(--warn)">Falta crear el PIN: hasta entonces el chat queda bloqueado.</small>' : '';
  return `<div class="r col"><span>${L.pinSet ? 'Cambiar o quitar el PIN de la app' : 'Crear un PIN de la app'}<small>De 4 a 8 dígitos. Se guarda solo como hash con sal, nunca el PIN en claro. Tras 5 fallos hay que esperar, cada vez más.</small>${need}</span>
    <span class="keyrow">${L.pinSet ? '<input type="password" inputmode="numeric" maxlength="8" id="pin-old" placeholder="PIN actual" autocomplete="off" aria-label="PIN actual">' : ''}
    <input type="password" inputmode="numeric" maxlength="8" id="pin-new" placeholder="PIN nuevo" autocomplete="off" aria-label="PIN nuevo">
    <input type="password" inputmode="numeric" maxlength="8" id="pin-new2" placeholder="Repite el PIN" autocomplete="off" aria-label="Repite el PIN">
    <button class="btn primary" data-do="pin-save">${L.pinSet ? 'Cambiar PIN' : 'Guardar PIN'}</button>${L.pinSet ? '<button class="btn danger" data-do="pin-remove">Quitar PIN</button>' : ''}</span></div>`;
}

// ---------- Tabs ----------

const TABS = [
  {
    id: 'general', icon: 'gear', name: 'General',
    build: () => [
      sec('Componentes', [HTML(componentsHTML, bindComponents)]),
      sec('Funciones del sistema', [
        T('launchAtLogin', 'Abrir al iniciar sesión', 'La isla aparece sola cuando enciendes el PC'),
        T('openOnHover', 'Abrir al pasar el mouse por arriba', 'Si lo apagas, se abre con el atajo o con un clic en la cápsula', { rr: true }),
        { ...RNG('hoverDelay', 'Espera antes de abrir', 0, 800, 20, 'ms'), when: (s) => s.openOnHover },
        RNG('closeDelay', 'Espera antes de cerrar al salir el mouse', 100, 2000, 50, 'ms'),
        SEL('closedStyle', 'Isla cerrada', [['activity', 'Solo cuando hay algo que mostrar'], ['always', 'Siempre visible'], ['never', 'Oculta']]),
        RNG('topOffset', 'Distancia al borde superior', 0, 60, 1, 'px'),
      ]),
      sec('Datos y privacidad', [
        INFO('Dónde se guardan', 'En este PC', 'Ajustes, historial del portapapeles y del chat. Las notas, en la carpeta que elijas.'),
        INFO('Datos enviados', 'Ninguno', 'Sin telemetría. Solo se conecta a internet cuando tú usas el chat de IA.'),
        BTN('Copia de seguridad', 'Exportar', 'export', 'Guarda tus ajustes en un archivo (sin claves de API)'),
        BTN('Restaurar copia', 'Importar…', 'import'),
        BTN('Carpeta de datos', 'Abrir', 'open-data'),
        BTN('Borrar todos los datos', 'Borrar…', 'wipe', 'Pide confirmación. Tus notas no se tocan.', { danger: true }),
      ]),
    ],
  },
  {
    id: 'pantalla', icon: 'display', name: 'Pantalla',
    build: () => [
      sec('Detección automática', [
        INFO('Equipo detectado', ctx.info ? ctx.info.model : '…'),
        INFO('Sistema', ctx.info ? ctx.info.os : '…'),
        INFO('Procesador', ctx.info ? `${ctx.info.cpu} · ${ctx.info.cores} núcleos` : '…'),
        INFO('Memoria', ctx.info ? `${ctx.info.ramGB} GB` : '…'),
        ...(ctx.info && ctx.info.gpus && ctx.info.gpus.length ? [INFO('Tarjeta gráfica', ctx.info.gpus.join(' · '))] : []),
        ...screenInfoRows(),
        INFO('Isla', 'Se dibuja arriba y al centro', 'Ancho máximo: 72 % de la pantalla, sin pasar de 1300. Lo que no cabe pasa a otra página.'),
      ]),
      sec('En qué pantalla', [
        SEL('displayMode', 'Mostrar la isla en', [['primary', 'La pantalla principal'], ['all', 'Todas las pantallas'], ['specific', 'Una pantalla específica']], null, { rr: true }),
        { t: 'display', k: 'displayKey', label: 'Pantalla', when: (s) => s.displayMode === 'specific' },
        T('rememberPerDisplay', 'Recordar tamaño y orden por pantalla', 'Lo que cambies con el lápiz se guarda para esa pantalla'),
        BTN('Usar el mismo orden en todas', 'Aplicar', 'apply-all-displays', 'Borra lo que cada pantalla recordó y usa el orden de General'),
      ]),
      sec('Ajuste manual', [
        T('manualSize', 'Ajustar el ancho a mano', 'Desactivado: la app se adapta sola', { rr: true }),
        { ...RNG('manualOpenWidth', 'Ancho de la isla abierta', 560, 2000, 10, 'px'), when: (s) => s.manualSize },
      ]),
    ],
  },
  {
    id: 'estilo', icon: 'eye', name: 'Estilo',
    build: () => [
      sec('Apariencia', [
        SEL('uiSize', 'Tamaño de la isla', [['s', 'Chico (75 %)'], ['m', 'Mediano (100 %)'], ['l', 'Grande (120 %)']], 'La isla ya se adapta sola al tamaño de tu pantalla; esto la hace un poco más chica o más grande. A 1920 × 1080 y Mediano mide 1077 × 187 px.'),
        SEL('borderStyle', 'Contorno de la isla', [['none', 'Sin borde'], ['open', 'Solo abierta'], ['always', 'Siempre']], 'Sin borde: isla negra lisa y solo se ve el brillo de color alrededor'),
        T('colorsDance', 'Los colores bailan con la música', 'El brillo de color late al ritmo de la canción (un pulso simulado con el tempo de cada tema)'),
        SEL('glowStyle', 'Brillo alrededor (apagado = sin luz de afuera)', [['glass', 'Liquid Glass'], ['soft', 'Sutil'], ['strong', 'Fuerte'], ['off', 'Apagado']]),
        RNG('panelOpacity', 'Fondo: de vidrio a negro total', 30, 100, 1, '%', '100 % es negro total; bájalo para ver más vidrio. Windows no puede difuminar lo que hay detrás de la isla.'),
        T('liquidButtons', 'Refracción extra en los botones (experimental)', 'Los botones ya tienen el vidrio de la Mac. Esto añade una lente de refracción; gasta más gráficos.'),
        T('hoverBounce', 'Rebote al pasar el mouse', 'Los botones crecen un poco bajo el cursor'),
      ]),
      sec('Colores y luces', [
        HTML(() => lightsHTML(ctx.set), (root) => bindLights(root, { patch: lightsPatch, getSet: () => ctx.set, redraw: render })),
      ], 'La luz de adentro es la de la isla abierta; la de afuera, la de la isla cerrada y el halo. Intensidad por encima de 100 % suma más luz. Los mismos controles están en el botón del sol junto al lápiz.'),
      sec('General', [
        T('showTabs', 'Mostrar siempre las pestañas'),
        T('showHeaderButtons', 'Mostrar botones de ajustes y cerrar'),
        T('windowShadow', 'Sombra de la isla'),
        T('separators', 'Separadores de componentes'),
        T('batteryPill', 'Cápsula de batería', 'Solo en equipos con batería'),
      ]),
    ],
  },
  {
    id: 'reproductor', icon: 'screen', name: 'Reproductor',
    build: () => [
      sec('Fuente de música', [
        SEL('preferredPlayer', 'Reproductor preferido', [['auto', 'El que esté sonando'], ['spotify', 'Spotify'], ['apple', 'Apple Music'], ['browser', 'El navegador (YouTube Music…)']]),
        INFO('Cómo se lee', 'Control multimedia de Windows', 'Spotify, Apple Music y YouTube en el navegador aparecen solos, sin cuentas ni permisos.'),
      ]),
      sec('Aspecto', [
        T('coverColors', 'Colores según la carátula'),
        T('coverHD', 'Carátulas en HD desde Apple', 'Si la imagen del reproductor es chica (como en los videos del navegador), busca la portada oficial en iTunes. Envía el título y el artista a Apple.'),
        T('visualizer', 'Visualizador de audio'),
        T('liveMusic', 'Actividad en vivo con la isla cerrada'),
        SEL('hideMusicAfterPause', 'Ocultar la música tras pausarla', [[10, '10 segundos'], [30, '30 segundos'], [120, '2 minutos'], [86400, 'Nunca']], null, { num: true }),
      ]),
    ],
  },
  {
    id: 'calendario', icon: 'cal', name: 'Calendario',
    build: () => [
      sec('Eventos', [
        INFO('Dónde se guardan', 'En este PC', 'Añade eventos con el + del componente Calendario. Escribe "15:30 Reunión" para ponerle hora.'),
        HTML(() => {
          const list = ctx.events.slice(0, 40);
          return list.length
            ? list.map((e) => `<div class="li"><span>${esc(e.title)}<br><small>${esc(e.date)}${e.time ? ' · ' + esc(e.time) : ''}</small></span><button class="btn danger" data-do="cal-del" data-id="${esc(e.id)}">Quitar</button></div>`).join('')
            : '<div class="li"><small>No hay eventos.</small></div>';
        }),
      ]),
    ],
  },
  {
    id: 'pomodoro', icon: 'clock', name: 'Pomodoro',
    build: () => [
      sec('Duración del temporizador', [
        DUR('pomoFocusSeconds', 'Concentración', 'Escribe el tiempo que quieras: 25, 1:30 (1 min 30 s) o 1:30:00 (1 h 30 min). Sin límite.'),
        DUR('pomoRestSeconds', 'Descanso', 'También sin límite'),
        INT('pomoSprints', 'Número de sprints', 1, 99, 'Los que quieras'),
        T('pomoAutoNext', 'Empezar el siguiente tramo solo'),
      ]),
      sec('Notificaciones y sonidos', [
        T('pomoNotify', 'Activar notificaciones'),
        T('pomoOpenOnFinish', 'Abrir la isla un momento al terminar'),
        T('pomoSoundEnabled', 'Activar sonidos', null, { rr: true }),
        { ...SEL('pomoSoundName', 'Sonido del temporizador', POMO_SOUNDS.map((s) => [s, s])), when: (s) => s.pomoSoundEnabled },
        { ...RNG('pomoSoundVolume', 'Volumen', 0, 100, 1, '%'), when: (s) => s.pomoSoundEnabled },
        { ...SEL('pomoSoundRepeat', 'Cuántas veces suena', [[1, '1 vez'], [2, '2 veces'], [3, '3 veces'], [5, '5 veces']], null, { num: true }), when: (s) => s.pomoSoundEnabled },
        { ...BTN('Tu propio sonido', 'Elegir archivo…', 'sound-pick', null), when: (s) => s.pomoSoundEnabled },
        { t: 'info', label: 'Archivo elegido', value: () => (ctx.set.pomoCustomSound ? ctx.set.pomoCustomSound.split(/[\\/]/).pop() : 'Ninguno (se usa el sonido de arriba)'), when: (s) => s.pomoSoundEnabled },
        { ...BTN('Probar el sonido', 'Probar', 'pomo-preview'), when: (s) => s.pomoSoundEnabled },
        T('livePomodoro', 'Actividad en vivo con la isla cerrada'),
      ]),
    ],
  },
  {
    id: 'camara', icon: 'cam', name: 'Cámara',
    build: () => [
      sec('Espejo', [
        SEL('mirrorShape', 'Forma del espejo', [['circle', 'Círculo'], ['square', 'Cuadrado redondeado']]),
        INFO('Permiso', 'La cámara solo se enciende cuando tú pulsas el espejo', 'Se apaga al cerrar la isla. Si no se abre, revisa Windows › Privacidad › Cámara.'),
        BTN('Privacidad de la cámara', 'Abrir ajustes de Windows', 'cam-privacy'),
      ]),
    ],
  },
  {
    id: 'portapapeles', icon: 'clip', name: 'Portapapeles',
    build: () => [
      sec('General', [
        T('clipEnabled', 'Activar portapapeles'),
        T('clipPaused', 'Pausar el historial por ahora'),
        T('clipPersist', 'Guardar el historial en disco', 'Si lo apagas, se borra al cerrar la app'),
        T('clipToast', 'Aviso breve al copiar'),
      ]),
      sec('Monitoreo', [
        T('clipIgnoreSecrets', 'Ignorar lo que parece una clave', 'Claves de API, tokens, tarjetas y contraseñas. Los gestores de contraseñas ya se ignoran siempre.'),
        { t: 'list', k: 'clipIgnoredApps', label: 'Apps ignoradas', note: 'Nombres de programa separados por comas (1password, keepass…)' },
        INT('clipMax', 'Máximo de elementos', 5, 500),
        SEL('clipAutoDeleteDays', 'Borrar automáticamente', [[0, 'Nunca'], [1, 'Después de 1 día'], [7, 'Después de 7 días'], [30, 'Después de 30 días']], null, { num: true }),
        BTN('Borrar historial', 'Borrar', 'clip-clear', 'Se borra de inmediato', { danger: true }),
      ]),
    ],
  },
  {
    id: 'notas', icon: 'note', name: 'Notas',
    build: () => [
      sec('Notas y tareas', [
        T('notesShowAge', 'Mostrar cuánto hace que las creaste'),
        SEL('notesHideDoneAfterDays', 'Ocultar tareas completadas', CLOSE_AFTER, null, { num: true }),
        SEL('notesOrder', 'Orden', [['new', 'Más nuevas primero'], ['old', 'Más viejas primero']]),
      ]),
      sec('Carpeta y sincronización con iCloud Drive', [
        INFO('Carpeta', () => (ctx.notes ? ctx.notes.display : '…'), () => (ctx.notes ? ctx.notes.folder : '')),
        INFO('Estado', () => (ctx.notes ? ctx.notes.status : '…'), null, 'ok'),
        BTN('Cambiar carpeta', 'Elegir…', 'notes-choose', 'Se elige una sola vez. Cada nota es un archivo .md.'),
        { ...BTN('Usar iCloud Drive', 'Usar mi iCloud', 'notes-icloud', 'Crea una carpeta "Isla Notas" dentro de tu iCloud Drive'), when: () => !!(ctx.notes && ctx.notes.iCloudGuess) },
        { ...INFO('iCloud para Windows', 'No encontrado', 'Instala "iCloud para Windows" de Microsoft Store y activa iCloud Drive; luego vuelve aquí.', 'warn'), when: () => !!ctx.notes && !ctx.notes.iCloudGuess },
        BTN('Carpeta local', 'Volver a la de la app', 'notes-local', null, { when: () => !!(ctx.notes && !ctx.notes.isDefault) }),
        BTN('Abrir la carpeta', 'Mostrar en el Explorador', 'notes-open'),
        BTN('Borrar todas las notas', 'Borrar…', 'notes-delete-all', 'Las manda a la Papelera. Pide confirmación.', { danger: true }),
      ]),
    ],
  },
  {
    id: 'ia', icon: 'spark', name: 'IA',
    build: () => [
      sec('Cómo usar la IA', [
        SEL('aiOpenMode', 'Forma de usarla', [['web', 'Con tu cuenta (iniciar sesión dentro de la isla)'], ['mini', 'Con tu clave de API (mini chat)']], 'Con tu cuenta no hace falta ninguna clave: abres la página oficial dentro de la isla e inicias sesión, también con Google.', { rr: true }),
      ]),
      sec('Bloqueo del chat de IA', [
        SEL('aiLock', 'Pedir confirmación para abrir el chat', [['auto', 'Automático: Windows Hello si está disponible'], ['secure', 'Windows Hello o PIN de la app'], ['none', 'Sin bloqueo']], 'Solo tapa el chat: no borra tu sesión guardada.', { rr: true }),
        { ...SEL('aiLockRelock', 'Volver a pedirlo', [['always', 'Siempre (cada vez que se cierra la isla)'], ['15', 'A los 15 minutos'], ['60', 'A la hora'], ['app', 'Solo al abrir la app']], 'También se vuelve a pedir al bloquear o suspender Windows. No usa ningún almacén que muestre avisos del sistema.'), when: (s) => s.aiLock !== 'none' },
        INFO('Windows Hello', () => (ctx.lock.hello ? 'Disponible (huella, cara o PIN de Windows)' : 'No disponible en este equipo'), () => (ctx.lock.hello ? '' : 'Sin Windows Hello se usa el PIN de la app, si eliges «Windows Hello o PIN de la app».'), () => (ctx.lock.hello ? 'ok' : 'warn')),
        { ...T('aiLockPreferPin', 'Usar el PIN de la app en vez de Windows Hello', null, { rr: true }), when: (s) => s.aiLock !== 'none' },
        { ...HTML(pinHTML), when: (s) => s.aiLock !== 'none' },
      ]),
      sec('Sesiones guardadas', [
        INFO('Carpeta de las copias', () => ctx.session.folder, () => (ctx.session.isDefault ? 'La carpeta de la app (no hay que configurar nada)' : 'Una carpeta que elegiste')),
        BTN('Llevarlas a otra carpeta', 'Elegir otra carpeta…', 'session-choose', 'Cualquiera: Documentos, un USB, OneDrive, Dropbox…'),
        { ...BTN('La carpeta de la app', 'Usar la carpeta de la app', 'session-appfolder'), when: () => !ctx.session.isDefault },
        HTML(sessionPasswordHTML),
        T('sessionBackupAuto', 'Guardar solas', 'Se guardan 20 segundos después del último cambio de tus sesiones de las IA'),
        INFO('Última copia', () => (ctx.session.savedAt ? new Date(ctx.session.savedAt).toLocaleString('es') : 'Todavía no hay')),
        BTN('Guardar ahora', 'Guardar ahora', 'session-save'),
        BTN('Restaurar ahora', 'Restaurar ahora', 'session-restore', 'Si la app arranca sin ninguna sesión de las IA y hay copia, se restaura sola'),
      ], 'No hay que configurar nada: tus inicios de sesión de las IA se guardan cifrados en una carpeta de la app y vuelven solos si reinstalas. Si quieres llevarlos a otra computadora, elige una carpeta cualquiera (Documentos, un USB, OneDrive, Dropbox…) y pon una contraseña propia; en la otra computadora elige la misma carpeta y escribe la misma contraseña. Solo se guardan las sesiones de las páginas de las IA; tus contraseñas nunca pasan por aquí.'),
      ...(ctx.set.aiOpenMode === 'web'
        ? [
            sec('Con tu cuenta', [
              ...WEB_AI.map((p) => ({ t: 'toggle', k: '__aiweb', provider: p, label: WEB_AI_META[p].name, note: 'Página oficial dentro de la isla. La sesión se guarda solo en este PC.', rr: true })),
              { t: 'webselect', label: 'La que sale junto al "+" del calendario' },
              BTN('Cerrar sesión en todas las IA', 'Cerrar sesión', 'ai-signout', 'La sesión se recuerda 90 días aunque cierres la isla o la app. Este botón es lo único que la borra.', { danger: true }),
              INFO('Privacidad', 'Hablas directamente con el sitio oficial', 'La app no ve tus mensajes ni tu contraseña: es la página de ese servicio. Para Google, la ventana de inicio de sesión es la oficial de Google.'),
            ]),
          ]
        : [
            sec('IAs con clave de API (avanzado)', [
              ...AI_PROVIDERS.map((p) => ({ t: 'toggle', k: '__ai', provider: p, label: AI_META[p].name + (p === 'ollama' ? ' en tu PC' : ''), note: p === 'ollama' ? 'Sin costo y sin internet' : p === 'custom' ? 'Cualquier servicio con API compatible con OpenAI' : '', rr: true })),
              { t: 'aiselect', k: 'aiProvider', label: 'Proveedor por defecto', note: 'Esta sale junto al "+" del calendario' },
              INFO('Tu clave, tu cuenta', 'Pagas solo lo que uses a tu proveedor', 'La app no cobra nada ni usa servidores intermedios.'),
              INFO('Cifrado de claves', () => (ctx.enc ? 'Disponible' : 'No disponible en este equipo'), 'Las claves se guardan cifradas con Windows (solo tu usuario puede leerlas).', 'ok'),
            ]),
            ...AI_PROVIDERS.filter((p) => ctx.set.aiEnabled && ctx.set.aiEnabled[p]).map((p) =>
              sec(AI_META[p].name, [
                modelRow(p),
                ...(AI_META[p].needsKey ? [keyRow(p)] : []),
                ...(p === 'ollama' ? [{ t: 'text', k: 'ollamaUrl', label: 'Dirección de Ollama', placeholder: 'http://localhost:11434' }] : []),
                ...(p === 'custom' ? [{ t: 'text', k: 'customBaseUrl', label: 'Dirección de la API', placeholder: 'https://api.ejemplo.com/v1' }] : []),
              ]),
            ),
            sec('Privacidad del mini chat', [
              INFO('Mensajes', 'Van directo de tu PC al proveedor'),
              T('aiSaveHistory', 'Guardar el historial en tu PC'),
              T('aiIncludeNowPlaying', 'Incluir la canción que suena como contexto'),
            ]),
          ]),
      sec('Atajo', [shortcutRow('shortcutChat')]),
    ],
  },
  {
    id: 'atajos', icon: 'kbd', name: 'Atajos',
    build: () => [
      sec('Teclado global', ['shortcutToggle', 'shortcutPlayer', 'shortcutPomodoro', 'shortcutChat', 'shortcutPeek'].map(shortcutRow), 'Pulsa un atajo y luego la combinación nueva (con Ctrl, Alt o Mayús). Escape cancela.'),
    ],
  },
  {
    id: 'juego', icon: 'game', name: 'Juego',
    build: () => [
      sec('Serpiente', [
        T('gameTabEnabled', 'Mostrar pestaña de juego'),
        SEL('snakeSpeed', 'Velocidad inicial', [[160, 'Lenta'], [110, 'Normal'], [80, 'Rápida']], null, { num: true }),
        T('snakeProgressive', 'Velocidad de progresión', 'Va más rápido a medida que sumas puntos'),
        INFO('Récord', () => String(ctx.set.snakeBest || 0)),
        BTN('Reiniciar el récord', 'Reiniciar', 'snake-reset'),
      ]),
    ],
  },
  {
    id: 'vivo', icon: 'live', name: 'En vivo',
    build: () => [
      sec('Qué se muestra con la isla cerrada', [
        T('liveMusic', 'Música sonando'),
        T('livePomodoro', 'Pomodoro en marcha'),
        T('livePerf', 'Rendimiento (CPU, GPU)', null, { rr: true }),
        T('liveBattery', 'Batería cargando'),
      ]),
      sec('Cuando hay varias a la vez', [
        SEL('liveMax', 'Máximo a la vez', [[1, '1'], [2, '2'], [3, '3']], 'La primera va a la izquierda y la segunda a la derecha', { num: true }),
        SEL('livePrio', 'Si hay más, gana', [['mus', 'Música'], ['pom', 'Pomodoro']]),
        SEL('liveRotate', 'Las demás rotan cada', [[3, '3 segundos'], [5, '5 segundos'], [10, '10 segundos']], null, { num: true }),
        T('liveThirdBelow', 'Mostrar la tercera debajo de la isla'),
      ]),
      sec('Avisos', [
        T('pomoOpenOnFinish', 'Cuando termina el Pomodoro, abrir la isla un momento'),
        T('clipToast', 'Mostrar el aviso del portapapeles debajo'),
      ]),
    ],
  },
  {
    id: 'rendimiento', icon: 'bolt', name: 'Rendimiento',
    build: () => [
      sec('Componente en la isla', [
        { t: 'comp', id: 'performance', label: 'Mostrar el componente de rendimiento', note: 'También lo agregas o quitas con el lápiz de la isla' },
      ]),
      sec('Qué mostrar', [
        T('perfShowCPU', 'Procesador (CPU)'),
        T('perfShowGPU', 'Tarjeta gráfica (GPU)', 'NVIDIA da carga y temperatura; las demás, solo la carga'),
        T('perfShowRAM', 'Memoria (RAM)'),
        T('perfShowRefresh', 'Frecuencia de la pantalla (Hz)', 'Los FPS de un juego no se pueden leer sin herramientas aparte'),
        T('perfShowTemp', 'Temperatura en °C', 'Si lo apagas, muestra porcentajes'),
        T('perfShowStatus', 'Estado (Normal, Ocupado, Alto)', 'Según el uso de CPU y memoria'),
      ]),
      sec('Aspecto', [
        T('perfDiscreet', 'Modo discreto', 'Pequeño y atenuado al 38 % hasta que el puntero pasa por encima'),
        INFO('Cómo se mide', 'CPU y memoria del sistema, Hz de la pantalla', 'Lo que no se pueda leer (por ejemplo la tarjeta gráfica) dice «No disponible»'),
      ]),
      sec('Actualización', [
        SEL('perfInterval', 'Cada cuánto se actualiza', [[500, '0,5 segundos'], [1000, '1 segundo'], [2000, '2 segundos'], [5000, '5 segundos']], 'Solo mide mientras se está viendo', { num: true }),
        T('livePerf', 'Mostrar el rendimiento con la isla cerrada'),
        T('perfOnlyWhenGame', 'Mostrarlo solo cuando hay un juego abierto', 'Apagado: siempre visible'),
      ]),
    ],
  },
  {
    id: 'modojuego', icon: 'game', name: 'Modo juego',
    build: () => [
      sec('Cuando juegas', [
        T('gameHideExclusive', 'Ocultar la isla con un juego a pantalla completa exclusiva', 'Windows no deja dibujar encima en ese modo, y una ventana encima puede minimizar el juego. En pantalla completa sin bordes sí se ve.'),
        T('gameBasicOnly', 'Mostrar solo lo básico mientras juegas', 'Con un juego a pantalla completa la isla no se abre sola al pasar el mouse'),
        T('gameMuteClipToast', 'Silenciar avisos del portapapeles'),
        shortcutRow('shortcutPeek'),
        INFO('Estado ahora', () => (ctx.info && ctx.info.game ? (ctx.info.game.exclusive ? 'Juego a pantalla completa exclusiva' : ctx.info.game.busy ? 'App a pantalla completa' : 'Ningún juego detectado') : '…')),
      ]),
    ],
  },
  {
    id: 'bandeja', icon: 'tray', name: 'Bandeja',
    build: () => [
      sec('Bandeja de archivos', [
        T('shelfEnabled', 'Activar bandeja', 'Suelta archivos en la isla para tenerlos a mano'),
        T('shelfRemoveOnDrag', 'Quitar elementos al arrastrarlos fuera'),
        BTN('Vaciar la bandeja', 'Vaciar', 'shelf-clear', 'Solo quita las referencias; los archivos no se borran'),
      ]),
    ],
  },
  {
    id: 'acerca', icon: 'info', name: 'Acerca de',
    build: () => [
      sec('Esta app', [
        INFO('Versión', () => (ctx.app ? ctx.app.version : '…')),
        INFO('Licencia', 'GPL-3.0, código abierto'),
        INFO('Basada en', 'Boring Notch (TheBoredTeam), licencia GPL-3.0'),
        INFO('Actualizaciones automáticas', 'Desactivadas', 'Descarga la versión nueva desde la página del proyecto cuando quieras.'),
        INFO('Datos enviados', 'Ninguno'),
        INFO('Motor', () => (ctx.app ? `Electron ${ctx.app.electron} · Chromium ${ctx.app.chrome}` : '…')),
        BTN('Reiniciar todos los ajustes', 'Reiniciar…', 'reset-all', 'Vuelve a los valores de fábrica', { danger: true }),
        BTN('Salir de la app', 'Salir', 'quit'),
      ], '"Dynamic Island" es una marca de Apple Inc. Este proyecto no está afiliado a Apple.'),
    ],
  },
];

// ---------- Rendering ----------

function toggleHTML(k, on, label, extra = '') {
  return `<button class="tg" role="switch" aria-checked="${on ? 'true' : 'false'}" aria-label="${esc(label)}" data-k="${k}" ${extra}></button>`;
}

function valueOf(r) {
  if (r.t === 'text' && r.k === '__model') return (ctx.set.aiModels || {})[r.provider] || '';
  return ctx.set[r.k];
}

function rowHTML(r) {
  if (r.when && !r.when(ctx.set)) return '';
  const val = (v) => (typeof v === 'function' ? v() : v);
  const label = `<span>${esc(r.label)}${r.note ? `<small>${esc(val(r.note))}</small>` : ''}</span>`;
  switch (r.t) {
    case 'toggle':
      if (r.k === '__aiweb') return `<div class="r">${label}${toggleHTML('__aiweb', !!(ctx.set.aiWebEnabled || {})[r.provider], r.label, `data-provider="${r.provider}" data-rr="1"`)}</div>`;
      if (r.k === '__ai') return `<div class="r">${label}${toggleHTML('__ai', !!(ctx.set.aiEnabled || {})[r.provider], r.label, `data-provider="${r.provider}" data-rr="1"`)}</div>`;
      return `<div class="r">${label}${toggleHTML(r.k, !!ctx.set[r.k], r.label, r.rr ? 'data-rr="1"' : '')}</div>`;
    case 'select': {
      const cur = ctx.set[r.k];
      const opts = r.options.map(([v, l]) => `<option value="${esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('');
      return `<div class="r">${label}<select data-k="${r.k}" ${r.num ? 'data-num="1"' : ''} ${r.rr ? 'data-rr="1"' : ''} aria-label="${esc(r.label)}">${opts}</select></div>`;
    }
    case 'range': {
      const v = ctx.set[r.k];
      return `<div class="r">${label}<span class="rng"><input type="range" min="${r.min}" max="${r.max}" step="${r.step}" value="${v}" data-k="${r.k}" aria-label="${esc(r.label)}"><span class="val" data-out>${v}${r.unit ? ' ' + r.unit : ''}</span></span></div>`;
    }
    case 'int':
      return `<div class="r">${label}<span class="num"><input type="number" min="${r.min}" max="${r.max}" value="${ctx.set[r.k]}" data-k="${r.k}" aria-label="${esc(r.label)}"></span></div>`;
    case 'dur':
      return `<div class="r">${label}<span class="num"><input type="text" inputmode="numeric" value="${formatDuration(ctx.set[r.k])}" data-k="${r.k}" data-dur="1" aria-label="${esc(r.label)}"><span class="val">mm:ss</span></span></div>`;
    case 'text': {
      const v = valueOf(r) || '';
      return `<div class="r">${label}<input type="text" value="${esc(v)}" placeholder="${esc(r.placeholder || '')}" data-k="${r.k}" ${r.provider ? `data-provider="${r.provider}"` : ''} aria-label="${esc(r.label)}" autocomplete="off" spellcheck="false"></div>`;
    }
    case 'list':
      return `<div class="r">${label}<input type="text" value="${esc((ctx.set[r.k] || []).join(', '))}" data-k="${r.k}" data-list="1" aria-label="${esc(r.label)}" spellcheck="false"></div>`;
    case 'color':
      return `<div class="r">${label}<input type="color" value="${esc(ctx.set[r.k])}" data-k="${r.k}" aria-label="${esc(r.label)}"></div>`;
    case 'button':
      return `<div class="r">${label}<button class="btn${r.danger ? ' danger' : ''}" data-do="${r.act}">${esc(r.btn)}</button></div>`;
    case 'info':
      return `<div class="r"><span>${esc(r.label)}${r.note ? `<small>${esc(val(r.note))}</small>` : ''}</span><span class="val ${typeof r.cls === 'function' ? r.cls() : r.cls || ''}">${esc(val(r.value))}</span></div>`;
    case 'html':
      return r.html();
    case 'display': {
      const d = (ctx.info && ctx.info.displays) || [];
      const opts = d.map((x) => `<option value="${x.id}"${String(ctx.set.displayKey) === String(x.id) ? ' selected' : ''}>${esc(x.label)} · ${x.size.width}×${x.size.height}${x.primary ? ' (principal)' : ''}</option>`).join('');
      return `<div class="r">${label}<select data-k="displayKey" aria-label="Pantalla">${opts}</select></div>`;
    }
    case 'webselect': {
      const en = WEB_AI.filter((p) => (ctx.set.aiWebEnabled || {})[p]);
      const opts = (en.length ? en : ['claude']).map((p) => `<option value="${p}"${ctx.set.aiWebProvider === p ? ' selected' : ''}>${esc(WEB_AI_META[p].name)}</option>`).join('');
      return `<div class="r">${label}<select data-k="aiWebProvider" aria-label="IA favorita">${opts}</select></div>`;
    }
    case 'aiselect': {
      const en = AI_PROVIDERS.filter((p) => (ctx.set.aiEnabled || {})[p]);
      const opts = (en.length ? en : ['claude']).map((p) => `<option value="${p}"${ctx.set.aiProvider === p ? ' selected' : ''}>${esc(AI_META[p].name)}</option>`).join('');
      return `<div class="r">${label}<select data-k="aiProvider" aria-label="Proveedor por defecto">${opts}</select></div>`;
    }
    case 'comp': {
      const on = ctx.set.components.some((c) => c.id === r.id && c.enabled);
      return `<div class="r">${label}${toggleHTML('__comp', on, r.label, `data-comp="${r.id}" data-rr="1"`)}</div>`;
    }
    default:
      return '';
  }
}

function secHTML(s) {
  const rows = s.rows.map(rowHTML).join('');
  if (!rows.trim()) return '';
  return `<div class="sec"><h3>${esc(s.h)}</h3><div class="card">${rows}</div>${s.note ? `<p class="note">${esc(s.note)}</p>` : ''}</div>`;
}

function render() {
  const tabs = TABS;
  $('#toolbar').innerHTML = tabs
    .map((t) => `<button class="stab" role="tab" aria-selected="${t.id === curTab}" data-tab="${t.id}">${ic(t.icon)}<span>${esc(t.name)}</span></button>`)
    .join('');
  const tab = TABS.find((t) => t.id === curTab) || TABS[0];
  $('#wtitle').textContent = `Ajustes · ${tab.name}`;
  const body = $('#wbody');
  const top = body.scrollTop;
  body.innerHTML = `<h2>${esc(tab.name)}</h2>${tab.build().map(secHTML).join('')}`;
  body.scrollTop = top;
  tab.build().forEach((s) => s.rows.forEach((r) => r.t === 'html' && r.bind && r.bind(body)));
}

// ---------- Components block (General) ----------

function primaryWidth() {
  const d = ctx.info && ctx.info.displays && (ctx.info.displays.find((x) => x.primary) || ctx.info.displays[0]);
  return d ? d.size.width : 1920;
}

function componentsHTML() {
  const s = ctx.set;
  const cap = capWidth(primaryWidth(), s.manualSize, s.manualOpenWidth);
  const list = s.components;
  const u = usage(list.filter((c) => c.enabled), cap);
  const cards = list
    .map((c) => `<div class="comp">${toggleHTML('__comp', c.enabled, COMPONENT_META[c.id].name, `data-comp="${c.id}" data-rr="1"`)}<span>${COMPONENT_META[c.id].name}<small>${((c.width / cap) * 100).toFixed(1)}%</small></span></div>`)
    .join('');
  const chips = list.filter((c) => c.enabled).map((c) => `<button class="chip" draggable="true" data-id="${c.id}" style="flex:${c.width} 1 0" aria-label="Mover ${COMPONENT_META[c.id].name} con las flechas">${ic(COMPONENT_META[c.id].icon)}${COMPONENT_META[c.id].name}</button>`).join('') || '<span class="empty">Sin componentes activos</span>';
  return `<div class="comps" id="comps">${cards}</div>
    <p class="note">Cada componente ocupa un porcentaje del ancho. Todos son opcionales y se pueden ordenar.</p>
    <div class="order" style="margin-top:12px"><div class="ohead"><span>Orden de componentes</span><span class="use${u > 100 ? ' over' : ''}"><span class="track"><i style="width:${Math.min(100, u)}%"></i></span>Espacio usado: ${(Math.round(u * 10) / 10).toFixed(1)}%</span></div><div class="chips" id="chips">${chips}</div></div>
    <p class="note">Arrastra, o usa las flechas con el componente enfocado, para reordenarlos. Si no caben, pasan a otra página.</p>`;
}

function bindComponents(root) {
  const chips = root.querySelector('#chips');
  if (!chips) return;
  let drag = null;
  const save = (list) => dim.settings.patch({ components: list });
  chips.querySelectorAll('.chip').forEach((c) => {
    c.addEventListener('dragstart', (e) => {
      drag = c.dataset.id;
      c.classList.add('drag');
      e.dataTransfer.effectAllowed = 'move';
      try {
        e.dataTransfer.setData('text/plain', drag);
      } catch {
        /* ignore */
      }
    });
    c.addEventListener('dragend', () => {
      drag = null;
      c.classList.remove('drag');
      chips.querySelectorAll('.over').forEach((o) => o.classList.remove('over'));
    });
    c.addEventListener('dragover', (e) => {
      e.preventDefault();
      c.classList.add('over');
    });
    c.addEventListener('dragleave', () => c.classList.remove('over'));
    c.addEventListener('drop', (e) => {
      e.preventDefault();
      if (drag && drag !== c.dataset.id) save(moveOnto(ctx.set.components, drag, c.dataset.id));
    });
    c.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const act = ctx.set.components.filter((x) => x.enabled);
      const i = act.findIndex((x) => x.id === c.dataset.id);
      const j = i + (e.key === 'ArrowLeft' ? -1 : 1);
      if (j < 0 || j >= act.length) return;
      const id = c.dataset.id;
      save(moveOnto(ctx.set.components, id, act[j].id));
      setTimeout(() => {
        const n = document.querySelector(`#chips .chip[data-id="${id}"]`);
        if (n) n.focus();
      }, 60);
    });
  });
}

// ---------- Saving ----------

let toastTimer = null;
function say(msg) {
  let t = $('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}

function patch(obj) {
  Object.assign(ctx.set, obj);
  return dim.settings.patch(obj);
}

document.addEventListener('click', async (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    curTab = tab.dataset.tab;
    render();
    return;
  }
  const tg = e.target.closest('.tg[data-k]');
  if (tg) {
    const on = tg.getAttribute('aria-checked') !== 'true';
    tg.setAttribute('aria-checked', String(on));
    if (tg.dataset.k === '__aiweb') {
      patch({ aiWebEnabled: { ...ctx.set.aiWebEnabled, [tg.dataset.provider]: on } });
    } else if (tg.dataset.k === '__ai') {
      patch({ aiEnabled: { ...ctx.set.aiEnabled, [tg.dataset.provider]: on } });
    } else if (tg.dataset.k === '__comp') {
      patch({ components: ctx.set.components.map((c) => (c.id === tg.dataset.comp ? { ...c, enabled: on } : c)) });
    } else {
      patch({ [tg.dataset.k]: on });
    }
    if (tg.dataset.rr) render();
    return;
  }
  const b = e.target.closest('[data-do]');
  if (b) await doAction(b);
});

document.addEventListener('change', async (e) => {
  const el = e.target.closest('[data-k]');
  if (!el || el.classList.contains('tg')) return;
  const k = el.dataset.k;
  if (el.dataset.provider && k === '__model') {
    patch({ aiModels: { ...(ctx.set.aiModels || {}), [el.dataset.provider]: el.value.trim() } });
    return;
  }
  if (el.dataset.dur) {
    const sec = parseDuration(el.value);
    if (sec > 0) patch({ [k]: sec });
    el.value = formatDuration(ctx.set[k]);
    return;
  }
  if (el.dataset.list) {
    patch({ [k]: el.value.split(',').map((s) => s.trim()).filter(Boolean) });
    return;
  }
  let v = el.value;
  if (el.type === 'number' || el.type === 'range' || el.dataset.num) v = Number(v);
  if (el.type === 'number' && !Number.isFinite(v)) return;
  if (el.type === 'number') v = Math.max(Number(el.min) || -Infinity, Math.min(Number(el.max) || Infinity, v));
  patch({ [k]: v });
  if (el.dataset.rr) render();
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.type === 'range') {
    const out = el.parentNode.querySelector('[data-out]');
    const unit = out.textContent.replace(/^[\d.,-]+/, '');
    out.textContent = el.value + unit;
    // Live preview while dragging (the island follows).
    ctx.set[el.dataset.k] = Number(el.value);
    livePatch(el.dataset.k, Number(el.value));
  }
});

const lightsSend = throttledPatcher((o) => dim.settings.patch(o));
function lightsPatch(o) {
  Object.assign(ctx.set, o);
  lightsSend(o);
}

const pendingLive = {};
let liveTimer = null;
function livePatch(k, v) {
  pendingLive[k] = v;
  if (liveTimer) return;
  liveTimer = setTimeout(() => {
    liveTimer = null;
    const o = { ...pendingLive };
    for (const key of Object.keys(pendingLive)) delete pendingLive[key];
    dim.settings.patch(o);
  }, 70);
}

// Shortcut recorder
let recording = null;
function stopRec() {
  if (recording) recording.el.classList.remove('rec');
  recording = null;
}
function accelFromEvent(e) {
  const mods = [];
  if (e.ctrlKey) mods.push('Control');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Super');
  let key = e.key;
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return null;
  const map = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Enter: 'Return', '+': 'Plus' };
  key = map[key] || (key.length === 1 ? key.toUpperCase() : key);
  if (!mods.length) return null;
  return [...mods, key].join('+');
}
document.addEventListener('keydown', (e) => {
  if (!recording) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') {
    stopRec();
    render();
    return;
  }
  const a = accelFromEvent(e);
  if (!a) return;
  const k = recording.k;
  stopRec();
  patch({ [k]: a });
  render();
}, true);

async function doAction(b) {
  const a = b.dataset.do;
  switch (a) {
    case 'rec':
      stopRec();
      recording = { k: b.dataset.k, el: b };
      b.classList.add('rec');
      b.textContent = 'Pulsa la combinación…';
      break;
    case 'rec-clear':
      patch({ [b.dataset.k]: '' });
      render();
      break;
    case 'key-save': {
      const p = b.dataset.p;
      const input = $(`#key-${p}`);
      if (!input.value.trim()) return say('Pega tu clave primero.');
      const r = await dim.ai.setKey(p, input.value);
      input.value = '';
      if (r && r.ok) {
        ctx.keys[p] = true;
        say('Clave guardada y cifrada.');
      } else say((r && r.error) || 'No se pudo guardar la clave.');
      render();
      break;
    }
    case 'key-clear':
      await dim.ai.clearKey(b.dataset.p);
      ctx.keys[b.dataset.p] = false;
      say('Clave borrada.');
      render();
      break;
    case 'session-save':
    case 'session-restore': {
      const r = a === 'session-save' ? await dim.session.save() : await dim.session.restore();
      say(r.message);
      await refreshSession();
      break;
    }
    case 'session-choose':
      if (await dim.session.chooseFolder()) say('Carpeta cambiada. Si ya hay una copia ahí, pulsa «Restaurar ahora».');
      await refreshSession();
      break;
    case 'session-appfolder':
      await dim.session.useAppFolder();
      await refreshSession();
      break;
    case 'session-pw-save': {
      const r = await dim.session.setPassword($('#sess-pw').value);
      say(r.message);
      await refreshSession();
      break;
    }
    case 'session-pw-clear': {
      const r = await dim.session.clearPassword();
      say(r.message);
      await refreshSession();
      break;
    }
    case 'pin-save': {
      const a = $('#pin-new').value;
      if (a !== $('#pin-new2').value) return say('Los dos PIN no coinciden.');
      const r = ctx.lock.pinSet ? await dim.ailock.changePin($('#pin-old').value, a) : await dim.ailock.setPin(a);
      if (r && r.ok) say(ctx.lock.pinSet ? 'PIN cambiado.' : 'PIN guardado.');
      else if (r && r.retryIn) say(`Demasiados intentos. Espera ${r.retryIn} s.`);
      else say((r && r.error) || (r && typeof r.attemptsLeft === 'number' ? `PIN actual incorrecto. Te quedan ${r.attemptsLeft} intentos.` : 'No se pudo guardar el PIN.'));
      break;
    }
    case 'pin-remove': {
      const r = await dim.ailock.removePin($('#pin-old').value);
      if (r && r.ok) say('PIN quitado.');
      else if (r && r.retryIn) say(`Demasiados intentos. Espera ${r.retryIn} s.`);
      else say('Escribe tu PIN actual para quitarlo.');
      break;
    }
    case 'ai-signout':
      if (await dim.ai.signOutAll()) say('Sesiones cerradas.');
      break;
    case 'notes-choose':
      if (await dim.notes.chooseFolder()) say('Carpeta cambiada.');
      break;
    case 'notes-local':
      await dim.notes.useLocalFolder();
      break;
    case 'notes-icloud':
      if (!(await dim.notes.useICloudFolder())) say('No encontré iCloud Drive.');
      break;
    case 'notes-open':
      dim.notes.reveal();
      break;
    case 'notes-delete-all':
      if (await dim.notes.removeAll()) say('Notas mandadas a la Papelera.');
      break;
    case 'pomo-preview':
      dim.pomo.previewSound();
      break;
    case 'sound-pick': {
      const f = await dim.app.pickFile('sound');
      if (f) {
        patch({ pomoCustomSound: f });
        render();
      }
      break;
    }
    case 'cam-privacy':
      dim.app.openSystemSettings('camera');
      break;
    case 'clip-clear':
      await dim.clip.clear();
      say('Historial borrado.');
      break;
    case 'shelf-clear':
      await dim.shelf.clear();
      say('Bandeja vacía.');
      break;
    case 'cal-del':
      dim.calendar.remove(b.dataset.id);
      break;
    case 'snake-reset':
      patch({ snakeBest: 0 });
      render();
      break;
    case 'apply-all-displays':
      patch({ layoutsByDisplay: {} });
      say('Todas las pantallas usan el mismo orden.');
      break;
    case 'export':
      if (await dim.app.exportSettings()) say('Copia guardada.');
      break;
    case 'import':
      if (await dim.app.importSettings()) say('Ajustes importados.');
      break;
    case 'open-data':
      dim.app.openUserData();
      break;
    case 'wipe':
      if (await dim.app.wipeData()) {
        await loadAll();
        say('Datos borrados.');
      }
      break;
    case 'reset-all':
      if (confirm('¿Volver a los valores de fábrica?')) {
        await dim.settings.reset();
        say('Ajustes reiniciados.');
      }
      break;
    case 'quit':
      dim.app.quit();
      break;
    default:
  }
}

// ---------- Boot ----------

async function refreshSession() {
  ctx.session = (await dim.session.info()) || ctx.session;
  render();
}

async function loadAll() {
  const [set, info, notes, app, shortcuts, enc, events, lock, session] = await Promise.all([
    dim.settings.getAll(),
    dim.system.info(),
    dim.notes.get(),
    dim.app.info(),
    dim.app.shortcutStatus(),
    dim.ai.encryptionAvailable(),
    dim.calendar.list(),
    dim.ailock.refresh(),
    dim.session.info(),
  ]);
  if (lock) ctx.lock = lock;
  if (session) ctx.session = session;
  ctx.set = set;
  ctx.info = info;
  ctx.notes = notes.info;
  ctx.app = app;
  ctx.shortcuts = shortcuts || {};
  ctx.enc = enc !== false;
  ctx.events = events || [];
  for (const p of AI_PROVIDERS) ctx.keys[p] = await dim.ai.hasKey(p);
  render();
}

async function boot() {
  if (!window.dim) await import('./dev-shim.js');
  dim = window.dim;
  const q = new URLSearchParams(location.search);
  if (q.get('mica')) document.body.classList.add('mica');
  if (q.get('tab') && TABS.some((t) => t.id === q.get('tab'))) curTab = q.get('tab');
  await loadAll();

  dim.settings.onChange((changed) => {
    Object.assign(ctx.set, changed);
    if (!document.activeElement || !document.activeElement.closest || !document.activeElement.closest('#wbody')) render();
  });
  dim.ailock.onState((l) => {
    ctx.lock = l;
    if (curTab === 'ia' && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#wbody'))) render();
  });
  dim.notes.onChange((n) => {
    ctx.notes = n.info;
    if (curTab === 'notas') render();
  });
  dim.calendar.onChange((l) => {
    ctx.events = l;
    if (curTab === 'calendario') render();
  });
  dim.system.onDisplays(async () => {
    ctx.info = await dim.system.info();
    if (['pantalla', 'general'].includes(curTab)) render();
  });
  dim.app.onShortcutStatus((s) => {
    ctx.shortcuts = s;
    if (['atajos', 'ia', 'modojuego'].includes(curTab)) render();
  });
  dim.settingsWindow.onGoto((tab) => {
    if (TABS.some((t) => t.id === tab)) {
      curTab = tab;
      render();
    }
  });
  document.body.dataset.ready = '1';
}

boot();
