define(function () {
  var template = function anonymous(it) {
var out='<div class="request-headers"> '; if (it.ContentType) { out+=' <dl class="type"> <dt>Content Type</dt> <dd>'+( it.ContentType )+'</dd> </dl> '; } out+=' '; if (it.Server) { out+=' <dl class="server"> <dt>Server</dt> <dd>'+( it.Server )+'</dd> </dl> '; } out+=' '; if (it.ServerIp) { out+=' <dl class="ip"> <dt>Server IP</dt> <dd>'+( it.ServerIp )+'</dd> </dl> '; } out+=' '; if (it.Size) { out+=' <dl class="size"> <dt>Size</dt> <dd>'+( it.Size )+'</dd> </dl> '; } out+=' '; if (it.Date) { out+=' <dl class="date"> <dt>Date</dt> <dd>'+( it.Date )+'</dd> </dl> '; } out+=' '; if (it.LastModified) { out+=' <dl class="modified"> <dt>Last Modified</dt> <dd>'+( it.LastModified )+'</dd> </dl> '; } out+='</div>';return out;
};

  return {
    render: function (data) {
      return template(data || {});
    }
  };
});