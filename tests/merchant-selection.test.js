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
