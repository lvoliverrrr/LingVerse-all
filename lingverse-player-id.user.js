// ==UserScript==
// @name         灵界 LingVerse 玩家ID显示
// @namespace    lingverse-player-id
// @version      1.2.0
// @description  在主页状态栏和侧边栏显示当前玩家的数字ID，方便添加道友
// @author       LingVerse
// @match        https://ling.muge.info/*
// @match        http://ling.muge.info/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 获取全局窗口对象
    const _win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    /**
     * 更新ID显示 - 桌面版顶部状态栏
     */
    function updateHeaderId() {
        const playerId = getPlayerId();
        if (!playerId) return;

        const headerName = document.getElementById('headerPlayerName');
        if (headerName && !headerName.querySelector('.player-id-tag')) {
            const idTag = document.createElement('span');
            idTag.className = 'player-id-tag';
            idTag.style.cssText = 'font-size:11px;color:var(--text-muted);margin-left:6px;opacity:0.8;';
            idTag.textContent = `(ID:${playerId})`;
            idTag.title = '点击复制ID';
            idTag.style.cursor = 'pointer';
            idTag.onclick = function(e) {
                e.stopPropagation();
                copyToClipboard(playerId);
            };
            headerName.appendChild(idTag);
        }
    }

    /**
     * 更新ID显示 - 侧边栏角色信息区
     */
    function updateSidebarId() {
        const playerId = getPlayerId();
        if (!playerId) return;

        // 在境界行后面添加ID行
        const statRealm = document.getElementById('statRealm');
        if (statRealm) {
            const statRow = statRealm.closest('.stat-row');
            if (statRow && !statRow.nextElementSibling?.classList?.contains('player-id-row')) {
                const idRow = document.createElement('div');
                idRow.className = 'stat-row player-id-row';
                idRow.innerHTML = `
                    <span class="stat-label">ID</span>
                    <span class="stat-value" style="color:var(--text-gold);cursor:pointer;" title="点击复制">${playerId}</span>
                `;
                idRow.querySelector('.stat-value').onclick = () => copyToClipboard(playerId);
                statRow.parentNode.insertBefore(idRow, statRow.nextSibling);
            }
        }
    }

    /**
     * 更新ID显示 - 手机版状态栏
     */
    function updateMobileId() {
        const playerId = getPlayerId();
        if (!playerId) return;

        // 在手机版状态栏添加ID
        const mobileStatusBar = document.getElementById('mobileStatusBar');
        if (mobileStatusBar && !mobileStatusBar.querySelector('.mobile-player-id')) {
            const idItem = document.createElement('span');
            idItem.className = 'msb-item mobile-player-id';
            idItem.innerHTML = `<span class="msb-label">ID</span><span class="msb-value" style="color:var(--text-gold);">${playerId}</span>`;
            idItem.style.cursor = 'pointer';
            idItem.title = '点击复制ID';
            idItem.onclick = (e) => {
                e.stopPropagation();
                copyToClipboard(playerId);
            };
            mobileStatusBar.appendChild(idItem);
        }
    }

    /**
     * 获取玩家ID
     */
    function getPlayerId() {
        if (_win._lastPlayerData) {
            return _win._lastPlayerData.id || _win._lastPlayerData.playerId;
        }
        return localStorage.getItem('playerId');
    }

    /**
     * 复制到剪贴板
     */
    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(String(text)).then(() => {
                showToast('ID已复制: ' + text);
            }).catch(() => fallbackCopy(text));
        } else {
            fallbackCopy(text);
        }
    }

    /**
     * 降级复制方案
     */
    function fallbackCopy(text) {
        const input = document.createElement('input');
        input.value = String(text);
        input.style.cssText = 'position:fixed;opacity:0;';
        document.body.appendChild(input);
        input.select();
        try {
            document.execCommand('copy');
            showToast('ID已复制: ' + text);
        } catch (e) {
            showToast('复制失败，请手动记录: ' + text);
        }
        document.body.removeChild(input);
    }

    /**
     * 显示提示
     */
    function showToast(message) {
        if (_win.showToast) {
            _win.showToast(message);
        } else {
            const toast = document.createElement('div');
            toast.textContent = message;
            toast.style.cssText = 'position:fixed;top:20%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:10px 20px;border-radius:4px;z-index:9999;font-size:14px;';
            document.body.appendChild(toast);
            setTimeout(() => document.body.removeChild(toast), 2000);
        }
    }

    /**
     * 更新所有位置的ID显示
     */
    function updateAllIdDisplays() {
        updateHeaderId();
        updateSidebarId();
        updateMobileId();
    }

    /**
     * 等待游戏加载
     */
    function waitForGame() {
        if (_win.loadPlayerInfo) {
            updateAllIdDisplays();
        } else {
            setTimeout(waitForGame, 500);
        }
    }

    // Hook到游戏的loadPlayerInfo函数
    const originalLoadPlayerInfo = _win.loadPlayerInfo;
    if (originalLoadPlayerInfo) {
        _win.loadPlayerInfo = async function(...args) {
            const result = await originalLoadPlayerInfo.apply(this, args);
            setTimeout(updateAllIdDisplays, 100);
            return result;
        };
    }

    // Hook到游戏的renderPlayerProfileModal函数来显示别人ID
    const originalRenderPlayerProfile = _win.renderPlayerProfileModal;
    if (originalRenderPlayerProfile) {
        _win.renderPlayerProfileModal = function(data) {
            // 先调用原函数渲染
            const result = originalRenderPlayerProfile.apply(this, arguments);
            // 然后添加ID显示
            setTimeout(() => showOthersIdInProfile(data), 50);
            return result;
        };
    }

    /**
     * 在别人资料面板显示ID
     */
    function showOthersIdInProfile(data) {
        if (!data || !data.playerId) return;

        const profileContent = document.getElementById('playerProfileContent');
        if (!profileContent || profileContent.querySelector('.others-id-display')) return;

        const playerId = data.playerId;
        const pfName = profileContent.querySelector('.pf-name');

        if (pfName) {
            const idSpan = document.createElement('span');
            idSpan.className = 'others-id-display';
            idSpan.style.cssText = 'font-size:11px;color:var(--text-muted);margin-left:8px;opacity:0.8;';
            idSpan.innerHTML = `(ID:<span style="color:var(--text-gold);cursor:pointer;" title="点击复制">${playerId}</span>)`;
            idSpan.querySelector('span').onclick = () => copyToClipboard(playerId);
            pfName.appendChild(idSpan);
        }
    }

    // 启动
    waitForGame();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(updateAllIdDisplays, 1000));
    } else {
        setTimeout(updateAllIdDisplays, 1000);
    }

    console.log('[玩家ID显示] 脚本已加载');
})();
