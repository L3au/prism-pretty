function isEmpty(o) {
    return Object.keys(o).length == 0;
}

function toDate(s) {
    return Date.parse(s) ? new Date(s).toJSON().replace(/T|\.\d+Z$/g, ' ') : s;
}

function processResponseHeader(xhr, url) {
    var rules = {
        'css': /\.css(?:\?|$)/i,
        'js': /\.js(?:\?|$)/i,
        'json': /\.(json|do)(?:\?|$)/i,
        'jsonp': /&(callback|jsonpcallback)=/i,
        '': /$^/
    };
    var mineTypes = [
        'text/css',
        'text/javascript',
        'application/javascript',
        'application/x-javascript',
        'application/json'
    ];

    var contentType = xhr.getResponseHeader('Content-Type') || '';

    for (var type in rules) {
        var reg = rules[type];

        if (reg.test(url)) {
            break;
        }
    }

    var isProperType = mineTypes.some(function (mineType) {
        if (contentType.indexOf(mineType) !== -1) {
            return true;
        }
    });

    if (!type || !isProperType) {
        type = false;
    }

    var headers = xhr.getAllResponseHeaders();

    headers = headers.split('\n');

    if (headers.length > 1) {
        headers = headers.slice(0, -1).map(function (header) {
            var arr = header.split(': ');
            var name = arr[0];
            var value = arr[1];

            switch (name.toLowerCase()) {
                case 'content-length':
                    value = (Number(value) / 1000).toFixed(1) + 'K';
                    break;
                case 'date':
                case 'expires':
                case 'last-modified':
                    value = toDate(value);
                    break;
                default:
                    break;
            }

            return {
                name: name,
                value: value
            }
        });
    } else {
        headers = [];
    }

    return {
        type: type,
        headers: headers
    };
}

function setOptions(options) {
    chrome.storage.sync.set(options);
    chrome.contextMenus.removeAll();

    if (options.enabled) {
        chrome.browserAction.setIcon({
            path: {
                "19": "icon/icon_48.png",
                "38": "icon/icon_128.png"
            }
        });

        chrome.contextMenus.create({
            type: 'normal',
            title: 'Pretty Page Source',
            contexts: ['page'],
            onclick: function (info, tab) {
                var tabId = tab.id;

                chrome.tabs.sendMessage(tabId, {
                    action: 'pretty_document'
                });
            }
        });
    } else {
        chrome.browserAction.setIcon({
            path: {
                "19": "icon/icon_disabled.png",
                "38": "icon/icon_disabled.png"
            }
        });
    }

    chrome.tabs.reload({
        bypassCache: true
    });
}

chrome.storage.sync.get(function (options) {
    if (isEmpty(options)) {
        options = {
            enabled: true,
            theme: 'dabblet',
            fontSize: '14px',
            indent: 4,
            customCSS: '',
            bugFree: false,
            unicode: false,
            headers: true
        };

        chrome.storage.sync.set(options);
    }

    // reset contextMenus
    chrome.contextMenus.removeAll();

    if (!options.enabled) {
        chrome.browserAction.setIcon({
            path: {
                "19": "icon/icon_disabled.png",
                "38": "icon/icon_disabled.png"
            }
        });
    } else {
        chrome.contextMenus.create({
            type: 'normal',
            title: 'Pretty Page Source',
            contexts: ['page'],
            onclick: function (info, tab) {
                var tabId = tab.id;

                chrome.tabs.sendMessage(tabId, {
                    action: 'pretty_document'
                });
            }
        });
    }
});

// fix github csp
chrome.webRequest.onHeadersReceived.addListener(function (request) {
    var headers = request.responseHeaders;

    headers.some(function (header, index) {
        if (header.name.toLowerCase() == 'content-security-policy') {
            headers.splice(index, 1);
            return true;
        }
    });

    return {
        responseHeaders: headers
    };
}, {
    urls: ['*://*.githubusercontent.com/*'],
    types: ['main_frame']
}, ['blocking', 'responseHeaders']);

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    var url = sender.url;
    var action = request.action;

    if (action == 'requestHeader') {
        var xhr = new XMLHttpRequest();

        xhr.onreadystatechange = function () {
            if (xhr.readyState == 2) {
                sendResponse(processResponseHeader(xhr, url));
                xhr.abort();
            }
        };
        xhr.onerror = function () {
            sendResponse({
                error: true
            });
        };

        xhr.timeout = 3000;
        xhr.open('GET', url, true);
        xhr.send();
    }

    if (action == 'prettify') {
        var worker = new Worker('worker.js');

        worker.onerror = function (event) {
            worker.terminate();
            sendResponse();
        };
        worker.onmessage = function (event) {
            worker.terminate();
            sendResponse(event.data);
        };

        request.url = url;
        request.language = navigator.language;

        worker.postMessage(request);
    }

    return true;
});