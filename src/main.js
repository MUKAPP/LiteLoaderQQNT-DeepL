// 运行在 Electron 主进程 下的插件入口
const fs = require("fs");
const path = require("path");
const { BrowserWindow, ipcMain, shell, net } = require("electron");
const { query } = require("@ifyour/deeplx");
const LanguageDetect = require('languagedetect');
const lngDetector = new LanguageDetect();

function log(...args) {
    console.log(`[DeepL]`, ...args);
}

// 自动识别语言并选择目标语言
async function autoDetectTargetLang(text, targetLang) {
    try {
        // 如果目标语言不是auto，直接返回指定的目标语言
        if (targetLang !== 'auto') {
            return targetLang;
        }

        // 检测语言
        const detections = lngDetector.detect(text);

        if (detections && detections.length > 0) {
            const [lang, confidence] = detections[0];

            // 检查是否为中文
            if (lang === 'chinese' || lang === 'chi') {
                return 'EN';
            } else {
                return 'ZH';
            }
        }

        log("无法检测到语言，默认使用英语");
        return 'EN';
    } catch (error) {
        log("语言检测错误:", error);
        return 'EN'; // 出错时默认返回英语
    }
}

// 监听配置文件修改
function watchSettingsChange(webContents, settingsPath) {
    fs.watch(settingsPath, "utf-8", debounce(() => {
        updateStyle(webContents, settingsPath);
    }, 100));
}

function fetchData(url) {
    return new Promise((resolve, reject) => {
        const request = net.request({
            method: 'GET',
            url: url,
            redirect: 'follow' // 处理重定向
        });

        request.on('response', (response) => {
            const finalUrl = response.headers.location || response.url;
            let data = '';

            response.on('data', (chunk) => {
                data += chunk;
            });

            response.on('end', () => {
                resolve({ url: finalUrl, content: data });
            });
        });

        request.on('error', (error) => {
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

ipcMain.handle(
    "LiteLoader.deepl_plugin.logToMain",
    (event, ...args) => {
        log(...args);
    }
);

ipcMain.handle(
    "LiteLoader.deepl_plugin.detectLanguage",
    async (event, text) => {
        try {
            // 默认使用auto作为目标语言进行检测
            const targetLang = await autoDetectTargetLang(text, 'auto');
            return targetLang;
        } catch (error) {
            log(error);
            return 'EN'; // 出错时默认返回英语
        }
    }
);

ipcMain.handle(
    "LiteLoader.deepl_plugin.queryTranslation",
    async (event, params) => {
        try {
            // 获取目标语言设置
            const targetLang = await autoDetectTargetLang(params.text, params.target_lang);
            params.target_lang = targetLang;
            
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
