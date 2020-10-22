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
    this.channelMap = new Map();
    this.queueMap = new Map();

    // Exchange 类型：
    // Direct（直连[===]，默认自动命名）：队列模式，直接发往队列，一对一消费，先进先出
    // Fanout（扇出，发往 Binding Queue）：广播模式，发往所有绑定的列队，每条信息多发到每个队列
    // Topic（模糊匹配[#、*]，Routing = Binding）：主题模式，根据模糊匹配发往符合规则的队列
    // Headers（消息头属性匹配）

    // 模式：
    // 消息队列：无交换机，直接发送到队列，先进先出；一对一；一对多，轮流发送
    // 发布订阅：定义 fanout 类型的交换机，匹配路由为 '' 绑定到队列
    // 路由交换：定义 direct 类型的交换机，匹配路由为 xxx 绑定到队列
    // 主题匹配：定义 topic 类型的交换机，匹配路由为 xxx.*.xxx 或 xxx.# 绑定到队列
    // 请求响应
    this.mode = [ 'queue', 'pubsub', 'router', 'topic', 'rpc' ];

    return this;
  }

  async consumer_queue(config) {
    const channel = await this.connection.createChannel();
    const { mode, queue } = config;
    const { name, options, prefetch = 1 } = queue;
    const qok = await channel.assertQueue(name, options);
    channel.prefetch(prefetch);
    console.log(`queue ${name}(${qok.queue}) prefetch ${prefetch}`);

    await channel.consume(name, msg => {
      setTimeout(function() {
        console.log(" queue(%s) - %s:'%s'", qok.queue, msg.fields.routingKey, msg.content.toString());
        channel.ack(msg);
      }, 1000);
    }, { noAck: false });

    console.log(`${name} ${mode} consumer is ok!`, qok);
    /*

    const config = {
      queues: [ // 一个队列对应一个消费者，一个队列可以匹配多条规则
        {
          name: 'list', // 队列名称
          options: { durable: true },
          prefetch: 1, // 预先取几条消费
          noAck: false
        },
        // {
        //   // name: 'B',
        //   options: { exclusive: true },
        // }
      ]
    };

    const { queues } = config;

    const qoks = [];
    for (let i = 0; i < queues.length; i++) {
      let { name = '', options, prefetch, noAck } = queues[i];

      const channel = await this.connection.createChannel();

      // 声明队列
      const qok = await channel.assertQueue(name, options);
      if (!name) name = qok.queue;
      qoks.push(qok);

      channel.prefetch(prefetch);
      console.log(`queue ${name}(${qok.queue})`);

      // 从队列上消费消息
      await channel.consume(name, msg => {
        setTimeout(function () {
          console.log(" queue(%s) - %s:'%s'", qok.queue, msg.fields.routingKey, msg.content.toString());
          channel.ack(msg);
        }, 1000)
      }, { noAck: false });
    }

    console.log({ f: 'consumer_queue', qoks });
    */
  }

  async consumer_pubsub(config) {
    const channel = await this.connection.createChannel();
    const { exchange, queues } = config;

    // 申明交换机
    await channel.assertExchange(exchange.name, exchange.type, exchange.options);

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
  }

  async consumer_router(config) {
    const channel = await this.connection.createChannel();
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

  async consumer_topic(config) {
    let { mode, exchange, queues = [], options } = config;
    if (config.queue) queues.push(config.queue);
    if (!options) options = { noAck: true };

    const channel = await this.connection.createChannel();
    await channel.assertExchange(exchange.name, exchange.type, exchange.options);

    for (let i = 0; i < queues.length; i++) {
      const queue = queues[i];
      const qok = await channel.assertQueue(queue.name, queue.options);

      // 绑定匹配规则到队列
      for (let u = 0; u < queue.rules.length; u++) {
        const rule = queue.rules[u];
        await channel.bindQueue(qok.queue, exchange.name, rule);
        this.app.logger.info(`[consumer] queue ${queue.name}(${qok.queue}) bind ${rule} to exchange ${exchange.name}`);
        console.log(`[consumer] #${mode} queue ${queue.name}(${qok.queue}) bind ${rule} to exchange ${exchange.name}`);
      }

      const Subscriber = this.app.subscribers[queue.subscriber || queue.name || qok.queue];
      if (!Subscriber) return;
      await channel.consume(qok.queue, async message => {
        const ctx = this.app.createAnonymousContext();
        ctx.channel = channel;
        const subscriber = new Subscriber(ctx);
        await subscriber.consume(message);
      }, options);
    }
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

    // if (consumer) await this.createConsumer(consumer, app.subscribers);
    if (consumer && app.subscribers) {
      for (const [ name, config ] of Object.entries(consumer)) {
        // console.log(`${name}: ${JSON.stringify(config)}`);
        await this[`consumer_${config.mode}`](config, name);
      }
    }

    if (producer) {
      for (const [ name, config ] of Object.entries(producer)) {
        await this.createProducer(config, name);
      }
    }
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

  async createProducer(config) {
    const channel = await this.connection.createChannel();
    const { mode, queue, exchange } = config;

    if (queue) {
      const qok = await channel.assertQueue(queue.name, queue.options);
      this.queueMap.set(queue.name, channel);
      console.log(`${queue.name} ${mode} producer is ok!`, qok);
    }

    if (exchange) {
      const eok = await channel.assertExchange(exchange.name, exchange.type, exchange.options);
      this.channelMap.set(exchange.name, channel);
      console.log(`${exchange.name} ${mode} producer is ok!`, eok);
    }
  }


  /**
   * 发送消息到队列
   * @param {object} message { queue, content, option }
   */
  async send(message) {
    const channel = this.queueMap.get(`${message.queue}`);
    if (channel) return await channel.sendToQueue(message.queue, Buffer.from(message.content), message.option);
    return false;
  }

  /**
   * 发送消息到交换器
   * @param {object} message { queue, content, option }
   */
  async publish(message) {
    const channel = this.channelMap.get(`${message.exchange}`);
    if (channel) return await channel.publish(message.exchange, message.key, Buffer.from(message.content));
    return false;
  }

}


function createClient(config, app) {
  const client = new Queue(config, app);
  app.beforeStart(async () => {
    await client.init();
    // app.coreLogger.info(`[egg-amqpx] instance status OK, client ready`);
  });

  return client;
}

module.exports = app => {
  app.addSingleton('amqpx', createClient);
};
