/**
 * Integration tests for Redis-CLI
 */
const RedisClient = require('../lib/redis').RedisClient;
const util = require('util');
const _log = global.console.log;
const colors = require('colors');

let spy = {};

let outputData = "";
let redisClient = {};

// DO NOT use arrow => here
const storeLog = function() {
    outputData += util.format.apply(util, Array.from(arguments));
    outputData += "\n";
}

const wrapOutput = (line) => {
    return line + "\n";
}

const cleanOutput = () => {
    outputData = "";
}

beforeEach(() => {
    cleanOutput();
});

beforeAll(() => {
    redisClient = new RedisClient("127.0.0.1", 6379);
    /**
     * Call unref() on the underlying socket connection to the Redis server, allowing the program to exit once no more commands are pending.
     * This is an experimental feature, as documented in the following site:
     * https://github.com/NodeRedis/node_redis#clientunref
     */
    redisClient._redis_client.unref();
    // remove all listener to avoid async callback
    redisClient._redis_client.removeAllListeners();
    // mock `console.log`
    spy.log = jest.spyOn(global.console, 'log').mockImplementation(storeLog);
    return redisClient.execute(['flushall']);
});

afterAll(() => {
    redisClient._redis_client.quit();
    spy.log.mockRestore();
});

describe('key value getter/setter', () => {
    it('SET key/value returns string literal OK', () => {
        return redisClient.execute(["set", "key", "value"]).then(() => {
            expect(spy.log).toHaveBeenCalled();
            expect(outputData).toBe(wrapOutput("OK"));
        });
    });

    it('GET key returns previously set value', () => {
        return redisClient.execute(["get", "key"]).then(() => {
            expect(spy.log).toHaveBeenCalled();
            expect(outputData).toBe(wrapOutput("value"));
        });
    });

    it('GET key returns previously set value, not equality', () => {
        return redisClient.execute(["get", "key"]).then(() => {
            expect(spy.log).toHaveBeenCalled();
            expect(outputData).not.toBe(wrapOutput("Value"));
        });
    });

    it('INCR returns with integer counter', () => {
        return redisClient.execute(["set", "mykey", "10"]).then(() => {
            expect(spy.log).toHaveBeenCalled();
            cleanOutput()
            return redisClient.execute(["incr", "mykey"]).then(() => {
                expect(spy.log).toHaveBeenCalled();
                expect(outputData).toBe(wrapOutput("(integer) 11"));
            });
        });
    });
});

describe('hash getter/setter', () => {
    it('SET hash returning 1 means a new field in the hash and value was set', () => {
        return redisClient.execute(["hset", "myhash", "field1", "Hello"]).then(() => {
            expect(spy.log).toHaveBeenCalled();
            expect(outputData).toBe(wrapOutput("(integer) 1"));
        });
    });

    it('GET hash return set value', () => {
        return redisClient.execute(["hget", "myhash", "field1"]).then(() => {
            expect(spy.log).toHaveBeenCalled();
            expect(outputData).toBe(wrapOutput("Hello"));
        });
    });

    it('HGETALL displayed in rows', () => {
        return redisClient.execute(["hgetall", "myhash"]).then(() => {
            expect(spy.log).toHaveBeenCalled();
            expect(outputData).toBe(wrapOutput(`1) field1
2) Hello`));
        });
    })
});

describe('test third party modules', () => {
    it('without installing specific module', () => {
        // TODO: check colors also!
        colors.disable();
        return redisClient.execute(["FT.SEARCH", "permits", 'car', "LIMIT", "0", "0"]).then(() => {
            expect(spy.log).toHaveBeenCalled();
            expect(outputData.trim()).toBe(colors.red('(error) ERR unknown command `ft.search`, with args beginning with: `permits`, `car`, `LIMIT`, `0`, `0`,'));
            colors.enable();
        });
    });
});

describe('array return tests', () => {
    it('lpush returns integer', () => {
        return redisClient.execute(['LPUSH', 'alist', '1', '2', '3']).then(() => {
            expect(spy.log).toHaveBeenCalled();
            expect(outputData).toBe(wrapOutput("(integer) 3"));
        });
    });


    it('lrange returns ints setup', () => {
        return redisClient.execute(['LRANGE', 'alist', '0', '-1']).then(() => {
            expect(spy.log).toHaveBeenCalled();
            expect(outputData).toBe(wrapOutput(`1) 3
2) 2
3) 1`));
        });
    });
});