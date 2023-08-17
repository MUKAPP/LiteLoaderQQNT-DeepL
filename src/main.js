// 运行在 Electron 主进程 下的插件入口
const fs = require("fs");
const path = require("path");
const { BrowserWindow, ipcMain } = require("electron");

function log(...args) {
    console.log(`[DeepL]`, ...args);
}

// 监听配置文件修改
function watchSettingsChange(webContents, settingsPath) {
    fs.watch(settingsPath, "utf-8", debounce(() => {
        updateStyle(webContents, settingsPath);
    }, 100));
}


// 加载插件时触发
function onLoad(plugin) {
    const pluginDataPath = plugin.path.data;
    const settingsPath = path.join(pluginDataPath, "settings.json");

    // fs判断插件路径是否存在，如果不存在则创建（同时创建父目录（如果不存在的话））
    if (!fs.existsSync(pluginDataPath)) {
        fs.mkdirSync(pluginDataPath, { recursive: true });
    }
    // 判断settings.json是否存在，如果不存在则创建
    if (!fs.existsSync(settingsPath)) {
        fs.writeFileSync(settingsPath, JSON.stringify({
            "host": "https://deepl.mukapp.top",
            "rightTargetLang": "ZH",
            "chatTargetLang": "EN",
        }));
    } else {
        const data = fs.readFileSync(settingsPath, "utf-8");
        const config = JSON.parse(data);
    }


    // 监听渲染进程的watchSettingsChange事件
    ipcMain.on(
        "LiteLoader.deepl_plugin.watchSettingsChange",
        (event, settingsPath) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            watchSettingsChange(window.webContents, settingsPath);
        });

    ipcMain.handle(
        "LiteLoader.deepl_plugin.getSettings",
        (event, message) => {
            try {
                const data = fs.readFileSync(settingsPath, "utf-8");
                const config = JSON.parse(data);
                return config;
            } catch (error) {
                log(error);
                return {};
            }
        }
    );

    ipcMain.handle(
        "LiteLoader.deepl_plugin.setSettings",
        (event, content) => {
            try {
                const new_config = JSON.stringify(content);
                fs.writeFileSync(settingsPath, new_config, "utf-8");
            } catch (error) {
                log(error);
            }
        }
    );


}


// 创建窗口时触发
function onBrowserWindowCreated(window, plugin) {

}


// 这两个函数都是可选的
module.exports = {
    onLoad,
    onBrowserWindowCreated
}