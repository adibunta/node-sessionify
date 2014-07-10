var Sessionify = require('./../index.js');

var serverObj = new Sessionify.Server({});

serverObj.listen(function() {
	console.log('On port: ' + serverObj.config.port);
});