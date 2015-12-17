function toDate(s) {
    return Date.parse(s) ? new Date(s).toJSON().replace(/T|\.\d+Z$/g, ' ').trim() : s;
}

function getHeader(name, headers) {
    var ret = '';

    headers.some(function (header) {
        if (header.name.toLowerCase() == name.toLowerCase()) {
            ret = header.value.toLowerCase();
            return true;
        }
    });

    return ret;
}

function parseUrl(href) {
    var url = {};
    try {
        url = new (window.URL || window.webkitURL)(href);
    } catch (e) {}

    return url;
}

function processResponseHeaders(headers, url) {
    var mineTypes = {
        'text/css'                : 'css',
        'text/javascript'         : 'js',
        'application/javascript'  : 'js',
        'application/x-javascript': 'js',
        'application/json'        : 'json'
    };

    var type;
    var contentType = getHeader('content-type', headers);

    for (var mineType in mineTypes) {
        if (mineTypes.hasOwnProperty(mineType)) {
            if (contentType.indexOf(mineType) != -1) {
                type = mineTypes[mineType];
                break;
            }
        }
    }

    url = parseUrl(url);

    if (/\.(md|markdown)(?:[\?#]|$)/i.test(url.pathname) &&
        (url.protocol == 'file:' ||
        contentType.match(/(plain|markdown)/))) {
        type = 'markdown';
    }

    headers = headers.map(function (header) {
        var name  = header.name;
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
            name : name,
            value: value
        }
    });

    return {
        type   : type,
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
                id      : 'PrettyPageSource',
                type    : 'normal',
                title   : 'Pretty Page Source',
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
            bypassCache: false
        });
    }
}

// click right context menu
chrome.contextMenus.onClicked.addListener(function (info, tab) {
    var tabId = tab.id;

    chrome.tabs.sendMessage(tabId, {
        action: 'prettyDocument'
    });
});

// init options
chrome.storage.sync.get(function (options) {
    if (!options || Object.keys(options).length !== 9) {
        options = {
            enabled    : true,
            theme      : 'dabblet',
            fontSize   : '14px',
            indent     : 4,
            customCSS  : '',
            headers    : true,
            unicode    : true,
            bugFree    : false,
            formatTypes: ['js', 'css', 'markdown']
        };
    }

    setOptions(options, true);
});

// cache response headers
var cacheHeaders = {};
chrome.webRequest.onResponseStarted.addListener(function (request) {
    var url = request.url;

    // filter chrome protocol
    if (url.indexOf('chrome') == 0) {
        return;
    }

    var tabId   = request.tabId;
    var headers = request.responseHeaders;

    var ip     = request.ip;
    var status = request.statusLine;

    if (ip) {
        headers.splice(0, 0, {
            name : 'Status Line',
            value: status
        }, {
            name : 'Remote Address',
            value: ip
        });
    }

    cacheHeaders[tabId] = processResponseHeaders(headers, url);
}, {
    urls : ['<all_urls>'],
    types: ['main_frame']
}, ['responseHeaders']);

// message listener
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    var url    = sender.url;
    var action = request.action;

    // clean cache headers
    var tab = sender.tab || {};

    if (action == 'requestHeaders') {
        sendResponse(cacheHeaders[tab.id] || processResponseHeaders([], url));
    }

    try {
        delete cacheHeaders[tab.id];
    } catch (e) {}

    if (action == 'prettify') {
        var worker = new Worker('worker.js');

        worker.onerror   = function (e) {
            console.error(e);
            worker.terminate();
            worker = null;
            sendResponse();
        };
        worker.onmessage = function (e) {
            worker.terminate();
            worker = null;
            sendResponse(e.data);
        };

        request.url      = url;
        request.language = navigator.language;

        worker.postMessage(request);

        return true;
    }
});

// popup readme
chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason == 'install') {
        chrome.tabs.create({
            url   : 'https://raw.githubusercontent.com/L3au/Prism-Pretty/master/README.md',
            active: true
        });
    }
});
