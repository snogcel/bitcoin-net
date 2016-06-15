'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var debug = require('debug')('bitcoin-net:bridge');
var PeerGroup = require('./peerGroup.js');

module.exports = function (_PeerGroup) {
  _inherits(Bridge, _PeerGroup);

  function Bridge(params, opts) {
    _classCallCheck(this, Bridge);

    opts = Object.assign({ connectWeb: false }, opts);
    return _possibleConstructorReturn(this, Object.getPrototypeOf(Bridge).call(this, params, opts));
  }

  _createClass(Bridge, [{
    key: '_onConnection',
    value: function _onConnection(err, client) {
      var _this2 = this;

      if (err) {
        this.emit('connectError', err, null);
      }
      this.emit('connection', client);
      this._connectPeer(function (err, bridgePeer) {
        if (err) {
          _this2.emit('connectError', err);
          return _this2._onConnection(null, client);
        }
        var onError = function onError(err) {
          client.destroy();
          bridgePeer.destroy();
          debug('error', err.message);
          _this2.emit('peerError', err, client, bridgePeer);
        };
        client.once('error', onError);
        bridgePeer.once('error', onError);
        client.once('close', function () {
          return bridgePeer.destroy();
        });
        bridgePeer.once('close', function () {
          return client.destroy();
        });

        client.pipe(bridgePeer).pipe(client);
        _this2.emit('bridge', client, bridgePeer);
      });
    }
  }, {
    key: 'connect',
    value: function connect() {
      // don't let consumers try to make outgoing connections
      throw new Error('Do not use "connect()" with Bridge, only incoming connections are allowed');
    }
  }]);

  return Bridge;
}(PeerGroup);