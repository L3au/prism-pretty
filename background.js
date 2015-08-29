function toDate(s) {
    return Date.parse(s) ? new Date(s).toJSON().replace(/T|\.\d+Z$/g, ' ').trim() : s;
}

function getHeader(name, headers) {
    var ret = {};

    headers.some(function (header, index) {
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
    var rules     = {
        'css'     : /\.css(?:[\?#]|$)/i,
        'js'      : /\.js(?:[\?#]|$)/i,
        'markdown': /\.(md|markdown)(?:[\?#]|$)/i,
        'json'    : /\.(json|do)(?:[\?#]|$)/i,
        'jsonp'   : /[\?&](callback|jsonpcallback)=/i,
        ''        : /$^/
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
        if (rules.hasOwnProperty(type)) {
            var reg = rules[type];

            if (reg.test(url)) {
                break;
            }
        }
    }

    var isProperType = mineTypes.some(function (mineType) {
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

chrome.contextMenus.onClicked.addListener(function (info, tab) {
    var tabId = tab.id;

    chrome.tabs.sendMessage(tabId, {
        action: 'prettyDocument'
    });
});

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
    var url     = request.url;
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

    cacheHeaders[url] = processResponseHeaders(headers, url);
}, {
    urls : ['<all_urls>'],
    types: ['main_frame']
}, ['responseHeaders']);

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    var url    = sender.url;
    var action = request.action;

    if (action == 'requestHeaders') {
        sendResponse(cacheHeaders[url] || processResponseHeaders([], url));
        console.log(cacheHeaders[url]);
        delete cacheHeaders[url];
    }
});

chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason == 'install' || details.reason == 'update') {
        chrome.tabs.create({
            url   : chrome.runtime.getURL('readme.html'),
            active: true
        });
    }
});
