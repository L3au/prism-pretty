/**
 * Prism: Lightweight, robust, elegant syntax highlighting
 * MIT license http://www.opensource.org/licenses/mit-license.php/
 * @author Lea Verou http://lea.verou.me
 */

var Prism = (function() {

    // Private helper vars
    var lang = /\blang(?:uage)?-(?!\*)(\w+)\b/i;

    var _ = self.Prism = {
        util: {
            encode: function(tokens) {
                if (tokens instanceof Token) {
                    return new Token(tokens.type, _.util.encode(tokens.content), tokens.alias);
                } else if (_.util.type(tokens) === 'Array') {
                    return tokens.map(_.util.encode);
                } else {
                    return tokens.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\u00a0/g, ' ');
                }
            },

            type: function(o) {
                return Object.prototype.toString.call(o).match(/\[object (\w+)\]/)[1];
            },

            // Deep clone a language definition (e.g. to extend it)
            clone: function(o) {
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
                        return o.slice();
                }

                return o;
            }
        },

        languages: {
            extend: function(id, redef) {
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
            insertBefore: function(inside, before, insert, root) {
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
                        } else if (_.util.type(o[i]) === 'Array') {
                            _.languages.DFS(o[i], callback, i);
                        }
                    }
                }
            }
        },

        highlightAll: function(async, callback) {
            var elements = document.querySelectorAll('code[class*="language-"], [class*="language-"] code, code[class*="lang-"], [class*="lang-"] code');

            for (var i = 0, element; element = elements[i++];) {
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
                language = (parent.className.match(lang) || [, ''])[1];
                grammar = _.languages[language];
            }

            if (!grammar) {
                return;
            }

            // Set language on the element, if not present
            element.className = element.className.replace(lang, '').replace(/\s+/g, ' ') + ' language-' + language;

            // Set language on the parent, for styling
            parent = element.parentNode;

            if (/pre/i.test(parent.nodeName)) {
                parent.className = parent.className.replace(lang, '').replace(/\s+/g, ' ') + ' language-' + language;
            }

            var code = element.textContent;

            if (!code) {
                return;
            }

            var env = {
                element: element,
                language: language,
                grammar: grammar,
                code: code
            };

            _.hooks.run('before-highlight', env);

            if (async && self.Worker) {
                var worker = new Worker(_.filename);

                worker.onmessage = function(evt) {
                    env.highlightedCode = Token.stringify(JSON.parse(evt.data), language);

                    _.hooks.run('before-insert', env);

                    env.element.innerHTML = env.highlightedCode;

                    callback && callback.call(env.element);
                    _.hooks.run('after-highlight', env);
                };

                worker.postMessage(JSON.stringify({
                    language: env.language,
                    code: env.code
                }));
            } else {
                env.highlightedCode = _.highlight(env.code, env.grammar, env.language)

                _.hooks.run('before-insert', env);

                env.element.innerHTML = env.highlightedCode;

                callback && callback.call(element);

                _.hooks.run('after-highlight', env);
            }
        },

        highlight: function(text, grammar, isUnicode) {
            _.isUnicode = !!isUnicode;

            var tokens = _.tokenize(text, grammar);
            return Token.stringify(_.util.encode(tokens));
        },

        tokenize: function(text, grammar) {
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
                if (!grammar.hasOwnProperty(token) || !grammar[token]) {
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

                    for (var i = 0; i < strarr.length; i++) { // Don’t cache length as it changes during the loop

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
                            if (lookbehind) {
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

                            var wrapped = new Token(token, inside ? _.tokenize(match, inside) : match, alias);

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

            add: function(name, callback) {
                var hooks = _.hooks.all;

                hooks[name] = hooks[name] || [];

                hooks[name].push(callback);
            },

            run: function(name, env) {
                var callbacks = _.hooks.all[name];

                if (!callbacks || !callbacks.length) {
                    return;
                }

                for (var i = 0, callback; callback = callbacks[i++];) {
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

        if (Object.prototype.toString.call(o) == '[object Array]') {
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

Prism.languages.markup = {
    'comment': /<!--[\w\W]*?-->/g,
    'prolog': /<\?.+?\?>/,
    'doctype': /<!DOCTYPE.+?>/,
    'cdata': /<!\[CDATA\[[\w\W]*?]]>/i,
    'tag': {
        pattern: /<\/?[\w:-]+\s*(?:\s+[\w:-]+(?:=(?:("|')(\\?[\w\W])*?\1|[^\s'">=]+))?\s*)*\/?>/gi,
        inside: {
            'tag': {
                pattern: /^<\/?[\w:-]+/i,
                inside: {
                    'punctuation': /^<\/?/,
                    'namespace': /^[\w-]+?:/
                }
            },
            'attr-value': {
                pattern: /=(?:('|")[\w\W]*?(\1)|[^\s>]+)/gi,
                inside: {
                    'punctuation': /=|>|"/g
                }
            },
            'punctuation': /\/?>/g,
            'attr-name': {
                pattern: /[\w:-]+/g,
                inside: {
                    'namespace': /^[\w-]+?:/
                }
            }

        }
    },
    'entity': /\&#?[\da-z]{1,8};/gi
};

// Plugin to make entity title show the real entity, idea by Roman Komarov
Prism.hooks.add('wrap', function(env) {

    if (env.type === 'entity') {
        env.attributes['title'] = env.content.replace(/&amp;/, '&');
    }
});;

Prism.languages.css = {
    'comment': /\/\*[\w\W]*?\*\//g,
    'atrule': {
        pattern: /@[\w-]+?.*?(;|(?=\s*{))/gi,
        inside: {
            'punctuation': /[;:]/g
        }
    },
    'url': /url\((["']?).*?\1\)/gi,
    'selector': /[^\{\}\s][^\{\};]*(?=\s*\{)/g,
    'property': /(\b|\B)[\w-]+(?=\s*:)/ig,
    'string': /("|')(\\?.)*?\1/g,
    'important': /\B!important\b/gi,
    'punctuation': /[\{\};:]/g,
    'function': /[-a-z0-9]+(?=\()/ig
};

if (Prism.languages.markup) {
    Prism.languages.insertBefore('markup', 'tag', {
        'style': {
            pattern: /<style[\w\W]*?>[\w\W]*?<\/style>/ig,
            inside: {
                'tag': {
                    pattern: /<style[\w\W]*?>|<\/style>/ig,
                    inside: Prism.languages.markup.tag.inside
                },
                rest: Prism.languages.css
            },
            alias: 'language-css'
        }
    });

    Prism.languages.insertBefore('inside', 'attr-value', {
        'style-attr': {
            pattern: /\s*style=("|').+?\1/ig,
            inside: {
                'attr-name': {
                    pattern: /^\s*style/ig,
                    inside: Prism.languages.markup.tag.inside
                },
                'punctuation': /^\s*=\s*['"]|['"]\s*$/,
                'attr-value': {
                    pattern: /.+/gi,
                    inside: Prism.languages.css
                }
            },
            alias: 'language-css'
        }
    }, Prism.languages.markup.tag);
};
Prism.languages.clike = {
    'comment': [{
        pattern: /(^|[^\\])\/\*[\w\W]*?\*\//g,
        lookbehind: true
    }, {
        pattern: /(^|[^\\:])\/\/.*?(\r?\n|$)/g,
        lookbehind: true
    }],
    'string': /("|')(\\?.)*?\1/g,
    'class-name': {
        pattern: /((?:(?:class|interface|extends|implements|trait|instanceof|new)\s+)|(?:catch\s+\())[a-z0-9_\.\\]+/ig,
        lookbehind: true,
        inside: {
            punctuation: /(\.|\\)/
        }
    },
    'keyword': /\b(if|else|while|do|for|return|in|instanceof|function|new|try|throw|catch|finally|null|break|continue)\b/g,
    'boolean': /\b(true|false)\b/g,
    'function': {
        pattern: /[a-z0-9_]+\(/ig,
        inside: {
            punctuation: /\(/
        }
    },
    'number': /\b-?(0x[\dA-Fa-f]+|\d*\.?\d+([Ee]-?\d+)?)\b/g,
    'operator': /[-+]{1,2}|!|<=?|>=?|={1,3}|&{1,2}|\|?\||\?|\*|\/|\~|\^|\%/g,
    'ignore': /&(lt|gt|amp);/gi,
    'punctuation': /[{}[\];(),.:]/g
};;
Prism.languages.javascript = Prism.languages.extend('clike', {
    'keyword': /\b(break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|false|finally|for|function|get|if|implements|import|in|instanceof|interface|let|new|null|package|private|protected|public|return|set|static|super|switch|this|throw|true|try|typeof|var|void|while|with|yield)\b/g,
    'number': /\b-?(0x[\dA-Fa-f]+|\d*\.?\d+([Ee]-?\d+)?|NaN|-?Infinity)\b/g
});

Prism.languages.insertBefore('javascript', 'keyword', {
    'regex': {
        pattern: /(^|[^/])\/(?!\/)(\[.+?]|\\.|[^/\r\n])+\/[gim]{0,3}(?=\s*($|[\r\n,.;})]))/g,
        lookbehind: true
    }
});

if (Prism.languages.markup) {
    Prism.languages.insertBefore('markup', 'tag', {
        'script': {
            pattern: /<script[\w\W]*?>[\w\W]*?<\/script>/ig,
            inside: {
                'tag': {
                    pattern: /<script[\w\W]*?>|<\/script>/ig,
                    inside: Prism.languages.markup.tag.inside
                },
                rest: Prism.languages.javascript
            },
            alias: 'language-javascript'
        }
    });
};

/**
 * Super simple syntax highlighting
 * @author Lea Verou
 */

RegExp.create = function(str, replacements, flags) {
    for (var id in replacements) {
        var replacement = replacements[id],
            idRegExp = RegExp('{{' + id + '}}', 'gi');

        if (replacement.source) {
            replacement = replacement.source.replace(/^\^|\$$/g, '');
        }

        // Don't add extra parentheses if they already exist
        str = str.replace(RegExp('\\(' + idRegExp.source + '\\)', 'gi'), '(' + replacement + ')');

        str = str.replace(idRegExp, '(?:' + replacement + ')');
    }

    return RegExp(str, flags);
};

(function() {

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
        'color': RegExp.create('\\b{{keyword}}\\b|\\b{{func}}\\B|\\B{{hex}}\\b', {
            keyword: RegExp('^' + colors.join('|') + '$'),
            func: RegExp.create('^(?:rgb|hsl)a?\\((?:\\s*{{number}}%?\\s*,?\\s*){3,4}\\)$', {
                number: number
            }),
            hex: /^#(?:[0-9a-f]{3}){1,2}$/i
        }, 'ig')
    });

    Prism.languages.insertBefore('css', {
        'important': /\B!important\b/gi,
        'abslength': RegExp.create('(\\b|\\B){{number}}{{unit}}\\b', {
            number: number,
            unit: /(cm|mm|in|pt|pc|px)/
        }, 'gi'),
        'easing': RegExp.create('\\b{{bezier}}\\B|\\b{{keyword}}(?=\\s|;|\\}|$)', {
            bezier: RegExp.create('cubic-bezier\\(({{number}},\\s*){3}{{number}}\\)', {
                number: number
            }),
            keyword: /linear|ease(-in)?(-out)?/
        }, 'gi'),
        'time': RegExp.create('(\\b|\\B){{number}}m?s\\b', {
            number: number
        }, 'gi'),
        'angle': RegExp.create('(\\b|\\B){{number}}(deg|g?rad|turn)\\b', {
            number: number
        }, 'gi'),
        'fontfamily': /(("|')[\w\s]+\2,\s*|\w+,\s*)*(sans-serif|serif|monospace|cursive|fantasy)\b/gi,
        'entity': /\\[\da-f]{1,8}/gi
    });

    Prism.languages.html = Prism.languages.markup;
})();
