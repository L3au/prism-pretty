function template(str) {
    var strArr = [
        '<div class="request-headers">',
        '<table>',
        '{{ it.headers.forEach(function (header) { }}',
        '{{ var className = ""; }}',
        '{{ if(header.value == \'aproxy\' || header.name.toLowerCase() == \'x - combo - files\') { }}',
        '{{ className = \' class="aproxy"\'; }}',
        '{{ } }}',
        '<tr>',
        '<td>{{= header.name }}</td>',
        '<td{{= className }}>{{= header.value }}</td>',
        '</tr>',
        '{{ }); }}',
        '</table>',
        '</div>'
    ];

    str = str || strArr.join('');

    var strFunc = "var out = ''; out+=" + "'" +
        str.replace(/[\r\t\n]/g, " ")
            .replace(/'(?=[^}]*}})/g, "\t")
            .split("'").join("\\'")
            .split("\t").join("'")
            .replace(/{{=(.+?)}}/g, "'; out += $1; out += '")
            .split("{{").join("';")
            .split("}}").join("out+='") + "'; return out;";

    var fn = new Function("it", strFunc);

    return {
        render: function (data) {
            return fn(data || {});
        }
    }
}

// pretty content
function prettyWorker(data) {
    var defer = Promise.defer();

    function extensionUrl(path) {
        return chrome.runtime.getURL(path);
    }

    var url         = data.url;
    var type        = data.type;
    var content     = data.content;
    var headersData = data.headers;
    var options     = data.options;
    var lang        = data.language;

    var indent    = options.indent;
    var isUnicode = options.unicode;

    var bugFree   = options.bugFree;
    var headers   = options.headers;
    var customCSS = options.customCSS.trim();

    var files = new Array(3);

    if (type == 'css' || type == 'html') {
        files[0] = extensionUrl('html/preview.html');
    }

    if (bugFree) {
        files[1] = extensionUrl('js/bugfree.js');
    }

    if (type == 'html') {
        files[2] = url;
    }

    Promise.all(files.map(function (url) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();

            xhr.onload  = function () {
                resolve(xhr.responseText);
            };
            xhr.onerror = function () {
                reject();
            };

            xhr.open('GET', url);
            xhr.send();
        });
    })).then(function (contents) {
        var grammar, language, html;
        var formated   = '';
        var beautified = '';
        var lineRows   = '';
        var isMarkdown = type === 'markdown';

        try {
            switch (type) {
                case 'json':
                    formated = JSON.stringify(JSON.parse(content), null, indent);

                    language = 'javascript';
                    grammar  = Prism.languages.javascript;

                    break;
                case 'js':
                case 'jsonp':
                    formated = js_beautify(content, {
                        indent_size: indent
                    });

                    language = 'javascript';
                    grammar  = Prism.languages.javascript;

                    break;

                case 'css':
                    formated = css_beautify(content, {
                        indent_size: indent
                    });

                    language = 'css';
                    grammar  = Prism.languages.css;

                    break;

                case 'html':
                    formated = html_beautify(contents[2], {
                        indent_size          : indent,
                        max_preserve_newlines: 1
                    });

                    language = 'markup';
                    grammar  = Prism.languages.markup;

                    break;

                case 'markdown':
                    var renderer = new marked.Renderer();

                    renderer.heading = function (text, level) {
                        var escapedText = escape(text.toLowerCase().trim().replace(/\s+/g, '-'));

                        return '<h' + level + '><a id="' + escapedText +
                            '" class="anchor" href="#' + escapedText +
                            '"><span class="anchor-link"></span></a>' +
                            text + '</h' + level + '>';
                    };

                    marked.setOptions({
                        renderer : renderer,
                        highlight: function (code) {
                            return hljs.highlightAuto(code).value;
                        }
                    });

                    beautified = marked(content);

                    break;

                default:
                    defer.reject();
                    return;
            }

            if (bugFree && ['js', 'json', 'jsonp', 'css'].indexOf(type) > -1) {
                var idx = +!lang.match('zh');

                formated = contents[1].split('233')[idx] + '\r\n' + formated;
            }

            if (!isMarkdown) {
                beautified = Prism.highlight(formated, grammar, language, isUnicode);
            }

            html = '<div class="pretty-container">';

            if (type !== 'markdown') {
                lineRows = '<span class="line-numbers-rows">';

                var lines = beautified.split('\n').length;

                while (lines--) {
                    lineRows += '<span></span>';
                }

                lineRows += '</span>';
            }

            html += '<' + (isMarkdown ? 'div' : 'pre') + ' class="language-pretty">';
            html += lineRows + beautified;
            html += '</' + (isMarkdown ? 'div' : 'pre') + '>';

            if (headers && !isMarkdown) {
                html += template().render({
                    headers: headersData
                });
            }

            if (type == 'css' || type == 'html') {
                html += contents[0];
            }

            if (customCSS) {
                html += '<style class="custom-css">\n' + customCSS + '\n</style>';
            }

            html += '</div>';

            defer.resolve(html);
        } catch (e) {
            defer.reject();
        }
    }, function () {
        defer.reject();
    });

    return defer.promise;
}
