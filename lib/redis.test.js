/**
 * Integration tests for Redis-CLI
*/
const RedisClient = require('./redis').RedisClient;

let spy = {};

let outputData = "";
let redisClient = {};
const storeLog = inputs => (outputData += inputs);

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
    // mock `console.log`
    spy.log = jest.spyOn(global.console, 'log').mockImplementation(storeLog);
    // mock `process.exit`
    spy.exit = jest.spyOn(process, 'exit').mockImplementation(() => {});
});

afterAll(() => {
    spy.log.mockRestore();
    redisClient._redis_client.quit();
});

describe('key value getter/setter', () => {
    it('SET key/value returns string literal OK', () => {
        return redisClient.execute(["set", "key", "value"]).then(() => {
            expect(spy.log).toHaveBeenCalled();
            expect(outputData).toBe("OK");
        });
    });

    it('GET key returns previously set value', () => {
        return redisClient.execute(["get", "key"]).then(() => {
            expect(spy.log).toHaveBeenCalled();
            expect(outputData).toBe("value");
        });
    });

    it('GET key returns previously set value, not equality', () => {
        return redisClient.execute(["get", "key"]).then(() => {
            expect(spy.log).toHaveBeenCalled();
            expect(outputData).not.toBe("Value");
        });
    });
});