var stream = require('stream');
var util = require('util');
var queue = require('basic-queue');

module.exports = Parallel;

util.inherits(Parallel, stream.Transform);
function Parallel(concurrency, options) {
  concurrency = Number(concurrency) || 1;

  var _this = this;
  this.errors = [];
  this.concurrentBuffer = [];
  this.concurrentBuffer.highWaterMark = 2 * concurrency;
  this.concurrentQueue = new queue(this._processChunk.bind(this), concurrency);
  this.concurrentQueue.on('error', function(err) {
    _this.errors.push(err);
  });

  stream.Transform.call(this, options);
}

// _process and optionally _preprocess are to be overriden
Parallel.prototype._process = function(chunk, enc, callback) {
  this.push(chunk);
  callback();
};

Parallel.prototype._preprocess = function(chunk, enc) {
  this.concurrentBuffer.push(chunk);
};

// do not override _transform and _flush
Parallel.prototype._transform = function(chunk, enc, callback) {
  var err = this.errors.unshift();
  if (err) return callback(err);

  if (this.concurrentBuffer.length >= this.concurrentBuffer.highWaterMark) {
    return setImmediate(this._transform.bind(this), chunk, enc, callback);
  }

  this._preprocess(chunk, enc);
  for (var i = 0; i < this.concurrentBuffer.length; i++) {
    this.concurrentQueue.add();
  }
  callback();
};

Parallel.prototype._flush = function(callback) {
  var remaining = this.concurrentBuffer.length;
  if (!remaining) return callback();

  for (var i = 0; i < remaining; i++) {
    this.concurrentQueue.add();
  }

  function done(err) {
    if (!done.sent) callback(err);
    done.sent = true;
  }

  this.on('error', done);
  this.concurrentQueue.on('empty', done);
};

Parallel.prototype._processChunk = function(_, callback) {
  var data = this.concurrentBuffer.shift();
  if (!data) return callback();
  this._process(data, null, callback);
};
