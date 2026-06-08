(function () {
    'use strict';

    const root = document.documentElement;
    const manifest = chrome.runtime && typeof chrome.runtime.getManifest === 'function'
        ? chrome.runtime.getManifest()
        : {};
    const extensionVersion = String(manifest && manifest.version || '');
    if (
        root.dataset.lingverseAutoMapInjected === '1' &&
        root.dataset.lingverseAutoMapInjectedVersion &&
        root.dataset.lingverseAutoMapInjectedVersion === extensionVersion
    ) {
        return;
    }

    root.dataset.lingverseAutoMapInjected = '1';
    root.dataset.lingverseAutoMapInjectedVersion = extensionVersion;
    root.dataset.lingverseAutoMapExtensionVersion = extensionVersion;

    const script = document.createElement('script');
    const scriptUrl = chrome.runtime.getURL('lingverse-explore-helper.user.js');
    script.src = extensionVersion ? `${scriptUrl}?v=${encodeURIComponent(extensionVersion)}` : scriptUrl;
    script.onload = function () {
        script.remove();
    };
    script.onerror = function () {
        root.dataset.lingverseAutoMapInjected = '0';
        root.dataset.lingverseAutoMapInjectedVersion = '';
    };

    (document.head || document.documentElement).appendChild(script);
})();
