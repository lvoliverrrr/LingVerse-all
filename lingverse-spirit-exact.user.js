// ==UserScript==
// @name         灵界 LingVerse 神识精确数值显示
// @namespace    lingverse-spirit-exact
// @version      1.0.1
// @description  将主页状态栏的神识百分比改回准确数值，使用神识时实时更新
// @author       LingVerse
// @match        https://ling.muge.info/*
// @match        http://ling.muge.info/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 获取全局窗口对象，兼容Tampermonkey等用户脚本环境
    const _win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    /**
     * 更新神识显示，将百分比改为具体数值
     */
    function updateSpiritDisplay() {
        // 更新状态栏中的神识显示
        const statSpirit = document.getElementById('statSpirit');
        if (statSpirit && _win._lastPlayerData) {
            const p = _win._lastPlayerData;
            const spirit = p.spirit || 0;
            const maxSpirit = p.maxSpirit || 1;

            let spiritText = spirit + '/' + maxSpirit;

            // 保持原有的图标元素
            const existingIcon = statSpirit.querySelector('i');
            statSpirit.innerHTML = spiritText;
            if (existingIcon) {
                statSpirit.appendChild(existingIcon);
            }

            statSpirit.title = '神识: ' + spirit + '/' + maxSpirit;
        }

        // 更新主界面中的神识显示
        const msbSpirit = document.getElementById('msbSpirit');
        if (msbSpirit && _win._lastPlayerData) {
            const p = _win._lastPlayerData;
            const spirit = p.spirit || 0;
            const maxSpirit = p.maxSpirit || 1;
            msbSpirit.textContent = spirit + '/' + maxSpirit;
            msbSpirit.title = '神识: ' + spirit + '/' + maxSpirit;
        }
    }

    // Hook到游戏的loadPlayerInfo函数，确保每次更新玩家数据时都更新神识显示
    const originalLoadPlayerInfo = _win.loadPlayerInfo;
    if (originalLoadPlayerInfo) {
        _win.loadPlayerInfo = async function(...args) {
            const result = await originalLoadPlayerInfo.apply(this, args);
            setTimeout(updateSpiritDisplay, 0);
            return result;
        };
    }

    // 记录上一次的神识值，用于检测变化
    let lastSpirit = null;
    let lastMaxSpirit = null;

    /**
     * 持续监测神识数值变化，如有变化则更新显示
     */
    function checkSpiritChange() {
        if (_win._lastPlayerData) {
            const p = _win._lastPlayerData;
            const currentSpirit = p.spirit;
            const currentMaxSpirit = p.maxSpirit;

            // 如果神识值或最大神识值发生变化，则更新显示
            if (currentSpirit !== lastSpirit || currentMaxSpirit !== lastMaxSpirit) {
                lastSpirit = currentSpirit;
                lastMaxSpirit = currentMaxSpirit;
                updateSpiritDisplay();
            }
        }
        // 使用requestAnimationFrame持续监测
        requestAnimationFrame(checkSpiritChange);
    }

    // 启动神识变化监测
    checkSpiritChange();

    // 页面加载完成后立即更新神识显示
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateSpiritDisplay);
    } else {
        updateSpiritDisplay();
    }

    console.log('[神识精确数值] 脚本已加载');
})();