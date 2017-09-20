const test = require('ava');

const Cacti = require('../');

test('returns itself', t => {
  t.true(new Cacti() instanceof Cacti);
});
