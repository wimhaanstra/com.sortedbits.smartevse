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
