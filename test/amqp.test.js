'use strict';

const mock = require('egg-mock');

describe('test/amqp.test.js', () => {
  let app;
  before(() => {
    app = mock.app({
      baseDir: 'apps/amqp-test',
    });
    return app.ready();
  });

  after(() => app.close());
  afterEach(mock.restore);

  it('should GET /', () => {
    return app.httpRequest()
      .get('/')
      .expect('hi, amqpx')
      .expect(200);
  });
});
