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
        log("翻译", text, "为", target);
        const settings = await deepl_plugin.getSettings();
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
    } catch (error) {
        log("[翻译错误]", error);
        callback({
            code: -1,
            message: error.message
        });
    }
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
                item.querySelector(".q-icon").innerHTML = `
                                    <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802"></path>
                                    </svg>`;
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
    const style = document.createElement("style");
    style.innerHTML = `
        #deepl-divider {
            background: #00000021;
        }
        
        .translation-title {
            font-size: 16px;
            margin-right: 16px;
        }

        #translation-result {
            position: absolute;
            top: 0;
            left: 0;
            width: auto;
            background-color: var(--bg_bottom_light);
            padding: 16px;
            display: none;
            border-radius: 8px;
            margin: 8px 16px;
            box-shadow: 0 4px 12px 0px #00000021;
            z-index: 9999;
        }
        
        #translation-text {
            font-size: 14px;
            margin-top: 8px;
        }

        .translate-bar {
            width: auto;
            display: flex;
            text-align: right;
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
        }`;
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

    const icon = `<svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802"></path>
</svg>`

    observeElement(".chat-func-bar", function () {
        // 获取消息栏的左侧的第一个图标
        const iconBarLeft = document.querySelector(".chat-func-bar").firstElementChild;

        // 判断是否已经添加过 deepl-bar-icon
        if (iconBarLeft.querySelector("#deepl-bar-icon")) {
            return;
        }

        // 复制 iconBarLeft 的第一个子元素
        const barIcon = iconBarLeft.firstElementChild.cloneNode(true);
        // 替换 id
        barIcon.querySelector("#id-func-bar-expression").id = "deepl-bar-icon";
        // 替换图标
        barIcon.querySelector("svg").outerHTML = icon;
        // 设置 aria-label
        barIcon.querySelector("#deepl-bar-icon").setAttribute("aria-label", "翻译");
        // 添加到 iconBarLeft
        iconBarLeft.appendChild(barIcon);

        // 给 barIcon 添加点击事件
        barIcon.addEventListener("click", async () => {
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
    }, true); // 点击群助手后 chat-func-bar 会消失，再点群聊才会出现，所以需要持续监听

});

// 打开设置界面时触发
export const onSettingWindowCreated = async view => {
    try {
        const html_file_path = `local:///${plugin_path}/src/settings.html`;

        view.innerHTML = await (await fetch(html_file_path)).text();

        // 添加插件图标
        document.querySelectorAll(".nav-item.liteloader").forEach((node) => {
            // 本插件图标
            if (node.textContent === "DeepL") {
                node.querySelector(".q-icon").innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" stroke="currentColor" fill="currentColor"><path d="m584.922-222.001-38.231 103.154q-3.231 8.307-10.731 13.576-7.5 5.27-16.807 5.27-15.384 0-24.615-12.654-9.231-12.654-3.154-27.653l155.462-401.231q3.846-8.307 11.154-13.384Q665.307-560 674.23-560h22.307q8.923 0 16.23 5.077 7.308 5.077 11.154 13.384l155.462 401.846q6.077 14.384-2.846 27.038t-24.307 12.654q-9.923 0-17.115-5.27-7.193-5.269-11.039-14.192l-38.231-102.538H584.922ZM359.307-416.386 181.461-238.77q-8.307 8.692-20.576 9-12.269.307-21.577-9-8.692-8.692-8.692-21.076 0-12.385 8.692-21.077l177.847-178.231q-34.616-35-65.808-83.077-31.193-48.077-51.346-97.769h63.614q17.307 36.307 42.115 72.616 24.808 36.308 53.577 66.077 42.617-43 80.617-104.424 38-61.423 53.692-114.269H97.694q-12.77 0-21.385-8.615-8.615-8.615-8.615-21.384t8.615-21.384q8.616-8.616 21.385-8.616H330v-34.615q0-12.768 8.615-21.384 8.615-8.615 21.384-8.615t21.384 8.615q8.615 8.616 8.615 21.384v34.615h232.307q12.769 0 21.384 8.616 8.616 8.615 8.616 21.384t-8.616 21.384Q635.075-720 622.306-720h-67.922q-19.462 67.384-62.038 140.884-42.577 73.5-90.886 121.193l98.693 101.077-22.692 61.614-118.154-121.154Zm244.845 141.309h162.463l-81.231-218.232-81.232 218.232Z"/></svg>`;
            }
        });

        // 获取设置
        const settings = await deepl_plugin.getSettings();

        const api_input = view.querySelector(".deepl_plugin .api-input");
        const reset = view.querySelector(".deepl_plugin .reset");
        const apply = view.querySelector(".deepl_plugin .apply");

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

    } catch (error) {
        log("[设置页面错误]", error);
    }
}
