import { RedisClient, ReplyError } from "redis";
import { BaseExecutor, Right, SubscribeExecutor, Result, Left, PatternSubscribeExecutor, RedirectError } from "../src/executor";
import { promisifyAll } from 'bluebird';

let redisClient : RedisClient

const delay = (ms: number) => {
    return new Promise( resolve => setTimeout(resolve, ms) );
}

const prepareClient = (): RedisClient => {
    let redisClient = new RedisClient({port: 6379, host: "127.0.0.1"});
    /**
     * Call unref() on the underlying socket connection to the Redis server, allowing the program to exit once no more commands are pending.
     * This is an experimental feature, as documented in the following site:
     * https://github.com/NodeRedis/node_redis#clientunref
     */
    redisClient.unref();
    // remove all listener to avoid async callback
    redisClient.removeAllListeners();
    promisifyAll(redisClient);
    return redisClient;
}

beforeAll((done) => {
    redisClient = prepareClient();
    redisClient.flushall(() => {
        done();
    });
});

afterAll(() => {
    redisClient.quit();
});

test("GET key before set", async () => {
    let executor = new BaseExecutor(redisClient, ["get", "key"]);
    const mockCallback: jest.Mock<void, Result<Error, string | string[]>[]> = jest.fn();
    await executor.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Right');
    expect((mockCallback.mock.calls[0][0] as Right<string>).right).toBe("(nil)");
    expect(mockCallback.mock.calls[1][0]._kind).toBe('Left');
    expect((mockCallback.mock.calls[1][0] as Left<Error>).left.name).toBe("RequestEnd");
});

test("SET key", async () => {
    let executor = new BaseExecutor(redisClient, ["set", "key", "value"]);
    const mockCallback: jest.Mock<void, Result<Error, string | string[]>[]> = jest.fn();
    await executor.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Right');
    expect((mockCallback.mock.calls[0][0] as Right<string>).right).toBe("OK");
    expect(mockCallback.mock.calls[1][0]._kind).toBe('Left');
    expect((mockCallback.mock.calls[1][0] as Left<Error>).left.name).toBe("RequestEnd");
});

test("GET key after set", async () => {
    let executor = new BaseExecutor(redisClient, ["get", "key"]);
    const mockCallback: jest.Mock<void, Result<Error, string | string[]>[]> = jest.fn();
    await executor.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Right');
    expect((mockCallback.mock.calls[0][0] as Right<string>).right).toBe("value");
    expect(mockCallback.mock.calls[1][0]._kind).toBe('Left');
    expect((mockCallback.mock.calls[1][0] as Left<Error>).left.name).toBe("RequestEnd");
});

test("SUBSCRIBE channel", async () => {
    let subClient = prepareClient();
    let executor = new SubscribeExecutor(subClient, ["subscribe", "channel"]);
    const mockCallback: jest.Mock<void, Result<Error, string | string[]>[]> = jest.fn();
    await executor.run(mockCallback);
    let pushlishExec = new BaseExecutor(redisClient, ["publish", "channel", "value"]);
    await pushlishExec.run(() => {});
    // we have to wait for new messages coming in...
    await delay(1000);
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Right');
    expect((mockCallback.mock.calls[0][0] as Right<string>).right).toBe("channel");
    subClient.quit();
});

test("PSUBSCRIBE channel", async () => {
    let psubClient = prepareClient();
    let executor = new PatternSubscribeExecutor(psubClient, ["psubscribe", "ch?nnel"]);
    const mockCallback: jest.Mock<void, Result<Error, string | string[]>[]> = jest.fn();
    await executor.run(mockCallback);
    let pushlishExec = new BaseExecutor(redisClient, ["publish", "channel", "value"]);
    await pushlishExec.run(() => {});
    // we have to wait for new messages coming in...
    await delay(1000);
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Right');
    expect((mockCallback.mock.calls[0][0] as Right<string>).right).toBe("ch?nnel");
    psubClient.quit();
});

test("HSET and HGETALL", async () => {
    let executorHSET = new BaseExecutor(redisClient, ["HSET", "myhash", "field", "Hello"]);
    const mockCallback: jest.Mock<void, Result<Error, string | string[]>[]> = jest.fn();
    await executorHSET.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(2);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Right');
    expect((mockCallback.mock.calls[0][0] as Right<string>).right).toBe("(integer) 1");
    expect(mockCallback.mock.calls[1][0]._kind).toBe('Left');
    expect((mockCallback.mock.calls[1][0] as Left<Error>).left.name).toBe("RequestEnd");
    let executorHGETALL = new BaseExecutor(redisClient, ["HGETALL", "myhash"]);
    await executorHGETALL.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(4);
    expect(mockCallback.mock.calls[2][0]._kind).toBe('Right');
    expect((mockCallback.mock.calls[2][0] as Right<string>).right).toStrictEqual(["1) \"field\"", "2) \"Hello\""]);
    expect(mockCallback.mock.calls[3][0]._kind).toBe('Left');
    expect((mockCallback.mock.calls[3][0] as Left<Error>).left.name).toBe("RequestEnd");
});

test("GET key in cluster and return RedirectError", async () => {
    jest.spyOn(redisClient, "get").mockImplementationOnce(() => {
        let err = new ReplyError("MOVED 10000 127.0.0.1:9900");
        err.code = "MOVED";
        throw err;
    });
    let executor = new BaseExecutor(redisClient, ["get", "key"]);
    const mockCallback: jest.Mock<void, Result<Error, string | string[]>[]> = jest.fn();
    await executor.run(mockCallback);
    expect(mockCallback.mock.calls.length).toBe(1);
    expect(mockCallback.mock.calls[0][0]._kind).toBe('Left');
    expect((mockCallback.mock.calls[0][0] as Left<Error>).left.name).toBe("RedirectError");
    expect((mockCallback.mock.calls[0][0] as Left<RedirectError>).left.slot).toBe(10000);
    expect((mockCallback.mock.calls[0][0] as Left<RedirectError>).left.hostAndPort).toBe("127.0.0.1:9900");
});
