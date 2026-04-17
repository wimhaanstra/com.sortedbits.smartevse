import { EventEmitter } from 'events';
import { MqttHub } from '../lib/mqtt-hub';

type MockClient = EventEmitter & {
  connected: boolean;
  publish: jest.Mock;
  subscribe: jest.Mock;
  unsubscribe: jest.Mock;
  end: jest.Mock;
};

const mocks: { client?: MockClient; connect: jest.Mock } = {
  client: undefined,
  connect: jest.fn(),
};

jest.mock('mqtt', () => ({
  connect: (...args: unknown[]) => {
    mocks.connect(...args);
    const client = new EventEmitter() as MockClient;
    client.connected = false;
    client.publish = jest.fn((topic, payload, opts, cb) => {
      if (typeof opts === 'function') cb = opts;
      if (cb) (cb as (err?: Error | null) => void)();
      return client;
    });
    client.subscribe = jest.fn((topic, opts, cb) => {
      if (typeof opts === 'function') cb = opts;
      if (cb) (cb as (err?: Error | null) => void)(null);
      return client;
    });
    client.unsubscribe = jest.fn((topic, opts, cb) => {
      if (typeof opts === 'function') cb = opts;
      if (cb) (cb as (err?: Error | null) => void)(null);
      return client;
    });
    client.end = jest.fn((force, opts, cb) => {
      if (typeof force === 'function') cb = force;
      else if (typeof opts === 'function') cb = opts;
      if (cb) (cb as (err?: Error | null) => void)();
      return client;
    });
    mocks.client = client;
    return client;
  },
}));

function connectIt(): MockClient {
  const c = mocks.client!;
  c.connected = true;
  c.emit('connect');
  return c;
}

describe('MqttHub', () => {
  beforeEach(() => {
    mocks.connect.mockClear();
    mocks.client = undefined;
  });

  test('connect() builds URL with protocol/host/port and creds', async () => {
    const hub = new MqttHub();
    const p = hub.connect({
      protocol: 'mqtts', host: 'broker.local', port: 8883, username: 'u', password: 'p',
    });
    connectIt();
    await p;
    expect(mocks.connect).toHaveBeenCalledWith('mqtts://broker.local:8883', expect.objectContaining({
      username: 'u', password: 'p', reconnectPeriod: expect.any(Number),
    }));
  });

  test('publish with prefix joins with /', async () => {
    const hub = new MqttHub();
    const p = hub.connect({ protocol: 'mqtt', host: 'h', port: 1883 });
    const c = connectIt();
    await p;
    await hub.publish('SmartEVSE/8881', 'Set/Mode', 'Smart');
    expect(c.publish).toHaveBeenCalledWith('SmartEVSE/8881/Set/Mode', 'Smart',
      expect.objectContaining({ qos: 0, retain: false }), expect.any(Function));
  });

  test('close() ends the client', async () => {
    const hub = new MqttHub();
    const p = hub.connect({ protocol: 'mqtt', host: 'h', port: 1883 });
    const c = connectIt();
    await p;
    await hub.close();
    expect(c.end).toHaveBeenCalled();
  });
});

describe('MqttHub routing', () => {
  test('subscribe registers prefix and routes messages to handler', async () => {
    const hub = new MqttHub();
    const p = hub.connect({ protocol: 'mqtt', host: 'h', port: 1883 });
    const c = connectIt();
    await p;

    const msgs: Array<[string, string]> = [];
    hub.subscribe({
      prefix: 'SmartEVSE/8881',
      onMessage: (s, v) => msgs.push([s, v]),
      onOnline: () => {},
    });
    expect(c.subscribe).toHaveBeenCalledWith('SmartEVSE/8881/#', { qos: 0 }, expect.any(Function));

    c.emit('message', 'SmartEVSE/8881/Mode', Buffer.from('Smart'));
    expect(msgs).toEqual([['Mode', 'Smart']]);
  });

  test('LWT /connected routed via onOnline', async () => {
    const hub = new MqttHub();
    const p = hub.connect({ protocol: 'mqtt', host: 'h', port: 1883 });
    const c = connectIt();
    await p;

    const online: boolean[] = [];
    hub.subscribe({
      prefix: 'SmartEVSE/8881',
      onMessage: () => {},
      onOnline: (o) => online.push(o),
    });
    c.emit('message', 'SmartEVSE/8881/connected', Buffer.from('online'));
    c.emit('message', 'SmartEVSE/8881/connected', Buffer.from('offline'));
    expect(online).toEqual([true, false]);
  });

  test('overlapping prefixes use longest match', async () => {
    const hub = new MqttHub();
    const p = hub.connect({ protocol: 'mqtt', host: 'h', port: 1883 });
    const c = connectIt();
    await p;

    const shortMsgs: string[] = [];
    const longMsgs: string[] = [];
    hub.subscribe({ prefix: 'SmartEVSE/8881', onMessage: (s) => shortMsgs.push(s), onOnline: () => {} });
    hub.subscribe({ prefix: 'SmartEVSE/8881-test', onMessage: (s) => longMsgs.push(s), onOnline: () => {} });

    c.emit('message', 'SmartEVSE/8881-test/Mode', Buffer.from('Smart'));
    expect(longMsgs).toEqual(['Mode']);
    expect(shortMsgs).toEqual([]);

    c.emit('message', 'SmartEVSE/8881/Mode', Buffer.from('Normal'));
    expect(shortMsgs).toEqual(['Mode']);
  });

  test('publish while disconnected queues and flushes on reconnect', async () => {
    const hub = new MqttHub();
    const p = hub.connect({ protocol: 'mqtt', host: 'h', port: 1883 });
    const c = connectIt();
    await p;

    c.connected = false;
    c.emit('offline');
    await hub.publish('SmartEVSE/8881', 'Set/Mode', 'Smart');
    expect(c.publish).not.toHaveBeenCalled();

    c.connected = true;
    c.emit('connect');
    expect(c.publish).toHaveBeenCalledWith('SmartEVSE/8881/Set/Mode', 'Smart',
      expect.objectContaining({ qos: 0, retain: false }), expect.any(Function));
  });

  test('reconnect re-subscribes all registered prefixes', async () => {
    const hub = new MqttHub();
    const p = hub.connect({ protocol: 'mqtt', host: 'h', port: 1883 });
    const c = connectIt();
    await p;

    hub.subscribe({ prefix: 'a', onMessage: () => {}, onOnline: () => {} });
    hub.subscribe({ prefix: 'b', onMessage: () => {}, onOnline: () => {} });
    c.subscribe.mockClear();
    c.emit('connect');
    expect(c.subscribe).toHaveBeenCalledWith('a/#', { qos: 0 }, expect.any(Function));
    expect(c.subscribe).toHaveBeenCalledWith('b/#', { qos: 0 }, expect.any(Function));
  });

  test('offline event broadcasts onOnline(false) to every subscription', async () => {
    const hub = new MqttHub();
    const p = hub.connect({ protocol: 'mqtt', host: 'h', port: 1883 });
    const c = connectIt();
    await p;

    const aOnline: boolean[] = [];
    const bOnline: boolean[] = [];
    hub.subscribe({ prefix: 'a', onMessage: () => {}, onOnline: (o) => aOnline.push(o) });
    hub.subscribe({ prefix: 'b', onMessage: () => {}, onOnline: (o) => bOnline.push(o) });
    c.connected = false;
    c.emit('offline');
    expect(aOnline).toEqual([false]);
    expect(bOnline).toEqual([false]);
  });
});
