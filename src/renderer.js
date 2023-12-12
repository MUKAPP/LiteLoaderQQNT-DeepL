// 运行在 Electron 渲染进程 下的页面脚本
const plugin_path = LiteLoader.plugins.deepl_plugin.path.plugin;

function log(...args) {
    console.log(`[DeepL]`, ...args);
}

function observeElement2(selector, callback, callbackEnable = true, interval = 100) {
    const timer = setInterval(function () {
        const element = document.querySelector(selector);
        if (element) {
            if (callbackEnable) {
                callback();
                log("已检测到", selector);
            }
            clearInterval(timer);
        }
    }, interval);
}

async function translate(text, target, callback) {
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
}


// 页面加载完成时触发
async function onLoad() {
    observeElement2('#ml-root .ml-list', function () {
        let rightTranslating = false;
        let chatTranslating = false;
        let messageEl;
        let appended = true;

        // -- 右键翻译 -- //
        function getMessageElement(target) {
            if (target.matches('.msg-content-container')) {
                return target;
            }
            return target.closest('.msg-content-container');
        }

        // 监听右键点击 
        document.querySelector('#ml-root .ml-list').addEventListener('mouseup', e => {
            // 获取被点击的消息元素
            messageEl = getMessageElement(e.target);
            log('右键点击消息', messageEl);
            appended = false;
        });

        new MutationObserver(() => {
            const qContextMenu = document.querySelector("#qContextMenu");
            log('右键菜单弹出', messageEl);
            if (appended) {
                return;
            }
            if (qContextMenu && messageEl) {
                // 获取messageEl的子元素message-content的文本
                log(messageEl.querySelector(".message-content").innerText);
                if (!messageEl.querySelector(".message-content").innerText) {
                    return;
                }
                const tempEl = document.createElement("div");
                tempEl.innerHTML = document.querySelector("#qContextMenu [aria-disabled='false']").outerHTML.replace(/<!---->/g, "");
                const item = tempEl.firstChild;
                item.id = "deepl-translate";
                if (item.querySelector(".q-icon")) {
                    item.querySelector(".q-icon").innerHTML = `
                                    <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802"></path>
                                    </svg>`;
                }
                if (messageEl.querySelector("#deepl-divider")) {
                    // 如果已经翻译过则设置菜单项为“撤销翻译”
                    if (item.className.includes("q-context-menu-item__text")) {
                        item.innerText = "撤销翻译";
                    } else {
                        item.querySelector(".q-context-menu-item__text").innerText = "撤销翻译";
                    }
                    item.addEventListener("click", async () => {
                        qContextMenu.remove();
                        // 获取messageEl的子元素（message-content）
                        const messageContent = messageEl.querySelector(".message-content");
                        // 删除deepl-divider
                        messageContent.removeChild(messageEl.querySelector("#deepl-divider"));
                        // 删除deepl-result
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
                        // 获取设置中的host
                        const needTransText = messageEl.innerText;
                        // 获取messageEl的子元素（message-content）
                        const messageContent = messageEl.querySelector(".message-content");
                        // 在messageContent的最后插入一条分割线
                        messageContent.insertAdjacentHTML("beforeend", `<div id="deepl-divider" style="height: 4px;width: auto;margin-top: 8px;margin-bottom: 8px;border-radius: 2px;margin-left: 30%;margin-right: 30%;"></div>`);
                        // 然后插入span class="text-element"，在这个span中插入正在翻译...
                        messageContent.insertAdjacentHTML("beforeend", `<span id="deepl-result" class='text-element'>正在翻译...</span>`);

                        rightTranslating = true;
                        // 调用translate函数，传入需要翻译的文本、目标语言，然后获取翻译结果
                        // 读取右键翻译的目标语言
                        const settings = await deepl_plugin.getSettings();
                        const targetLang = settings.rightTargetLang;
                        translate(needTransText, targetLang, function (data) {
                            rightTranslating = false;
                            // 如果code为200
                            if (data.code === 200) {
                                // 获取翻译结果
                                const result = data.data;
                                // 如果翻译结果不为空
                                if (result) {
                                    // 获取messageContent里的deepl-result，把里面的内容替换为span class="text-normal"，显示翻译结果
                                    messageContent.querySelector("#deepl-result").innerHTML = `<span class="text-normal"></span>`;
                                    // 获取messageContent里的deepl-result的text-normal，把里面的内容替换为翻译结果
                                    messageContent.querySelector("#deepl-result .text-normal").innerText = result;
                                    return;
                                }
                            }
                            // 如果翻译失败，获取messageContent里的deepl-result，把里面的内容替换为翻译失败
                            messageContent.querySelector("#deepl-result").innerText = `翻译失败` + data;
                        });
                    });
                }
                qContextMenu.appendChild(item);
                appended = true;
            }

        }).observe(document.querySelector("body"), { childList: true });




        // -- 消息栏翻译 -- //
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
        document.body.appendChild(translationResult);

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
            background-color: var(--bg_bottom_standard);
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

        var chatBox = document.querySelector('.ck-editor__main');

        // 获取翻译结果div元素
        // var translationResult = document.querySelector('#translation-result');

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

        // 将翻译结果div元素添加到聊天框上方
        chatBox.parentNode.insertBefore(translationResult, chatBox);

        // 获取复制按钮元素
        var copyButton = document.querySelector('#copy-button');

        // 获取取消按钮元素
        var cancelButton = document.querySelector('#cancel-button');

        // 获取翻译文本元素
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

        observeElement2(".chat-func-bar", function () {
            // 获取消息栏的左侧图标区域（就是chat-func-bar的第一个子元素）
            const iconBarLeft = document.querySelector(".chat-func-bar").firstElementChild;
            const iconHtml = `
        <div class="bar-icon" data-v-330c8721="">
            <div class="q-tooltips" data-v-330c8721="">
                <div data-v-330c8721="">
                    <div id="deepl-bar-icon" class="icon-item" data-v-681df9e4="" data-v-330c8721="" bf-toolbar-item="" role="button" tabindex="-1" aria-label="翻译" style="--hover-color: var(--brand_standard);">
                        <i class="q-icon" data-v-717ec976="" data-v-681df9e4="" style="--b4589f60: var(--icon_primary); --6ef2e80d: 24px;">
                            <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802"></path>
                            </svg>
                        </i>
                    </div>
                </div>
                <div class="q-tooltips__content q-tooltips__bottom" style="">翻译</div>
            </div>
        </div>`
            // 在iconBarLeft的最后插入上面的html
            iconBarLeft.insertAdjacentHTML("beforeend", iconHtml);
            // 获取barIcon
            const barIcon = document.querySelector("#deepl-bar-icon");

            // 给barIcon添加点击事件
            barIcon.addEventListener("click", async () => {
                if (chatTranslating) {
                    return;
                }
                // 显示翻译结果div元素
                showTranslationResult();
                translationText.innerText = "翻译中...";

                const content = document.querySelector('.ck-editor__editable');

                const text = content.innerText;
                // 读取聊天框翻译的目标语言
                const settings = await deepl_plugin.getSettings();
                const targetLanguage = settings.chatTargetLang;
                // 调用translate函数，传入需要翻译的文本、目标语言，然后获取翻译结果
                translate(text, targetLanguage, function (json) {
                    if (json.code === 200) {
                        const result = json.data;
                        if (result) {
                            // 设置翻译文本
                            translationText.innerText = result;
                            return;
                        }
                    }
                    translationText.innerText = "翻译失败";
                });

            });
        });


    });

}


// 打开设置界面时触发
async function onConfigView(view) {
    const css_file_path = `llqqnt://local-file/${plugin_path}/src/settings.css`;
    const html_file_path = `llqqnt://local-file/${plugin_path}/src/settings.html`;

    // CSS
    const link_element = document.createElement("link");
    link_element.rel = "stylesheet";
    link_element.href = css_file_path;
    document.head.appendChild(link_element);

    // HTMl
    const html_text = await (await fetch(html_file_path)).text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html_text, "text/html");
    doc.querySelectorAll("section").forEach(node => view.appendChild(node));

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
        // JS弹出对话框提示已恢复默认 API
        alert("已恢复默认 API");
    });

    apply.addEventListener("click", () => {
        settings.host = api_input.value;
        deepl_plugin.setSettings(settings);
        // JS弹出对话框提示已应用新 API
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

}


// 这两个函数都是可选的
export {
    onLoad,
    onConfigView
}