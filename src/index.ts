import { version, option, usage, number } from 'yargs';
import { URL } from 'url';
import { GUIRedisClient } from './redis';
import { version as versionNumber } from '../package.json';

interface RedisGUIArguments {
	[x: string]: unknown
	h: string;
    p: number;
    s: string | undefined;
    a: string | undefined;
    u: string | undefined;
    m: "redis";
	c: boolean;
	_: string[];
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

if (mode.toLowerCase() == 'redis') {
	let redisClient: GUIRedisClient;
	if (cli.s !== undefined) {
		redisClient = new GUIRedisClient({ host: cli.s });
	} else if (cli.u !== undefined) {
		let uri = new URL(cli.u);
		redisClient = new GUIRedisClient({ host: uri.hostname, port: parseInt(uri.port), auth: uri.password });
	} else {
		redisClient = new GUIRedisClient({ host: cli.h, port: cli.p, auth: cli.a });
	}
	if (cli._ && cli._.length > 0) {
		redisClient.execute(cli._, () => {
			// TODO: quit?
		});
	} else {
		redisClient.attachEvent();
	}
} else {
	console.log("Not Support %s Now!", mode);
}