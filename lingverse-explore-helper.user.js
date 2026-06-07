// ==UserScript==
// @name         灵界 LingVerse 自动开藏宝图
// @namespace    lingverse-auto-map
// @version      2.42.0
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
    const SCRIPT_VERSION = '2.42.0';
    _win.LingVerseAutoMapVersion = SCRIPT_VERSION;
    const DEBUG_DECISION_HISTORY_LIMIT = 20;
    const DEBUG_LOG_HISTORY_LIMIT = 30;
    const DEBUG_SUMMARY_HISTORY_LIMIT = 8;
    const DEBUG_SUMMARY_TEXT_LIMIT = 150;

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
            resumeWindowSeconds: 60, // 事件/复活后允许恢复探索的时间窗口，0 为关闭
            autoRevive: false,       // 复活会花资源，默认关闭
            reviveMaxPerRun: 0,      // 单次挂机启动最多复活次数，0 为不限
            autoFight: false,        // 自动迎战会触发战斗，默认关闭
            autoHireGuardian: false, // 遭遇前按游戏护道设置自动雇护道，默认关闭
            useTalismans: false,     // 战斗符箓消耗品，默认关闭
            talismanMaxKinds: 5,      // 最多使用几种符
            talismanQuantity: 1,      // 每种符默认使用数量
            talismanFamilyOrder: '',  // 可选：按 family 白名单/顺序使用战斗符
            talismanMaxEncountersPerRun: 0, // 单次挂机启动最多用符遭遇数，0 为不限
            useNirvanaPill: false,   // 涅槃重生丹消耗品，默认关闭
            nirvanaMinRarity: 4,      // 默认只吃史诗及以上五行通灵丹
            nirvanaMaxPerRun: 0,      // 单次挂机启动最多用丹次数，0 为不限
            queueNirvanaPill: false,  // 已有五行通灵时是否继续排队
            autoDeclinePlayerEncounter: false, // 陌生道友邂逅默认暂停，开启后自动婉拒/离开
            autoReloadOnUpdate: false, // 页面提示游戏已更新时是否自动刷新，默认关闭
            adventureMode: 'pause',    // 奇遇链默认暂停，避免自动选择剧情分支
            adventureChoiceIndex: 1,    // fixed 模式下点击第几个奇遇选项，按界面顺序从1开始
            adventureChoiceMap: {}      // strategy 模式下按 adventureId 固定选择
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
        resumeWindowSeconds: 60,
        autoRevive: false,
        reviveMaxPerRun: 0,
        autoFight: false,
        autoHireGuardian: false,
        useTalismans: false,
        talismanMaxKinds: 5,
        talismanQuantity: 1,
        talismanFamilyOrder: '',
        talismanMaxEncountersPerRun: 0,
        useNirvanaPill: false,
        nirvanaMinRarity: 4,
        nirvanaMaxPerRun: 0,
        queueNirvanaPill: false,
        autoDeclinePlayerEncounter: false,
        autoReloadOnUpdate: false,
        adventureMode: 'pause',
        adventureChoiceIndex: 1,
        adventureChoiceMap: {}
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

    function detectGameUpdateNotice(text) {
        const source = String(text || '');
        return source.indexOf('灵界已更新新版本') >= 0 ||
            (source.indexOf('已更新新版本') >= 0 && source.indexOf('刷新') >= 0);
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

    function parseTalismanFamilyOrder(value) {
        const seen = new Set();
        const families = [];
        String(value || '').split(/[\s,，;；|]+/).forEach(part => {
            const family = part.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
            if (!family || seen.has(family)) return;
            seen.add(family);
            families.push(family);
        });
        return families;
    }

    function parseAdventureChoiceMapText(text) {
        const parsed = {};
        String(text || '').split(/[\n,;]+/).forEach(row => {
            const match = row.trim().match(/^(.+?)[=:]\s*(.+)$/);
            if (!match) return;
            parsed[match[1].trim()] = match[2].trim();
        });
        return parsed;
    }

    function normalizeAdventureChoiceMap(value) {
        let raw = {};
        if (typeof value === 'string') {
            const text = value.trim();
            if (!text) return {};
            try {
                const parsed = JSON.parse(text);
                raw = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                    ? parsed
                    : parseAdventureChoiceMapText(text);
            } catch (e) {
                raw = parseAdventureChoiceMapText(text);
            }
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
            raw = value;
        }

        const normalized = {};
        Object.keys(raw).forEach(key => {
            const id = String(key || '').trim();
            const choice = Number(raw[key]);
            if (!id || !Number.isFinite(choice) || choice <= 0) return;
            normalized[id] = Math.max(1, Math.min(10, Math.floor(choice)));
        });
        return normalized;
    }

    function formatAdventureChoiceMap(value) {
        const map = normalizeAdventureChoiceMap(value);
        return Object.keys(map).map(key => `${key}=${map[key]}`).join('\n');
    }

    function escapeHtmlText(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeAfkLoopConfig(config) {
        const cfg = Object.assign({}, CONFIG.afkLoop, config || {});
        cfg.enabled = !!cfg.enabled;
        cfg.meditationMinutes = clampNumber(cfg.meditationMinutes, 1, 720, 140);
        cfg.minSpirit = clampNumber(cfg.minSpirit, 0, 100000000, 20);
        cfg.exploreMultiplier = clampNumber(cfg.exploreMultiplier, 1, 50, 1);
        cfg.tickInterval = clampNumber(cfg.tickInterval, 5000, 300000, 30000);
        cfg.stallTimeoutSeconds = clampNumber(cfg.stallTimeoutSeconds, 0, 3600, 90);
        cfg.resumeWindowSeconds = clampNumber(cfg.resumeWindowSeconds, 0, 3600, 60);
        cfg.autoRevive = !!cfg.autoRevive;
        cfg.reviveMaxPerRun = clampNumber(cfg.reviveMaxPerRun, 0, 999, 0);
        cfg.autoFight = !!cfg.autoFight;
        cfg.autoHireGuardian = !!cfg.autoHireGuardian;
        cfg.useTalismans = !!cfg.useTalismans;
        cfg.talismanMaxKinds = clampNumber(cfg.talismanMaxKinds, 1, 5, 5);
        cfg.talismanQuantity = clampNumber(cfg.talismanQuantity, 1, 20, 1);
        cfg.talismanFamilyOrder = parseTalismanFamilyOrder(cfg.talismanFamilyOrder).join(',');
        cfg.talismanMaxEncountersPerRun = clampNumber(cfg.talismanMaxEncountersPerRun, 0, 999, 0);
        cfg.useNirvanaPill = !!cfg.useNirvanaPill;
        cfg.nirvanaMinRarity = clampNumber(cfg.nirvanaMinRarity, 1, 5, 4);
        cfg.nirvanaMaxPerRun = clampNumber(cfg.nirvanaMaxPerRun, 0, 999, 0);
        cfg.queueNirvanaPill = !!cfg.queueNirvanaPill;
        cfg.autoDeclinePlayerEncounter = !!cfg.autoDeclinePlayerEncounter;
        cfg.autoReloadOnUpdate = !!cfg.autoReloadOnUpdate;
        cfg.adventureMode = cfg.adventureMode === 'fixed' || cfg.adventureMode === 'strategy' ? cfg.adventureMode : 'pause';
        cfg.adventureChoiceIndex = clampNumber(cfg.adventureChoiceIndex, 1, 10, 1);
        cfg.adventureChoiceMap = normalizeAdventureChoiceMap(cfg.adventureChoiceMap);
        return cfg;
    }

    function normalizeAfkResourceUsage(usage) {
        const raw = usage && typeof usage === 'object' ? usage : {};
        return {
            revive: clampNumber(raw.revive, 0, 999, 0),
            talismanEncounters: clampNumber(raw.talismanEncounters, 0, 999, 0),
            nirvanaPills: clampNumber(raw.nirvanaPills, 0, 999, 0)
        };
    }

    function getAfkResourceBudgetSpec(kind) {
        const specs = {
            revive: { usageKey: 'revive', maxKey: 'reviveMaxPerRun' },
            talismanEncounters: { usageKey: 'talismanEncounters', maxKey: 'talismanMaxEncountersPerRun' },
            nirvanaPills: { usageKey: 'nirvanaPills', maxKey: 'nirvanaMaxPerRun' }
        };
        return specs[kind] || specs.revive;
    }

    function resolveAfkResourceBudget(kind, config, usage) {
        const cfg = normalizeAfkLoopConfig(config || {});
        const normalizedUsage = normalizeAfkResourceUsage(usage);
        const budgetKind = String(kind || 'revive');
        const spec = getAfkResourceBudgetSpec(budgetKind);
        const used = normalizedUsage[spec.usageKey] || 0;
        const maxPerRun = cfg[spec.maxKey] || 0;
        const limited = maxPerRun > 0;
        const remaining = limited ? Math.max(0, maxPerRun - used) : null;
        const allowed = !limited || used < maxPerRun;
        return {
            schema: 'lingverse-afk-resource-budget/v1',
            kind: budgetKind,
            used,
            maxPerRun,
            limited,
            remaining,
            allowed,
            reason: allowed ? 'available' : 'budget-exhausted'
        };
    }

    function formatAfkReason(reason) {
        const labels = {
            disabled: '未启用',
            'game-update-available': '游戏有更新，等待刷新',
            'game-update-auto-reload': '游戏有更新，自动刷新',
            'merchant-active': '云游商人处理中',
            'encounter-active': '遭遇或战斗处理中',
            'adventure-active': '奇遇链等待处理',
            'adventure-auto-choice': '奇遇链固定选择',
            'adventure-strategy-choice': '奇遇链按ID策略选择',
            'player-encounter-active': '陌生道友邂逅等待处理',
            'player-encounter-auto-decline': '自动婉拒陌生道友',
            'immortal-prison': '混天典狱状态，挂机暂停',
            dead: '角色已陨落',
            meditating: '冥想未到结束条件',
            'spirit-full': '神识已满',
            'meditation-duration-reached': '冥想时长已到',
            'auto-explore-running': '自动探索运行中',
            'auto-explore-low-spirit': '自动探索中神识低于阈值',
            'explore-stalled': '探索疑似卡住',
            'explore-disabled-no-spirit': '不可探索且疑似神识不足',
            'explore-disabled': '当前区域不可探索',
            'spirit-below-threshold': '神识低于阈值',
            'spirit-ready': '神识可探索',
            'post-revive-ready': '复活后神识可探索',
            'post-revive-low-spirit': '复活后神识不足',
            'post-interaction-ready': '事件/战斗后神识可探索',
            'post-interaction-low-spirit': '事件/战斗后神识不足',
            'dead-auto-revive-enabled': '已开启自动复活',
            'revive-budget-exhausted': '复活次数已到本轮上限',
            'encounter-auto-guardian-enabled': '已开启遭遇前自动护道',
            'encounter-auto-fight-enabled': '已开启自动迎战',
            'talisman-budget-exhausted': '战斗符箓次数已到本轮上限',
            'nirvana-budget-exhausted': '涅槃重生丹次数已到本轮上限'
        };
        return labels[reason] || reason || '状态变化';
    }

    function formatAfkAction(action) {
        const labels = {
            idle: '空闲',
            wait: '等待',
            revive: '复活',
            startMeditation: '进入冥想',
            stopMeditation: '结束冥想',
            startAutoExplore: '启动探索',
            handleEncounter: '处理遭遇',
            handlePlayerEncounter: '处理陌生道友',
            handleAdventure: '处理奇遇',
            reloadPage: '刷新页面'
        };
        return labels[action] || action || '等待';
    }

    function buildAfkPanelStatus(config, decisionHistory, runtime, now) {
        const cfg = normalizeAfkLoopConfig(config || {});
        const currentTime = Number.isFinite(Number(now)) ? Number(now) : Date.now();
        const stateText = cfg.enabled ? '运行中' : '未启动';
        if (!cfg.enabled) {
            return {
                stateText,
                currentDecisionText: '未启动',
                lastActionText: '暂无',
                nextCheckText: '未启动',
                nextCheckInSeconds: null
            };
        }

        const history = Array.isArray(decisionHistory) ? decisionHistory : [];
        const last = history.length ? history[history.length - 1] : null;
        const currentDecisionText = last ? formatAfkReason(last.reason) : '等待首次检查';
        const lastActionText = last
            ? `${formatAfkAction(last.action)} · ${formatAfkReason(last.reason)}`
            : '暂无';
        const busy = !!(runtime && runtime.busy);
        const lastEvaluationAt = Math.max(0, toFiniteNumber(runtime && runtime.lastEvaluationAt, 0));

        if (busy) {
            return {
                stateText,
                currentDecisionText,
                lastActionText,
                nextCheckText: '检查中',
                nextCheckInSeconds: 0
            };
        }
        if (!lastEvaluationAt) {
            return {
                stateText,
                currentDecisionText,
                lastActionText,
                nextCheckText: '等待首次检查',
                nextCheckInSeconds: 0
            };
        }

        const remainingMs = Math.max(0, lastEvaluationAt + cfg.tickInterval - currentTime);
        const seconds = Math.ceil(remainingMs / 1000);
        return {
            stateText,
            currentDecisionText,
            lastActionText,
            nextCheckText: seconds <= 0 ? '即将检查' : `${seconds}秒后`,
            nextCheckInSeconds: seconds
        };
    }

    function parseAfkHistoryTime(value) {
        const parsed = Date.parse(String(value || ''));
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function resolveAfkDiagnosisNow(now, fallback) {
        const direct = Number(now);
        if (Number.isFinite(direct)) return direct;
        const parsed = parseAfkHistoryTime(fallback);
        return parsed || Date.now();
    }

    function formatAfkElapsedDuration(seconds) {
        const safeSeconds = Math.max(0, Math.round(toFiniteNumber(seconds, 0)));
        if (safeSeconds < 60) return `${safeSeconds}秒`;
        const minutes = Math.max(1, Math.round(safeSeconds / 60));
        if (minutes < 60) return `${minutes}分钟`;
        const hours = Math.floor(minutes / 60);
        const restMinutes = minutes % 60;
        return restMinutes ? `${hours}小时${restMinutes}分钟` : `${hours}小时`;
    }

    function normalizeAfkPhaseStatus(status) {
        const source = status && typeof status === 'object' ? status : {};
        return {
            schema: 'lingverse-afk-phase-status/v1',
            phase: String(source.phase || 'unknown'),
            label: String(source.label || ''),
            text: String(source.text || ''),
            reason: String(source.reason || ''),
            elapsedSeconds: optionalNumberOrNull(source.elapsedSeconds),
            remainingSeconds: optionalNumberOrNull(source.remainingSeconds),
            targetSeconds: optionalNumberOrNull(source.targetSeconds)
        };
    }

    function buildAfkPhaseStatus(state, config, decision, now) {
        const cfg = normalizeAfkLoopConfig(config || {});
        const snapshot = state || {};
        const currentDecision = decision && typeof decision === 'object' ? decision : {};
        const reason = String(currentDecision.reason || '');
        const currentTime = Number.isFinite(Number(now)) ? Number(now) : Date.now();
        const make = (phase, label, text, extra) => normalizeAfkPhaseStatus(Object.assign({
            phase,
            label,
            text,
            reason,
            elapsedSeconds: null,
            remainingSeconds: null,
            targetSeconds: null
        }, extra || {}));

        if (!cfg.enabled) {
            return make('idle', '未启动', '未启动');
        }

        if (snapshot.isMeditating) {
            const elapsedSeconds = Math.max(0, Math.round(getMeditationElapsedMs(snapshot, currentTime) / 1000));
            const targetSeconds = Math.max(0, Math.round(cfg.meditationMinutes * 60));
            const spirit = Math.max(0, toFiniteNumber(snapshot.spirit, 0));
            const maxSpirit = Math.max(0, toFiniteNumber(snapshot.maxSpirit, 0));
            const fullSpirit = maxSpirit > 0 && spirit >= maxSpirit;
            const remainingSeconds = fullSpirit ? 0 : Math.max(0, targetSeconds - elapsedSeconds);
            const text = fullSpirit
                ? `冥想中 · 已冥想${formatAfkElapsedDuration(elapsedSeconds)} · 神识已满，准备结束`
                : `冥想中 · 已冥想${formatAfkElapsedDuration(elapsedSeconds)} · 计划剩余${formatAfkElapsedDuration(remainingSeconds)} · 满神识提前结束`;
            return make('meditating', '冥想中', text, {
                elapsedSeconds,
                remainingSeconds,
                targetSeconds
            });
        }

        if (snapshot.gameUpdateNoticeActive ||
            snapshot.immortalPrisonActive ||
            snapshot.isDead ||
            snapshot.merchantActive ||
            snapshot.encounterActive ||
            snapshot.combatActive ||
            snapshot.playerEncounterActive ||
            snapshot.adventureActive) {
            return make('blocked', '阻塞', `阻塞 · ${formatAfkReason(reason)}`);
        }

        if (snapshot.postReviveResume || snapshot.postInteractionResume) {
            const label = snapshot.postReviveResume ? '复活恢复窗口' : '事件恢复窗口';
            return make('resuming', label, `${label} · 神识足够则继续探索，不足则回冥想`);
        }

        if (snapshot.autoExploreRunning || snapshot.autoExplorePending) {
            const label = snapshot.autoExplorePending ? '探索恢复挂起' : '探索中';
            const staleText = snapshot.exploreStalled ? ' · 疑似卡住' : '';
            return make('exploring', label, `${label}${staleText} · ${cfg.exploreMultiplier}倍 · 卡住判定${cfg.stallTimeoutSeconds}秒`, {
                targetSeconds: cfg.stallTimeoutSeconds
            });
        }

        if (reason === 'spirit-below-threshold' || reason === 'explore-disabled-no-spirit') {
            return make('needs-meditation', '待冥想', `待冥想 · ${formatAfkReason(reason)}`);
        }
        if (currentDecision.action === 'startAutoExplore') {
            return make('ready-to-explore', '待探索', `待探索 · ${cfg.exploreMultiplier}倍`);
        }
        if (currentDecision.action === 'startMeditation') {
            return make('ready-to-meditate', '待冥想', `待冥想 · 计划${cfg.meditationMinutes}分钟`);
        }

        return make('waiting', '等待', `等待 · ${formatAfkReason(reason)}`);
    }

    function buildEmptyAfkWaitingDiagnosis(action, reason, repeatCount, elapsedSeconds, firstAt, lastAt) {
        return {
            schema: 'lingverse-afk-wait-diagnosis/v1',
            active: false,
            severity: 'normal',
            category: 'none',
            action: String(action || ''),
            reason: String(reason || ''),
            label: formatAfkReason(reason),
            repeatCount: Math.max(0, Math.floor(toFiniteNumber(repeatCount, 0))),
            elapsedSeconds: Math.max(0, Math.round(toFiniteNumber(elapsedSeconds, 0))),
            firstAt: String(firstAt || ''),
            lastAt: String(lastAt || ''),
            message: '',
            suggestion: ''
        };
    }

    function getAfkWaitingDiagnosisMeta(reason, action) {
        const labels = {
            'merchant-active': {
                category: 'auto-blocker',
                suggestion: '确认云游商人窗口是否仍在，或复制摘要给开发者检查商人自动购买'
            },
            'encounter-active': {
                category: 'manual-action',
                suggestion: '处理当前遭遇，或开启遭遇前自动护道/自动迎战后再启动挂机'
            },
            'player-encounter-active': {
                category: 'manual-action',
                suggestion: '处理陌生道友邂逅，或开启自动婉拒后再启动挂机'
            },
            'adventure-active': {
                category: 'manual-action',
                suggestion: '处理当前奇遇，或在摘要回放里导入奇遇策略后再启动挂机'
            },
            'immortal-prison': {
                category: 'hard-stop',
                suggestion: '混天典狱需要手动处理，脚本不会自动跳过'
            },
            dead: {
                category: 'manual-action',
                suggestion: '手动复活，或确认资源风险后开启自动复活'
            },
            'revive-budget-exhausted': {
                category: 'resource-budget',
                suggestion: '本轮复活次数已达上限，检查死亡原因后重新启动或调高上限'
            },
            'talisman-budget-exhausted': {
                category: 'resource-budget',
                suggestion: '本轮用符遭遇数已达上限，检查战斗风险后重新启动或调高上限'
            },
            'nirvana-budget-exhausted': {
                category: 'resource-budget',
                suggestion: '本轮用丹次数已达上限，检查丹药状态后重新启动或调高上限'
            },
            'explore-disabled': {
                category: 'manual-action',
                suggestion: '当前区域不可探索，换区域或查看页面提示后再启动挂机'
            }
        };
        if (labels[reason]) return labels[reason];
        if (action && action !== 'wait' && action !== 'idle') {
            return {
                category: 'auto-action',
                suggestion: '自动处理动作重复未前进，复制摘要给开发者定位执行结果'
            };
        }
        return {
            category: 'unknown',
            suggestion: '复制状态和摘要给开发者，补充这个等待原因的自动化策略'
        };
    }

    function getAfkWaitingDiagnosisThresholdSeconds(config) {
        const cfg = normalizeAfkLoopConfig(config || {});
        const tickSeconds = Math.ceil(cfg.tickInterval / 1000);
        const stallSeconds = cfg.stallTimeoutSeconds > 0 ? cfg.stallTimeoutSeconds * 2 : 0;
        return Math.max(120, tickSeconds * 4, stallSeconds);
    }

    function buildAfkWaitingDiagnosis(decisionHistory, config, now) {
        const history = normalizeDecisionHistory(decisionHistory);
        if (!history.length) return buildEmptyAfkWaitingDiagnosis('', '', 0, 0, '', '');

        const last = history[history.length - 1] || {};
        const action = String(last.action || '');
        const reason = String(last.reason || '');
        if (!action && !reason) return buildEmptyAfkWaitingDiagnosis(action, reason, 0, 0, '', '');

        const repeated = [];
        for (let i = history.length - 1; i >= 0; i -= 1) {
            const record = history[i] || {};
            if (String(record.action || '') !== action || String(record.reason || '') !== reason) break;
            repeated.unshift(record);
        }

        const first = repeated[0] || last;
        const firstAt = String(first.at || '');
        const lastAt = String(last.at || '');
        const currentTime = resolveAfkDiagnosisNow(now, lastAt || firstAt);
        const firstTime = parseAfkHistoryTime(firstAt);
        const elapsedSeconds = firstTime ? Math.max(0, Math.round((currentTime - firstTime) / 1000)) : 0;
        const base = buildEmptyAfkWaitingDiagnosis(action, reason, repeated.length, elapsedSeconds, firstAt, lastAt);
        const cfg = normalizeAfkLoopConfig(config || {});
        const thresholdSeconds = getAfkWaitingDiagnosisThresholdSeconds(cfg);
        const repeatThreshold = 4;

        if (repeated.length < repeatThreshold || elapsedSeconds < thresholdSeconds) return base;
        if (reason === 'disabled') return base;
        if (reason === 'auto-explore-running' && elapsedSeconds < thresholdSeconds * 2) return base;
        if (reason === 'meditating' && elapsedSeconds <= (cfg.meditationMinutes * 60 + thresholdSeconds)) return base;

        const meta = getAfkWaitingDiagnosisMeta(reason, action);
        const durationText = formatAfkElapsedDuration(elapsedSeconds);
        const label = formatAfkReason(reason);
        const extra = meta.category === 'unknown' || meta.category === 'auto-action'
            ? '，建议复制摘要定位'
            : '，需要手动处理或配置自动策略';
        const message = `${label}已持续${durationText}（连续${repeated.length}次）${extra}`;

        return {
            schema: 'lingverse-afk-wait-diagnosis/v1',
            active: true,
            severity: meta.category === 'hard-stop' ? 'stop' : 'warning',
            category: meta.category,
            action,
            reason,
            label,
            repeatCount: repeated.length,
            elapsedSeconds,
            firstAt,
            lastAt,
            message,
            suggestion: meta.suggestion
        };
    }

    function summarizeAfkWaitingDiagnosis(diagnosis) {
        const source = diagnosis && typeof diagnosis === 'object' ? diagnosis : {};
        return {
            schema: 'lingverse-afk-wait-diagnosis/v1',
            active: !!source.active,
            severity: sanitizeDebugText(source.severity || (source.active ? 'warning' : 'normal'), 40),
            category: sanitizeDebugText(source.category || 'none', 60),
            action: sanitizeDebugText(source.action || '', 40),
            reason: sanitizeDebugText(source.reason || '', 80),
            label: sanitizeDebugText(source.label || formatAfkReason(source.reason), 80),
            repeatCount: Math.max(0, Math.floor(toFiniteNumber(source.repeatCount, 0))),
            elapsedSeconds: Math.max(0, Math.round(toFiniteNumber(source.elapsedSeconds, 0))),
            firstAt: sanitizeDebugText(source.firstAt || '', 40),
            lastAt: sanitizeDebugText(source.lastAt || '', 40),
            message: sanitizeDebugText(source.message || '', DEBUG_SUMMARY_TEXT_LIMIT),
            suggestion: sanitizeDebugText(source.suggestion || '', DEBUG_SUMMARY_TEXT_LIMIT)
        };
    }

    function formatGuardianMode(mode) {
        return mode === 'alone' ? '独立作战' : '协同作战';
    }

    function formatRarityThreshold(rarity) {
        const labels = {
            1: '任意',
            2: '优良+',
            3: '稀有+',
            4: '史诗+',
            5: '传说+'
        };
        return labels[rarity] || `${rarity}+`;
    }

    function formatAfkRunLimit(value) {
        const limit = clampNumber(value, 0, 999, 0);
        return limit > 0 ? `本轮上限${limit}` : '不限';
    }

    function buildAfkRiskStatus(config, guardianConfig, resourceUsage) {
        const cfg = normalizeAfkLoopConfig(config || {});
        const guardian = normalizeGuardianConfig(guardianConfig || {});
        const reviveBudget = resolveAfkResourceBudget('revive', cfg, resourceUsage);
        const talismanBudget = resolveAfkResourceBudget('talismanEncounters', cfg, resourceUsage);
        const nirvanaBudget = resolveAfkResourceBudget('nirvanaPills', cfg, resourceUsage);
        const adventureAuto = cfg.adventureMode === 'fixed' || cfg.adventureMode === 'strategy';
        const riskFlags = [
            cfg.autoFight,
            cfg.autoHireGuardian,
            cfg.autoRevive,
            cfg.useTalismans,
            cfg.useNirvanaPill,
            cfg.autoDeclinePlayerEncounter,
            adventureAuto
        ];
        const enabledRiskCount = riskFlags.filter(Boolean).length;
        let profileText = '自定义挂机模式';
        if (cfg.exploreMultiplier >= 50 && (cfg.autoFight || cfg.autoRevive || cfg.useTalismans || cfg.useNirvanaPill)) {
            profileText = '富裕战斗模式';
        } else if (cfg.exploreMultiplier <= 1 && cfg.autoHireGuardian && !cfg.autoFight && !cfg.autoRevive && !cfg.useTalismans && !cfg.useNirvanaPill) {
            profileText = '稳妥护道模式';
        } else if (enabledRiskCount === 0) {
            profileText = '保守等待模式';
        }

        const warnings = [];
        if (cfg.autoHireGuardian && !guardian.enabled) {
            warnings.push('自动护道已开启，但游戏护道设置关闭');
        }
        if (cfg.useNirvanaPill && cfg.nirvanaMinRarity < 4) {
            warnings.push('涅槃重生丹最低品质低于史诗');
        }
        if (cfg.adventureMode === 'strategy' && Object.keys(cfg.adventureChoiceMap || {}).length === 0) {
            warnings.push('奇遇策略模式已开启，但策略表为空');
        }
        if (cfg.autoRevive && !reviveBudget.allowed) {
            warnings.push('自动复活已到本轮上限');
        }
        if (cfg.useTalismans && !talismanBudget.allowed) {
            warnings.push('战斗符箓已到本轮上限');
        }
        if (cfg.useNirvanaPill && !nirvanaBudget.allowed) {
            warnings.push('涅槃重生丹已到本轮上限');
        }

        const guardianDetails = [];
        if (cfg.autoHireGuardian) {
            guardianDetails.push(guardian.enabled ? '游戏护道开' : '游戏护道关');
            guardianDetails.push(formatGuardianMode(guardian.mode));
            guardianDetails.push(`最高${guardian.maxFee || '不限'}`);
            if (guardian.minAtk > 0) guardianDetails.push(`攻≥${guardian.minAtk}`);
            guardianDetails.push(guardian.priority.join('>'));
        }

        const talismanOrder = parseTalismanFamilyOrder(cfg.talismanFamilyOrder);
        const itemTexts = [
            `自动迎战: ${cfg.autoFight ? `开启 · ${cfg.exploreMultiplier}倍探索` : '关闭'}`,
            `自动护道: ${cfg.autoHireGuardian ? `开启 · ${guardianDetails.join(' · ')}` : '关闭'}`,
            `自动复活: ${cfg.autoRevive ? `开启 · ${formatAfkRunLimit(cfg.reviveMaxPerRun)}` : '关闭'}`,
            `战斗用符: ${cfg.useTalismans ? `开启 · ${cfg.talismanMaxKinds}种×${cfg.talismanQuantity} · ${talismanOrder.length ? talismanOrder.join('>') : '按品质'} · ${formatAfkRunLimit(cfg.talismanMaxEncountersPerRun)}` : '关闭'}`,
            `涅槃重生丹: ${cfg.useNirvanaPill ? `开启 · ${formatRarityThreshold(cfg.nirvanaMinRarity)} · ${cfg.queueNirvanaPill ? '允许排队' : '不排队'} · ${formatAfkRunLimit(cfg.nirvanaMaxPerRun)}` : '关闭'}`,
            `陌生道友婉拒: ${cfg.autoDeclinePlayerEncounter ? '开启' : '关闭'}`,
            `奇遇自动选择: ${adventureAuto ? `开启 · ${cfg.adventureMode}` : '关闭'}`
        ];

        return {
            schema: 'lingverse-afk-risk-status/v1',
            profileText,
            enabledRiskCount,
            totalRiskCount: riskFlags.length,
            warningCount: warnings.length,
            summaryText: `${profileText} · 风险开关 ${enabledRiskCount}/${riskFlags.length} · 警告 ${warnings.length}`,
            itemTexts,
            warnings
        };
    }

    function buildAfkConfigPack(config, guardianConfig, context) {
        const cfg = normalizeAfkLoopConfig(config || {});
        const guardian = normalizeGuardianConfig(guardianConfig || {});
        const meta = context && typeof context === 'object' ? context : {};
        return {
            schema: 'lingverse-afk-config-pack/v1',
            scriptVersion: SCRIPT_VERSION,
            createdAt: String(meta.createdAt || new Date().toISOString()),
            label: sanitizeDebugName(meta.label || '', 80),
            afkLoop: cfg,
            guardian: guardian,
            riskStatus: buildAfkRiskStatus(cfg, guardian)
        };
    }

    function parseAfkConfigPackSource(source) {
        if (typeof source === 'string') {
            const text = source.trim();
            if (!text) throw new Error('配置包为空');
            return JSON.parse(text);
        }
        if (source && typeof source === 'object') return source;
        throw new Error('配置包格式无效');
    }

    function resolveAfkConfigPackImport(source, options) {
        const parsed = parseAfkConfigPackSource(source);
        const pack = parsed && parsed.schema === 'lingverse-afk-config-pack/v1'
            ? parsed
            : buildAfkConfigPack(parsed.afkLoop || parsed, parsed.guardian || {}, parsed);
        const importOptions = options && typeof options === 'object' ? options : {};
        const cfg = normalizeAfkLoopConfig(pack.afkLoop || {});
        const importWarnings = [];
        if (cfg.enabled && !importOptions.allowEnabled) {
            cfg.enabled = false;
            importWarnings.push('导入时已关闭挂机启动状态');
        }
        const guardian = normalizeGuardianConfig(pack.guardian || {});
        return {
            schema: 'lingverse-afk-config-import/v1',
            sourceSchema: String(pack.schema || ''),
            scriptVersion: String(pack.scriptVersion || SCRIPT_VERSION),
            importedAt: String(importOptions.importedAt || new Date().toISOString()),
            label: sanitizeDebugName(pack.label || '', 80),
            afkLoop: cfg,
            guardian: guardian,
            riskStatus: buildAfkRiskStatus(cfg, guardian),
            importWarnings
        };
    }

    function normalizeGuardianPriority(value) {
        const allowed = new Set(['incarnation', 'normal', 'body']);
        const seen = new Set();
        const priority = [];
        String(value || '').split(/[\s,，;；|]+/).forEach(part => {
            const key = part.trim().toLowerCase();
            if (!allowed.has(key) || seen.has(key)) return;
            seen.add(key);
            priority.push(key);
        });
        ['incarnation', 'normal', 'body'].forEach(key => {
            if (!seen.has(key)) priority.push(key);
        });
        return priority;
    }

    function normalizeGuardianConfig(config) {
        const cfg = Object.assign({}, CONFIG.guardian, config || {});
        const priority = normalizeGuardianPriority(Array.isArray(cfg.priority) ? cfg.priority.join(',') : cfg.priority);
        return {
            enabled: !!cfg.enabled,
            maxFee: clampNumber(cfg.maxFee, 0, 100000000, 0),
            minAtk: clampNumber(cfg.minAtk, 0, 100000000, 0),
            mode: cfg.mode === 'alone' ? 'alone' : 'together',
            priority: priority,
            priorityKey: priority.join(','),
            threatLevel: cfg.threatLevel || 'danger'
        };
    }

    function buildGuardianHirePayload(config) {
        const cfg = normalizeGuardianConfig(config || {});
        return {
            mode: cfg.mode,
            maxFee: cfg.maxFee,
            minAtk: cfg.minAtk,
            priority: cfg.priority.slice()
        };
    }

    function getCurrentGuardianConfig() {
        let pageConfig = null;
        try {
            if (typeof _win.getAutoHireConfig === 'function') {
                pageConfig = _win.getAutoHireConfig();
            }
        } catch (e) {}
        if (pageConfig && typeof pageConfig === 'object') {
            return normalizeGuardianConfig(Object.assign({}, CONFIG.guardian, pageConfig, {
                priority: Array.isArray(pageConfig.priority) ? pageConfig.priority.join(',') : pageConfig.priorityKey
            }));
        }
        return normalizeGuardianConfig(CONFIG.guardian);
    }

    function applyAfkPreset(config, presetName) {
        const current = normalizeAfkLoopConfig(config || {});
        const preserved = {
            enabled: current.enabled,
            adventureMode: current.adventureMode,
            adventureChoiceIndex: current.adventureChoiceIndex,
            adventureChoiceMap: current.adventureChoiceMap
        };
        const common = {
            meditationMinutes: 140,
            minSpirit: 20,
            tickInterval: 30000,
            stallTimeoutSeconds: 90,
            resumeWindowSeconds: current.resumeWindowSeconds,
            reviveMaxPerRun: 0,
            talismanMaxKinds: 5,
            talismanQuantity: 1,
            talismanFamilyOrder: current.talismanFamilyOrder,
            talismanMaxEncountersPerRun: 0,
            nirvanaMinRarity: 4,
            nirvanaMaxPerRun: 0,
            queueNirvanaPill: false
        };

        if (presetName === 'steady') {
            return normalizeAfkLoopConfig(Object.assign({}, current, common, {
                exploreMultiplier: 1,
                autoRevive: false,
                autoFight: false,
                autoHireGuardian: false,
                useTalismans: false,
                useNirvanaPill: false,
                autoDeclinePlayerEncounter: false
            }, preserved));
        }

        if (presetName === 'rich') {
            return normalizeAfkLoopConfig(Object.assign({}, current, common, {
                exploreMultiplier: 50,
                autoRevive: true,
                autoFight: true,
                autoHireGuardian: false,
                useTalismans: true,
                useNirvanaPill: true,
                reviveMaxPerRun: 1,
                talismanMaxEncountersPerRun: 3,
                nirvanaMaxPerRun: 1,
                autoDeclinePlayerEncounter: true
            }, preserved));
        }

        return current;
    }

    function getResumeWindowMs(config) {
        return normalizeAfkLoopConfig(config || {}).resumeWindowSeconds * 1000;
    }

    function isExploreStalledState(state, config, now) {
        const cfg = normalizeAfkLoopConfig(config || {});
        const timeoutMs = cfg.stallTimeoutSeconds * 1000;
        if (timeoutMs <= 0) return false;
        const snapshot = state || {};
        if (!snapshot.autoExploreRunning && !snapshot.autoExplorePending) return false;
        const currentTime = Number.isFinite(Number(now)) ? Number(now) : Date.now();
        const lastProgressAt = toFiniteNumber(snapshot.lastExploreProgressAt, 0);
        return lastProgressAt > 0 && (currentTime - lastProgressAt) >= timeoutMs;
    }

    function resolveAdventureChoiceIndex(adventureId, config) {
        const cfg = normalizeAfkLoopConfig(config || {});
        if (cfg.adventureMode === 'fixed') {
            return cfg.adventureChoiceIndex;
        }
        if (cfg.adventureMode === 'strategy') {
            if (adventureId === null || typeof adventureId === 'undefined' || adventureId === '') return 0;
            return cfg.adventureChoiceMap[String(adventureId)] || 0;
        }
        return 0;
    }

    function getAdventureChoiceReason(config) {
        return config && config.adventureMode === 'strategy' ? 'adventure-strategy-choice' : 'adventure-auto-choice';
    }

    function rememberAdventureStep(step) {
        if (!step || !step.adventureId) return;
        _win._lingverseAutoMapLastAdventureStep = {
            adventureId: step.adventureId,
            step: step.step,
            totalSteps: step.totalSteps,
            isComplete: !!step.isComplete,
            choices: Array.isArray(step.choices) ? step.choices.slice() : []
        };
    }

    function installAdventureStepHook() {
        if (_win._lingverseAutoMapAdventureHookInstalled) return true;
        if (typeof _win.showAdventureStep !== 'function') return false;
        const original = _win.showAdventureStep;
        const wrapped = function(step) {
            rememberAdventureStep(step);
            return original.apply(this, arguments);
        };
        wrapped._lingverseAutoMapWrapped = true;
        _win.showAdventureStep = wrapped;
        _win._lingverseAutoMapAdventureHookInstalled = true;
        return true;
    }

    function getItemId(item) {
        const id = item && (item.id ?? item.itemId);
        const parsed = parseInt(id, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    }

    function getItemRarity(item) {
        const explicit = parseInt(item && item.rarity, 10);
        if (Number.isFinite(explicit) && explicit > 0) return explicit;
        const match = String(item && item.templateId || '').match(/_(\d+)$/);
        const fromTemplate = match ? parseInt(match[1], 10) : 0;
        return Number.isFinite(fromTemplate) ? fromTemplate : 0;
    }

    function isUsableInventoryItem(item) {
        return !!item && getItemId(item) > 0 && !item.isLocked && (parseInt(item.quantity, 10) || 0) > 0;
    }

    function getCombatTalismanFamily(item) {
        const templateId = String(item && item.templateId || '');
        if (templateId === 'shenxing_talisman') return '';
        if (templateId.indexOf('talisman_stealth_') === 0) return '';
        const match = templateId.match(/^(?:bp_)?talisman_(.+)_\d+$/);
        return match ? match[1] : '';
    }

    function selectCombatTalismans(items, options) {
        const maxKinds = clampNumber(options && options.maxKinds, 1, 5, 5);
        const quantityPerKind = clampNumber(options && options.quantityPerKind, 1, 20, 1);
        const familyOrder = parseTalismanFamilyOrder(options && options.familyOrder);
        const bestByFamily = new Map();

        (Array.isArray(items) ? items : []).forEach(item => {
            if (!isUsableInventoryItem(item)) return;
            if (item.type !== 'misc' && item.type !== 'talisman') return;
            const family = getCombatTalismanFamily(item);
            if (!family) return;
            const rarity = getItemRarity(item);
            const quantity = parseInt(item.quantity, 10) || 0;
            const candidate = {
                itemId: getItemId(item),
                templateId: item.templateId,
                name: item.name || '',
                family,
                rarity,
                quantity: Math.min(quantityPerKind, quantity)
            };
            const current = bestByFamily.get(family);
            if (!current || candidate.rarity > current.rarity || (candidate.rarity === current.rarity && candidate.quantity > current.quantity)) {
                bestByFamily.set(family, candidate);
            }
        });

        if (familyOrder.length > 0) {
            return familyOrder
                .map(family => bestByFamily.get(family))
                .filter(Boolean)
                .slice(0, maxKinds);
        }

        return Array.from(bestByFamily.values())
            .sort((a, b) => (b.rarity - a.rarity) || a.family.localeCompare(b.family))
            .slice(0, maxKinds);
    }

    function normalizeEncounterText(value) {
        return String(value || '')
            .split(/\n+/)
            .map(part => part.trim().replace(/\s+/g, ' '))
            .filter(Boolean)
            .slice(0, 3)
            .join('|')
            .slice(0, 160);
    }

    function buildEncounterKey(snapshot) {
        const state = snapshot || {};
        if (!state.encounterActive && !state.combatActive) return '';
        const monsterId = String(state.encounterMonsterId || '').trim();
        if (monsterId) {
            const stage = Math.max(0, toFiniteNumber(state.encounterMonsterStage, 0));
            const level = Math.max(0, toFiniteNumber(state.encounterMonsterLevel, 0));
            return `monster:${monsterId}:${stage}:${level}`;
        }
        const text = normalizeEncounterText(state.encounterText);
        if (text) return `text:${text}`;
        return 'encounter:active';
    }

    function shouldUseCombatTalismansForEncounter(lastEncounterKey, snapshot) {
        const encounterKey = buildEncounterKey(snapshot);
        return {
            shouldUse: !!encounterKey && encounterKey !== String(lastEncounterKey || ''),
            encounterKey
        };
    }

    function resolveCombatTalismanAttempt(lastEncounterKey, snapshot, selectedTalismans, options) {
        const usage = shouldUseCombatTalismansForEncounter(lastEncounterKey, snapshot);
        const selected = Array.isArray(selectedTalismans) ? selectedTalismans : null;
        const attemptCompleted = !!(options && options.attemptCompleted);
        const shouldMark = usage.shouldUse && !!usage.encounterKey && (
            attemptCompleted ||
            (selected && selected.length === 0)
        );
        return {
            shouldAttempt: usage.shouldUse,
            encounterKey: usage.encounterKey,
            markEncounterKey: shouldMark ? usage.encounterKey : ''
        };
    }

    function resolveEncounterGuardianAttempt(lastEncounterKey, snapshot, afkConfig, guardianConfig, options) {
        const encounterKey = buildEncounterKey(snapshot);
        const cfg = normalizeAfkLoopConfig(afkConfig || {});
        const guardian = normalizeGuardianConfig(guardianConfig || {});
        const attemptCompleted = !!(options && options.attemptCompleted);
        if (!encounterKey) {
            return { shouldAttempt: false, encounterKey: '', markEncounterKey: '', reason: 'no-encounter' };
        }
        if (!cfg.autoHireGuardian) {
            return { shouldAttempt: false, encounterKey, markEncounterKey: '', reason: 'afk-guardian-disabled' };
        }
        if (!guardian.enabled) {
            return { shouldAttempt: false, encounterKey, markEncounterKey: '', reason: 'guardian-config-disabled' };
        }
        if (encounterKey === String(lastEncounterKey || '')) {
            return { shouldAttempt: false, encounterKey, markEncounterKey: '', reason: 'guardian-already-attempted' };
        }
        return {
            shouldAttempt: true,
            encounterKey,
            markEncounterKey: attemptCompleted ? encounterKey : '',
            reason: 'guardian-ready'
        };
    }

    function isNirvanaRebirthPill(item) {
        const templateId = String(item && item.templateId || '');
        if (templateId.indexOf('bp_pill_rebirth_') === 0) return true;
        const text = `${item && item.name || ''} ${item && item.description || ''}`;
        return /涅槃重生丹|五行通灵丹/.test(text);
    }

    function selectNirvanaRebirthPill(items, options) {
        const minRarity = clampNumber(options && options.minRarity, 1, 5, 4);
        const candidates = (Array.isArray(items) ? items : [])
            .filter(item => isUsableInventoryItem(item) && item.type === 'pill' && isNirvanaRebirthPill(item))
            .map(item => ({
                itemId: getItemId(item),
                templateId: item.templateId,
                name: item.name || '',
                rarity: getItemRarity(item),
                quantity: 1
            }))
            .filter(item => item.rarity >= minRarity)
            .sort((a, b) => (b.rarity - a.rarity) || String(a.name).localeCompare(String(b.name)));
        return candidates[0] || null;
    }

    function getActiveFiveRootBuff(player, now) {
        const currentTime = Number.isFinite(Number(now)) ? Number(now) : Date.now();
        const expire = Number(player && player.fiveRootBuffExpire);
        const grade = Number(player && player.fiveRootBuffGrade);
        const hasBuff = Number.isFinite(expire) && Number.isFinite(grade) && grade > 0 && expire > currentTime;
        return {
            active: hasBuff,
            grade: Number.isFinite(grade) && grade > 0 ? grade : null,
            expire: Number.isFinite(expire) && expire > 0 ? expire : null
        };
    }

    function hasActiveFiveRootBuff(player, now) {
        return getActiveFiveRootBuff(player, now).active;
    }

    function normalizeNirvanaPillAttempt(attempt) {
        const raw = attempt && typeof attempt === 'object' ? attempt : {};
        const pill = raw.pill && typeof raw.pill === 'object' ? raw.pill : null;
        return {
            shouldUse: !!raw.shouldUse,
            reason: String(raw.reason || ''),
            pill: pill ? {
                itemId: pill.itemId ?? null,
                templateId: String(pill.templateId || ''),
                name: String(pill.name || ''),
                rarity: optionalNumberOrNull(pill.rarity),
                quantity: optionalNumberOrNull(pill.quantity)
            } : null,
            minRarity: optionalNumberOrNull(raw.minRarity),
            activeBuffGrade: optionalNumberOrNull(raw.activeBuffGrade),
            activeBuffExpire: optionalNumberOrNull(raw.activeBuffExpire)
        };
    }

    function normalizeCombatTalismanItem(item) {
        const raw = item && typeof item === 'object' ? item : {};
        return {
            itemId: raw.itemId ?? raw.id ?? null,
            templateId: String(raw.templateId || ''),
            name: String(raw.name || ''),
            family: String(raw.family || ''),
            rarity: optionalNumberOrNull(raw.rarity),
            quantity: optionalNumberOrNull(raw.quantity)
        };
    }

    function normalizeCombatTalismanAttempt(attempt) {
        const raw = attempt && typeof attempt === 'object' ? attempt : {};
        return {
            shouldAttempt: !!raw.shouldAttempt,
            reason: String(raw.reason || ''),
            encounterKey: String(raw.encounterKey || ''),
            markEncounterKey: String(raw.markEncounterKey || ''),
            selectedTalismans: (Array.isArray(raw.selectedTalismans) ? raw.selectedTalismans : [])
                .map(normalizeCombatTalismanItem)
                .filter(item => item.itemId !== null || item.templateId || item.name || item.family),
            usedKinds: optionalNumberOrNull(raw.usedKinds),
            failedKinds: optionalNumberOrNull(raw.failedKinds),
            failureMessage: String(raw.failureMessage || '')
        };
    }

    function normalizeEncounterFightAttempt(attempt) {
        const raw = attempt && typeof attempt === 'object' ? attempt : {};
        return {
            shouldAttempt: !!raw.shouldAttempt,
            reason: String(raw.reason || ''),
            encounterKey: String(raw.encounterKey || ''),
            source: String(raw.source || ''),
            failureMessage: String(raw.failureMessage || '')
        };
    }

    function normalizeGuardianAttempt(attempt, fallbackGuardianConfig) {
        const raw = attempt && typeof attempt === 'object' ? attempt : {};
        const guardian = normalizeGuardianConfig(raw.guardian || fallbackGuardianConfig || {});
        return {
            shouldAttempt: !!raw.shouldAttempt,
            reason: String(raw.reason || ''),
            encounterKey: String(raw.encounterKey || ''),
            markEncounterKey: String(raw.markEncounterKey || ''),
            hireTriggered: !!raw.hireTriggered,
            failureMessage: String(raw.failureMessage || ''),
            guardian: {
                enabled: guardian.enabled,
                maxFee: guardian.maxFee,
                minAtk: guardian.minAtk,
                mode: guardian.mode,
                priority: guardian.priority.slice(),
                threatLevel: guardian.threatLevel
            }
        };
    }

    function buildGuardianDebugAttempt(attempt, snapshot, afkConfig, guardianConfig) {
        const cfg = normalizeAfkLoopConfig(afkConfig || {});
        const guardian = normalizeGuardianConfig(guardianConfig || {});
        const encounterKey = buildEncounterKey(snapshot || {});
        if (!cfg.autoHireGuardian) {
            return normalizeGuardianAttempt({
                shouldAttempt: false,
                reason: 'afk-guardian-disabled',
                encounterKey,
                guardian
            }, guardian);
        }
        if (!guardian.enabled) {
            return normalizeGuardianAttempt({
                shouldAttempt: false,
                reason: 'guardian-config-disabled',
                encounterKey,
                guardian
            }, guardian);
        }
        if (attempt && typeof attempt === 'object' && (
            attempt.reason ||
            attempt.encounterKey ||
            typeof attempt.hireTriggered !== 'undefined'
        )) {
            return normalizeGuardianAttempt(attempt, guardian);
        }
        const resolved = resolveEncounterGuardianAttempt('', snapshot || {}, cfg, guardian);
        return normalizeGuardianAttempt({
            shouldAttempt: resolved.shouldAttempt,
            reason: resolved.reason,
            encounterKey: resolved.encounterKey,
            markEncounterKey: resolved.markEncounterKey,
            guardian
        }, guardian);
    }

    function buildCombatTalismanDebugAttempt(attempt, snapshot, config) {
        const cfg = normalizeAfkLoopConfig(config || {});
        const encounterKey = buildEncounterKey(snapshot || {});
        if (!cfg.useTalismans) {
            return normalizeCombatTalismanAttempt({
                shouldAttempt: false,
                reason: 'disabled',
                encounterKey
            });
        }
        if (attempt && typeof attempt === 'object' && (
            attempt.reason ||
            attempt.encounterKey ||
            Array.isArray(attempt.selectedTalismans)
        )) {
            return normalizeCombatTalismanAttempt(attempt);
        }

        if (!encounterKey) {
            return normalizeCombatTalismanAttempt({
                shouldAttempt: false,
                reason: 'no-encounter',
                encounterKey: ''
            });
        }
        return normalizeCombatTalismanAttempt({
            shouldAttempt: true,
            reason: 'not-attempted',
            encounterKey
        });
    }

    function buildEncounterFightDebugAttempt(attempt, snapshot, config) {
        const cfg = normalizeAfkLoopConfig(config || {});
        const encounterKey = buildEncounterKey(snapshot || {});
        if (!cfg.autoFight) {
            return normalizeEncounterFightAttempt({
                shouldAttempt: false,
                reason: 'disabled',
                encounterKey
            });
        }
        if (attempt && typeof attempt === 'object' && (
            attempt.reason ||
            attempt.encounterKey ||
            attempt.source ||
            typeof attempt.shouldAttempt !== 'undefined'
        )) {
            return normalizeEncounterFightAttempt(attempt);
        }
        if (!encounterKey) {
            return normalizeEncounterFightAttempt({
                shouldAttempt: false,
                reason: 'no-encounter',
                encounterKey: ''
            });
        }
        return normalizeEncounterFightAttempt({
            shouldAttempt: true,
            reason: 'not-attempted',
            encounterKey
        });
    }

    function resolveNirvanaRebirthPillAttempt(player, items, config, now, usage) {
        const cfg = normalizeAfkLoopConfig(config || {});
        const activeBuff = getActiveFiveRootBuff(player || {}, now);
        const base = {
            minRarity: cfg.nirvanaMinRarity,
            activeBuffGrade: activeBuff.grade,
            activeBuffExpire: activeBuff.expire
        };

        if (!cfg.useNirvanaPill) {
            return {
                shouldUse: false,
                reason: 'disabled',
                pill: null,
                ...base
            };
        }
        if (activeBuff.active && !cfg.queueNirvanaPill) {
            return {
                shouldUse: false,
                reason: 'active-five-root-buff',
                pill: null,
                ...base
            };
        }
        const budget = resolveAfkResourceBudget('nirvanaPills', cfg, usage);
        if (!budget.allowed) {
            return {
                shouldUse: false,
                reason: 'budget-exhausted',
                pill: null,
                ...base,
                budget
            };
        }

        const pill = selectNirvanaRebirthPill(items, { minRarity: cfg.nirvanaMinRarity });
        if (!pill) {
            return {
                shouldUse: false,
                reason: 'no-matching-pill',
                pill: null,
                ...base
            };
        }

        return {
            shouldUse: true,
            reason: 'pill-ready',
            pill,
            ...base
        };
    }

    function classifyExploreInterruption(data, config) {
        const payload = data || {};
        const cfg = normalizeAfkLoopConfig(config || {});
        const status = payload.status || '';
        const message = String(payload.message || '');

        if (payload.adventureId) {
            const choiceIndex = resolveAdventureChoiceIndex(payload.adventureId, cfg);
            return choiceIndex > 0
                ? { kind: 'adventure', action: 'auto-choice', reason: getAdventureChoiceReason(cfg) }
                : { kind: 'adventure', action: 'pause', reason: 'adventure-chain' };
        }
        if (status === 'merchant') {
            return { kind: 'merchant', action: 'auto-handle', reason: 'merchant' };
        }
        if (status === 'player_encounter') {
            return cfg.autoDeclinePlayerEncounter
                ? { kind: 'playerEncounter', action: 'auto-decline', reason: 'player-encounter-auto-decline' }
                : { kind: 'playerEncounter', action: 'pause', reason: 'player-encounter' };
        }
        if (status === 'encounter') {
            return { kind: 'monsterEncounter', action: 'handle', reason: 'monster-encounter' };
        }
        if (status === 'immortal_prison' || status === 'prison_material') {
            return { kind: 'immortalPrison', action: 'hard-stop', reason: 'immortal-prison' };
        }
        if (status === 'dead' || status === 'death') {
            return { kind: 'death', action: 'revive-or-wait', reason: 'death' };
        }
        if (status === 'error') {
            if (message.indexOf('神识不足') >= 0) {
                return { kind: 'noSpirit', action: 'meditate', reason: 'no-spirit' };
            }
            return { kind: 'error', action: 'pause', reason: 'explore-error' };
        }
        return { kind: 'none', action: 'continue', reason: 'continue' };
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
        if (snapshot.gameUpdateNoticeActive) {
            return cfg.autoReloadOnUpdate
                ? { action: 'reloadPage', reason: 'game-update-auto-reload' }
                : { action: 'wait', reason: 'game-update-available' };
        }
        if (snapshot.immortalPrisonActive) {
            return { action: 'wait', reason: 'immortal-prison' };
        }
        if (snapshot.isDead) {
            if (!cfg.autoRevive) return { action: 'wait', reason: 'dead' };
            const reviveBudget = resolveAfkResourceBudget('revive', cfg, snapshot.resourceUsage);
            return reviveBudget.allowed
                ? { action: 'revive', reason: 'dead-auto-revive-enabled' }
                : { action: 'wait', reason: 'revive-budget-exhausted' };
        }
        if (snapshot.adventureActive) {
            const choiceIndex = resolveAdventureChoiceIndex(snapshot.adventureId, cfg);
            if (choiceIndex > 0) {
                return { action: 'handleAdventure', reason: getAdventureChoiceReason(cfg) };
            }
            return { action: 'wait', reason: 'adventure-active' };
        }
        if (snapshot.playerEncounterActive) {
            if (cfg.autoDeclinePlayerEncounter) {
                return { action: 'handlePlayerEncounter', reason: 'player-encounter-auto-decline' };
            }
            return { action: 'wait', reason: 'player-encounter-active' };
        }
        if (snapshot.merchantActive) {
            return { action: 'wait', reason: 'merchant-active' };
        }
        if (snapshot.encounterActive || snapshot.combatActive) {
            if (cfg.autoHireGuardian) {
                return { action: 'handleEncounter', reason: 'encounter-auto-guardian-enabled' };
            }
            if (cfg.autoFight) {
                return { action: 'handleEncounter', reason: 'encounter-auto-fight-enabled' };
            }
            return { action: 'wait', reason: 'encounter-active' };
        }
        const spirit = Math.max(0, toFiniteNumber(snapshot.spirit, 0));
        const maxSpirit = Math.max(0, toFiniteNumber(snapshot.maxSpirit, 0));
        const spiritCost = Math.max(1, toFiniteNumber(snapshot.spiritCost, 1));
        const lowSpirit = spirit < cfg.minSpirit || spirit < spiritCost;
        const disabledReason = String(snapshot.exploreDisabledReason || '');
        const exploreDisabledForSpirit = snapshot.canExplore === false &&
            (disabledReason.indexOf('神识') >= 0 || disabledReason.indexOf('体力') >= 0);

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
            if (exploreDisabledForSpirit) {
                return { action: 'startMeditation', reason: 'explore-disabled-no-spirit' };
            }
            if (lowSpirit) {
                return { action: 'startMeditation', reason: 'auto-explore-low-spirit' };
            }
            if (snapshot.exploreStalled) {
                return { action: 'startMeditation', reason: 'explore-stalled' };
            }
            return { action: 'wait', reason: 'auto-explore-running' };
        }

        if (snapshot.exploreStalled) {
            return { action: 'startMeditation', reason: 'explore-stalled' };
        }

        if (snapshot.canExplore === false) {
            if (exploreDisabledForSpirit) {
                return { action: 'startMeditation', reason: 'explore-disabled-no-spirit' };
            }
            return { action: 'wait', reason: 'explore-disabled' };
        }

        if (snapshot.postReviveResume) {
            if (lowSpirit) {
                return { action: 'startMeditation', reason: 'post-revive-low-spirit' };
            }
            return { action: 'startAutoExplore', reason: 'post-revive-ready' };
        }
        if (snapshot.postInteractionResume) {
            if (lowSpirit) {
                return { action: 'startMeditation', reason: 'post-interaction-low-spirit' };
            }
            return { action: 'startAutoExplore', reason: 'post-interaction-ready' };
        }

        if (lowSpirit) {
            return { action: 'startMeditation', reason: 'spirit-below-threshold' };
        }

        return { action: 'startAutoExplore', reason: 'spirit-ready' };
    }

    function numberOrNull(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function optionalNumberOrNull(value) {
        if (value === null || typeof value === 'undefined' || value === '') return null;
        return numberOrNull(value);
    }

    function resolvePageInfo(context) {
        const supplied = context && context.page && typeof context.page === 'object' ? context.page : {};
        let title = supplied.title || '';
        let url = supplied.url || '';
        if (!title && typeof document !== 'undefined') title = document.title || '';
        if (!url && typeof location !== 'undefined') url = location.href || '';
        return { title, url };
    }

    function tailRecords(records, limit) {
        return (Array.isArray(records) ? records : []).slice(-limit);
    }

    function normalizeDecisionHistory(records) {
        return tailRecords(records, DEBUG_DECISION_HISTORY_LIMIT).map(record => ({
            at: String(record && record.at || ''),
            action: String(record && record.action || ''),
            reason: String(record && record.reason || ''),
            label: String(record && record.label || ''),
            spirit: numberOrNull(record && record.spirit),
            maxSpirit: numberOrNull(record && record.maxSpirit),
            isMeditating: !!(record && record.isMeditating),
            autoExploreRunning: !!(record && record.autoExploreRunning),
            gameUpdateNoticeActive: !!(record && record.gameUpdateNoticeActive),
            merchantActive: !!(record && record.merchantActive),
            encounterActive: !!(record && record.encounterActive),
            playerEncounterActive: !!(record && record.playerEncounterActive),
            adventureActive: !!(record && record.adventureActive),
            adventureId: record && record.adventureId ? record.adventureId : null
        }));
    }

    function normalizeRecentLogs(records) {
        return tailRecords(records, DEBUG_LOG_HISTORY_LIMIT).map(record => ({
            at: String(record && record.at || ''),
            time: String(record && record.time || ''),
            type: String(record && record.type || 'info'),
            message: String(record && record.message || '')
        }));
    }

    function stripUrlQueryAndHash(text) {
        return String(text || '').replace(/(https?:\/\/[^\s?#]+(?:\/[^\s?#]*)?)[?#][^\s]*/gi, '$1');
    }

    function redactSensitiveParams(text) {
        return String(text || '').replace(/\b(token|session|jwt|auth|key|secret|password|access_token|refresh_token)=([^\s&;#]+)/gi, '$1=<redacted>');
    }

    function truncateDebugText(text, limit) {
        const maxLength = Math.max(8, toFiniteNumber(limit, DEBUG_SUMMARY_TEXT_LIMIT));
        const value = String(text || '');
        if (value.length <= maxLength) return value;
        return `${value.slice(0, maxLength - 3)}...`;
    }

    function sanitizeDebugText(value, limit) {
        return truncateDebugText(redactSensitiveParams(stripUrlQueryAndHash(value)), limit);
    }

    function sanitizeDebugUrl(value) {
        const stripped = stripUrlQueryAndHash(value).trim();
        const match = stripped.match(/^https?:\/\/[^\s]+/i);
        return sanitizeDebugText(match ? match[0] : stripped, 200);
    }

    function sanitizeDebugName(value, limit) {
        return sanitizeDebugText(value, limit).replace(/[?#].*$/, '');
    }

    function summarizeNirvanaPillAttempt(attempt) {
        const normalized = normalizeNirvanaPillAttempt(attempt);
        const pill = normalized.pill || {};
        return {
            shouldUse: normalized.shouldUse,
            reason: normalized.reason,
            pillName: sanitizeDebugName(pill.name, 80),
            pillTemplateId: sanitizeDebugText(pill.templateId, 80),
            pillRarity: optionalNumberOrNull(pill.rarity),
            minRarity: optionalNumberOrNull(normalized.minRarity),
            activeBuffGrade: optionalNumberOrNull(normalized.activeBuffGrade),
            activeBuffExpire: optionalNumberOrNull(normalized.activeBuffExpire)
        };
    }

    function summarizeCombatTalismanAttempt(attempt) {
        const normalized = normalizeCombatTalismanAttempt(attempt);
        const selected = normalized.selectedTalismans.map(item => ({
            templateId: sanitizeDebugText(item.templateId, 80),
            name: sanitizeDebugName(item.name, 80),
            family: sanitizeDebugText(item.family, 40),
            rarity: optionalNumberOrNull(item.rarity),
            quantity: optionalNumberOrNull(item.quantity)
        }));
        return {
            shouldAttempt: normalized.shouldAttempt,
            reason: normalized.reason,
            encounterKey: sanitizeDebugName(normalized.encounterKey, 120),
            markEncounterKey: sanitizeDebugName(normalized.markEncounterKey, 120),
            selectedCount: selected.length,
            usedKinds: optionalNumberOrNull(normalized.usedKinds),
            failedKinds: optionalNumberOrNull(normalized.failedKinds),
            selectedTalismans: selected,
            failureMessage: sanitizeDebugText(normalized.failureMessage, DEBUG_SUMMARY_TEXT_LIMIT)
        };
    }

    function summarizeEncounterFightAttempt(attempt) {
        const normalized = normalizeEncounterFightAttempt(attempt);
        return {
            shouldAttempt: normalized.shouldAttempt,
            reason: normalized.reason,
            encounterKey: sanitizeDebugName(normalized.encounterKey, 120),
            source: sanitizeDebugText(normalized.source, 40),
            failureMessage: sanitizeDebugText(normalized.failureMessage, DEBUG_SUMMARY_TEXT_LIMIT)
        };
    }

    function summarizeAfkPhaseStatus(status) {
        const normalized = normalizeAfkPhaseStatus(status);
        return {
            schema: 'lingverse-afk-phase-status/v1',
            phase: sanitizeDebugText(normalized.phase, 40),
            label: sanitizeDebugText(normalized.label, 80),
            text: sanitizeDebugText(normalized.text, DEBUG_SUMMARY_TEXT_LIMIT),
            reason: sanitizeDebugText(normalized.reason, 80),
            elapsedSeconds: optionalNumberOrNull(normalized.elapsedSeconds),
            remainingSeconds: optionalNumberOrNull(normalized.remainingSeconds),
            targetSeconds: optionalNumberOrNull(normalized.targetSeconds)
        };
    }

    function summarizeGuardianAttempt(attempt) {
        const normalized = normalizeGuardianAttempt(attempt);
        const guardian = normalized.guardian || normalizeGuardianConfig({});
        return {
            shouldAttempt: normalized.shouldAttempt,
            reason: normalized.reason,
            encounterKey: sanitizeDebugName(normalized.encounterKey, 120),
            markEncounterKey: sanitizeDebugName(normalized.markEncounterKey, 120),
            hireTriggered: normalized.hireTriggered,
            failureMessage: sanitizeDebugText(normalized.failureMessage, DEBUG_SUMMARY_TEXT_LIMIT),
            guardian: {
                enabled: !!guardian.enabled,
                maxFee: optionalNumberOrNull(guardian.maxFee),
                minAtk: optionalNumberOrNull(guardian.minAtk),
                mode: sanitizeDebugText(guardian.mode, 40),
                priority: (Array.isArray(guardian.priority) ? guardian.priority : [])
                    .map(item => sanitizeDebugText(item, 40)),
                threatLevel: sanitizeDebugText(guardian.threatLevel, 40)
            }
        };
    }

    function buildAdventureStrategyHints(adventure) {
        const source = adventure && typeof adventure === 'object' ? adventure : {};
        const id = source.id || null;
        if (id === null || typeof id === 'undefined' || id === '') return [];
        const choices = Array.isArray(source.choices) ? source.choices : [];
        return choices.map((choice, index) => ({
            choiceIndex: index + 1,
            choiceText: sanitizeDebugText(choice, DEBUG_SUMMARY_TEXT_LIMIT),
            mapLine: `${id}=${index + 1}`
        }));
    }

    function buildAfkDebugSummary(debugSnapshot) {
        const full = debugSnapshot || {};
        const page = full.page && typeof full.page === 'object' ? full.page : {};
        const decision = full.decision && typeof full.decision === 'object' ? full.decision : {};
        const player = full.player && typeof full.player === 'object' ? full.player : {};
        const blockers = full.blockers && typeof full.blockers === 'object' ? full.blockers : {};
        const automation = full.automation && typeof full.automation === 'object' ? full.automation : {};
        const adventure = full.adventure && typeof full.adventure === 'object' ? full.adventure : {};
        const config = full.config && typeof full.config === 'object' ? full.config : {};
        const history = full.history && typeof full.history === 'object' ? full.history : {};
        const phaseSource = full.phase && typeof full.phase === 'object' && full.phase.schema === 'lingverse-afk-phase-status/v1'
            ? full.phase
            : buildAfkPhaseStatus(Object.assign({}, player, blockers, {
                autoExploreRunning: !!automation.autoExploreRunning,
                autoExplorePending: !!automation.autoExplorePending,
                exploreStalled: !!automation.exploreStalled,
                postReviveResume: !!automation.postReviveResume,
                postInteractionResume: !!automation.postInteractionResume
            }), Object.assign({ enabled: true }, config), decision);

        return {
            schema: 'lingverse-afk-debug-summary/v1',
            sourceSchema: String(full.schema || ''),
            scriptVersion: String(full.scriptVersion || SCRIPT_VERSION),
            capturedAt: String(full.capturedAt || ''),
            page: {
                title: sanitizeDebugText(page.title, 100),
                url: sanitizeDebugUrl(page.url)
            },
            decision: {
                action: String(decision.action || ''),
                reason: String(decision.reason || '')
            },
            phase: summarizeAfkPhaseStatus(phaseSource),
            player: {
                spirit: numberOrNull(player.spirit),
                maxSpirit: numberOrNull(player.maxSpirit),
                spiritCost: numberOrNull(player.spiritCost),
                canExplore: player.canExplore !== false,
                isDead: !!player.isDead,
                isMeditating: !!player.isMeditating
            },
            blockers: {
                gameUpdateNoticeActive: !!blockers.gameUpdateNoticeActive,
                merchantActive: !!blockers.merchantActive,
                encounterActive: !!blockers.encounterActive,
                combatActive: !!blockers.combatActive,
                playerEncounterActive: !!blockers.playerEncounterActive,
                adventureActive: !!blockers.adventureActive,
                adventureId: blockers.adventureId || null,
                adventureComplete: !!blockers.adventureComplete,
                immortalPrisonActive: !!blockers.immortalPrisonActive
            },
            automation: {
                autoExploreRunning: !!automation.autoExploreRunning,
                autoExplorePending: !!automation.autoExplorePending,
                exploreStalled: !!automation.exploreStalled,
                postReviveResume: !!automation.postReviveResume,
                postInteractionResume: !!automation.postInteractionResume,
                nirvanaPill: summarizeNirvanaPillAttempt(automation.nirvanaPill),
                talismans: summarizeCombatTalismanAttempt(automation.talismans),
                fight: summarizeEncounterFightAttempt(automation.fight),
                guardian: summarizeGuardianAttempt(automation.guardian),
                waitDiagnosis: summarizeAfkWaitingDiagnosis(automation.waitDiagnosis),
                resourceUsage: normalizeAfkResourceUsage(automation.resourceUsage)
            },
            adventure: {
                id: adventure.id || null,
                step: numberOrNull(adventure.step),
                totalSteps: numberOrNull(adventure.totalSteps),
                isComplete: !!adventure.isComplete,
                mode: String(adventure.mode || ''),
                resolvedChoiceIndex: numberOrNull(adventure.resolvedChoiceIndex),
                choices: (Array.isArray(adventure.choices) ? adventure.choices : [])
                    .map(choice => sanitizeDebugText(choice, DEBUG_SUMMARY_TEXT_LIMIT)),
                strategyHints: buildAdventureStrategyHints(adventure)
            },
            config: {
                meditationMinutes: numberOrNull(config.meditationMinutes),
                minSpirit: numberOrNull(config.minSpirit),
                exploreMultiplier: numberOrNull(config.exploreMultiplier),
                stallTimeoutSeconds: numberOrNull(config.stallTimeoutSeconds),
                resumeWindowSeconds: numberOrNull(config.resumeWindowSeconds),
                reviveMaxPerRun: numberOrNull(config.reviveMaxPerRun),
                talismanMaxEncountersPerRun: numberOrNull(config.talismanMaxEncountersPerRun),
                nirvanaMaxPerRun: numberOrNull(config.nirvanaMaxPerRun),
                adventureMode: String(config.adventureMode || ''),
                autoReloadOnUpdate: !!config.autoReloadOnUpdate,
                risks: {
                    autoFight: !!config.autoFight,
                    autoHireGuardian: !!config.autoHireGuardian,
                    autoRevive: !!config.autoRevive,
                    useTalismans: !!config.useTalismans,
                    useNirvanaPill: !!config.useNirvanaPill,
                    queueNirvanaPill: !!config.queueNirvanaPill,
                    autoDeclinePlayerEncounter: !!config.autoDeclinePlayerEncounter
                },
                riskStatus: buildAfkRiskStatus(config, config.guardian, automation.resourceUsage)
            },
            history: {
                decisionTail: tailRecords(history.decisionTail, DEBUG_SUMMARY_HISTORY_LIMIT).map(record => ({
                    at: sanitizeDebugText(record && record.at, 40),
                    action: sanitizeDebugText(record && record.action, 40),
                    reason: sanitizeDebugText(record && record.reason, 80),
                    spirit: numberOrNull(record && record.spirit),
                    maxSpirit: numberOrNull(record && record.maxSpirit),
                    isMeditating: !!(record && record.isMeditating),
                    autoExploreRunning: !!(record && record.autoExploreRunning),
                    gameUpdateNoticeActive: !!(record && record.gameUpdateNoticeActive),
                    merchantActive: !!(record && record.merchantActive),
                    encounterActive: !!(record && record.encounterActive),
                    playerEncounterActive: !!(record && record.playerEncounterActive),
                    adventureActive: !!(record && record.adventureActive),
                    adventureId: record && record.adventureId ? record.adventureId : null
                })),
                logTail: tailRecords(history.logTail, DEBUG_SUMMARY_HISTORY_LIMIT).map(record => ({
                    at: sanitizeDebugText(record && record.at, 40),
                    time: sanitizeDebugText(record && record.time, 20),
                    type: sanitizeDebugText(record && record.type || 'info', 20),
                    message: sanitizeDebugText(record && record.message, DEBUG_SUMMARY_TEXT_LIMIT)
                }))
            }
        };
    }

    function parseAfkIssueReplaySource(source) {
        if (typeof source === 'string') {
            const text = source.trim();
            if (!text) throw new Error('摘要为空');
            return JSON.parse(text);
        }
        if (source && typeof source === 'object') return source;
        throw new Error('摘要格式无效');
    }

    function buildReplayBlockerLabels(summary) {
        const player = summary.player && typeof summary.player === 'object' ? summary.player : {};
        const blockers = summary.blockers && typeof summary.blockers === 'object' ? summary.blockers : {};
        const labels = [];
        if (blockers.gameUpdateNoticeActive) labels.push('游戏更新');
        if (player.isDead) labels.push('死亡');
        if (blockers.immortalPrisonActive) labels.push('混天典狱');
        if (blockers.merchantActive) labels.push('云游商人');
        if (blockers.encounterActive) labels.push('遭遇');
        if (blockers.combatActive) labels.push('战斗');
        if (blockers.playerEncounterActive) labels.push('陌生道友');
        if (blockers.adventureActive) {
            labels.push(blockers.adventureId ? `奇遇#${blockers.adventureId}` : '奇遇');
        }
        return labels.length ? labels : ['无显式阻塞'];
    }

    function buildReplayRiskText(summary) {
        const config = summary.config && typeof summary.config === 'object' ? summary.config : {};
        const risks = config.risks && typeof config.risks === 'object' ? config.risks : config;
        return [
            risks.autoFight ? '迎战开' : '迎战关',
            risks.autoHireGuardian ? '护道开' : '护道关',
            risks.autoRevive ? '复活开' : '复活关',
            risks.useTalismans ? '用符开' : '用符关',
            risks.useNirvanaPill ? '用丹开' : '用丹关',
            risks.queueNirvanaPill ? '丹药排队开' : '丹药排队关',
            risks.autoDeclinePlayerEncounter ? '道友婉拒开' : '道友婉拒关'
        ].join(' · ');
    }

    function formatReplayAttempt(label, attempt) {
        const source = attempt && typeof attempt === 'object' ? attempt : {};
        const reason = String(source.reason || 'unknown');
        const failure = sanitizeDebugText(source.failureMessage || '', DEBUG_SUMMARY_TEXT_LIMIT);
        return `${label}: ${reason}${failure ? ` · ${failure}` : ''}`;
    }

    function buildReplayStrategyImportText(summary) {
        const adventure = summary.adventure && typeof summary.adventure === 'object' ? summary.adventure : {};
        const hints = Array.isArray(adventure.strategyHints) ? adventure.strategyHints : [];
        const lines = [];
        const seen = new Set();
        hints.forEach(hint => {
            const line = sanitizeDebugText(hint && hint.mapLine, 80).trim();
            if (!line || seen.has(line)) return;
            seen.add(line);
            lines.push(line);
        });
        return lines.join('\n');
    }

    function extractAdventureStrategyImportText(source) {
        let parsed = source;
        if (typeof source === 'string') {
            const text = source.trim();
            if (!text) return '';
            try {
                parsed = JSON.parse(text);
            } catch (e) {
                return text;
            }
        }
        if (!parsed || typeof parsed !== 'object') return '';
        if (parsed.strategyImportText) return String(parsed.strategyImportText || '');
        if (parsed.adventure && Array.isArray(parsed.adventure.strategyHints)) {
            return buildReplayStrategyImportText(parsed);
        }
        if (parsed.schema && parsed.schema !== 'lingverse-afk-debug-summary/v1') {
            try {
                return buildReplayStrategyImportText(buildAfkDebugSummary(parsed));
            } catch (e) {}
        }
        return '';
    }

    function mergeAdventureStrategyImport(config, source) {
        const cfg = normalizeAfkLoopConfig(config || {});
        const importedMap = normalizeAdventureChoiceMap(extractAdventureStrategyImportText(source));
        const currentMap = normalizeAdventureChoiceMap(cfg.adventureChoiceMap);
        const importLines = [];
        let overwrittenCount = 0;

        Object.keys(importedMap).forEach(key => {
            if (Object.prototype.hasOwnProperty.call(currentMap, key) && currentMap[key] !== importedMap[key]) {
                overwrittenCount += 1;
            }
            currentMap[key] = importedMap[key];
            importLines.push(`${key}=${importedMap[key]}`);
        });

        const warnings = [];
        if (cfg.enabled) {
            cfg.enabled = false;
            warnings.push('导入策略时已关闭挂机启动状态');
        }
        if (importLines.length > 0) {
            cfg.adventureMode = 'strategy';
        }
        cfg.adventureChoiceMap = currentMap;

        return {
            schema: 'lingverse-afk-adventure-strategy-import/v1',
            afkLoop: cfg,
            importedCount: importLines.length,
            overwrittenCount,
            importLines,
            warnings
        };
    }

    function buildAfkIssueReplay(source) {
        const parsed = parseAfkIssueReplaySource(source);
        const summary = parsed && parsed.schema === 'lingverse-afk-debug-summary/v1'
            ? parsed
            : buildAfkDebugSummary(parsed);
        const page = summary.page && typeof summary.page === 'object' ? summary.page : {};
        const player = summary.player && typeof summary.player === 'object' ? summary.player : {};
        const decision = summary.decision && typeof summary.decision === 'object' ? summary.decision : {};
        const automation = summary.automation && typeof summary.automation === 'object' ? summary.automation : {};
        const pageText = sanitizeDebugText(page.title || page.url || '未知页面', 100);
        const decisionText = `${formatAfkAction(decision.action)} · ${formatAfkReason(decision.reason)}`;
        const spirit = numberOrNull(player.spirit);
        const maxSpirit = numberOrNull(player.maxSpirit);
        const spiritText = spirit === null && maxSpirit === null
            ? '未知'
            : `${spirit === null ? '?' : spirit}/${maxSpirit === null ? '?' : maxSpirit}`;
        const blockerText = buildReplayBlockerLabels(summary).join('/');
        const riskText = buildReplayRiskText(summary);
        const automationText = [
            formatReplayAttempt('护道', automation.guardian),
            formatReplayAttempt('用符', automation.talismans),
            formatReplayAttempt('用丹', automation.nirvanaPill)
        ].join(' | ');
        const strategyImportText = buildReplayStrategyImportText(summary);
        const replayLines = [
            `页面: ${pageText}`,
            `决策: ${decisionText}`,
            `神识: ${spiritText}`,
            `阻塞: ${blockerText}`,
            `风险: ${riskText}`,
            `自动化: ${automationText}`
        ];
        if (strategyImportText) {
            replayLines.push(`奇遇策略: ${strategyImportText.split('\n').join(' / ')}`);
        }

        return {
            schema: 'lingverse-afk-issue-replay/v1',
            sourceSchema: String(summary.sourceSchema || summary.schema || ''),
            scriptVersion: String(summary.scriptVersion || SCRIPT_VERSION),
            capturedAt: String(summary.capturedAt || ''),
            pageText,
            headline: decisionText,
            decisionText,
            spiritText,
            blockerText,
            riskText,
            automationText,
            strategyImportText,
            replayLines
        };
    }

    function formatAfkReportNumber(value, fallback) {
        const n = numberOrNull(value);
        return n === null ? (fallback || '?') : String(n);
    }

    function formatAfkReportLimit(label, used, max) {
        const current = Math.max(0, toFiniteNumber(used, 0));
        const limit = Math.max(0, toFiniteNumber(max, 0));
        return `${label} ${current}/${limit > 0 ? limit : '不限'}`;
    }

    function formatAfkReportExploreState(automation) {
        const source = automation && typeof automation === 'object' ? automation : {};
        if (source.autoExploreRunning) return '运行中';
        if (source.autoExplorePending) return '恢复挂起';
        if (source.exploreStalled) return '疑似卡住';
        if (source.postReviveResume) return '复活恢复窗口';
        if (source.postInteractionResume) return '事件恢复窗口';
        return '停止';
    }

    function buildAfkPhaseStatusFromSummary(summary) {
        const source = summary && typeof summary === 'object' ? summary : {};
        if (source.phase && typeof source.phase === 'object' && source.phase.schema === 'lingverse-afk-phase-status/v1' && (source.phase.text || source.phase.phase !== 'unknown')) {
            return summarizeAfkPhaseStatus(source.phase);
        }
        const player = source.player && typeof source.player === 'object' ? source.player : {};
        const blockers = source.blockers && typeof source.blockers === 'object' ? source.blockers : {};
        const automation = source.automation && typeof source.automation === 'object' ? source.automation : {};
        const config = source.config && typeof source.config === 'object' ? source.config : {};
        const decision = source.decision && typeof source.decision === 'object' ? source.decision : {};
        const enabled = !(decision.action === 'idle' || decision.reason === 'disabled');
        return summarizeAfkPhaseStatus(buildAfkPhaseStatus(Object.assign({}, player, blockers, {
            autoExploreRunning: !!automation.autoExploreRunning,
            autoExplorePending: !!automation.autoExplorePending,
            exploreStalled: !!automation.exploreStalled,
            postReviveResume: !!automation.postReviveResume,
            postInteractionResume: !!automation.postInteractionResume
        }), Object.assign({ enabled }, config), decision));
    }

    function buildAfkStatusReport(source) {
        const parsed = source && typeof source === 'object' ? source : parseAfkIssueReplaySource(source);
        const summary = parsed && parsed.schema === 'lingverse-afk-debug-summary/v1'
            ? parsed
            : buildAfkDebugSummary(parsed);
        const page = summary.page && typeof summary.page === 'object' ? summary.page : {};
        const decision = summary.decision && typeof summary.decision === 'object' ? summary.decision : {};
        const player = summary.player && typeof summary.player === 'object' ? summary.player : {};
        const automation = summary.automation && typeof summary.automation === 'object' ? summary.automation : {};
        const config = summary.config && typeof summary.config === 'object' ? summary.config : {};
        const riskStatus = config.riskStatus && typeof config.riskStatus === 'object' ? config.riskStatus : {};
        const usage = normalizeAfkResourceUsage(automation.resourceUsage);
        const pageText = sanitizeDebugText(page.title || page.url || '未知页面', 100);
        const decisionText = `${formatAfkAction(decision.action)} · ${formatAfkReason(decision.reason)}`;
        const headline = `挂机状态 · ${decisionText}`;
        const spirit = formatAfkReportNumber(player.spirit);
        const maxSpirit = formatAfkReportNumber(player.maxSpirit);
        const spiritCost = numberOrNull(player.spiritCost);
        const blockerText = buildReplayBlockerLabels(summary).join('/');
        const riskText = sanitizeDebugText(riskStatus.summaryText || buildReplayRiskText(summary), 160);
        const strategyImportText = buildReplayStrategyImportText(summary);
        const phase = buildAfkPhaseStatusFromSummary(summary);
        const lines = [
            headline,
            `版本: ${sanitizeDebugText(summary.scriptVersion || SCRIPT_VERSION, 40)}`,
            `页面: ${pageText}`,
            `神识: ${spirit}/${maxSpirit}${spiritCost === null ? '' : ` · 单次消耗${spiritCost}`}`,
            `阻塞: ${blockerText}`,
            `阶段: ${sanitizeDebugText(phase.text || phase.label || '未知', DEBUG_SUMMARY_TEXT_LIMIT)}`,
            `探索: ${formatAfkReportExploreState(automation)}`,
            `配置: 冥想${formatAfkReportNumber(config.meditationMinutes)}分钟 · 神识<${formatAfkReportNumber(config.minSpirit)} · ${formatAfkReportNumber(config.exploreMultiplier)}倍`,
            `资源: ${[
                formatAfkReportLimit('复活', usage.revive, config.reviveMaxPerRun),
                formatAfkReportLimit('用符', usage.talismanEncounters, config.talismanMaxEncountersPerRun),
                formatAfkReportLimit('用丹', usage.nirvanaPills, config.nirvanaMaxPerRun)
            ].join(' · ')}`,
            `风险: ${riskText}`
        ];
        (Array.isArray(riskStatus.warnings) ? riskStatus.warnings : [])
            .map(item => sanitizeDebugText(item, DEBUG_SUMMARY_TEXT_LIMIT))
            .filter(Boolean)
            .forEach(item => lines.push(`! ${item}`));
        if (automation.waitDiagnosis && automation.waitDiagnosis.active && automation.waitDiagnosis.message) {
            lines.push(`诊断: ${sanitizeDebugText(automation.waitDiagnosis.message, DEBUG_SUMMARY_TEXT_LIMIT)}`);
        }
        lines.push(`自动化: 护道 ${sanitizeDebugText(automation.guardian && automation.guardian.reason || 'unknown', 60)} · 用符 ${sanitizeDebugText(automation.talismans && automation.talismans.reason || 'unknown', 60)} · 迎战 ${sanitizeDebugText(automation.fight && automation.fight.reason || 'unknown', 60)} · 用丹 ${sanitizeDebugText(automation.nirvanaPill && automation.nirvanaPill.reason || 'unknown', 60)}`);
        if (strategyImportText) {
            lines.push(`奇遇策略: ${strategyImportText.split('\n').join(' / ')}`);
        }

        return {
            schema: 'lingverse-afk-status-report/v1',
            sourceSchema: String(summary.schema || summary.sourceSchema || ''),
            scriptVersion: String(summary.scriptVersion || SCRIPT_VERSION),
            capturedAt: String(summary.capturedAt || ''),
            headline,
            text: lines.join('\n'),
            lines
        };
    }

    function buildAfkDebugSnapshot(state, config, decision, context) {
        const cfg = normalizeAfkLoopConfig(config || {});
        const snapshot = state || {};
        const currentDecision = decision || decideAfkNextAction(snapshot, cfg, context && context.now);
        const phase = buildAfkPhaseStatus(snapshot, cfg, currentDecision, context && context.now);
        const adventureId = snapshot.adventureId || null;
        const debugContext = context || {};
        const guardianCfg = debugContext.guardianConfig
            ? normalizeGuardianConfig(debugContext.guardianConfig)
            : getCurrentGuardianConfig();

        return {
            schema: 'lingverse-afk-debug-snapshot/v1',
            scriptVersion: SCRIPT_VERSION,
            capturedAt: debugContext.capturedAt || new Date().toISOString(),
            page: resolvePageInfo(debugContext),
            decision: {
                action: currentDecision.action || '',
                reason: currentDecision.reason || ''
            },
            phase,
            player: {
                spirit: numberOrNull(snapshot.spirit),
                maxSpirit: numberOrNull(snapshot.maxSpirit),
                spiritCost: numberOrNull(snapshot.spiritCost),
                canExplore: snapshot.canExplore !== false,
                exploreDisabledReason: String(snapshot.exploreDisabledReason || ''),
                isDead: !!snapshot.isDead,
                isMeditating: !!snapshot.isMeditating,
                meditationDurationSeconds: numberOrNull(snapshot.meditationDurationSeconds)
            },
            blockers: {
                gameUpdateNoticeActive: !!snapshot.gameUpdateNoticeActive,
                merchantActive: !!snapshot.merchantActive,
                encounterActive: !!snapshot.encounterActive,
                combatActive: !!snapshot.combatActive,
                playerEncounterActive: !!snapshot.playerEncounterActive,
                adventureActive: !!snapshot.adventureActive,
                adventureId,
                adventureComplete: !!snapshot.adventureComplete,
                immortalPrisonActive: !!snapshot.immortalPrisonActive
            },
            automation: {
                autoExploreRunning: !!snapshot.autoExploreRunning,
                autoExplorePending: !!snapshot.autoExplorePending,
                exploreStalled: !!snapshot.exploreStalled,
                postReviveResume: !!snapshot.postReviveResume,
                postInteractionResume: !!snapshot.postInteractionResume,
                nirvanaPill: normalizeNirvanaPillAttempt(debugContext.nirvanaPillAttempt),
                talismans: buildCombatTalismanDebugAttempt(debugContext.talismanAttempt, snapshot, cfg),
                fight: buildEncounterFightDebugAttempt(debugContext.fightAttempt, snapshot, cfg),
                guardian: buildGuardianDebugAttempt(debugContext.guardianAttempt, snapshot, cfg, guardianCfg),
                waitDiagnosis: buildAfkWaitingDiagnosis(
                    debugContext.decisionHistory,
                    cfg,
                    resolveAfkDiagnosisNow(debugContext.now, debugContext.capturedAt)
                ),
                resourceUsage: normalizeAfkResourceUsage(snapshot.resourceUsage)
            },
            adventure: {
                id: adventureId,
                step: numberOrNull(snapshot.adventureStep),
                totalSteps: numberOrNull(snapshot.adventureTotalSteps),
                isComplete: !!snapshot.adventureComplete,
                choices: Array.isArray(snapshot.adventureChoices) ? snapshot.adventureChoices.slice() : [],
                mode: cfg.adventureMode,
                resolvedChoiceIndex: resolveAdventureChoiceIndex(adventureId, cfg),
                choiceMap: normalizeAdventureChoiceMap(cfg.adventureChoiceMap)
            },
            config: {
                enabled: cfg.enabled,
                meditationMinutes: cfg.meditationMinutes,
                minSpirit: cfg.minSpirit,
                exploreMultiplier: cfg.exploreMultiplier,
                tickInterval: cfg.tickInterval,
                stallTimeoutSeconds: cfg.stallTimeoutSeconds,
                resumeWindowSeconds: cfg.resumeWindowSeconds,
                autoFight: cfg.autoFight,
                autoHireGuardian: cfg.autoHireGuardian,
                autoRevive: cfg.autoRevive,
                reviveMaxPerRun: cfg.reviveMaxPerRun,
                useTalismans: cfg.useTalismans,
                talismanMaxKinds: cfg.talismanMaxKinds,
                talismanQuantity: cfg.talismanQuantity,
                talismanFamilyOrder: cfg.talismanFamilyOrder,
                talismanMaxEncountersPerRun: cfg.talismanMaxEncountersPerRun,
                useNirvanaPill: cfg.useNirvanaPill,
                nirvanaMinRarity: cfg.nirvanaMinRarity,
                nirvanaMaxPerRun: cfg.nirvanaMaxPerRun,
                queueNirvanaPill: cfg.queueNirvanaPill,
                autoDeclinePlayerEncounter: cfg.autoDeclinePlayerEncounter,
                autoReloadOnUpdate: cfg.autoReloadOnUpdate,
                adventureMode: cfg.adventureMode,
                adventureChoiceIndex: cfg.adventureChoiceIndex,
                adventureChoiceMap: normalizeAdventureChoiceMap(cfg.adventureChoiceMap),
                guardian: {
                    enabled: guardianCfg.enabled,
                    maxFee: guardianCfg.maxFee,
                    minAtk: guardianCfg.minAtk,
                    mode: guardianCfg.mode,
                    priority: guardianCfg.priority.slice(),
                    threatLevel: guardianCfg.threatLevel
                }
            },
            history: {
                decisionTail: normalizeDecisionHistory(debugContext.decisionHistory),
                logTail: normalizeRecentLogs(debugContext.recentLogs)
            }
        };
    }

    _win.LingVerseAutoMapTestHooks = Object.assign({}, _win.LingVerseAutoMapTestHooks, {
        SCRIPT_VERSION,
        parseMerchantPrice,
        selectMerchantItem,
        detectGameUpdateNotice,
        resolveApiObject,
        normalizeAfkLoopConfig,
        normalizeAfkResourceUsage,
        resolveAfkResourceBudget,
        getResumeWindowMs,
        buildAfkPhaseStatus,
        isExploreStalledState,
        decideAfkNextAction,
        formatAfkReason,
        formatAfkAction,
        buildAfkPanelStatus,
        buildAfkWaitingDiagnosis,
        buildAfkRiskStatus,
        buildAfkConfigPack,
        resolveAfkConfigPackImport,
        selectCombatTalismans,
        buildEncounterKey,
        shouldUseCombatTalismansForEncounter,
        resolveCombatTalismanAttempt,
        normalizeEncounterFightAttempt,
        normalizeGuardianConfig,
        buildGuardianHirePayload,
        resolveEncounterGuardianAttempt,
        selectNirvanaRebirthPill,
        resolveNirvanaRebirthPillAttempt,
        getCurrentGuardianConfig,
        classifyExploreInterruption,
        normalizeAdventureChoiceMap,
        formatAdventureChoiceMap,
        resolveAdventureChoiceIndex,
        buildAfkDebugSnapshot,
        buildAfkDebugSummary,
        buildAfkIssueReplay,
        buildAfkStatusReport,
        mergeAdventureStrategyImport,
        applyAfkPreset
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
         * 通用使用物品
         */
        async useItem(itemId, quantity = 1) {
            const apiObj = this.getApiObj();
            const body = { itemId };
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
        recentEntries: [],
        /**
         * 记录日志
         * @param {string} msg - 日志消息
         * @param {string} type - 日志类型
         */
        log(msg, type = 'info') {
            const time = new Date().toLocaleTimeString();
            const prefix = `[自动开图 ${time}]`;
            const message = String(msg || '');
            console.log(`${prefix} ${message}`);
            this.recentEntries.push({
                at: new Date().toISOString(),
                time,
                type,
                message
            });
            if (this.recentEntries.length > DEBUG_LOG_HISTORY_LIMIT * 2) {
                this.recentEntries.splice(0, this.recentEntries.length - DEBUG_LOG_HISTORY_LIMIT * 2);
            }

            const logEl = $('#am-log-content');
            if (logEl) {
                const color = type === 'error' ? '#ff6b6b' : type === 'success' ? '#3dab97' : type === 'warning' ? '#f59e0b' : '#94a3b8';
                logEl.innerHTML += `<div style="color:${color};margin:2px 0;font-size:12px;">${escapeHtmlText(message)}</div>`;
                logEl.scrollTop = logEl.scrollHeight;
            }
        },
        getRecentEntries() {
            return this.recentEntries.slice(-DEBUG_LOG_HISTORY_LIMIT);
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
        cfg.resumeWindowSeconds = clampNumber($('#am-afk-resume-window')?.value, 0, 3600, cfg.resumeWindowSeconds ?? 60);
        cfg.autoRevive = $('#am-afk-auto-revive')?.checked ?? cfg.autoRevive;
        cfg.reviveMaxPerRun = clampNumber($('#am-afk-revive-max-per-run')?.value, 0, 999, cfg.reviveMaxPerRun || 0);
        cfg.autoFight = $('#am-afk-auto-fight')?.checked ?? cfg.autoFight;
        cfg.autoHireGuardian = $('#am-afk-auto-hire-guardian')?.checked ?? cfg.autoHireGuardian;
        cfg.useTalismans = $('#am-afk-use-talismans')?.checked ?? cfg.useTalismans;
        cfg.talismanMaxKinds = clampNumber($('#am-afk-talisman-max-kinds')?.value, 1, 5, cfg.talismanMaxKinds || 5);
        cfg.talismanQuantity = clampNumber($('#am-afk-talisman-qty')?.value, 1, 20, cfg.talismanQuantity || 1);
        cfg.talismanFamilyOrder = $('#am-afk-talisman-family-order')?.value ?? cfg.talismanFamilyOrder ?? '';
        cfg.talismanMaxEncountersPerRun = clampNumber($('#am-afk-talisman-max-encounters')?.value, 0, 999, cfg.talismanMaxEncountersPerRun || 0);
        cfg.useNirvanaPill = $('#am-afk-use-nirvana')?.checked ?? cfg.useNirvanaPill;
        cfg.nirvanaMinRarity = clampNumber($('#am-afk-nirvana-min-rarity')?.value, 1, 5, cfg.nirvanaMinRarity || 4);
        cfg.nirvanaMaxPerRun = clampNumber($('#am-afk-nirvana-max-per-run')?.value, 0, 999, cfg.nirvanaMaxPerRun || 0);
        cfg.queueNirvanaPill = $('#am-afk-queue-nirvana')?.checked ?? cfg.queueNirvanaPill;
        cfg.autoDeclinePlayerEncounter = $('#am-afk-auto-decline-player')?.checked ?? cfg.autoDeclinePlayerEncounter;
        cfg.autoReloadOnUpdate = $('#am-afk-auto-reload-update')?.checked ?? cfg.autoReloadOnUpdate;
        cfg.adventureMode = $('#am-afk-adventure-mode')?.value || cfg.adventureMode || 'pause';
        cfg.adventureChoiceIndex = clampNumber($('#am-afk-adventure-choice')?.value, 1, 10, cfg.adventureChoiceIndex || 1);
        cfg.adventureChoiceMap = normalizeAdventureChoiceMap($('#am-afk-adventure-map')?.value ?? cfg.adventureChoiceMap);
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
            const initialAfkRisk = buildAfkRiskStatus(CONFIG.afkLoop, getCurrentGuardianConfig());

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
                        <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;margin-bottom:8px;padding:7px;background:${isDark?'rgba(15,23,42,0.35)':'rgba(241,245,249,0.9)'};border:1px solid ${border};border-radius:6px;">
                            <span style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};">当前</span>
                            <span id="am-afk-current-decision" style="font-size:11px;color:${text};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${CONFIG.afkLoop.enabled?'等待首次检查':'未启动'}</span>
                            <span style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};">上次</span>
                            <span id="am-afk-last-action" style="font-size:11px;color:${text};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">暂无</span>
                            <span style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};">下次</span>
                            <span id="am-afk-next-check" style="font-size:11px;color:${text};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${CONFIG.afkLoop.enabled?'等待首次检查':'未启动'}</span>
                        </div>
                        <div id="am-afk-risk-status" style="margin-bottom:8px;padding:7px;background:${isDark?'rgba(15,23,42,0.35)':'rgba(241,245,249,0.9)'};border:1px solid ${border};border-radius:6px;">
                            <div id="am-afk-risk-summary" style="font-size:11px;color:${initialAfkRisk.warningCount?'#f59e0b':text};font-weight:bold;margin-bottom:4px;">${escapeHtmlText(initialAfkRisk.summaryText)}</div>
                            <pre id="am-afk-risk-lines" style="margin:0;white-space:pre-wrap;word-break:break-word;color:${text};font-size:11px;line-height:1.45;">${escapeHtmlText(initialAfkRisk.itemTexts.concat(initialAfkRisk.warnings.map(item => `! ${item}`)).join('\n'))}</pre>
                        </div>
                        <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer;">
                            <input type="checkbox" id="am-afk-enabled" ${CONFIG.afkLoop.enabled?'checked':''} style="cursor:pointer;">
                            <span style="font-size:13px;color:${text};">启用冥想-探索循环</span>
                        </label>
                        <div style="display:flex;gap:8px;margin-bottom:8px;">
                            <button id="am-afk-preset-steady" style="flex:1;padding:7px;background:#475569;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">套用稳妥1倍</button>
                            <button id="am-afk-preset-rich" style="flex:1;padding:7px;background:#b45309;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">套用富裕50倍</button>
                        </div>
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
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
                            <div>
                                <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">卡住判定(秒)</div>
                                <input type="number" id="am-afk-stall-timeout" value="${CONFIG.afkLoop.stallTimeoutSeconds}" min="0" max="3600" step="5" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;">
                            </div>
                            <div>
                                <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">恢复窗口(秒)</div>
                                <input type="number" id="am-afk-resume-window" value="${CONFIG.afkLoop.resumeWindowSeconds}" min="0" max="3600" step="5" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;">
                            </div>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr;gap:6px;margin-bottom:8px;">
                            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                                <input type="checkbox" id="am-afk-auto-reload-update" ${CONFIG.afkLoop.autoReloadOnUpdate?'checked':''} style="cursor:pointer;">
                                <span style="font-size:12px;color:${text};">游戏提示更新时自动刷新页面</span>
                            </label>
                            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                                <input type="checkbox" id="am-afk-auto-fight" ${CONFIG.afkLoop.autoFight?'checked':''} style="cursor:pointer;">
                                <span style="font-size:12px;color:${text};">遭遇妖兽后自动迎战</span>
                            </label>
                            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                                <input type="checkbox" id="am-afk-auto-hire-guardian" ${CONFIG.afkLoop.autoHireGuardian?'checked':''} style="cursor:pointer;">
                                <span style="font-size:12px;color:${text};">遭遇时按游戏护道设置自动雇护道</span>
                            </label>
                            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                                <input type="checkbox" id="am-afk-auto-decline-player" ${CONFIG.afkLoop.autoDeclinePlayerEncounter?'checked':''} style="cursor:pointer;">
                                <span style="font-size:12px;color:${text};">自动婉拒陌生道友邂逅</span>
                            </label>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                                <div>
                                    <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">奇遇处理</div>
                                    <select id="am-afk-adventure-mode" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;cursor:pointer;">
                                        <option value="pause" ${CONFIG.afkLoop.adventureMode==='pause'?'selected':''}>暂停等待</option>
                                        <option value="fixed" ${CONFIG.afkLoop.adventureMode==='fixed'?'selected':''}>固定选择</option>
                                        <option value="strategy" ${CONFIG.afkLoop.adventureMode==='strategy'?'selected':''}>按ID策略</option>
                                    </select>
                                </div>
                                <div>
                                    <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">选择序号</div>
                                    <input type="number" id="am-afk-adventure-choice" value="${CONFIG.afkLoop.adventureChoiceIndex}" min="1" max="10" step="1" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;">
                                </div>
                            </div>
                            <div>
                                <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">奇遇策略表</div>
                                <textarea id="am-afk-adventure-map" rows="3" placeholder="456=2&#10;789=1" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;resize:vertical;">${escapeHtmlText(formatAdventureChoiceMap(CONFIG.afkLoop.adventureChoiceMap))}</textarea>
                            </div>
                            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                                <input type="checkbox" id="am-afk-auto-revive" ${CONFIG.afkLoop.autoRevive?'checked':''} style="cursor:pointer;">
                                <span style="font-size:12px;color:${text};">死亡后自动灵石复活</span>
                            </label>
                            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
                                <div>
                                    <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">复活上限/轮</div>
                                    <input type="number" id="am-afk-revive-max-per-run" value="${CONFIG.afkLoop.reviveMaxPerRun}" min="0" max="999" step="1" title="0 表示不限" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;">
                                </div>
                                <div>
                                    <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">用符遭遇/轮</div>
                                    <input type="number" id="am-afk-talisman-max-encounters" value="${CONFIG.afkLoop.talismanMaxEncountersPerRun}" min="0" max="999" step="1" title="0 表示不限" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;">
                                </div>
                                <div>
                                    <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">用丹上限/轮</div>
                                    <input type="number" id="am-afk-nirvana-max-per-run" value="${CONFIG.afkLoop.nirvanaMaxPerRun}" min="0" max="999" step="1" title="0 表示不限" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;">
                                </div>
                            </div>
                            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                                <input type="checkbox" id="am-afk-use-talismans" ${CONFIG.afkLoop.useTalismans?'checked':''} style="cursor:pointer;">
                                <span style="font-size:12px;color:${text};">战斗前自动使用战斗符箓</span>
                            </label>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                                <div>
                                    <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">最多符种</div>
                                    <input type="number" id="am-afk-talisman-max-kinds" value="${CONFIG.afkLoop.talismanMaxKinds}" min="1" max="5" step="1" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;">
                                </div>
                                <div>
                                    <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">每种数量</div>
                                    <input type="number" id="am-afk-talisman-qty" value="${CONFIG.afkLoop.talismanQuantity}" min="1" max="20" step="1" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;">
                                </div>
                            </div>
                            <div>
                                <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">符箓 family 顺序</div>
                                <input type="text" id="am-afk-talisman-family-order" value="${escapeHtmlText(CONFIG.afkLoop.talismanFamilyOrder)}" placeholder="留空=按品质；如 ghost,fire,shield" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;">
                            </div>
                            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                                <input type="checkbox" id="am-afk-use-nirvana" ${CONFIG.afkLoop.useNirvanaPill?'checked':''} style="cursor:pointer;">
                                <span style="font-size:12px;color:${text};">探索前使用涅槃重生丹</span>
                            </label>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                                <div>
                                    <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};margin-bottom:4px;">最低品质</div>
                                    <select id="am-afk-nirvana-min-rarity" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:12px;cursor:pointer;">
                                        <option value="4" ${CONFIG.afkLoop.nirvanaMinRarity===4?'selected':''}>史诗+</option>
                                        <option value="3" ${CONFIG.afkLoop.nirvanaMinRarity===3?'selected':''}>稀有+</option>
                                        <option value="2" ${CONFIG.afkLoop.nirvanaMinRarity===2?'selected':''}>优良+</option>
                                        <option value="1" ${CONFIG.afkLoop.nirvanaMinRarity===1?'selected':''}>任意</option>
                                    </select>
                                </div>
                                <label style="display:flex;align-items:center;gap:8px;margin-top:18px;cursor:pointer;">
                                    <input type="checkbox" id="am-afk-queue-nirvana" ${CONFIG.afkLoop.queueNirvanaPill?'checked':''} style="cursor:pointer;">
                                    <span style="font-size:12px;color:${text};">允许排队</span>
                                </label>
                            </div>
                        </div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <button id="am-afk-start" style="flex:1 1 90px;padding:8px;background:#7c3aed;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">启动挂机</button>
                            <button id="am-afk-stop" style="flex:1 1 90px;padding:8px;background:#64748b;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">停止挂机</button>
                            <button id="am-afk-copy-status" style="flex:1 1 90px;padding:8px;background:#0369a1;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">复制状态</button>
                            <button id="am-afk-copy-debug" style="flex:1 1 90px;padding:8px;background:#0f766e;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">复制摘要</button>
                        </div>
                        <div style="margin-top:8px;padding-top:8px;border-top:1px solid ${border};">
                            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
                                <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};font-weight:bold;">配置包</div>
                                <div style="display:flex;gap:6px;">
                                    <button id="am-afk-config-copy" style="padding:5px 8px;background:#0f766e;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;">复制</button>
                                    <button id="am-afk-config-import" style="padding:5px 8px;background:#334155;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;">导入</button>
                                    <button id="am-afk-config-clear" style="padding:5px 8px;background:transparent;color:${isDark?'#94a3b8':'#64748b'};border:1px solid ${border};border-radius:4px;cursor:pointer;font-size:11px;">清空</button>
                                </div>
                            </div>
                            <textarea id="am-afk-config-pack-input" rows="2" placeholder="JSON" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:11px;resize:vertical;"></textarea>
                            <pre id="am-afk-config-pack-output" style="margin:6px 0 0;white-space:pre-wrap;word-break:break-word;max-height:90px;overflow:auto;padding:7px;background:${isDark?'rgba(15,23,42,0.35)':'rgba(241,245,249,0.9)'};border:1px solid ${border};border-radius:4px;color:${text};font-size:11px;line-height:1.45;">未导入</pre>
                        </div>
                        <div style="margin-top:8px;padding-top:8px;border-top:1px solid ${border};">
                            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
                                <div style="font-size:11px;color:${isDark?'#94a3b8':'#64748b'};font-weight:bold;">摘要回放</div>
                                <div style="display:flex;gap:6px;">
                                    <button id="am-afk-replay-run" style="padding:5px 8px;background:#334155;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;">回放</button>
                                    <button id="am-afk-replay-import-strategy" style="padding:5px 8px;background:#0f766e;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;">导入策略</button>
                                    <button id="am-afk-replay-clear" style="padding:5px 8px;background:transparent;color:${isDark?'#94a3b8':'#64748b'};border:1px solid ${border};border-radius:4px;cursor:pointer;font-size:11px;">清空</button>
                                </div>
                            </div>
                            <textarea id="am-afk-replay-input" rows="3" placeholder="JSON" style="width:100%;padding:6px;background:${isDark?'#252b3a':'#fff'};border:1px solid ${border};border-radius:4px;color:${text};font-size:11px;resize:vertical;"></textarea>
                            <pre id="am-afk-replay-output" style="margin:6px 0 0;white-space:pre-wrap;word-break:break-word;max-height:120px;overflow:auto;padding:7px;background:${isDark?'rgba(15,23,42,0.35)':'rgba(241,245,249,0.9)'};border:1px solid ${border};border-radius:4px;color:${text};font-size:11px;line-height:1.45;">未导入</pre>
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
            $('#am-afk-copy-status')?.addEventListener('click', () => AfkLoopManager.copyStatusReport());
            $('#am-afk-copy-debug')?.addEventListener('click', () => AfkLoopManager.copyDebugSnapshot());
            $('#am-afk-preset-steady')?.addEventListener('click', () => AfkLoopManager.applyPreset('steady'));
            $('#am-afk-preset-rich')?.addEventListener('click', () => AfkLoopManager.applyPreset('rich'));
            $('#am-afk-config-copy')?.addEventListener('click', () => this.copyAfkConfigPack());
            $('#am-afk-config-import')?.addEventListener('click', () => this.importAfkConfigPack());
            $('#am-afk-config-clear')?.addEventListener('click', () => this.clearAfkConfigPack());
            $('#am-afk-replay-run')?.addEventListener('click', () => this.renderAfkIssueReplay());
            $('#am-afk-replay-import-strategy')?.addEventListener('click', () => this.importAdventureStrategyFromReplay());
            $('#am-afk-replay-clear')?.addEventListener('click', () => this.clearAfkIssueReplay());



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
                AfkLoopManager.refreshPanelStatus();

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
            const afkResumeWindowEl = $('#am-afk-resume-window');
            const afkAutoReviveEl = $('#am-afk-auto-revive');
            const afkReviveMaxPerRunEl = $('#am-afk-revive-max-per-run');
            const afkAutoFightEl = $('#am-afk-auto-fight');
            const afkAutoHireGuardianEl = $('#am-afk-auto-hire-guardian');
            const afkAutoDeclinePlayerEl = $('#am-afk-auto-decline-player');
            const afkAutoReloadUpdateEl = $('#am-afk-auto-reload-update');
            const afkAdventureModeEl = $('#am-afk-adventure-mode');
            const afkAdventureChoiceEl = $('#am-afk-adventure-choice');
            const afkAdventureMapEl = $('#am-afk-adventure-map');
            const afkUseTalismansEl = $('#am-afk-use-talismans');
            const afkTalismanMaxKindsEl = $('#am-afk-talisman-max-kinds');
            const afkTalismanQtyEl = $('#am-afk-talisman-qty');
            const afkTalismanFamilyOrderEl = $('#am-afk-talisman-family-order');
            const afkTalismanMaxEncountersEl = $('#am-afk-talisman-max-encounters');
            const afkUseNirvanaEl = $('#am-afk-use-nirvana');
            const afkNirvanaMinRarityEl = $('#am-afk-nirvana-min-rarity');
            const afkNirvanaMaxPerRunEl = $('#am-afk-nirvana-max-per-run');
            const afkQueueNirvanaEl = $('#am-afk-queue-nirvana');

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
            if (afkResumeWindowEl) afkResumeWindowEl.value = CONFIG.afkLoop.resumeWindowSeconds;
            if (afkAutoReviveEl) afkAutoReviveEl.checked = CONFIG.afkLoop.autoRevive;
            if (afkReviveMaxPerRunEl) afkReviveMaxPerRunEl.value = CONFIG.afkLoop.reviveMaxPerRun;
            if (afkAutoFightEl) afkAutoFightEl.checked = CONFIG.afkLoop.autoFight;
            if (afkAutoHireGuardianEl) afkAutoHireGuardianEl.checked = CONFIG.afkLoop.autoHireGuardian;
            if (afkAutoDeclinePlayerEl) afkAutoDeclinePlayerEl.checked = CONFIG.afkLoop.autoDeclinePlayerEncounter;
            if (afkAutoReloadUpdateEl) afkAutoReloadUpdateEl.checked = CONFIG.afkLoop.autoReloadOnUpdate;
            if (afkAdventureModeEl) afkAdventureModeEl.value = CONFIG.afkLoop.adventureMode;
            if (afkAdventureChoiceEl) afkAdventureChoiceEl.value = CONFIG.afkLoop.adventureChoiceIndex;
            if (afkAdventureMapEl) afkAdventureMapEl.value = formatAdventureChoiceMap(CONFIG.afkLoop.adventureChoiceMap);
            if (afkUseTalismansEl) afkUseTalismansEl.checked = CONFIG.afkLoop.useTalismans;
            if (afkTalismanMaxKindsEl) afkTalismanMaxKindsEl.value = CONFIG.afkLoop.talismanMaxKinds;
            if (afkTalismanQtyEl) afkTalismanQtyEl.value = CONFIG.afkLoop.talismanQuantity;
            if (afkTalismanFamilyOrderEl) afkTalismanFamilyOrderEl.value = CONFIG.afkLoop.talismanFamilyOrder;
            if (afkTalismanMaxEncountersEl) afkTalismanMaxEncountersEl.value = CONFIG.afkLoop.talismanMaxEncountersPerRun;
            if (afkUseNirvanaEl) afkUseNirvanaEl.checked = CONFIG.afkLoop.useNirvanaPill;
            if (afkNirvanaMinRarityEl) afkNirvanaMinRarityEl.value = CONFIG.afkLoop.nirvanaMinRarity;
            if (afkNirvanaMaxPerRunEl) afkNirvanaMaxPerRunEl.value = CONFIG.afkLoop.nirvanaMaxPerRun;
            if (afkQueueNirvanaEl) afkQueueNirvanaEl.checked = CONFIG.afkLoop.queueNirvanaPill;
            this.updateAfkState();
        },

        updateAfkState() {
            const status = buildAfkPanelStatus(CONFIG.afkLoop, [], {
                lastEvaluationAt: 0,
                busy: false
            }, Date.now());
            const stateEl = $('#am-afk-state');
            if (stateEl) {
                stateEl.textContent = status.stateText;
                stateEl.style.color = CONFIG.afkLoop.enabled ? '#3dab97' : '#94a3b8';
            }
            const currentDecisionEl = $('#am-afk-current-decision');
            if (currentDecisionEl) currentDecisionEl.textContent = status.currentDecisionText;
            const lastActionEl = $('#am-afk-last-action');
            if (lastActionEl) lastActionEl.textContent = status.lastActionText;
            const nextCheckEl = $('#am-afk-next-check');
            if (nextCheckEl) nextCheckEl.textContent = status.nextCheckText;
            const enabledEl = $('#am-afk-enabled');
            if (enabledEl) enabledEl.checked = CONFIG.afkLoop.enabled;
            this.updateAfkRiskStatus();
        },

        updateAfkRiskStatus() {
            const summaryEl = $('#am-afk-risk-summary');
            const linesEl = $('#am-afk-risk-lines');
            if (!summaryEl && !linesEl) return;
            const usage = AfkLoopManager && typeof AfkLoopManager.getResourceUsage === 'function'
                ? AfkLoopManager.getResourceUsage()
                : {};
            const status = buildAfkRiskStatus(CONFIG.afkLoop, getCurrentGuardianConfig(), usage);
            if (summaryEl) {
                summaryEl.textContent = status.summaryText;
                summaryEl.style.color = status.warningCount ? '#f59e0b' : '';
            }
            if (linesEl) {
                linesEl.textContent = status.itemTexts.concat(status.warnings.map(item => `! ${item}`)).join('\n');
            }
        },

        async copyAfkConfigPack() {
            try {
                const cfg = readAfkLoopConfigFromUI();
                const pack = buildAfkConfigPack(cfg, getCurrentGuardianConfig(), {
                    label: document.title || 'LingVerse AFK'
                });
                const text = JSON.stringify(pack, null, 2);
                await AfkLoopManager.copyText(text);
                const outputEl = $('#am-afk-config-pack-output');
                if (outputEl) outputEl.textContent = pack.riskStatus.summaryText;
                Logger.success('已复制挂机配置包');
            } catch (e) {
                Logger.warn(`复制挂机配置包失败: ${e.message || e}`);
            }
        },

        importAfkConfigPack() {
            const inputEl = $('#am-afk-config-pack-input');
            const outputEl = $('#am-afk-config-pack-output');
            if (!inputEl) return;
            try {
                const imported = resolveAfkConfigPackImport(inputEl.value);
                CONFIG.afkLoop = imported.afkLoop;
                CONFIG.guardian = {
                    enabled: imported.guardian.enabled,
                    maxFee: imported.guardian.maxFee,
                    minAtk: imported.guardian.minAtk,
                    mode: imported.guardian.mode,
                    priority: imported.guardian.priorityKey || imported.guardian.priority.join(','),
                    threatLevel: imported.guardian.threatLevel
                };
                saveConfig();
                this.updatePanelFromConfig();
                if (outputEl) {
                    outputEl.textContent = [
                        imported.riskStatus.summaryText,
                        ...imported.importWarnings.map(item => `! ${item}`)
                    ].join('\n');
                }
                Logger.success('已导入挂机配置包，未自动启动挂机');
            } catch (e) {
                if (outputEl) outputEl.textContent = `配置包导入失败: ${e.message || e}`;
                Logger.warn(`挂机配置包导入失败: ${e.message || e}`);
            }
        },

        clearAfkConfigPack() {
            const inputEl = $('#am-afk-config-pack-input');
            const outputEl = $('#am-afk-config-pack-output');
            if (inputEl) inputEl.value = '';
            if (outputEl) outputEl.textContent = '未导入';
        },

        renderAfkIssueReplay() {
            const inputEl = $('#am-afk-replay-input');
            const outputEl = $('#am-afk-replay-output');
            if (!inputEl || !outputEl) return;
            try {
                const replay = buildAfkIssueReplay(inputEl.value);
                const lines = replay.replayLines.slice();
                if (replay.strategyImportText) {
                    lines.push('', '策略表:', replay.strategyImportText);
                }
                outputEl.textContent = lines.join('\n');
                Logger.success('挂机摘要回放已生成');
            } catch (e) {
                outputEl.textContent = `摘要解析失败: ${e.message || e}`;
                Logger.warn(`挂机摘要回放失败: ${e.message || e}`);
            }
        },

        importAdventureStrategyFromReplay() {
            const inputEl = $('#am-afk-replay-input');
            const outputEl = $('#am-afk-replay-output');
            if (!inputEl) return;
            try {
                const merged = mergeAdventureStrategyImport(CONFIG.afkLoop, inputEl.value);
                CONFIG.afkLoop = merged.afkLoop;
                saveConfig();
                this.updatePanelFromConfig();
                if (outputEl) {
                    outputEl.textContent = [
                        `已导入奇遇策略 ${merged.importedCount} 条，覆盖 ${merged.overwrittenCount} 条`,
                        ...merged.importLines,
                        ...merged.warnings.map(item => `! ${item}`)
                    ].join('\n');
                }
                Logger.success(`已导入奇遇策略 ${merged.importedCount} 条`);
            } catch (e) {
                if (outputEl) outputEl.textContent = `奇遇策略导入失败: ${e.message || e}`;
                Logger.warn(`奇遇策略导入失败: ${e.message || e}`);
            }
        },

        clearAfkIssueReplay() {
            const inputEl = $('#am-afk-replay-input');
            const outputEl = $('#am-afk-replay-output');
            if (inputEl) inputEl.value = '';
            if (outputEl) outputEl.textContent = '未导入';
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
        encounterBusy: false,
        lastTalismanEncounterKey: '',
        lastGuardianEncounterKey: '',
        lastTalismanAttempt: null,
        lastGuardianAttempt: null,
        lastFightAttempt: null,
        lastNirvanaPillAttempt: null,
        postReviveResumeUntil: 0,
        postInteractionResumeUntil: 0,
        resourceUsage: normalizeAfkResourceUsage({}),
        decisionHistory: [],

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
            this.resetResourceUsage();
            saveConfig();
            UI.updateAfkState();
            this.refreshPanelStatus();
            this.ensureTimer();
            Logger.success(`自动挂机循环已启动：冥想${CONFIG.afkLoop.meditationMinutes}分钟，神识低于${CONFIG.afkLoop.minSpirit}回冥想`);
            this.tick(true);
        },

        stop() {
            CONFIG.afkLoop.enabled = false;
            saveConfig();
            UI.updateAfkState();
            this.lastDecisionKey = '';
            this.refreshPanelStatus();
            Logger.warn('自动挂机循环已停止');
        },

        resetResourceUsage() {
            this.resourceUsage = normalizeAfkResourceUsage({});
        },

        getResourceUsage() {
            this.resourceUsage = normalizeAfkResourceUsage(this.resourceUsage);
            return Object.assign({}, this.resourceUsage);
        },

        incrementResourceUsage(kind) {
            const usage = this.getResourceUsage();
            const spec = getAfkResourceBudgetSpec(kind);
            usage[spec.usageKey] = clampNumber((usage[spec.usageKey] || 0) + 1, 0, 999, 0);
            this.resourceUsage = usage;
            return this.getResourceUsage();
        },

        applyPreset(name) {
            readAfkLoopConfigFromUI();
            CONFIG.afkLoop = applyAfkPreset(CONFIG.afkLoop, name);
            saveConfig();
            UI.updatePanelFromConfig();
            this.refreshPanelStatus();
            const label = name === 'rich' ? '富裕50倍挂机预设' : '稳妥1倍挂机预设';
            Logger.success(`已套用${label}，未自动启动挂机`);
        },

        async copyDebugSnapshot() {
            try {
                const cfg = readAfkLoopConfigFromUI();
                const now = Date.now();
                const snapshot = await this.buildSnapshot(now, cfg);
                const decision = decideAfkNextAction(snapshot, cfg, now);
                this.recordDecision(decision, snapshot, now);
                const debugSnapshot = buildAfkDebugSnapshot(snapshot, cfg, decision, {
                    capturedAt: new Date(now).toISOString(),
                    page: { title: document.title || '', url: location.href || '' },
                    decisionHistory: this.getDecisionHistory(),
                    recentLogs: Logger.getRecentEntries(),
                    nirvanaPillAttempt: this.lastNirvanaPillAttempt,
                    talismanAttempt: this.lastTalismanAttempt,
                    fightAttempt: this.lastFightAttempt,
                    guardianAttempt: this.lastGuardianAttempt
                });
                const debugSummary = buildAfkDebugSummary(debugSnapshot);
                const text = JSON.stringify(debugSummary, null, 2);
                await this.copyText(text);
                Logger.success('已复制挂机调试脱敏摘要，可直接发给开发者分析');
            } catch (e) {
                Logger.warn(`复制挂机调试脱敏摘要失败: ${e.message || e}`);
            }
        },

        async copyStatusReport() {
            try {
                const cfg = readAfkLoopConfigFromUI();
                const now = Date.now();
                const snapshot = await this.buildSnapshot(now, cfg);
                const decision = decideAfkNextAction(snapshot, cfg, now);
                this.recordDecision(decision, snapshot, now);
                const debugSnapshot = buildAfkDebugSnapshot(snapshot, cfg, decision, {
                    capturedAt: new Date(now).toISOString(),
                    page: { title: document.title || '', url: location.href || '' },
                    decisionHistory: this.getDecisionHistory(),
                    recentLogs: Logger.getRecentEntries(),
                    nirvanaPillAttempt: this.lastNirvanaPillAttempt,
                    talismanAttempt: this.lastTalismanAttempt,
                    fightAttempt: this.lastFightAttempt,
                    guardianAttempt: this.lastGuardianAttempt
                });
                const report = buildAfkStatusReport(buildAfkDebugSummary(debugSnapshot));
                await this.copyText(report.text);
                Logger.success('已复制挂机状态报告，可发给测试者或开发者快速查看');
            } catch (e) {
                Logger.warn(`复制挂机状态报告失败: ${e.message || e}`);
            }
        },

        async copyText(text) {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(text);
                return;
            }
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            textarea.style.top = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            const ok = document.execCommand && document.execCommand('copy');
            textarea.remove();
            if (!ok) throw new Error('浏览器不允许自动复制');
        },

        async tick(force) {
            const cfg = normalizeAfkLoopConfig(CONFIG.afkLoop);
            CONFIG.afkLoop = cfg;
            if (!cfg.enabled) {
                this.refreshPanelStatus();
                return;
            }

            const now = Date.now();
            if (!force && now - this.lastEvaluationAt < cfg.tickInterval) {
                this.refreshPanelStatus(now);
                return;
            }
            if (this.busy) {
                this.refreshPanelStatus(now);
                return;
            }

            this.busy = true;
            this.lastEvaluationAt = now;
            this.refreshPanelStatus(now);
            try {
                const snapshot = await this.buildSnapshot(now, cfg);
                const decision = decideAfkNextAction(snapshot, cfg, now);
                this.recordDecision(decision, snapshot, now);
                await this.executeDecision(decision, snapshot, cfg);
            } catch (e) {
                Logger.warn(`自动挂机循环检查失败: ${e.message || e}`);
            } finally {
                this.busy = false;
                this.refreshPanelStatus();
            }
        },

        recordDecision(decision, snapshot, now) {
            const entry = {
                at: new Date(now || Date.now()).toISOString(),
                action: decision && decision.action || '',
                reason: decision && decision.reason || '',
                label: this.formatReason(decision && decision.reason),
                spirit: numberOrNull(snapshot && snapshot.spirit),
                maxSpirit: numberOrNull(snapshot && snapshot.maxSpirit),
                isMeditating: !!(snapshot && snapshot.isMeditating),
                autoExploreRunning: !!(snapshot && snapshot.autoExploreRunning),
                gameUpdateNoticeActive: !!(snapshot && snapshot.gameUpdateNoticeActive),
                merchantActive: !!(snapshot && snapshot.merchantActive),
                encounterActive: !!(snapshot && snapshot.encounterActive),
                playerEncounterActive: !!(snapshot && snapshot.playerEncounterActive),
                adventureActive: !!(snapshot && snapshot.adventureActive),
                adventureId: snapshot && snapshot.adventureId ? snapshot.adventureId : null
            };
            this.decisionHistory.push(entry);
            if (this.decisionHistory.length > DEBUG_DECISION_HISTORY_LIMIT * 2) {
                this.decisionHistory.splice(0, this.decisionHistory.length - DEBUG_DECISION_HISTORY_LIMIT * 2);
            }
            this.refreshPanelStatus(now);
        },

        getDecisionHistory() {
            return this.decisionHistory.slice(-DEBUG_DECISION_HISTORY_LIMIT);
        },

        getPanelStatus(now) {
            return buildAfkPanelStatus(CONFIG.afkLoop, this.getDecisionHistory(), {
                lastEvaluationAt: this.lastEvaluationAt,
                busy: this.busy
            }, now || Date.now());
        },

        refreshPanelStatus(now) {
            const status = this.getPanelStatus(now);
            const stateEl = $('#am-afk-state');
            if (stateEl) {
                stateEl.textContent = status.stateText;
                stateEl.style.color = CONFIG.afkLoop.enabled ? '#3dab97' : '#94a3b8';
            }
            const currentDecisionEl = $('#am-afk-current-decision');
            if (currentDecisionEl) currentDecisionEl.textContent = status.currentDecisionText;
            const lastActionEl = $('#am-afk-last-action');
            if (lastActionEl) lastActionEl.textContent = status.lastActionText;
            const nextCheckEl = $('#am-afk-next-check');
            if (nextCheckEl) nextCheckEl.textContent = status.nextCheckText;
            const enabledEl = $('#am-afk-enabled');
            if (enabledEl) enabledEl.checked = CONFIG.afkLoop.enabled;
            if (UI && typeof UI.updateAfkRiskStatus === 'function') UI.updateAfkRiskStatus();
        },

        async buildSnapshot(now, cfg) {
            installAdventureStepHook();
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
            const autoExploreActive = autoExploreRunning || autoExplorePending;

            if (!autoExploreActive || this.lastAutoExploreCount === null || autoExploreCount !== this.lastAutoExploreCount) {
                this.lastExploreProgressAt = now;
                this.lastAutoExploreCount = autoExploreCount;
            }

            const encounterOverlay = $('#encounterOverlay');
            const combatPanel = $('#combatPanel');
            const talismanDialog = $('#encounterTalismanDialog');
            const adventureOverlay = $('#adventureOverlay');
            const gameUpdateNoticeActive = detectGameUpdateNotice(document.body ? document.body.innerText : '');
            const adventureStep = _win._lingverseAutoMapLastAdventureStep || null;
            const playerEncounterActive = [
                '#pvpEncounterModal',
                '#encounterInviteModal',
                '#encounterSessionModal',
                '#encounterTradeModal',
                '#encounterBattleModal',
                '#encounterRespondPickerModal'
            ].some(selector => {
                const el = $(selector);
                return !!(el && !el.classList.contains('hidden'));
            });
            const combatActive = !!(combatPanel && combatPanel.classList.contains('active'));
            const encounterActive = !!(
                _win._encounterActive ||
                (encounterOverlay && !encounterOverlay.classList.contains('hidden')) ||
                combatActive ||
                (talismanDialog && !talismanDialog.classList.contains('hidden'))
            );
            const adventureActive = !!(_win._companionAdventureActive || (adventureOverlay && !adventureOverlay.classList.contains('hidden')));
            const encounterText = encounterOverlay && !encounterOverlay.classList.contains('hidden') ? encounterOverlay.innerText : '';
            const encounterKey = buildEncounterKey({
                encounterActive,
                combatActive,
                encounterMonsterId: _win._currentEncounterMonsterId,
                encounterMonsterStage: _win._currentEncounterMonsterStage,
                encounterMonsterLevel: _win._currentEncounterMonsterLevel,
                encounterText
            });

            const exploreStalled = isExploreStalledState({
                autoExploreRunning,
                autoExplorePending,
                lastExploreProgressAt: this.lastExploreProgressAt
            }, cfg, now);

            return {
                isMeditating: meditationStatus ? !!meditationStatus.isMeditating : !!player.isMeditating,
                meditationDurationSeconds: meditationStatus ? meditationStatus.durationSeconds : undefined,
                spirit: player.spirit,
                maxSpirit: player.maxSpirit,
                spiritCost: player.spiritCost,
                canExplore: player.canExplore,
                exploreDisabledReason: player.exploreDisabledReason,
                isDead: !!(player.isDead || _win.playerDead),
                gameUpdateNoticeActive,
                immortalPrisonActive: !!(player.currentArea && String(player.currentArea).indexOf('immortal_prison_') === 0),
                adventureActive,
                adventureId: adventureActive && adventureStep ? adventureStep.adventureId : undefined,
                adventureComplete: adventureActive && adventureStep ? !!adventureStep.isComplete : false,
                adventureStep: adventureActive && adventureStep ? adventureStep.step : undefined,
                adventureTotalSteps: adventureActive && adventureStep ? adventureStep.totalSteps : undefined,
                adventureChoices: adventureActive && adventureStep ? adventureStep.choices || [] : [],
                playerEncounterActive,
                merchantActive: MerchantAutoBuyer.isMerchantActive(),
                encounterActive,
                combatActive,
                resourceUsage: this.getResourceUsage(),
                encounterKey,
                encounterMonsterId: _win._currentEncounterMonsterId,
                encounterMonsterStage: _win._currentEncounterMonsterStage,
                encounterMonsterLevel: _win._currentEncounterMonsterLevel,
                autoExploreRunning,
                autoExplorePending,
                postReviveResume: this.postReviveResumeUntil > now,
                postInteractionResume: this.postInteractionResumeUntil > now,
                exploreStalled
            };
        },

        async executeDecision(decision, snapshot, cfg) {
            const key = `${decision.action}:${decision.reason}`;
            if (!snapshot || (!snapshot.encounterActive && !snapshot.combatActive)) {
                this.lastTalismanEncounterKey = '';
                this.lastGuardianEncounterKey = '';
            }
            if (decision.action === 'wait' || decision.action === 'idle') {
                if (key !== this.lastDecisionKey && decision.reason !== 'auto-explore-running') {
                    Logger.info(`自动挂机等待：${this.formatReason(decision.reason)}`);
                }
                this.lastDecisionKey = key;
                return;
            }

            this.lastDecisionKey = key;
            if (decision.action === 'reloadPage') {
                Logger.info(`自动挂机刷新页面：${this.formatReason(decision.reason)}`);
                this.reloadGamePage();
                return;
            }
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
                await this.startAutoExplore(cfg.exploreMultiplier, cfg);
                return;
            }
            if (decision.action === 'handleEncounter') {
                Logger.info(`自动挂机处理遭遇：${this.formatReason(decision.reason)}`);
                await this.handleEncounter(cfg, snapshot);
                return;
            }
            if (decision.action === 'handlePlayerEncounter') {
                Logger.info(`自动挂机处理陌生道友邂逅：${this.formatReason(decision.reason)}`);
                await this.handlePlayerEncounter(cfg);
                return;
            }
            if (decision.action === 'handleAdventure') {
                Logger.info(`自动挂机处理奇遇链：${this.formatReason(decision.reason)}`);
                await this.handleAdventure(cfg);
                return;
            }
            if (decision.action === 'revive') {
                Logger.warn('自动挂机尝试灵石复活');
                await this.revive(cfg);
            }
        },

        reloadGamePage() {
            try {
                if (typeof location !== 'undefined' && location.reload) {
                    location.reload();
                } else if (_win.location && _win.location.reload) {
                    _win.location.reload();
                }
            } catch (e) {
                Logger.warn(`自动刷新页面失败: ${e.message || e}`);
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

        async startAutoExplore(multiplier, cfg) {
            try {
                await this.maybeUseNirvanaRebirthPill(cfg || CONFIG.afkLoop);
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

        async maybeUseNirvanaRebirthPill(cfg) {
            const normalizedCfg = normalizeAfkLoopConfig(cfg || {});
            const now = Date.now();
            let attempt = resolveNirvanaRebirthPillAttempt(_win._lastPlayerData || {}, [], normalizedCfg, now, this.getResourceUsage());
            this.lastNirvanaPillAttempt = attempt;
            if (attempt.reason === 'disabled') return;
            if (attempt.reason === 'active-five-root-buff') {
                Logger.info('已有五行通灵效果，跳过涅槃重生丹');
                return;
            }
            if (attempt.reason === 'budget-exhausted') {
                Logger.warn('涅槃重生丹次数已到本轮上限，跳过用丹');
                return;
            }

            let items = [];
            try {
                const res = await API.getInventory();
                if (res.code === 200 && res.data) items = res.data.items || res.data || [];
            } catch (e) {
                Logger.warn(`读取涅槃重生丹失败: ${e.message || e}`);
                return;
            }

            attempt = resolveNirvanaRebirthPillAttempt(_win._lastPlayerData || {}, items, normalizedCfg, now, this.getResourceUsage());
            this.lastNirvanaPillAttempt = attempt;
            if (attempt.reason === 'budget-exhausted') {
                Logger.warn('涅槃重生丹次数已到本轮上限，跳过用丹');
                return;
            }
            if (!attempt.shouldUse || !attempt.pill) {
                Logger.info(`未找到品质满足要求的涅槃重生丹（最低${attempt.minRarity}阶），跳过`);
                return;
            }

            const pill = attempt.pill;
            try {
                Logger.info(`自动使用涅槃重生丹: ${pill.name || pill.templateId}`);
                const res = await API.useItem(pill.itemId, 1);
                if (res.code !== 200) {
                    Logger.warn(`涅槃重生丹使用失败: ${res.message || '未知错误'}`);
                    return;
                }
                this.incrementResourceUsage('nirvanaPills');
                this.refreshGameData();
                await wait(700);
            } catch (e) {
                Logger.warn(`涅槃重生丹使用失败: ${e.message || e}`);
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

        async revive(cfg) {
            const reviveBudget = resolveAfkResourceBudget('revive', cfg || CONFIG.afkLoop, this.getResourceUsage());
            if (!reviveBudget.allowed) {
                Logger.warn('自动复活次数已到本轮上限，暂停等待手动处理');
                return;
            }
            try {
                if (typeof _win.handleRevive === 'function') {
                    await _win.handleRevive();
                } else {
                    const res = await API.revive();
                    if (res.code !== 200) throw new Error(res.message || '复活失败');
                }
                this.incrementResourceUsage('revive');
                const windowMs = getResumeWindowMs(cfg || CONFIG.afkLoop);
                this.postReviveResumeUntil = windowMs > 0 ? Date.now() + windowMs : 0;
                this.lastDecisionKey = '';
                this.refreshGameData();
            } catch (e) {
                Logger.warn(`自动复活失败: ${e.message || e}`);
            }
        },

        async handleEncounter(cfg, snapshot) {
            if (this.encounterBusy) return;
            this.encounterBusy = true;
            try {
                if (cfg.useTalismans) {
                    await this.useCombatTalismans(cfg, snapshot);
                }
                if (cfg.autoHireGuardian) {
                    const handled = await this.tryHireEncounterGuardian(cfg, snapshot);
                    if (!handled) return;
                    return;
                }
                if (cfg.autoFight) {
                    await this.fightEncounter(cfg, snapshot);
                }
            } finally {
                this.encounterBusy = false;
            }
        },

        async tryHireEncounterGuardian(cfg, snapshot) {
            const guardianCfg = getCurrentGuardianConfig();
            const guardianUse = resolveEncounterGuardianAttempt(this.lastGuardianEncounterKey, snapshot, cfg, guardianCfg);
            if (!guardianUse.shouldAttempt) {
                this.lastGuardianAttempt = normalizeGuardianAttempt({
                    shouldAttempt: false,
                    reason: guardianUse.reason,
                    encounterKey: guardianUse.encounterKey,
                    markEncounterKey: guardianUse.markEncounterKey,
                    hireTriggered: false,
                    guardian: guardianCfg
                }, guardianCfg);
                return false;
            }

            let hireTriggered = false;
            let failureMessage = '';
            this.lastGuardianAttempt = normalizeGuardianAttempt({
                shouldAttempt: true,
                reason: guardianUse.reason,
                encounterKey: guardianUse.encounterKey,
                markEncounterKey: guardianUse.markEncounterKey,
                hireTriggered: false,
                guardian: guardianCfg
            }, guardianCfg);
            try {
                Logger.info(`自动尝试雇护道：模式${guardianCfg.mode}，最高费用${guardianCfg.maxFee || '不限'}`);
                const hireBtn = $('#encounterHireProtectorBtn');
                if (hireBtn && !hireBtn.disabled) {
                    hireBtn.click();
                    hireTriggered = true;
                } else if (typeof _win.tryAutoHireProtectorForEncounter === 'function') {
                    hireTriggered = !!(await _win.tryAutoHireProtectorForEncounter({ silent: false }));
                } else {
                    let res = await API.autoHireGuardian(buildGuardianHirePayload(guardianCfg));
                    if (res && res.code === 429) {
                        await wait(600);
                        res = await API.autoHireGuardian(buildGuardianHirePayload(guardianCfg));
                    }
                    hireTriggered = !!(res && res.code === 200 && res.data && res.data.combat);
                    if (!hireTriggered && res && res.message) {
                        failureMessage = res.message;
                        Logger.warn(`自动雇护道失败: ${res.message}`);
                    }
                }
            } catch (e) {
                failureMessage = e.message || String(e);
                Logger.warn(`自动雇护道失败: ${e.message || e}`);
            }

            const completedAttempt = resolveEncounterGuardianAttempt(this.lastGuardianEncounterKey, snapshot, cfg, guardianCfg, { attemptCompleted: true });
            if (completedAttempt.markEncounterKey) this.lastGuardianEncounterKey = completedAttempt.markEncounterKey;
            this.lastGuardianAttempt = normalizeGuardianAttempt({
                shouldAttempt: true,
                reason: hireTriggered ? 'hire-triggered' : 'hire-failed',
                encounterKey: completedAttempt.encounterKey,
                markEncounterKey: completedAttempt.markEncounterKey,
                hireTriggered,
                failureMessage: failureMessage || (hireTriggered ? '' : '未触发自动雇护道'),
                guardian: guardianCfg
            }, guardianCfg);

            if (!hireTriggered) {
                Logger.warn('自动雇护道未成功，本次遭遇暂停等待手动处理');
                return false;
            }

            Logger.success('已触发自动雇护道，等待战斗或遭遇结算');
            const windowMs = getResumeWindowMs(cfg);
            this.postInteractionResumeUntil = windowMs > 0 ? Date.now() + windowMs : 0;
            this.lastDecisionKey = '';
            this.refreshGameData();
            setTimeout(() => this.tick(true), 1200);
            return true;
        },

        async useCombatTalismans(cfg, snapshot) {
            const talismanUse = resolveCombatTalismanAttempt(this.lastTalismanEncounterKey, snapshot, null);
            if (!talismanUse.shouldAttempt) {
                this.lastTalismanAttempt = normalizeCombatTalismanAttempt({
                    shouldAttempt: false,
                    reason: talismanUse.encounterKey ? 'already-handled' : 'no-encounter',
                    encounterKey: talismanUse.encounterKey
                });
                if (talismanUse.encounterKey) Logger.info('本次遭遇已处理过战斗符箓，跳过重复用符');
                return;
            }
            const talismanBudget = resolveAfkResourceBudget('talismanEncounters', cfg || CONFIG.afkLoop, this.getResourceUsage());
            if (!talismanBudget.allowed) {
                this.lastTalismanAttempt = normalizeCombatTalismanAttempt({
                    shouldAttempt: false,
                    reason: 'budget-exhausted',
                    encounterKey: talismanUse.encounterKey,
                    failureMessage: '战斗符箓次数已到本轮上限'
                });
                Logger.warn('战斗符箓次数已到本轮上限，跳过用符');
                return;
            }

            let items = [];
            try {
                const res = await API.getInventory();
                if (res.code === 200 && res.data) {
                    items = res.data.items || res.data || [];
                } else {
                    this.lastTalismanAttempt = normalizeCombatTalismanAttempt({
                        shouldAttempt: true,
                        reason: 'inventory-read-failed',
                        encounterKey: talismanUse.encounterKey,
                        failureMessage: res && res.message || '读取背包失败'
                    });
                    Logger.warn(`读取战斗符箓失败: ${res && res.message || '未知错误'}`);
                    return;
                }
            } catch (e) {
                this.lastTalismanAttempt = normalizeCombatTalismanAttempt({
                    shouldAttempt: true,
                    reason: 'inventory-read-failed',
                    encounterKey: talismanUse.encounterKey,
                    failureMessage: e.message || String(e)
                });
                Logger.warn(`读取战斗符箓失败: ${e.message || e}`);
                return;
            }

            const selected = selectCombatTalismans(items, {
                maxKinds: cfg.talismanMaxKinds,
                quantityPerKind: cfg.talismanQuantity,
                familyOrder: cfg.talismanFamilyOrder
            });
            if (selected.length === 0) {
                const emptyAttempt = resolveCombatTalismanAttempt(this.lastTalismanEncounterKey, snapshot, selected);
                if (emptyAttempt.markEncounterKey) this.lastTalismanEncounterKey = emptyAttempt.markEncounterKey;
                this.lastTalismanAttempt = normalizeCombatTalismanAttempt({
                    shouldAttempt: true,
                    reason: 'no-usable-talismans',
                    encounterKey: emptyAttempt.encounterKey,
                    markEncounterKey: emptyAttempt.markEncounterKey,
                    selectedTalismans: selected,
                    usedKinds: 0,
                    failedKinds: 0
                });
                Logger.info('没有可用战斗符箓，跳过用符');
                return;
            }

            this.lastTalismanAttempt = normalizeCombatTalismanAttempt({
                shouldAttempt: true,
                reason: 'talismans-selected',
                encounterKey: talismanUse.encounterKey,
                selectedTalismans: selected,
                usedKinds: 0,
                failedKinds: selected.length
            });

            try {
                if (typeof _win.showEncounterTalismanDialog === 'function') {
                    _win.showEncounterTalismanDialog();
                    await wait(300);
                }
            } catch (e) {}

            let usedKinds = 0;
            const failures = [];
            for (const item of selected) {
                try {
                    const res = await API.useItem(item.itemId, item.quantity);
                    if (res.code !== 200) {
                        const message = `${item.name || item.templateId} 使用失败: ${res.message || '未知错误'}`;
                        failures.push(message);
                        Logger.warn(message);
                        continue;
                    }
                    usedKinds += 1;
                    Logger.info(`已用战斗符箓: ${item.name || item.templateId} ×${item.quantity}`);
                    await wait(650);
                } catch (e) {
                    const message = `${item.name || item.templateId} 使用失败: ${e.message || e}`;
                    failures.push(message);
                    Logger.warn(message);
                }
            }

            try {
                if (typeof _win.hideEncounterTalismanDialog === 'function') {
                    _win.hideEncounterTalismanDialog();
                } else {
                    const dialog = $('#encounterTalismanDialog');
                    if (dialog) dialog.classList.add('hidden');
                }
            } catch (e) {}

            const completedAttempt = resolveCombatTalismanAttempt(this.lastTalismanEncounterKey, snapshot, selected, { attemptCompleted: true });
            if (completedAttempt.markEncounterKey) this.lastTalismanEncounterKey = completedAttempt.markEncounterKey;
            this.lastTalismanAttempt = normalizeCombatTalismanAttempt({
                shouldAttempt: true,
                reason: 'completed',
                encounterKey: completedAttempt.encounterKey,
                markEncounterKey: completedAttempt.markEncounterKey,
                selectedTalismans: selected,
                usedKinds,
                failedKinds: Math.max(0, selected.length - usedKinds),
                failureMessage: failures.join(' | ')
            });
            if (usedKinds > 0) {
                this.incrementResourceUsage('talismanEncounters');
                this.refreshGameData();
            }
        },

        async fightEncounter(cfg, snapshot) {
            const encounterKey = buildEncounterKey(snapshot || {});
            this.lastFightAttempt = normalizeEncounterFightAttempt({
                shouldAttempt: true,
                reason: 'not-attempted',
                encounterKey
            });
            try {
                const fightBtn = $('#encounterFightBtn');
                if (fightBtn && !fightBtn.disabled) {
                    fightBtn.click();
                    this.lastFightAttempt = normalizeEncounterFightAttempt({
                        shouldAttempt: true,
                        reason: 'fight-triggered',
                        encounterKey,
                        source: 'button'
                    });
                    this.schedulePostInteractionResume(cfg);
                    return;
                }
                if (typeof _win.handleCombatChoice === 'function') {
                    await _win.handleCombatChoice('fight');
                    this.lastFightAttempt = normalizeEncounterFightAttempt({
                        shouldAttempt: true,
                        reason: 'fight-triggered',
                        encounterKey,
                        source: 'page-function'
                    });
                    this.schedulePostInteractionResume(cfg);
                    return;
                }
                const res = await API.combatChoice('fight');
                if (res.code !== 200) {
                    this.lastFightAttempt = normalizeEncounterFightAttempt({
                        shouldAttempt: true,
                        reason: 'fight-failed',
                        encounterKey,
                        source: 'api',
                        failureMessage: res.message || '未知错误'
                    });
                    Logger.warn(`自动迎战失败: ${res.message || '未知错误'}`);
                    return;
                }
                this.lastFightAttempt = normalizeEncounterFightAttempt({
                    shouldAttempt: true,
                    reason: 'fight-triggered',
                    encounterKey,
                    source: 'api'
                });
                this.schedulePostInteractionResume(cfg);
            } catch (e) {
                this.lastFightAttempt = normalizeEncounterFightAttempt({
                    shouldAttempt: true,
                    reason: 'fight-failed',
                    encounterKey,
                    source: 'exception',
                    failureMessage: e.message || String(e)
                });
                Logger.warn(`自动迎战失败: ${e.message || e}`);
            }
        },

        schedulePostInteractionResume(cfg, delayMs = 1200) {
            const windowMs = getResumeWindowMs(cfg || CONFIG.afkLoop);
            this.postInteractionResumeUntil = windowMs > 0 ? Date.now() + windowMs : 0;
            this.lastDecisionKey = '';
            this.refreshGameData();
            if (windowMs > 0) setTimeout(() => this.tick(true), delayMs);
        },

        async handleAdventure(cfg) {
            if (cfg.adventureMode !== 'fixed' && cfg.adventureMode !== 'strategy') return;
            try {
                installAdventureStepHook();
                const overlay = $('#adventureOverlay');
                if (!overlay || overlay.classList.contains('hidden')) {
                    Logger.warn('未检测到可处理的奇遇面板，继续等待');
                    return;
                }

                const adventureStep = _win._lingverseAutoMapLastAdventureStep || null;
                const adventureId = adventureStep ? adventureStep.adventureId : undefined;
                const closeBtn = this.findAdventureCloseButton(overlay);
                const choiceButtons = this.findAdventureChoiceButtons(overlay);

                if (choiceButtons.length > 0) {
                    const choiceNumber = resolveAdventureChoiceIndex(adventureId, cfg);
                    if (choiceNumber <= 0) {
                        Logger.warn(`奇遇 ${adventureId || '未知'} 未命中固定策略，等待手动处理`);
                        return;
                    }
                    const choiceBtn = choiceButtons[choiceNumber - 1];
                    if (!choiceBtn || choiceBtn.disabled) {
                        Logger.warn(`奇遇固定选择第${choiceNumber}项，但当前只有${choiceButtons.length}个可选项，等待手动处理`);
                        return;
                    }

                    choiceBtn.click();
                    Logger.info(`已自动选择奇遇${adventureId ? ` ${adventureId}` : ''}第${choiceNumber}项`);
                } else if (closeBtn && !closeBtn.disabled) {
                    closeBtn.click();
                    Logger.info('已自动结束/关闭奇遇');
                } else {
                    Logger.warn('奇遇面板中未找到可点击选项，等待手动处理');
                    return;
                }

                const windowMs = getResumeWindowMs(cfg);
                this.postInteractionResumeUntil = windowMs > 0 ? Date.now() + windowMs : 0;
                this.lastDecisionKey = '';
                this.refreshGameData();
                setTimeout(() => this.tick(true), 1200);
            } catch (e) {
                Logger.warn(`自动处理奇遇失败: ${e.message || e}`);
            }
        },

        findAdventureChoiceButtons(root) {
            const explicitChoices = Array.from(root.querySelectorAll('.adventure-choice-btn'));
            const choices = explicitChoices.length > 0
                ? explicitChoices
                : Array.from(root.querySelectorAll('#adventureChoices button')).filter(button => !button.classList.contains('adventure-close-btn'));
            return choices.filter(button => !button.classList.contains('hidden'));
        },

        findAdventureCloseButton(root) {
            const explicit = root.querySelector('.adventure-close-btn');
            if (explicit) return explicit;
            const labels = ['结束奇遇', '关闭', '完成'];
            return Array.from(root.querySelectorAll('button')).find(button => {
                const text = String(button.textContent || '').trim();
                return labels.some(label => text.indexOf(label) >= 0);
            }) || null;
        },

        async handlePlayerEncounter(cfg) {
            if (!cfg.autoDeclinePlayerEncounter) return;
            try {
                let handled = false;
                const pvpModal = $('#pvpEncounterModal');
                if (pvpModal && typeof _win.PvpModule?.dismissEncounter === 'function') {
                    _win.PvpModule.dismissEncounter();
                    handled = true;
                }

                const inviteModal = $('#encounterInviteModal');
                if (!handled && inviteModal && typeof _win.EncounterModule?.respondInvite === 'function') {
                    await _win.EncounterModule.respondInvite(false);
                    handled = true;
                }

                const sessionModal = $('#encounterSessionModal');
                if (!handled && sessionModal && typeof _win.EncounterModule?.leave === 'function') {
                    await _win.EncounterModule.leave();
                    handled = true;
                }

                if (!handled) {
                    handled = this.clickPlayerEncounterDeclineButton();
                }

                if (!handled) {
                    Logger.warn('未找到可自动婉拒的陌生道友邂逅入口，已暂停等待手动处理');
                    return;
                }

                Logger.info('已自动婉拒/离开陌生道友邂逅');
                const windowMs = getResumeWindowMs(cfg);
                this.postInteractionResumeUntil = windowMs > 0 ? Date.now() + windowMs : 0;
                this.lastDecisionKey = '';
                this.refreshGameData();
                setTimeout(() => this.tick(true), 1200);
            } catch (e) {
                Logger.warn(`自动婉拒陌生道友失败: ${e.message || e}`);
            }
        },

        clickPlayerEncounterDeclineButton() {
            const containers = [
                '#pvpEncounterModal',
                '#encounterInviteModal',
                '#encounterSessionModal',
                '#encounterTradeModal',
                '#encounterBattleModal',
                '#encounterRespondPickerModal'
            ];
            const labels = ['婉言告辞', '离开', '取消'];
            for (const selector of containers) {
                const container = $(selector);
                if (!container) continue;
                const buttons = Array.from(container.querySelectorAll('button'));
                const btn = buttons.find(button => labels.some(label => String(button.textContent || '').indexOf(label) >= 0));
                if (btn && !btn.disabled) {
                    btn.click();
                    return true;
                }
            }
            return false;
        },

        refreshGameData() {
            try {
                if (_win.loadPlayerInfo) _win.loadPlayerInfo(true);
                if (_win.loadGameLogs) _win.loadGameLogs();
            } catch (e) {}
        },

        formatReason(reason) {
            return formatAfkReason(reason);
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

        installAdventureStepHook();
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
