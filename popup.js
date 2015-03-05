(function() {
    var options, timer;
    var form = $('form');
    var template = tplEngine($('#template').html());
    var background = chrome.extension.getBackgroundPage();

    function getOptions() {
        var disabledEls = $('[disabled]');

        if (disabledEls.length > 0) {
            disabledEls.removeAttr('disabled');
        }

        return form.serializeJSON();
    }

    function updateView() {
        options.lang = navigator.language.match('zh');

        form.html(template.render(options));

        $('[data-toggle="radio"]').radiocheck();
        $('[data-toggle="checkbox"]').radiocheck();
        $('[data-toggle="switch"]').bootstrapSwitch();
    }

    function tplEngine(str) {
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

    $.extend($.serializeJSON.defaultOptions, {
        parseAll: true,
        checkboxUncheckedValue: 'false',
        useIntKeysAsArrayIndex: true,
        parseWithFunction: function (val, name) {
            return val;
        }
    });

    chrome.storage.sync.get(function (data) {
        options = $.extend(true, {}, data);

        updateView();

        $('html').addClass('popup-show');
    });

    form.on('submit', function (e) {
        e.preventDefault();

        var options = getOptions();

        background.setOptions(options);

        window.close();
    });

    form.on('switchChange.bootstrapSwitch', '.pretty-enabled', function (event, state) {
        clearTimeout(timer);

        options = getOptions();

        timer = setTimeout(function () {
            options.enabled = state;
            updateView();
        }, 250);
    });
}).call();
