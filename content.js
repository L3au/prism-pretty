var rootEl;

function $(v, c) {
    return (c || document).querySelector(v);
}

function $$(v, c) {
    return [].slice.call((c || document).querySelectorAll(v));
}

function execScript(content) {
    var script = document.createElement('script');

    script.textContent = 'try{' + content + '}catch(e){}';

    document.head.appendChild(script);

    script.remove();
}

function detectCSS(content) {
    var type;
    var style = document.createElement('style');

    style.textContent = content;

    document.head.appendChild(style);

    if (style.sheet.rules.length) {
        type = 'css';
    }

    style.remove();

    return type;
}

function App() {
    this.init();
}

function deferInit() {
    var deferred = {};
    var promise = new Promise(function(resolve, reject) {
        deferred.resolve = resolve;
        deferred.reject  = reject;
    });
    deferred.promise = promise;
    return deferred;
}

App.prototype = {
    constructor: App,

    init: function () {
        var self = this;

        var defer = Promise.defer ?  Promise.defer() : deferInit();

        document.onreadystatechange = function () {
            if (document.readyState === 'interactive') {
                rootEl = document.documentElement;

                var content;
                var body     = document.body || {children: []};
                var children = body.children;
                var pre      = children[0];

                if (children.length == 0) {
                    content = body.textContent;
                }

                if (pre && pre.nodeName == 'PRE'
                    && pre.getAttribute('style')) {
                    content = pre.textContent;
                }

                if (!content || !content.trim()) {
                    defer.reject();

                    return chrome.runtime.sendMessage({
                        action: 'cleanHeaders'
                    });
                }

                defer.resolve(content);
            }
        };

        Promise.all([
            defer.promise,
            new Promise(function (resolve, reject) {
                chrome.storage.sync.get(function (options) {
                    self.options = options;

                    if (!options.enabled) {
                        return reject();
                    }

                    resolve(options);
                });
            }),
            new Promise(function (resolve) {
                chrome.runtime.sendMessage({
                    action: 'requestHeaders'
                }, function (headers) {
                    self.headers = headers;
                    resolve(headers);
                });
            })
        ]).then(function (result) {
            var content = result[0];
            var options = result[1];
            var headers = result[2];

            self.content = content;

            if (!self.parseContent()) {
                return;
            }

            if (headers.type == 'markdown') {
                options.theme = 'markdown';
            }

            self.sendPrettyMsg();
        }).catch(function (e) {
            // ignore promise exception
        });

        self.addEvents();
    },

    loading: function () {
        var options   = this.options;
        var classList = [
            'prism-pretty',
            'prism-pretty-spinner',
            'prism-pretty-' + options.theme
        ];

        classList.forEach(function (cls) {
            rootEl.classList.add(cls);
        });
    },

    unloading: function () {
        var options   = this.options;
        var classList = [
            'prism-pretty',
            'prism-pretty-spinner',
            'prism-pretty-' + options.theme
        ];

        classList.forEach(function (cls) {
            rootEl.classList.remove(cls);
        });
    },

    addEvents: function () {
        var self = this;

        chrome.storage.onChanged.addListener(function () {
            if (rootEl.classList.contains('prism-pretty')) {
                location.reload(true);
            }
        });

        chrome.runtime.onMessage.addListener(function (request) {
            var action = request.action;

            if (action == 'prettyDocument') {
                if (rootEl.classList.contains('prism-pretty')) {
                    location.reload(true);
                    return;
                }

                self.headers.type = 'html';

                // pretty html
                self.sendPrettyMsg();
            }
        });
    },

    parseContent: function () {
        var content = this.content;
        var options = this.options;
        var headers = this.headers;

        var type = headers.type;

        if (!type) {
            try {
                JSON.parse(content);
                type = 'json';
            } catch (e) {
                try {
                    // remove node shebang
                    new Function(content.replace(/^#!.*/, ''));

                    type = 'js';

                    if (/^\s*[\w\$]+\s*\(/i.test(content)) {
                        type = 'jsonp';
                    }
                } catch (e) {
                    type = detectCSS(content);
                }
            }
        }

        headers.type = type;

        if (!type) {
            return;
        }

        var tmpType = type;
        var types   = options.formatTypes;

        if (tmpType == 'json' || tmpType == 'jsonp') {
            tmpType = 'js';
        }

        // if type format is enabled
        if (!~types.indexOf(tmpType)) {
            return;
        }

        if (type == 'json' || type == 'jsonp') {
            var script = 'var json = ';

            if (type == 'json') {
                script += content;
            }

            if (type == 'jsonp') {
                script += '(' + content.replace(/\w+\(/, '');
            }

            script += ';console.log("%cvar json = ", "color:teal", json);';

            execScript(script);
        }

        return true;
    },

    sendPrettyMsg: function () {
        var self = this;

        var content = self.content;
        var options = self.options;
        var headers = self.headers;

        self.loading();

        chrome.runtime.sendMessage({
            action : 'prettify',
            content: content,
            options: options,
            type   : headers.type,
            headers: headers.headers
        }, function (response) {
            if (!response) {
                return self.unloading();
            }

            var title     = document.title;
            var className = 'prism-pretty';

            className += ' pretty-theme-' + options.theme;
            className += ' pretty-size-' + options.fontSize;

            var meta = '<meta name="viewport" content="width=device-width,initial-scale=1">';

            var fontSrc   = chrome.runtime.getURL('css/droid-sans-mono.woff2');
            var fontStyle = '@font-face{font-family:"Droid Sans Mono";src:url("fontSrc") format("woff2");}';

            fontStyle = '<style>' + fontStyle.replace('fontSrc', fontSrc) + '</style>';

            rootEl.innerHTML = '<head>' + meta + fontStyle + '</head><body>' + response + '</body>';
            rootEl.className = className;

            if (title) {
                document.title = 'Prism Pretty: ' + title;
            }

            // headers fade
            var headerEl = $('.request-headers');
            if (headerEl) {
                setTimeout(function () {
                    headerEl.style.opacity = 0;
                }, 3000);
            }

            // preview css
            var wrap;
            if (wrap = $('.preview-wrap')) {
                var script = $('script', wrap);

                if (script) {
                    execScript(script.textContent);
                    script.remove();
                }
            }

            // markdown hash restore
            if (headers.type === 'markdown') {
                var hash = location.hash.slice(1);

                if (!hash) {
                    return;
                }

                var anchors = $$('.anchor');
                var anchor;

                anchors.some(function (a) {
                    if (a.id == hash) {
                        anchor = a;
                        return true;
                    }
                });

                if (anchor) {
                    setTimeout(function () {
                        window.scrollTo(0, anchor.getBoundingClientRect().top - 10);
                    });
                }
            }
        });
    }
};

new App();
