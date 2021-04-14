import { version, parserConfiguration } from 'yargs';
import { URL } from 'url';
import { GUIRedisClient } from './redis';
import { version as versionNumber } from '../package.json';
import { RequestEnd, RedirectError, Left, Right, Result } from './executor';
import { yellow, red, green } from 'colors';

interface RedisGUIArguments {
	[x: string]: unknown
	h: string;
	p: number;
	s: string | undefined;
	a: string | undefined;
	u: string | undefined;
	m: "redis";
	c: boolean;
	_: (number|string)[];
	$0: string;
}

type Mode = 'redis';
const modes: ReadonlyArray<Mode> = ['redis'];

const cli: RedisGUIArguments = version(versionNumber)
	.usage("$0 [OPTIONS] [cmd [arg [arg ...]]]")
	.options({
		"h": {
			alias: "host",
			default: "127.0.0.1",
			describe: 'Server hostname (default: 127.0.0.1).',
			type: 'string'
		},
		"p": {
			alias: "port",
			default: 6379,
			describe: "Server port (default: 6379).",
			type: 'number',
		},
		"s": {
			alias: "socket",
			describe: "Server socket (overrides hostname and port).",
			type: 'string'
		},
		"a": {
			alias: "auth",
			describe: "Server password.",
			type: 'string'
		},
		"u": {
			alias: "uri",
			describe: "Server URI.",
			type: 'string'
		},
		"m": {
			alias: "mode",
			describe: "Server Type, only redis available now.",
			choices: modes,
			default: modes[0]
		},
		"c": {
			alias: "cluster",
			describe: "Enable cluster mode (follow -ASK and -MOVED redirections).",
			boolean: true,
			default: false
		}
	}).argv;

const mode = cli.m;
const cluster = cli.c;

const tranformFromNumberToString = (arr: (number|string)[]) : string[] => {
	return arr.map((item) => item + "")
}

if (mode.toLowerCase() == 'redis') {
	let redisClient: GUIRedisClient;
	if (cli.s !== undefined) {
		redisClient = new GUIRedisClient({ host: cli.s, cluster });
	} else if (cli.u !== undefined) {
		let uri = new URL(cli.u);
		redisClient = new GUIRedisClient({ host: uri.hostname, port: parseInt(uri.port), auth: uri.password, cluster });
	} else {
		redisClient = new GUIRedisClient({ host: cli.h, port: cli.p, auth: cli.a, cluster });
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
