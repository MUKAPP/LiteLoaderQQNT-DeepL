// Electron 主进程 与 渲染进程 交互的桥梁
const { contextBridge, ipcRenderer } = require("electron");


// 在window对象下导出只读对象
contextBridge.exposeInMainWorld("deepl_plugin", {
    getSettings: () => ipcRenderer.invoke(
        "LiteLoader.deepl_plugin.getSettings"
    ),
    setSettings: content => ipcRenderer.invoke(
        "LiteLoader.deepl_plugin.setSettings",
        content
    ),
    logToMain: (...args) => ipcRenderer.invoke(
        "LiteLoader.deepl_plugin.logToMain",
        ...args
    ),
    openWeb: (url) =>
        ipcRenderer.send("LiteLoader.deepl_plugin.openWeb", url)
});