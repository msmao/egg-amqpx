'use strict';

const debug = require('debug')('subscriber');

class SpiderSubscriber {

  constructor(ctx) {
    this.ctx = ctx;
  }

  async consume(message) {
    debug('message: %s', JSON.stringify(message));
    // await this.ctx.handle(message);
    console.log(message.content.toString());
    // throw ('consume message error');
  }

}

module.exports = SpiderSubscriber;
