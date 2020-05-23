"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const redis_1 = require("redis");
const executor_1 = require("../src/executor");
const bluebird_1 = require("bluebird");
let redisClient;
const delay = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};
const prepareClient = () => {
    let redisClient = new redis_1.RedisClient({ port: 6379, host: "127.0.0.1" });
    /**
     * Call unref() on the underlying socket connection to the Redis server, allowing the program to exit once no more commands are pending.
     * This is an experimental feature, as documented in the following site:
     * https://github.com/NodeRedis/node_redis#clientunref
     */
    redisClient.unref();
    // remove all listener to avoid async callback
    redisClient.removeAllListeners();
    bluebird_1.promisifyAll(redisClient);
    return redisClient;
};
beforeAll((done) => {
    redisClient = prepareClient();
    return redisClient.flushall(() => {
        done();
    });
});
afterAll(() => {
    redisClient.quit();
});
test("GET key before set", async () => {
    let executor = new executor_1.BaseExecutor(redisClient, ["get", "key"]);
    const mockCallback = jest.fn();
    await executor.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Right');
    expect(mockCallback.mock.calls[0][0].right).toBe("(nil)");
    expect(mockCallback.mock.calls[1][0]._kind).toBe('Left');
    expect(mockCallback.mock.calls[1][0].left.name).toBe("RequestEnd");
});
test("SET key", async () => {
    let executor = new executor_1.BaseExecutor(redisClient, ["set", "key", "value"]);
    const mockCallback = jest.fn();
    await executor.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Right');
    expect(mockCallback.mock.calls[0][0].right).toBe("OK");
    expect(mockCallback.mock.calls[1][0]._kind).toBe('Left');
    expect(mockCallback.mock.calls[1][0].left.name).toBe("RequestEnd");
});
test("GET key after set", async () => {
    let executor = new executor_1.BaseExecutor(redisClient, ["get", "key"]);
    const mockCallback = jest.fn();
    await executor.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Right');
    expect(mockCallback.mock.calls[0][0].right).toBe("value");
    expect(mockCallback.mock.calls[1][0]._kind).toBe('Left');
    expect(mockCallback.mock.calls[1][0].left.name).toBe("RequestEnd");
});
test("SUBSCRIBE channel", async () => {
    let subClient = prepareClient();
    let executor = new executor_1.SubscribeExecutor(subClient, ["subscribe", "channel"]);
    const mockCallback = jest.fn();
    await executor.run(mockCallback);
    let pushlishExec = new executor_1.BaseExecutor(redisClient, ["publish", "channel", "value"]);
    await pushlishExec.run(() => { });
    // we have to wait for new messages coming in...
    await delay(1000);
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Right');
    expect(mockCallback.mock.calls[0][0].right).toBe("channel");
    subClient.quit();
});
test("PSUBSCRIBE channel", async () => {
    let psubClient = prepareClient();
    let executor = new executor_1.PatternSubscribeExecutor(psubClient, ["psubscribe", "ch?nnel"]);
    const mockCallback = jest.fn();
    await executor.run(mockCallback);
    let pushlishExec = new executor_1.BaseExecutor(redisClient, ["publish", "channel", "value"]);
    await pushlishExec.run(() => { });
    // we have to wait for new messages coming in...
    await delay(1000);
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Right');
    expect(mockCallback.mock.calls[0][0].right).toBe("ch?nnel");
    psubClient.quit();
});
test("HSET and HGETALL", async () => {
    let executorHSET = new executor_1.BaseExecutor(redisClient, ["HSET", "myhash", "field", "Hello"]);
    const mockCallback = jest.fn();
    await executorHSET.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Right');
    expect(mockCallback.mock.calls[0][0].right).toBe("(integer) 1");
    expect(mockCallback.mock.calls[1][0]._kind).toBe('Left');
    expect(mockCallback.mock.calls[1][0].left.name).toBe("RequestEnd");
    let executorHGETALL = new executor_1.BaseExecutor(redisClient, ["HGETALL", "myhash"]);
    await executorHGETALL.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(4);
    expect(mockCallback.mock.calls[2][0]._kind).toBe('Right');
    expect(mockCallback.mock.calls[2][0].right).toStrictEqual(["1) \"field\"", "2) \"Hello\""]);
    expect(mockCallback.mock.calls[3][0]._kind).toBe('Left');
    expect(mockCallback.mock.calls[3][0].left.name).toBe("RequestEnd");
});
test("GET key in cluster and return RedirectError", async () => {
    jest.spyOn(redisClient, "get").mockImplementationOnce(() => {
        let err = new redis_1.ReplyError("MOVED 10000 127.0.0.1:9900");
        err.code = "MOVED";
        throw err;
    });
    let executor = new executor_1.BaseExecutor(redisClient, ["get", "key"]);
    const mockCallback = jest.fn();
    await executor.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(1);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Left');
    expect(mockCallback.mock.calls[0][0].left.name).toBe("RedirectError");
    expect(mockCallback.mock.calls[0][0].left.slot).toBe(10000);
    expect(mockCallback.mock.calls[0][0].left.hostAndPort).toBe("127.0.0.1:9900");
});
