var matchHtmlRegExp = /["'&<>]/;

function escapeHtml(string) {
    var str = '' + string;
    var match = matchHtmlRegExp.exec(str);

    if (!match) {
        return str;
    }

    var escape;
    var html = '';
    var index = 0;
    var lastIndex = 0;

    for (index = match.index; index < str.length; index++) {
        switch (str.charCodeAt(index)) {
            case 34: // "
                escape = '&quot;';
                break;
            case 38: // &
                escape = '&amp;';
                break;
            case 39: // '
                escape = '&#39;';
                break;
            case 60: // <
                escape = '&lt;';
                break;
            case 62: // >
                escape = '&gt;';
                break;
            default:
                continue;
        }

        if (lastIndex !== index) {
            html += str.substring(lastIndex, index);
        }

        lastIndex = index + 1;
        html += escape;
    }

    return lastIndex !== index
        ? html + str.substring(lastIndex, index)
        : html;
}

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

importScripts('../js/prism.js', '../js/codebeautify.js');

self.onmessage = function (event) {
    var data        = event.data;
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
    var customCSS = options.customCSS;

    var files = new Array(3);

    if (type == 'css' || type == 'html') {
        files[0] = 'html/preview.html';
    }

    if (bugFree) {
        files[1] = 'js/bugfree.js';
    }

    if (type == 'html') {
        files[2] = url;
    }

    Promise.all(files.map(function (url) {
        return url ? new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();

            xhr.onload  = function () {
                resolve(xhr.responseText);
            };
            xhr.onerror = function () {
                reject();
            };

            xhr.open('GET', url);
            xhr.send();
        }) : null;
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
                        var escapedText = escapeHtml(text.replace(/\s+/g, ''));

                        return '<h' + level + '><a id="' + escapedText + '" class="anchor" href="#' + escapedText +
                            '"><span class="anchor-link"></span></a>' +
                            text + '</h' + level + '>';
                    };

                    renderer.code = function (code, language) {
                        var html;

                        if (language) {
                            html = hljs.highlight(language, code, true).value;
                        } else {
                            html = hljs.highlightAuto(code).value;
                        }

                        return '<pre class="hljs"><code>' + html + '</code></pre>';
                    };

                    renderer.listitem = function (text) {
                        if (/^\s*\[[x ]\]\s*/.test(text)) {
                            text = text
                                .replace(/^\s*\[ \]\s*/, '<input type="checkbox">')
                                .replace(/^\s*\[x\]\s*/, '<input type="checkbox" checked> ');
                            return '<li>' + text + '</li>';
                        } else {
                            return '<li>' + text + '</li>';
                        }
                    };

                    marked.setOptions({
                        renderer   : renderer,
                        breaks     : true,
                        pedantic   : true,
                        smartLists : true,
                        smartypants: true
                    });

                    beautified = marked(content);

                    break;

                default:
                    self.postMessage();
                    return;
            }

            if (bugFree && ['js', 'css'].indexOf(type) > -1) {
                var idx = +!lang.match('zh');

                formated = contents[1].split('233')[idx] + '\r\n' + formated;
            }

            if (!isMarkdown) {
                beautified = Prism.highlight(formated, grammar, language, isUnicode);

                lineRows = '<span class="line-numbers-rows">';

                var lines = beautified.split('\n').length;

                while (lines--) {
                    lineRows += '<span></span>';
                }

                lineRows += '</span>';
            }

            html = '<div class="pretty-container">';

            html += '<' + (isMarkdown ? 'div' : 'pre') + ' class="language-pretty">';
            html += lineRows + beautified;
            html += '</' + (isMarkdown ? 'div' : 'pre') + '>';

            if (headers && headersData.length && !isMarkdown) {
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

            self.postMessage(html);
        } catch (e) {
            self.postMessage();
        }
    }, function () {
        self.postMessage();
    });
};
