function isEmpty(o) {
    return Object.keys(o).length == 0;
}

function toDate(s) {
    return Date.parse(s) ? new Date(s).toJSON().replace(/T|\.\d+Z$/g, ' ').trim() : s;
}

function processResponseHeader(contentType, headers, url) {
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

    headers = headers.split('\n').map(function(header) {
        var arr = header.split(':');
        var name = arr[0].trim();
        var value = arr.slice(1).join('').trim();

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

// fix github csp
// disabled in event pages
//chrome.webRequest.onHeadersReceived.addListener(function(request) {
//    var headers = request.responseHeaders;
//
//    headers.some(function(header, index) {
//        if (header.name.toLowerCase() == 'content-security-policy') {
//            headers.splice(index, 1);
//            return true;
//        }
//    });
//
//    return {
//        responseHeaders: headers
//    };
//}, {
//    urls: ['*://*.githubusercontent.com/*'],
//    types: ['main_frame']
//}, ['blocking', 'responseHeaders']);

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    var url = sender.url;
    var action = request.action;

    if (action == 'requestHeader') {
        var xhr = new XMLHttpRequest();

        xhr.onload = function() {
            var headers = xhr.getAllResponseHeaders().trim();
            var contentType = xhr.getResponseHeader('Content-Type') || '';

            sendResponse(processResponseHeader(contentType, headers, url));
        };
        xhr.onerror = function() {
            sendResponse({
                error: true
            });
        };

        xhr.timeout = 3000;
        xhr.open('HEAD', url, true);
        xhr.send();
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

        request.language = navigator.language;

        worker.postMessage(request);
    }

    return true;
});
