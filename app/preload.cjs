// The only bridge between the window and the app. Keys can be set or cleared, never read back.
const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);
contextBridge.exposeInMainWorld('cc', {
  state: call('state'),
  saveSite: call('site:save'),
  removeSite: call('site:remove'),
  run: call('site:run'),
  latest: call('site:latest'),
  setTask: call('task:status'),
  saveSettings: call('settings:save'),
  setSecret: call('secret:set'),
  clearSecret: call('secret:clear'),
  importServiceAccount: call('secret:importServiceAccount'),
  properties: call('google:properties'),
  demo: call('demo'),
  open: call('open'),
  copy: call('copy'),
  onLog: (fn) => ipcRenderer.on('log', (_e, msg) => fn(msg)),
});
