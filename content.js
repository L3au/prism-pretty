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
        addClass('prism-pretty prism-pretty-spinner')
    }

    function unloading() {
        removeClass('prism-pretty prism-pretty-spinner')
    }

    function execScript(content) {
        var s = document.createElement('script');

        s.textContent = 'try{' + content + '}catch(e){}';

        document.head.appendChild(s);
        s.remove(), s = null;
    }

    var global_headers, global_options;

    var app = {
        init: function () {
            var self = this;

            var promises = [
                (function () {
                    return new Promise(function (resolve, reject) {
                        chrome.runtime.sendMessage({
                            action: 'requestHeader'
                        }, function (result) {
                            if (result.type) {
                                loading();
                            }

                            resolve(result);

                            if (result.error) {
                                reject();
                            } else {

                            }
                        });
                    });
                }),

                (function () {
                    return new Promise(function (resolve, reject) {
                        if (/te/.test(document.readyState)) {
                            resolve();
                        } else {
                            document.addEventListener('DOMContentLoaded', resolve);
                        }
                    });
                })
            ];

            chrome.storage.sync.get(function (options) {
                if (options.enabled) {
                    Promise.all(promises.map(function (p) {
                        return p();
                    })).then(function () {
                        rootEl = document.documentElement;

                        global_headers = arguments[0][0];
                        global_options = options;

                        self.prettifyContent();
                    }, function () {
                        unloading();
                    });
                }
            });

            chrome.storage.onChanged.addListener(function () {
                if (rootEl.classList.contains('prism-pretty')) {
                    location.reload();
                }
            });

            chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
                var action = request.action;

                if (action == 'pretty_document') {
                    if (rootEl.classList.contains('prism-pretty')) {
                        location.reload();
                        return;
                    }

                    loading();

                    self.sendPrettyMsg('markup');
                }
            });
        },

        prettifyContent: function () {
            var content;
            var body = document.body;
            var children = body.children;
            var pre = children[0];

            if (children.length == 0) {
                content = body.textContent.trim();
            }

            if (children.length == 1 && pre.nodeName == 'PRE') {
                content = pre.textContent.trim();
            }

            if (!content) {
                unloading();
                return;
            }

            var type = global_headers.type;

            if (!type) {
                try {
                    JSON.parse(content);
                    type = 'json';
                } catch (e) {
                    try {
                        esprima.parse(content);
                        type = 'js';

                        if (/^\w+\(\{/.test(content)) {
                            type = 'jsonp';
                        }
                    } catch (e) {
                    }
                }

                if (!type) {
                    var style = document.createElement('style');

                    style.textContent = content;

                    document.head.appendChild(style);

                    if (style.sheet.rules.length) {
                        type = 'css';
                    }

                    style.remove();
                }
            }

            if (!type) {
                unloading();
                return;
            }

            loading();

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

            this.sendPrettyMsg(type);
        },

        sendPrettyMsg: function (type) {
            var options = global_options;
            var headers = global_headers || {headers: []};

            if (!options) {
                unloading();
                return;
            }

            chrome.runtime.sendMessage({
                action: 'prettify',
                type: type,
                headers: headers.headers,
                options: options
            }, function (responseHtml) {
                if (!responseHtml) {
                    unloading();
                    return;
                }

                var title = document.title;

                rootEl.innerHTML = '<head></head><body>' + responseHtml + '</body>';
                rootEl.className = 'prism-pretty';

                document.title = 'Prism Pretty: ' + title;

                var headerEl = $('.request-headers');

                if (headerEl) {
                    setTimeout(function () {
                        headerEl.style.cssText = 'opacity:0;-webkit-transition:0.5s ease-out;';
                    }, 3000);
                }

                var wrap = $('.preview-wrap');

                if (!wrap) {
                    return;
                }

                var script = $('script', wrap);

                if (script) {
                    execScript(script.textContent);
                    script.remove();
                }
            });
        }
    };

    app.init();
}).call();
