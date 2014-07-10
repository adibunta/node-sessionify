/*
* We will expose only the Server and the Store.
* */
module.exports = {
	Client: require('./lib/client.js'),
	Server: require('./lib/server.js')
};