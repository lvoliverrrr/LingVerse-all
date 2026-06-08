const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const loaderPath = path.join(__dirname, '..', 'lingverse-extension-loader.js');

function runLoader(overrides = {}) {
    const appended = [];
    const documentElement = overrides.documentElement || { dataset: {} };
    const sandbox = {
        document: {
            documentElement,
            head: {
                appendChild(node) {
                    appended.push(node);
                }
            },
            createElement(tagName) {
                return {
                    tagName,
                    dataset: {},
                    remove() {}
                };
            }
        },
        chrome: {
            runtime: {
                getManifest() {
                    return { version: '2.73.0' };
                },
                getURL(fileName) {
                    return `chrome-extension://lingverse/${fileName}`;
                }
            }
        }
    };
    vm.runInNewContext(fs.readFileSync(loaderPath, 'utf8'), sandbox, { filename: loaderPath });
    return { appended, documentElement };
}

test('extension loader exposes manifest version and cache-busts helper injection', () => {
    const result = runLoader();

    assert.equal(result.documentElement.dataset.lingverseAutoMapInjected, '1');
    assert.equal(result.documentElement.dataset.lingverseAutoMapInjectedVersion, '2.73.0');
    assert.equal(result.documentElement.dataset.lingverseAutoMapExtensionVersion, '2.73.0');
    assert.equal(result.appended.length, 1);
    assert.equal(result.appended[0].src, 'chrome-extension://lingverse/lingverse-explore-helper.user.js?v=2.73.0');
});

test('extension loader skips duplicate injection for the same extension version', () => {
    const documentElement = {
        dataset: {
            lingverseAutoMapInjected: '1',
            lingverseAutoMapInjectedVersion: '2.73.0'
        }
    };
    const result = runLoader({ documentElement });

    assert.equal(result.appended.length, 0);
    assert.equal(documentElement.dataset.lingverseAutoMapInjectedVersion, '2.73.0');
});
