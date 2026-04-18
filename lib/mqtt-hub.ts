import mqtt, { IClientOptions, MqttClient } from 'mqtt';
import { MqttConfig, HubSubscription } from './types';

export interface HubLogger {
  log: (...a: unknown[]) => void;
  error: (...a: unknown[]) => void;
}

const DEFAULT_LOGGER: HubLogger = { log: () => {}, error: () => {} };

export class MqttHub {
  private client?: MqttClient;
  private subscriptions = new Map<string, HubSubscription>();
  private outbox: Array<{ topic: string; payload: string; retain: boolean }> = [];
  private logger: HubLogger;

  constructor(logger: HubLogger = DEFAULT_LOGGER) {
    this.logger = logger;
  }

  isConnected(): boolean {
    return this.client?.connected === true;
  }

  async connect(cfg: MqttConfig): Promise<void> {
    if (this.client) await this.close();

    const url = `${cfg.protocol}://${cfg.host}:${cfg.port}`;
    const opts: IClientOptions = {
      username: cfg.username,
      password: cfg.password,
      reconnectPeriod: 2000,
      keepalive: 30,
      queueQoSZero: true,
      clean: true,
    };
    const client = mqtt.connect(url, opts);
    this.client = client;

    client.on('message', (topic, payload) => this.route(topic, payload.toString()));
    client.on('connect', () => this.onConnected());
    client.on('error', (err) => this.logger.error('[mqtt]', err.message));
    client.on('offline', () => this.broadcastOffline());
    client.on('reconnect', () => this.logger.log('[mqtt] reconnecting'));

    await new Promise<void>((resolve, reject) => {
      const handlers = {
        onConnect: () => {
          client.off('error', handlers.onError);
          resolve();
        },
        onError: (err: Error) => {
          client.off('connect', handlers.onConnect);
          reject(err);
        },
      };
      client.once('connect', handlers.onConnect);
      client.once('error', handlers.onError);
    });
  }

  async close(): Promise<void> {
    const c = this.client;
    if (!c) return;
    this.client = undefined;
    await new Promise<void>((resolve) => c.end(false, {}, () => resolve()));
  }

  async publish(prefix: string, topic: string, payload: string, retain = false): Promise<void> {
    const full = `${prefix}/${topic}`;
    if (!this.client?.connected) {
      this.outbox.push({ topic: full, payload, retain });
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.client!.publish(full, payload, { qos: 0, retain }, (err) => {
        if (err) reject(err); else resolve();
      });
    });
  }

  subscribe(sub: HubSubscription): void {
    this.subscriptions.set(sub.prefix, sub);
    if (this.client?.connected) {
      this.client.subscribe(`${sub.prefix}/#`, { qos: 0 }, (err) => {
        if (err) this.logger.error('[mqtt] subscribe error', sub.prefix, err.message);
      });
    }
  }

  unsubscribe(prefix: string): void {
    this.subscriptions.delete(prefix);
    if (this.client?.connected) {
      this.client.unsubscribe(`${prefix}/#`, {}, () => {});
    }
  }

  private onConnected(): void {
    this.logger.log('[mqtt] connected');
    for (const sub of this.subscriptions.values()) {
      this.client!.subscribe(`${sub.prefix}/#`, { qos: 0 }, (err) => {
        if (err) this.logger.error('[mqtt] subscribe error', sub.prefix, err.message);
      });
    }
    while (this.outbox.length) {
      const m = this.outbox.shift()!;
      this.client!.publish(m.topic, m.payload, { qos: 0, retain: m.retain }, () => {});
    }
  }

  private broadcastOffline(): void {
    for (const sub of this.subscriptions.values()) sub.onOnline(false);
  }

  private route(topic: string, payload: string): void {
    // Longest-prefix match: iterate subscriptions sorted by prefix length desc.
    const entries = [...this.subscriptions.entries()].sort(
      (a, b) => b[0].length - a[0].length,
    );
    for (const [prefix, sub] of entries) {
      if (topic === `${prefix}/connected`) {
        sub.onOnline(payload === 'online');
        return;
      }
      if (topic.startsWith(`${prefix}/`)) {
        sub.onMessage(topic.slice(prefix.length + 1), payload);
        return;
      }
    }
  }
}
