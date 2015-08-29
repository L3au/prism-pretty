self.onmessage = function (e) {
    console.log(e);
    self.postMessage('form worker');
};
