(function () {
    'use strict';

    if (document.documentElement.dataset.lingverseAutoMapInjected === '1') return;
    document.documentElement.dataset.lingverseAutoMapInjected = '1';

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('lingverse-explore-helper.user.js');
    script.onload = function () {
        script.remove();
    };
    script.onerror = function () {
        document.documentElement.dataset.lingverseAutoMapInjected = '0';
    };

    (document.head || document.documentElement).appendChild(script);
})();
