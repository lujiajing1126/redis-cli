import { ReplyError, RedisClient } from "redis";
import { format } from 'util';
require("core-js/stable/array/flat");

const INT_PREFIX = "(integer)";
const BLOCKING_CMDS = ["subscribe", "monitor", "psubscribe"];

export type ConsumerFunc = (result: Result<Error, string | string[]>) => void

export interface Executor {
    run(callback: ConsumerFunc): Promise<void>
    shutdown(): void
}

export interface Left<E> {
    readonly _kind: 'Left'
    readonly left: E
}

export interface Right<T> {
    readonly _kind: 'Right'
    readonly right: T
}

const left = <E extends Error>(err: E): Left<E> => {
    return {
        _kind: 'Left',
        left: err
    }
}

const right = <T>(res: T): Right<T> => {
    return {
        _kind: 'Right',
        right: res
    }
}

export class ExecutorError extends Error {
    name: string
}

export class RedirectError extends ExecutorError {
    readonly hostAndPort: string
    readonly slot: number
    readonly commands: string[]
    readonly key?: string

    constructor(commands: string[], slot: number, hostAndPort: string, key?: string) {
        super(`-> Redirected to slot [${slot}] located at ${hostAndPort}`);
        this.name = "RedirectError";
        this.commands = commands;
        this.key = key;
        this.slot = slot;
        this.hostAndPort = hostAndPort;
    }
}

export class RequestEnd extends ExecutorError {
    constructor() {
        super("Request End");
        this.name = "RequestEnd";
    }
}

const REQ_END = new RequestEnd();

export type Result<E extends Error, T> = Left<E> | Right<T>;

export class BaseExecutor implements Executor {
    protected readonly client: RedisClient
    private readonly originCmds: string[]
    private readonly commands: [string, string[]] | string[]
    protected readonly cmd: string
    private readonly key?: string
    private readonly blockingMode: boolean
    private readonly executor: Function

    constructor(client: RedisClient, commands: string[]) {
        // defensive clone 
        this.originCmds = Array.from(commands);;
        this.client = client;
        this.commands = commands;

        this.cmd = this.commands.shift().toLowerCase();
        this.key = this.commands.length > 0 ? this.commands[0] : undefined;
        this.blockingMode = BLOCKING_CMDS.includes(this.cmd);

        this.executor = this.client[`${this.cmd}Async`];

        // For custom commands, for example, commands in custom modules
        if (typeof this.executor !== "function") {
            this.executor = this.client[`send_commandAsync`];
            // recombine commands
            this.commands = [this.cmd, this.commands];
        }
    }

    writeResult(result: any): string | string[] {
        if (Array.isArray(result)) {
            return result.map((item, idx) => {
                if (Array.isArray(item)) {
                    return item.map((elem: string | string[], jdx) => {
                        if (jdx === 0) {
                            return format(`%d) %d) %s`, idx + 1, jdx + 1, elem);
                        } else {
                            return (elem as string[]).map((val, kdx) => {
                                if (kdx == 0) {
                                    return format(`   %d) %d) "%s"`, jdx + 1, kdx + 1, val);
                                } else {
                                    return format(`      %d) "%s"`, kdx + 1, val);
                                }
                            });
                        }
                    }).flat();
                } else {
                    return format("%d) %s", idx + 1, item);
                }
            }).flat();
        } else if (result === null) {
            return "(nil)";
        } else if (typeof result === 'object') {
            return Object.entries(result as { [key: string]: string }).flat().map((item, index) => {
                return `${index + 1}) "${item}"`;
            });
        } else {
            // number or string
            // default to print it as `string`
            return format(Number.isInteger(result) ? `${INT_PREFIX} ${result}` : result);
        }
    }

    async run(callback: ConsumerFunc): Promise<void> {
        try {
            const result: any = await this.executor.apply(this.client, this.commands);
            callback(right(this.writeResult(result)));
            if (!this.blockingMode) callback(left(REQ_END));
        } catch (e) {
            if (e instanceof ReplyError) {
                if (e.code === "MOVED") {
                    const matched = e.message.match(/MOVED (\d+) ([\d\.:]+)/);
                    const slot = parseInt(matched[1]);
                    const newEndpoint = matched[2];
                    callback(left(new RedirectError(this.originCmds, slot, newEndpoint, this.key)));
                    return;
                }
                callback(left(e));
            } else if (e instanceof Error) {
                callback(left(e));
            } else {
                throw e;
            }
        }
    }

    shutdown(): void {
        // do nothing
    }

    static of(client: RedisClient, commands: string[]) {
        const CMD = commands[0].toLowerCase();
        if (CMD === 'subscribe') {
            return new SubscribeExecutor(client, commands);
        } else if (CMD === 'psubscribe') {
            return new PatternSubscribeExecutor(client, commands);
        } else if (CMD === 'monitor') {
            return new MonitorExecutor(client, commands);
        } else {
            return new BaseExecutor(client, commands);
        }
    }
}

export class SubscribeExecutor extends BaseExecutor {
    constructor(client: RedisClient, commands: string[]) {
        super(client, commands);
    }

    async run(callback: ConsumerFunc): Promise<void> {
        if (this.cmd === "subscribe") {
            this.client.on("subscribe", (_channel, _count) => { });

            this.client.on("message", (_channel, message) => {
                callback(right(this.writeResult(message)));
            });
        }
        return super.run(callback);
    }

    shutdown() {
        this.client.unsubscribe();
    }
}

export class PatternSubscribeExecutor extends SubscribeExecutor {
    constructor(client: RedisClient, commands: string[]) {
        super(client, commands);
    }

    async run(callback: ConsumerFunc): Promise<void> {
        this.client.on("psubscribe", (_pattern, _count) => { });

        this.client.on("pmessage", (_pattern, _channel, message) => {
            callback(right(this.writeResult(message)));
        });
        return super.run(callback);
    }
}

export class MonitorExecutor extends BaseExecutor {
    constructor(client: RedisClient, commands: string[]) {
        super(client, commands);
    }

    async run(callback: ConsumerFunc): Promise<void> {
        this.client.on("monitor", (time, args, raw_reply) => {
            callback(right(this.writeResult(raw_reply)));
        });
        return super.run(callback);
    }
}
