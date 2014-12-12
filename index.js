var stream = require('stream');
var util = require('util');
var queue = require('queue-async');

function Concurrent(concurrency, options) {
  stream.Transform.call(this, options);
  this.queue = queue(concurrency);
  this.buffer = [];
  this.buffer.highWaterMark = 2 * concurrency;
}

// Override this in your implementation. Otherwise this is a pass-through
Concurrent.prototype._process = function(chunk, enc, callback) {
  this.push(chunk);
  callback();
};

// Override this to perform any pre-processing steps that may convert an
// incoming chunk into one or more processing jobs. You must push each chunk
// to be processed into the internal buffer
Concurrent.prototype._preprocess = function(chunk, enc) {
  this.buffer.push(chunk);
};

// Do not override the _tranform and _flush functions
Concurrent.prototype._transform = function(chunk, enc, callback) {
  var stream = this;

  if (this.buffer.length >= this.buffer.highWaterMark) {
    return setImmediate(function() {
      stream._transform(chunk, enc, callback);
    });
  }

  this._preprocess(chunk, enc);
  this.queue.defer(processChunk, this);
  callback();
};

Concurrent.prototype._flush = function(callback) {
  while (this.buffer.length) this.queue.defer(processChunk, this);
  this.queue.await(callback);
};

function processChunk(stream, done) {
  var data = stream.buffer.shift();
  if (!data) return done();
  
  stream._process(data, enc, function(err) {
    if (err) return callback(err);
    stream.queue.defer(processChunk);
    done();
  });
}
