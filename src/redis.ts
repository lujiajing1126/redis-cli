import { RedisClient, createClient } from 'redis';
import { createInterface, Interface, cursorTo, clearScreenDown } from 'readline';
import { promisifyAll } from 'bluebird';
import { BaseExecutor, ConsumerFunc, Left, Right, RedirectError, RequestEnd, Result } from './executor';
const s = require('redis-splitargs');
import { red, green, yellow } from 'colors';
import { InputBuffer } from './buf';

class PromptResult { }
class ExitResult {
	code: number
	constructor(code: number) {
		this.code = code;
	}
}

export const __PR__ = new PromptResult();
const __NORMAL_EXIT__ = new ExitResult(0);
const __ABNORMAL_EXIT__ = new ExitResult(-1);

interface GUIRedisClientOption {
	host: string
	port?: number
	auth?: string
	cluster: boolean
}

export class GUIRedisClient {
	private rl: Interface
	private readonly clusters: Record<string, RedisClient>
	private readonly keyLocationCache: Record<string, string>

	private readonly defaultNodeName: string
	private executor: BaseExecutor
	private clusterMode: boolean

	constructor(opt: GUIRedisClientOption) {
		this.clusters = {};
		// the key of keyLocationCache is key stored in the redis,
		// while the value is the cached `host:port`
		this.keyLocationCache = {};
		if (opt.port == undefined) {
			this.defaultNodeName = opt.host;
		} else {
			this.defaultNodeName = `${opt.host}:${opt.port}`;
		}

		this.clusters[this.defaultNodeName] = GUIRedisClient.createRedisClient(this.defaultNodeName);

		if (opt.auth) {
			this.defaultClient.auth(opt.auth);
		}
		this.clusterMode = opt.cluster;

		this.attachRedisEvent(this.defaultClient);
	}

	private initReadline() {
		this.rl = createInterface(process.stdin, process.stdout);
		this.rl.setPrompt(`${this.defaultNodeName}> `);
		this.rl.prompt();
	}

	private attachRedisEvent(client: RedisClient) {
		client.on("end", (_err) => {
			// Exit application when Redis session is ended.
			this.next = __NORMAL_EXIT__;
		});

		client.on("error", (err) => {
			this.next = red(`(error) ${err.message}`);

			// Return non-zero value for error.
			this.next = __ABNORMAL_EXIT__;
		});
	}

	execute(commands: string[], callback: ConsumerFunc, client?: RedisClient): Promise<void> {
		let c = client ?? this.defaultClient;
		this.executor = BaseExecutor.of(c, commands);
		return this.executor.run(callback);
	}

	attachEvent() {
		this.initReadline();
		this.rl.on('line', (line) => {
			this.handleInput(line);
		}).on('close', () => {
			// trigger when `SIGINT` received
			this.next = '\nAbort!';
			this.next = __NORMAL_EXIT__;
		});
	}

	handleInput(line: string): Promise<void> {
		line = new InputBuffer(line).render();
		try {
			let command = line.trim();
			if (command === "") {
				this.next = __PR__;
				return;
			}
			let commands: string[] = s(command);
			if (commands.length !== 0) { // we have commands, so process, otherwise just a new prompt
				const CMD = commands.shift().toLowerCase();
				//`exit` and `clear` are not true commands, just part of REPL
				if (CMD === 'exit') {
					// all connections will be closed after `RedisClient` quit
					// and an `end` event will be emitted to exit process.
					if (this.executor) this.executor.shutdown();
					this.defaultClient.quit();
				} else if (CMD === 'clear') {
					this.next = '\x1b[0f'; /* ANSI clear screen code */
					cursorTo(process.stdout, 0, 0);
					clearScreenDown(process.stdout);
					this.next = __PR__;
				} else {
					return this.execute([CMD, ...commands], this.responseCallback);
				}
			}
		} catch (err) {
			this.next = red(`(error) ${err.message}`);
			this.next = __PR__;
		}
	}

	responseCallback = (result: Result<Error, string | string[]>) => {
		if (result._kind == 'Left') {
			if (result.left instanceof RequestEnd) {
				this.next = __PR__;
			} else if (result.left instanceof RedirectError) {
				if (this.clusterMode) {
					let endpoint = result.left.hostAndPort;
					let key = result.left.key;
					let newClient = this.getOrCreateClient(key, endpoint);
					this.next = yellow(result.left.message);
					this.execute(result.left.commands, this.responseCallback, newClient);
				} else {
					this.next = red(`MOVED slot=${result.left.slot} node=${result.left.hostAndPort}`);
					this.next = __PR__;
				}
			} else {
				this.next = red("(error) " + (result as Left<Error>).left.message);
				this.next = __PR__;
			}
		} else {
			let resp = (result as Right<string | string[]>).right;
			if (Array.isArray(resp)) {
				this.next = resp.map((item) => green(item));
			} else {
				this.next = green(resp);
			}
		}
	}

	set next(v: any) {
		if (typeof v === 'string') {
			console.log(v);
		} else if (Array.isArray(v)) {
			console.log(v.join("\n"));
		} else if (v instanceof PromptResult) {
			this.rl.prompt();
		} else if (v instanceof ExitResult) {
			process.exit(v.code);
		}
	}

	get defaultClient() {
		return this.clusters[this.defaultNodeName]
	}

	static createRedisClient(connectionUrl: string): RedisClient {
		let client = undefined;
		let colonPos = connectionUrl.indexOf(":");
		if (colonPos >= 0) {
			let port = parseInt(connectionUrl.substr(colonPos + 1));
			let host = connectionUrl.substr(0, colonPos);
			client = createClient(port, host);
		} else {
			client = createClient(connectionUrl);
		}
		promisifyAll(client);
		return client;
	}

	getOrCreateClient(key: string, server: string) {
		if (server !== undefined) {
			if (this.clusters[server]) {
				if (key !== undefined) this.keyLocationCache[key] = server;
				return this.clusters[server];
			}
			let client = GUIRedisClient.createRedisClient(server);
			client.removeAllListeners();
			client.unref();
			if (key !== undefined) {
				this.keyLocationCache[key] = server;
				this.clusters[server] = client;
			}
			return client;
		}

		if (key !== undefined) {
			let cachedNodeName = this.keyLocationCache[key];
			if (cachedNodeName !== undefined) return this.clusters[cachedNodeName];
		}

		return this.defaultClient;
	}

	shutdown() {
		Object.entries(this.clusters).forEach(([_name, client]) => {
			client.removeAllListeners();
			client.quit();
		});
		if (this.rl) {
			this.rl.close();
		}
	}

	get GUIInterface() {
		return this.rl;
	}
}
