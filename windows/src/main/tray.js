import { Menu, Tray, nativeImage } from 'electron';

/** Icon in the notification area: the island has no taskbar button, so this is how to reach it. */
export class AppTray {
  constructor({ iconPath, store, handlers, getPomodoro }) {
    this.store = store;
    this.handlers = handlers;
    this.getPomodoro = getPomodoro;
    const img = nativeImage.createFromPath(iconPath);
    this.tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
    this.tray.setToolTip('Dynamic Island Music');
    this.tray.on('click', () => handlers.toggleIsland());
    this.update();
  }

  update() {
    const pomo = this.getPomodoro();
    const menu = Menu.buildFromTemplate([
      { label: 'Abrir o cerrar la isla', click: this.handlers.toggleIsland },
      { label: 'Ajustes', click: () => this.handlers.openSettings() },
      { type: 'separator' },
      { label: pomo.running ? 'Pausar el Pomodoro' : 'Iniciar el Pomodoro', click: this.handlers.togglePomodoro },
      {
        label: 'Pausar el historial del portapapeles',
        type: 'checkbox',
        checked: !!this.store.get('clipPaused'),
        click: (item) => this.store.set('clipPaused', item.checked),
      },
      { type: 'separator' },
      { label: 'Salir', click: this.handlers.quit },
    ]);
    this.tray.setContextMenu(menu);
  }

  destroy() {
    this.tray.destroy();
  }
}
