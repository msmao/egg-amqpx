'use strict';

const path = require('path');
const amqp = require('amqplib');

class Queue {

  constructor(config, app) {
    this.app = app;
    this.config = config;

    // 一个进程对应一个 Connection，一个进程中的多个线程则分别对应一个 Connection 中的多个 Channel。
    // Producer 和 Consumer 分别使用不同的 Connection 进行消息发送和消费。
    this.connection = null;
    this.producerMap = new Map();

    // Exchange 类型：
    // Direct（直连[===]，默认自动命名）：队列模式，直接发往队列，一对一消费，先进先出
    // Fanout（扇出，发往 Binding Queue）：广播模式，发往所有绑定的列队，每条信息多发到每个队列
    // Topic（模糊匹配[#、*]，Routing = Binding）：主题模式，根据模糊匹配发往符合规则的队列
    // Headers（消息头属性匹配）

    // const conf = {
    //   bindingKey: '',
    //   routingKey: '',
    //   autoAck: true, // 是否自动确认消息
    //   prefetch: 1, // 预取多少条消息
    //   exchange: {
    //     name: '',
    //     type: 'direct',
    //     durable: false,
    //   },
    //   queue: {
    //     name: '',
    //     options: {
    //       durable: true, // 消息持久化，重启不丢失
    //       exclusive: true, // 独占连接队列，断开连接后队列删除
    //     },
    //   },
    // };

    // 模式：
    // 消息队列：无交换机，直接发送到队列，先进先出；一对一；一对多，轮流发送
    // 发布订阅：定义 fanout 类型的交换机，匹配路由为 '' 绑定到队列
    // 路由交换：定义 direct 类型的交换机，匹配路由为 xxx 绑定到队列
    // 主题匹配：定义 topic 类型的交换机，匹配路由为 xxx.*.xxx 或 xxx.# 绑定到队列
    // 请求响应
    this.mode = [ 'queue', 'pubsub', 'router', 'topic', 'rpc' ];

    return this;
  }

  async consumer_pubsub() {
    const channel = await this.connection.createChannel();

    const config = {
      exchange: {
        name: 'logs', // 交换机名称
        type: 'fanout', // 交换机类型
        options: { durable: false },
      },
      queues: [ // 一个队列对应一个消费者，一个队列可以匹配多条规则
        {
          // name: 'A', // 队列名称
          options: { exclusive: true },
        },
        {
          // name: 'B',
          options: { exclusive: true },
        },
      ],
    };

    const { exchange, queues } = config;

    // 申明交换机
    const eok = await channel.assertExchange(exchange.name, exchange.type, exchange.options);

    const qoks = [];
    for (let i = 0; i < queues.length; i++) {
      let { name = '', key = '', options } = queues[i];

      // 声明队列
      const qok = await channel.assertQueue(name, options);
      if (!name) name = qok.queue;
      qoks.push(qok);

      channel.bindQueue(qok.queue, exchange.name, key);
      console.log(`queue ${name}(${qok.queue}) bind ${key} to exchange ${exchange.name}`);

      // 从队列上消费消息
      await channel.consume(name, msg => {
        console.log(" queue(%s) - %s:'%s'", qok.queue, msg.fields.routingKey, msg.content.toString());
      }, { noAck: true });
    }

    console.log({ f: 'consumer_pubsub', eok, qoks });
  }

  async producer_pubsub() {
    const { connection, channelMap } = this;
    const channel = await connection.createChannel();

    // 声明交换机
    const exchange = 'logs';
    const eok = await channel.assertExchange(exchange, 'fanout', { durable: false });
    channelMap.set(`fanout_${exchange}`, channel);

    console.log({ action: 'producer_pubsub', eok });
  }

  async consumer_router() {
    const channel = await this.connection.createChannel();

    const config = {
      exchange: {
        name: 'logger', // 交换机名称
        type: 'direct', // 交换机类型
        options: { durable: false },
      },
      queues: [ // 一个队列对应一个消费者，一个队列可以匹配多条规则
        {
          // name: 'A', // 队列名称
          router: [ 'info', 'warning', 'error', 'debug' ], // 匹配规则
          options: { exclusive: true },
        },
        {
          // name: 'B',
          router: [ 'error' ],
          options: { exclusive: true },
        },
      ],
    };

    const { exchange, queues } = config;

    // 申明交换机
    const eok = await channel.assertExchange(exchange.name, exchange.type, exchange.options);

    const qoks = [];
    for (let i = 0; i < queues.length; i++) {
      let { name = '', router, options } = queues[i];

      // 声明队列
      const qok = await channel.assertQueue(name, options);
      if (!name) name = qok.queue;
      qoks.push(qok);

      router.forEach(function(severity) {
        channel.bindQueue(qok.queue, exchange.name, severity);
        console.log(`queue ${name}(${qok.queue}) bind ${severity} to exchange ${exchange.name}`);
      });

      // // 绑定匹配规则到队列
      // for (let u = 0; u < rules.length; u++) {
      //   const rule = rules[u];
      //   await channel.bindQueue(qok.queue, exchange.name, rule);
      //   this.app.logger.info(`queue ${name}(${qok.queue}) bind ${rule} to exchange ${exchange.name}`);
      // }

      // 从队列上消费消息
      await channel.consume(name, msg => {
        // console.log(msg);
        console.log(" queue(%s) - %s:'%s'", qok.queue, msg.fields.routingKey, msg.content.toString());
      }, { noAck: true });
    }

    console.log({ f: 'consumer_router', eok, qoks });
  }

  async producer_router() {
    const { connection, channelMap } = this;
    const channel = await connection.createChannel();

    // 声明交换机
    const exchange = 'logger';
    const eok = await channel.assertExchange(exchange, 'direct', { durable: false });
    channelMap.set(`direct_${exchange}`, channel);

    console.log({ action: 'producer_router', eok });
  }

  async consumer_topic() {
    const channel = await this.connection.createChannel();

    const config = {
      exchange: {
        name: 'order', // 交换机名称，主题 topic
        type: 'topic', // 交换机类型
        options: { durable: false },
      },
      queues: [ // 一个队列对应一个消费者，一个队列可以匹配多条规则
        {
          // name: 'A', // 队列名称
          rules: [ 'files.cn.hz.#' ], // 匹配规则
          options: { exclusive: true },
        },
        {
          // name: 'B',
          rules: [ 'files.cn.*.store' ],
          options: { exclusive: true },
        },
      ],
    };

    const { exchange, queues } = config;

    // 申明交换机
    const eok = await channel.assertExchange(exchange.name, exchange.type, exchange.options);

    const qoks = [];
    for (let i = 0; i < queues.length; i++) {
      let { name = '', rules, options } = queues[i];

      // 声明队列
      const qok = await channel.assertQueue(name, options);
      if (!name) name = qok.queue;
      qoks.push(qok);

      // 绑定匹配规则到队列
      for (let u = 0; u < rules.length; u++) {
        const rule = rules[u];
        await channel.bindQueue(qok.queue, exchange.name, rule);
        this.app.logger.info(`queue ${name}(${qok.queue}) bind ${rule} to exchange ${exchange.name}`);
      }

      // 从队列上消费消息
      await channel.consume(name, msg => {
        console.log(msg);
        console.log(" queue - %s:'%s'", msg.fields.routingKey, msg.content.toString());
      }, { noAck: true });
    }


    // const qok = {};
    // qok.qokA = await channel.assertQueue('', { exclusive: true });
    // qok.qokB = await channel.assertQueue('', { exclusive: true });

    // // 遍历绑定队列到交换机上
    // const rules = ['files.cn.hz.#', 'files.cn.*.store'];
    // for (let index = 0; index < rules.length; index++) {
    //   // const bok = await channel.bindQueue(queue, exchange, rules[index]);
    //   // console.log({ bok })
    //   const n = index ? 'B' : 'A';
    //   const rule = rules[index];
    //   // const qok = await channel.assertQueue('', { exclusive: true });
    //   const queue = qok[`qok${n}`].queue;
    //   await channel.bindQueue(queue, exchange, rule);
    //   this.app.logger.info(`queue ${queue} bind ${rule} to exchange ${exchange}`);

    //   // 从队列上消费消息
    //   await channel.consume(queue, msg => {
    //     // console.log(msg);
    //     console.log(" queue#%s - %s:'%s'", n, msg.fields.routingKey, msg.content.toString());
    //   }, { noAck: true });
    // }

    console.log({ f: 'consumer_topic', eok, qoks });
  }

  async producer_topic() {
    const { connection, channelMap } = this;
    const channel = await connection.createChannel();

    const config = {
      exchange: {
        name: 'order',
        type: 'topic',
      },
    };

    // 声明交换机
    const { exchange } = config;
    const eok = await channel.assertExchange(exchange.name, exchange.topic, { durable: false });
    channelMap.set(`${exchange.type}_${exchange.name}`, channel);

    // this.app.producer = channelMap;
    console.log({ action: 'producer_topic', eok });

    // const result = await channel.publish(exchange, key, Buffer.from(msg));
    // console.log({ eok, result });
  }

  async init() {
    const { config, app } = this;
    const { url, consumer, producer } = config;
    this.connection = await amqp.connect(url);

    const directory = path.join(app.config.baseDir, 'app/subscriber');
    app.loader.loadToApp(directory, 'subscribers', {
      caseStyle(filepath) {
        return filepath.substring(0, filepath.lastIndexOf('.')).split('/');
      },
    });

    if (consumer) await this.createConsumer(consumer, app.subscribers);
    if (producer) await this.createProducer(producer);
  }

  async createConsumer(options, subscribers) {
    const { app, connection } = this;
    const { exchange, queues } = options;
    console.log({ app, subscribers });

    const channel = await connection.createChannel();

    // 申明交换机
    const eok = await channel.assertExchange(exchange.name, exchange.type, exchange.options);

    const qoks = [];
    for (let i = 0; i < queues.length; i++) {
      let { name = '', rules, options } = queues[i];

      // 声明队列
      const qok = await channel.assertQueue(name, options);
      if (!name) name = qok.queue;
      qoks.push(qok);

      // 绑定匹配规则到队列
      for (let u = 0; u < rules.length; u++) {
        const rule = rules[u];
        await channel.bindQueue(qok.queue, exchange.name, rule);
        this.app.logger.info(`queue ${name}(${qok.queue}) bind ${rule} to exchange ${exchange.name}`);
      }

      // 从队列上消费消息
      await channel.consume(name, msg => {
        console.log(" queue - %s:'%s'", msg.fields.routingKey, msg.content.toString());
      }, { noAck: true });
    }

    console.log({ eok, qoks });

    // const queue = options.queue.name;
    // const ok = await channel.assertQueue(queue, options.queue.options);
    // console.log({ queue: ok });
    // channel.prefetch(1);

    /*
    const Subscriber = subscribers[queue];
    if (!Subscriber) return;

    // 队列模式
    channel.consume(queue, async message => {
      const ctx = app.createAnonymousContext();
      const subscriber = new Subscriber(ctx);
      try {
        await subscriber.consume(message);
        channel.ack(message);
      } catch (error) {
        console.error(error);
      }
    }, { noAck: false });
    */

    // for (const queue of topics) {
    //     continue;
    //   // // 主题匹配模式
    //   // channel.subscribe(topic, Subscriber.subExpression || '*', async function (msg) {
    //   // });
    // }

  }

  async createProducer(options) {
    const { connection, producerMap } = this;
    const { exchanges, queues } = options;

    // 申明交换机
    for (const exchange of exchanges) {
      const channel = await connection.createChannel();
      const eok = await channel.assertExchange(exchange.name, exchange.topic, exchange.options || { durable: false });
      producerMap.set(`${exchange.type}_${exchange.name}`, channel);
      console.log(eok);
    }

    // 声明队列
    for (const queue of queues) {
      const channel = await connection.createChannel();
      const qok = await channel.assertQueue(queue.name, queue.options || { durable: true });
      producerMap.set(`quque_${queue.name}`, channel);
      console.log(qok);
    }
  }

  /**
   * 发送消息到队列
   * @param { queue, content, option } message xxx
   */
  async send(message) {
    const channel = this.channelMap.get(message.queue);
    return await channel.sendToQueue(message.queue, Buffer.from(message.content), { deliveryMode: true });
  }

  /**
   * 发送消息到交换器
   * @param { queue, content, option } message xxx
   */
  async publish(message) {
    const channel = this.channelMap.get(`${message.type}_${message.exchange}`);
    console.log({ message, channel });
    return await channel.publish(message.exchange, message.key, Buffer.from(message.content));
  }

}


function createClient(config, app) {
  const client = new Queue(config, app);

  app.beforeStart(async () => {
    await client.init();
    // app.coreLogger.info(`[egg-amqp] instance status OK, client ready`);
  });

  return client;
}

module.exports = app => {
  app.addSingleton('amqp', createClient);
};
