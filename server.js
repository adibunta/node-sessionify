
var Sessionify = require('./index.js');

var serverObj = new Sessionify.Server();

serverObj.configure({
	secret: 'gica123',
	store: new Sessionify.FileStore({
		path: __dirname + "/store.db",
		save: 2
	}, 120),
	master: {
		host: '127.0.0.1',
		port: 18555
	}
});
serverObj.listen(function(err) {
	console.log("Listening. Master:" + serverObj.isMaster + ", port: " + serverObj.config.port);
});