const program = require('commander');
const url = require('url');
const RedisClient = require('./lib/redis').RedisClient;
const version = require('./package.json').version;

program.version(version)
	.usage("rdcli [OPTIONS] [cmd [arg [arg ...]]]")
	.option("-h, --host <hostname>", 'Server hostname (default: 127.0.0.1).')
	.option("-p, --port <port>", "Server port (default: 6379).", parseInt)
	.option("-s, --socket <socket>", "Server socket (overrides hostname and port).")
	.option("-a, --auth <password>", 'Server password.')
	.option("-u, --uri <uri>", 'Server URI.')
	.option("-m, --mode <mode>", "Server Type, only redis available now.")
	.parse(process.argv);

const parsedURL = program.uri ? url.parse(program.uri) : {};
const host = program.host || parsedURL.hostname || "127.0.0.1";
const port = program.port || parsedURL.port || 6379;
const auth = program.auth || null;
const mode = program.mode || "redis";

const socket = program.socket;
if (mode.toLowerCase() == 'redis') {
	let redisClient;
	if (socket !== undefined) {
		redisClient = new RedisClient(socket);
	} else {
		redisClient = new RedisClient(host, port, auth);
	}
	if (program.args && program.args.length > 0) {
		redisClient.execute(program.args)
			.then(function () {
				redisClient.client.quit();
			});
	} else {
		redisClient.attachEvent();
	}
} else {
	console.log("Not Support %s Now!", mode);
}