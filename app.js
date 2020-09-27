'use strict';

const amqp = require('./lib/amqp');

module.exports = app => {
  if (app.config.amqp.app) amqp(app);
};
