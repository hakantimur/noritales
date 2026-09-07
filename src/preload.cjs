const {contextBridge,ipcRenderer} = require('electron');
const methods = ['settings','save-settings','models','pick','create','list','load','edit','generate','review','folder','export'];
contextBridge.exposeInMainWorld('nori', {
  call: (method, data) => {if (!methods.includes(method)) throw Error('Unknown method'); return ipcRenderer.invoke(method,data);},
  progress: callback => {const handler = (_event,message)=>callback(message);ipcRenderer.on('progress',handler);return ()=>ipcRenderer.removeListener('progress',handler);}
});
