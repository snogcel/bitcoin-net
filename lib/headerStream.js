'use strict';

var Transform = require('stream').Transform;
var util = require('util');
var async = require('async');
var debug = require('debug')('bitcoin-net:headerstream');
var INV = require('bitcoin-protocol').constants.inventory;

var HeaderStream = module.exports = function (peers, opts) {
  var _this = this;

  if (!peers) throw new Error('"peers" argument is required');
  Transform.call(this, { objectMode: true });
  opts = opts || {};
  this.peers = peers;
  this.timeout = opts.timeout;
  this.stop = opts.stop;
  this.getting = false;
  this.done = false;
  this.reachedTip = false;
  this.lastLocator = null;
  if (opts.endOnTip) {
    this.once('tip', function () {
      return _this.end();
    });
  }
};
util.inherits(HeaderStream, Transform);

HeaderStream.prototype._error = function (err) {
  this.emit('error', err);
  this.end();
};

HeaderStream.prototype._transform = function (locator, enc, cb) {
  this.lastLocator = locator;
  if (this.reachedTip) return cb(null);
  this._getHeaders(locator, cb);
};

HeaderStream.prototype._getHeaders = function (locator, peer, cb) {
  var _this2 = this;

  if (this.getting || this.done) return;
  if (typeof peer === 'function') {
    cb = peer;
    peer = this.peers;
  }
  this.getting = true;
  peer.getHeaders(locator, {
    stop: this.stop,
    timeout: this.timeout
  }, function (err, headers, peer) {
    if (_this2.done) return;
    if (err) return _this2._error(err);
    _this2.getting = false;
    if (headers.length === 0) return _this2._onTip(locator, peer);
    headers.peer = peer;
    _this2.push(headers);
    if (headers.length < 2000) {
      var lastHash = headers[headers.length - 1].getHash();
      return _this2._onTip([lastHash], peer);
    }
    if (_this2.stop && headers[headers.length - 1].getHash().compare(_this2.stop) === 0) {
      return _this2.end();
    }
    if (cb) cb(null);
  });
};

HeaderStream.prototype.end = function () {
  if (this.done) return;
  this.done = true;
  this.push(null);
};

HeaderStream.prototype._onTip = function (locator, peer) {
  var _this3 = this;

  if (this.reachedTip) return;

  // first, verify we are actually at the tip by repeating the request to
  // other peers. this is so peers can't DoS our sync by sending an empty
  // 'headers' message
  var otherPeers = this.peers.peers.filter(function (peer2) {
    return peer2 !== peer;
  });
  if (otherPeers.length === 0) return;
  otherPeers = otherPeers.slice(0, Math.max(1, otherPeers.length / 2));
  async.each(otherPeers, function (peer, cb) {
    peer.getHeaders(locator, { timeout: _this3.timeout }, function (err, headers) {
      if (err) return cb(null); // ignore errors
      if (headers.length > 0) {
        return cb(new Error('Got a non-empty headers response'));
      }
      cb(null);
    });
  }, function (err) {
    if (err) return debug('Inconsistent responses, not emitting "tip" event');
    debug('Reached chain tip, now listening for relayed blocks');
    _this3.reachedTip = true;
    _this3.emit('tip');
    if (!_this3.done) _this3._subscribeToInvs();
  });
};

HeaderStream.prototype._subscribeToInvs = function () {
  var _this4 = this;

  var hashes = [];
  this.peers.on('inv', function (inv, peer) {
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = inv[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var item = _step.value;

        if (item.type !== INV.MSG_BLOCK) continue;
        var _iteratorNormalCompletion2 = true;
        var _didIteratorError2 = false;
        var _iteratorError2 = undefined;

        try {
          for (var _iterator2 = hashes[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
            var hash = _step2.value;

            if (hash.equals(item.hash)) return;
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

        hashes.push(item.hash);
        if (hashes.length > 8) hashes.shift();
        _this4._getHeaders(_this4.lastLocator, peer);
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
  });
};