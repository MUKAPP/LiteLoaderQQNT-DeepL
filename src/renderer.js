// 运行在 Electron 渲染进程 下的页面脚本
const plugin_path = LiteLoader.plugins["deepl_plugin"].path.plugin;

function log(...args) {
    console.log(`[DeepL]`, ...args);
    // deepl_plugin.logToMain(...args);
}

function observeElement(selector, callback, continuous = false) {
    let elementExists = false;
    try {
        const timer = setInterval(function () {
            const element = document.querySelector(selector);
            if (element && !elementExists) {
                elementExists = true;
                callback();
                log("已检测到", selector);
            } else if (!element) {
                elementExists = false;
            }
            if (element && !continuous) {
                clearInterval(timer);
            }
        }, 100);
    } catch (error) {
        log("[检测元素错误]", error);
    }
}

async function translate(text, target, callback) {
    try {
        // 获取设置
        const settings = await deepl_plugin.getSettings();
        // log("enableRemote", settings.enableRemote);

        if (settings.enableRemote) {
            log("远程翻译", text, "为", target);
            const host = settings.host;
            const res = await fetch(`${host}/translate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    text: text,
                    source_lang: "auto",
                    target_lang: target
                })
            });
            const data = await res.json();
            callback(data);
        } else {
            log("本地翻译", text, "为", target);
            // 使用本地翻译
            const data = await deepl_plugin.queryTranslation({
                text: text,
                target_lang: target
            });
            callback(data);
        }
    } catch (error) {
        log("[翻译错误]", error);
        callback({
            code: -1,
            message: error.message
        });
    }
}

function barIcon(iconPath, innerText, clickEvent, mouseEnterEvent, mouseLeaveEvent) {
    const qTooltips = document.createElement("div");
    const qTooltipsContent = document.createElement("div");
    const icon = document.createElement("i");
    const barIcon = document.createElement("div");

    barIcon.classList.add("deepl-plugin-bar-icon");
    barIcon.appendChild(qTooltips);

    qTooltips.classList.add("deepl-plugin-q-tooltips");
    qTooltips.addEventListener("click", clickEvent);
    if (mouseEnterEvent)
        barIcon.addEventListener("mouseenter", mouseEnterEvent);
    if (mouseLeaveEvent)
        barIcon.addEventListener("mouseleave", mouseLeaveEvent);
    qTooltips.appendChild(icon);
    qTooltips.appendChild(qTooltipsContent);

    qTooltipsContent.classList.add("deepl-plugin-q-tooltips__content");
    qTooltipsContent.innerText = innerText;

    icon.classList.add("deepl-plugin-q-icon");
    fetch(`local:///${plugin_path}/${iconPath}`)
        .then(response => response.text())
        .then(data => {
            icon.innerHTML = data;
        });

    return barIcon;
}

// 页面加载完成时触发
let chatTranslating = false;
let messageEl;
let appended = true; // 阻止重复添加菜单项

function getMessageElement(target) {
    if (target.matches('.msg-content-container')) {
        return target;
    }
    return target.closest('.msg-content-container');
}

observeElement('#ml-root .ml-list', function () {
    // -- 右键翻译 -- //
    // 监听右键点击
    document.querySelector('#ml-root .ml-list').addEventListener('mousedown', e => {
        // 判断是否为右键
        if (e.button !== 2) {
            appended = true;
            return;
        }
        // 获取被点击的消息元素
        messageEl = getMessageElement(e.target);
        log('右键点击消息', messageEl);
        appended = false;
    });

    new MutationObserver(() => {
        if (appended) {
            return;
        }
        const qContextMenu = document.querySelector(".q-context-menu");
        if (qContextMenu && messageEl) {
            log('右键菜单弹出', qContextMenu);
            // 判断 message-content 是否含有文本
            log(messageEl.querySelector(".message-content").innerText);
            if (!messageEl.querySelector(".message-content").innerText) {
                return;
            }
            const tempEl = document.createElement("div");
            tempEl.innerHTML = document.querySelector(`.q-context-menu :not([disabled="true"])`).outerHTML.replace(/<!---->/g, "");
            const item = tempEl.firstChild;
            item.id = "deepl-translate";
            if (item.querySelector(".q-icon")) {
                const iconPath = `local:///${plugin_path}/res/translate_FILL0_wght300_GRAD-25_opsz24.svg`;

                fetch(iconPath)
                    .then(response => response.text())
                    .then(data => {
                        item.querySelector(".q-icon").innerHTML = data;
                    });
            }
            if (messageEl.querySelector("#deepl-divider")) {
                // 如果已经翻译过，则显示撤销翻译
                if (item.className.includes("q-context-menu-item__text")) {
                    item.innerText = "撤销翻译";
                } else {
                    item.querySelector(".q-context-menu-item__text").innerText = "撤销翻译";
                }
                item.addEventListener("click", async () => {
                    qContextMenu.remove();
                    // 获取 messageEl 的子元素 message-content
                    const messageContent = messageEl.querySelector(".message-content");
                    // 删除 deepl-divider
                    messageContent.removeChild(messageEl.querySelector("#deepl-divider"));
                    // 删除 deepl-result
                    messageContent.removeChild(messageEl.querySelector("#deepl-result"));
                });
            } else {
                if (item.className.includes("q-context-menu-item__text")) {
                    item.innerText = "翻译";
                } else {
                    item.querySelector(".q-context-menu-item__text").innerText = "翻译";
                }
                item.addEventListener("click", async () => {
                    qContextMenu.remove();
                    // 获取 messageEl 的文本内容
                    const needTransText = messageEl.innerText;

                    // 获取 messageEl 的子元素 message-content
                    const messageContent = messageEl.querySelector(".message-content");
                    // 判断是否含有 .lite-tools-slot.embed-slot
                    if (messageEl.querySelector(".lite-tools-slot.embed-slot")) {
                        // 在 .lite-tools-slot.embed-slot 的前面插入一条分割线
                        messageContent.querySelector(".lite-tools-slot.embed-slot").insertAdjacentHTML("beforebegin", `<div id="deepl-divider" style="height: 4px;width: auto;margin-top: 8px;margin-bottom: 8px;border-radius: 2px;margin-left: 30%;margin-right: 30%;"></div>`);
                        // 然后插入 span class="text-element"，在这个 span 中插入正在翻译...
                        messageContent.querySelector(".lite-tools-slot.embed-slot").insertAdjacentHTML("beforebegin", `<span id="deepl-result" class='text-element'>正在翻译...</span>`);
                    } else {
                        // 在 messageContent 的最后插入一条分割线
                        messageContent.insertAdjacentHTML("beforeend", `<div id="deepl-divider" style="height: 4px;width: auto;margin-top: 8px;margin-bottom: 8px;border-radius: 2px;margin-left: 30%;margin-right: 30%;"></div>`);
                        // 然后插入 span class="text-element"，在这个 span 中插入正在翻译...
                        messageContent.insertAdjacentHTML("beforeend", `<span id="deepl-result" class='text-element'>正在翻译...</span>`);
                    }

                    // 翻译
                    const settings = await deepl_plugin.getSettings();
                    const targetLang = settings.rightTargetLang;
                    translate(needTransText, targetLang, function (data) {
                        if (data.code === 200) {
                            // 获取翻译结果
                            const result = data.data;
                            // 判断翻译结果不为空
                            if (result) {
                                // 获取 messageContent 里的 deepl-result，把里面的内容替换为 span class="text-normal"，显示翻译结果
                                messageContent.querySelector("#deepl-result").innerHTML = `<span class="text-normal"></span>`;
                                // 获取messageContent里的 deepl-result 的 text-normal，把里面的内容替换为翻译结果
                                messageContent.querySelector("#deepl-result .text-normal").innerText = result;
                            } else {
                                // 如果翻译结果为空，则显示翻译失败
                                messageContent.querySelector("#deepl-result").innerText = `翻译失败，翻译结果为空`;
                            }
                        } else {
                            // 如果翻译失败，则显示翻译失败
                            messageContent.querySelector("#deepl-result").innerText = `翻译失败：` + data.message;
                        }
                    });
                });
            }
            qContextMenu.appendChild(item);
            appended = true;
        }

    }).observe(document.querySelector("body"), { childList: true });

});


// -- 聊天框翻译 -- //
observeElement('.chat-input-area .ck-editor', function () {
    // 插入res/style.css
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = `local:///${plugin_path}/src/style.css`;
    document.head.appendChild(style);

    const translationResult = document.createElement("div");
    translationResult.id = "translation-result";
    translationResult.zIndex = 999;
    translationResult.innerHTML = `
        <div class="translate-bar">
            <div class="translation-title">翻译结果</div>
            <div class="translate-buttons">
                <button id="copy-button" class="q-button q-button--small q-button--primary">复制</button>
                <button id="cancel-button" class="q-button q-button--small q-button--secondary">取消</button>
            </div>
        </div>
        <div id="translation-text"></div>
    `;

    // 显示翻译结果div元素
    function showTranslationResult() {
        chatTranslating = true;
        translationResult.style.display = 'block';
        // 渐入动画、向上平移动画
        translationResult.animate([
            { opacity: 0, transform: 'translateY(20px)' },
            { opacity: 1, transform: 'translateY(0px)' }
        ], {
            duration: 128,
            easing: 'ease-out'
        });
    }

    // 隐藏翻译结果div元素
    function hideTranslationResult() {
        // 渐出动画、向下平移动画，监听动画结束事件
        translationResult.animate([
            { opacity: 1, transform: 'translateY(0px)' },
            { opacity: 0, transform: 'translateY(20px)' }
        ], {
            duration: 128,
            easing: 'ease-in'
        }).onfinish = function () {
            translationResult.style.display = 'none';
            chatTranslating = false;
        };
    }

    var ckEditor = document.querySelector('.ck-editor');

    // 将翻译结果div元素添加到聊天框上方
    ckEditor.appendChild(translationResult);

    // 复制按钮
    var copyButton = document.querySelector('#copy-button');
    // 取消按钮
    var cancelButton = document.querySelector('#cancel-button');
    // 翻译结果
    var translationText = document.querySelector('#translation-text');

    const clipboardObj = navigator.clipboard;
    // 复制翻译文本到剪贴板
    function copyTranslationText() {
        clipboardObj.writeText(translationText.innerText).then(function () {
            log('复制成功');
        }, function () {
            log('复制失败');
        });
    }

    // 处理复制按钮点击事件
    copyButton.addEventListener('click', function () {
        copyTranslationText();
        hideTranslationResult();
    });

    // 处理取消按钮点击事件
    cancelButton.addEventListener('click', function () {
        hideTranslationResult();
    });

    observeElement(".chat-func-bar", function () {
        // 获取消息栏的左侧的第一个图标
        const iconBarLeft = document.querySelector(".chat-func-bar").firstElementChild;

        // 判断是否已经添加过 deepl-bar-icon
        if (iconBarLeft.querySelector("#deepl-bar-icon")) {
            return;
        }

        // 添加 deepl-bar-icon
        const baricon = barIcon("res/translate_FILL0_wght300_GRAD-25_opsz24_origin.svg", "翻译", async () => {
            if (chatTranslating) {
                return;
            }
            // 显示翻译对话框
            showTranslationResult();
            translationText.innerText = "翻译中...";

            const content = document.querySelector('.ck-editor__editable');

            const text = content.innerText;
            // 读取聊天框翻译的目标语言
            const settings = await deepl_plugin.getSettings();
            const targetLanguage = settings.chatTargetLang;

            // 翻译
            translate(text, targetLanguage, function (json) {
                if (json.code === 200) {
                    const result = json.data;
                    if (result) {
                        translationText.innerText = result;
                    } else {
                        translationText.innerText = "翻译失败，翻译结果为空";
                    }
                } else {
                    translationText.innerText = "翻译失败：" + json.message;
                }
            });

        });

        // 添加到 iconBarLeft
        iconBarLeft.appendChild(baricon);
    }, true); // 点击群助手后 chat-func-bar 会消失，再点群聊才会出现，所以需要持续监听

});

// 打开设置界面时触发
export const onSettingWindowCreated = async view => {
    try {
        const html_file_path = `local:///${plugin_path}/src/settings.html`;

        view.innerHTML = await (await fetch(html_file_path)).text();

        // 获取设置
        const settings = await deepl_plugin.getSettings();

        const useRemoteServer = view.querySelector("#use-remote-server");
        const api_input = view.querySelector(".deepl_plugin .api-input");
        const reset = view.querySelector(".deepl_plugin .reset");
        const apply = view.querySelector(".deepl_plugin .apply");

        // 设置默认值
        const remoteServerSettings = view.querySelector("#remote-server-settings");
        if (settings.enableRemote) {
            useRemoteServer.setAttribute("is-active", "");
            remoteServerSettings.style.display = "block";
        } else {
            useRemoteServer.removeAttribute("is-active");
            remoteServerSettings.style.display = "none";
        }
        useRemoteServer.addEventListener("click", (event) => {
            const isActive = event.currentTarget.hasAttribute("is-active");
            if (isActive) {
                event.currentTarget.removeAttribute("is-active");
                settings.enableRemote = false;
                remoteServerSettings.style.display = "none";
            } else {
                event.currentTarget.setAttribute("is-active", "");
                settings.enableRemote = true;
                remoteServerSettings.style.display = "block";
            }
            deepl_plugin.setSettings(settings);
        });

        // 设置默认值
        api_input.value = settings.host;

        reset.addEventListener("click", () => {
            api_input.value = "https://deepl.mukapp.top";
            settings.host = api_input.value;
            deepl_plugin.setSettings(settings);
            alert("已恢复默认 API");
        });

        apply.addEventListener("click", () => {
            settings.host = api_input.value;
            deepl_plugin.setSettings(settings);
            alert("已应用新 API");
        });

        const rightTargetLang = view.querySelector(".deepl_plugin .right-target-lang");
        const rightTargetLang_apply = view.querySelector(".deepl_plugin .right-target-lang-apply");
        const rightTargetLang_reset = view.querySelector(".deepl_plugin .right-target-lang-reset");
        const chatTargetLang = view.querySelector(".deepl_plugin .chat-target-lang");
        const chatTargetLang_apply = view.querySelector(".deepl_plugin .chat-target-lang-apply");
        const chatTargetLang_reset = view.querySelector(".deepl_plugin .chat-target-lang-reset");

        // 设置默认值
        rightTargetLang.value = settings.rightTargetLang;
        chatTargetLang.value = settings.chatTargetLang;

        rightTargetLang_apply.addEventListener("click", () => {
            settings.rightTargetLang = rightTargetLang.value;
            deepl_plugin.setSettings(settings);
            alert("已设置右键翻译目标语言");
        });

        rightTargetLang_reset.addEventListener("click", () => {
            rightTargetLang.value = "ZH";
            settings.rightTargetLang = "ZH";
            deepl_plugin.setSettings(settings);
            alert("已恢复默认右键翻译目标语言");
        });

        chatTargetLang_apply.addEventListener("click", () => {
            settings.chatTargetLang = chatTargetLang.value;
            deepl_plugin.setSettings(settings);
            alert("已设置聊天框翻译目标语言");
        });

        chatTargetLang_reset.addEventListener("click", () => {
            chatTargetLang.value = "EN";
            settings.chatTargetLang = "EN";
            deepl_plugin.setSettings(settings);
            alert("已恢复默认聊天框翻译目标语言");
        });

        // 版本更新
        const version = view.querySelector("#deepl-settings-version");
        version.textContent = LiteLoader.plugins["deepl_plugin"].manifest.version

        const updateButton = view.querySelector("#deepl-settings-go-to-update");
        updateButton.style.display = "none";

        deepl_plugin.fetchData("https://api.github.com/repos/MUKAPP/LiteLoaderQQNT-DeepL/releases/latest")
            .then((res) => {
                const response = JSON.parse(res);
                if (response && response.html_url) {
                    const new_version = response.html_url.slice(response.html_url.lastIndexOf("/") + 1).replace("v", "");
                    log("[版本]", "最新版本", new_version);
                    if (compareVersions(new_version, LiteLoader.plugins["deepl_plugin"].manifest.version) > 0) {
                        updateButton.style.display = "block";
                        updateButton.addEventListener("click", () => {
                            deepl_plugin.openWeb(response.html_url);
                        });
                        version.innerHTML += ` <span style="color: #ff4d4f;">(有新版本: ${new_version})</span>`;
                    } else {
                        version.innerHTML += ` (已是最新版本)`;
                    }
                } else {
                    version.innerHTML += ` (版本更新检查失败)`;
                    log("版本更新检查失败", response);
                }
            })
            .catch((error) => {
                console.error(error);
            });

    } catch (error) {
        log("[设置页面错误]", error);
    }
}
