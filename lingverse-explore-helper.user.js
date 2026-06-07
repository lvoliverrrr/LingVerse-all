// ==UserScript==
// @name         灵界 LingVerse 自动开藏宝图
// @namespace    lingverse-auto-map
// @version      2.8.0
// @description  自动开启背包中的藏宝图，并提供冥想-探索挂机循环和自动商人处理
// @author       LingVerse
// @match        https://ling.muge.info/*
// @match        http://ling.muge.info/*
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 获取全局窗口对象，兼容Tampermonkey等用户脚本环境
    const _win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    // 选择器简写函数
    const $ = (sel) => document.querySelector(sel);
    // 延迟函数
    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    // 配置对象
    const CONFIG = {
        openInterval: 3000,        // 开启藏宝图基础间隔
        openIntervalRandom: 500,   // 间隔随机范围（±ms）
        maxMapsPerBatch: 50,       // 每批最大开启数量
        batchSize: 10,             // 批量处理大小
        stopOnBattle: true,        // 遇到战斗时是否停止
        guardian: {                // 护道者相关配置
            enabled: true,         // 是否启用自动雇护道
            maxFee: 0,             // 最高雇佣费（0表示不限）
            minAtk: 0,             // 最低攻击力要求
            mode: 'together',      // 战斗模式（together或alone）
            priority: 'incarnation,normal,body', // 雇佣优先级
            threatLevel: 'danger'  // 威胁等级阈值：danger(危险/强敌/越阶)、warn(警告/略强/高层压制)、neutral(势均力敌)、safe(可稳战)、none(不判断)
        },
        merchant: {                 // 云游商人相关配置
            enabled: true,          // 自动探索遇到商人时自动购买
            onlyAutoExplore: true,  // 只处理自动探索挂起的商人，避免手动购物被抢单
            buyDelay: 800           // 遇到商人后延迟购买，给原页面完成渲染
        },
        afkLoop: {                   // 冥想-探索挂机循环配置
            enabled: false,          // 默认不自动接管，需要用户在面板启动
            meditationMinutes: 140,  // 默认2小时20分钟
            minSpirit: 20,           // 神识低于该值进入冥想
            exploreMultiplier: 1,    // 低风险默认1倍，富裕模式可手动调高
            tickInterval: 30000,     // 循环检查间隔
            stallTimeoutSeconds: 90, // 自动探索超过该时间无进展则回冥想
            autoRevive: false,       // 复活会花资源，默认关闭
            useTalismans: false,     // 战斗符箓消耗品，默认关闭
            useNirvanaPill: false    // 涅槃重生丹消耗品，默认关闭
        }
    };

    /**
     * 获取随机间隔时间
     * @param {number} baseInterval - 基础间隔
     * @param {number} randomRange - 随机范围
     * @returns {number} 随机后的间隔时间
     */
    function getRandomInterval(baseInterval, randomRange) {
        const min = baseInterval - randomRange;
        const max = baseInterval + randomRange;
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // 从localStorage加载保存的配置
    const saved = localStorage.getItem('lingverse_auto_map_config');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            Object.assign(CONFIG, parsed);
        } catch (e) {}
    }
    CONFIG.guardian = Object.assign({
        enabled: true,
        maxFee: 0,
        minAtk: 0,
        mode: 'together',
        priority: 'incarnation,normal,body',
        threatLevel: 'danger'
    }, CONFIG.guardian || {});
    CONFIG.merchant = Object.assign({
        enabled: true,
        onlyAutoExplore: true,
        buyDelay: 800
    }, CONFIG.merchant || {});
    CONFIG.afkLoop = Object.assign({
        enabled: false,
        meditationMinutes: 140,
        minSpirit: 20,
        exploreMultiplier: 1,
        tickInterval: 30000,
        stallTimeoutSeconds: 90,
        autoRevive: false,
        useTalismans: false,
        useNirvanaPill: false
    }, CONFIG.afkLoop || {});

    function saveConfig() {
        localStorage.setItem('lingverse_auto_map_config', JSON.stringify(CONFIG));
    }

    function parseMerchantPrice(value) {
        if (typeof value === 'number' && isFinite(value)) return value;
        const normalized = String(value || '').replace(/[^\d.]/g, '');
        const parsed = Number(normalized);
        return isFinite(parsed) ? parsed : 0;
    }

    function selectMerchantItem(items) {
        if (!Array.isArray(items)) return null;
        let selected = null;
        let selectedPrice = 0;
        items.forEach(item => {
            const price = parseMerchantPrice(item && item.price);
            if (price > selectedPrice) {
                selected = item;
                selectedPrice = price;
            }
        });
        return selected;
    }

    function resolveApiObject() {
        let apiObj = null;
        try {
            apiObj = typeof api !== 'undefined' ? api : null;
        } catch (e) {}
        if (!apiObj) {
            apiObj = window.api || _win.api || null;
        }
        if (!apiObj && typeof _win.eval === 'function') {
            try {
                apiObj = _win.eval('typeof api !== "undefined" ? api : null');
            } catch (e) {}
        }
        return apiObj;
    }

    function toFiniteNumber(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function clampNumber(value, min, max, fallback) {
        let parsed = toFiniteNumber(value, fallback);
        if (parsed < min) parsed = min;
        if (parsed > max) parsed = max;
        return parsed;
    }

    function normalizeAfkLoopConfig(config) {
        const cfg = Object.assign({}, CONFIG.afkLoop, config || {});
        cfg.enabled = !!cfg.enabled;
        cfg.meditationMinutes = clampNumber(cfg.meditationMinutes, 1, 720, 140);
        cfg.minSpirit = clampNumber(cfg.minSpirit, 0, 100000000, 20);
        cfg.exploreMultiplier = clampNumber(cfg.exploreMultiplier, 1, 50, 1);
        cfg.tickInterval = clampNumber(cfg.tickInterval, 5000, 300000, 30000);
        cfg.stallTimeoutSeconds = clampNumber(cfg.stallTimeoutSeconds, 0, 3600, 90);
        cfg.autoRevive = !!cfg.autoRevive;
        cfg.useTalismans = !!cfg.useTalismans;
        cfg.useNirvanaPill = !!cfg.useNirvanaPill;
        return cfg;
    }

    function getMeditationElapsedMs(state, now) {
        if (!state) return 0;
        const durationSeconds = toFiniteNumber(state.meditationDurationSeconds, NaN);
        if (Number.isFinite(durationSeconds) && durationSeconds >= 0) {
            return durationSeconds * 1000;
        }
        const startedAt = toFiniteNumber(state.meditationStartedAt, NaN);
        if (Number.isFinite(startedAt) && startedAt > 0) {
            return Math.max(0, now - startedAt);
        }
        return 0;
    }

    function decideAfkNextAction(state, config, now) {
        const cfg = normalizeAfkLoopConfig(config);
        const snapshot = state || {};
        const currentTime = Number.isFinite(Number(now)) ? Number(now) : Date.now();

        if (!cfg.enabled) {
            return { action: 'idle', reason: 'disabled' };
        }
        if (snapshot.merchantActive) {
            return { action: 'wait', reason: 'merchant-active' };
        }
        if (snapshot.encounterActive || snapshot.combatActive) {
            return { action: 'wait', reason: 'encounter-active' };
        }
        if (snapshot.isDead) {
            return cfg.autoRevive
                ? { action: 'revive', reason: 'dead-auto-revive-enabled' }
                : { action: 'wait', reason: 'dead' };
        }

        const spirit = Math.max(0, toFiniteNumber(snapshot.spirit, 0));
        const maxSpirit = Math.max(0, toFiniteNumber(snapshot.maxSpirit, 0));
        const spiritCost = Math.max(1, toFiniteNumber(snapshot.spiritCost, 1));

        if (snapshot.isMeditating) {
            if (maxSpirit > 0 && spirit >= maxSpirit) {
                return { action: 'stopMeditation', reason: 'spirit-full' };
            }
            const elapsedMs = getMeditationElapsedMs(snapshot, currentTime);
            if (elapsedMs >= cfg.meditationMinutes * 60 * 1000) {
                return { action: 'stopMeditation', reason: 'meditation-duration-reached' };
            }
            return { action: 'wait', reason: 'meditating' };
        }

        if (snapshot.autoExploreRunning || snapshot.autoExplorePending) {
            if (snapshot.exploreStalled) {
                return { action: 'startMeditation', reason: 'explore-stalled' };
            }
            return { action: 'wait', reason: 'auto-explore-running' };
        }

        if (snapshot.exploreStalled) {
            return { action: 'startMeditation', reason: 'explore-stalled' };
        }

        if (snapshot.canExplore === false) {
            const disabledReason = String(snapshot.exploreDisabledReason || '');
            if (disabledReason.indexOf('神识') >= 0 || disabledReason.indexOf('体力') >= 0) {
                return { action: 'startMeditation', reason: 'explore-disabled-no-spirit' };
            }
            return { action: 'wait', reason: 'explore-disabled' };
        }

        if (spirit < cfg.minSpirit || spirit < spiritCost) {
            return { action: 'startMeditation', reason: 'spirit-below-threshold' };
        }

        return { action: 'startAutoExplore', reason: 'spirit-ready' };
    }

    _win.LingVerseAutoMapTestHooks = Object.assign({}, _win.LingVerseAutoMapTestHooks, {
        parseMerchantPrice,
        selectMerchantItem,
        resolveApiObject,
        normalizeAfkLoopConfig,
        decideAfkNextAction
    });

    // 状态对象
    const STATE = {
        running: false,            // 脚本是否正在运行
        isOpeningMap: false,       // 是否正在开图
        stats: {                   // 当前会话统计
            mapsOpened: 0,         // 已开启的地图数
            battlesEncountered: 0, // 遇到的战斗数
            guardianHired: 0,      // 雇佣护道者次数
            rewards: []            // 获得的奖励
        }
    };

    // 总体统计数据（精简版，不保存详细历史）
    const TOTAL_STATS = {
        totalMapsOpened: 0,        // 总开启地图数
        totalBattles: 0,           // 总遇敌数
        totalGuardianHired: 0,     // 总雇护道数
        totalRewards: {}           // 总获得奖励
    };

    // 从localStorage加载保存的统计数据
    const savedStats = localStorage.getItem('lingverse_auto_map_total_stats_v2');
    if (savedStats) {
        try {
            const parsed = JSON.parse(savedStats);
            // 只加载需要的字段
            TOTAL_STATS.totalMapsOpened = parsed.totalMapsOpened || 0;
            TOTAL_STATS.totalBattles = parsed.totalBattles || 0;
            TOTAL_STATS.totalGuardianHired = parsed.totalGuardianHired || 0;
            TOTAL_STATS.totalRewards = parsed.totalRewards || {};
        } catch (e) {}
    } else {
        // 尝试从旧版本迁移数据
        const oldStats = localStorage.getItem('lingverse_auto_map_total_stats');
        if (oldStats) {
            try {
                const parsed = JSON.parse(oldStats);
                TOTAL_STATS.totalMapsOpened = parsed.totalMapsOpened || 0;
                TOTAL_STATS.totalBattles = parsed.totalBattles || 0;
                TOTAL_STATS.totalGuardianHired = parsed.totalGuardianHired || 0;
                TOTAL_STATS.totalRewards = parsed.totalRewards || {};
                // 删除旧数据
                localStorage.removeItem('lingverse_auto_map_total_stats');
                // 保存为新格式
                localStorage.setItem('lingverse_auto_map_total_stats_v2', JSON.stringify(TOTAL_STATS));
            } catch (e) {}
        }
    }

    // API接口封装
    const API = {
        /**
         * 获取API对象
         */
        getApiObj() {
            const apiObj = resolveApiObject();
            if (!apiObj) {
                throw new Error('API对象不可用');
            }
            return apiObj;
        },

        /**
         * 获取背包信息
         */
        async getInventory() {
            const apiObj = this.getApiObj();
            return await apiObj.get('/api/game/inventory');
        },

        /**
         * 获取玩家信息
         */
        async getPlayerInfo() {
            const apiObj = this.getApiObj();
            return await apiObj.get('/api/player/info');
        },

        /**
         * 获取冥想状态
         */
        async getMeditationStatus() {
            const apiObj = this.getApiObj();
            return await apiObj.get('/api/game/meditate/status');
        },

        /**
         * 开始冥想
         */
        async startMeditation() {
            const apiObj = this.getApiObj();
            return await apiObj.post('/api/game/meditate/start');
        },

        /**
         * 结束冥想
         */
        async stopMeditation() {
            const apiObj = this.getApiObj();
            return await apiObj.post('/api/game/meditate/stop');
        },

        /**
         * 使用藏宝图
         * @param {string} itemId - 物品ID
         * @param {number} quantity - 数量
         */
        async useTreasureMap(itemId, quantity = 1) {
            const apiObj = this.getApiObj();
            const body = { itemId: itemId };
            if (quantity > 1) body.quantity = quantity;
            return await apiObj.post('/api/game/use-item', body);
        },

        /**
         * 获取护道者列表
         */
        async getGuardianList() {
            const apiObj = this.getApiObj();
            return await apiObj.get('/api/game/guardian/list');
        },

        /**
         * 雇佣护道者
         * @param {string} guardianId - 护道者ID
         */
        async hireGuardian(guardianId) {
            const apiObj = this.getApiObj();
            return await apiObj.post('/api/game/guardian/hire', { guardianId });
        },

        /**
         * 自动雇佣护道者
         * @param {Object} config - 雇佣配置
         */
        async autoHireGuardian(config) {
            const apiObj = this.getApiObj();
            return await apiObj.post('/api/game/encounter-auto-hire', config);
        },

        /**
         * 选择战斗（迎战）
         */
        async combatChoice(choice) {
            const apiObj = this.getApiObj();
            return await apiObj.post('/api/game/combat-choice', { choice });
        },

        /**
         * 获取当前云游商人
         */
        async getMerchant() {
            const apiObj = this.getApiObj();
            return await apiObj.get('/api/game/merchant');
        },

        /**
         * 购买云游商人商品
         */
        async buyMerchantItem(index) {
            const apiObj = this.getApiObj();
            return await apiObj.post('/api/game/merchant/buy', { index });
        },

        /**
         * 灵石复活
         */
        async revive() {
            const apiObj = this.getApiObj();
            return await apiObj.post('/api/game/revive');
        }
    };

    // 日志管理器
    const Logger = {
        /**
         * 记录日志
         * @param {string} msg - 日志消息
         * @param {string} type - 日志类型
         */
        log(msg, type = 'info') {
            const time = new Date().toLocaleTimeString();
            const prefix = `[自动开图 ${time}]`;
            console.log(`${prefix} ${msg}`);
            
            const logEl = $('#am-log-content');
            if (logEl) {
                const color = type === 'error' ? '#ff6b6b' : type === 'success' ? '#3dab97' : type === 'warning' ? '#f59e0b' : '#94a3b8';
                logEl.innerHTML += `<div style="color:${color};margin:2px 0;font-size:12px;">${msg}</div>`;
                logEl.scrollTop = logEl.scrollHeight;
            }
        },
        info(msg) { this.log(msg, 'info'); },
        success(msg) { this.log(msg, 'success'); },
        warn(msg) { this.log(msg, 'warning'); },
        error(msg) { this.log(msg, 'error'); }
    };

    function readAfkLoopConfigFromUI() {
        const cfg = CONFIG.afkLoop;
        cfg.enabled = $('#am-afk-enabled')?.checked ?? cfg.enabled;
        cfg.meditationMinutes = clampNumber($('#am-afk-meditation-minutes')?.value, 1, 720, cfg.meditationMinutes || 140);
        cfg.minSpirit = clampNumber($('#am-afk-min-spirit')?.value, 0, 100000000, cfg.minSpirit || 20);
        cfg.exploreMultiplier = clampNumber($('#am-afk-explore-multiplier')?.value, 1, 50, cfg.exploreMultiplier || 1);
        cfg.tickInterval = clampNumber($('#am-afk-tick-interval')?.value, 5000, 300000, cfg.tickInterval || 30000);
        cfg.stallTimeoutSeconds = clampNumber($('#am-afk-stall-timeout')?.value, 0, 3600, cfg.stallTimeoutSeconds || 90);
        cfg.autoRevive = $('#am-afk-auto-revive')?.checked ?? cfg.autoRevive;
        cfg.useTalismans = $('#am-afk-use-talismans')?.checked ?? cfg.useTalismans;
        cfg.useNirvanaPill = $('#am-afk-use-nirvana')?.checked ?? cfg.useNirvanaPill;
        CONFIG.afkLoop = normalizeAfkLoopConfig(cfg);
        return CONFIG.afkLoop;
    }

    // 统计管理器
    const StatsManager = {
        /**
         * 保存统计数据到localStorage
         */
        save() {
            localStorage.setItem('lingverse_auto_map_total_stats_v2', JSON.stringify(TOTAL_STATS));
        },
        
        /**
         * 添加奖励记录
         * @param {string} rewardText - 奖励文本
         */
        addReward(rewardText) {
            if (!rewardText) return;
            const items = rewardText.split(/[,，]/);
            items.forEach(item => {
                const match = item.trim().match(/(.+?)\s*x\s*(\d+)/);
                if (match) {
                    const name = match[1].trim();
                    const count = parseInt(match[2]) || 1;
                    TOTAL_STATS.totalRewards[name] = (TOTAL_STATS.totalRewards[name] || 0) + count;
                }
            });
            this.save();
        },
        
        /**
         * 记录会话统计（仅累计，不保存详细历史）
         * @param {Object} sessionStats - 会话统计数据
         */
        recordSession(sessionStats) {
            // 只累计奖励，不保存详细历史记录
            if (sessionStats.rewards && sessionStats.rewards.length > 0) {
                sessionStats.rewards.forEach(r => this.addReward(r));
            }
            this.save();
        },
        
        /**
         * 获取最高奖励列表
         * @param {number} limit - 限制数量
         */
        getTopRewards(limit = 5) {
            return Object.entries(TOTAL_STATS.totalRewards)
                .sort((a, b) => b[1] - a[1])
                .slice(0, limit);
        },

    };

    // 主题相关工具
    const Theme = {
        /**
         * 检测是否为暗色主题
         */
        isDark() {
            const html = document.documentElement;
            if (html.classList.contains('theme-dark')) return true;
            if (html.classList.contains('theme-light')) return false;
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
    };

    // UI界面管理器
    const UI = {
        /**
         * 初始化UI界面
         */
        init() {
            this.createPanel();
            this.createSidebarButton();
            this.applyStyles();
            this.updateTotalStats();
        },

        /**
         * 创建主面板
         */
        createPanel() {
            if ($('#am-panel')) return;

            const isDark = Theme.isDark();
            const bg = isDark ? '#252b3a' : '#fafbfc';
            const text = isDark ? '#e2e8f0' : '#1e293b';
            const border = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.2)';

            const panel = document.createElement('div');
            panel.id = 'am-panel';
            panel.style.cssText = `
                position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
                width:360px;height:600px;max-height:85vh;background:${bg};border:1px solid ${border};
                border-radius:12px;padding:15px;z-index:99999;display:none;
                flex-direction:column;gap:10px;font-family:system-ui,sans-serif;
                box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;
            `;

            panel.innerHTML = `
                <div id="am-header" style="display:flex;justify-content:space-between;align-items:center;cursor:move;-webkit-user-select:none;user-select:none;flex-shrink:0;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <h3 style="margin:0;color:${text};font-size:16px;">自动开藏宝图</h3>
                        <span id="am-status-indicator" style="display:none;width:8px;height:8px;background:#3dab97;border-radius:50%;animation:pulse 1.5s infinite;"></span>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button id="am-minimize" style="background:transparent;border:1px solid ${border};color:${text};width:28px;height:28px;border-radius:4px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;">−</button>
                        <button id="am-close" style="background:none;border:none;color:${text};font-size:20px;cursor:pointer;">×</button>
                    </div>
                </div>
                
                <div id="am-content" style="flex:1;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:10px;min-height:0;">

                <div style="padding:10px;background:${isDark?'#1e2330':'#f0f1f2'};border-radius:6px;flex-shrink:0;">
                    <div style="font-size:12px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:8px;font-weight:bold;">🎲 气运状态</div>
                    <div style="display:flex;gap:16px;align-items:center;">
                        <div><span style="color:${isDark?'#94a3b8':'#64748b'};font-size:11px;">当前气运</span><div id="am-luck-value" style="color:#f59e0b;font-size:18px;font-weight:bold;">--</div></div>
                        <div id="am-luck-warning" style="flex:1;font-size:11px;color:#ff6b6b;display:none;">⚠️ 当前气运可能会导致遇敌概率（宝藏守卫）下降，此为猜测没有实质依据，建议8以上</div>
                    </div>
                    <div style="margin-top:10px;padding-top:10px;border-top:1px solid ${isDark?'rgba(148,163,184,0.2)':'rgba(148,163,184,0.3)'};display:flex;gap:16px;">
                        <div><span style="color:${isDark?'#94a3b8':'#64748b'};font-size:11px;">累计开启</span><div id="am-luck-total-maps" style="color:${isDark?'#cbd5e1':'#475569'};font-size:14px;font-weight:bold;margin-top:2px;">0</div></div>
                        <div><span style="color:${isDark?'#94a3b8':'#64748b'};font-size:11px;">累计遇敌</span><div id="am-luck-total-battles" style="color:#ff6b6b;font-size:14px;font-weight:bold;margin-top:2px;">0</div></div>
                        <div><span style="color:${isDark?'#94a3b8':'#64748b'};font-size:11px;">遇敌率</span><div id="am-luck-rate" style="color:#3dab97;font-size:14px;font-weight:bold;margin-top:2px;">--</div></div>
                        <div><span style="color:${isDark?'#94a3b8':'#64748b'};font-size:11px;">雇护道率</span><div id="am-luck-guardian-rate" style="color:#4dabf7;font-size:14px;font-weight:bold;margin-top:2px;">--</div></div>
                    </div>
                </div>

                <div style="display:flex;gap:8px;flex-shrink:0;">
                    <button id="am-start" style="flex:1;padding:10px;background:#3dab97;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">▶ 启动</button>
                    <button id="am-stop" style="flex:1;padding:10px;background:#ff6b6b;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;display:none;">⏹ 停止</button>
                </div>

                <div style="padding:12px;background:${isDark?'#1e2330':'#f0f1f2'};border-radius:6px;margin-top:12px;flex-shrink:0;">
                    <div style="font-size:12px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:10px;font-weight:bold;">⚙️ 基础配置</div>
                    
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
                        <div>
                            <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">每次最多开启</div>
                            <input type="number" id="am-max-per-batch" value="${CONFIG.maxMapsPerBatch}" min="1" max="1000" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;">
                        </div>
                        <div>
                            <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">批量数量(1-10)</div>
                            <input type="number" id="am-batch-size" value="${CONFIG.batchSize}" min="1" max="10" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;">
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                        <div>
                            <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">基础间隔 (ms)</div>
                            <input type="number" id="am-open-interval" value="${CONFIG.openInterval}" min="1000" step="500" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;">
                        </div>
                        <div>
                            <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">随机范围 ±(ms)</div>
                            <input type="number" id="am-open-interval-random" value="${CONFIG.openIntervalRandom}" min="0" max="2000" step="100" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;">
                        </div>
                    </div>
                </div>
                
                <div style="padding:12px;background:${isDark?'#1e2330':'#f0f1f2'};border-radius:6px;flex-shrink:0;">
                    <div style="font-size:12px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:10px;font-weight:bold;">🛡️ 自动护道配置</div>
                    
                    <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer;">
                        <input type="checkbox" id="am-guardian-enabled" ${CONFIG.guardian.enabled?'checked':''} style="cursor:pointer;">
                        <span style="font-size:13px;color:${text};">启用自动雇护道</span>
                    </label>
                    
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
                        <div>
                            <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">最高雇佣费</div>
                            <input type="number" id="am-guardian-maxfee" value="${CONFIG.guardian.maxFee}" placeholder="0=不限" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;">
                        </div>
                        <div>
                            <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">最低攻击力</div>
                            <input type="number" id="am-guardian-minatk" value="${CONFIG.guardian.minAtk}" placeholder="0=不限" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;">
                        </div>
                    </div>
                    
                    <div style="margin-bottom:8px;">
                        <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">作战模式</div>
                        <select id="am-guardian-mode" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;cursor:pointer;">
                            <option value="together" ${CONFIG.guardian.mode==='together'?'selected':''}>协同作战（与玩家一起）</option>
                            <option value="alone" ${CONFIG.guardian.mode==='alone'?'selected':''}>独立作战（护道单独战斗）</option>
                        </select>
                    </div>
                    
                    <div style="margin-bottom:8px;">
                        <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">档次优先级</div>
                        <select id="am-guardian-priority" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;cursor:pointer;">
                            <option value="incarnation,normal,body" ${CONFIG.guardian.priority==='incarnation,normal,body'?'selected':''}>化身 > 普通 > 本体</option>
                            <option value="normal,incarnation,body" ${CONFIG.guardian.priority==='normal,incarnation,body'?'selected':''}>普通 > 化身 > 本体</option>
                            <option value="body,normal,incarnation" ${CONFIG.guardian.priority==='body,normal,incarnation'?'selected':''}>本体 > 普通 > 化身</option>
                        </select>
                    </div>
                    
                    <div style="margin-top:8px;">
                        <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">⚠️ 威胁等级阈值（建议势均力敌）</div>
                        <select id="am-guardian-threat" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;cursor:pointer;">
                            <option value="none" ${CONFIG.guardian.threatLevel==='none'?'selected':''}>不判断威胁等级（总是雇）</option>
                            <option value="danger" ${CONFIG.guardian.threatLevel==='danger'?'selected':''}>危险（强敌/越阶）</option>
                            <option value="warn" ${CONFIG.guardian.threatLevel==='warn'?'selected':''}>警告（略强/高层压制）</option>
                            <option value="neutral" ${CONFIG.guardian.threatLevel==='neutral'?'selected':''}>势均力敌</option>
                            <option value="safe" ${CONFIG.guardian.threatLevel==='safe'?'selected':''}>可稳战（总是不雇）</option>
                        </select>
                    </div>

                    <div style="margin-top:12px;padding-top:10px;border-top:1px solid ${border};">
                        <div style="font-size:12px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:10px;font-weight:bold;">🧳 自动商人配置</div>
                        <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer;">
                            <input type="checkbox" id="am-merchant-enabled" ${CONFIG.merchant.enabled?'checked':''} style="cursor:pointer;">
                            <span style="font-size:13px;color:${text};">自动购买云游商人最高价商品</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer;">
                            <input type="checkbox" id="am-merchant-auto-only" ${CONFIG.merchant.onlyAutoExplore?'checked':''} style="cursor:pointer;">
                            <span style="font-size:13px;color:${text};">仅自动探索挂起时处理</span>
                        </label>
                        <div>
                            <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">购买延迟 (ms)</div>
                            <input type="number" id="am-merchant-delay" value="${CONFIG.merchant.buyDelay}" min="0" max="10000" step="100" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;">
                        </div>
                    </div>

                    <div style="margin-top:12px;padding-top:10px;border-top:1px solid ${border};">
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;">
                            <div style="font-size:12px;color:${isDark?'#94a3b8':'#64748b'};font-weight:bold;">🌙 自动挂机循环</div>
                            <span id="am-afk-state" style="font-size:11px;color:${CONFIG.afkLoop.enabled?'#3dab97':'#94a3b8'};">${CONFIG.afkLoop.enabled?'运行中':'未启动'}</span>
                        </div>
                        <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer;">
                            <input type="checkbox" id="am-afk-enabled" ${CONFIG.afkLoop.enabled?'checked':''} style="cursor:pointer;">
                            <span style="font-size:13px;color:${text};">启用冥想-探索循环</span>
                        </label>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
                            <div>
                                <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">冥想分钟</div>
                                <input type="number" id="am-afk-meditation-minutes" value="${CONFIG.afkLoop.meditationMinutes}" min="1" max="720" step="1" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;">
                            </div>
                            <div>
                                <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">最低神识</div>
                                <input type="number" id="am-afk-min-spirit" value="${CONFIG.afkLoop.minSpirit}" min="0" step="1" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;">
                            </div>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
                            <div>
                                <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">探索倍数</div>
                                <select id="am-afk-explore-multiplier" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;cursor:pointer;">
                                    <option value="1" ${CONFIG.afkLoop.exploreMultiplier===1?'selected':''}>1倍稳妥</option>
                                    <option value="5" ${CONFIG.afkLoop.exploreMultiplier===5?'selected':''}>5倍</option>
                                    <option value="10" ${CONFIG.afkLoop.exploreMultiplier===10?'selected':''}>10倍</option>
                                    <option value="20" ${CONFIG.afkLoop.exploreMultiplier===20?'selected':''}>20倍</option>
                                    <option value="50" ${CONFIG.afkLoop.exploreMultiplier===50?'selected':''}>50倍富裕</option>
                                </select>
                            </div>
                            <div>
                                <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">检查间隔(ms)</div>
                                <input type="number" id="am-afk-tick-interval" value="${CONFIG.afkLoop.tickInterval}" min="5000" max="300000" step="1000" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;">
                            </div>
                        </div>
                        <div style="margin-bottom:8px;">
                            <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">卡住判定(秒)</div>
                            <input type="number" id="am-afk-stall-timeout" value="${CONFIG.afkLoop.stallTimeoutSeconds}" min="0" max="3600" step="5" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;">
                        </div>
                        <div style="display:grid;grid-template-columns:1fr;gap:6px;margin-bottom:8px;">
                            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                                <input type="checkbox" id="am-afk-auto-revive" ${CONFIG.afkLoop.autoRevive?'checked':''} style="cursor:pointer;">
                                <span style="font-size:12px;color:${text};">死亡后自动灵石复活</span>
                            </label>
                            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                                <input type="checkbox" id="am-afk-use-talismans" ${CONFIG.afkLoop.useTalismans?'checked':''} style="cursor:pointer;">
                                <span style="font-size:12px;color:${text};">战斗前自动使用已选符箓策略（预留）</span>
                            </label>
                            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                                <input type="checkbox" id="am-afk-use-nirvana" ${CONFIG.afkLoop.useNirvanaPill?'checked':''} style="cursor:pointer;">
                                <span style="font-size:12px;color:${text};">富裕模式使用涅槃重生丹（预留）</span>
                            </label>
                        </div>
                        <div style="display:flex;gap:8px;">
                            <button id="am-afk-start" style="flex:1;padding:8px;background:#7c3aed;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">启动挂机</button>
                            <button id="am-afk-stop" style="flex:1;padding:8px;background:#64748b;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">停止挂机</button>
                        </div>
                    </div>

                    <button id="am-save-config" style="width:100%;margin-top:10px;padding:8px;background:#4dabf7;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">💾 保存配置</button>
                </div>

                <div style="padding:10px;background:${isDark?'#1e2330':'#f0f1f2'};border-radius:6px;flex-shrink:0;">
                    <div style="font-size:12px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:8px;font-weight:bold;">🏆 累计统计</div>
                    <div style="display:flex;gap:16px;">
                        <div><span style="color:${isDark?'#94a3b8':'#64748b'};font-size:11px;">总开启</span><div id="am-total-maps" style="color:#3dab97;font-size:18px;font-weight:bold;">${TOTAL_STATS.totalMapsOpened}</div></div>
                        <div><span style="color:${isDark?'#94a3b8':'#64748b'};font-size:11px;">总遇敌</span><div id="am-total-battles" style="color:#ff6b6b;font-size:18px;font-weight:bold;">${TOTAL_STATS.totalBattles}</div></div>
                        <div><span style="color:${isDark?'#94a3b8':'#64748b'};font-size:11px;">总雇护道</span><div id="am-total-guardian" style="color:#4dabf7;font-size:18px;font-weight:bold;">${TOTAL_STATS.totalGuardianHired}</div></div>
                    </div>
                </div>
                </div>
                
                <div id="am-log-wrapper" style="flex:1;min-height:100px;max-height:180px;display:flex;flex-direction:column;gap:6px;overflow:hidden;">
                    <div style="flex:1;overflow-y:auto;padding:10px;background:${isDark?'#1e2330':'#f0f1f2'};border-radius:6px;font-size:12px;" id="am-log-content">
                        <div style="color:${isDark?'#64748b':'#94a3b8'};">等待启动...</div>
                    </div>
                    <button id="am-clear-log" style="padding:6px 12px;background:none;border:1px solid ${border};color:${isDark?'#94a3b8':'#64748b'};border-radius:4px;cursor:pointer;font-size:12px;flex-shrink:0;">清空日志</button>
                </div>
            `;

            document.body.appendChild(panel);

            this.makeDraggable(panel, $('#am-header'));

            $('#am-close')?.addEventListener('click', () => panel.style.display = 'none');
            $('#am-minimize')?.addEventListener('click', () => this.toggleMinimize());
            $('#am-start')?.addEventListener('click', () => MapOpener.start());
            $('#am-stop')?.addEventListener('click', async () => await MapOpener.stop());
            $('#am-clear-log')?.addEventListener('click', () => {
                $('#am-log-content').innerHTML = '<div style="color:#64748b;">日志已清空</div>';
            });

            $('#am-afk-start')?.addEventListener('click', () => AfkLoopManager.start());
            $('#am-afk-stop')?.addEventListener('click', () => AfkLoopManager.stop());



            $('#am-save-config')?.addEventListener('click', async () => {
                CONFIG.maxMapsPerBatch = parseInt($('#am-max-per-batch')?.value || '50') || 50;
                CONFIG.batchSize = parseInt($('#am-batch-size')?.value || '10') || 10;
                if (CONFIG.batchSize < 1) CONFIG.batchSize = 1;
                if (CONFIG.batchSize > 10) CONFIG.batchSize = 10;
                CONFIG.openInterval = parseInt($('#am-open-interval')?.value || '3000') || 3000;
                CONFIG.openIntervalRandom = parseInt($('#am-open-interval-random')?.value || '500') || 500;
                
                CONFIG.guardian.enabled = $('#am-guardian-enabled')?.checked ?? true;
                CONFIG.guardian.maxFee = parseInt($('#am-guardian-maxfee')?.value || '0') || 0;
                CONFIG.guardian.minAtk = parseInt($('#am-guardian-minatk')?.value || '0') || 0;
                CONFIG.guardian.mode = $('#am-guardian-mode')?.value || 'together';
                CONFIG.guardian.priority = $('#am-guardian-priority')?.value || 'incarnation,normal,body';
                CONFIG.guardian.threatLevel = $('#am-guardian-threat')?.value || 'danger';

                CONFIG.merchant.enabled = $('#am-merchant-enabled')?.checked ?? true;
                CONFIG.merchant.onlyAutoExplore = $('#am-merchant-auto-only')?.checked ?? true;
                CONFIG.merchant.buyDelay = parseInt($('#am-merchant-delay')?.value || '800') || 0;
                if (CONFIG.merchant.buyDelay < 0) CONFIG.merchant.buyDelay = 0;
                if (CONFIG.merchant.buyDelay > 10000) CONFIG.merchant.buyDelay = 10000;

                readAfkLoopConfigFromUI();
                saveConfig();
                AfkLoopManager.ensureTimer();
                UI.updateAfkState();
                
                try {
                    const apiObj = typeof api !== 'undefined' ? api : (window.api || _win.api);
                    if (apiObj?.post) {
                        const priorityArr = CONFIG.guardian.priority.split(',');
                        const hireRes = await apiObj.post('/api/player/settings/auto-hire', {
                            enabled: CONFIG.guardian.enabled,
                            maxFee: CONFIG.guardian.maxFee,
                            minAtk: CONFIG.guardian.minAtk,
                            mode: CONFIG.guardian.mode,
                            priority: priorityArr
                        });
                        
                        if (_win.persistAutoHireToLocal) {
                            _win.persistAutoHireToLocal({
                                enabled: CONFIG.guardian.enabled,
                                maxFee: CONFIG.guardian.maxFee,
                                minAtk: CONFIG.guardian.minAtk,
                                mode: CONFIG.guardian.mode,
                                priorityKey: CONFIG.guardian.priority
                            });
                        }
                        
                        if (hireRes?.code === 200) {
                            Logger.success('配置已保存（同步到游戏）');
                        } else {
                            const hireMsg = hireRes?.code !== 200 ? `护道:${hireRes?.message} ` : '';
                            Logger.warn(`同步失败 ${hireMsg}`);
                        }
                        
                        if (_win.loadPlayerInfo) {
                            _win.loadPlayerInfo(true);
                        }
                    } else {
                        Logger.success('配置已保存（本地）');
                    }
                } catch (e) {
                    Logger.warn(`同步失败: ${e.message}`);
                }
            });

            this.loadLuckOnInit();
            this.syncConfigFromGame();
        },

        /**
         * 初始化时加载气运信息
         */
        async loadLuckOnInit() {
            try {
                const playerRes = await API.getPlayerInfo();
                if (playerRes.code === 200 && playerRes.data) {
                    const luck = playerRes.data.luck;
                    MapOpener.currentLuck = luck;
                    UI.updateLuckDisplay(luck);
                    console.log('[自动开图] 面板加载时获取气运:', luck);
                } else {
                    UI.updateLuckDisplay(null);
                }
            } catch (e) {
                console.warn('[自动开图] 面板加载时获取气运失败:', e.message);
                UI.updateLuckDisplay(null);
            }
        },

        /**
         * 从游戏中同步配置
         */
        async syncConfigFromGame() {
            try {
                const apiObj = typeof api !== 'undefined' ? api : (window.api || _win.api);
                if (!apiObj?.get) return;

                const res = await apiObj.get('/api/player/settings');
                if (res.code === 200 && res.data) {
                    const s = res.data;

                    if (typeof s['auto_hire_enabled'] !== 'undefined') {
                        CONFIG.guardian.enabled = s['auto_hire_enabled'] === '1' || s['auto_hire_enabled'] === true;
                    }
                    if (typeof s['auto_hire_mode'] !== 'undefined') {
                        CONFIG.guardian.mode = s['auto_hire_mode'] === 'alone' ? 'alone' : 'together';
                    }
                    if (typeof s['auto_hire_max_fee'] !== 'undefined') {
                        CONFIG.guardian.maxFee = parseInt(s['auto_hire_max_fee'], 10) || 0;
                    }
                    if (typeof s['auto_hire_min_atk'] !== 'undefined') {
                        CONFIG.guardian.minAtk = parseInt(s['auto_hire_min_atk'], 10) || 0;
                    }
                    if (typeof s['auto_hire_priority'] !== 'undefined') {
                        const priorityArr = s['auto_hire_priority'].split(',').filter(p => p);
                        if (priorityArr.length > 0) {
                            CONFIG.guardian.priority = priorityArr.join(',');
                        }
                    }

                    this.updatePanelFromConfig();
                    console.log('[自动开图] 已从游戏同步配置:', CONFIG.guardian);
                }
            } catch (e) {
                console.warn('[自动开图] 从游戏同步配置失败:', e.message);
            }
        },

        /**
         * 从配置更新面板
         */
        updatePanelFromConfig() {
            const enabledEl = $('#am-guardian-enabled');
            const maxFeeEl = $('#am-guardian-maxfee');
            const minAtkEl = $('#am-guardian-minatk');
            const modeEl = $('#am-guardian-mode');
            const priorityEl = $('#am-guardian-priority');
            const merchantEnabledEl = $('#am-merchant-enabled');
            const merchantAutoOnlyEl = $('#am-merchant-auto-only');
            const merchantDelayEl = $('#am-merchant-delay');
            const afkEnabledEl = $('#am-afk-enabled');
            const afkMeditationMinutesEl = $('#am-afk-meditation-minutes');
            const afkMinSpiritEl = $('#am-afk-min-spirit');
            const afkExploreMultiplierEl = $('#am-afk-explore-multiplier');
            const afkTickIntervalEl = $('#am-afk-tick-interval');
            const afkStallTimeoutEl = $('#am-afk-stall-timeout');
            const afkAutoReviveEl = $('#am-afk-auto-revive');
            const afkUseTalismansEl = $('#am-afk-use-talismans');
            const afkUseNirvanaEl = $('#am-afk-use-nirvana');

            if (enabledEl) enabledEl.checked = CONFIG.guardian.enabled;
            if (maxFeeEl) maxFeeEl.value = CONFIG.guardian.maxFee;
            if (minAtkEl) minAtkEl.value = CONFIG.guardian.minAtk;
            if (modeEl) modeEl.value = CONFIG.guardian.mode;
            if (priorityEl) priorityEl.value = CONFIG.guardian.priority;

            const threatEl = $('#am-guardian-threat');
            if (threatEl) threatEl.value = CONFIG.guardian.threatLevel || 'danger';
            if (merchantEnabledEl) merchantEnabledEl.checked = CONFIG.merchant.enabled;
            if (merchantAutoOnlyEl) merchantAutoOnlyEl.checked = CONFIG.merchant.onlyAutoExplore;
            if (merchantDelayEl) merchantDelayEl.value = CONFIG.merchant.buyDelay;
            if (afkEnabledEl) afkEnabledEl.checked = CONFIG.afkLoop.enabled;
            if (afkMeditationMinutesEl) afkMeditationMinutesEl.value = CONFIG.afkLoop.meditationMinutes;
            if (afkMinSpiritEl) afkMinSpiritEl.value = CONFIG.afkLoop.minSpirit;
            if (afkExploreMultiplierEl) afkExploreMultiplierEl.value = CONFIG.afkLoop.exploreMultiplier;
            if (afkTickIntervalEl) afkTickIntervalEl.value = CONFIG.afkLoop.tickInterval;
            if (afkStallTimeoutEl) afkStallTimeoutEl.value = CONFIG.afkLoop.stallTimeoutSeconds;
            if (afkAutoReviveEl) afkAutoReviveEl.checked = CONFIG.afkLoop.autoRevive;
            if (afkUseTalismansEl) afkUseTalismansEl.checked = CONFIG.afkLoop.useTalismans;
            if (afkUseNirvanaEl) afkUseNirvanaEl.checked = CONFIG.afkLoop.useNirvanaPill;
            this.updateAfkState();
        },

        updateAfkState() {
            const stateEl = $('#am-afk-state');
            if (stateEl) {
                stateEl.textContent = CONFIG.afkLoop.enabled ? '运行中' : '未启动';
                stateEl.style.color = CONFIG.afkLoop.enabled ? '#3dab97' : '#94a3b8';
            }
            const enabledEl = $('#am-afk-enabled');
            if (enabledEl) enabledEl.checked = CONFIG.afkLoop.enabled;
        },

        /**
         * 创建侧边栏按钮
         */
        createSidebarButton() {
            if ($('#am-sidebar-btn')) return;

            const section = document.createElement('div');
            section.className = 'panel-section';
            section.id = 'am-sidebar-section';
            section.style.cssText = 'margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border-color);';

            const title = document.createElement('div');
            title.className = 'panel-section-title';
            title.textContent = '自动开图';
            title.style.cssText = 'font-size:14px;font-weight:bold;color:var(--text-muted);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px;';
            section.appendChild(title);

            const btn = document.createElement('button');
            btn.id = 'am-sidebar-btn';
            btn.textContent = '打开面板';
            btn.style.cssText = `
                width:100%;padding:10px 12px;
                background:rgba(61,171,151,0.2);border:1px solid rgba(61,171,151,0.4);
                border-radius:6px;color:#3dab97;font-size:13px;font-weight:bold;cursor:pointer;
            `;
            btn.addEventListener('click', () => {
                const panel = $('#am-panel');
                if (panel) panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
            });

            section.appendChild(btn);
            this.insertToSidebar(section);
        },

        /**
         * 将按钮插入侧边栏
         * @param {Element} section - 按钮容器元素
         */
        insertToSidebar(section) {
            try {
                if (section.parentNode) {
                    return;
                }

                const playerPanel = $('.player-panel') || $('#playerPanel');
                if (playerPanel && document.contains(playerPanel)) {
                    const firstSection = playerPanel.querySelector('.panel-section');
                    if (firstSection && document.contains(firstSection)) {
                        playerPanel.insertBefore(section, firstSection);
                        return;
                    }
                }

                const sidebar = $('.player-panel') || $('#playerPanel') || $('.sidebar') || $('#sidebar') || $('.sidebar-nav');
                if (sidebar && document.contains(sidebar)) {
                    if (!sidebar.querySelector('#am-sidebar-section')) {
                        sidebar.appendChild(section);
                    }
                    return;
                }

                setTimeout(() => this.insertToSidebar(section), 1000);
            } catch (e) {
                console.warn('[自动开图] 插入侧边栏失败: ' + e.message);
            }
        },

        /**
         * 使面板可拖拽
         * @param {Element} panel - 面板元素
         * @param {Element} header - 拖拽头部元素
         */
        makeDraggable(panel, header) {
            if (!panel || !header) return;

            let isDragging = false;
            let startX, startY, startLeft, startTop;
            let currentX = 0, currentY = 0;
            let rafId = null;

            const updatePosition = () => {
                if (!isDragging) return;
                panel.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
                rafId = null;
            };

            header.addEventListener('mousedown', (e) => {
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                const rect = panel.getBoundingClientRect();
                startLeft = rect.left;
                startTop = rect.top;
                currentX = 0;
                currentY = 0;
                panel.style.left = startLeft + 'px';
                panel.style.top = startTop + 'px';
                panel.style.transform = 'translate3d(0, 0, 0)';
                panel.style.transition = 'none';
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                currentX = e.clientX - startX;
                currentY = e.clientY - startY;
                if (!rafId) {
                    rafId = requestAnimationFrame(updatePosition);
                }
            });

            document.addEventListener('mouseup', () => {
                if (!isDragging) return;
                isDragging = false;
                if (rafId) {
                    cancelAnimationFrame(rafId);
                    rafId = null;
                }
                const rect = panel.getBoundingClientRect();
                panel.style.left = rect.left + 'px';
                panel.style.top = rect.top + 'px';
                panel.style.transform = 'none';
                panel.style.transition = 'opacity 2s ease';
            });

            header.addEventListener('touchstart', (e) => {
                isDragging = true;
                const touch = e.touches[0];
                startX = touch.clientX;
                startY = touch.clientY;
                const rect = panel.getBoundingClientRect();
                startLeft = rect.left;
                startTop = rect.top;
                currentX = 0;
                currentY = 0;
                panel.style.left = startLeft + 'px';
                panel.style.top = startTop + 'px';
                panel.style.transform = 'translate3d(0, 0, 0)';
                panel.style.transition = 'none';
            }, { passive: false });

            document.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                e.preventDefault();
                const touch = e.touches[0];
                currentX = touch.clientX - startX;
                currentY = touch.clientY - startY;
                if (!rafId) {
                    rafId = requestAnimationFrame(updatePosition);
                }
            }, { passive: false });

            document.addEventListener('touchend', () => {
                if (!isDragging) return;
                isDragging = false;
                if (rafId) {
                    cancelAnimationFrame(rafId);
                    rafId = null;
                }
                const rect = panel.getBoundingClientRect();
                panel.style.left = rect.left + 'px';
                panel.style.top = rect.top + 'px';
                panel.style.transform = 'none';
                panel.style.transition = 'opacity 0.2s ease';
            });
        },

        /**
         * 切换最小化状态
         */
        toggleMinimize() {
            const content = $('#am-content');
            const logWrapper = $('#am-log-wrapper');
            const panel = $('#am-panel');
            const btn = $('#am-minimize');
            if (!content || !panel || !btn) return;

            const isHidden = content.style.display === 'none';
            content.style.display = isHidden ? 'flex' : 'none';
            btn.textContent = isHidden ? '−' : '+'; 
            
            if (!isHidden) {
                panel.style.height = 'auto';
                panel.style.maxHeight = '280px';
                if (logWrapper) {
                    logWrapper.style.flex = '1';
                    logWrapper.style.maxHeight = '200px';
                }
            } else {
                panel.style.height = '600px';
                panel.style.maxHeight = '85vh';
                if (logWrapper) {
                    logWrapper.style.flex = '1';
                    logWrapper.style.maxHeight = '180px';
                }
            }
        },

        /**
         * 应用CSS样式
         */
        applyStyles() {
            const css = `
                #am-panel button:hover { opacity:0.9; transform:translateY(-1px); }
                #am-log-content::-webkit-scrollbar { width:6px; }
                #am-log-content::-webkit-scrollbar-thumb { background:rgba(148,163,184,0.3); border-radius:3px; }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `;
            if (typeof GM_addStyle !== 'undefined') {
                GM_addStyle(css);
                return;
            }
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
        },

        /**
         * 更新状态指示器
         */
        updateStatusIndicator() {
            const indicator = $('#am-status-indicator');
            if (indicator) {
                indicator.style.display = STATE.running ? 'inline-block' : 'none';
            }
        },

        /**
         * 更新总体统计数据
         */
        updateTotalStats() {
            $('#am-total-maps').textContent = TOTAL_STATS.totalMapsOpened;
            $('#am-total-battles').textContent = TOTAL_STATS.totalBattles;
            $('#am-total-guardian').textContent = TOTAL_STATS.totalGuardianHired;
            this.updateLuckDisplay(MapOpener.currentLuck);
        },

        /**
         * 更新气运显示
         * @param {number} luck - 气运值
         */
        updateLuckDisplay(luck) {
            const luckEl = $('#am-luck-value');
            const warningEl = $('#am-luck-warning');
            const totalMapsEl = $('#am-luck-total-maps');
            const totalBattlesEl = $('#am-luck-total-battles');
            const rateEl = $('#am-luck-rate');
            const guardianRateEl = $('#am-luck-guardian-rate');

            const luckValue = parseInt(luck);
            const hasLuck = !isNaN(luckValue);

            if (luckEl && hasLuck) {
                luckEl.textContent = luckValue;
            }

            if (warningEl) {
                warningEl.style.display = (hasLuck && luckValue < 8) ? 'block' : 'none';
            }

            if (totalMapsEl) totalMapsEl.textContent = TOTAL_STATS.totalMapsOpened;
            if (totalBattlesEl) totalBattlesEl.textContent = TOTAL_STATS.totalBattles;

            if (rateEl) {
                const rate = TOTAL_STATS.totalMapsOpened > 0
                    ? (TOTAL_STATS.totalBattles / TOTAL_STATS.totalMapsOpened * 100).toFixed(1) + '%'
                    : '--';
                rateEl.textContent = rate;
            }

            if (guardianRateEl) {
                const guardianRate = TOTAL_STATS.totalBattles > 0
                    ? (TOTAL_STATS.totalGuardianHired / TOTAL_STATS.totalBattles * 100).toFixed(1) + '%'
                    : '--';
                guardianRateEl.textContent = guardianRate;
            }
        },

        /**
         * 更新按钮状态
         */
        updateButtons() {
            $('#am-start').style.display = STATE.running ? 'none' : 'block';
            $('#am-stop').style.display = STATE.running ? 'block' : 'none';
            this.updateStatusIndicator();
        }
    };

    // 云游商人自动处理器
    const MerchantAutoBuyer = {
        intervalId: null,
        busy: false,
        lastAttemptKey: '',

        init() {
            if (this.intervalId) return;
            this.intervalId = setInterval(() => this.tick(), 1500);
            setTimeout(() => this.tick(), 500);
        },

        isMerchantActive() {
            const overlay = $('#merchantOverlay');
            return !!_win._merchantActive || !!(overlay && !overlay.classList.contains('hidden'));
        },

        isAutoExplorePending() {
            const toggle = $('#autoExploreToggle');
            return !!(_win._autoResumeExplorePending || _win._autoExploreRunning || toggle?.checked);
        },

        shouldHandle() {
            if (!CONFIG.merchant.enabled) return false;
            if (!this.isMerchantActive()) {
                this.lastAttemptKey = '';
                return false;
            }
            if (CONFIG.merchant.onlyAutoExplore && !this.isAutoExplorePending()) return false;
            return true;
        },

        getMerchantKey(items) {
            if (!Array.isArray(items)) return '';
            return items.map(item => `${item?.index}:${item?.name}:${item?.price}`).join('|');
        },

        async tick() {
            if (this.busy || !this.shouldHandle()) return;
            this.busy = true;
            try {
                await this.handleMerchant();
            } finally {
                this.busy = false;
            }
        },

        async handleMerchant() {
            const delay = Math.max(0, Math.min(10000, parseInt(CONFIG.merchant.buyDelay, 10) || 0));
            if (delay > 0) await wait(delay);
            if (!this.shouldHandle()) return;

            let res;
            try {
                res = await API.getMerchant();
            } catch (e) {
                Logger.warn(`自动商人读取失败: ${e.message}`);
                return;
            }

            if (res.code !== 200 || !res.data) return;

            const items = res.data.items || [];
            const merchantKey = this.getMerchantKey(items);
            if (merchantKey && merchantKey === this.lastAttemptKey) return;

            const selected = selectMerchantItem(items);
            if (!selected) {
                Logger.warn('云游商人没有可自动购买的商品');
                this.lastAttemptKey = merchantKey;
                return;
            }

            this.lastAttemptKey = merchantKey;
            const price = parseMerchantPrice(selected.price);
            Logger.info(`自动购买云游商人最高价商品: ${selected.name || '未知商品'} (${price} 灵石)`);
            await this.buySelected(selected);
        },

        async buySelected(item) {
            if (typeof _win.buyMerchantItem === 'function') {
                await _win.buyMerchantItem(item.index);
                return;
            }

            const res = await API.buyMerchantItem(item.index);
            if (res.code === 200) {
                Logger.success('云游商人购买成功');
                this.refreshAfterBuy();
            } else {
                Logger.warn(`云游商人购买失败: ${res.message || '未知错误'}`);
            }
        },

        refreshAfterBuy() {
            try {
                if (typeof _win.clearMerchantState === 'function') {
                    _win.clearMerchantState({ clearItems: true, resume: true });
                } else {
                    const overlay = $('#merchantOverlay');
                    if (overlay) overlay.classList.add('hidden');
                }
                if (_win.loadGameLogs) _win.loadGameLogs();
                if (_win.loadPlayerInfo) _win.loadPlayerInfo(true);
                if (typeof _win._tryResumeAutoExploreAfterMerchant === 'function') {
                    _win._tryResumeAutoExploreAfterMerchant();
                }
            } catch (e) {
                // 页面刷新失败不影响购买请求本身
            }
        }
    };

    // 冥想-探索挂机循环
    const AfkLoopManager = {
        intervalId: null,
        busy: false,
        lastEvaluationAt: 0,
        lastDecisionKey: '',
        lastAutoExploreCount: null,
        lastExploreProgressAt: 0,

        init() {
            this.ensureTimer();
            if (CONFIG.afkLoop.enabled) {
                setTimeout(() => this.tick(true), 1200);
            }
        },

        ensureTimer() {
            if (this.intervalId) return;
            this.intervalId = setInterval(() => this.tick(false), 5000);
        },

        start() {
            readAfkLoopConfigFromUI();
            CONFIG.afkLoop.enabled = true;
            saveConfig();
            UI.updateAfkState();
            this.ensureTimer();
            Logger.success(`自动挂机循环已启动：冥想${CONFIG.afkLoop.meditationMinutes}分钟，神识低于${CONFIG.afkLoop.minSpirit}回冥想`);
            this.tick(true);
        },

        stop() {
            CONFIG.afkLoop.enabled = false;
            saveConfig();
            UI.updateAfkState();
            this.lastDecisionKey = '';
            Logger.warn('自动挂机循环已停止');
        },

        async tick(force) {
            const cfg = normalizeAfkLoopConfig(CONFIG.afkLoop);
            CONFIG.afkLoop = cfg;
            if (!cfg.enabled) return;

            const now = Date.now();
            if (!force && now - this.lastEvaluationAt < cfg.tickInterval) return;
            if (this.busy) return;

            this.busy = true;
            this.lastEvaluationAt = now;
            try {
                const snapshot = await this.buildSnapshot(now, cfg);
                const decision = decideAfkNextAction(snapshot, cfg, now);
                await this.executeDecision(decision, snapshot, cfg);
            } catch (e) {
                Logger.warn(`自动挂机循环检查失败: ${e.message || e}`);
            } finally {
                this.busy = false;
            }
        },

        async buildSnapshot(now, cfg) {
            let player = _win._lastPlayerData || null;
            if (!player) {
                try {
                    const res = await API.getPlayerInfo();
                    if (res.code === 200 && res.data) player = res.data;
                } catch (e) {}
            }
            player = player || {};

            let meditationStatus = null;
            try {
                const res = await API.getMeditationStatus();
                if (res.code === 200 && res.data) meditationStatus = res.data;
            } catch (e) {}

            const toggle = $('#autoExploreToggle');
            const autoExploreRunning = !!(_win._autoExploreRunning || toggle?.checked);
            const autoExplorePending = !!_win._autoResumeExplorePending;
            const autoExploreCount = toFiniteNumber(_win._autoExploreCount, 0);

            if (!autoExploreRunning || this.lastAutoExploreCount === null || autoExploreCount !== this.lastAutoExploreCount) {
                this.lastExploreProgressAt = now;
                this.lastAutoExploreCount = autoExploreCount;
            }

            const encounterOverlay = $('#encounterOverlay');
            const combatPanel = $('#combatPanel');
            const talismanDialog = $('#encounterTalismanDialog');
            const encounterActive = !!(
                _win._encounterActive ||
                (encounterOverlay && !encounterOverlay.classList.contains('hidden')) ||
                (combatPanel && combatPanel.classList.contains('active')) ||
                (talismanDialog && !talismanDialog.classList.contains('hidden'))
            );

            const stalledMs = cfg.stallTimeoutSeconds * 1000;
            const exploreStalled = autoExploreRunning && stalledMs > 0 && (now - this.lastExploreProgressAt) >= stalledMs;

            return {
                isMeditating: meditationStatus ? !!meditationStatus.isMeditating : !!player.isMeditating,
                meditationDurationSeconds: meditationStatus ? meditationStatus.durationSeconds : undefined,
                spirit: player.spirit,
                maxSpirit: player.maxSpirit,
                spiritCost: player.spiritCost,
                canExplore: player.canExplore,
                exploreDisabledReason: player.exploreDisabledReason,
                isDead: !!(player.isDead || _win.playerDead),
                merchantActive: MerchantAutoBuyer.isMerchantActive(),
                encounterActive,
                autoExploreRunning,
                autoExplorePending,
                exploreStalled
            };
        },

        async executeDecision(decision, snapshot, cfg) {
            const key = `${decision.action}:${decision.reason}`;
            if (decision.action === 'wait' || decision.action === 'idle') {
                if (key !== this.lastDecisionKey && decision.reason !== 'auto-explore-running') {
                    Logger.info(`自动挂机等待：${this.formatReason(decision.reason)}`);
                }
                this.lastDecisionKey = key;
                return;
            }

            this.lastDecisionKey = key;
            if (decision.action === 'startMeditation') {
                Logger.info(`自动挂机进入冥想：${this.formatReason(decision.reason)}`);
                await this.startMeditation();
                return;
            }
            if (decision.action === 'stopMeditation') {
                Logger.info(`自动挂机结束冥想：${this.formatReason(decision.reason)}`);
                await this.stopMeditation();
                return;
            }
            if (decision.action === 'startAutoExplore') {
                Logger.info(`自动挂机启动探索：${this.formatReason(decision.reason)}，倍率×${cfg.exploreMultiplier}`);
                await this.startAutoExplore(cfg.exploreMultiplier);
                return;
            }
            if (decision.action === 'revive') {
                Logger.warn('自动挂机尝试灵石复活');
                await this.revive();
            }
        },

        async startMeditation() {
            try {
                if (_win._autoExploreRunning && typeof _win.stopAutoExplore === 'function') {
                    _win.stopAutoExplore('挂机循环回冥想', false);
                    await wait(500);
                }
                if (typeof _win.handleMeditate === 'function') {
                    await _win.handleMeditate();
                } else {
                    const res = await API.startMeditation();
                    if (res.code !== 200) throw new Error(res.message || '开始冥想失败');
                    if (typeof _win.startMeditationUI === 'function') _win.startMeditationUI();
                }
                this.refreshGameData();
            } catch (e) {
                Logger.warn(`自动冥想失败: ${e.message || e}`);
            }
        },

        async stopMeditation() {
            try {
                if (typeof _win.handleStopMeditate === 'function') {
                    await _win.handleStopMeditate();
                } else {
                    const res = await API.stopMeditation();
                    if (typeof _win.stopMeditationUI === 'function') _win.stopMeditationUI();
                    if (res.code !== 200) throw new Error(res.message || '结束冥想失败');
                }
                this.refreshGameData();
            } catch (e) {
                Logger.warn(`自动结束冥想失败: ${e.message || e}`);
            }
        },

        async startAutoExplore(multiplier) {
            try {
                this.setExploreMultiplier(multiplier);
                const toggle = $('#autoExploreToggle');
                if (toggle) toggle.checked = true;

                if (typeof _win.toggleAutoExplore === 'function') {
                    await _win.toggleAutoExplore(true);
                } else if (typeof _win.startAutoExplore === 'function') {
                    await _win.startAutoExplore();
                } else if (typeof _win.handleExplore === 'function') {
                    await _win.handleExplore();
                } else {
                    throw new Error('页面探索函数不可用');
                }
                this.lastExploreProgressAt = Date.now();
            } catch (e) {
                Logger.warn(`自动探索启动失败: ${e.message || e}`);
            }
        },

        setExploreMultiplier(multiplier) {
            const n = clampNumber(multiplier, 1, 50, 1);
            if (typeof _win.setExploreMultiplierValue === 'function') {
                _win.setExploreMultiplierValue(n);
                if (typeof _win.onExploreMultiplierChange === 'function') _win.onExploreMultiplierChange(true);
                return;
            }

            const picker = $('#exploreMultiplier');
            if (!picker) return;
            if (picker.tagName === 'SELECT') {
                picker.value = String(n);
            } else {
                picker.dataset.value = String(n);
                const trigger = $('#exploreMultiplierButton');
                if (trigger) trigger.textContent = `×${n}`;
                picker.querySelectorAll('.explore-multiplier-option').forEach(option => {
                    const active = parseInt(option.getAttribute('data-value') || '1', 10) === n;
                    option.classList.toggle('active', active);
                    option.setAttribute('aria-selected', active ? 'true' : 'false');
                });
            }
        },

        async revive() {
            try {
                if (typeof _win.handleRevive === 'function') {
                    await _win.handleRevive();
                } else {
                    const res = await API.revive();
                    if (res.code !== 200) throw new Error(res.message || '复活失败');
                }
                this.refreshGameData();
            } catch (e) {
                Logger.warn(`自动复活失败: ${e.message || e}`);
            }
        },

        refreshGameData() {
            try {
                if (_win.loadPlayerInfo) _win.loadPlayerInfo(true);
                if (_win.loadGameLogs) _win.loadGameLogs();
            } catch (e) {}
        },

        formatReason(reason) {
            const labels = {
                disabled: '未启用',
                'merchant-active': '云游商人处理中',
                'encounter-active': '遭遇或战斗处理中',
                dead: '角色已陨落',
                meditating: '冥想未到结束条件',
                'spirit-full': '神识已满',
                'meditation-duration-reached': '冥想时长已到',
                'auto-explore-running': '自动探索运行中',
                'explore-stalled': '探索疑似卡住',
                'explore-disabled-no-spirit': '不可探索且疑似神识不足',
                'explore-disabled': '当前区域不可探索',
                'spirit-below-threshold': '神识低于阈值',
                'spirit-ready': '神识可探索',
                'dead-auto-revive-enabled': '已开启自动复活'
            };
            return labels[reason] || reason || '状态变化';
        }
    };

    // 地图开启器
    const MapOpener = {
        currentLuck: undefined,

        /**
         * 启动自动开图
         */
        async start() {
            if (STATE.running) return;

            this.readConfigFromUI();

            // 记录开始时的藏宝图数量，用于停止时校正
            try {
                const res = await API.getInventory();
                if (res.code === 200 && res.data) {
                    const items = res.data.items || res.data || [];
                    const maps = this.findTreasureMaps(items);
                    this._startMapCount = maps.reduce((sum, m) => sum + (m.quantity || m.count || 0), 0);
                }
            } catch (e) {
                this._startMapCount = undefined;
            }

            // 重置统计保存标记
            this._statsSaved = false;
            this._isStopping = false;

            STATE.running = true;
            STATE.stats = { mapsOpened: 0, battlesEncountered: 0, guardianHired: 0, rewards: [] };
            UI.updateButtons();
            Logger.success('自动开藏宝图已启动');

            this.runLoop();
        },

        /**
         * 从UI读取配置
         */
        readConfigFromUI() {
            const maxPerBatch = parseInt($('#am-max-per-batch')?.value);
            if (maxPerBatch && maxPerBatch > 0) {
                CONFIG.maxMapsPerBatch = maxPerBatch;
            }
            const batchSize = parseInt($('#am-batch-size')?.value);
            if (batchSize && batchSize >= 1 && batchSize <= 10) {
                CONFIG.batchSize = batchSize;
            }
            const openInterval = parseInt($('#am-open-interval')?.value);
            if (openInterval && openInterval >= 1000) {
                CONFIG.openInterval = openInterval;
            }
            
            CONFIG.guardian.enabled = $('#am-guardian-enabled')?.checked ?? true;
            const maxFee = parseInt($('#am-guardian-maxfee')?.value);
            CONFIG.guardian.maxFee = isNaN(maxFee) ? 0 : maxFee;
            const minAtk = parseInt($('#am-guardian-minatk')?.value);
            CONFIG.guardian.minAtk = isNaN(minAtk) ? 0 : minAtk;
            CONFIG.guardian.mode = $('#am-guardian-mode')?.value || 'together';
            CONFIG.guardian.priority = $('#am-guardian-priority')?.value || 'incarnation,normal,body';
            CONFIG.guardian.threatLevel = $('#am-guardian-threat')?.value || CONFIG.guardian.threatLevel || 'danger';
            CONFIG.merchant.enabled = $('#am-merchant-enabled')?.checked ?? CONFIG.merchant.enabled;
            CONFIG.merchant.onlyAutoExplore = $('#am-merchant-auto-only')?.checked ?? CONFIG.merchant.onlyAutoExplore;
            const merchantDelay = parseInt($('#am-merchant-delay')?.value);
            if (!isNaN(merchantDelay)) {
                CONFIG.merchant.buyDelay = Math.max(0, Math.min(10000, merchantDelay));
            }
            readAfkLoopConfigFromUI();
            saveConfig();
        },

        /**
         * 运行主循环
         */
        async runLoop() {
            while (STATE.running) {
                const hasMore = await this.openAllMaps();
                if (!hasMore) {
                    Logger.info('本轮完成，等待继续...');
                    await wait(5000);
                }
            }
            await this.stop();
        },

        /**
         * 停止自动开图
         */
        async stop() {
            // 防止重复停止
            if (this._isStopping) return;
            this._isStopping = true;
            
            if (!STATE.running && !STATE.isOpeningMap) {
                this._isStopping = false;
                return;
            }
            
            STATE.running = false;
            STATE.isOpeningMap = false;
            UI.updateButtons();
            
            if (!this._statsSaved) {
                // 标记已保存，防止重复保存
                this._statsSaved = true;
                
                // 如果中途停止，需要获取实际消耗并校正统计
                try {
                    const res = await API.getInventory();
                    if (res.code === 200 && res.data) {
                        const items = res.data.items || res.data || [];
                        const maps = this.findTreasureMaps(items);
                        const currentCount = maps.reduce((sum, m) => sum + (m.quantity || m.count || 0), 0);
                        
                        // 如果知道开始时的数量，计算实际消耗
                        if (this._startMapCount !== undefined && this._startMapCount > currentCount) {
                            const actualConsumed = this._startMapCount - currentCount;
                            if (actualConsumed > STATE.stats.mapsOpened) {
                                Logger.info(`📊 停止时校正: 实际消耗 ${actualConsumed} 张 (原统计: ${STATE.stats.mapsOpened})`);
                                STATE.stats.mapsOpened = actualConsumed;
                            }
                        }
                    }
                } catch (e) {
                    // 校正失败不影响保存
                }
                
                // 保存统计（即使为0也要保存遇敌和雇护道数据）
                TOTAL_STATS.totalMapsOpened += STATE.stats.mapsOpened;
                TOTAL_STATS.totalBattles += STATE.stats.battlesEncountered;
                TOTAL_STATS.totalGuardianHired += STATE.stats.guardianHired;
                StatsManager.recordSession(STATE.stats);
                StatsManager.save();
                UI.updateTotalStats();
                Logger.info(`本次统计: 开启${STATE.stats.mapsOpened}个, 遇敌${STATE.stats.battlesEncountered}次, 雇护道${STATE.stats.guardianHired}次`);
            }
            
            // 清除标记
            this._isStopping = false;
            this._statsSaved = false;
            Logger.info('自动开藏宝图已停止');
        },

        /**
         * 开启所有藏宝图
         */
        async openAllMaps() {
            try {
                // 获取背包信息
                const res = await API.getInventory();
                if (res.code !== 200 || !res.data) {
                    Logger.error(`获取背包失败: ${res.message || '未知错误'}`);
                    await this.stop();
                    return false;
                }

                const items = res.data.items || res.data || [];
                const maps = this.findTreasureMaps(items);

                if (maps.length === 0) {
                    Logger.info('背包中没有藏宝图');
                    return false;
                }

                const totalCount = maps.reduce((sum, m) => sum + (m.quantity || m.count || 0), 0);
                Logger.info(`发现 ${maps.length} 种藏宝图，共 ${totalCount} 个`);

                // 检查是否已达到上限
                if (STATE.stats.mapsOpened >= CONFIG.maxMapsPerBatch) {
                    Logger.info(`已达到开启上限 ${CONFIG.maxMapsPerBatch}，停止`);
                    await this.stop();
                    return false;
                }

                // 计算还能开启多少张
                const remainingToOpen = CONFIG.maxMapsPerBatch - STATE.stats.mapsOpened;
                Logger.info(`本次计划开启: ${remainingToOpen} 张 (已开${STATE.stats.mapsOpened}/${CONFIG.maxMapsPerBatch})`);

                // 记录开始时的藏宝图总数
                const countBefore = totalCount;

                // 处理藏宝图，传入剩余可开启数量
                await this.processMaps(maps, remainingToOpen);

                // 结束后获取实际消耗数量
                const countAfterRes = await API.getInventory();
                let countAfter = 0;
                if (countAfterRes.code === 200 && countAfterRes.data) {
                    const afterItems = countAfterRes.data.items || countAfterRes.data || [];
                    const afterMaps = this.findTreasureMaps(afterItems);
                    countAfter = afterMaps.reduce((sum, m) => sum + (m.quantity || m.count || 0), 0);
                }
                const actualConsumed = Math.max(0, countBefore - countAfter);

                // 累加本轮实际消耗到总统计
                if (actualConsumed > 0) {
                    STATE.stats.mapsOpened += actualConsumed;
                    Logger.info(`📊 本轮实际消耗: ${actualConsumed} 张 (累计: ${STATE.stats.mapsOpened})`);
                }

                // 检查是否已达到上限
                if (STATE.stats.mapsOpened >= CONFIG.maxMapsPerBatch) {
                    Logger.info(`已达到开启上限 ${CONFIG.maxMapsPerBatch}，停止`);
                    await this.stop();
                    return false;
                }

                Logger.success('藏宝图开启完成');
                // 开启完成后刷新游戏数据
                this.refreshGameData();
                return true;
            } catch (e) {
                Logger.error(`开启失败: ${e.message}`);
                await this.stop();
                return false;
            }
        },

        /**
         * 境界名称列表（与游戏源码一致）
         */
        STAGE_NAMES: ["锻体期", "练气期", "筑基期", "金丹期", "元婴期", "化神期", "炼虚期", "合道期", "大乘期", "渡劫期", "真仙境", "玄仙境", "金仙境", "太乙真仙", "大罗金仙", "仙王境", "仙尊境", "仙帝境", "道祖境", "天道境"],

        /**
         * 从境界名称解析境界数字
         * 根据游戏源码 parseRealmStageName 函数逻辑
         * @param {string} realmName - 境界名称（如"元婴期后期"）
         * @returns {number} 境界数字（0-19）
         */
        parseRealmStageName(realmName) {
            if (!realmName) return 0;
            const stages = this.STAGE_NAMES;
            for (let i = 0; i < stages.length; i++) {
                if (realmName.indexOf(stages[i]) >= 0) return i;
            }
            // 尝试短名称匹配
            for (let j = 0; j <= 9; j++) {
                const shortName = stages[j].replace("期", "");
                if (shortName && realmName.indexOf(shortName) >= 0) return j;
            }
            return 0;
        },

        /**
         * 从属性估算战力
         * 根据游戏源码 estimateEncounterPowerFromStats 函数逻辑
         * @param {number} hp - 生命值
         * @param {number} atk - 攻击力
         * @param {number} def - 防御力
         * @returns {number} 估算战力
         */
        estimatePowerFromStats(hp, atk, def) {
            const mHp = parseInt(hp) || 0;
            const mAtk = parseInt(atk) || 0;
            const mDef = parseInt(def) || 0;
            return Math.max(1, Math.round(mAtk * 8 + mDef * 6 + mHp / 3));
        },

        /**
         * 估算玩家战力
         * @param {Object} p - 玩家数据
         * @returns {number} 估算战力
         */
        estimatePlayerPower(p) {
            if (!p) return 0;
            const cached = Number(p.combatPower) || 0;
            if (cached > 0) return cached;
            return Math.max(1, Math.round((Number(p.attack) || 0) * 8 + (Number(p.defense) || 0) * 6 + (Number(p.maxHp) || 0) / 3));
        },

        /**
         * 计算威胁等级
         * 根据游戏源码 classifyEncounterThreat 函数逻辑
         * @param {Object} monsterData - 妖兽数据（API返回的res.data）
         * @returns {Object} { label: '威胁标签', className: 'danger/warn/neutral/safe', level: 数值等级 }
         */
        classifyThreat(monsterData) {
            const p = _win._lastPlayerData || {};
            const playerStage = Number(p.realmStage) || 0;
            const playerLevel = Number(p.realmLevel) || 1;
            
            // 从 API 返回数据解析境界
            const monsterRealmName = monsterData.monsterRealmName || '';
            const monsterStage = this.parseRealmStageName(monsterRealmName);
            const monsterLevel = parseInt(monsterData.monsterRealmLevel) || 1;
            
            // ========== 优先使用战力对比（更准确的判断）==========
            const monsterHp = parseInt(monsterData.monsterHp) || 0;
            const monsterAtk = parseInt(monsterData.monsterAtk) || 0;
            const monsterDef = parseInt(monsterData.monsterDef) || 0;
            
            const monsterPower = this.estimatePowerFromStats(monsterHp, monsterAtk, monsterDef);
            const playerPower = this.estimatePlayerPower(p);
            
            if (monsterPower && playerPower) {
                const ratio = monsterPower / Math.max(1, playerPower);
                
                // 战力比 >= 1.35：强敌（需要护道）
                if (ratio >= 1.35) {
                    return { label: '强敌', className: 'danger', level: 4, ratio: ratio.toFixed(2) };
                }
                // 战力比 >= 1.12：略强（需要护道）
                if (ratio >= 1.12) {
                    return { label: '略强', className: 'warn', level: 3, ratio: ratio.toFixed(2) };
                }
                // 战力比 >= 0.85：势均力敌
                if (ratio >= 0.85) {
                    return { label: '势均力敌', className: 'neutral', level: 2, ratio: ratio.toFixed(2) };
                }
                // 战力比 < 0.85：可稳战（不需要护道）
                return { label: '可稳战', className: 'safe', level: 1, ratio: ratio.toFixed(2) };
            }
            
            // ========== 战力数据缺失时，回退到境界判断 ==========
            // 越阶（大境界差距）
            if (monsterStage > playerStage) {
                return { label: '越阶强敌', className: 'danger', level: 4 };
            }
            // 同境界但层级更高
            if (monsterStage === playerStage && monsterLevel > playerLevel) {
                return { label: '高层压制', className: 'warn', level: 3 };
            }
            
            return { label: '仅供参考', className: 'neutral', level: 2 };
        },

        /**
         * 根据威胁等级判断是否需要雇护道
         * @param {Object} threat - 威胁等级对象
         * @returns {boolean}
         */
        needGuardianByThreat(threat) {
            const cfg = CONFIG.guardian;
            if (!cfg.threatLevel || cfg.threatLevel === 'none') {
                return true; // 不判断威胁等级，总是雇护道
            }
            
            const thresholdMap = {
                'safe': 1,      // 只有可稳战才不雇
                'neutral': 2,   // 势均力敌及以下不雇
                'warn': 3,      // 警告及以下不雇
                'danger': 4     // 只有危险才雇
            };
            
            const threshold = thresholdMap[cfg.threatLevel] || 4;
            return threat.level >= threshold;
        },

        /**
         * 查找藏宝图
         * @param {Array} items - 物品列表
         */
        findTreasureMaps(items) {
            if (!Array.isArray(items)) {
                Logger.warn(`items不是数组: ${typeof items}`);
                return [];
            }
            const maps = items.filter(item => {
                const name = item.name || '';
                const hasKeyword = name.includes('藏宝图');
                const count = item.quantity || item.count || 0;
                const isTreasureMap = item.templateId === 'treasure_map' || hasKeyword;
                return isTreasureMap && count > 0;
            });
            return maps.sort((a, b) => (a.quantity || a.count || 0) - (b.quantity || b.count || 0));
        },

        /**
         * 处理藏宝图
         * @param {Array} maps - 藏宝图列表
         * @param {number} remainingToOpen - 剩余可开启数量
         */
        async processMaps(maps, remainingToOpen) {
            STATE.isOpeningMap = true;
            let openedCount = 0;
            const BATCH_SIZE = Math.min(CONFIG.batchSize || 10, 10);

            for (let i = 0; i < maps.length && STATE.running; i++) {
                const map = maps[i];
                let mapQuantity = map.quantity || map.count || 1;

                // 限制本次最多开启 remainingToOpen 张
                if (openedCount + mapQuantity > remainingToOpen) {
                    mapQuantity = remainingToOpen - openedCount;
                }

                while (mapQuantity > 0 && STATE.running) {
                    if (openedCount >= remainingToOpen) {
                        Logger.info(`已达到本次计划上限 ${remainingToOpen} 张，停止`);
                        STATE.isOpeningMap = false;
                        return;
                    }

                    const batchSize = Math.min(mapQuantity, BATCH_SIZE);

                    try {
                        Logger.info(`正在开启: ${map.name} x${batchSize}...`);
                        const res = await API.useTreasureMap(map.id, batchSize);

                        if (res.code === 200) {
                            const result = res.data;

                            // 简单计数（用于循环控制），实际数量在 openAllMaps 结束时校正
                            // 注意：这里不直接累加到 STATE.stats.mapsOpened，避免遇敌时统计不准
                            openedCount += batchSize;

                            if (result && typeof result === 'object' && result.type === 'encounter') {
                                const monsterName = result.monsterName || result.treasureLevelName || '守卫';
                                const monsterHp = parseInt(result.monsterHp) || 0;
                                const monsterAtk = parseInt(result.monsterAtk) || 0;
                                Logger.warn(`遇到守卫: ${monsterName} (生命:${monsterHp} 攻击:${monsterAtk})`);
                                STATE.stats.battlesEncountered++;

                                // 计算威胁等级 - 传入完整的 API 返回数据
                                const threat = this.classifyThreat(result);
                                const classNameLabel = {
                                    'danger': '危险',
                                    'warn': '警告', 
                                    'neutral': '一般',
                                    'safe': '安全'
                                }[threat.className] || threat.className;
                                Logger.info(`威胁评估: ${threat.label} (${classNameLabel})`);

                                // 判断是否需要雇护道（仅根据威胁等级）
                                const cfg = CONFIG.guardian;
                                const needGuardian = cfg.enabled && this.needGuardianByThreat(threat);

                                if (!cfg.enabled) {
                                    Logger.warn('自动雇护道已禁用');
                                    Logger.info('已暂停，请手动处理');
                                    STATE.isOpeningMap = false;
                                    await this.stop();
                                    return;
                                } else if (!needGuardian) {
                                    const thresholdLabel = {
                                        'none': '不判断',
                                        'safe': '可稳战',
                                        'neutral': '势均力敌',
                                        'warn': '警告',
                                        'danger': '危险'
                                    }[cfg.threatLevel] || cfg.threatLevel;
                                    Logger.info(`威胁等级"${threat.label}"低于"${thresholdLabel}"，不雇护道，自动迎战`);
                                    // 自动选择战斗
                                    const fightRes = await API.combatChoice('fight');
                                    if (fightRes.code === 200 && fightRes.data) {
                                        Logger.success('已选择迎战，等待战斗结束...');
                                        await this.waitForBattle();
                                        Logger.info('战斗结束，继续开图');
                                    } else {
                                        Logger.error('迎战失败: ' + (fightRes.message || '未知错误'));
                                        STATE.isOpeningMap = false;
                                        await this.stop();
                                        return;
                                    }
                                } else {
                                    const hired = await this.tryHireGuardian();
                                    if (hired) {
                                        Logger.success('雇护道成功，等待战斗...');
                                        STATE.stats.guardianHired++;
                                        await this.waitForBattle();
                                        Logger.info('战斗结束，继续开图');
                                    } else {
                                        Logger.warn('雇护道失败');
                                        Logger.info('已暂停，请手动处理');
                                        STATE.isOpeningMap = false;
                                        await this.stop();
                                        return;
                                    }
                                }
                            } else if (typeof result === 'string') {
                                Logger.success(result);
                                if (result.includes('获得')) {
                                    STATE.stats.rewards.push(result);
                                    StatsManager.addReward(result);
                                }
                            } else if (Array.isArray(result)) {
                                Logger.success(`批量开启完成，共 ${result.length} 条结果`);
                                result.forEach(r => {
                                    if (typeof r === 'string' && r.includes('获得')) {
                                        STATE.stats.rewards.push(r);
                                        StatsManager.addReward(r);
                                    }
                                });
                            } else if (result && typeof result === 'object') {
                                const msg = result.message || result.msg || result.summary || JSON.stringify(result);
                                Logger.info(msg);
                            } else {
                                Logger.info('开启成功');
                            }
                        } else {
                            Logger.error(`开启失败: ${res.message || '未知错误'}`);
                            STATE.isOpeningMap = false;
                            await this.stop();
                            return;
                        }

                        mapQuantity -= batchSize;
                        
                        if (mapQuantity > 0 && STATE.running) {
                            const randomInterval = getRandomInterval(CONFIG.openInterval, CONFIG.openIntervalRandom);
                            await wait(randomInterval);
                        }
                    } catch (e) {
                        Logger.error(`开启失败: ${e.message}`);
                        STATE.isOpeningMap = false;
                        return;
                    }
                }
                
                if (i < maps.length - 1 && openedCount < remainingToOpen && STATE.running) {
                    const randomInterval = getRandomInterval(CONFIG.openInterval, CONFIG.openIntervalRandom);
                    await wait(randomInterval);
                }
            }

            STATE.isOpeningMap = false;
        },

        /**
         * 尝试雇用护道者
         */
        async tryHireGuardian() {
            try {
                const cfg = CONFIG.guardian;
                const priorityArr = cfg.priority.split(',');

                Logger.info(`尝试自动雇护道: 最高雇佣费=${cfg.maxFee}, 最低攻击力=${cfg.minAtk}`);

                const attempts = [
                    { maxFee: cfg.maxFee, minAtk: cfg.minAtk, desc: '完整条件' },
                    { maxFee: cfg.maxFee, minAtk: cfg.minAtk, desc: '完整条件（重试1）' },
                    { maxFee: cfg.maxFee, minAtk: cfg.minAtk, desc: '完整条件（重试2）' },
                    { maxFee: cfg.maxFee * 2, minAtk: cfg.minAtk, desc: '加价100%' }
                ];

                for (let i = 0; i < attempts.length; i++) {
                    const attempt = attempts[i];
                    if (i > 0) {
                        Logger.info(`第${i + 1}次尝试: ${attempt.desc}`);
                        await wait(1000);
                    }

                    const res = await API.autoHireGuardian({
                        mode: cfg.mode,
                        maxFee: attempt.maxFee,
                        minAtk: attempt.minAtk,
                        priority: priorityArr
                    });

                    if (res.code === 429) {
                        await wait(600);
                        const retryRes = await API.autoHireGuardian({
                            mode: cfg.mode,
                            maxFee: attempt.maxFee,
                            minAtk: attempt.minAtk,
                            priority: priorityArr
                        });
                        if (retryRes.code === 200 && retryRes.data?.combat) {
                            Logger.success(`雇护道成功（${attempt.desc}）`);
                            return true;
                        }
                    }

                    if (res.code === 200 && res.data?.combat) {
                        Logger.success(`雇护道成功（${attempt.desc}）`);
                        return true;
                    }

                    if (res.message) {
                        Logger.warn(`尝试${i + 1}失败: ${res.message}`);
                    }
                }

                Logger.error('雇护道失败: 所有重试方案均未能找到合适护道，停止开图');
                await this.stop();
                return false;
            } catch (e) {
                Logger.error(`雇护道出错: ${e.message}`);
                return false;
            }
        },

        /**
         * 等待战斗结束
         */
        async waitForBattle() {
            let attempts = 0;
            while (attempts < 60 && this.hasActiveBattle()) {
                await wait(1000);
                attempts++;
            }
            // 战斗结束后刷新游戏数据
            this.refreshGameData();
        },

        /**
         * 刷新游戏数据（玩家信息、背包、日志）
         */
        refreshGameData() {
            try {
                if (_win.loadPlayerInfo) {
                    _win.loadPlayerInfo(true);
                }
                if (_win.loadInventory) {
                    _win.loadInventory();
                }
                if (_win.loadGameLogs) {
                    _win.loadGameLogs();
                }
            } catch (e) {
                // 刷新失败不影响主流程
            }
        },

        /**
         * 检查是否有活动战斗
         */
        hasActiveBattle() {
            if (_win._encounterActive) return true;
            const encounterPanel = $('#encounterOverlay');
            const combatPanel = $('#combatPanel');
            if (encounterPanel && !encounterPanel.classList.contains('hidden')) return true;
            if (combatPanel && combatPanel.classList.contains('active')) return true;
            return false;
        },

        /**
         * 格式化奖励信息
         * @param {Array} rewards - 奖励列表
         */
        formatRewards(rewards) {
            if (!Array.isArray(rewards)) return '';
            return rewards.map(r => `${r.name||'未知'}x${r.count||1}`).join(', ');
        }
    };

    /**
     * 初始化函数
     */
    const init = () => {
        if (_win._autoMapInited) return;
        _win._autoMapInited = true;
        
        UI.init();
        MerchantAutoBuyer.init();
        AfkLoopManager.init();
        Logger.info('自动开藏宝图已加载，点击侧边栏"打开面板"使用');
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
