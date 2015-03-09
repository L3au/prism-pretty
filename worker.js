function template(str) {
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
        render: function(data) {
            return fn(data || {});
        }
    }
}

var assets = [
    'prism.js',
    'codebeautify.js'
];

importScripts.apply(null, assets.map(function(item) {
    return '../js/' + item;
}));

var renderer = new marked.Renderer();

renderer.heading = function(text, level) {
    var escapedText = escape(text.toLowerCase().trim().replace(/\s+/g, '-'));

    return '<h' + level + '><a id="' + escapedText +
        '" class="anchor" href="#' + escapedText +
        '"><span class="anchor-link"></span></a>' +
        text + '</h' + level + '>';
}

marked.setOptions({
    renderer: renderer,
    highlight: function(code) {
        return hljs.highlightAuto(code).value;
    }
});

var onmessage = function(event) {
    var data = event.data;
    var type = data.type;
    var url = data.url;
    var headersData = data.headers;
    var options = data.options;
    var lang = data.language;

    var theme = options.theme;
    var fontSize = options.fontSize;
    var indent = options.indent;
    var isUnicode = options.unicode;

    var bugFree = options.bugFree;
    var headers = options.headers;
    var customCSS = options.customCSS.trim();

    var files = new Array(5);

    files[0] = url;

    if (headers) {
        files[1] = 'html/header.html';
    }

    if (type == 'css' || type == 'html') {
        files[2] = 'html/preview.html';
    }

    if (bugFree) {
        files[3] = 'js/bugfree.js';
    }

    Promise.all(files.map(function(url) {
        return new Promise(function(resolve, reject) {
            var xhr = new XMLHttpRequest();

            xhr.onload = function() {
                resolve(xhr.responseText);
            };
            xhr.onerror = function() {
                reject();
            };

            xhr.open('GET', url);
            xhr.send();
        });
    })).then(function(contents) {
        var language, html;
        var formated = beautified = lineRows = '';

        var content = contents[0];
        var isMarkdown = type === 'markdown';

        try {
            switch (type) {
                case 'js':
                    formated = js_beautify(content, {
                        indent_size: indent
                    });

                    language = Prism.languages.javascript;

                    break;

                case 'css':
                    formated = css_beautify(content, {
                        indent_size: indent
                    });

                    language = Prism.languages.css;

                    break;

                case 'html':
                    formated = html_beautify(content, {
                        indent_size: indent,
                        max_preserve_newlines: 1
                    });

                    language = Prism.languages.markup;

                    break;

                case 'markdown':
                    formated = hljs.highlight('md', content).value;
                    beautified = marked(content);
                    break;

                default:
                    postMessage();
                    return;
            }

            if (bugFree && (type == 'js' || type == 'css')) {
                var idx = +!lang.match('zh');

                formated = contents[3].split('233')[idx] + '\r\n' + formated;
            }

            if (!isMarkdown) {
                beautified = Prism.highlight(formated, language, isUnicode);
            }
        } catch (e) {
            throw e;
            postMessage();
            return;
        }

        html = '<div class="pretty-container {{= it.theme }} {{= it.fontSize }}">';

        html = template(html).render({
            fontSize: 'pretty-size-' + fontSize,
            theme: 'pretty-theme-' + (isMarkdown ? 'markdown' : theme)
        });

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
            html += template(contents[1]).render({
                headers: headersData
            });
        }

        if (type == 'css' || type == 'html') {
            html += contents[2];
        }

        if (customCSS) {
            html += '<style class="custom-css">\n' + customCSS + '\n</style>';
        }

        html += '</div>';

        postMessage(html);
    }, function() {
        postMessage();
    });
};
