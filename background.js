function toDate (s) {
  return Date.parse(s) ? new Date(s).toJSON().replace(/T|\.\d+Z$/g, ' ').trim() : s
}

function getHeader (name, headers) {
  var ret = ''

  headers.some(function (header) {
    if (header.name.toLowerCase() === name.toLowerCase()) {
      ret = header.value.toLowerCase()
      return true
    }
  })

  return ret
}

function parseUrl (href) {
  var url = {}
  try {
    url = new (window.URL || window.webkitURL)(href)
  } catch (e) {}

  return url
}

function processRequest (url, headers) {
  var mineTypes = {
    'text/css': 'css',
    'text/javascript': 'js',
    'application/javascript': 'js',
    'application/x-javascript': 'js',
    'application/json': 'js'
  }

  var type
  var contentType = getHeader('content-type', headers)

  for (var mineType in mineTypes) {
    if (mineTypes.hasOwnProperty(mineType)) {
      if (contentType.indexOf(mineType) !== -1) {
        type = mineTypes[mineType]
        break
      }
    }
  }

  var parsedUrl = parseUrl(url)

  if (/\.(md|markdown)$/i.test(parsedUrl.pathname)
    && contentType.match(/(plain|markdown)/)) {
    type = 'markdown'
  }

  headers = headers.map(function (header) {
    var name = header.name
    var value = header.value

    switch (name.toLowerCase()) {
      case 'content-length':
        value = (parseInt(value, 10) / 1024).toFixed(1) + 'K'
        break
      case 'date':
      case 'expires':
      case 'last-modified':
        value = toDate(value)
        break
      default:
        break
    }

    return {
      name: name,
      value: value
    }
  })

  return {
    url: url,
    type: type,
    contentType: contentType,
    headers: headers
  }
}

function setOptions (options, keep) {
  chrome.storage.sync.set(options)
  chrome.contextMenus.removeAll()

  if (options.enabled) {
    chrome.browserAction.setIcon({
      path: {
        '19': 'icon/icon_48.png',
        '38': 'icon/icon_128.png'
      }
    })

    // enable html pretty
    if (~options.formatTypes.indexOf('html')) {
      chrome.contextMenus.create({
        id: 'PrettyPageSource',
        type: 'normal',
        title: 'Pretty Page Source',
        contexts: ['page']
      })
    }
  } else {
    chrome.browserAction.setIcon({
      path: {
        '19': 'icon/icon_disabled.png',
        '38': 'icon/icon_disabled.png'
      }
    })
  }

  if (!keep) {
    chrome.tabs.reload({
      bypassCache: false
    })
  }
}

// click right context menu
chrome.contextMenus.onClicked.addListener(function (info, tab) {
  var tabId = tab.id

  chrome.tabs.sendMessage(tabId, {
    action: 'prettyDocument'
  })
})

// init options
chrome.storage.sync.get(function (options) {
  if (!options || Object.keys(options).length !== 9) {
    options = {
      enabled: true,
      theme: 'dabblet',
      fontSize: '14px',
      indent: 4,
      customCSS: '',
      headers: true,
      unicode: true,
      bugFree: false,
      formatTypes: ['js', 'css', 'markdown']
    }
  }

  setOptions(options, true)
})

// cache requests
var cacheRequests = {}
chrome.webRequest.onHeadersReceived.addListener(function (details) {
  var url = details.url
  var tabId = details.tabId
  var headers = details.responseHeaders
  var request = processRequest(url, headers)

  cacheRequests[tabId] = request

  if (request.type && !request.contentType.includes('charset')) {
    headers = headers.map(function (header) {
      if (header.name.toLowerCase() === 'content-type') {
        header.value = request.contentType + '; charset=utf-8'
      }
      return header
    })

    return {responseHeaders: headers}
  }

  return {}
}, {
  urls: ['<all_urls>'],
  types: ['main_frame']
}, ['blocking', 'responseHeaders'])

// message listener
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  var url = sender.url
  var action = request.action

  // clean cache headers
  var tab = sender.tab || {}

  if (action === 'request') {
    sendResponse(cacheRequests[tab.id] || {url: url})
  }

  try {
    delete cacheRequests[tab.id]
  } catch (e) {}

  if (action === 'prettify') {
    var worker = new Worker('worker.js')

    worker.onerror = function (e) {
      console.error(e)
      worker.terminate()
      worker = null
      sendResponse()
    }
    worker.onmessage = function (e) {
      worker.terminate()
      worker = null
      sendResponse(e.data)
    }

    request.language = navigator.language

    worker.postMessage(request)

    return true
  }
})

// popup readme
chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === 'install') {
    chrome.tabs.create({
      url: 'https://github.com/L3au/Prism-Pretty/',
      active: true
    })
  }
})
