/**
 * Prism: Lightweight, robust, elegant syntax highlighting
 * MIT license http://www.opensource.org/licenses/mit-license.php/
 * @author Lea Verou http://lea.verou.me
 */
var Prism = (function(){

// Private helper vars
    var lang = /\blang(?:uage)?-(?!\*)(\w+)\b/i;

    var _ = self.Prism = {
        util: {
            encode: function (tokens) {
                if (tokens instanceof Token) {
                    return new Token(tokens.type, _.util.encode(tokens.content), tokens.alias);
                } else if (_.util.type(tokens) === 'Array') {
                    return tokens.map(_.util.encode);
                } else {
                    return tokens.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\u00a0/g, ' ');
                }
            },

            type: function (o) {
                return Object.prototype.toString.call(o).match(/\[object (\w+)\]/)[1];
            },

            // Deep clone a language definition (e.g. to extend it)
            clone: function (o) {
                var type = _.util.type(o);

                switch (type) {
                    case 'Object':
                        var clone = {};

                        for (var key in o) {
                            if (o.hasOwnProperty(key)) {
                                clone[key] = _.util.clone(o[key]);
                            }
                        }

                        return clone;

                    case 'Array':
                        // Check for existence for IE8
                        return o.map && o.map(function(v) { return _.util.clone(v); });
                }

                return o;
            }
        },

        languages: {
            extend: function (id, redef) {
                var lang = _.util.clone(_.languages[id]);

                for (var key in redef) {
                    lang[key] = redef[key];
                }

                return lang;
            },

            /**
             * Insert a token before another token in a language literal
             * As this needs to recreate the object (we cannot actually insert before keys in object literals),
             * we cannot just provide an object, we need anobject and a key.
             * @param inside The key (or language id) of the parent
             * @param before The key to insert before. If not provided, the function appends instead.
             * @param insert Object with the key/value pairs to insert
             * @param root The object that contains `inside`. If equal to Prism.languages, it can be omitted.
             */
            insertBefore: function (inside, before, insert, root) {
                root = root || _.languages;
                var grammar = root[inside];

                if (arguments.length == 2) {
                    insert = arguments[1];

                    for (var newToken in insert) {
                        if (insert.hasOwnProperty(newToken)) {
                            grammar[newToken] = insert[newToken];
                        }
                    }

                    return grammar;
                }

                var ret = {};

                for (var token in grammar) {

                    if (grammar.hasOwnProperty(token)) {

                        if (token == before) {

                            for (var newToken in insert) {

                                if (insert.hasOwnProperty(newToken)) {
                                    ret[newToken] = insert[newToken];
                                }
                            }
                        }

                        ret[token] = grammar[token];
                    }
                }

                // Update references in other language definitions
                _.languages.DFS(_.languages, function(key, value) {
                    if (value === root[inside] && key != inside) {
                        this[key] = ret;
                    }
                });

                return root[inside] = ret;
            },

            // Traverse a language definition with Depth First Search
            DFS: function(o, callback, type) {
                for (var i in o) {
                    if (o.hasOwnProperty(i)) {
                        callback.call(o, i, o[i], type || i);

                        if (_.util.type(o[i]) === 'Object') {
                            _.languages.DFS(o[i], callback);
                        }
                        else if (_.util.type(o[i]) === 'Array') {
                            _.languages.DFS(o[i], callback, i);
                        }
                    }
                }
            }
        },

        highlightAll: function(async, callback) {
            var elements = document.querySelectorAll('code[class*="language-"], [class*="language-"] code, code[class*="lang-"], [class*="lang-"] code');

            for (var i=0, element; element = elements[i++];) {
                _.highlightElement(element, async === true, callback);
            }
        },

        highlightElement: function(element, async, callback) {
            // Find language
            var language, grammar, parent = element;

            while (parent && !lang.test(parent.className)) {
                parent = parent.parentNode;
            }

            if (parent) {
                language = (parent.className.match(lang) || [,''])[1];
                grammar = _.languages[language];
            }

            // Set language on the element, if not present
            element.className = element.className.replace(lang, '').replace(/\s+/g, ' ') + ' language-' + language;

            // Set language on the parent, for styling
            parent = element.parentNode;

            if (/pre/i.test(parent.nodeName)) {
                parent.className = parent.className.replace(lang, '').replace(/\s+/g, ' ') + ' language-' + language;
            }

            var code = element.textContent;

            var env = {
                element: element,
                language: language,
                grammar: grammar,
                code: code
            };

            if (!code || !grammar) {
                _.hooks.run('complete', env);
                return;
            }

            _.hooks.run('before-highlight', env);

            if (async && self.Worker) {
                var worker = new Worker(_.filename);

                worker.onmessage = function(evt) {
                    env.highlightedCode = Token.stringify(JSON.parse(evt.data), language);

                    _.hooks.run('before-insert', env);

                    env.element.innerHTML = env.highlightedCode;

                    callback && callback.call(env.element);
                    _.hooks.run('after-highlight', env);
                    _.hooks.run('complete', env);
                };

                worker.postMessage(JSON.stringify({
                    language: env.language,
                    code: env.code
                }));
            }
            else {
                env.highlightedCode = _.highlight(env.code, env.grammar, env.language);

                _.hooks.run('before-insert', env);

                env.element.innerHTML = env.highlightedCode;

                callback && callback.call(element);

                _.hooks.run('after-highlight', env);
                _.hooks.run('complete', env);
            }
        },

        highlight: function (text, grammar, language, isUnicode) {
            _.isUnicode = !!isUnicode;

            var tokens = _.tokenize(text, grammar);
            return Token.stringify(_.util.encode(tokens), language);
        },

        tokenize: function(text, grammar, language) {
            var Token = _.Token;

            var strarr = [text];

            var rest = grammar.rest;

            if (rest) {
                for (var token in rest) {
                    grammar[token] = rest[token];
                }

                delete grammar.rest;
            }

            tokenloop: for (var token in grammar) {
                if(!grammar.hasOwnProperty(token) || !grammar[token]) {
                    continue;
                }

                var patterns = grammar[token];
                patterns = (_.util.type(patterns) === "Array") ? patterns : [patterns];

                for (var j = 0; j < patterns.length; ++j) {
                    var pattern = patterns[j],
                        inside = pattern.inside,
                        lookbehind = !!pattern.lookbehind,
                        lookbehindLength = 0,
                        alias = pattern.alias;

                    pattern = pattern.pattern || pattern;

                    for (var i=0; i<strarr.length; i++) { // Don’t cache length as it changes during the loop

                        var str = strarr[i];

                        if (strarr.length > text.length) {
                            // Something went terribly wrong, ABORT, ABORT!
                            break tokenloop;
                        }

                        if (str instanceof Token) {
                            continue;
                        }

                        pattern.lastIndex = 0;

                        var match = pattern.exec(str);

                        if (match) {
                            if(lookbehind) {
                                lookbehindLength = match[1].length;
                            }

                            var from = match.index - 1 + lookbehindLength,
                                match = match[0].slice(lookbehindLength),
                                len = match.length,
                                to = from + len,
                                before = str.slice(0, from + 1),
                                after = str.slice(to + 1);

                            var args = [i, 1];

                            if (before) {
                                args.push(before);
                            }

                            var wrapped = new Token(token, inside? _.tokenize(match, inside) : match, alias);

                            args.push(wrapped);

                            if (after) {
                                args.push(after);
                            }

                            Array.prototype.splice.apply(strarr, args);
                        }
                    }
                }
            }

            return strarr;
        },

        hooks: {
            all: {},

            add: function (name, callback) {
                var hooks = _.hooks.all;

                hooks[name] = hooks[name] || [];

                hooks[name].push(callback);
            },

            run: function (name, env) {
                var callbacks = _.hooks.all[name];

                if (!callbacks || !callbacks.length) {
                    return;
                }

                for (var i=0, callback; callback = callbacks[i++];) {
                    callback(env);
                }
            }
        }
    };

    var Token = _.Token = function(type, content, alias) {
        this.type = type;
        this.content = content;
        this.alias = alias;
    };

    Token.stringify = function(o, language, parent) {
        if (typeof o == 'string') {
            return o;
        }

        if (_.util.type(o) === 'Array') {
            return o.map(function(element) {
                return Token.stringify(element, language, o);
            }).join('');
        }

        var env = {
            type: o.type,
            content: Token.stringify(o.content, language, parent),
            tag: 'span',
            classes: ['token', o.type],
            attributes: {},
            language: language,
            parent: parent
        };

        if (env.type == 'comment') {
            env.attributes['spellcheck'] = 'true';
        }

        if (_.isUnicode && (env.type == 'string' || env.type == 'comment')) {
            env.content = unescape(env.content.replace(/\\u/g, "%u"));
        }

        if (o.alias) {
            var aliases = _.util.type(o.alias) === 'Array' ? o.alias : [o.alias];
            Array.prototype.push.apply(env.classes, aliases);
        }

        _.hooks.run('wrap', env);

        var attributes = '';

        for (var name in env.attributes) {
            attributes += name + '="' + (env.attributes[name] || '') + '"';
        }

        return '<' + env.tag + ' class="' + env.classes.join(' ') + '" ' + attributes + '>' + env.content + '</' + env.tag + '>';

    };

    return self.Prism;

})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Prism;
}


/* **********************************************
 Begin prism-markup.js
 ********************************************** */

Prism.languages.markup = {
    'comment': /<!--[\w\W]*?-->/,
    'prolog': /<\?[\w\W]+?\?>/,
    'doctype': /<!DOCTYPE[\w\W]+?>/,
    'cdata': /<!\[CDATA\[[\w\W]*?]]>/i,
    'tag': {
        pattern: /<\/?[^\s>\/]+(?:\s+[^\s>\/=]+(?:=(?:("|')(?:\\\1|\\?(?!\1)[\w\W])*\1|[^\s'">=]+))?)*\s*\/?>/i,
        inside: {
            'tag': {
                pattern: /^<\/?[^\s>\/]+/i,
                inside: {
                    'punctuation': /^<\/?/,
                    'namespace': /^[^\s>\/:]+:/
                }
            },
            'attr-value': {
                pattern: /=(?:('|")[\w\W]*?(\1)|[^\s>]+)/i,
                inside: {
                    'punctuation': /[=>"']/
                }
            },
            'punctuation': /\/?>/,
            'attr-name': {
                pattern: /[^\s>\/]+/,
                inside: {
                    'namespace': /^[^\s>\/:]+:/
                }
            }

        }
    },
    'entity': /&#?[\da-z]{1,8};/i
};

// Plugin to make entity title show the real entity, idea by Roman Komarov
Prism.hooks.add('wrap', function(env) {

    if (env.type === 'entity') {
        env.attributes['title'] = env.content.replace(/&amp;/, '&');
    }
});


/* **********************************************
 Begin prism-css.js
 ********************************************** */

Prism.languages.css = {
    'comment': /\/\*[\w\W]*?\*\//,
    'atrule': {
        pattern: /@[\w-]+?.*?(;|(?=\s*\{))/i,
        inside: {
            'rule': /@[\w-]+/
            // See rest below
        }
    },
    'url': /url\((?:(["'])(\\(?:\r\n|[\w\W])|(?!\1)[^\\\r\n])*\1|.*?)\)/i,
    'selector': /[^\{\}\s][^\{\};]*?(?=\s*\{)/,
    'string': /("|')(\\(?:\r\n|[\w\W])|(?!\1)[^\\\r\n])*\1/,
    'property': /(\b|\B)[\w-]+(?=\s*:)/i,
    'important': /\B!important\b/i,
    'function': /[-a-z0-9]+(?=\()/i,
    'punctuation': /[(){};:]/
};

Prism.languages.css['atrule'].inside.rest = Prism.util.clone(Prism.languages.css);

if (Prism.languages.markup) {
    Prism.languages.insertBefore('markup', 'tag', {
        'style': {
            pattern: /<style[\w\W]*?>[\w\W]*?<\/style>/i,
            inside: {
                'tag': {
                    pattern: /<style[\w\W]*?>|<\/style>/i,
                    inside: Prism.languages.markup.tag.inside
                },
                rest: Prism.languages.css
            },
            alias: 'language-css'
        }
    });

    Prism.languages.insertBefore('inside', 'attr-value', {
        'style-attr': {
            pattern: /\s*style=("|').*?\1/i,
            inside: {
                'attr-name': {
                    pattern: /^\s*style/i,
                    inside: Prism.languages.markup.tag.inside
                },
                'punctuation': /^\s*=\s*['"]|['"]\s*$/,
                'attr-value': {
                    pattern: /.+/i,
                    inside: Prism.languages.css
                }
            },
            alias: 'language-css'
        }
    }, Prism.languages.markup.tag);
}

/* **********************************************
 Begin prism-clike.js
 ********************************************** */

Prism.languages.clike = {
    'comment': [
        {
            pattern: /(^|[^\\])\/\*[\w\W]*?\*\//,
            lookbehind: true
        },
        {
            pattern: /(^|[^\\:])\/\/.*/,
            lookbehind: true
        }
    ],
    'string': /("|')(\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,
    'class-name': {
        pattern: /((?:\b(?:class|interface|extends|implements|trait|instanceof|new)\s+)|(?:catch\s+\())[a-z0-9_\.\\]+/i,
        lookbehind: true,
        inside: {
            punctuation: /(\.|\\)/
        }
    },
    'keyword': /\b(if|else|while|do|for|return|in|instanceof|function|new|try|throw|catch|finally|null|break|continue)\b/,
    'boolean': /\b(true|false)\b/,
    'function': /[a-z0-9_]+(?=\()/i,
    'number': /\b-?(0x[\dA-Fa-f]+|\d*\.?\d+([Ee]-?\d+)?)\b/,
    'operator': /--?|\+\+?|!=?=?|<=?|>=?|==?=?|&&?|\|\|?|\?|\*|\/|~|\^|%/,
    'punctuation': /[{}[\];(),.:]/
};


/* **********************************************
 Begin prism-javascript.js
 ********************************************** */

Prism.languages.javascript = Prism.languages.extend('clike', {
    'keyword': /\b(as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|false|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|true|try|typeof|var|void|while|with|yield)\b/,
    'number': /\b-?(0x[\dA-Fa-f]+|0b[01]+|0o[0-7]+|\d*\.?\d+([Ee][+-]?\d+)?|NaN|Infinity)\b/,
    'function': /(?!\d)[a-z0-9_$]+(?=\()/i
});

Prism.languages.insertBefore('javascript', 'keyword', {
    'regex': {
        pattern: /(^|[^/])\/(?!\/)(\[.+?]|\\.|[^/\\\r\n])+\/[gimyu]{0,5}(?=\s*($|[\r\n,.;})]))/,
        lookbehind: true
    }
});

Prism.languages.insertBefore('javascript', 'class-name', {
    'template-string': {
        pattern: /`(?:\\`|\\?[^`])*`/,
        inside: {
            'interpolation': {
                pattern: /\$\{[^}]+\}/,
                inside: {
                    'interpolation-punctuation': {
                        pattern: /^\$\{|\}$/,
                        alias: 'punctuation'
                    },
                    rest: Prism.languages.javascript
                }
            },
            'string': /[\s\S]+/
        }
    }
});

if (Prism.languages.markup) {
    Prism.languages.insertBefore('markup', 'tag', {
        'script': {
            pattern: /<script[\w\W]*?>[\w\W]*?<\/script>/i,
            inside: {
                'tag': {
                    pattern: /<script[\w\W]*?>|<\/script>/i,
                    inside: Prism.languages.markup.tag.inside
                },
                rest: Prism.languages.javascript
            },
            alias: 'language-javascript'
        }
    });
}


Prism.languages.markdown = Prism.languages.extend('markup', {});
Prism.languages.insertBefore('markdown', 'prolog', {
    'blockquote'   : {
        // > ...
        pattern: /^>(?:[\t ]*>)*/m,
        alias  : 'punctuation'
    },
    'code'         : [
        {
            // Prefixed by 4 spaces or 1 tab
            pattern: /^(?: {4}|\t).+/m,
            alias  : 'keyword'
        },
        {
            // `code`
            // ``code``
            pattern: /``.+?``|`[^`\n]+`/,
            alias  : 'keyword'
        }
    ],
    'title'        : [
        {
            // title 1
            // =======

            // title 2
            // -------
            pattern: /\w+.*(?:\r?\n|\r)(?:==+|--+)/,
            alias  : 'important',
            inside : {
                punctuation: /==+$|--+$/
            }
        },
        {
            // # title 1
            // ###### title 6
            pattern   : /(^\s*)#+.+/m,
            lookbehind: true,
            alias     : 'important',
            inside    : {
                punctuation: /^#+|#+$/
            }
        }
    ],
    'hr'           : {
        // ***
        // ---
        // * * *
        // -----------
        pattern   : /(^\s*)([*-])([\t ]*\2){2,}(?=\s*$)/m,
        lookbehind: true,
        alias     : 'punctuation'
    },
    'list'         : {
        // * item
        // + item
        // - item
        // 1. item
        pattern   : /(^\s*)(?:[*+-]|\d+\.)(?=[\t ].)/m,
        lookbehind: true,
        alias     : 'punctuation'
    },
    'url-reference': {
        // [id]: http://example.com "Optional title"
        // [id]: http://example.com 'Optional title'
        // [id]: http://example.com (Optional title)
        // [id]: <http://example.com> "Optional title"
        pattern: /!?\[[^\]]+\]:[\t ]+(?:\S+|<(?:\\.|[^>\\])+>)(?:[\t ]+(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\)))?/,
        inside : {
            'variable'   : {
                pattern   : /^(!?\[)[^\]]+/,
                lookbehind: true
            },
            'string'     : /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\))$/,
            'punctuation': /^[\[\]!:]|[<>]/
        },
        alias  : 'url'
    },
    'bold'         : {
        // **strong**
        // __strong__

        // Allow only one line break
        pattern   : /(^|[^\\])(\*\*|__)(?:(?:\r?\n|\r)(?!\r?\n|\r)|.)+?\2/,
        lookbehind: true,
        inside    : {
            'punctuation': /^\*\*|^__|\*\*$|__$/
        }
    },
    'italic'       : {
        // *em*
        // _em_

        // Allow only one line break
        pattern   : /(^|[^\\])([*_])(?:(?:\r?\n|\r)(?!\r?\n|\r)|.)+?\2/,
        lookbehind: true,
        inside    : {
            'punctuation': /^[*_]|[*_]$/
        }
    },
    'url'          : {
        // [example](http://example.com "Optional title")
        // [example] [id]
        pattern: /!?\[[^\]]+\](?:\([^\s)]+(?:[\t ]+"(?:\\.|[^"\\])*")?\)| ?\[[^\]\n]*\])/,
        inside : {
            'variable': {
                pattern   : /(!?\[)[^\]]+(?=\]$)/,
                lookbehind: true
            },
            'string'  : {
                pattern: /"(?:\\.|[^"\\])*"(?=\)$)/
            }
        }
    }
});

Prism.languages.markdown['bold'].inside['url']    = Prism.util.clone(Prism.languages.markdown['url']);
Prism.languages.markdown['italic'].inside['url']  = Prism.util.clone(Prism.languages.markdown['url']);
Prism.languages.markdown['bold'].inside['italic'] = Prism.util.clone(Prism.languages.markdown['italic']);
Prism.languages.markdown['italic'].inside['bold'] = Prism.util.clone(Prism.languages.markdown['bold']);


/**
 * Super simple syntax highlighting
 * @author Lea Verou
 */

RegExp.create = function (str, replacements, flags) {
    for (var id in replacements) {
        var replacement = replacements[id],
            idRegExp    = RegExp('{{' + id + '}}', 'gi');

        if (replacement.source) {
            replacement = replacement.source.replace(/^\^|\$$/g, '');
        }

        // Don't add extra parentheses if they already exist
        str = str.replace(RegExp('\\(' + idRegExp.source + '\\)', 'gi'), '(' + replacement + ')');

        str = str.replace(idRegExp, '(?:' + replacement + ')');
    }

    return RegExp(str, flags);
};

(function () {

    var number = /-?\d*\.?\d+/;

    // CSS colors
    var colors = [
        //  'aliceblue',
        //  'antiquewhite',
        'aqua',
        //  'aquamarine',
        //  'azure',
        //  'beige',
        //  'bisque',
        'black',
        //  'blanchedalmond',
        'blue',
        //  'blueviolet',
        'brown',
        //  'burlywood',
        //  'cadetblue',
        //  'chartreuse',
        //  'chocolate',
        //  'coral',
        //  'cornflowerblue',
        //  'cornsilk',
        //  'crimson',
        'cyan',
        //  'darkblue',
        //  'darkcyan',
        //  'darkgoldenrod',
        'darkgray',
        //  'darkgreen',
        'darkgrey',
        //  'darkkhaki',
        //  'darkmagenta',
        //  'darkolivegreen',
        //  'darkorange',
        //  'darkorchid',
        //  'darkred',
        //  'darksalmon',
        //  'darkseagreen',
        //  'darkslateblue',
        //  'darkslategray',
        //  'darkslategrey',
        //  'darkturquoise',
        //  'darkviolet',
        'deeppink',
        //  'deepskyblue',
        'dimgray', 'dimgrey',
        //  'dodgerblue',
        //  'firebrick',
        //  'floralwhite',
        //  'forestgreen',
        'fuchsia',
        //  'gainsboro',
        //  'ghostwhite',
        'gold',
        //  'goldenrod',
        'gray', 'green',
        //  'greenyellow',
        'grey',
        //  'honeydew',
        //  'hotpink',
        'indianred',
        //  'indigo',
        //  'ivory',
        //  'khaki',
        //  'lavender',
        //  'lavenderblush',
        //  'lawngreen',
        //  'lemonchiffon',
        //  'lightblue',
        //  'lightcoral',
        //  'lightcyan',
        //  'lightgoldenrodyellow',
        'lightgray',
        //  'lightgreen',
        'lightgrey',
        //  'lightpink',
        //  'lightsalmon',
        //  'lightseagreen',
        //  'lightskyblue',
        //  'lightslategray',
        //  'lightslategrey',
        //  'lightsteelblue',
        //  'lightyellow',
        'lime', 'limegreen',
        //  'linen',
        'magenta', 'maroon',
        //  'mediumaquamarine',
        //  'mediumblue',
        //  'mediumorchid',
        //  'mediumpurple',
        //  'mediumseagreen',
        //  'mediumslateblue',
        //  'mediumspringgreen',
        //  'mediumturquoise',
        //  'mediumvioletred',
        //  'midnightblue',
        //  'mintcream',
        //  'mistyrose',
        //  'moccasin',
        //  'navajowhite',
        'navy',
        //  'oldlace',
        'olive',
        //  'olivedrab',
        'orange', 'orangered', 'orchid',
        //  'palegoldenrod',
        //  'palegreen',
        //  'paleturquoise',
        //  'palevioletred',
        'papayawhip', 'peachpuff', 'peru', 'pink', 'plum',
        //  'powderblue',
        'purple', 'red',
        //  'rosybrown',
        //  'royalblue',
        //  'saddlebrown',
        'salmon',
        //  'sandybrown',
        //  'seagreen',
        //  'seashell',
        //  'sienna',
        'silver',
        //  'skyblue',
        //  'slateblue',
        'slategray', 'slategrey', 'snow',
        //  'springgreen',
        //  'steelblue',
        'tan', 'teal', 'thistle', 'tomato', 'transparent', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
    ];

    Prism.languages.insertBefore('css', 'important', {
        'gradient': /(\b|\B-[a-z]{1,10}-)(repeating-)?(linear|radial)-gradient\(((rgb|hsl)a?\(.+?\)|[^\)])+\)/gi,
        'color'   : RegExp.create('\\b{{keyword}}\\b|\\b{{func}}\\B|\\B{{hex}}\\b', {
            keyword: RegExp('^' + colors.join('|') + '$'),
            func   : RegExp.create('^(?:rgb|hsl)a?\\((?:\\s*{{number}}%?\\s*,?\\s*){3,4}\\)$', {
                number: number
            }),
            hex    : /^#(?:[0-9a-f]{3}){1,2}$/i
        }, 'ig')
    });

    Prism.languages.insertBefore('css', {
        'important' : /\B!important\b/gi,
        'abslength' : RegExp.create('(\\b|\\B){{number}}{{unit}}\\b', {
            number: number,
            unit  : /(cm|mm|in|pt|pc|px)/
        }, 'gi'),
        'easing'    : RegExp.create('\\b{{bezier}}\\B|\\b{{keyword}}(?=\\s|;|\\}|$)', {
            bezier : RegExp.create('cubic-bezier\\(({{number}},\\s*){3}{{number}}\\)', {
                number: number
            }),
            keyword: /linear|ease(-in)?(-out)?/
        }, 'gi'),
        'time'      : RegExp.create('(\\b|\\B){{number}}m?s\\b', {
            number: number
        }, 'gi'),
        'angle'     : RegExp.create('(\\b|\\B){{number}}(deg|g?rad|turn)\\b', {
            number: number
        }, 'gi'),
        'fontfamily': /(("|')[\w\s]+\2,\s*|\w+,\s*)*(sans-serif|serif|monospace|cursive|fantasy)\b/gi,
        'entity'    : /\\[\da-f]{1,8}/gi
    });

    Prism.languages.html = Prism.languages.markup;
})();
