import mqtt from 'mqtt';

export interface MQTTConfig {
  host: string;
  port: number;
  path?: string;
  username?: string;
  password?: string;
  clientId?: string;
}

export interface ChatMessage {
  id: string;
  topic: string;
  payload: string;
  timestamp: Date;
  direction: 'sent' | 'received';
  qos?: number;
  retained?: boolean;
  sender?: string; // 发送者用户名
}

export interface Subscription {
  topic: string;
  qos?: number;
  active: boolean;
}

export interface FileMessage {
  name: string;
  size: number;
  type: string;
  data: string;
  topic: string;
  timestamp: Date;
}

export class MQTTService {
  private client: mqtt.MqttClient | null = null;
  private subscriptions: Map<string, Subscription> = new Map();
  private messageCallback: ((topic: string, message: string) => void) | null = null;

  connect(config: MQTTConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const options: mqtt.IClientOptions = {
          clientId: config.clientId || `mqtt_chat_${Math.random().toString(16).substr(2, 8)}`,
          username: config.username,
          password: config.password,
          clean: true,
          reconnectPeriod: 0,
          connectTimeout: 30000,
          rejectUnauthorized: false,
        };

        const url = `ws://${config.host}:${config.port}${config.path || '/mqtt'}`;
        
        console.log('正在连接到:', url);
        this.client = mqtt.connect(url, options);

        let hasResolved = false;
        let hasRejected = false;

        const timeoutId = setTimeout(() => {
          if (!hasResolved && !hasRejected) {
            hasRejected = true;
            if (this.client) {
              this.client.end(true);
            }
            reject(new Error('连接超时，请检查服务器地址和端口是否正确'));
          }
        }, 10000);

        this.client.on('connect', () => {
          if (!hasRejected) {
            clearTimeout(timeoutId);
            hasResolved = true;
            console.log('Connected to MQTT broker');
            resolve();
          }
        });

        this.client.on('error', (error) => {
          if (!hasResolved && !hasRejected) {
            clearTimeout(timeoutId);
            hasRejected = true;
            console.error('MQTT connection error:', error);
            reject(new Error(`连接失败：${error.message || '网络错误'}`));
          }
        });

        this.client.on('offline', () => {
          console.log('MQTT client offline');
          if (!hasResolved && !hasRejected) {
            clearTimeout(timeoutId);
            hasRejected = true;
            reject(new Error('无法连接到服务器，请检查网络或服务器配置'));
          }
        });

        this.client.on('close', () => {
          console.log('Disconnected from MQTT broker');
        });
      } catch (error: any) {
        reject(error);
      }
    });
  }

  disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (this.client) {
        this.client.end(false, () => {
          this.client = null;
          this.subscriptions.clear();
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  isConnected(): boolean {
    return this.client?.connected ?? false;
  }

  subscribe(topic: string, qos: number = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('Not connected'));
        return;
      }

      console.log('订阅主题:', topic, 'QoS:', qos);
      this.client.subscribe(topic, { qos }, (err, granted) => {
        if (err) {
          console.error('订阅失败:', err);
          reject(err);
        } else {
          console.log('订阅成功:', granted);
          this.subscriptions.set(topic, { topic, qos, active: true });
          resolve();
        }
      });
    });
  }

  unsubscribe(topic: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('Not connected'));
        return;
      }

      this.client.unsubscribe(topic, (err) => {
        if (err) {
          reject(err);
        } else {
          this.subscriptions.delete(topic);
          resolve();
        }
      });
    });
  }

  publish(topic: string, message: string, qos: number = 0, retained: boolean = false): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('Not connected'));
        return;
      }

      console.log('发布消息到主题:', topic, '消息:', message.substring(0, 50), 'QoS:', qos);
      this.client.publish(topic, message, { qos, retain: retained }, (err) => {
        if (err) {
          console.error('发布失败:', err);
          reject(err);
        } else {
          console.log('发布成功');
          resolve();
        }
      });
    });
  }

  onMessage(callback: (topic: string, message: string) => void): void {
    console.log('注册消息回调函数');
    
    // 先移除旧的监听器
    if (this.client) {
      this.client.removeAllListeners('message');
    }
    
    this.messageCallback = callback;
    
    // 如果客户端已经连接，设置监听器
    if (this.client && this.client.connected) {
      this.client.on('message', (topic, message) => {
        console.log('📩 收到 MQTT 消息:', topic, message.toString());
        if (this.messageCallback) {
          this.messageCallback(topic, message.toString());
        }
      });
      console.log('消息监听器已设置（已连接状态）');
    }
  }

  removeMessageListener(): void {
    if (this.client) {
      this.client.removeAllListeners('message');
    }
  }

  getSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values());
  }
}

export const mqttService = new MQTTService();
