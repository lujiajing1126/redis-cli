const colors = require('colors');
const util = require('util');
const { ReplyError } = require('redis');

const INT_PREFIX = "(integer)";
const BLOCKING_CMDS = ["subscribe", "monitor", "psubscribe"];

class Executor {

    constructor(client, commands) {
        this._client = client;
        this.commands = commands;

        this.CMD = this.commands.shift().toLowerCase();
        this.KEY = this.commands.length > 0 ? this.commands[0] : undefined;
        this.blockingMode = BLOCKING_CMDS.includes(this.CMD);

        // get a cached client or just the default one
        this.currentClient = this._client.getOrCreateClient(this.KEY);

        this._executor = this.currentClient[`${this.CMD}Async`];

        if (this._executor === undefined) {
            throw new Error("cannot find executor...");
        }

        if (typeof this._executor !== "function") {
            this._executor = this.currentClient[`send_commandAsync`];
            // recombine commands
            this.commands = [this.CMD, this.commands];
        }
    }

    writeResult(result) {
        if (Array.isArray(result)) {
            this._client.next = result.map((item, index) => {
                return util.format("%d) %s", index + 1, item);
            });
        } else if (result === null) {
            this._client.next = "(nil)";
        } else if (typeof result === 'object') {
            this._client.next = Object.entries(result).flat().map((item, index) => {
                return util.format("%d) %s", index + 1, item);
            });
        } else {
            // number or string
            // default to print it as `string`
            this._client.next = util.format(Number.isInteger(result) ? `${INT_PREFIX} ${result}` : result);
        }
    }

    run() {
        return this._executor.bind(this.currentClient)(...this.commands)
            .then((result) => {
                this.writeResult(result);
                return this.blockingMode;
            }).catch((e) => {
                if (e instanceof ReplyError) {
                    if (e.code === "MOVED") {
                        const matched = e.message.match(/MOVED (\d+) ([\d\.:]+)/);
                        const slot = matched[1];
                        const newEndpoint = matched[2];
                        this.currentClient = this._client.getOrCreateClient(this.KEY, newEndpoint);
                        this._client.next = colors.yellow(`-> Redirected to slot [${slot}] located at ${newEndpoint}`)
                        return this.run();
                    }
                }
                this._client.next = colors.red(`(error) ${e.message}`);
            });
    }

    shutdown() {
        // do nothing
    }
}

class SubscribeExecutor extends Executor {
    constructor(client, commands) {
        super(client, commands);
    }

    run() {
        this._client.defaultClient.on("subscribe", (channel, count) => {});

        this._client.defaultClient.on("message", (channel, message) => {
            this.writeResult(message);
        });
        return super.run();
    }

    shutdown() {
        this._client.defaultClient.unsubscribe();
    }
}

class PatternSubscribeExecutor extends SubscribeExecutor {
    constructor(client, commands) {
        super(client, commands);
    }

    run() {
        this._client.defaultClient.on("psubscribe", (pattern, count) => {});

        this._client.defaultClient.on("pmessage", (pattern, channel, message) => {
            this.writeResult(message);
        });
        return super.run();
    }
}

class MonitorExecutor extends Executor {
    constructor(client, commands) {
        super(client, commands);
    }

    run() {
        this._client.defaultClient.on("monitor", (time, args, raw_reply) => {
            this.writeResult(raw_reply);
        });
        return super.run();
    }
}

module.exports = function (client, commands) {
    const CMD = commands[0].toLowerCase();
    if (CMD === 'subscribe') {
        return new SubscribeExecutor(client, commands);
    } else if (CMD === 'psubscribe') {
        return new PatternSubscribeExecutor(client, commands);
    } else if (CMD === 'monitor') {
        return new MonitorExecutor(client, commands);
    } else {
        return new Executor(client, commands);
    }
}