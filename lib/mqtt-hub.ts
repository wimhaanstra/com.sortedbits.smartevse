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
    this.logger.log('[mqtt] connecting to', url, 'user=', cfg.username ?? '(none)');
    const client = mqtt.connect(url, opts);
    this.client = client;

    client.on('message', (topic, payload) => {
      const str = payload.toString();
      const preview = str.length > 120 ? `${str.slice(0, 120)}…` : str;
      this.logger.log('[mqtt] rx', topic, '=', preview);
      this.route(topic, str);
    });
    client.on('connect', () => this.onConnected());
    client.on('error', (err) => this.logger.error('[mqtt]', err.message));
    client.on('offline', () => {
      this.logger.log('[mqtt] offline');
      this.broadcastOffline();
    });
    client.on('reconnect', () => this.logger.log('[mqtt] reconnecting'));
    client.on('close', () => this.logger.log('[mqtt] close'));

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
    const connected = this.client?.connected === true;
    this.logger.log('[mqtt] subscribe', `${sub.prefix}/#`, 'connected=', connected);
    if (connected) {
      this.client!.subscribe(`${sub.prefix}/#`, { qos: 0 }, (err, granted) => {
        if (err) this.logger.error('[mqtt] subscribe error', sub.prefix, err.message);
        else this.logger.log('[mqtt] subscribed', granted?.map((g) => `${g.topic}@${g.qos}`).join(','));
      });
    }
  }

  unsubscribe(prefix: string): void {
    this.subscriptions.delete(prefix);
    this.logger.log('[mqtt] unsubscribe', `${prefix}/#`);
    if (this.client?.connected) {
      this.client.unsubscribe(`${prefix}/#`, {}, () => {});
    }
  }

  private onConnected(): void {
    this.logger.log('[mqtt] connected; active subs=', this.subscriptions.size);
    for (const sub of this.subscriptions.values()) {
      this.client!.subscribe(`${sub.prefix}/#`, { qos: 0 }, (err, granted) => {
        if (err) this.logger.error('[mqtt] subscribe error', sub.prefix, err.message);
        else this.logger.log('[mqtt] subscribed', granted?.map((g) => `${g.topic}@${g.qos}`).join(','));
      });
    }
    if (this.outbox.length) this.logger.log('[mqtt] flushing outbox, size=', this.outbox.length);
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
        this.logger.log('[mqtt] route onOnline', prefix, payload);
        sub.onOnline(payload === 'online');
        return;
      }
      if (topic.startsWith(`${prefix}/`)) {
        const suffix = topic.slice(prefix.length + 1);
        this.logger.log('[mqtt] route onMessage prefix=', prefix, 'suffix=', suffix);
        sub.onMessage(suffix, payload);
        return;
      }
    }
    this.logger.log(
      '[mqtt] route no-match topic=', topic,
      'known prefixes=', [...this.subscriptions.keys()].join('|') || '(none)',
    );
  }
}
