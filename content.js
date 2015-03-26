(function () {
    var rootEl = document.documentElement;

    function $(v, c) {
        return (c || document).querySelector(v);
    }

    function $$(v, c) {
        return [].slice.call((c || document).querySelectorAll(v));
    }

    function addClass(className, el) {
        var classList = className.match(/\b[^\s]+\b/g) || [];

        classList.forEach(function (cls) {
            (el || rootEl).classList.add(cls);
        });
    }

    function removeClass(className, el) {
        var classList = className.match(/\b[^\s]+\b/g) || [];

        classList.forEach(function (cls) {
            (el || rootEl).classList.remove(cls);
        });
    }

    function loading() {
        var themeCls = 'prism-pretty-' + global_options.theme;
        addClass('prism-pretty prism-pretty-spinner ' + themeCls);
    }

    function unloading() {
        var themeCls = 'prism-pretty-' + global_options.theme;
        removeClass('prism-pretty prism-pretty-spinner ' + themeCls);
    }

    function execScript(content) {
        var script = document.createElement('script');

        script.textContent = 'try{' + content + '}catch(e){}';

        document.head.appendChild(script);
        script.remove(); script = null;
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
        style = null;

        return type;
    }

    function getEntireHtml() {
        var docType = new XMLSerializer().serializeToString(document.doctype);
        return docType + '\n' + rootEl.outerHTML;
    }

    var global_options, global_headers, global_style;
    var promises = [
        (function () {
            return new Promise(function (resolve, reject) {
                chrome.runtime.sendMessage({
                    action: 'requestHeaders'
                }, function (headers) {
                    if (!global_options.enabled) {
                        reject();
                        return;
                    }

                    global_headers = headers;
                    rootEl = document.documentElement;

                    if (headers.type == 'markdown') {
                        global_options.theme = 'markdown';
                    }

                    if (headers.type) {
                        loading();
                    }

                    resolve(headers);
                });
            });
        }),

        (function () {
            return new Promise(function (resolve) {
                if (/te/.test(document.readyState)) {
                    resolve();
                } else {
                    document.addEventListener('DOMContentLoaded', resolve);
                }
            });
        })
    ];

    var app = {
        init: function () {
            var self = this;

            chrome.storage.sync.get(function (options) {
                global_options = options;

                Promise.all(promises.map(function (p) {
                    return p();
                })).then(function () {
                    if (!self.prettifyContent()) {
                        unloading();
                    }
                });
            });

            chrome.storage.onChanged.addListener(function () {
                if (rootEl.classList.contains('prism-pretty')) {
                    location.reload();
                }
            });

            chrome.runtime.onMessage.addListener(function (request) {
                var action = request.action;

                if (action == 'prettyDocument') {
                    if (rootEl.classList.contains('prism-pretty')) {
                        location.reload();
                        return;
                    }

                    // pretty html
                    self.sendPrettyMsg('html', '');
                }
            });
        },

        loadFont: function () {
            var fontUrl = chrome.runtime.getURL('css/font.css');
            var srcUrl = chrome.runtime.getURL('css/droid-sans-mono.woff2');

            var xhr = new XMLHttpRequest();

            xhr.open('GET', fontUrl);
            xhr.onload = function () {
                global_style = '<style>';
                global_style += xhr.responseText.replace('srcUrl', srcUrl);
                global_style += '</style>';
            };

            xhr.send();
        },

        prettifyContent: function () {
            var content;
            var body = document.body;

            // fix somehow ...
            if (!body) {
                return;
            }

            var children = body.children;
            var pre = children[0];

            if (children.length == 0) {
                content = body.textContent.trim();
            }

            if (children.length == 1 && pre.nodeName == 'PRE') {
                content = pre.textContent.trim();
            }

            if (!content) {
                return;
            }

            var type = global_headers.type;

            if (!type) {
                try {
                    JSON.parse(content);
                    type = 'json';
                } catch(e) {
                    try {
                        esprima.parse(content);
                        type = 'js';

                        if (/^[\s\w]+\(\{/.test(content)) {
                            type = 'jsonp';
                        }
                    } catch(e) {
                        type = detectCSS(content);
                    }
                }
            }

            if (!type) {
                return;
            }

            var tmpType = type;
            var types = global_options.formatTypes;

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

            this.sendPrettyMsg(type, content);

            return true;
        },

        sendPrettyMsg: function (type, content) {
            var self = this;
            var options = global_options;
            var headers = global_headers;

            loading();

            // load Droid Sans font
            self.loadFont();

            chrome.runtime.sendMessage({
                action: 'prettify',
                type: type,
                content: content,
                headers: headers.headers,
                options: options
            }, function (response) {
                if (!response) {
                    unloading();
                    return;
                }
                
                if (response.timeout) {
                    unloading();
                    addClass('prism-pretty-too-large');

                    setTimeout(function () {
                        removeClass('prism-pretty-too-large');
                    }, 2500);
                    return;
                }

                var title = document.title;
                var className = 'prism-pretty';

                className += ' pretty-theme-' + options.theme;
                className += ' pretty-size-' + options.fontSize;

                rootEl.innerHTML = '<head></head><body>' + response + '</body>';
                rootEl.className = className;

                if (title) {
                    document.title = 'Prism Pretty: ' + title;
                }

                document.head.insertAdjacentHTML('beforeend', global_style);

                var headerEl = $('.request-headers');

                if (headerEl) {
                    setTimeout(function () {
                        headerEl.style.cssText = 'opacity:0;-webkit-transition:0.5s ease-out;';
                    }, 3000);
                }

                if (type === 'markdown') {
                    var hash = location.hash.slice(1);
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
                        }, 100);
                    }
                }

                var wrap;

                if (wrap = $('.preview-wrap')) {
                    var script = $('script', wrap);

                    if (script) {
                        execScript(script.textContent);
                        script.remove();
                    }
                }
            });
        }
    };

    app.init();
}).call();
