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
        render: function (data) {
            return fn(data || {});
        }
    }
}

var assets = [
    'prism.js',
    'codebeautify.js'
];

importScripts.apply(null, assets.map(function (item) {
    return '../js/' + item;
}));

var onmessage = function (event) {
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

    var formated, beautified = '';
    var language;

    var files = new Array(4);

    files[0] = url;

    if (headers) {
        files[1] = 'html/header.html';
    }

    if (type == 'css' || type == 'markup') {
        files[2] = 'html/preview.html';
    }

    if (bugFree) {
        files[3] = 'js/bugfree.js';
    }

    Promise.all(files.map(function (url) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();

            xhr.onload = function () {
                resolve(xhr.responseText);
            };
            xhr.onerror = function () {
                reject();
            };

            xhr.open('GET', url);
            xhr.send();
        });
    })).then(function (contents) {
        var content = contents[0];

        if (type == 'css') {
            formated = css_beautify(content, {
                indent_size: indent
            });

            language = Prism.languages.css;
        } else if (type == 'markup')  {
            formated = html_beautify(content, {
                indent_size: indent,
                max_preserve_newlines: 1
            });

            language = Prism.languages.markup;
        } else {
            formated = js_beautify(content, {
                indent_size: indent
            });

            language = Prism.languages.javascript;
        }

        if (bugFree && type != 'markup') {
            var idx = +!lang.match('zh');

            formated = contents[3].split('233')[idx] + '\r\n' + formated;
        }

        beautified = Prism.highlight(formated, language, isUnicode);

        var lines = beautified.split('\n').length;
        var lineRows = '<span class="line-numbers-rows">';

        while (lines--) {
            lineRows += '<span></span>';
        }

        lineRows += '</span>';

        var html = '<div class="pretty-container {{= it.theme }} {{= it.fontSize }}">';

        html = template(html).render({
            theme: 'pretty-theme-' + theme,
            fontSize: 'pretty-size-' + fontSize
        });

        html += '<pre class="language-pretty">' + lineRows + beautified + '</pre>';

        if (headers) {
            html += template(contents[1]).render({
                headers: headersData
            });
        }

        if (type == 'css' || type == 'markup') {
            html += contents[2];
        }

        if (customCSS) {
            html += '<style class="custom-css">\n' + customCSS + '\n</style>';
        }

        html += '</div>';

        postMessage(html);
    }, function () {
        postMessage();
    });
};