
var Sessionify = require('./index.js');

var serverObj = new Sessionify.Server();

serverObj.configure({
	secret: 'gica123'
});
serverObj.listen(function(err) {
	console.log("Listening.", err);
});