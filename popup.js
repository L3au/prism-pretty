(function () {
    var options, initOptions;
    var form       = $('form');
    var lang       = navigator.language.match('zh');
    var template   = tplEngine($('#template').html());
    var background = chrome.extension.getBackgroundPage();

    function getOptions() {
        var json;
        var disabledEls = $('[disabled]');

        if (disabledEls.length > 0) {
            disabledEls.attr('data-disabled', true);
            disabledEls.removeAttr('disabled');
        }

        json = form.serializeJSON();

        // restore
        disabledEls.attr('disabled', '');
        disabledEls.removeAttr('data-disabled');

        return json;
    }

    function updateView() {
        form.html(template.render($.extend(true, {
            lang: lang
        }, options)));

        $('[data-toggle="radio"]').radiocheck();
        $('[data-toggle="checkbox"]').radiocheck();
        $('[data-toggle="switch"]').bootstrapSwitch();

        changeBtnStatus();
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

    function changeBtnStatus() {
        var curOptions = getOptions();
        var submitBtn  = $('[type=submit]');

        if (JSON.stringify(initOptions) != JSON.stringify(curOptions)) {

            submitBtn.addClass('btn-danger');
            submitBtn.removeClass('btn-primary');
        } else {
            submitBtn.addClass('btn-primary');
            submitBtn.removeClass('btn-danger');
        }
    }

    $.extend($.serializeJSON.defaultOptions, {
        parseAll              : true,
        checkboxUncheckedValue: 'false',
        useIntKeysAsArrayIndex: true,
        parseWithFunction     : function (val, name) {
            return val;
        }
    });

    chrome.storage.sync.get(function (data) {
        options = $.extend(true, {}, data);

        updateView();

        options = getOptions();

        // compare with init options
        initOptions = $.extend(true, {}, options);

        changeBtnStatus();

        $('html').addClass('popup-show');
        $('.help').addClass('help-' + (lang ? 'zh' : 'en' ));
    });

    form.on('change', function (e) {
        changeBtnStatus();
    });

    form.on('submit', function (e) {
        e.preventDefault();

        if (!$('[type=submit]').hasClass('btn-danger')) {
            window.close();
            return;
        }

        var options = getOptions();

        background.setOptions(options);

        window.close();
    });

    form.on('switchChange.bootstrapSwitch', function (event, state) {
        var target = $(event.target);

        changeBtnStatus();

        if (target.hasClass('pretty-enabled')) {
            options = getOptions();

            setTimeout(function () {
                options.enabled = state;
                updateView();
            }, 250);
        }
    });
}).call();
