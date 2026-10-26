'use strict';
// The only door between the pages and the app. Pages get exactly these functions and nothing else:
// no Node.js, no file system, no API keys.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const on = (channel, cb) => {
  const handler = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('dim', {
  platform: process.platform,
  settings: {
    getAll: () => invoke('settings:getAll'),
    patch: (obj) => invoke('settings:patch', obj),
    reset: () => invoke('settings:reset'),
    onChange: (cb) => on('settings:changed', cb),
  },
  island: {
    info: () => invoke('island:info'),
    onInfo: (cb) => on('island:info', cb),
    onState: (cb) => on('island:state', cb),
    setOpen: (open) => ipcRenderer.send('island:setOpen', !!open),
    reportRect: (rect) => ipcRenderer.send('island:rect', rect),
    pin: (reason, on_) => ipcRenderer.send('island:pin', String(reason), !!on_),
    wantFocus: (on_) => ipcRenderer.send('island:focus', !!on_),
    peek: (ms) => ipcRenderer.send('island:peek', Number(ms) || 4000),
    openSettings: (tab) => ipcRenderer.send('app:openSettings', tab || ''),
    onCommand: (cb) => on('cmd', cb),
    onGame: (cb) => on('sys:game', cb),
    onWelcome: (cb) => on('island:welcome', cb),
  },
  music: {
    get: () => invoke('music:get'),
    onState: (cb) => on('music:state', cb),
    control: (cmd, arg) => invoke('music:control', cmd, arg),
    hdCover: (track) => invoke('music:hdCover', track),
  },
  pomo: {
    get: () => invoke('pomo:get'),
    onState: (cb) => on('pomo:state', cb),
    onFinished: (cb) => on('pomo:finished', cb),
    onSound: (cb) => on('pomo:sound', cb),
    act: (action, arg) => invoke('pomo:act', action, arg),
    previewSound: () => ipcRenderer.send('pomo:preview'),
  },
  notes: {
    get: () => invoke('notes:get'),
    onChange: (cb) => on('notes:changed', cb),
    add: (text, task) => invoke('notes:add', text, task),
    toggle: (id) => invoke('notes:toggle', id),
    remove: (id) => invoke('notes:remove', id),
    removeAll: () => invoke('notes:removeAll'),
    chooseFolder: () => invoke('notes:chooseFolder'),
    useLocalFolder: () => invoke('notes:useLocal'),
    useICloudFolder: () => invoke('notes:useICloud'),
    reveal: () => invoke('notes:reveal'),
  },
  clip: {
    get: () => invoke('clip:get'),
    onChange: (cb) => on('clip:changed', cb),
    onToast: (cb) => on('clip:toast', cb),
    copy: (id) => invoke('clip:copy', id),
    remove: (id) => invoke('clip:remove', id),
    clear: () => invoke('clip:clear'),
  },
  ai: {
    send: (provider, messages) => invoke('ai:send', provider, messages),
    hasKey: (provider) => invoke('ai:hasKey', provider),
    setKey: (provider, key) => invoke('ai:setKey', provider, key),
    clearKey: (provider) => invoke('ai:clearKey', provider),
    history: () => invoke('ai:history'),
    saveHistory: (messages) => ipcRenderer.send('ai:saveHistory', messages),
    clearHistory: () => invoke('ai:clearHistory'),
    openWeb: (provider) => ipcRenderer.send('ai:openWeb', provider),
    signOutAll: () => invoke('ai:signOutAll'),
    onSignedOut: (cb) => on('ai:signedOut', cb),
    encryptionAvailable: () => invoke('ai:encryptionAvailable'),
  },
  session: {
    info: () => invoke('session:info'),
    save: () => invoke('session:save'),
    restore: () => invoke('session:restore'),
    chooseFolder: () => invoke('session:chooseFolder'),
    useAppFolder: () => invoke('session:useAppFolder'),
    setPassword: (pw) => invoke('session:setPassword', pw),
    clearPassword: () => invoke('session:clearPassword'),
  },
  ailock: {
    state: () => invoke('ailock:state'),
    refresh: () => invoke('ailock:refresh'),
    onState: (cb) => on('ailock:state', cb),
    unlockHello: () => invoke('ailock:unlockHello'),
    unlockPin: (pin) => invoke('ailock:unlockPin', pin),
    setPin: (pin) => invoke('ailock:setPin', pin),
    changePin: (oldPin, newPin) => invoke('ailock:changePin', oldPin, newPin),
    removePin: (pin) => invoke('ailock:removePin', pin),
  },
  perf: {
    subscribe: (on_) => ipcRenderer.send('perf:sub', !!on_),
    onSample: (cb) => on('perf:sample', cb),
    get: () => invoke('perf:get'),
  },
  system: {
    info: () => invoke('system:info'),
    onDisplays: (cb) => on('system:displays', cb),
  },
  calendar: {
    list: () => invoke('cal:list'),
    add: (ev) => invoke('cal:add', ev),
    remove: (id) => invoke('cal:remove', id),
    onChange: (cb) => on('cal:changed', cb),
  },
  shelf: {
    list: () => invoke('shelf:list'),
    onChange: (cb) => on('shelf:changed', cb),
    addPaths: (paths) => invoke('shelf:add', paths),
    pathsFromFiles: (files) => Array.from(files || []).map((f) => webUtils.getPathForFile(f)).filter(Boolean),
    remove: (id) => invoke('shelf:remove', id),
    clear: () => invoke('shelf:clear'),
    reveal: (id) => invoke('shelf:reveal', id),
    startDrag: (id) => ipcRenderer.send('shelf:drag', id),
  },
  app: {
    info: () => invoke('app:info'),
    openExternal: (url) => ipcRenderer.send('app:openExternal', url),
    cameraIntent: () => ipcRenderer.send('app:cameraIntent'),
    pickFile: (kind) => invoke('app:pickFile', kind),
    shortcutStatus: () => invoke('app:shortcutStatus'),
    onShortcutStatus: (cb) => on('app:shortcutStatus', cb),
    quit: () => ipcRenderer.send('app:quit'),
    wipeData: () => invoke('app:wipeData'),
    exportSettings: () => invoke('app:exportSettings'),
    importSettings: () => invoke('app:importSettings'),
    openUserData: () => invoke('app:openUserData'),
    openSystemSettings: (which) => ipcRenderer.send('app:openSystemSettings', String(which)),
  },
  settingsWindow: {
    onGoto: (cb) => on('settings:goto', cb),
  },
});
