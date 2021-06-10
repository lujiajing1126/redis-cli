import { default as yargs } from 'yargs';
import { URL } from 'url';
import { GUIRedisClient } from './redis';
import { version as versionNumber } from '../package.json';
import { RequestEnd, RedirectError, Left, Right, Result } from './executor';
import { yellow, red, green } from 'colors';

interface RedisGUIArguments {
	[x: string]: unknown;
	host: string;
	port: number;
	socket: string | undefined;
	auth: string | undefined;
	u: string | undefined;
	mode: "redis";
	cluster: boolean;
	tls: boolean;
	_: (number|string)[];
	$0: string;
}

type Mode = 'redis';
const modes: ReadonlyArray<Mode> = ['redis'];

const cli: RedisGUIArguments = yargs(process.argv.slice(2))
	.version(versionNumber)
	.usage("$0 [OPTIONS] [cmd [arg [arg ...]]]")
	.options({
		"host": {
			alias: "h",
			default: "127.0.0.1",
			describe: 'Server hostname (default: 127.0.0.1).',
			type: 'string'
		},
		"port": {
			alias: "p",
			default: 6379,
			describe: "Server port (default: 6379).",
			type: 'number',
		},
		"socket": {
			alias: "s",
			describe: "Server socket (overrides hostname and port).",
			type: 'string'
		},
		"auth": {
			alias: "a",
			describe: "Server password.",
			type: 'string'
		},
		"u": {
			describe: "Server URI.",
			type: 'string'
		},
		"mode": {
			alias: "m",
			describe: "Server Type, only redis available now.",
			choices: modes,
			default: modes[0]
		},
		"cluster": {
			alias: "c",
			describe: "Enable cluster mode (follow -ASK and -MOVED redirections).",
			boolean: true,
			default: false
		},
		"tls": {
			describe: "Establish a secure TLS connection.",
			type: 'boolean',
			default: false
		}
	}).parseSync();

const mode = cli.mode;
const cluster = cli.cluster;
const tls = cli.tls;

const tranformFromNumberToString = (arr: (number|string)[]) : string[] => {
	return arr.map((item) => item + "")
}

if (mode.toLowerCase() == 'redis') {
	let redisClient: GUIRedisClient;
	if (cli.s !== undefined) {
		redisClient = new GUIRedisClient({ host: cli.socket, cluster, tls});
	} else if (cli.u !== undefined) {
		let uri = new URL(cli.u);
		redisClient = new GUIRedisClient({ host: uri.hostname, port: parseInt(uri.port), auth: uri.password, cluster, tls});
	} else {
		redisClient = new GUIRedisClient({ host: cli.host, port: cli.port, auth: cli.auth, cluster, tls});
	}
	if (cli._ && cli._.length > 0) {
		const callback = (result: Result<Error, string | string[]>) => {
			if (result._kind == 'Left') {
				if (result.left instanceof RequestEnd) {
					redisClient.shutdown();
				} else if (result.left instanceof RedirectError) {
					if (cluster) {
						let endpoint = result.left.hostAndPort;
						let key = result.left.key;
						let newClient = redisClient.getOrCreateClient(key, endpoint);
						redisClient.next = yellow(result.left.message);
						redisClient.execute(result.left.commands, callback, newClient);
					} else {
						redisClient.next = red(`MOVED slot=${result.left.slot} node=${result.left.hostAndPort}`);
					}
				} else {
					redisClient.next = red((result as Left<Error>).left.message);
				}
			} else {
				let resp = (result as Right<string | string[]>).right;
				if (Array.isArray(resp)) {
					for (let item of resp) {
						redisClient.next = green(item);
					}
				} else {
					redisClient.next = green(resp);
				}
			}
		}
		redisClient.execute(tranformFromNumberToString(cli._), callback).then(() => {
			redisClient.shutdown();
		});
	} else {
		redisClient.attachEvent();
	}
} else {
	console.log("Not Support %s Now!", mode);
}
