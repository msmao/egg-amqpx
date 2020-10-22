'use strict';

const debug = require('debug')('subscriber');

class TestSubscriber {

  constructor(ctx) {
    this.ctx = ctx;
    this.app = ctx.app;
    this.channel = ctx.channel; // channel.ack(message);
  }

  async consume(message) {
    debug('message: %s', JSON.stringify(message));
    // await this.ctx.handle(message);
    console.log(message.content.toString());
    // throw ('consume message error');
  }

}

module.exports = TestSubscriber;
