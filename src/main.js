// 运行在 Electron 主进程 下的插件入口
const fs = require("fs");
const path = require("path");
const { BrowserWindow, ipcMain, shell, net } = require("electron");
const { query } = require("@ifyour/deeplx");

function log(...args) {
    console.log(`[DeepL]`, ...args);
}

// 监听配置文件修改
function watchSettingsChange(webContents, settingsPath) {
    fs.watch(settingsPath, "utf-8", debounce(() => {
        updateStyle(webContents, settingsPath);
    }, 100));
}

function openWeb(url) {
    shell.openExternal(url);
}

function fetchData(url) {
    return new Promise((resolve, reject) => {
        const request = net.request(url);
        request.on("response", response => {
            let data = "";
            response.on("data", chunk => {
                data += chunk;
            });
            response.on("end", () => {
                resolve(data);
            });
        });
        request.on("error", error => {
            reject(error);
        });
        request.end();
    });
}

// 加载插件时触发
const pluginDataPath = LiteLoader.plugins["deepl_plugin"].path.data;
const settingsPath = path.join(pluginDataPath, "settings.json");

// fs判断插件路径是否存在，如果不存在则创建（同时创建父目录（如果不存在的话））
if (!fs.existsSync(pluginDataPath)) {
    fs.mkdirSync(pluginDataPath, { recursive: true });
}
// 判断settings.json是否存在，如果不存在则创建
if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, JSON.stringify({
        "enableRemote": false,
        "host": "https://deepl.mukapp.top",
        "rightTargetLang": "ZH",
        "chatTargetLang": "EN",
    }));
} else {
    const data = fs.readFileSync(settingsPath, "utf-8");
    const config = JSON.parse(data);
    // 判断后来加入的enableRemote是否存在，如果不存在则添加
    if (!config.hasOwnProperty("enableRemote")) {
        config.enableRemote = false;
        fs.writeFileSync(settingsPath, JSON.stringify(config));
    }
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

ipcMain.on("LiteLoader.deepl_plugin.openWeb", (event, ...message) =>
    openWeb(...message)
);

ipcMain.handle(
    "LiteLoader.deepl_plugin.logToMain",
    (event, ...args) => {
        log(...args);
    }
);

ipcMain.handle(
    "LiteLoader.deepl_plugin.queryTranslation",
    async (event, params) => {
        try {
            const response = await query(params);
            return response;
        } catch (error) {
            log(error);
            return {};
        }
    }
);

ipcMain.handle("LiteLoader.deepl_plugin.fetchData", (event, url) => {
    return fetchData(url);
});
