function toDate(s) {
    return Date.parse(s) ? new Date(s).toJSON().replace(/T|\.\d+Z$/g, ' ').trim() : s;
}

function getHeader(name, headers) {
    var ret = {};

    headers.some(function(header, index) {
        if (header.name.toLowerCase() == name.toLowerCase()) {
            ret = {
                index: index,
                value: header.value.toLowerCase()
            };
            return true;
        }
    });

    return ret;
}

function processResponseHeaders(headers, url) {
    var rules = {
        'css': /\.css(?:[\?#]|$)/i,
        'js': /\.js(?:[\?#]|$)/i,
        'markdown': /\.(md|markdown)(?:[\?#]|$)/i,
        'json': /\.(json|do)(?:[\?#]|$)/i,
        'jsonp': /[\?&](callback|jsonpcallback)=/i,
        '': /$^/
    };
    var mineTypes = [
        'text/css',
        'text/javascript',
        'application/javascript',
        'application/x-javascript',
        'application/json'
    ];

    var type;
    var contentType = getHeader('content-type', headers).value || '';

    for (type in rules) {
        var reg = rules[type];

        if (reg.test(url)) {
            break;
        }
    }

    var isProperType = mineTypes.some(function(mineType) {
        if (type == 'markdown') {
            return true;
        }

        if (contentType.indexOf(mineType) !== -1) {
            return true;
        }
    });

    if (!type || !isProperType) {
        type = false;
    }

    headers = headers.map(function(header) {
        var name = header.name;
        var value = header.value;

        switch (name.toLowerCase()) {
            case 'content-length':
                value = (parseInt(value, 10) / 1024).toFixed(1) + 'K';
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

    return {
        type: type,
        headers: headers
    };
}

function setOptions(options, keep) {
    chrome.storage.sync.set(options);
    chrome.contextMenus.removeAll();

    if (options.enabled) {
        chrome.browserAction.setIcon({
            path: {
                "19": "icon/icon_48.png",
                "38": "icon/icon_128.png"
            }
        });

        // enable html pretty
        if (~options.formatTypes.indexOf('html')) {
            chrome.contextMenus.create({
                id: 'PrettyPageSource',
                type: 'normal',
                title: 'Pretty Page Source',
                contexts: ['page']
            });
        }
    } else {
        chrome.browserAction.setIcon({
            path: {
                "19": "icon/icon_disabled.png",
                "38": "icon/icon_disabled.png"
            }
        });
    }

    if (!keep) {
        chrome.tabs.reload({
            bypassCache: true
        });
    }
}

chrome.contextMenus.onClicked.addListener(function (info, tab) {
    var tabId = tab.id;

    chrome.tabs.sendMessage(tabId, {
        action: 'prettyDocument'
    });
});

chrome.storage.sync.get(function(options) {
    if (!options || Object.keys(options).length !== 9) {
        options = {
            enabled: true,
            theme: 'dabblet',
            fontSize: '14px',
            indent: 4,
            customCSS: '',
            headers: true,
            unicode: true,
            bugFree: false,
            formatTypes: ['js', 'css', 'markdown']
        };
    }

    setOptions(options, true);
});

var cacheHeaders = {};
// cache response headers & fix github csp
chrome.webRequest.onHeadersReceived.addListener(function(request) {
    var url = request.url;
    var tabId = request.tabId;
    var headers = request.responseHeaders;

    chrome.tabs.get(tabId, function (tab) {
        console.log('onHeadersReceived', Date.now());
        if (tab.url.indexOf('view-source') != 0) {
            cacheHeaders[tabId] = processResponseHeaders(headers, url);
        }
    });

    if (~url.indexOf('.githubusercontent.com')) {
        var cspHeader = getHeader('content-security-policy', headers);

        if (cspHeader.value) {
            headers.splice(cspHeader.index, 1);
            return {
                responseHeaders: headers
            };
        }
    }
}, {
    urls: ['<all_urls>'],
    types: ['main_frame']
}, ['blocking', 'responseHeaders']);

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    var url = sender.url;
    var tabId = sender.tab.id;
    var action = request.action;

    if (action == 'requestHeaders') {
        console.log('requestHeaders', Date.now());
        if (url.slice(0, 4) == 'file') {
            sendResponse(processResponseHeaders([], url));
        } else {
            sendResponse(cacheHeaders[tabId]);
            delete cacheHeaders[tabId];
        }
    }

    if (action == 'prettify') {
        var worker = new Worker('worker.js');

        worker.onerror = function() {
            sendResponse();
            worker.terminate();
        };
        worker.onmessage = function(event) {
            sendResponse(event.data);
            worker.terminate();
        };

        request.url = url;
        request.language = navigator.language;

        worker.postMessage(request);
    }

    return true;
});
