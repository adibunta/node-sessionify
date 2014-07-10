/*
* This is a slave example.
* The slave will connect to the master and the master will broadcast to all the slaves
* that a slave has just connected.
* */

var Sessionify = require('./../index.js');

var serverObj = new Sessionify.Server({
	master: {
		host: '127.0.0.1',
		port: 18555
	}
});

serverObj.listen(function() {
	console.log('On port: ' + serverObj.config.port);
});