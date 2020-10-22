# egg-amqp

[![NPM version][npm-image]][npm-url]
[![build status][travis-image]][travis-url]
[![Test coverage][codecov-image]][codecov-url]
[![David deps][david-image]][david-url]
[![Known Vulnerabilities][snyk-image]][snyk-url]
[![npm download][download-image]][download-url]

[npm-image]: https://img.shields.io/npm/v/egg-amqp.svg?style=flat-square
[npm-url]: https://npmjs.org/package/egg-amqpx
[travis-image]: https://img.shields.io/travis/eggjs/egg-amqpx.svg?style=flat-square
[travis-url]: https://travis-ci.org/eggjs/egg-amqpx
[codecov-image]: https://img.shields.io/codecov/c/github/eggjs/egg-amqpx.svg?style=flat-square
[codecov-url]: https://codecov.io/github/eggjs/egg-amqpx?branch=master
[david-image]: https://img.shields.io/david/eggjs/egg-amqpx.svg?style=flat-square
[david-url]: https://david-dm.org/eggjs/egg-amqpx
[snyk-image]: https://snyk.io/test/npm/egg-amqpx/badge.svg?style=flat-square
[snyk-url]: https://snyk.io/test/npm/egg-amqpx
[download-image]: https://img.shields.io/npm/dm/egg-amqpx.svg?style=flat-square
[download-url]: https://npmjs.org/package/egg-amqpx

<!--
Description here.
-->

## Install

```bash
$ npm i egg-amqpx --save
```

## Usage

```js
// {app_root}/config/plugin.js
exports.amqp = {
  enable: true,
  package: 'egg-amqpx',
};
```

## Configuration

see [config/config.default.js](config/config.default.js) for more detail.

```js
// {app_root}/config/config.default.js
exports.amqpx = {
  client: {
    url: 'amqp://localhost',
    consumer: {
      // ...
    },
    producer: {
      // ...
    },
  },
};
```

### Queue Mode

定义了一个名为 task 的消息队列

```js
{
  consumer: {
    tasks: {
      mode: 'queue',
      queue: {
        name: 'tasks', // 队列名称
        options: { durable: true },
        prefetch: 1, // 预先取几条消费
        noAck: false
      }
    },
  },
  producer: {
    tasks: {
      mode: 'queue',
      queue: {
        name: 'tasks',
        options: { durable: true }
      }
    },
  }
}
```

### PubSub Mode

定义一个发布订阅模式的消费者、生产者

```js
{
  consumer: {
    orders: {
      mode: 'pubsub',
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
        }
      ]
    }
  },
  producer: {
    orders: {
      mode: 'pubsub',
      exchange: {
        name: 'logs', // 交换机名称
        type: 'fanout', // 交换机类型
        options: { durable: false },
      }
    },
  }
}
```

### Router Mode

```js
{
  consumer: {
    logger: {
      mode: 'router',
      exchange: {
        name: 'logger', // 交换机名称
        type: 'direct', // 交换机类型
        options: { durable: false },
      },
      queues: [ // 一个队列对应一个消费者，一个队列可以匹配多条规则
        {
          // name: 'A', // 队列名称
          router: ['info', 'warning', 'error', 'debug'], // 匹配规则
          options: { exclusive: true },
        },
        {
          // name: 'B',
          router: ['error'],
          options: { exclusive: true },
        }
      ]
    }
  },
  producer: {
    logger: {
      mode: 'router',
      exchange: {
        name: 'logger', // 交换机名称
        type: 'direct', // 交换机类型
        options: { durable: false },
      },
    }
  }
}
```

### Topic Mode

定义按主题模式模式的消费者、生产者

```js
{
  consumer: {
    orders: {
      mode: 'topic',
      exchange: {
        name: 'orders', // 交换机名称，主题 topic
        type: 'topic', // 交换机类型
        options: { durable: false },
      },
      queue: {
        name: 'A', // 队列名称
        subscriber: 'orders', // 消费者名称，对应文件名
        rules: ['files.cn.hz.#'], // 匹配规则
        options: { exclusive: true },
      },
    }
  },
  producer: {
    orders: {
      mode: 'topic',
      exchange: {
        name: 'orders', // 交换机名称，主题 topic
        type: 'topic', // 交换机类型
        options: { durable: false },
      },
    }
  }
}
```

## Example

## Questions & Suggestions

Please open an issue [here](https://github.com/eggjs/egg/issues).

## License

[MIT](LICENSE)
