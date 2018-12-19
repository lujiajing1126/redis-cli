var co = require('co');
var readline = require('readline');
var program = require('commander');
var url = require('url');

program.version('1.0.2')
	.usage("rdcli [OPTIONS] [cmd [arg [arg ...]]]")
	.option("-h, --host <hostname>",'Server hostname (default: 127.0.0.1).')
	.option("-p, --port <port>","Server port (default: 6379).", parseInt)
	.option("-s, --socket <socket>","Server socket (overrides hostname and port).")
	.option("-a, --auth <password>",'Server password.')
	.option("-u, --uri <uri>",'Server URI.')
	.option("-m, --mode <mode>","Server Type, only redis available now.")
	.parse(process.argv);

var parsedURL = program.uri ? url.parse(program.uri) : {};
var host = program.host || parsedURL.hostname || "127.0.0.1";
var port = program.port || parsedURL.port || 6379;
var auth = program.auth || null;
var mode = program.mode || "redis";
	
var socket = program.socket;
if(mode.toLowerCase() == 'redis') {
	if(socket !== undefined) {
		require('./lib/redis')(socket);
	} else {
		require('./lib/redis')(host, port, auth);
	}
} else {
	console.log("Not Support %s Now!", mode);
}
