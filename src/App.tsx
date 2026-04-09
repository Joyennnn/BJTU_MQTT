import { useState, useEffect, useRef } from 'react';
import { 
  Layout, 
  Card, 
  Form, 
  Input, 
  InputNumber, 
  Button, 
  Tag, 
  Space,
  Modal,
  Upload,
  App as AntdApp,
  message
} from 'antd';
import type { FormProps, UploadProps } from 'antd';
import { 
  LinkOutlined, 
  DisconnectOutlined, 
  PlusOutlined, 
  SendOutlined,
  DownloadOutlined,
  FileTextOutlined,
  SettingOutlined,
  UploadOutlined
} from '@ant-design/icons';
import { mqttService } from './utils/mqtt';
import type { MQTTConfig, ChatMessage, Subscription, FileMessage } from './utils/mqtt';
import './App.css';

const { Header, Content } = Layout;
const { TextArea } = Input;

function App() {
  const [messageApi, contextHolder] = message.useMessage();
  const [connected, setConnected] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [configForm] = Form.useForm();
  const [currentUsername, setCurrentUsername] = useState(''); // 当前用户名
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newTopic, setNewTopic] = useState('');
  const [publishTopic, setPublishTopic] = useState('');
  const [publishMessage, setPublishMessage] = useState('');
  const [qos, setQos] = useState(0);
  const [retained, setRetained] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageListenerSet = useRef(false); // 确保监听器只设置一次

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // 不在这里设置监听器，而是在连接成功后设置
    return () => {
      mqttService.removeMessageListener();
    };
  }, []);

  useEffect(() => {
    if (connected && !messageListenerSet.current) {
      // 只在第一次连接时设置消息监听器
      console.log('设置消息监听器...');
      mqttService.onMessage((topic, payload) => {
        console.log('收到消息:', topic, payload);
        
        // 尝试解析发送者信息（格式：SENDER:username|message）
        let sender = '未知用户';
        let actualPayload = payload;
        
        if (payload.startsWith('SENDER:')) {
          const parts = payload.split('|');
          if (parts.length >= 2) {
            sender = parts[0].replace('SENDER:', '');
            actualPayload = parts.slice(1).join('|');
          }
        }
        
        // 如果是自己发送的消息，不显示为接收
        if (sender === currentUsername) {
          console.log('跳过自己发送的消息');
          return;
        }
        
        // 检查是否是文件消息
        if (actualPayload.startsWith('FILE:')) {
          // 处理文件消息
          const fileParts = actualPayload.split('|');
          if (fileParts.length >= 4) {
            const fileName = fileParts[0].replace('FILE:', '');
            const fileSize = parseInt(fileParts[1]);
            const fileType = fileParts[2];
            const fileData = fileParts[3];
            
            const newMessage: ChatMessage = {
              id: `${topic}-${Date.now()}-${Math.random()}`,
              topic,
              payload: actualPayload,
              timestamp: new Date(),
              direction: 'received',
              sender,
            };
            setMessages(prev => [...prev, newMessage]);
          }
        } else {
          // 普通文本消息
          const newMessage: ChatMessage = {
            id: `${topic}-${Date.now()}-${Math.random()}`,
            topic,
            payload: actualPayload,
            timestamp: new Date(),
            direction: 'received',
            sender,
          };
          setMessages(prev => [...prev, newMessage]);
        }
      });
      messageListenerSet.current = true;
    }
  }, [connected, currentUsername]);

  const downloadFile = (fileMessage: FileMessage) => {
    try {
      const linkSource = `data:${fileMessage.type};base64,${fileMessage.data}`;
      const downloadLink = document.createElement('a');
      downloadLink.href = linkSource;
      downloadLink.download = fileMessage.name;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      messageApi.success(`文件 ${fileMessage.name} 下载成功`);
    } catch (error) {
      messageApi.error('文件下载失败');
    }
  };

  const handleConnect = async (values: any) => {
    const config: MQTTConfig = {
      host: values.host,
      port: values.port,
      path: values.path || '/mqtt',
      username: values.username || undefined,
      password: values.password || undefined,
      clientId: values.clientId || undefined,
    };

    // 保存当前用户名
    setCurrentUsername(values.username);

    try {
      setConnecting(true);
      await mqttService.connect(config);
      setConnected(true);
      setShowConfig(false);
      messageApi.success('连接成功');
    } catch (error: any) {
      messageApi.error(`连接失败：${error.message}`);
      setConnected(false);
      setShowConfig(false);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await mqttService.disconnect();
      setConnected(false);
      setSubscriptions([]);
      setMessages([]);
      messageListenerSet.current = false; // 重置标志，允许重新连接时设置监听器
      messageApi.success('已断开连接');
    } catch (error) {
      messageApi.error('断开连接失败');
    }
  };

  const handleSubscribe = async () => {
    if (!newTopic.trim()) {
      messageApi.warning('请输入主题');
      return;
    }

    try {
      await mqttService.subscribe(newTopic.trim(), 0);
      setSubscriptions(mqttService.getSubscriptions());
      setNewTopic('');
      messageApi.success(`订阅主题 ${newTopic} 成功`);
    } catch (error: any) {
      messageApi.error(`订阅失败：${error.message}`);
    }
  };

  const handleUnsubscribe = async (topic: string) => {
    try {
      await mqttService.unsubscribe(topic);
      setSubscriptions(mqttService.getSubscriptions());
      messageApi.success(`取消订阅 ${topic} 成功`);
    } catch (error: any) {
      messageApi.error(`取消订阅失败：${error.message}`);
    }
  };

  const handlePublish = async () => {
    if (!publishTopic || !publishMessage) {
      messageApi.warning('请输入主题和消息内容');
      return;
    }

    try {
      // 在消息中包含发送者信息
      const messageWithSender = `SENDER:${currentUsername || '匿名'}|${publishMessage}`;
      await mqttService.publish(publishTopic, messageWithSender, qos, retained);
      
      const newMessage: ChatMessage = {
        id: `${publishTopic}-${Date.now()}`,
        topic: publishTopic,
        payload: publishMessage, // 显示时用原始消息
        timestamp: new Date(),
        direction: 'sent',
        qos,
        retained,
        sender: currentUsername || '我',
      };
      
      setMessages(prev => [...prev, newMessage]);
      setPublishMessage('');
      messageApi.success('消息已发送');
    } catch (error: any) {
      messageApi.error(`发送失败：${error.message}`);
    }
  };

  const handleFileUpload: UploadProps['beforeUpload'] = (file: File) => {
    if (!publishTopic) {
      messageApi.warning('请先输入发布主题');
      return false;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const base64 = e.target?.result as string;
        const fileData = base64.split(',')[1];
        // 在文件消息中也包含发送者信息
        const fileMessage = `SENDER:${currentUsername || '匿名'}|FILE:${file.name}|${file.size}|${file.type}|${fileData}`;
        
        await mqttService.publish(publishTopic, fileMessage, 0);
        
        // 立即在本地显示发送的文件
        const newMessage: ChatMessage = {
          id: `${publishTopic}-${Date.now()}`,
          topic: publishTopic,
          payload: `FILE:${file.name}|${file.size}|${file.type}|${fileData}`,
          timestamp: new Date(),
          direction: 'sent',
          sender: currentUsername || '我',
        };
        
        setMessages(prev => [...prev, newMessage]);
        messageApi.success(`文件 ${file.name} 已发送`);
      } catch (error: any) {
        messageApi.error(`文件发送失败：${error.message}`);
      }
    };
    
    reader.onerror = () => {
      messageApi.error('文件读取失败');
    };
    
    reader.readAsDataURL(file);
    return false;
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN');
  };

  const renderMessages = () => {
    const messagesByTopic = messages.reduce((acc, msg) => {
      if (!acc[msg.topic]) {
        acc[msg.topic] = [];
      }
      acc[msg.topic].push(msg);
      return acc;
    }, {} as Record<string, ChatMessage[]>);

    return Object.entries(messagesByTopic).map(([topic, topicMessages]) => {
      // 统计该主题下的消息数量（作为订阅人数的近似值）
      const uniqueSenders = new Set(topicMessages.map(msg => msg.sender));
      
      return (
        <div key={topic} style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 12, fontSize: 16 }}>
            主题：{topic}（{uniqueSenders.size} 人）
          </h3>
        {topicMessages.map((msg) => (
          <div
            key={msg.id}
            className={`message-item ${msg.direction === 'sent' ? 'sent-message' : 'received-message'}`}
            style={{ marginBottom: 8 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              {msg.direction === 'sent' ? (
                <>
                  <span style={{ fontSize: 12, color: '#999' }}>{formatTime(msg.timestamp)}</span>
                  <Space>
                    <Tag color="purple">
                      👤 {msg.sender}
                    </Tag>
                    <Tag color="green">
                      发送
                    </Tag>
                  </Space>
                </>
              ) : (
                <>
                  <Space>
                    <Tag color="blue">
                      接收
                    </Tag>
                    <Tag color="purple">
                      👤 {msg.sender}
                    </Tag>
                  </Space>
                  <span style={{ fontSize: 12, color: '#999' }}>{formatTime(msg.timestamp)}</span>
                </>
              )}
            </div>
            <div style={{ marginBottom: 4 }}>
              {msg.payload.startsWith('FILE:') ? (
                <Space>
                  <FileTextOutlined />
                  <span>文件：{msg.payload.split('|')[0].replace('FILE:', '')}</span>
                  <Button 
                    type="link" 
                    icon={<DownloadOutlined />}
                    onClick={() => {
                      const parts = msg.payload.split('|');
                      if (parts.length >= 4) {
                        downloadFile({
                          name: parts[0].replace('FILE:', ''),
                          size: parseInt(parts[1]),
                          type: parts[2],
                          data: parts[3],
                          topic: msg.topic,
                          timestamp: msg.timestamp
                        });
                      } else {
                        messageApi.error('文件格式错误');
                      }
                    }}
                  >
                    下载
                  </Button>
                </Space>
              ) : (
                msg.payload
              )}
            </div>
            {msg.retained && <Tag color="orange">保留消息</Tag>}
          </div>
        ))}
      </div>
    );
  });
  };

  return (
    <AntdApp
      theme={{
        token: {
          colorPrimary: '#667eea',
        },
      }}
    >
      {contextHolder}
      <Layout className="app-layout">
        <Header className="app-header">
          <div className="header-content">
            <h1 className="app-title">BJTUChat</h1>
            <Space>
              <Button
                icon={<SettingOutlined />}
                onClick={() => setShowConfig(true)}
                disabled={connected}
              >
                服务器配置
              </Button>
              {connected ? (
                <Button
                  type="primary"
                  danger
                  icon={<DisconnectOutlined />}
                  onClick={handleDisconnect}
                >
                  断开连接
                </Button>
              ) : (
                <Button
                  icon={<LinkOutlined />}
                  onClick={() => setShowConfig(true)}
                  disabled={connected}
                >
                  连接服务器
                </Button>
              )}
            </Space>
          </div>
        </Header>

        <Content className="app-content">
          <div className="content-wrapper">
            <Card 
              title="订阅主题" 
              className="subscription-card"
              extra={
                <Space>
                  <Input
                    placeholder="输入主题，例如：chat/#"
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    onPressEnter={handleSubscribe}
                    disabled={!connected}
                    style={{ width: 200 }}
                  />
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleSubscribe}
                    disabled={!connected}
                  >
                    订阅
                  </Button>
                </Space>
              }
            >
              <Space wrap>
                {subscriptions.map((sub) => (
                  <Tag
                    key={sub.topic}
                    color="blue"
                    closable
                    onClose={() => handleUnsubscribe(sub.topic)}
                  >
                    {sub.topic}
                  </Tag>
                ))}
                {subscriptions.length === 0 && (
                  <span style={{ color: '#999' }}>暂无订阅主题</span>
                )}
              </Space>
            </Card>

            <Card 
              title="消息收发" 
              className="message-card"
            >
              <div className="messages-container">
                {messages.length === 0 ? (
                  <div className="no-messages">暂无消息</div>
                ) : (
                  renderMessages()
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="publish-form">
                <Form layout="vertical">
                  <Form.Item
                    label="发布主题"
                    required
                  >
                    <Input 
                      placeholder="输入主题" 
                      value={publishTopic}
                      onChange={(e) => setPublishTopic(e.target.value)}
                      disabled={!connected}
                    />
                  </Form.Item>

                  <Form.Item
                    label="消息内容"
                    required
                  >
                    <TextArea 
                      rows={3} 
                      placeholder="输入消息内容" 
                      value={publishMessage}
                      onChange={(e) => setPublishMessage(e.target.value)}
                      disabled={!connected}
                    />
                  </Form.Item>

                  <Form.Item
                    label="QoS"
                  >
                    <InputNumber 
                      min={0} 
                      max={2} 
                      value={qos}
                      onChange={(val) => setQos(val || 0)}
                      disabled={!connected}
                    />
                  </Form.Item>

                  <Form.Item
                    label="保留消息"
                  >
                    <input 
                      type="checkbox" 
                      checked={retained}
                      onChange={(e) => setRetained(e.target.checked)}
                      disabled={!connected}
                      style={{ marginRight: 8 }}
                    />
                    {retained ? '是' : '否'}
                  </Form.Item>

                  <Form.Item>
                    <Space>
                      <Button 
                        type="primary" 
                        icon={<SendOutlined />}
                        onClick={handlePublish}
                        disabled={!connected}
                      >
                        发送
                      </Button>
                      <Upload
                        showUploadList={false}
                        beforeUpload={handleFileUpload}
                        disabled={!connected}
                      >
                        <Button icon={<UploadOutlined />}>
                          发送文件
                        </Button>
                      </Upload>
                    </Space>
                  </Form.Item>
                </Form>
              </div>
            </Card>
          </div>
        </Content>

        <Modal
          title="MQTT 服务器配置"
          open={showConfig}
          onCancel={() => setShowConfig(false)}
          footer={null}
          width={500}
        >
          <Form
            form={configForm}
            onFinish={handleConnect}
            layout="vertical"
            initialValues={{
              host: '103.133.176.210',
              port: 8083,
              path: '/mqtt',
            }}
          >
            <Form.Item
              name="host"
              label="服务器地址"
              rules={[{ required: true, message: '请输入服务器地址' }]}
            >
              <Input placeholder="例如：broker.emqx.io" />
            </Form.Item>

            <Form.Item
              name="port"
              label="端口"
              rules={[{ required: true, message: '请输入端口' }]}
            >
              <InputNumber min={1} max={65535} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              name="path"
              label="WebSocket 路径"
              tooltip="MQTT over WebSocket 的路径"
            >
              <Input placeholder="/mqtt" />
            </Form.Item>

            <Form.Item
              name="username"
              label="用户名"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input placeholder="请输入用户名" />
            </Form.Item>

            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password placeholder="请输入密码" />
            </Form.Item>

            <Form.Item
              name="clientId"
              label="客户端 ID"
              tooltip="留空则自动生成"
            >
              <Input placeholder="可选" />
            </Form.Item>

            <Form.Item>
              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button onClick={() => setShowConfig(false)}>
                  取消
                </Button>
                <Button type="primary" htmlType="submit" loading={connecting}>
                  连接
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>
      </Layout>
    </AntdApp>
  );
}

export default App;
