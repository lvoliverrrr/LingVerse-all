const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'lingverse-explore-helper.user.js');

function createElementStub() {
    return {
        style: {},
        classList: {
            add() {},
            remove() {},
            contains() { return false; }
        },
        appendChild() {},
        addEventListener() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
        closest() { return null; },
        set innerHTML(value) { this._innerHTML = value; },
        get innerHTML() { return this._innerHTML || ''; },
        textContent: '',
        value: ''
    };
}

function loadUserScript(overrides = {}) {
    const sandbox = {
        console,
        setTimeout() { return 1; },
        clearTimeout() {},
        setInterval() { return 1; },
        clearInterval() {},
        requestAnimationFrame() { return 1; },
        GM_addStyle() {},
        localStorage: {
            getItem() { return null; },
            setItem() {},
            removeItem() {}
        },
        navigator: {},
        document: {
            readyState: 'loading',
            documentElement: {
                classList: {
                    contains() { return false; }
                }
            },
            addEventListener() {},
            querySelector() { return null; },
            querySelectorAll() { return []; },
            createElement() { return createElementStub(); },
            body: { appendChild() {} },
            head: { appendChild() {} }
        },
        matchMedia() { return { matches: false }; }
    };
    Object.assign(sandbox, overrides);
    sandbox.window = sandbox;
    sandbox.unsafeWindow = sandbox;
    vm.runInNewContext(fs.readFileSync(scriptPath, 'utf8'), sandbox, { filename: scriptPath });
    return sandbox;
}

function toPlain(value) {
    return JSON.parse(JSON.stringify(value));
}

test('selectMerchantItem picks the highest price merchant item', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.equal(typeof hooks?.selectMerchantItem, 'function');

    const selected = hooks.selectMerchantItem([
        { index: 0, name: '优良剑气符', price: 555 },
        { index: 1, name: '灵芝种子', price: 4 },
        { index: 2, name: '深海明珠', price: '4,000' },
        { index: 3, name: '优良隐灵散', price: 150 }
    ]);

    assert.deepEqual(selected, { index: 2, name: '深海明珠', price: '4,000' });
});

test('selectMerchantItem ignores items without a usable positive price', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const selected = hooks.selectMerchantItem([
        { index: 0, name: '未知残页', price: '免费' },
        { index: 1, name: '空价商品', price: 0 },
        { index: 2, name: '高阶妖核', price: 88 }
    ]);

    assert.deepEqual(selected, { index: 2, name: '高阶妖核', price: 88 });
});

test('resolveApiObject falls back to page eval for non-window api globals', () => {
    const fakeApi = { get() {}, post() {} };
    const sandbox = loadUserScript({
        eval(source) {
            return source.includes('typeof api') ? fakeApi : null;
        }
    });
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.equal(hooks.resolveApiObject(), fakeApi);
});

test('decideAfkNextAction starts meditation when spirit is below threshold', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const decision = hooks.decideAfkNextAction({
        isMeditating: false,
        spirit: 3,
        maxSpirit: 2758,
        spiritCost: 1,
        canExplore: true
    }, {
        enabled: true,
        minSpirit: 20,
        meditationMinutes: 140
    }, 1_000_000);

    assert.deepEqual(toPlain(decision), {
        action: 'startMeditation',
        reason: 'spirit-below-threshold'
    });
});

test('decideAfkNextAction stops meditation after configured duration', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;
    const now = 10_000_000;

    const decision = hooks.decideAfkNextAction({
        isMeditating: true,
        spirit: 1800,
        maxSpirit: 2758,
        meditationStartedAt: now - 140 * 60 * 1000
    }, {
        enabled: true,
        minSpirit: 20,
        meditationMinutes: 140
    }, now);

    assert.deepEqual(toPlain(decision), {
        action: 'stopMeditation',
        reason: 'meditation-duration-reached'
    });
});

test('decideAfkNextAction starts auto explore when spirit is usable and idle', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const decision = hooks.decideAfkNextAction({
        isMeditating: false,
        spirit: 200,
        maxSpirit: 2758,
        spiritCost: 1,
        canExplore: true,
        autoExploreRunning: false
    }, {
        enabled: true,
        minSpirit: 20,
        meditationMinutes: 140
    }, 1_000_000);

    assert.deepEqual(toPlain(decision), {
        action: 'startAutoExplore',
        reason: 'spirit-ready'
    });
});

test('decideAfkNextAction waits while merchant or encounter blocks the page', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        isMeditating: false,
        spirit: 200,
        merchantActive: true
    }, {
        enabled: true,
        minSpirit: 20,
        meditationMinutes: 140
    }, 1_000_000)), {
        action: 'wait',
        reason: 'merchant-active'
    });

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        isMeditating: false,
        spirit: 200,
        encounterActive: true
    }, {
        enabled: true,
        minSpirit: 20,
        meditationMinutes: 140
    }, 1_000_000)), {
        action: 'wait',
        reason: 'encounter-active'
    });
});

test('selectCombatTalismans picks up to five unlocked combat talisman families', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const selected = hooks.selectCombatTalismans([
        { id: 1, templateId: 'talisman_fire_1', name: '普通烈火符', type: 'misc', rarity: 1, quantity: 2 },
        { id: 2, templateId: 'talisman_fire_3', name: '稀有烈火符', type: 'misc', rarity: 3, quantity: 1 },
        { id: 3, templateId: 'talisman_stealth_4', name: '史诗隐匿符', type: 'misc', rarity: 4, quantity: 1 },
        { id: 4, templateId: 'shenxing_talisman', name: '神行符', type: 'misc', rarity: 2, quantity: 99 },
        { id: 5, templateId: 'bp_talisman_ghost_2', name: '优良冥鬼诅咒符', type: 'misc', rarity: 2, quantity: 1 },
        { id: 6, templateId: 'talisman_shield_1', name: '普通金刚符', type: 'misc', rarity: 1, quantity: 3 },
        { id: 7, templateId: 'talisman_thunder_1', name: '普通天雷符', type: 'misc', rarity: 1, quantity: 1, isLocked: true },
        { id: 8, templateId: 'talisman_ancient_4', name: '史诗荒古符箓', type: 'misc', rarity: 4, quantity: 1 }
    ], { maxKinds: 5, quantityPerKind: 1 });

    assert.deepEqual(toPlain(selected), [
        { itemId: 8, templateId: 'talisman_ancient_4', name: '史诗荒古符箓', family: 'ancient', rarity: 4, quantity: 1 },
        { itemId: 2, templateId: 'talisman_fire_3', name: '稀有烈火符', family: 'fire', rarity: 3, quantity: 1 },
        { itemId: 5, templateId: 'bp_talisman_ghost_2', name: '优良冥鬼诅咒符', family: 'ghost', rarity: 2, quantity: 1 },
        { itemId: 6, templateId: 'talisman_shield_1', name: '普通金刚符', family: 'shield', rarity: 1, quantity: 1 }
    ]);
});

test('selectNirvanaRebirthPill only selects configured five-root rebirth pills', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const selected = hooks.selectNirvanaRebirthPill([
        { id: 1, templateId: 'pill_nirvana_4', name: '史诗九转还魂丹', type: 'pill', rarity: 4, quantity: 1 },
        { id: 2, templateId: 'bp_pill_rebirth_3', name: '稀有涅槃重生丹', type: 'pill', rarity: 3, quantity: 1 },
        { id: 3, templateId: 'bp_pill_rebirth_4', name: '史诗涅槃重生丹', type: 'pill', rarity: 4, quantity: 2 },
        { id: 4, templateId: 'bp_pill_rebirth_5', name: '传说涅槃重生丹', type: 'pill', rarity: 5, quantity: 0 }
    ], { minRarity: 4 });

    assert.deepEqual(toPlain(selected), {
        itemId: 3,
        templateId: 'bp_pill_rebirth_4',
        name: '史诗涅槃重生丹',
        rarity: 4,
        quantity: 1
    });
});

test('decideAfkNextAction handles encounters only when auto fight is enabled', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        isMeditating: false,
        spirit: 200,
        encounterActive: true
    }, {
        enabled: true,
        minSpirit: 20,
        meditationMinutes: 140,
        autoFight: false,
        useTalismans: false
    }, 1_000_000)), {
        action: 'wait',
        reason: 'encounter-active'
    });

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        isMeditating: false,
        spirit: 200,
        encounterActive: true
    }, {
        enabled: true,
        minSpirit: 20,
        meditationMinutes: 140,
        autoFight: true,
        useTalismans: true
    }, 1_000_000)), {
        action: 'handleEncounter',
        reason: 'encounter-auto-fight-enabled'
    });
});

test('classifyExploreInterruption categorizes auto-explore stopping events', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.deepEqual(toPlain(hooks.classifyExploreInterruption({ status: 'merchant' })), {
        kind: 'merchant',
        action: 'auto-handle',
        reason: 'merchant'
    });

    assert.deepEqual(toPlain(hooks.classifyExploreInterruption({ status: 'player_encounter' })), {
        kind: 'playerEncounter',
        action: 'pause',
        reason: 'player-encounter'
    });

    assert.deepEqual(toPlain(hooks.classifyExploreInterruption({ adventureId: 123 })), {
        kind: 'adventure',
        action: 'pause',
        reason: 'adventure-chain'
    });

    assert.deepEqual(toPlain(hooks.classifyExploreInterruption({ status: 'immortal_prison' })), {
        kind: 'immortalPrison',
        action: 'hard-stop',
        reason: 'immortal-prison'
    });

    assert.deepEqual(toPlain(hooks.classifyExploreInterruption({ status: 'error', message: '神识不足，无法探索' })), {
        kind: 'noSpirit',
        action: 'meditate',
        reason: 'no-spirit'
    });
});

test('decideAfkNextAction resumes exploration after revive or meditates if spirit is low', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;
    const config = {
        enabled: true,
        minSpirit: 20,
        meditationMinutes: 140,
        autoRevive: true,
        exploreMultiplier: 50
    };

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        isDead: true,
        spirit: 100,
        spiritCost: 4
    }, config, 1_000_000)), {
        action: 'revive',
        reason: 'dead-auto-revive-enabled'
    });

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        postReviveResume: true,
        isDead: false,
        isMeditating: false,
        spirit: 100,
        spiritCost: 4,
        canExplore: true
    }, config, 1_000_000)), {
        action: 'startAutoExplore',
        reason: 'post-revive-ready'
    });

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        postReviveResume: true,
        isDead: false,
        isMeditating: false,
        spirit: 3,
        spiritCost: 4,
        canExplore: true
    }, config, 1_000_000)), {
        action: 'startMeditation',
        reason: 'post-revive-low-spirit'
    });
});

test('classifyExploreInterruption can opt into auto-declining player encounters', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.deepEqual(toPlain(hooks.classifyExploreInterruption(
        { status: 'player_encounter' },
        { autoDeclinePlayerEncounter: false }
    )), {
        kind: 'playerEncounter',
        action: 'pause',
        reason: 'player-encounter'
    });

    assert.deepEqual(toPlain(hooks.classifyExploreInterruption(
        { status: 'player_encounter' },
        { autoDeclinePlayerEncounter: true }
    )), {
        kind: 'playerEncounter',
        action: 'auto-decline',
        reason: 'player-encounter-auto-decline'
    });
});

test('decideAfkNextAction handles player encounters only when auto decline is enabled', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        playerEncounterActive: true,
        spirit: 200,
        isDead: false
    }, {
        enabled: true,
        minSpirit: 20,
        meditationMinutes: 140,
        autoDeclinePlayerEncounter: false
    }, 1_000_000)), {
        action: 'wait',
        reason: 'player-encounter-active'
    });

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        playerEncounterActive: true,
        spirit: 200,
        isDead: false
    }, {
        enabled: true,
        minSpirit: 20,
        meditationMinutes: 140,
        autoDeclinePlayerEncounter: true
    }, 1_000_000)), {
        action: 'handlePlayerEncounter',
        reason: 'player-encounter-auto-decline'
    });
});

test('classifyExploreInterruption can opt into fixed adventure choices', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.deepEqual(toPlain(hooks.classifyExploreInterruption(
        { adventureId: 456 },
        { adventureMode: 'pause' }
    )), {
        kind: 'adventure',
        action: 'pause',
        reason: 'adventure-chain'
    });

    assert.deepEqual(toPlain(hooks.classifyExploreInterruption(
        { adventureId: 456 },
        { adventureMode: 'fixed', adventureChoiceIndex: 2 }
    )), {
        kind: 'adventure',
        action: 'auto-choice',
        reason: 'adventure-auto-choice'
    });
});

test('decideAfkNextAction handles adventure only when fixed adventure mode is enabled', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        adventureActive: true,
        spirit: 200,
        isDead: false
    }, {
        enabled: true,
        minSpirit: 20,
        meditationMinutes: 140,
        adventureMode: 'pause'
    }, 1_000_000)), {
        action: 'wait',
        reason: 'adventure-active'
    });

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        adventureActive: true,
        spirit: 200,
        isDead: false
    }, {
        enabled: true,
        minSpirit: 20,
        meditationMinutes: 140,
        adventureMode: 'fixed',
        adventureChoiceIndex: 2
    }, 1_000_000)), {
        action: 'handleAdventure',
        reason: 'adventure-auto-choice'
    });
});

test('normalizeAfkLoopConfig parses per-adventure fixed choice maps', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.deepEqual(toPlain(hooks.normalizeAfkLoopConfig({
        adventureMode: 'strategy',
        adventureChoiceMap: '{"456":2,"789":"3","huge":99,"zero":0,"bad":"x"}'
    }).adventureChoiceMap), {
        456: 2,
        789: 3,
        huge: 10
    });

    assert.deepEqual(toPlain(hooks.normalizeAfkLoopConfig({
        adventureMode: 'strategy',
        adventureChoiceMap: '456=2\n789:3\nhuge=99\nzero=0\nbad=x'
    }).adventureChoiceMap), {
        456: 2,
        789: 3,
        huge: 10
    });
});

test('per-adventure strategy only auto-handles mapped adventure ids', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;
    const config = {
        enabled: true,
        minSpirit: 20,
        meditationMinutes: 140,
        adventureMode: 'strategy',
        adventureChoiceMap: { 456: 2 }
    };

    assert.equal(hooks.resolveAdventureChoiceIndex(456, config), 2);
    assert.equal(hooks.resolveAdventureChoiceIndex(999, config), 0);

    assert.deepEqual(toPlain(hooks.classifyExploreInterruption(
        { adventureId: 456 },
        config
    )), {
        kind: 'adventure',
        action: 'auto-choice',
        reason: 'adventure-strategy-choice'
    });

    assert.deepEqual(toPlain(hooks.classifyExploreInterruption(
        { adventureId: 999 },
        config
    )), {
        kind: 'adventure',
        action: 'pause',
        reason: 'adventure-chain'
    });

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        adventureActive: true,
        adventureId: 456,
        spirit: 200,
        isDead: false
    }, config, 1_000_000)), {
        action: 'handleAdventure',
        reason: 'adventure-strategy-choice'
    });

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        adventureActive: true,
        adventureId: 999,
        spirit: 200,
        isDead: false
    }, config, 1_000_000)), {
        action: 'wait',
        reason: 'adventure-active'
    });
});

test('buildAfkDebugSnapshot captures blockers, adventure choices, decision, and config', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const config = {
        enabled: true,
        meditationMinutes: 140,
        minSpirit: 20,
        exploreMultiplier: 50,
        tickInterval: 30000,
        stallTimeoutSeconds: 90,
        autoFight: true,
        autoRevive: true,
        useTalismans: true,
        useNirvanaPill: true,
        autoDeclinePlayerEncounter: true,
        adventureMode: 'strategy',
        adventureChoiceMap: { 456: 2 }
    };
    const state = {
        spirit: 88,
        maxSpirit: 2758,
        spiritCost: 50,
        canExplore: true,
        isDead: false,
        isMeditating: false,
        merchantActive: false,
        encounterActive: true,
        combatActive: false,
        playerEncounterActive: false,
        adventureActive: true,
        adventureId: 456,
        adventureComplete: false,
        adventureStep: 1,
        adventureTotalSteps: 3,
        adventureChoices: ['入谷', '绕行'],
        autoExploreRunning: false,
        autoExplorePending: true,
        exploreStalled: false
    };
    const decision = hooks.decideAfkNextAction(state, config, 1_000_000);
    const decisionHistory = Array.from({ length: 25 }, (_, index) => ({
        at: `2026-06-08T00:${String(index).padStart(2, '0')}:00.000Z`,
        action: index % 2 === 0 ? 'wait' : 'startAutoExplore',
        reason: index % 2 === 0 ? 'auto-explore-running' : 'spirit-ready',
        spirit: index,
        adventureId: index === 24 ? 456 : null
    }));
    const recentLogs = Array.from({ length: 35 }, (_, index) => ({
        at: `2026-06-08T01:${String(index).padStart(2, '0')}:00.000Z`,
        type: index % 3 === 0 ? 'warning' : 'info',
        message: `日志${index}`
    }));

    const snapshot = toPlain(hooks.buildAfkDebugSnapshot(state, config, decision, {
        capturedAt: '2026-06-08T00:00:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        decisionHistory,
        recentLogs
    }));

    assert.equal(snapshot.schema, 'lingverse-afk-debug-snapshot/v1');
    assert.equal(typeof snapshot.scriptVersion, 'string');
    assert.equal(snapshot.decision.action, 'handleAdventure');
    assert.equal(snapshot.decision.reason, 'adventure-strategy-choice');
    assert.deepEqual(snapshot.player, {
        spirit: 88,
        maxSpirit: 2758,
        spiritCost: 50,
        canExplore: true,
        exploreDisabledReason: '',
        isDead: false,
        isMeditating: false,
        meditationDurationSeconds: null
    });
    assert.deepEqual(snapshot.blockers, {
        merchantActive: false,
        encounterActive: true,
        combatActive: false,
        playerEncounterActive: false,
        adventureActive: true,
        adventureId: 456,
        adventureComplete: false,
        immortalPrisonActive: false
    });
    assert.deepEqual(snapshot.adventure, {
        id: 456,
        step: 1,
        totalSteps: 3,
        isComplete: false,
        choices: ['入谷', '绕行'],
        mode: 'strategy',
        resolvedChoiceIndex: 2,
        choiceMap: { 456: 2 }
    });
    assert.equal(snapshot.config.exploreMultiplier, 50);
    assert.equal(snapshot.config.autoFight, true);
    assert.equal(snapshot.history.decisionTail.length, 20);
    assert.equal(snapshot.history.decisionTail[0].spirit, 5);
    assert.equal(snapshot.history.decisionTail[19].adventureId, 456);
    assert.equal(snapshot.history.logTail.length, 30);
    assert.equal(snapshot.history.logTail[0].message, '日志5');
    assert.equal(snapshot.history.logTail[29].message, '日志34');
    assert.equal(snapshot.page.url, 'https://ling.muge.info/game.html');
});
