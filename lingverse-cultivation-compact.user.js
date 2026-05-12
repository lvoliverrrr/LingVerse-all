// ==UserScript==
// @name         灵界 LingVerse 修为简写显示
// @namespace    lingverse-cultivation-compact
// @version      1.0.1
// @description  修为数值简写显示
// @author       LingVerse
// @match        https://ling.muge.info/*
// @match        http://ling.muge.info/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const _win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    /**
     * 将数值简化为中文单位（万/亿）
     * @param {number} num - 原始数值
     * @returns {string} - 简写后的字符串
     */
    function formatCompactChinese(num) {
        if (num === null || num === undefined || isNaN(num)) return '0';
        num = Number(num);
        if (num < 10000) return String(num);
        if (num < 100000000) {
            // 万级
            const wan = (num / 10000).toFixed(1);
            return wan.replace(/\.0$/, '') + '万';
        }
        // 亿级
        const yi = (num / 100000000).toFixed(2);
        return yi.replace(/\.00$/, '').replace(/0$/, '') + '亿';
    }

    /**
     * 更新修为显示
     */
    function updateCultivationDisplay() {
        if (!_win._lastPlayerData) return;

        const p = _win._lastPlayerData;
        const cultivation = p.cultivation || 0;
        const cultivationNeeded = p.cultivationNeeded || 1;

        // 只在手机端或数值较大时启用简写
        const isMobile = window.innerWidth <= 768 || document.getElementById('mobileStatusBar');

        const statCultivation = document.getElementById('statCultivation');
        if (statCultivation) {
            if (isMobile || cultivation >= 10000000) {
                // 使用简写格式
                const currentText = formatCompactChinese(cultivation);
                const neededText = formatCompactChinese(cultivationNeeded);
                statCultivation.textContent = currentText + ' / ' + neededText;
                statCultivation.title = cultivation.toLocaleString() + ' / ' + cultivationNeeded.toLocaleString();
            }
        }
    }

    /**
     * Hook游戏的_doLoadPlayerInfo函数
     * 这是游戏更新玩家数据的核心函数
     */
    function hookPlayerInfoUpdate() {
        // 等待游戏脚本加载完成
        const checkAndHook = () => {
            if (typeof _win._doLoadPlayerInfo === 'function' && !_win._doLoadPlayerInfo._hooked) {
                const originalFn = _win._doLoadPlayerInfo;

                _win._doLoadPlayerInfo = async function(force, detail) {
                    // 调用原函数
                    const result = await originalFn.apply(this, arguments);

                    // 原函数执行完成后，更新修为显示
                    // 使用setTimeout确保DOM已更新
                    setTimeout(updateCultivationDisplay, 0);

                    return result;
                };

                _win._doLoadPlayerInfo._hooked = true;
                console.log('[修为简写] 已Hook _doLoadPlayerInfo');

                // 立即执行一次更新
                updateCultivationDisplay();

                return true;
            }
            return false;
        };

        // 立即尝试
        if (checkAndHook()) return;

        // 如果还没加载，等待一段时间再试
        const interval = setInterval(() => {
            if (checkAndHook()) {
                clearInterval(interval);
            }
        }, 100);

        // 最多等待10秒
        setTimeout(() => clearInterval(interval), 10000);
    }

    /**
     * 添加CSS样式
     */
    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* 修为简写样式 */
            #statCultivation {
                font-size: 13px !important;
                letter-spacing: -0.3px;
            }
            @media (max-width: 768px) {
                #statCultivation {
                    font-size: 12px !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // 初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            addStyles();
            hookPlayerInfoUpdate();
        });
    } else {
        addStyles();
        hookPlayerInfoUpdate();
    }

    // 监听窗口大小变化（切换手机/桌面模式时重新判断）
    window.addEventListener('resize', updateCultivationDisplay);

    console.log('[修为简写] 脚本已加载');
})();
