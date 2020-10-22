'use strict';

const amqp = require('./lib/amqp');

module.exports = app => {
  if (app.config.amqpx) amqp(app);
};
