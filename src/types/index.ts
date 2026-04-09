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
