'use strict';

var Transform = require('stream').Transform;
var util = require('util');
var merkleProof = require('bitcoin-merkle-proof');
var debug = require('debug')('bitcoin-net:blockstream');

var BlockStream = module.exports = function (peers, opts) {
  if (!(this instanceof BlockStream)) return new BlockStream(peers, opts);
  if (!peers) throw new Error('"peers" argument is required for BlockStream');
  Transform.call(this, { objectMode: true });

  debug('created BlockStream: ' + opts);

  opts = opts || {};
  this.peers = peers;
  this.batchSize = opts.batchSize || 64;
  this.filtered = opts.filtered;
  this.timeout = opts.timeout || 2 * 1000;

  this.batch = [];
  this.height = null;
  this.buffer = [];
  this.bufferHeight = null;
  this.ended = false;

  this.batchTimeout = null;
};
util.inherits(BlockStream, Transform);

BlockStream.prototype._error = function (err) {
  this.emit('error', err);
};

BlockStream.prototype._transform = function (block, enc, cb) {
  var _this = this;

  if (this.ended) return;

  if (this.height == null) {
    this.height = this.bufferHeight = block.height;
  }

  // buffer block hashes until we have `batchSize`, then make a `getdata`
  // request with all of them once the batch fills up, or if we don't receive
  // any headers for a certain amount of time (`timeout` option)
  var hash = block.header.getHash();
  this.batch.push(hash);
  if (this.batchTimeout) clearTimeout(this.batchTimeout);
  if (this.batch.length >= this.batchSize) {
    this._sendBatch(cb);
  } else {
    this.batchTimeout = setTimeout(function () {
      _this._sendBatch(function (err) {
        if (err) _this._error(err);
      });
    }, this.timeout);
    cb(null);
  }
};

BlockStream.prototype._sendBatch = function (cb) {
  this._getData(this.batch, function (err) {
    return cb(err);
  });
  this.batch = [];
};

BlockStream.prototype._getData = function (hashes, cb) {
  var _this2 = this;

  if (this.ended) return;
  this.peers.getBlocks(hashes, { filtered: this.filtered }, function (err, blocks) {
    if (err) return (cb || _this2._error)(err);
    var onBlock = _this2.filtered ? _this2._onMerkleBlock : _this2._onBlock;
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = blocks[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var block = _step.value;
        onBlock.call(_this2, block);
      }
    } catch (err) {
      _didIteratorError = true;
      _iteratorError = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion && _iterator.return) {
          _iterator.return();
        }
      } finally {
        if (_didIteratorError) {
          throw _iteratorError;
        }
      }
    }

    if (cb) cb(null, blocks);
  });
};

BlockStream.prototype._onBlock = function (message) {
  if (this.ended) return;
  this._push({
    height: this.height++,
    header: message.header,
    transactions: message.transactions
  });
};

BlockStream.prototype._onMerkleBlock = function (message) {
  if (this.ended) return;
  var self = this;

  var block = {
    height: this.height++,
    header: message.header
  };

  var txids = merkleProof.verify({
    flags: message.flags,
    hashes: message.hashes,
    numTransactions: message.numTransactions,
    merkleRoot: message.header.merkleRoot
  });
  if (!txids.length) return done([]);

  var transactions = [];
  var _iteratorNormalCompletion2 = true;
  var _didIteratorError2 = false;
  var _iteratorError2 = undefined;

  try {
    for (var _iterator2 = txids[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
      var txid = _step2.value;

      var hash = txid.toString('base64');
      var tx = this.peers._txPoolMap[hash];
      if (tx) {
        maybeDone(tx);
        continue;
      }
      this.peers.once('tx:' + hash, maybeDone);
    }
  } catch (err) {
    _didIteratorError2 = true;
    _iteratorError2 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion2 && _iterator2.return) {
        _iterator2.return();
      }
    } finally {
      if (_didIteratorError2) {
        throw _iteratorError2;
      }
    }
  }

  function maybeDone(tx) {
    transactions.push(tx);
    if (transactions.length === txids.length) {
      done(transactions);
    }
  }

  function done(transactions) {
    block.transactions = transactions;
    self._push(block);
  }
};

BlockStream.prototype._push = function (block) {
  var offset = block.height - this.bufferHeight;
  this.buffer[offset] = block;
  if (!this.buffer[0]) debug('buffering block, height=' + block.height + ', buffer.length=' + this.buffer.length);
  while (this.buffer[0]) {
    this.push(this.buffer.shift());
    this.bufferHeight++;
  }
};

BlockStream.prototype.end = function () {
  this.ended = true;
  this.push(null);
};