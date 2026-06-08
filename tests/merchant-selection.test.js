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
                dataset: {},
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

test('parseMeditationBarState reads visible meditation bar duration safely', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.equal(typeof hooks.parseMeditationBarState, 'function');

    assert.deepEqual(toPlain(hooks.parseMeditationBarState([
        '冥想修炼中 (最长12小时)',
        '1时30分',
        '预计修为: 7,650',
        '恢复: 5,794血 / 3,002灵 / 914识',
        '收功'
    ].join('\n'))), {
        isMeditating: true,
        durationSeconds: 5400,
        recoveredSpirit: 914
    });

    assert.deepEqual(toPlain(hooks.parseMeditationBarState('冥想修炼中 (最长12小时)\n0分\n收功')), {
        isMeditating: true,
        durationSeconds: 0,
        recoveredSpirit: null
    });

    assert.deepEqual(toPlain(hooks.parseMeditationBarState('你缓缓收功，结束了本次修炼。 修炼时长: 8分26秒')), {
        isMeditating: false,
        durationSeconds: null,
        recoveredSpirit: null
    });
});

test('decideAfkNextAction can stop meditation when bar recovery fills stale spirit', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const decision = hooks.decideAfkNextAction({
        isMeditating: true,
        spirit: 3,
        maxSpirit: 100,
        meditationRecoveredSpirit: 97,
        meditationSpiritFromBar: true,
        meditationDurationSeconds: 3600
    }, {
        enabled: true,
        minSpirit: 20,
        meditationMinutes: 140
    }, 1_000_000);

    assert.deepEqual(toPlain(decision), {
        action: 'stopMeditation',
        reason: 'spirit-full'
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

test('decideAfkNextAction returns to meditation when auto explore is running with low spirit', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        isMeditating: false,
        spirit: 12,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: true,
        autoExploreRunning: true
    }, {
        enabled: true,
        minSpirit: 20,
        meditationMinutes: 140
    }, 1_000_000)), {
        action: 'startMeditation',
        reason: 'auto-explore-low-spirit'
    });

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        isMeditating: false,
        spirit: 12,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: true,
        autoExplorePending: true
    }, {
        enabled: true,
        minSpirit: 20,
        meditationMinutes: 140
    }, 1_000_000)), {
        action: 'startMeditation',
        reason: 'auto-explore-low-spirit'
    });
});

test('decideAfkNextAction returns to meditation when pending auto explore cannot continue for spirit', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const decision = hooks.decideAfkNextAction({
        isMeditating: false,
        spirit: 80,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: false,
        exploreDisabledReason: '神识不足，无法继续探索',
        autoExplorePending: true
    }, {
        enabled: true,
        minSpirit: 20,
        meditationMinutes: 140
    }, 1_000_000);

    assert.deepEqual(toPlain(decision), {
        action: 'startMeditation',
        reason: 'explore-disabled-no-spirit'
    });
});

test('decideAfkNextAction returns to meditation when exploration is disabled and spirit is already low', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const decision = hooks.decideAfkNextAction({
        isMeditating: false,
        spirit: 3,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: false,
        exploreDisabledReason: ''
    }, {
        enabled: true,
        minSpirit: 20,
        meditationMinutes: 140
    }, 1_000_000);

    assert.deepEqual(toPlain(decision), {
        action: 'startMeditation',
        reason: 'explore-disabled-no-spirit'
    });
});

test('isExploreStalledState treats resume pending as stallable auto exploration', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;
    const now = 1_000_000;
    const config = { stallTimeoutSeconds: 90 };

    assert.equal(hooks.isExploreStalledState({
        autoExploreRunning: true,
        autoExplorePending: false,
        lastExploreProgressAt: now - 90_000
    }, config, now), true);

    assert.equal(hooks.isExploreStalledState({
        autoExploreRunning: false,
        autoExplorePending: true,
        lastExploreProgressAt: now - 90_000
    }, config, now), true);

    assert.equal(hooks.isExploreStalledState({
        autoExploreRunning: false,
        autoExplorePending: true,
        lastExploreProgressAt: now - 30_000
    }, config, now), false);

    assert.equal(hooks.isExploreStalledState({
        autoExploreRunning: false,
        autoExplorePending: false,
        lastExploreProgressAt: now - 90_000
    }, config, now), false);
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

test('decideAfkNextAction handles game update notices without resource actions', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.equal(typeof hooks.detectGameUpdateNotice, 'function');
    assert.equal(hooks.detectGameUpdateNotice('灵界已更新新版本，请点此刷新...'), true);
    assert.equal(hooks.detectGameUpdateNotice('普通状态'), false);

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        gameUpdateNoticeActive: true,
        isDead: true,
        merchantActive: true
    }, {
        enabled: true,
        autoRevive: true,
        autoReloadOnUpdate: false
    }, 1_000_000)), {
        action: 'wait',
        reason: 'game-update-available'
    });

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        gameUpdateNoticeActive: true,
        isDead: true,
        merchantActive: true
    }, {
        enabled: true,
        autoRevive: true,
        autoReloadOnUpdate: true
    }, 1_000_000)), {
        action: 'reloadPage',
        reason: 'game-update-auto-reload'
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

test('selectCombatTalismans can follow a configured talisman family order', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const selected = hooks.selectCombatTalismans([
        { id: 1, templateId: 'talisman_fire_1', name: '普通烈火符', type: 'misc', rarity: 1, quantity: 2 },
        { id: 2, templateId: 'talisman_fire_3', name: '稀有烈火符', type: 'misc', rarity: 3, quantity: 1 },
        { id: 5, templateId: 'bp_talisman_ghost_2', name: '优良冥鬼诅咒符', type: 'misc', rarity: 2, quantity: 1 },
        { id: 6, templateId: 'talisman_shield_1', name: '普通金刚符', type: 'misc', rarity: 1, quantity: 3 },
        { id: 8, templateId: 'talisman_ancient_4', name: '史诗荒古符箓', type: 'misc', rarity: 4, quantity: 1 }
    ], { maxKinds: 5, quantityPerKind: 2, familyOrder: 'ghost,fire,shield' });

    assert.deepEqual(toPlain(selected), [
        { itemId: 5, templateId: 'bp_talisman_ghost_2', name: '优良冥鬼诅咒符', family: 'ghost', rarity: 2, quantity: 1 },
        { itemId: 2, templateId: 'talisman_fire_3', name: '稀有烈火符', family: 'fire', rarity: 3, quantity: 1 },
        { itemId: 6, templateId: 'talisman_shield_1', name: '普通金刚符', family: 'shield', rarity: 1, quantity: 2 }
    ]);
});

test('buildEncounterKey creates stable keys only for active encounters', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.equal(hooks.buildEncounterKey({
        encounterActive: true,
        encounterMonsterId: 'port_bandit',
        encounterMonsterStage: 3,
        encounterMonsterLevel: 7,
        encounterText: '潮汐海兽\n金丹期中期'
    }), 'monster:port_bandit:3:7');

    assert.equal(hooks.buildEncounterKey({
        combatActive: true,
        encounterText: '潮汐海兽\n金丹期中期\n生命3,580'
    }), 'text:潮汐海兽|金丹期中期|生命3,580');

    assert.equal(hooks.buildEncounterKey({
        encounterActive: false,
        combatActive: false,
        encounterMonsterId: 'stale_monster',
        encounterText: '旧遭遇'
    }), '');
});

test('shouldUseCombatTalismansForEncounter skips repeated talisman use in one encounter', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;
    const snapshot = {
        encounterActive: true,
        encounterMonsterId: 'port_bandit',
        encounterMonsterStage: 3,
        encounterMonsterLevel: 7
    };

    assert.deepEqual(toPlain(hooks.shouldUseCombatTalismansForEncounter('', snapshot)), {
        shouldUse: true,
        encounterKey: 'monster:port_bandit:3:7'
    });
    assert.deepEqual(toPlain(hooks.shouldUseCombatTalismansForEncounter('monster:port_bandit:3:7', snapshot)), {
        shouldUse: false,
        encounterKey: 'monster:port_bandit:3:7'
    });
    assert.deepEqual(toPlain(hooks.shouldUseCombatTalismansForEncounter('monster:port_bandit:3:7', {
        encounterActive: true,
        encounterMonsterId: 'new_monster',
        encounterMonsterStage: 3,
        encounterMonsterLevel: 8
    })), {
        shouldUse: true,
        encounterKey: 'monster:new_monster:3:8'
    });
});

test('resolveCombatTalismanAttempt marks empty or completed attempts for one encounter', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;
    const snapshot = {
        encounterActive: true,
        encounterMonsterId: 'port_bandit',
        encounterMonsterStage: 3,
        encounterMonsterLevel: 7
    };

    assert.deepEqual(toPlain(hooks.resolveCombatTalismanAttempt('', snapshot, [])), {
        shouldAttempt: true,
        encounterKey: 'monster:port_bandit:3:7',
        markEncounterKey: 'monster:port_bandit:3:7'
    });

    assert.deepEqual(toPlain(hooks.resolveCombatTalismanAttempt('', snapshot, [
        { itemId: 1, family: 'fire' }
    ])), {
        shouldAttempt: true,
        encounterKey: 'monster:port_bandit:3:7',
        markEncounterKey: ''
    });

    assert.deepEqual(toPlain(hooks.resolveCombatTalismanAttempt('', snapshot, [
        { itemId: 1, family: 'fire' }
    ], { attemptCompleted: true })), {
        shouldAttempt: true,
        encounterKey: 'monster:port_bandit:3:7',
        markEncounterKey: 'monster:port_bandit:3:7'
    });

    assert.deepEqual(toPlain(hooks.resolveCombatTalismanAttempt('monster:port_bandit:3:7', snapshot, [])), {
        shouldAttempt: false,
        encounterKey: 'monster:port_bandit:3:7',
        markEncounterKey: ''
    });
});

test('normalizeAfkLoopConfig keeps guardian auto-hire opt-in for encounters', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.equal(hooks.normalizeAfkLoopConfig({}).autoHireGuardian, false);
    assert.equal(hooks.normalizeAfkLoopConfig({ autoHireGuardian: true }).autoHireGuardian, true);
    assert.equal(hooks.normalizeAfkLoopConfig({ autoHireGuardian: 'yes' }).autoHireGuardian, true);
});

test('resolveEncounterGuardianAttempt marks completed guardian attempts per encounter', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;
    const snapshot = {
        encounterActive: true,
        encounterMonsterId: 'port_bandit',
        encounterMonsterStage: 3,
        encounterMonsterLevel: 7
    };

    assert.deepEqual(toPlain(hooks.resolveEncounterGuardianAttempt('', snapshot, {
        autoHireGuardian: false
    }, {
        enabled: true
    })), {
        shouldAttempt: false,
        encounterKey: 'monster:port_bandit:3:7',
        markEncounterKey: '',
        reason: 'afk-guardian-disabled'
    });

    assert.deepEqual(toPlain(hooks.resolveEncounterGuardianAttempt('', snapshot, {
        autoHireGuardian: true
    }, {
        enabled: false
    })), {
        shouldAttempt: false,
        encounterKey: 'monster:port_bandit:3:7',
        markEncounterKey: '',
        reason: 'guardian-config-disabled'
    });

    assert.deepEqual(toPlain(hooks.resolveEncounterGuardianAttempt('', snapshot, {
        autoHireGuardian: true
    }, {
        enabled: true
    })), {
        shouldAttempt: true,
        encounterKey: 'monster:port_bandit:3:7',
        markEncounterKey: '',
        reason: 'guardian-ready'
    });

    assert.deepEqual(toPlain(hooks.resolveEncounterGuardianAttempt('', snapshot, {
        autoHireGuardian: true
    }, {
        enabled: true
    }, { attemptCompleted: true })), {
        shouldAttempt: true,
        encounterKey: 'monster:port_bandit:3:7',
        markEncounterKey: 'monster:port_bandit:3:7',
        reason: 'guardian-ready'
    });

    assert.deepEqual(toPlain(hooks.resolveEncounterGuardianAttempt('monster:port_bandit:3:7', snapshot, {
        autoHireGuardian: true
    }, {
        enabled: true
    })), {
        shouldAttempt: false,
        encounterKey: 'monster:port_bandit:3:7',
        markEncounterKey: '',
        reason: 'guardian-already-attempted'
    });
});

test('resolveEncounterFightAttempt skips repeated auto fight for one encounter', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;
    const snapshot = {
        encounterActive: true,
        encounterMonsterId: 'port_bandit',
        encounterMonsterStage: 3,
        encounterMonsterLevel: 7
    };

    assert.equal(typeof hooks.resolveEncounterFightAttempt, 'function');

    assert.deepEqual(toPlain(hooks.resolveEncounterFightAttempt('', snapshot, {
        autoFight: false
    })), {
        shouldAttempt: false,
        encounterKey: 'monster:port_bandit:3:7',
        markEncounterKey: '',
        reason: 'disabled'
    });

    assert.deepEqual(toPlain(hooks.resolveEncounterFightAttempt('', snapshot, {
        autoFight: true
    })), {
        shouldAttempt: true,
        encounterKey: 'monster:port_bandit:3:7',
        markEncounterKey: '',
        reason: 'fight-ready'
    });

    assert.deepEqual(toPlain(hooks.resolveEncounterFightAttempt('', snapshot, {
        autoFight: true
    }, { attemptTriggered: true })), {
        shouldAttempt: true,
        encounterKey: 'monster:port_bandit:3:7',
        markEncounterKey: 'monster:port_bandit:3:7',
        reason: 'fight-ready'
    });

    assert.deepEqual(toPlain(hooks.resolveEncounterFightAttempt('monster:port_bandit:3:7', snapshot, {
        autoFight: true
    })), {
        shouldAttempt: false,
        encounterKey: 'monster:port_bandit:3:7',
        markEncounterKey: '',
        reason: 'fight-already-triggered'
    });

    assert.equal(toPlain(hooks.resolveEncounterFightAttempt('monster:port_bandit:3:7', {
        encounterActive: true,
        encounterMonsterId: 'mountain_beast',
        encounterMonsterStage: 4,
        encounterMonsterLevel: 2
    }, {
        autoFight: true
    })).reason, 'fight-ready');
});

test('resolveEncounterFightAttempt blocks auto fight while talisman dialog remains open', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;
    const snapshot = {
        encounterActive: true,
        encounterMonsterId: 'port_bandit',
        encounterMonsterStage: 3,
        encounterMonsterLevel: 7
    };

    assert.deepEqual(toPlain(hooks.resolveEncounterFightAttempt('', snapshot, {
        autoFight: true
    }, {
        talismanAttempt: {
            reason: 'completed',
            encounterKey: 'monster:port_bandit:3:7',
            dialogClosed: false,
            dialogCloseFailureMessage: 'close failed token=talisman-dialog-secret'
        }
    })), {
        shouldAttempt: false,
        encounterKey: 'monster:port_bandit:3:7',
        markEncounterKey: '',
        reason: 'talisman-dialog-open'
    });

    assert.deepEqual(toPlain(hooks.resolveEncounterFightAttempt('', Object.assign({}, snapshot, {
        talismanDialogActive: false
    }), {
        autoFight: true
    }, {
        talismanAttempt: {
            reason: 'completed',
            encounterKey: 'monster:port_bandit:3:7',
            dialogClosed: false,
            dialogCloseFailureMessage: 'close failed token=talisman-dialog-secret'
        }
    })), {
        shouldAttempt: true,
        encounterKey: 'monster:port_bandit:3:7',
        markEncounterKey: '',
        reason: 'fight-ready'
    });

    assert.deepEqual(toPlain(hooks.resolveEncounterFightAttempt('', Object.assign({}, snapshot, {
        talismanDialogActive: true
    }), {
        autoFight: true
    })), {
        shouldAttempt: false,
        encounterKey: 'monster:port_bandit:3:7',
        markEncounterKey: '',
        reason: 'talisman-dialog-open'
    });
});

test('getCurrentGuardianConfig prefers page auto-hire settings', () => {
    const sandbox = loadUserScript({
        getAutoHireConfig() {
            return {
                enabled: true,
                mode: 'alone',
                maxFee: 51,
                priorityKey: 'normal,incarnation,body',
                priority: ['normal', 'incarnation', 'body']
            };
        }
    });
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.deepEqual(toPlain(hooks.getCurrentGuardianConfig()), {
        enabled: true,
        maxFee: 51,
        minAtk: 0,
        mode: 'alone',
        priority: ['normal', 'incarnation', 'body'],
        priorityKey: 'normal,incarnation,body',
        threatLevel: 'danger'
    });
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

test('resolveNirvanaRebirthPillAttempt explains rich-mode pill use decisions', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.equal(typeof hooks.resolveNirvanaRebirthPillAttempt, 'function');

    const now = 1_000_000;
    const items = [
        { id: 1, templateId: 'pill_nirvana_4', name: '史诗九转还魂丹', type: 'pill', rarity: 4, quantity: 1 },
        { id: 2, templateId: 'bp_pill_rebirth_3', name: '稀有涅槃重生丹', type: 'pill', rarity: 3, quantity: 1 },
        { id: 3, templateId: 'bp_pill_rebirth_4', name: '史诗涅槃重生丹', type: 'pill', rarity: 4, quantity: 2 }
    ];

    assert.deepEqual(toPlain(hooks.resolveNirvanaRebirthPillAttempt({}, items, {
        useNirvanaPill: false,
        nirvanaMinRarity: 4
    }, now)), {
        shouldUse: false,
        reason: 'disabled',
        pill: null,
        minRarity: 4,
        activeBuffGrade: null,
        activeBuffExpire: null
    });

    assert.deepEqual(toPlain(hooks.resolveNirvanaRebirthPillAttempt({
        fiveRootBuffGrade: 4,
        fiveRootBuffExpire: now + 60_000
    }, items, {
        useNirvanaPill: true,
        nirvanaMinRarity: 4,
        queueNirvanaPill: false
    }, now)), {
        shouldUse: false,
        reason: 'active-five-root-buff',
        pill: null,
        minRarity: 4,
        activeBuffGrade: 4,
        activeBuffExpire: now + 60_000
    });

    assert.deepEqual(toPlain(hooks.resolveNirvanaRebirthPillAttempt({
        fiveRootBuffGrade: 4,
        fiveRootBuffExpire: now + 60_000
    }, items, {
        useNirvanaPill: true,
        nirvanaMinRarity: 4,
        queueNirvanaPill: true
    }, now)), {
        shouldUse: true,
        reason: 'pill-ready',
        pill: {
            itemId: 3,
            templateId: 'bp_pill_rebirth_4',
            name: '史诗涅槃重生丹',
            rarity: 4,
            quantity: 1
        },
        minRarity: 4,
        activeBuffGrade: 4,
        activeBuffExpire: now + 60_000
    });

    assert.deepEqual(toPlain(hooks.resolveNirvanaRebirthPillAttempt({}, items, {
        useNirvanaPill: true,
        nirvanaMinRarity: 5,
        queueNirvanaPill: false
    }, now)), {
        shouldUse: false,
        reason: 'no-matching-pill',
        pill: null,
        minRarity: 5,
        activeBuffGrade: null,
        activeBuffExpire: null
    });
});

test('buildAfkResourcePreflight reports rich-mode inventory readiness', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.equal(typeof hooks.buildAfkResourcePreflight, 'function');

    const realLikeInventory = [
        { id: 1, templateId: 'pill_nirvana_4', name: '史诗九转还魂丹', type: 'pill', rarity: 4, quantity: 3 },
        { id: 2, templateId: 'talisman_ancient_4', name: '史诗荒古符箓', type: 'misc', rarity: 4, quantity: 1 },
        { id: 3, templateId: 'bp_talisman_ghost_2', name: '优良冥鬼诅咒符', type: 'misc', rarity: 2, quantity: 1 },
        { id: 4, templateId: 'talisman_thunder_1', name: '普通天雷符', type: 'misc', rarity: 1, quantity: 1 },
        { id: 5, templateId: 'talisman_fire_1', name: '普通烈火符', type: 'misc', rarity: 1, quantity: 2 },
        { id: 6, templateId: 'talisman_shield_1', name: '普通金刚符', type: 'misc', rarity: 1, quantity: 3 },
        { id: 7, templateId: 'shenxing_talisman', name: '神行符', type: 'misc', rarity: 2, quantity: 99 }
    ];

    const preflight = toPlain(hooks.buildAfkResourcePreflight(realLikeInventory, {
        useTalismans: true,
        talismanMaxKinds: 5,
        talismanQuantity: 1,
        talismanFamilyOrder: 'ancient,ghost,thunder,fire,shield',
        useNirvanaPill: true,
        nirvanaMinRarity: 4
    }, {}, 1_000_000));

    assert.deepEqual(preflight, {
        schema: 'lingverse-afk-resource-preflight/v1',
        inventoryKnown: true,
        enabled: true,
        summaryText: '资源预检: 用符 5/5类 · 涅槃丹 无史诗+',
        warningCount: 1,
        warnings: ['未找到史诗+涅槃重生丹，会跳过用丹'],
        talismans: {
            enabled: true,
            desiredKinds: 5,
            availableKinds: 5,
            ready: true,
            reason: 'talismans-ready',
            selectedFamilies: ['ancient', 'ghost', 'thunder', 'fire', 'shield'],
            selectedTalismans: [
                { itemId: 2, templateId: 'talisman_ancient_4', name: '史诗荒古符箓', family: 'ancient', rarity: 4, quantity: 1 },
                { itemId: 3, templateId: 'bp_talisman_ghost_2', name: '优良冥鬼诅咒符', family: 'ghost', rarity: 2, quantity: 1 },
                { itemId: 4, templateId: 'talisman_thunder_1', name: '普通天雷符', family: 'thunder', rarity: 1, quantity: 1 },
                { itemId: 5, templateId: 'talisman_fire_1', name: '普通烈火符', family: 'fire', rarity: 1, quantity: 1 },
                { itemId: 6, templateId: 'talisman_shield_1', name: '普通金刚符', family: 'shield', rarity: 1, quantity: 1 }
            ]
        },
        nirvanaPill: {
            enabled: true,
            ready: false,
            reason: 'no-matching-pill',
            minRarity: 4,
            pill: null,
            activeBuffGrade: null,
            activeBuffExpire: null
        }
    });

    const missingInventory = toPlain(hooks.buildAfkResourcePreflight(null, {
        useTalismans: true,
        useNirvanaPill: true
    }, {}, 1_000_000));
    assert.equal(missingInventory.inventoryKnown, false);
    assert.equal(missingInventory.summaryText, '资源预检: 未读取背包');
    assert.equal(missingInventory.warningCount, 1);
});

test('decideAfkNextAction handles encounters when auto fight or guardian hire is enabled', () => {
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
        autoFight: false,
        autoHireGuardian: true,
        useTalismans: false
    }, 1_000_000)), {
        action: 'handleEncounter',
        reason: 'encounter-auto-guardian-enabled'
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

test('decideAfkNextAction handles death before stale encounter or merchant blockers', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;
    const config = {
        enabled: true,
        minSpirit: 20,
        meditationMinutes: 140,
        autoRevive: true,
        autoFight: true
    };

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        isDead: true,
        spirit: 200,
        encounterActive: true,
        combatActive: true
    }, config, 1_000_000)), {
        action: 'revive',
        reason: 'dead-auto-revive-enabled'
    });

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        isDead: true,
        spirit: 200,
        merchantActive: true,
        adventureActive: true,
        playerEncounterActive: true
    }, Object.assign({}, config, { autoRevive: false }), 1_000_000)), {
        action: 'wait',
        reason: 'dead'
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

test('decideAfkNextAction resumes exploration after revive or interaction windows', () => {
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

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        postInteractionResume: true,
        isDead: false,
        isMeditating: false,
        spirit: 100,
        spiritCost: 4,
        canExplore: true
    }, config, 1_000_000)), {
        action: 'startAutoExplore',
        reason: 'post-interaction-ready'
    });

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        postInteractionResume: true,
        isDead: false,
        isMeditating: false,
        spirit: 3,
        spiritCost: 4,
        canExplore: true
    }, config, 1_000_000)), {
        action: 'startMeditation',
        reason: 'post-interaction-low-spirit'
    });

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        postMeditationResume: true,
        isDead: false,
        isMeditating: false,
        spirit: 3,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: true
    }, config, 1_000_000)), {
        action: 'startAutoExplore',
        reason: 'post-meditation-ready'
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

    assert.equal(hooks.normalizeAfkLoopConfig({
        talismanFamilyOrder: ' ghost，fire;ghost | shield '
    }).talismanFamilyOrder, 'ghost,fire,shield');

    assert.equal(hooks.normalizeAfkLoopConfig({
        resumeWindowSeconds: 180
    }).resumeWindowSeconds, 180);
    assert.equal(hooks.normalizeAfkLoopConfig({
        resumeWindowSeconds: -1
    }).resumeWindowSeconds, 0);
    assert.equal(hooks.normalizeAfkLoopConfig({
        resumeWindowSeconds: 99999
    }).resumeWindowSeconds, 3600);

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
    const sandbox = loadUserScript({
        _autoMapInited: true,
        LingVerseAutoMapInitializedVersion: '2.71.0',
        document: {
            readyState: 'loading',
            documentElement: {
                dataset: { lingverseAutoMapExtensionVersion: '2.75.0' },
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
        }
    });
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
        autoHireGuardian: true,
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
        talismanDialogActive: true,
        playerEncounterActive: false,
        adventureActive: true,
        adventureId: 456,
        adventureComplete: false,
        adventureStep: 1,
        adventureTotalSteps: 3,
        adventureChoices: ['入谷', '绕行'],
        autoExploreRunning: false,
        autoExplorePending: true,
        postInteractionResume: true,
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
        recentLogs,
        nirvanaPillAttempt: {
            shouldUse: false,
            reason: 'active-five-root-buff',
            pill: null,
            minRarity: 4,
            activeBuffGrade: 4,
            activeBuffExpire: 1_234_567
        },
        talismanAttempt: {
            shouldAttempt: true,
            reason: 'completed',
            encounterKey: 'monster:port_bandit:3:7',
            markEncounterKey: 'monster:port_bandit:3:7',
            selectedTalismans: [
                { itemId: 8, templateId: 'talisman_ancient_4', name: '史诗荒古符箓', family: 'ancient', rarity: 4, quantity: 1 },
                { itemId: 2, templateId: 'talisman_fire_3', name: '稀有烈火符', family: 'fire', rarity: 3, quantity: 1 }
            ],
            usedKinds: 2,
            failedKinds: 0,
            failureMessage: ''
        },
        guardianAttempt: {
            shouldAttempt: true,
            reason: 'hire-triggered',
            encounterKey: 'monster:port_bandit:3:7',
            markEncounterKey: 'monster:port_bandit:3:7',
            hireTriggered: true,
            failureMessage: '',
            guardian: {
                enabled: true,
                maxFee: 999,
                minAtk: 120,
                mode: 'together',
                priority: ['incarnation', 'normal', 'body'],
                threatLevel: 'danger'
            }
        }
    }));

    assert.equal(snapshot.schema, 'lingverse-afk-debug-snapshot/v1');
    assert.equal(typeof snapshot.scriptVersion, 'string');
    assert.equal(snapshot.environment.extensionVersion, '2.75.0');
    assert.equal(snapshot.environment.initializedVersion, '2.71.0');
    assert.equal(snapshot.environment.initializedVersionMismatch, true);
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
        meditationDurationSeconds: null,
        meditationRecoveredSpirit: null,
        meditationSpiritFromBar: false
    });
    assert.deepEqual(snapshot.blockers, {
        gameUpdateNoticeActive: false,
        merchantActive: false,
        encounterActive: true,
        combatActive: false,
        talismanDialogActive: true,
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
    assert.equal(snapshot.config.resumeWindowSeconds, 60);
    assert.equal(snapshot.automation.postInteractionResume, true);
    assert.deepEqual(snapshot.automation.nirvanaPill, {
        shouldUse: false,
        reason: 'active-five-root-buff',
        pill: null,
        minRarity: 4,
        activeBuffGrade: 4,
        activeBuffExpire: 1_234_567,
        failureMessage: ''
    });
    assert.deepEqual(snapshot.automation.talismans, {
        shouldAttempt: true,
        reason: 'completed',
        encounterKey: 'monster:port_bandit:3:7',
        markEncounterKey: 'monster:port_bandit:3:7',
        selectedTalismans: [
            { itemId: 8, templateId: 'talisman_ancient_4', name: '史诗荒古符箓', family: 'ancient', rarity: 4, quantity: 1 },
            { itemId: 2, templateId: 'talisman_fire_3', name: '稀有烈火符', family: 'fire', rarity: 3, quantity: 1 }
        ],
        usedKinds: 2,
        failedKinds: 0,
        dialogClosed: null,
        dialogCloseSource: '',
        dialogCloseFailureMessage: '',
        failureMessage: ''
    });
    assert.deepEqual(snapshot.automation.guardian, {
        shouldAttempt: true,
        reason: 'hire-triggered',
        encounterKey: 'monster:port_bandit:3:7',
        markEncounterKey: 'monster:port_bandit:3:7',
        hireTriggered: true,
        failureMessage: '',
        guardian: {
            enabled: true,
            maxFee: 999,
            minAtk: 120,
            mode: 'together',
            priority: ['incarnation', 'normal', 'body'],
            threatLevel: 'danger'
        }
    });
    assert.equal(snapshot.history.decisionTail.length, 20);
    assert.equal(snapshot.history.decisionTail[0].spirit, 5);
    assert.equal(snapshot.history.decisionTail[19].adventureId, 456);
    assert.equal(snapshot.history.logTail.length, 30);
    assert.equal(snapshot.history.logTail[0].message, '日志5');
    assert.equal(snapshot.history.logTail[29].message, '日志34');
    assert.equal(snapshot.page.url, 'https://ling.muge.info/game.html');
});

test('buildAfkStatusReport explains helper and extension version drift', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const summary = hooks.buildAfkDebugSummary({
        schema: 'lingverse-afk-debug-snapshot/v1',
        scriptVersion: '2.70.0',
        extensionVersion: '2.71.0',
        capturedAt: '2026-06-08T16:00:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        decision: { action: 'wait', reason: 'low-spirit' },
        player: { spirit: 3, maxSpirit: 2756, spiritCost: 4, canExplore: true },
        blockers: {},
        automation: {},
        config: { meditationMinutes: 140, minSpirit: 20, exploreMultiplier: 1 },
        history: {}
    });

    assert.deepEqual(toPlain(summary.environment), {
        extensionVersion: '2.71.0',
        initializedVersion: '',
        autoMapInited: false,
        versionMismatch: true,
        initializedVersionMismatch: false,
        initializedVersionMissing: false
    });

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('环境: helper 2.70.0 · 扩展 2.71.0 · 版本不一致，重载扩展并刷新页面'), true);
});

test('buildAfkStatusReport explains initialized panel version drift', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const summary = hooks.buildAfkDebugSummary({
        schema: 'lingverse-afk-debug-snapshot/v1',
        scriptVersion: '2.75.0',
        environment: {
            extensionVersion: '2.75.0',
            initializedVersion: '2.71.0',
            autoMapInited: true
        },
        capturedAt: '2026-06-08T16:20:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        decision: { action: 'wait', reason: 'low-spirit' },
        player: { spirit: 3, maxSpirit: 2756, spiritCost: 4, canExplore: true },
        blockers: {},
        automation: {},
        config: { meditationMinutes: 140, minSpirit: 20, exploreMultiplier: 1 },
        history: {}
    });

    assert.deepEqual(toPlain(summary.environment), {
        extensionVersion: '2.75.0',
        initializedVersion: '2.71.0',
        autoMapInited: true,
        versionMismatch: false,
        initializedVersionMismatch: true,
        initializedVersionMissing: false
    });

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('环境: helper 2.75.0 · 面板 2.71.0 · 页面仍是旧初始化，刷新页面'), true);
});

test('buildAfkDebugSummary strips page secrets and compacts histories', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.equal(typeof hooks.buildAfkDebugSummary, 'function');

    const longMessage = `未知奇遇等待处理 ${'很长'.repeat(90)} https://ling.muge.info/game.html?token=abc-secret&session=keep#panel`;
    const debugSnapshot = hooks.buildAfkDebugSnapshot({
        spirit: 12,
        maxSpirit: 300,
        spiritCost: 20,
        canExplore: false,
        exploreDisabledReason: '神识不足',
        isDead: false,
        isMeditating: false,
        merchantActive: false,
        encounterActive: false,
        combatActive: false,
        playerEncounterActive: false,
        adventureActive: true,
        adventureId: 999,
        adventureStep: 2,
        adventureTotalSteps: 4,
        adventureChoices: ['接受试炼', '绕路离开', `${'观察'.repeat(80)}?token=choice-secret`],
        autoExploreRunning: false,
        autoExplorePending: true,
        postInteractionResume: true,
        exploreStalled: true
    }, {
        enabled: true,
        meditationMinutes: 140,
        minSpirit: 20,
        exploreMultiplier: 50,
        stallTimeoutSeconds: 90,
        resumeWindowSeconds: 60,
        autoFight: true,
        autoHireGuardian: true,
        autoRevive: true,
        useTalismans: true,
        useNirvanaPill: true,
        queueNirvanaPill: true,
        autoDeclinePlayerEncounter: true,
        adventureMode: 'strategy',
        adventureChoiceMap: { 456: 2 }
    }, { action: 'wait', reason: 'adventure-active' }, {
        capturedAt: '2026-06-08T02:00:00.000Z',
        page: {
            title: '灵界 LingVerse - 修仙世界',
            url: 'https://ling.muge.info/game.html?token=abc-secret&session=keep#debug'
        },
        decisionHistory: Array.from({ length: 12 }, (_, index) => ({
            at: `2026-06-08T02:${String(index).padStart(2, '0')}:00.000Z`,
            action: index % 2 ? 'wait' : 'startAutoExplore',
            reason: index === 11 ? 'adventure-active' : 'auto-explore-running',
            spirit: index,
            adventureId: index === 11 ? 999 : null
        })),
        recentLogs: Array.from({ length: 12 }, (_, index) => ({
            at: `2026-06-08T03:${String(index).padStart(2, '0')}:00.000Z`,
            type: index % 2 ? 'warning' : 'info',
            message: index === 11 ? longMessage : `普通日志${index}`
        })),
        nirvanaPillAttempt: {
            shouldUse: true,
            reason: 'pill-ready',
            pill: {
                itemId: 3,
                templateId: 'bp_pill_rebirth_4',
                name: '史诗涅槃重生丹?token=pill-secret',
                rarity: 4,
                quantity: 1
            },
            minRarity: 4,
            activeBuffGrade: null,
            activeBuffExpire: null
        },
        talismanAttempt: {
            shouldAttempt: true,
            reason: 'completed',
            encounterKey: 'monster:port_bandit:3:7?token=talisman-secret',
            markEncounterKey: 'monster:port_bandit:3:7?token=talisman-secret',
            selectedTalismans: [
                {
                    itemId: 8,
                    templateId: 'talisman_ancient_4',
                    name: `史诗荒古符箓${'长名'.repeat(80)}?token=talisman-secret`,
                    family: 'ancient',
                    rarity: 4,
                    quantity: 1
                },
                {
                    itemId: 2,
                    templateId: 'talisman_fire_3',
                    name: '稀有烈火符',
                    family: 'fire',
                    rarity: 3,
                    quantity: 1
                }
            ],
            usedKinds: 1,
            failedKinds: 1,
            failureMessage: 'talisman_fire_3 使用失败: token=talisman-secret'
        },
        guardianAttempt: {
            shouldAttempt: true,
            reason: 'hire-failed',
            encounterKey: 'monster:port_bandit:3:7?token=guardian-secret',
            markEncounterKey: 'monster:port_bandit:3:7?token=guardian-secret',
            hireTriggered: false,
            failureMessage: `护道失败 token=guardian-secret ${'费用不足'.repeat(80)}`,
            guardian: {
                enabled: true,
                maxFee: 5000,
                minAtk: 888,
                mode: 'alone',
                priority: ['normal', 'incarnation', 'body'],
                threatLevel: 'warn'
            }
        },
        guardianConfig: {
            enabled: true,
            maxFee: 5000,
            minAtk: 888,
            mode: 'alone',
            priority: 'normal,incarnation,body',
            threatLevel: 'warn'
        }
    });

    const summary = toPlain(hooks.buildAfkDebugSummary(debugSnapshot));
    const serialized = JSON.stringify(summary);

    assert.equal(summary.schema, 'lingverse-afk-debug-summary/v1');
    assert.equal(summary.sourceSchema, 'lingverse-afk-debug-snapshot/v1');
    assert.equal(summary.page.url, 'https://ling.muge.info/game.html');
    assert.equal(serialized.includes('abc-secret'), false);
    assert.equal(serialized.includes('choice-secret'), false);
    assert.equal(serialized.includes('guardian-secret'), false);
    assert.equal(serialized.includes('#debug'), false);
    assert.deepEqual(summary.decision, { action: 'wait', reason: 'adventure-active' });
    assert.deepEqual(summary.player, {
        spirit: 12,
        maxSpirit: 300,
        spiritCost: 20,
        canExplore: false,
        isDead: false,
        isMeditating: false,
        meditationRecoveredSpirit: null,
        meditationSpiritFromBar: false
    });
    assert.equal(summary.adventure.id, 999);
    assert.equal(summary.adventure.choices.length, 3);
    assert.equal(summary.adventure.choices[2].endsWith('...'), true);
    assert.deepEqual(summary.adventure.strategyHints, [
        { choiceIndex: 1, choiceText: '接受试炼', mapLine: '999=1' },
        { choiceIndex: 2, choiceText: '绕路离开', mapLine: '999=2' },
        { choiceIndex: 3, choiceText: summary.adventure.choices[2], mapLine: '999=3' }
    ]);
    assert.deepEqual(summary.automation.nirvanaPill, {
        shouldUse: true,
        reason: 'pill-ready',
        pillName: '史诗涅槃重生丹',
        pillTemplateId: 'bp_pill_rebirth_4',
        pillRarity: 4,
        minRarity: 4,
        activeBuffGrade: null,
        activeBuffExpire: null,
        failureMessage: ''
    });
    assert.deepEqual(summary.automation.talismans, {
        shouldAttempt: true,
        reason: 'completed',
        encounterKey: 'monster:port_bandit:3:7',
        markEncounterKey: 'monster:port_bandit:3:7',
        selectedCount: 2,
        usedKinds: 1,
        failedKinds: 1,
        selectedTalismans: [
            {
                templateId: 'talisman_ancient_4',
                name: summary.automation.talismans.selectedTalismans[0].name,
                family: 'ancient',
                rarity: 4,
                quantity: 1
            },
            {
                templateId: 'talisman_fire_3',
                name: '稀有烈火符',
                family: 'fire',
                rarity: 3,
                quantity: 1
            }
        ],
        dialogClosed: null,
        dialogCloseSource: '',
        dialogCloseFailureMessage: '',
        failureMessage: 'talisman_fire_3 使用失败: token=<redacted>'
    });
    assert.equal(summary.automation.talismans.selectedTalismans[0].name.startsWith('史诗荒古符箓'), true);
    assert.equal(summary.automation.talismans.selectedTalismans[0].name.includes('talisman-secret'), false);
    assert.equal(summary.automation.talismans.selectedTalismans[0].name.endsWith('...'), true);
    assert.deepEqual(summary.automation.guardian, {
        shouldAttempt: true,
        reason: 'hire-failed',
        encounterKey: 'monster:port_bandit:3:7',
        markEncounterKey: 'monster:port_bandit:3:7',
        hireTriggered: false,
        failureMessage: summary.automation.guardian.failureMessage,
        guardian: {
            enabled: true,
            maxFee: 5000,
            minAtk: 888,
            mode: 'alone',
            priority: ['normal', 'incarnation', 'body'],
            threatLevel: 'warn'
        }
    });
    assert.equal(summary.automation.guardian.failureMessage.startsWith('护道失败 token=<redacted>'), true);
    assert.equal(summary.automation.guardian.failureMessage.endsWith('...'), true);
    assert.equal(summary.automation.postInteractionResume, true);
    assert.equal(summary.config.exploreMultiplier, 50);
    assert.deepEqual(summary.config.risks, {
        autoFight: true,
        autoHireGuardian: true,
        autoRevive: true,
        useTalismans: true,
        useNirvanaPill: true,
        queueNirvanaPill: true,
        autoDeclinePlayerEncounter: true
    });
    assert.deepEqual(summary.config.riskStatus, {
        schema: 'lingverse-afk-risk-status/v1',
        profileText: '富裕战斗模式',
        enabledRiskCount: 7,
        totalRiskCount: 7,
        warningCount: 0,
        summaryText: '富裕战斗模式 · 风险开关 7/7 · 警告 0',
        itemTexts: [
            '自动迎战: 开启 · 50倍探索',
            '自动护道: 开启 · 游戏护道开 · 独立作战 · 最高5000 · 攻≥888 · normal>incarnation>body',
            '自动复活: 开启 · 不限',
            '战斗用符: 开启 · 5种×1 · 按品质 · 不限',
            '涅槃重生丹: 开启 · 史诗+ · 允许排队 · 不限',
            '陌生道友婉拒: 开启',
            '奇遇自动选择: 开启 · strategy'
        ],
        warnings: []
    });
    assert.equal(summary.history.decisionTail.length, 8);
    assert.equal(summary.history.decisionTail[0].spirit, 4);
    assert.equal(summary.history.logTail.length, 8);
    assert.equal(summary.history.logTail[7].message.endsWith('...'), true);
    assert.ok(summary.history.logTail[7].message.length <= 160);
});

test('buildAfkDebugSummary reports exhausted AFK resource budgets', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const config = {
        enabled: true,
        autoRevive: true,
        reviveMaxPerRun: 1
    };
    const state = {
        isDead: true,
        resourceUsage: { revive: 1 }
    };
    const decision = hooks.decideAfkNextAction(state, config, 1_000_000);
    const summary = hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot(state, config, decision, {
        capturedAt: '2026-06-08T05:00:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' }
    }));

    assert.deepEqual(toPlain(summary.decision), {
        action: 'wait',
        reason: 'revive-budget-exhausted'
    });
    assert.deepEqual(toPlain(summary.automation.resourceUsage), {
        revive: 1,
        talismanEncounters: 0,
        nirvanaPills: 0
    });
    assert.equal(summary.config.riskStatus.warningCount, 1);
    assert.deepEqual(toPlain(summary.config.riskStatus.warnings), ['自动复活已到本轮上限']);
});

test('applyAfkPreset configures steady, guardian, and rich AFK modes without enabling the loop', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const base = {
        enabled: false,
        meditationMinutes: 60,
        minSpirit: 5,
        exploreMultiplier: 20,
        resumeWindowSeconds: 180,
        autoFight: true,
        autoHireGuardian: true,
        autoRevive: true,
        useTalismans: true,
        talismanMaxKinds: 3,
        talismanQuantity: 2,
        talismanFamilyOrder: ' ghost;fire;ghost ',
        useNirvanaPill: true,
        nirvanaMinRarity: 2,
        queueNirvanaPill: true,
        autoDeclinePlayerEncounter: true,
        adventureMode: 'strategy',
        adventureChoiceMap: { 456: 2 }
    };

    assert.deepEqual(toPlain(hooks.applyAfkPreset(base, 'steady')), {
        enabled: false,
        meditationMinutes: 140,
        minSpirit: 20,
        exploreMultiplier: 1,
        tickInterval: 30000,
        stallTimeoutSeconds: 90,
        resumeWindowSeconds: 180,
        autoRevive: false,
        reviveMaxPerRun: 0,
        autoFight: false,
        autoHireGuardian: false,
        useTalismans: false,
        talismanMaxKinds: 5,
        talismanQuantity: 1,
        talismanFamilyOrder: 'ghost,fire',
        talismanMaxEncountersPerRun: 0,
        useNirvanaPill: false,
        nirvanaMinRarity: 4,
        nirvanaMaxPerRun: 0,
        queueNirvanaPill: false,
        autoDeclinePlayerEncounter: false,
        autoReloadOnUpdate: false,
        adventureMode: 'strategy',
        adventureChoiceIndex: 1,
        adventureChoiceMap: { 456: 2 }
    });

    assert.deepEqual(toPlain(hooks.applyAfkPreset(base, 'guardian')), {
        enabled: false,
        meditationMinutes: 140,
        minSpirit: 20,
        exploreMultiplier: 1,
        tickInterval: 30000,
        stallTimeoutSeconds: 90,
        resumeWindowSeconds: 180,
        autoRevive: false,
        reviveMaxPerRun: 0,
        autoFight: false,
        autoHireGuardian: true,
        useTalismans: false,
        talismanMaxKinds: 5,
        talismanQuantity: 1,
        talismanFamilyOrder: 'ghost,fire',
        talismanMaxEncountersPerRun: 0,
        useNirvanaPill: false,
        nirvanaMinRarity: 4,
        nirvanaMaxPerRun: 0,
        queueNirvanaPill: false,
        autoDeclinePlayerEncounter: false,
        autoReloadOnUpdate: false,
        adventureMode: 'strategy',
        adventureChoiceIndex: 1,
        adventureChoiceMap: { 456: 2 }
    });

    assert.deepEqual(toPlain(hooks.applyAfkPreset(base, 'rich')), {
        enabled: false,
        meditationMinutes: 140,
        minSpirit: 20,
        exploreMultiplier: 50,
        tickInterval: 30000,
        stallTimeoutSeconds: 90,
        resumeWindowSeconds: 180,
        autoRevive: true,
        reviveMaxPerRun: 1,
        autoFight: true,
        autoHireGuardian: false,
        useTalismans: true,
        talismanMaxKinds: 5,
        talismanQuantity: 1,
        talismanFamilyOrder: 'ghost,fire',
        talismanMaxEncountersPerRun: 3,
        useNirvanaPill: true,
        nirvanaMinRarity: 4,
        nirvanaMaxPerRun: 1,
        queueNirvanaPill: false,
        autoDeclinePlayerEncounter: true,
        autoReloadOnUpdate: false,
        adventureMode: 'strategy',
        adventureChoiceIndex: 1,
        adventureChoiceMap: { 456: 2 }
    });
});

test('buildAfkPresetStatus identifies AFK preset matches and drift', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.equal(typeof hooks.buildAfkPresetStatus, 'function');

    const guardianStatus = hooks.buildAfkPresetStatus(hooks.applyAfkPreset({
        enabled: true,
        resumeWindowSeconds: 75
    }, 'guardian'));
    assert.deepEqual(toPlain(guardianStatus), {
        schema: 'lingverse-afk-preset-status/v1',
        mode: 'guardian',
        label: '护道1倍',
        match: true,
        closestPreset: 'guardian',
        closestLabel: '护道1倍',
        mismatchCount: 0,
        mismatchTexts: [],
        summaryText: '护道1倍 · 已匹配预设',
        lineText: '模式: 护道1倍 · 已匹配预设 · 冥想140分钟 · 阈值20 · 恢复75秒'
    });

    const richDrift = hooks.buildAfkPresetStatus(Object.assign(
        hooks.applyAfkPreset({}, 'rich'),
        { autoRevive: false }
    ));
    assert.deepEqual(toPlain(richDrift), {
        schema: 'lingverse-afk-preset-status/v1',
        mode: 'custom',
        label: '自定义',
        match: false,
        closestPreset: 'rich',
        closestLabel: '富裕50倍',
        mismatchCount: 1,
        mismatchTexts: ['自动复活应开启'],
        summaryText: '自定义 · 接近富裕50倍 · 偏离1项',
        lineText: '模式: 自定义 · 接近富裕50倍 · 偏离1项: 自动复活应开启'
    });

    const report = hooks.buildAfkStatusReport({
        schema: 'lingverse-afk-debug-summary/v1',
        scriptVersion: '2.75.0',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        decision: { action: 'startAutoExplore', reason: 'spirit-ready' },
        player: { spirit: 2600, maxSpirit: 2758, spiritCost: 4, canExplore: true },
        blockers: {},
        automation: { resourceUsage: {} },
        config: {
            meditationMinutes: 140,
            minSpirit: 20,
            exploreMultiplier: 50,
            reviveMaxPerRun: 1,
            talismanMaxEncountersPerRun: 3,
            nirvanaMaxPerRun: 1,
            presetStatus: richDrift
        }
    });
    assert.equal(report.lines.includes('模式: 自定义 · 接近富裕50倍 · 偏离1项: 自动复活应开启'), true);
});

test('getResumeWindowMs converts configured resume windows to milliseconds', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.equal(typeof hooks.getResumeWindowMs, 'function');
    assert.equal(hooks.getResumeWindowMs({ resumeWindowSeconds: 90 }), 90000);
    assert.equal(hooks.getResumeWindowMs({ resumeWindowSeconds: 0 }), 0);
    assert.equal(hooks.getResumeWindowMs({ resumeWindowSeconds: 99999 }), 3600000);
});

test('buildAfkPanelStatus summarizes current decision and next check timing', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.equal(typeof hooks.buildAfkPanelStatus, 'function');

    assert.deepEqual(toPlain(hooks.buildAfkPanelStatus({
        enabled: false,
        tickInterval: 30000
    }, [], {
        lastEvaluationAt: 1_000_000,
        busy: false
    }, 1_010_000)), {
        stateText: '未启动',
        currentDecisionText: '未启动',
        lastActionText: '暂无',
        nextCheckText: '未启动',
        nextCheckInSeconds: null
    });

    assert.deepEqual(toPlain(hooks.buildAfkPanelStatus({
        enabled: true,
        tickInterval: 30000
    }, [{
        action: 'handleEncounter',
        reason: 'encounter-auto-guardian-enabled'
    }], {
        lastEvaluationAt: 1_000_000,
        busy: false
    }, 1_010_500)), {
        stateText: '运行中',
        currentDecisionText: '已开启遭遇前自动护道',
        lastActionText: '处理遭遇 · 已开启遭遇前自动护道',
        nextCheckText: '20秒后',
        nextCheckInSeconds: 20
    });

    assert.deepEqual(toPlain(hooks.buildAfkPanelStatus({
        enabled: true,
        tickInterval: 30000
    }, [], {
        lastEvaluationAt: 0,
        busy: true
    }, 1_010_500)), {
        stateText: '运行中',
        currentDecisionText: '等待首次检查',
        lastActionText: '暂无',
        nextCheckText: '检查中',
        nextCheckInSeconds: 0
    });
});

test('buildAfkPhaseStatus reports meditation and exploration timing', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.equal(typeof hooks.buildAfkPhaseStatus, 'function');

    assert.deepEqual(toPlain(hooks.buildAfkPhaseStatus({
        isMeditating: true,
        meditationDurationSeconds: 3600,
        spirit: 1200,
        maxSpirit: 2758,
        spiritCost: 4
    }, {
        enabled: true,
        meditationMinutes: 140,
        stallTimeoutSeconds: 90
    }, {
        action: 'wait',
        reason: 'meditating'
    }, 1_000_000)), {
        schema: 'lingverse-afk-phase-status/v1',
        phase: 'meditating',
        label: '冥想中',
        text: '冥想中 · 已冥想1小时 · 计划剩余1小时20分钟 · 满神识提前结束',
        reason: 'meditating',
        elapsedSeconds: 3600,
        remainingSeconds: 4800,
        targetSeconds: 8400
    });

    assert.deepEqual(toPlain(hooks.buildAfkPhaseStatus({
        isMeditating: true,
        meditationDurationSeconds: 120,
        spirit: 2758,
        maxSpirit: 2758,
        spiritCost: 4
    }, {
        enabled: true,
        meditationMinutes: 140,
        stallTimeoutSeconds: 90
    }, {
        action: 'stopMeditation',
        reason: 'spirit-full'
    }, 1_000_000)), {
        schema: 'lingverse-afk-phase-status/v1',
        phase: 'meditating',
        label: '冥想中',
        text: '冥想中 · 已冥想2分钟 · 神识已满，准备结束',
        reason: 'spirit-full',
        elapsedSeconds: 120,
        remainingSeconds: 0,
        targetSeconds: 8400
    });

    assert.deepEqual(toPlain(hooks.buildAfkPhaseStatus({
        autoExploreRunning: true,
        autoExplorePending: false,
        exploreStalled: false,
        spirit: 888,
        maxSpirit: 2758,
        spiritCost: 4
    }, {
        enabled: true,
        meditationMinutes: 140,
        stallTimeoutSeconds: 90,
        exploreMultiplier: 50
    }, {
        action: 'wait',
        reason: 'auto-explore-running'
    }, 1_000_000)), {
        schema: 'lingverse-afk-phase-status/v1',
        phase: 'exploring',
        label: '探索中',
        text: '探索中 · 50倍 · 卡住判定90秒',
        reason: 'auto-explore-running',
        elapsedSeconds: null,
        remainingSeconds: null,
        targetSeconds: 90
    });

    assert.deepEqual(toPlain(hooks.buildAfkPhaseStatus({
        postMeditationResume: true,
        postMeditationResumeRemainingSeconds: 45,
        spirit: 3,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: true
    }, {
        enabled: true,
        meditationMinutes: 140,
        resumeWindowSeconds: 60,
        exploreMultiplier: 50
    }, {
        action: 'startAutoExplore',
        reason: 'post-meditation-ready'
    }, 1_000_000)), {
        schema: 'lingverse-afk-phase-status/v1',
        phase: 'resuming',
        label: '收功恢复窗口',
        text: '收功恢复窗口 · 剩余45秒 · 收功后将继续50倍探索',
        reason: 'post-meditation-ready',
        elapsedSeconds: null,
        remainingSeconds: 45,
        targetSeconds: 60
    });
});

test('buildAfkIssueReplay turns copied summaries into a replay view', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.equal(typeof hooks.buildAfkIssueReplay, 'function');

    const replay = hooks.buildAfkIssueReplay(JSON.stringify({
        schema: 'lingverse-afk-debug-summary/v1',
        scriptVersion: '2.32.0',
        capturedAt: '2026-06-08T00:00:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        decision: { action: 'handleEncounter', reason: 'encounter-auto-guardian-enabled' },
        player: { spirit: 3, maxSpirit: 2758, spiritCost: 4, canExplore: true },
        blockers: {
            merchantActive: false,
            encounterActive: true,
            combatActive: true,
            playerEncounterActive: false,
            adventureActive: true,
            adventureId: 456,
            immortalPrisonActive: false
        },
        automation: {
            nirvanaPill: { reason: 'disabled' },
            talismans: { reason: 'disabled' },
            guardian: { reason: 'hire-failed', failureMessage: '余额不足' }
        },
        adventure: {
            id: 456,
            strategyHints: [
                { choiceIndex: 1, choiceText: '离开', mapLine: '456=1' },
                { choiceIndex: 2, choiceText: '深入', mapLine: '456=2' }
            ]
        },
        config: {
            risks: {
                autoFight: false,
                autoHireGuardian: true,
                autoRevive: false,
                useTalismans: false,
                useNirvanaPill: false,
                queueNirvanaPill: false,
                autoDeclinePlayerEncounter: false
            }
        }
    }));

    assert.deepEqual(toPlain(replay), {
        schema: 'lingverse-afk-issue-replay/v1',
        sourceSchema: 'lingverse-afk-debug-summary/v1',
        scriptVersion: '2.32.0',
        capturedAt: '2026-06-08T00:00:00.000Z',
        pageText: '灵界 LingVerse - 修仙世界',
        headline: '处理遭遇 · 已开启遭遇前自动护道',
        decisionText: '处理遭遇 · 已开启遭遇前自动护道',
        spiritText: '3/2758',
        blockerText: '遭遇/战斗/奇遇#456',
        riskText: '迎战关 · 护道开 · 复活关 · 用符关 · 用丹关 · 丹药排队关 · 道友婉拒关',
        automationText: '护道: hire-failed · 余额不足 | 用符: disabled | 用丹: disabled',
        strategyImportText: '456=1\n456=2',
        replayLines: [
            '页面: 灵界 LingVerse - 修仙世界',
            '决策: 处理遭遇 · 已开启遭遇前自动护道',
            '神识: 3/2758',
            '阻塞: 遭遇/战斗/奇遇#456',
            '风险: 迎战关 · 护道开 · 复活关 · 用符关 · 用丹关 · 丹药排队关 · 道友婉拒关',
            '自动化: 护道: hire-failed · 余额不足 | 用符: disabled | 用丹: disabled',
            '奇遇策略: 456=1 / 456=2'
        ]
    });
});

test('buildAfkStatusReport formats copied summaries for testers', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.equal(typeof hooks.buildAfkStatusReport, 'function');

    const report = hooks.buildAfkStatusReport({
        schema: 'lingverse-afk-debug-summary/v1',
        scriptVersion: '2.47.0',
        capturedAt: '2026-06-08T06:00:00.000Z',
        page: {
            title: '灵界 LingVerse - 修仙世界',
            url: 'https://ling.muge.info/game.html'
        },
        decision: {
            action: 'wait',
            reason: 'revive-budget-exhausted'
        },
        player: {
            spirit: 3,
            maxSpirit: 2758,
            spiritCost: 4,
            canExplore: true,
            isDead: true,
            isMeditating: false
        },
        blockers: {
            merchantActive: false,
            encounterActive: false,
            combatActive: false,
            playerEncounterActive: false,
            adventureActive: true,
            adventureId: 456,
            immortalPrisonActive: false
        },
        automation: {
            autoExploreRunning: false,
            autoExplorePending: false,
            exploreStalled: false,
            postReviveResume: false,
            postInteractionResume: false,
            resourceUsage: {
                revive: 1,
                talismanEncounters: 2,
                nirvanaPills: 1
            },
            guardian: {
                shouldAttempt: false,
                reason: 'hire-failed',
                failureMessage: '余额不足',
                guardian: {
                    enabled: true,
                    maxFee: 51,
                    minAtk: 0,
                    mode: 'alone',
                    priority: ['normal', 'incarnation', 'body'],
                    threatLevel: 'danger'
                }
            },
            talismans: { reason: 'completed', selectedCount: 3, usedKinds: 3, failedKinds: 0 },
            fight: { reason: 'not-attempted', source: '', failureMessage: '' },
            nirvanaPill: { reason: 'budget-exhausted', minRarity: 4 },
            resourcePreflight: {
                inventoryKnown: true,
                enabled: true,
                summaryText: '资源预检: 用符 3/5类 · 涅槃丹 无史诗+',
                warningCount: 2,
                warnings: ['战斗符箓不足5类，会按现有3类用符', '未找到史诗+涅槃重生丹，会跳过用丹']
            }
        },
        adventure: {
            id: 456,
            step: 1,
            totalSteps: 3,
            choices: ['入谷探查', '绕路离开'],
            strategyHints: [
                { mapLine: '456=1' },
                { mapLine: '456=2' }
            ]
        },
        config: {
            meditationMinutes: 140,
            minSpirit: 20,
            exploreMultiplier: 50,
            reviveMaxPerRun: 1,
            talismanMaxEncountersPerRun: 3,
            nirvanaMaxPerRun: 1,
            riskStatus: {
                summaryText: '富裕战斗模式 · 风险开关 6/7 · 警告 1',
                warnings: ['自动复活已到本轮上限']
            }
        }
    });

    assert.deepEqual(toPlain(report), {
        schema: 'lingverse-afk-status-report/v1',
        sourceSchema: 'lingverse-afk-debug-summary/v1',
        scriptVersion: '2.47.0',
        capturedAt: '2026-06-08T06:00:00.000Z',
        headline: '挂机状态 · 等待 · 复活次数已到本轮上限',
        text: [
            '挂机状态 · 等待 · 复活次数已到本轮上限',
            '版本: 2.47.0',
            '页面: 灵界 LingVerse - 修仙世界',
            '神识: 3/2758 · 单次消耗4',
            '阻塞: 死亡/奇遇#456',
            '阶段: 阻塞 · 复活次数已到本轮上限',
            '探索: 停止',
            '配置: 冥想140分钟 · 神识<20 · 50倍',
            '资源: 复活 1/1 · 用符 2/3 · 用丹 1/1',
            '风险: 富裕战斗模式 · 风险开关 6/7 · 警告 1',
            '! 自动复活已到本轮上限',
            '护道: 自动护道失败 · 余额不足 · 游戏护道开 · 独立作战 · 最高51 · normal>incarnation>body',
            '护道建议: 自动护道失败 · 检查灵石、最高费用51、最低攻击力0，必要时调整游戏护道设置后手动处理当前遭遇',
            '用符: 已完成战斗用符 · 成功3/3类',
            '用符建议: 已完成战斗用符 · 等待自动迎战或战斗结算',
            '用丹: 涅槃重生丹次数已到本轮上限 · 史诗+',
            '用丹建议: 本轮用丹次数已到上限 · 可重启挂机或调高用丹上限',
            '预检: 资源预检: 用符 3/5类 · 涅槃丹 无史诗+',
            '! 战斗符箓不足5类，会按现有3类用符',
            '! 未找到史诗+涅槃重生丹，会跳过用丹',
            '自动化: 护道 hire-failed · 用符 completed · 迎战 not-attempted · 用丹 budget-exhausted',
            '奇遇: #456 第1/3步 · 1.入谷探查 / 2.绕路离开',
            '奇遇策略: 456=1 / 456=2'
        ].join('\n'),
        lines: [
            '挂机状态 · 等待 · 复活次数已到本轮上限',
            '版本: 2.47.0',
            '页面: 灵界 LingVerse - 修仙世界',
            '神识: 3/2758 · 单次消耗4',
            '阻塞: 死亡/奇遇#456',
            '阶段: 阻塞 · 复活次数已到本轮上限',
            '探索: 停止',
            '配置: 冥想140分钟 · 神识<20 · 50倍',
            '资源: 复活 1/1 · 用符 2/3 · 用丹 1/1',
            '风险: 富裕战斗模式 · 风险开关 6/7 · 警告 1',
            '! 自动复活已到本轮上限',
            '护道: 自动护道失败 · 余额不足 · 游戏护道开 · 独立作战 · 最高51 · normal>incarnation>body',
            '护道建议: 自动护道失败 · 检查灵石、最高费用51、最低攻击力0，必要时调整游戏护道设置后手动处理当前遭遇',
            '用符: 已完成战斗用符 · 成功3/3类',
            '用符建议: 已完成战斗用符 · 等待自动迎战或战斗结算',
            '用丹: 涅槃重生丹次数已到本轮上限 · 史诗+',
            '用丹建议: 本轮用丹次数已到上限 · 可重启挂机或调高用丹上限',
            '预检: 资源预检: 用符 3/5类 · 涅槃丹 无史诗+',
            '! 战斗符箓不足5类，会按现有3类用符',
            '! 未找到史诗+涅槃重生丹，会跳过用丹',
            '自动化: 护道 hire-failed · 用符 completed · 迎战 not-attempted · 用丹 budget-exhausted',
            '奇遇: #456 第1/3步 · 1.入谷探查 / 2.绕路离开',
            '奇遇策略: 456=1 / 456=2'
        ]
    });
});

test('buildAfkStatusReport explains post-interaction resume windows', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        postInteractionResume: true,
        postInteractionResumeRemainingSeconds: 45,
        spirit: 160,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: true,
        isDead: false,
        isMeditating: false
    }, {
        enabled: true,
        meditationMinutes: 140,
        minSpirit: 20,
        exploreMultiplier: 50,
        resumeWindowSeconds: 60
    }, {
        action: 'startAutoExplore',
        reason: 'post-interaction-ready'
    }, {
        capturedAt: '2026-06-08T08:30:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' }
    })));

    assert.deepEqual(summary.phase, {
        schema: 'lingverse-afk-phase-status/v1',
        phase: 'resuming',
        label: '事件恢复窗口',
        text: '事件恢复窗口 · 剩余45秒 · 神识足够将继续50倍探索',
        reason: 'post-interaction-ready',
        elapsedSeconds: null,
        remainingSeconds: 45,
        targetSeconds: 60
    });

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('恢复: 事件恢复窗口 · 剩余45秒 · 神识足够将继续50倍探索'), true);
});

test('buildAfkStatusReport explains post-meditation resume windows', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        postMeditationResume: true,
        postMeditationResumeRemainingSeconds: 45,
        spirit: 3,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: true,
        isDead: false,
        isMeditating: false
    }, {
        enabled: true,
        meditationMinutes: 140,
        minSpirit: 20,
        exploreMultiplier: 50,
        resumeWindowSeconds: 60
    }, {
        action: 'startAutoExplore',
        reason: 'post-meditation-ready'
    }, {
        capturedAt: '2026-06-08T08:45:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' }
    })));

    assert.equal(summary.automation.postMeditationResume, true);

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('探索: 收功恢复窗口'), true);
    assert.equal(report.lines.includes('恢复: 收功恢复窗口 · 剩余45秒 · 收功后将继续50倍探索'), true);
});

test('buildAfkStatusReport explains low-spirit meditation returns', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        spirit: 3,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: true,
        isDead: false,
        isMeditating: false,
        autoExplorePending: true
    }, {
        enabled: true,
        meditationMinutes: 140,
        minSpirit: 20,
        exploreMultiplier: 1,
        stallTimeoutSeconds: 90
    }, {
        action: 'startMeditation',
        reason: 'auto-explore-low-spirit'
    }, {
        capturedAt: '2026-06-08T08:45:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' }
    })));

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('回冥想: 自动探索神识不足 · 当前3/2758 · 单次4 · 阈值20'), true);
});

test('buildAfkStatusReport suggests guardian fixes after hire failures', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const report = hooks.buildAfkStatusReport({
        schema: 'lingverse-afk-debug-summary/v1',
        scriptVersion: '2.48.0',
        capturedAt: '2026-06-08T09:20:00.000Z',
        page: {
            title: '灵界 LingVerse - 修仙世界',
            url: 'https://ling.muge.info/game.html'
        },
        decision: {
            action: 'handleEncounter',
            reason: 'encounter-auto-guardian-enabled'
        },
        player: {
            spirit: 120,
            maxSpirit: 2758,
            spiritCost: 4,
            canExplore: true,
            isDead: false,
            isMeditating: false
        },
        blockers: {
            encounterActive: true,
            combatActive: false
        },
        automation: {
            guardian: {
                shouldAttempt: false,
                reason: 'hire-failed',
                failureMessage: '余额不足',
                guardian: {
                    enabled: true,
                    maxFee: 51,
                    minAtk: 0,
                    mode: 'alone',
                    priority: ['normal', 'incarnation', 'body'],
                    threatLevel: 'danger'
                }
            },
            talismans: { reason: 'disabled' },
            fight: { reason: 'not-attempted' },
            nirvanaPill: { reason: 'disabled' }
        },
        config: {
            meditationMinutes: 140,
            minSpirit: 20,
            exploreMultiplier: 1
        }
    });

    assert.equal(report.lines.includes('护道建议: 自动护道失败 · 检查灵石、最高费用51、最低攻击力0，必要时调整游戏护道设置后手动处理当前遭遇'), true);
});

test('buildAfkDebugSummary reports encounter fight attempts', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.equal(typeof hooks.normalizeEncounterFightAttempt, 'function');

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        encounterActive: true,
        encounterMonsterId: 'port_bandit',
        encounterMonsterStage: 3,
        encounterMonsterLevel: 7,
        spirit: 120,
        maxSpirit: 2758,
        spiritCost: 50
    }, {
        enabled: true,
        autoFight: true,
        useTalismans: true
    }, {
        action: 'handleEncounter',
        reason: 'encounter-auto-fight-enabled'
    }, {
        capturedAt: '2026-06-08T08:00:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        fightAttempt: {
            shouldAttempt: true,
            reason: 'fight-failed',
            encounterKey: 'monster:port_bandit:3:7?token=fight-secret',
            source: 'page-function',
            failureMessage: 'combat-choice failed token=fight-secret'
        }
    })));

    assert.deepEqual(summary.automation.fight, {
        shouldAttempt: true,
        reason: 'fight-failed',
        encounterKey: 'monster:port_bandit:3:7',
        source: 'page-function',
        failureMessage: 'combat-choice failed token=<redacted>'
    });

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.some(line => line.includes('迎战 fight-failed')), true);
});

test('buildAfkStatusReport explains failed fight attempts', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        encounterActive: true,
        encounterMonsterId: 'port_bandit',
        encounterMonsterStage: 3,
        encounterMonsterLevel: 7,
        spirit: 120,
        maxSpirit: 2758,
        spiritCost: 4
    }, {
        enabled: true,
        autoFight: true,
        exploreMultiplier: 50
    }, {
        action: 'handleEncounter',
        reason: 'encounter-auto-fight-enabled'
    }, {
        capturedAt: '2026-06-08T09:45:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        fightAttempt: {
            shouldAttempt: true,
            reason: 'fight-failed',
            encounterKey: 'monster:port_bandit:3:7?token=fight-secret',
            source: 'page-function',
            failureMessage: 'combat-choice failed token=fight-secret'
        }
    })));

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('迎战: 自动迎战失败 · 页面函数 · combat-choice failed token=<redacted>'), true);
    assert.equal(report.lines.includes('迎战建议: 自动迎战失败 · 检查遭遇面板和页面函数迎战入口，必要时手动迎战或复制摘要'), true);
});

test('buildAfkStatusReport explains combat talisman attempts', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        encounterActive: true,
        encounterMonsterId: 'port_bandit',
        encounterMonsterStage: 3,
        encounterMonsterLevel: 7,
        spirit: 120,
        maxSpirit: 2758,
        spiritCost: 4
    }, {
        enabled: true,
        autoFight: true,
        useTalismans: true,
        exploreMultiplier: 50
    }, {
        action: 'handleEncounter',
        reason: 'encounter-auto-fight-enabled'
    }, {
        capturedAt: '2026-06-08T10:05:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        talismanAttempt: {
            shouldAttempt: true,
            reason: 'completed',
            encounterKey: 'monster:port_bandit:3:7?token=talisman-secret',
            markEncounterKey: 'monster:port_bandit:3:7',
            selectedTalismans: [
                { itemId: 8, templateId: 'talisman_ancient_4', name: '史诗荒古符箓', family: 'ancient', rarity: 4, quantity: 1 },
                { itemId: 2, templateId: 'talisman_fire_3', name: '稀有烈火符', family: 'fire', rarity: 3, quantity: 1 }
            ],
            usedKinds: 1,
            failedKinds: 1,
            failureMessage: 'use-item failed token=talisman-secret'
        }
    })));

    assert.equal(summary.automation.talismans.failureMessage, 'use-item failed token=<redacted>');

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('用符: 已完成战斗用符 · 成功1/2类 · 失败1类 · ancient/fire · use-item failed token=<redacted>'), true);
    assert.equal(report.lines.includes('用符建议: 部分符箓使用失败 · 检查失败消息或库存，必要时手动迎战后复制摘要'), true);
});

test('buildAfkStatusReport explains talisman dialog close failures', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        encounterActive: true,
        encounterMonsterId: 'port_bandit',
        encounterMonsterStage: 3,
        encounterMonsterLevel: 7,
        spirit: 120,
        maxSpirit: 2758,
        spiritCost: 4
    }, {
        enabled: true,
        autoFight: true,
        useTalismans: true,
        exploreMultiplier: 50
    }, {
        action: 'handleEncounter',
        reason: 'encounter-auto-fight-enabled'
    }, {
        capturedAt: '2026-06-08T10:15:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        talismanAttempt: {
            shouldAttempt: true,
            reason: 'completed',
            encounterKey: 'monster:port_bandit:3:7',
            markEncounterKey: 'monster:port_bandit:3:7',
            selectedTalismans: [
                { itemId: 8, templateId: 'talisman_ancient_4', name: '史诗荒古符箓', family: 'ancient', rarity: 4, quantity: 1 }
            ],
            usedKinds: 1,
            failedKinds: 0,
            dialogClosed: false,
            dialogCloseSource: 'dom',
            dialogCloseFailureMessage: 'close failed token=talisman-dialog-secret'
        }
    })));

    assert.equal(summary.automation.talismans.dialogClosed, false);
    assert.equal(summary.automation.talismans.dialogCloseSource, 'dom');
    assert.equal(summary.automation.talismans.dialogCloseFailureMessage, 'close failed token=<redacted>');

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('用符: 已完成战斗用符 · 成功1/1类 · ancient · 符窗未关闭 · close failed token=<redacted>'), true);
    assert.equal(report.lines.includes('用符建议: 符箓面板未关闭 · 先关闭符箓面板再自动/手动迎战，并复制摘要排查关闭入口'), true);
    assert.equal(report.lines.includes('迎战: 符箓面板未关闭'), true);
    assert.equal(report.lines.includes('迎战建议: 符箓面板未关闭 · 先关闭符箓面板再自动/手动迎战，并复制摘要排查关闭入口'), true);
});

test('buildAfkStatusReport explains failed nirvana pill attempts', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        spirit: 1200,
        maxSpirit: 2758,
        spiritCost: 50,
        canExplore: true,
        isDead: false,
        isMeditating: false
    }, {
        enabled: true,
        autoFight: true,
        useNirvanaPill: true,
        nirvanaMinRarity: 4,
        exploreMultiplier: 50
    }, {
        action: 'startAutoExplore',
        reason: 'spirit-ready'
    }, {
        capturedAt: '2026-06-08T10:25:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        nirvanaPillAttempt: {
            shouldUse: true,
            reason: 'use-failed',
            pill: {
                itemId: 9,
                templateId: 'bp_pill_rebirth_4',
                name: '史诗涅槃重生丹?token=pill-secret',
                rarity: 4,
                quantity: 1
            },
            minRarity: 4,
            failureMessage: 'use-item failed token=pill-secret'
        }
    })));

    assert.equal(summary.automation.nirvanaPill.failureMessage, 'use-item failed token=<redacted>');

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('用丹: 涅槃重生丹使用失败 · 史诗+ · 史诗涅槃重生丹 · use-item failed token=<redacted>'), true);
    assert.equal(report.lines.includes('用丹建议: 涅槃重生丹使用失败 · 检查丹药库存和页面用丹接口，必要时关闭自动用丹后继续挂机'), true);
});

test('buildAfkStatusReport explains failed revive attempts', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        spirit: 0,
        maxSpirit: 2758,
        spiritCost: 50,
        canExplore: false,
        isDead: true,
        isMeditating: false,
        resourceUsage: { revive: 0 }
    }, {
        enabled: true,
        autoRevive: true,
        reviveMaxPerRun: 1,
        exploreMultiplier: 50
    }, {
        action: 'revive',
        reason: 'dead-auto-revive-enabled'
    }, {
        capturedAt: '2026-06-08T10:45:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        reviveAttempt: {
            shouldAttempt: true,
            reason: 'revive-failed',
            source: 'page-function',
            failureMessage: 'revive failed token=revive-secret'
        }
    })));

    assert.equal(summary.automation.revive.failureMessage, 'revive failed token=<redacted>');

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('复活: 自动复活失败 · 页面函数 · revive failed token=<redacted>'), true);
    assert.equal(report.lines.includes('复活建议: 自动复活失败 · 检查灵石和页面复活入口，必要时手动复活或调高本轮上限'), true);
});

test('buildAfkStatusReport explains failed explore start attempts', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        spirit: 1200,
        maxSpirit: 2758,
        spiritCost: 50,
        canExplore: true,
        isDead: false,
        isMeditating: false
    }, {
        enabled: true,
        exploreMultiplier: 50
    }, {
        action: 'startAutoExplore',
        reason: 'spirit-ready'
    }, {
        capturedAt: '2026-06-08T10:55:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        exploreStartAttempt: {
            shouldAttempt: true,
            reason: 'start-failed',
            multiplier: 50,
            source: 'toggle',
            failureMessage: 'toggle failed token=explore-secret'
        }
    })));

    assert.equal(summary.automation.exploreStart.failureMessage, 'toggle failed token=<redacted>');

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('探索启动: 自动探索启动失败 · 50倍 · 自动按钮 · toggle failed token=<redacted>'), true);
    assert.equal(report.lines.includes('探索建议: 自动探索启动失败 · 检查探索倍率控件和自动探索入口，必要时刷新页面/重载扩展'), true);
});

test('buildAfkStatusReport explains failed merchant purchase attempts', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        spirit: 88,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: true,
        isDead: false,
        isMeditating: false,
        merchantActive: true
    }, {
        enabled: true,
        exploreMultiplier: 1
    }, {
        action: 'wait',
        reason: 'merchant-active'
    }, {
        capturedAt: '2026-06-08T11:05:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        merchantAttempt: {
            shouldAttempt: true,
            reason: 'purchase-failed',
            source: 'api',
            item: {
                index: 2,
                name: '稀有化神归识丹?token=merchant-secret',
                price: 9972
            },
            failureMessage: 'buy failed token=merchant-secret'
        }
    })));

    assert.equal(summary.automation.merchant.itemName, '稀有化神归识丹');
    assert.equal(summary.automation.merchant.failureMessage, 'buy failed token=<redacted>');

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('商人: 购买最高价商品失败 · 稀有化神归识丹 · 9972灵石 · 接口 · buy failed token=<redacted>'), true);
    assert.equal(report.lines.includes('商人建议: 自动购买失败 · 检查灵石、商人窗口和购买接口，必要时手动处理或复制摘要'), true);
});

test('buildAfkStatusReport explains failed meditation stop attempts', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        spirit: 2758,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: true,
        isDead: false,
        isMeditating: true,
        meditationDurationSeconds: 8400
    }, {
        enabled: true,
        meditationMinutes: 140,
        exploreMultiplier: 1
    }, {
        action: 'stopMeditation',
        reason: 'meditation-duration-reached'
    }, {
        capturedAt: '2026-06-08T11:15:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        meditationAttempt: {
            shouldAttempt: true,
            action: 'stop',
            reason: 'stop-failed',
            source: 'page-function',
            targetMinutes: 140,
            elapsedSeconds: 8400,
            failureMessage: 'stop meditation failed token=meditation-secret'
        }
    })));

    assert.equal(summary.automation.meditation.failureMessage, 'stop meditation failed token=<redacted>');

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('冥想: 结束冥想失败 · 页面函数 · 已冥想2小时20分钟 · 计划140分钟 · stop meditation failed token=<redacted>'), true);
    assert.equal(report.lines.includes('冥想建议: 结束冥想失败 · 检查冥想按钮/API，必要时手动收功或刷新页面'), true);
});

test('buildAfkStatusReport explains spirit-full meditation stops', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        spirit: 2758,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: true,
        isDead: false,
        isMeditating: true,
        meditationDurationSeconds: 120
    }, {
        enabled: true,
        meditationMinutes: 140,
        exploreMultiplier: 1
    }, {
        action: 'stopMeditation',
        reason: 'spirit-full'
    }, {
        capturedAt: '2026-06-08T11:20:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' }
    })));

    assert.equal(summary.automation.meditation.triggerReason, 'spirit-full');

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('冥想: 准备结束冥想 · 神识已满 · 已冥想2分钟 · 计划140分钟'), true);
    assert.equal(report.lines.includes('冥想建议: 神识已满，准备提前收功 · 收功后会按当前神识继续探索'), true);
});

test('buildAfkStatusReport explains meditation bar spirit fallback', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        spirit: 3,
        maxSpirit: 100,
        spiritCost: 4,
        canExplore: true,
        isDead: false,
        isMeditating: true,
        meditationDurationSeconds: 5400,
        meditationRecoveredSpirit: 97,
        meditationSpiritFromBar: true
    }, {
        enabled: true,
        meditationMinutes: 140,
        exploreMultiplier: 1
    }, {
        action: 'stopMeditation',
        reason: 'spirit-full'
    }, {
        capturedAt: '2026-06-08T11:30:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' }
    })));

    assert.equal(summary.player.meditationRecoveredSpirit, 97);
    assert.equal(summary.player.meditationSpiritFromBar, true);

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('冥想兜底: 冥想条恢复97识 · 缓存3/100 · 估算100/100'), true);
});

test('buildAfkWaitingDiagnosis flags repeated manual waits for tester reports', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.equal(typeof hooks.buildAfkWaitingDiagnosis, 'function');

    const history = Array.from({ length: 5 }, (_, index) => ({
        at: `2026-06-08T06:${String(index * 2).padStart(2, '0')}:00.000Z`,
        action: 'wait',
        reason: 'adventure-active',
        spirit: 88,
        maxSpirit: 2758,
        isMeditating: false,
        adventureActive: true,
        adventureId: 456
    }));
    const now = Date.parse('2026-06-08T06:10:00.000Z');

    const diagnosis = toPlain(hooks.buildAfkWaitingDiagnosis(history, {
        tickInterval: 30000,
        stallTimeoutSeconds: 90
    }, now));

    assert.deepEqual(diagnosis, {
        schema: 'lingverse-afk-wait-diagnosis/v1',
        active: true,
        severity: 'warning',
        category: 'manual-action',
        action: 'wait',
        reason: 'adventure-active',
        label: '奇遇链等待处理',
        repeatCount: 5,
        elapsedSeconds: 600,
        firstAt: '2026-06-08T06:00:00.000Z',
        lastAt: '2026-06-08T06:08:00.000Z',
        likelyCause: '',
        message: '奇遇链等待处理已持续10分钟（连续5次），需要手动处理或配置自动策略',
        suggestion: '处理当前奇遇，或在摘要回放里导入奇遇策略后再启动挂机'
    });

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        spirit: 88,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: true,
        isDead: false,
        isMeditating: false,
        adventureActive: true,
        adventureId: 456
    }, {
        enabled: true,
        meditationMinutes: 140,
        minSpirit: 20,
        tickInterval: 30000,
        stallTimeoutSeconds: 90,
        adventureMode: 'pause'
    }, {
        action: 'wait',
        reason: 'adventure-active'
    }, {
        capturedAt: '2026-06-08T06:10:00.000Z',
        now,
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        decisionHistory: history
    })));

    assert.deepEqual(summary.automation.waitDiagnosis, Object.assign({}, diagnosis, {
        likelyCause: '奇遇#456未配置自动策略'
    }));

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('诊断: 奇遇链等待处理已持续10分钟（连续5次），需要手动处理或配置自动策略'), true);
    assert.equal(report.lines.includes('诊断归因: 奇遇#456未配置自动策略'), true);
});

test('buildAfkWaitingDiagnosis explains repeated encounter stalls from automation attempts', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const history = Array.from({ length: 5 }, (_, index) => ({
        at: `2026-06-08T10:${String(index * 2).padStart(2, '0')}:00.000Z`,
        action: 'handleEncounter',
        reason: 'encounter-auto-fight-enabled',
        spirit: 120,
        maxSpirit: 2758,
        isMeditating: false,
        encounterActive: true
    }));
    const now = Date.parse('2026-06-08T10:10:00.000Z');

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        spirit: 120,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: true,
        isDead: false,
        isMeditating: false,
        encounterActive: true,
        encounterMonsterId: 'port_bandit',
        encounterMonsterStage: 3,
        encounterMonsterLevel: 7
    }, {
        enabled: true,
        meditationMinutes: 140,
        minSpirit: 20,
        tickInterval: 30000,
        stallTimeoutSeconds: 90,
        autoFight: true,
        useTalismans: true
    }, {
        action: 'handleEncounter',
        reason: 'encounter-auto-fight-enabled'
    }, {
        capturedAt: '2026-06-08T10:10:00.000Z',
        now,
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        decisionHistory: history,
        talismanAttempt: {
            shouldAttempt: true,
            reason: 'completed',
            encounterKey: 'monster:port_bandit:3:7',
            markEncounterKey: 'monster:port_bandit:3:7',
            selectedTalismans: [
                { itemId: 8, templateId: 'talisman_ancient_4', name: '史诗荒古符箓', family: 'ancient', rarity: 4, quantity: 1 }
            ],
            usedKinds: 1,
            failedKinds: 0,
            dialogClosed: false,
            dialogCloseSource: 'dom',
            dialogCloseFailureMessage: 'close failed token=talisman-dialog-secret'
        }
    })));

    assert.equal(summary.automation.waitDiagnosis.active, true);
    assert.equal(summary.automation.waitDiagnosis.category, 'auto-action');
    assert.equal(summary.automation.waitDiagnosis.likelyCause, '符箓面板未关闭 · close failed token=<redacted>');

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('诊断归因: 符箓面板未关闭 · close failed token=<redacted>'), true);
});

test('buildAfkWaitingDiagnosis explains guardian already-attempted stalls without retrying hire', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const history = Array.from({ length: 5 }, (_, index) => ({
        at: `2026-06-08T12:${String(index * 2).padStart(2, '0')}:00.000Z`,
        action: 'handleEncounter',
        reason: 'encounter-auto-guardian-enabled',
        spirit: 90,
        maxSpirit: 2758,
        isMeditating: false,
        encounterActive: true
    }));
    const now = Date.parse('2026-06-08T12:10:00.000Z');

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        spirit: 90,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: true,
        isDead: false,
        isMeditating: false,
        encounterActive: true,
        encounterMonsterId: 'low_level_beast',
        encounterMonsterStage: 1,
        encounterMonsterLevel: 3
    }, {
        enabled: true,
        meditationMinutes: 140,
        minSpirit: 20,
        tickInterval: 30000,
        stallTimeoutSeconds: 90,
        autoHireGuardian: true,
        autoFight: false
    }, {
        action: 'handleEncounter',
        reason: 'encounter-auto-guardian-enabled'
    }, {
        capturedAt: '2026-06-08T12:10:00.000Z',
        now,
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        decisionHistory: history,
        guardianConfig: {
            enabled: true,
            mode: 'alone',
            maxFee: 51,
            minAtk: 0,
            priority: ['normal', 'incarnation', 'body'],
            threatLevel: 'danger'
        },
        guardianAttempt: {
            shouldAttempt: false,
            reason: 'guardian-already-attempted',
            encounterKey: 'monster:low_level_beast:1:3',
            guardian: {
                enabled: true,
                mode: 'alone',
                maxFee: 51,
                minAtk: 0,
                priority: ['normal', 'incarnation', 'body'],
                threatLevel: 'danger'
            }
        }
    })));

    assert.equal(summary.automation.waitDiagnosis.active, true);
    assert.equal(summary.automation.waitDiagnosis.category, 'auto-action');
    assert.equal(summary.automation.waitDiagnosis.suggestion, '自动护道已尝试但遭遇仍在，确认护道结算或手动处理当前遭遇，并复制摘要');
    assert.equal(summary.automation.waitDiagnosis.likelyCause, '本遭遇已尝试自动护道，避免重复扣费');

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('诊断: 已开启遭遇前自动护道已持续10分钟（连续5次），建议复制摘要定位'), true);
    assert.equal(report.lines.includes('诊断归因: 本遭遇已尝试自动护道，避免重复扣费'), true);
});

test('buildAfkWaitingDiagnosis explains repeated adventure auto-choice stalls', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const history = Array.from({ length: 5 }, (_, index) => ({
        at: `2026-06-08T13:${String(index * 2).padStart(2, '0')}:00.000Z`,
        action: 'handleAdventure',
        reason: 'adventure-strategy-choice',
        spirit: 240,
        maxSpirit: 2758,
        isMeditating: false,
        adventureActive: true,
        adventureId: 456
    }));
    const now = Date.parse('2026-06-08T13:10:00.000Z');

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        spirit: 240,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: true,
        isDead: false,
        isMeditating: false,
        adventureActive: true,
        adventureId: 456,
        adventureStep: 1,
        adventureTotalSteps: 3,
        adventureChoices: ['入谷探查', '绕路离开']
    }, {
        enabled: true,
        meditationMinutes: 140,
        minSpirit: 20,
        tickInterval: 30000,
        stallTimeoutSeconds: 90,
        adventureMode: 'strategy',
        adventureChoiceMap: { 456: 2 }
    }, {
        action: 'handleAdventure',
        reason: 'adventure-strategy-choice'
    }, {
        capturedAt: '2026-06-08T13:10:00.000Z',
        now,
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        decisionHistory: history
    })));

    assert.equal(summary.automation.waitDiagnosis.active, true);
    assert.equal(summary.automation.waitDiagnosis.category, 'auto-action');
    assert.equal(summary.automation.waitDiagnosis.suggestion, '奇遇自动选择重复未前进，检查当前奇遇选项/策略是否匹配，必要时手动处理并复制摘要');
    assert.equal(summary.automation.waitDiagnosis.likelyCause, '奇遇#456 自动选择第2项「绕路离开」后仍未前进');

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('诊断: 奇遇链按ID策略选择已持续10分钟（连续5次），建议复制摘要定位'), true);
    assert.equal(report.lines.includes('诊断归因: 奇遇#456 自动选择第2项「绕路离开」后仍未前进'), true);
});

test('buildAfkStatusReport surfaces adventure auto-choice attempts', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        spirit: 300,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: true,
        isDead: false,
        isMeditating: false,
        adventureActive: true,
        adventureId: 456,
        adventureStep: 1,
        adventureTotalSteps: 3,
        adventureChoices: ['入谷探查', '绕路离开']
    }, {
        enabled: true,
        meditationMinutes: 140,
        minSpirit: 20,
        adventureMode: 'strategy',
        adventureChoiceMap: { 456: 2 }
    }, {
        action: 'handleAdventure',
        reason: 'adventure-strategy-choice'
    }, {
        capturedAt: '2026-06-08T13:11:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        adventureAttempt: {
            shouldAttempt: true,
            reason: 'choice-failed',
            source: 'choice-button',
            adventureId: 456,
            choiceIndex: 2,
            choiceText: '绕路离开',
            failureMessage: 'choice failed token=secret'
        }
    })));

    assert.equal(summary.automation.adventureAttempt.reason, 'choice-failed');
    assert.equal(summary.automation.adventureAttempt.source, 'choice-button');
    assert.equal(summary.automation.adventureAttempt.adventureId, '456');
    assert.equal(summary.automation.adventureAttempt.choiceIndex, 2);
    assert.equal(summary.automation.adventureAttempt.choiceText, '绕路离开');
    assert.equal(summary.automation.adventureAttempt.failureMessage, 'choice failed token=<redacted>');

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('奇遇动作: 自动选择失败 · #456 · 第2项「绕路离开」 · 选项按钮 · choice failed token=<redacted>'), true);
    assert.equal(report.lines.includes('奇遇建议: 自动选择失败 · 检查当前奇遇选项/策略是否匹配，必要时手动处理或复制摘要'), true);
});

test('buildAfkWaitingDiagnosis explains repeated player encounter auto-decline stalls', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const history = Array.from({ length: 5 }, (_, index) => ({
        at: `2026-06-08T14:${String(index * 2).padStart(2, '0')}:00.000Z`,
        action: 'handlePlayerEncounter',
        reason: 'player-encounter-auto-decline',
        spirit: 300,
        maxSpirit: 2758,
        isMeditating: false,
        playerEncounterActive: true
    }));
    const now = Date.parse('2026-06-08T14:10:00.000Z');

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        spirit: 300,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: true,
        isDead: false,
        isMeditating: false,
        playerEncounterActive: true
    }, {
        enabled: true,
        meditationMinutes: 140,
        minSpirit: 20,
        tickInterval: 30000,
        stallTimeoutSeconds: 90,
        autoDeclinePlayerEncounter: true
    }, {
        action: 'handlePlayerEncounter',
        reason: 'player-encounter-auto-decline'
    }, {
        capturedAt: '2026-06-08T14:10:00.000Z',
        now,
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        decisionHistory: history
    })));

    assert.equal(summary.automation.waitDiagnosis.active, true);
    assert.equal(summary.automation.waitDiagnosis.category, 'auto-action');
    assert.equal(summary.automation.waitDiagnosis.suggestion, '陌生道友自动婉拒重复未前进，检查邂逅弹窗/按钮，必要时手动处理并复制摘要');
    assert.equal(summary.automation.waitDiagnosis.likelyCause, '陌生道友自动婉拒后仍未关闭');

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('诊断: 自动婉拒陌生道友已持续10分钟（连续5次），建议复制摘要定位'), true);
    assert.equal(report.lines.includes('诊断归因: 陌生道友自动婉拒后仍未关闭'), true);
});

test('buildAfkStatusReport surfaces player encounter auto-decline attempts', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        spirit: 300,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: true,
        isDead: false,
        isMeditating: false,
        playerEncounterActive: true
    }, {
        enabled: true,
        meditationMinutes: 140,
        minSpirit: 20,
        autoDeclinePlayerEncounter: true
    }, {
        action: 'handlePlayerEncounter',
        reason: 'player-encounter-auto-decline'
    }, {
        capturedAt: '2026-06-08T14:11:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        playerEncounterAttempt: {
            shouldAttempt: true,
            reason: 'decline-failed',
            source: 'pvp-dismiss',
            failureMessage: 'dismiss failed token=secret'
        }
    })));

    assert.equal(summary.automation.playerEncounter.reason, 'decline-failed');
    assert.equal(summary.automation.playerEncounter.source, 'pvp-dismiss');
    assert.equal(summary.automation.playerEncounter.failureMessage, 'dismiss failed token=<redacted>');

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('陌生道友: 自动婉拒失败 · 邂逅卡关闭 · dismiss failed token=<redacted>'), true);
    assert.equal(report.lines.includes('陌生道友建议: 自动婉拒失败 · 检查邂逅弹窗/按钮，必要时手动处理或复制摘要'), true);
});

test('buildAfkWaitingDiagnosis explains repeated post-interaction resume failures', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const history = Array.from({ length: 5 }, (_, index) => ({
        at: `2026-06-08T11:${String(index * 2).padStart(2, '0')}:00.000Z`,
        action: 'startAutoExplore',
        reason: 'post-interaction-ready',
        spirit: 180,
        maxSpirit: 2758,
        isMeditating: false,
        postInteractionResume: true
    }));
    const now = Date.parse('2026-06-08T11:10:00.000Z');

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        postInteractionResume: true,
        postInteractionResumeRemainingSeconds: 0,
        spirit: 180,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: true,
        isDead: false,
        isMeditating: false
    }, {
        enabled: true,
        meditationMinutes: 140,
        minSpirit: 20,
        exploreMultiplier: 50,
        tickInterval: 30000,
        stallTimeoutSeconds: 90,
        resumeWindowSeconds: 60
    }, {
        action: 'startAutoExplore',
        reason: 'post-interaction-ready'
    }, {
        capturedAt: '2026-06-08T11:10:00.000Z',
        now,
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' },
        decisionHistory: history,
        exploreStartAttempt: {
            shouldAttempt: true,
            reason: 'start-failed',
            multiplier: 50,
            source: 'toggle',
            failureMessage: 'resume toggle failed token=resume-secret'
        }
    })));

    assert.equal(summary.automation.waitDiagnosis.active, true);
    assert.equal(summary.automation.waitDiagnosis.category, 'auto-action');
    assert.equal(summary.automation.waitDiagnosis.suggestion, '恢复窗口重复尝试启动探索失败，检查自动探索入口/倍率控件，必要时手动点一次自动探索并复制摘要');
    assert.equal(summary.automation.waitDiagnosis.likelyCause, '事件恢复后未能重启探索 · 自动探索启动失败 · resume toggle failed token=<redacted>');

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('诊断: 事件/战斗后神识可探索已持续10分钟（连续5次），建议复制摘要定位'), true);
    assert.equal(report.lines.includes('诊断归因: 事件恢复后未能重启探索 · 自动探索启动失败 · resume toggle failed token=<redacted>'), true);
});

test('buildAfkStatusReport includes game update blockers from snapshots', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const state = {
        gameUpdateNoticeActive: true,
        spirit: 120,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: true,
        isDead: false,
        isMeditating: false
    };
    const config = {
        enabled: true,
        meditationMinutes: 140,
        minSpirit: 20,
        autoReloadOnUpdate: false
    };
    const decision = hooks.decideAfkNextAction(state, config, 1_000_000);
    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot(state, config, decision, {
        capturedAt: '2026-06-08T07:00:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' }
    })));

    assert.equal(summary.blockers.gameUpdateNoticeActive, true);
    assert.deepEqual(summary.decision, {
        action: 'wait',
        reason: 'game-update-available'
    });

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.headline, '挂机状态 · 等待 · 游戏有更新，等待刷新');
    assert.equal(report.lines.includes('阻塞: 游戏更新'), true);
    assert.equal(report.lines.includes('环境: helper 2.77.0 · 游戏更新提示，先刷新页面/重载扩展'), true);
});

test('buildAfkStatusReport explains immortal prison hard stops immediately', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    const summary = toPlain(hooks.buildAfkDebugSummary(hooks.buildAfkDebugSnapshot({
        spirit: 300,
        maxSpirit: 2758,
        spiritCost: 4,
        canExplore: true,
        isDead: false,
        isMeditating: false,
        immortalPrisonActive: true
    }, {
        enabled: true,
        meditationMinutes: 140,
        minSpirit: 20
    }, {
        action: 'wait',
        reason: 'immortal-prison'
    }, {
        capturedAt: '2026-06-08T15:00:00.000Z',
        page: { title: '灵界 LingVerse - 修仙世界', url: 'https://ling.muge.info/game.html' }
    })));

    assert.equal(summary.blockers.immortalPrisonActive, true);

    const report = hooks.buildAfkStatusReport(summary);
    assert.equal(report.lines.includes('硬停: 混天典狱 · 脚本暂停自动探索'), true);
    assert.equal(report.lines.includes('硬停建议: 混天典狱需要手动处理 · 脚本不会自动跳过、自动点击或消耗资源'), true);
});

test('buildAfkRiskStatus summarizes high-risk AFK switches', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.equal(typeof hooks.buildAfkRiskStatus, 'function');

    assert.deepEqual(toPlain(hooks.buildAfkRiskStatus({
        exploreMultiplier: 1,
        autoFight: false,
        autoHireGuardian: true,
        autoRevive: false,
        useTalismans: false,
        talismanMaxKinds: 5,
        talismanQuantity: 1,
        talismanFamilyOrder: '',
        useNirvanaPill: false,
        nirvanaMinRarity: 4,
        queueNirvanaPill: false,
        autoDeclinePlayerEncounter: false,
        adventureMode: 'pause',
        adventureChoiceMap: {}
    }, {
        enabled: true,
        mode: 'alone',
        maxFee: 51,
        minAtk: 0,
        priority: ['normal', 'incarnation', 'body']
    })), {
        schema: 'lingverse-afk-risk-status/v1',
        profileText: '稳妥护道模式',
        enabledRiskCount: 1,
        totalRiskCount: 7,
        warningCount: 0,
        summaryText: '稳妥护道模式 · 风险开关 1/7 · 警告 0',
        itemTexts: [
            '自动迎战: 关闭',
            '自动护道: 开启 · 游戏护道开 · 独立作战 · 最高51 · normal>incarnation>body',
            '自动复活: 关闭',
            '战斗用符: 关闭',
            '涅槃重生丹: 关闭',
            '陌生道友婉拒: 关闭',
            '奇遇自动选择: 关闭'
        ],
        warnings: []
    });

    assert.deepEqual(toPlain(hooks.buildAfkRiskStatus({
        exploreMultiplier: 50,
        autoFight: true,
        autoHireGuardian: false,
        autoRevive: true,
        useTalismans: true,
        talismanMaxKinds: 5,
        talismanQuantity: 1,
        talismanFamilyOrder: 'ghost,fire',
        useNirvanaPill: true,
        nirvanaMinRarity: 4,
        queueNirvanaPill: false,
        autoDeclinePlayerEncounter: true,
        adventureMode: 'strategy',
        adventureChoiceMap: {}
    }, {
        enabled: false
    })), {
        schema: 'lingverse-afk-risk-status/v1',
        profileText: '富裕战斗模式',
        enabledRiskCount: 6,
        totalRiskCount: 7,
        warningCount: 1,
        summaryText: '富裕战斗模式 · 风险开关 6/7 · 警告 1',
        itemTexts: [
            '自动迎战: 开启 · 50倍探索',
            '自动护道: 关闭',
            '自动复活: 开启 · 不限',
            '战斗用符: 开启 · 5种×1 · ghost>fire · 不限',
            '涅槃重生丹: 开启 · 史诗+ · 不排队 · 不限',
            '陌生道友婉拒: 开启',
            '奇遇自动选择: 开启 · strategy'
        ],
        warnings: [
            '奇遇策略模式已开启，但策略表为空'
        ]
    });
});

test('AFK config packs export normalized settings and import safely', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.equal(typeof hooks.buildAfkConfigPack, 'function');
    assert.equal(typeof hooks.resolveAfkConfigPackImport, 'function');

    const pack = hooks.buildAfkConfigPack({
        enabled: true,
        meditationMinutes: 90,
        minSpirit: 18,
        exploreMultiplier: 50,
        tickInterval: 45000,
        stallTimeoutSeconds: 120,
        resumeWindowSeconds: 90,
        autoFight: true,
        autoHireGuardian: true,
        autoRevive: true,
        useTalismans: true,
        talismanMaxKinds: 3,
        talismanQuantity: 2,
        talismanFamilyOrder: 'ghost,fire',
        useNirvanaPill: true,
        nirvanaMinRarity: 4,
        queueNirvanaPill: false,
        autoDeclinePlayerEncounter: true,
        adventureMode: 'strategy',
        adventureChoiceMap: '456=2\n789=1'
    }, {
        enabled: true,
        mode: 'alone',
        maxFee: 51,
        minAtk: 0,
        priority: ['normal', 'incarnation', 'body'],
        threatLevel: 'danger'
    }, {
        createdAt: '2026-06-08T04:00:00.000Z',
        label: '富裕小号测试?token=secret'
    });

    assert.deepEqual(toPlain(pack), {
        schema: 'lingverse-afk-config-pack/v1',
        scriptVersion: '2.77.0',
        createdAt: '2026-06-08T04:00:00.000Z',
        label: '富裕小号测试',
        afkLoop: {
            enabled: true,
            meditationMinutes: 90,
            minSpirit: 18,
            exploreMultiplier: 50,
            tickInterval: 45000,
            stallTimeoutSeconds: 120,
            resumeWindowSeconds: 90,
            autoRevive: true,
            reviveMaxPerRun: 0,
            autoFight: true,
            autoHireGuardian: true,
            useTalismans: true,
            talismanMaxKinds: 3,
            talismanQuantity: 2,
            talismanFamilyOrder: 'ghost,fire',
            talismanMaxEncountersPerRun: 0,
            useNirvanaPill: true,
            nirvanaMinRarity: 4,
            nirvanaMaxPerRun: 0,
            queueNirvanaPill: false,
            autoDeclinePlayerEncounter: true,
            autoReloadOnUpdate: false,
            adventureMode: 'strategy',
            adventureChoiceIndex: 1,
            adventureChoiceMap: { 456: 2, 789: 1 }
        },
        guardian: {
            enabled: true,
            maxFee: 51,
            minAtk: 0,
            mode: 'alone',
            priority: ['normal', 'incarnation', 'body'],
            priorityKey: 'normal,incarnation,body',
            threatLevel: 'danger'
        },
        riskStatus: {
            schema: 'lingverse-afk-risk-status/v1',
            profileText: '富裕战斗模式',
            enabledRiskCount: 7,
            totalRiskCount: 7,
            warningCount: 0,
            summaryText: '富裕战斗模式 · 风险开关 7/7 · 警告 0',
            itemTexts: [
                '自动迎战: 开启 · 50倍探索',
                '自动护道: 开启 · 游戏护道开 · 独立作战 · 最高51 · normal>incarnation>body',
                '自动复活: 开启 · 不限',
                '战斗用符: 开启 · 3种×2 · ghost>fire · 不限',
                '涅槃重生丹: 开启 · 史诗+ · 不排队 · 不限',
                '陌生道友婉拒: 开启',
                '奇遇自动选择: 开启 · strategy'
            ],
            warnings: []
        }
    });

    const imported = toPlain(hooks.resolveAfkConfigPackImport(JSON.stringify(pack)));
    assert.equal(imported.schema, 'lingverse-afk-config-import/v1');
    assert.equal(imported.sourceSchema, 'lingverse-afk-config-pack/v1');
    assert.equal(imported.afkLoop.enabled, false);
    assert.deepEqual(imported.guardian.priority, ['normal', 'incarnation', 'body']);
    assert.deepEqual(imported.importWarnings, ['导入时已关闭挂机启动状态']);
    assert.equal(imported.riskStatus.enabledRiskCount, 7);
});

test('mergeAdventureStrategyImport adds replay hints without enabling AFK', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.equal(typeof hooks.mergeAdventureStrategyImport, 'function');

    const merged = hooks.mergeAdventureStrategyImport({
        enabled: true,
        adventureMode: 'pause',
        adventureChoiceMap: { 111: 1, 456: 1 }
    }, {
        schema: 'lingverse-afk-issue-replay/v1',
        strategyImportText: '456=2\n789=1\ninvalid=x'
    });

    assert.deepEqual(toPlain(merged), {
        schema: 'lingverse-afk-adventure-strategy-import/v1',
        afkLoop: {
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
            adventureMode: 'strategy',
            adventureChoiceIndex: 1,
            adventureChoiceMap: { 111: 1, 456: 2, 789: 1 }
        },
        importedCount: 2,
        overwrittenCount: 1,
        importLines: ['456=2', '789=1'],
        warnings: ['导入策略时已关闭挂机启动状态']
    });

    const fromSummary = hooks.mergeAdventureStrategyImport({}, {
        schema: 'lingverse-afk-debug-summary/v1',
        adventure: {
            strategyHints: [
                { mapLine: '999=3' }
            ]
        }
    });
    assert.deepEqual(toPlain(fromSummary.afkLoop.adventureChoiceMap), { 999: 3 });
});

test('AFK resource budgets cap rich-mode consumables per run', () => {
    const sandbox = loadUserScript();
    const hooks = sandbox.LingVerseAutoMapTestHooks;

    assert.equal(typeof hooks.resolveAfkResourceBudget, 'function');

    const normalized = hooks.normalizeAfkLoopConfig({
        reviveMaxPerRun: '2',
        talismanMaxEncountersPerRun: '3',
        nirvanaMaxPerRun: '1'
    });
    assert.equal(normalized.reviveMaxPerRun, 2);
    assert.equal(normalized.talismanMaxEncountersPerRun, 3);
    assert.equal(normalized.nirvanaMaxPerRun, 1);

    const reviveBudget = hooks.resolveAfkResourceBudget('revive', normalized, {
        revive: 2,
        talismanEncounters: 1,
        nirvanaPills: 0
    });
    assert.deepEqual(toPlain(reviveBudget), {
        schema: 'lingverse-afk-resource-budget/v1',
        kind: 'revive',
        used: 2,
        maxPerRun: 2,
        limited: true,
        remaining: 0,
        allowed: false,
        reason: 'budget-exhausted'
    });

    assert.deepEqual(toPlain(hooks.decideAfkNextAction({
        isDead: true,
        resourceUsage: { revive: 1 }
    }, {
        enabled: true,
        autoRevive: true,
        reviveMaxPerRun: 1
    }, 1_000_000)), {
        action: 'wait',
        reason: 'revive-budget-exhausted'
    });

    const rich = hooks.applyAfkPreset({}, 'rich');
    assert.equal(rich.reviveMaxPerRun, 1);
    assert.equal(rich.talismanMaxEncountersPerRun, 3);
    assert.equal(rich.nirvanaMaxPerRun, 1);

    const items = [
        { id: 1, templateId: 'pill_nirvana_4', name: '史诗九转还魂丹', type: 'pill', rarity: 4, quantity: 1 }
    ];
    assert.deepEqual(toPlain(hooks.resolveNirvanaRebirthPillAttempt({}, items, {
        useNirvanaPill: true,
        nirvanaMinRarity: 4,
        nirvanaMaxPerRun: 1
    }, 1_000_000, {
        nirvanaPills: 1
    })), {
        shouldUse: false,
        reason: 'budget-exhausted',
        pill: null,
        minRarity: 4,
        activeBuffGrade: null,
        activeBuffExpire: null,
        budget: {
            schema: 'lingverse-afk-resource-budget/v1',
            kind: 'nirvanaPills',
            used: 1,
            maxPerRun: 1,
            limited: true,
            remaining: 0,
            allowed: false,
            reason: 'budget-exhausted'
        }
    });
});
