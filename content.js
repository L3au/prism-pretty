var rootEl

function $ (v, c) {
  return (c || document).querySelector(v)
}

function $$ (v, c) {
  return [].slice.call((c || document).querySelectorAll(v))
}

function execScript (content) {
  var script = document.createElement('script')

  script.textContent = 'try{' + content + '}catch(e){}'

  document.head.appendChild(script)

  script.remove()
}

function detectCSS (content) {
  var type
  var style = document.createElement('style')

  style.textContent = content

  document.head.appendChild(style)

  if (style.sheet.rules.length) {
    type = 'css'
  }

  style.remove()

  return type
}

function App () {
  this.init()
}

App.prototype = {
  constructor: App,

  init: function () {
    var self = this

    var contentPromise = new Promise(function (resolve, reject) {
      function onLoad () {
        rootEl = document.documentElement

        var content
        var body = document.body || {children: []}
        var children = body.children
        var pre = children[0]

        if (children.length === 0) {
          content = body.textContent
        }

        if (pre && pre.nodeName === 'PRE'
          && pre.getAttribute('style')) {
          content = pre.textContent
        }

        if (!content || !content.trim()) {
          reject()

          return chrome.runtime.sendMessage({
            action: 'clean'
          })
        }

        resolve(content)
      }

      if (document.readyState === 'complete') {
        onLoad()
      } else {
        document.addEventListener('DOMContentLoaded', onLoad)
      }
    })

    Promise.all([
      contentPromise,
      new Promise(function (resolve, reject) {
        chrome.storage.sync.get(function (options) {
          self.options = options

          if (!options.enabled) {
            return reject()
          }

          resolve(options)
        })
      }),
      new Promise(function (resolve) {
        chrome.runtime.sendMessage({
          action: 'request'
        }, function (request) {
          self.request = request
          resolve(request)
        })
      })
    ]).then(function (result) {
      var content = result[0]
      var options = result[1]
      var request = result[2]

      self.content = content

      if (!self.parseContent()) {
        return
      }

      if (request.type == 'markdown') {
        options.theme = 'markdown'
      }

      self.sendPrettyMsg()
    }).catch(function (e) {
      // ignore promise exception
    })

    self.addEvents()
  },

  loading: function () {
    var options = this.options
    var classList = [
      'prism-pretty',
      'prism-pretty-spinner',
      'prism-pretty-' + options.theme
    ]

    classList.forEach(function (cls) {
      rootEl.classList.add(cls)
    })
  },

  unloading: function () {
    var options = this.options
    var classList = [
      'prism-pretty',
      'prism-pretty-spinner',
      'prism-pretty-' + options.theme
    ]

    classList.forEach(function (cls) {
      rootEl.classList.remove(cls)
    })
  },

  addEvents: function () {
    var self = this

    chrome.storage.onChanged.addListener(function () {
      if (rootEl.classList.contains('prism-pretty')) {
        location.reload(true)
      }
    })

    chrome.runtime.onMessage.addListener(function (request) {
      var action = request.action

      if (action === 'prettyDocument') {
        if (rootEl.classList.contains('prism-pretty')) {
          location.reload(true)
          return
        }

        self.request.type = 'html'

        // pretty html
        self.sendPrettyMsg()
      }
    })
  },

  parseContent: function () {
    var content = this.content
    var options = this.options
    var request = this.request

    var type = request.type
    var types = options.formatTypes
    var url = new URL(request.url)

    if (/\.(md|markdown)$/i.test(url.pathname) && (url.protocol === 'file:')) {
      type = 'markdown'
    }

    if (/\.(js|jsx)$/i.test(url.pathname)) {
      type = 'js'
    }

    if (!type) {
      try {
        JSON.parse(content)
        type = 'js'
      } catch (e) {
        type = detectCSS(content)
      }
    }

    request.type = type

    if (!type || !~types.indexOf(type)) {
      return
    }

    return true
  },

  sendPrettyMsg: function () {
    var self = this

    var content = self.content
    var options = self.options
    var request = self.request

    self.loading()

    chrome.runtime.sendMessage(Object.assign({
      action: 'prettify',
      content: content,
      options: options,
      language: navigator.language
    }, request), function (response) {
      if (!response) {
        return self.unloading()
      }

      var title = document.title
      var className = 'prism-pretty'

      className += ' pretty-theme-' + options.theme
      className += ' pretty-size-' + options.fontSize

      var meta = '<meta name="viewport" content="width=device-width,initial-scale=1">'

      var fontSrc = chrome.runtime.getURL('css/droid-sans-mono.woff2')
      var fontStyle = '@font-face{font-family:"Droid Sans Mono";src:url("fontSrc") format("woff2");}'

      fontStyle = '<style>' + fontStyle.replace('fontSrc', fontSrc) + '</style>'

      rootEl.innerHTML = '<head>' + meta + fontStyle + '</head><body>' + response + '</body>'
      rootEl.className = className

      if (title) {
        document.title = 'Prism Pretty: ' + title
      }

      // headers fade
      var headerEl = $('.request-headers')
      if (headerEl) {
        setTimeout(function () {
          headerEl.style.opacity = 0
        }, 3000)
      }

      // preview css
      var wrap
      if (wrap = $('.preview-wrap')) {
        var script = $('script', wrap)

        if (script) {
          execScript(script.textContent)
          script.remove()
        }
      }

      // markdown hash restore
      if (request.type === 'markdown') {
        var hash = location.hash.slice(1)

        if (!hash) {
          return
        }

        var anchors = $$('.anchor')
        var anchor

        anchors.some(function (a) {
          if (a.id === hash) {
            anchor = a
            return true
          }
        })

        if (anchor) {
          setTimeout(function () {
            window.scrollTo(0, anchor.getBoundingClientRect().top - 10)
          })
        }
      }
    })
  }
}

new App()
