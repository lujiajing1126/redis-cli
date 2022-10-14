/**
 * Integration tests for Redis-CLI
 */
import { expect, jest, beforeAll, afterAll, describe, it} from '@jest/globals';
import { GUIRedisClient, __PR__ } from '../src/redis';
import { red, yellow, green } from 'colors';
const _log = global.console.log;
import {
    StartedTestContainer,
    GenericContainer,
    Wait
} from "testcontainers";
import { SpyInstance } from 'jest-mock';
import { RedisClient } from 'redis';

type Mocks = {
    next: SpyInstance<(arg: RedisClient) => void>,
    exit: SpyInstance
};

let spy: Mocks

let gui: GUIRedisClient;
let container: StartedTestContainer;

jest.setTimeout(60000); // 1 minute

beforeAll(async () => {
    container = await new GenericContainer("redis/redis-stack-server:6.2.4-v3")
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage("Ready to accept connections"))
        .start();

    gui = new GUIRedisClient({ port: container.getMappedPort(6379), host: "127.0.0.1", cluster: false, tls: false })
    spy.next = jest.spyOn(gui, 'next', 'set').mockImplementation(() => { });
    spy.exit = jest.spyOn(process, 'exit').mockImplementation();
    await gui.execute(['flushall'], () => { });
});

afterAll(async () => {
    gui.shutdown();
    spy.next.mockRestore();
    await container.stop();
    spy.exit.mockRestore();
});

describe('test redis-stack search', () => {
    it('without installing specific module', async () => {
        await gui.execute(["FT.CREATE", "products", "SCHEMA", "name", "TEXT", "price", "NUMERIC"], gui.responseCallback);
        expect(spy.next).toHaveBeenCalled();
        expect(spy.next.mock.calls[0][0]).toBe(green("OK"));
    });
});
