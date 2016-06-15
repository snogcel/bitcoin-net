'use strict';

var through = require('through2').obj;
var BN = require('bn.js');
var reverse = require('buffer-reverse');
var bitcore = require('bitcore-lib-dash');
var Block = bitcore.BlockHeader;
var Transaction = bitcore.Transaction;

var fromTransaction = function fromTransaction(tx) {
  var output = Object.assign({}, tx);
  output.outs = output.outs.map(function (out) {
    if (out.value && out.valueBuffer) {
      throw new Error('Transaction output has both "value" and "valueBuffer"');
    }
    var value = out.value || out.valueBuffer;
    if (!value || !(BN.isBN(value) || Buffer.isBuffer(value))) {
      throw new Error('Transaction output values must be a BN.js number or ' + 'a Buffer');
    }
    out = Object.assign({}, out);
    if (out.value) {
      out.valueBuffer = out.value.toBuffer();
      delete out.value;
    }
    return out;
  });
  return output;
};
var fromHeader = function fromHeader(header) {
  var blockHeader = new Block(header);
  return {
    numTransactions: header.numTransactions || 0,
    header: blockHeader
  };
};
var toTransaction = function toTransaction(raw) {
  var tx = Object.assign(new Transaction(), raw);
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = tx.outs[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var output = _step.value;

      output.value = new BN(reverse(output.valueBuffer).toString('hex'), 'hex');
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

  return tx;
};
var toHeader = function toHeader(header) {
  var blockHeader = new Block(header);
  return blockHeader;
};

var encodeTransforms = {
  'tx': fromTransaction,
  'block': function block(_block) {
    var output = { header: fromHeader(_block) };
    output.transactions = _block.transactions.map(fromTransaction);
    return output;
  },
  'headers': function headers(_headers) {
    return _headers.map(fromHeader);
  },
  'merkleblock': function merkleblock(block) {
    var output = fromHeader(block.header);
    output.hashes = block.hashes;
    output.flags = block.flags;
    return output;
  }
};

var decodeTransforms = {
  'tx': toTransaction,
  'block': function block(_block2) {
    return {
      header: toHeader(_block2.header),
      transactions: _block2.transactions.map(toTransaction)
    };
  },
  'headers': function headers(_headers2) {
    return _headers2.map(function (header) {
      var output = toHeader(header.header);
      output.numTransactions = header.numTransactions;
      return output;
    });
  },
  'merkleblock': function merkleblock(block) {
    return {
      header: toHeader(block.header),
      numTransactions: block.numTransactions,
      hashes: block.hashes,
      flags: block.flags
    };
  }
};

function createTransformStream(transforms) {
  return through(function (message, enc, cb) {
    if (transforms[message.command]) {
      message = Object.assign({}, message);
      message.payload = transforms[message.command](message.payload);
    }
    this.push(message);
    cb(null);
  });
}

function encode() {
  return createTransformStream(encodeTransforms);
}

function decode() {
  return createTransformStream(decodeTransforms);
}

module.exports = { encode: encode, decode: decode };