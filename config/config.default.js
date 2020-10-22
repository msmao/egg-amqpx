'use strict';

/**
 * egg-amqp default config
 * @member Config#amqp
 * @property {String} SOME_KEY - some description
 */
exports.amqp = {
  client: {
    url: 'amqp://localhost',
    consumer: {
      mode: 'topic',
      exchange: {
        name: 'orders', // 交换机名称，主题 topic
        type: 'topic', // 交换机类型
        options: { durable: false },
      },
      queues: [ // 一个队列对应一个消费者，一个队列可以匹配多条规则
        {
          // name: 'A', // 队列名称
          subscriber: 'test', // 消费者名称，对应文件名
          rules: [ 'files.cn.hz.#' ], // 匹配规则
          options: { exclusive: true },
        },
        {
          // name: 'B',
          rules: [ 'files.cn.*.store' ],
          options: { exclusive: true },
        },
      ],
    },
    producer: {
      mode: 'topic',
      exchange: {
        name: 'orders', // 交换机名称，主题 topic
        type: 'topic', // 交换机类型
        options: { durable: false },
      },
    },
  },
};
