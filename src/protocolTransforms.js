var through = require('through2').obj
var BN = require('bn.js')
var reverse = require('buffer-reverse')
var bitcore = require('bitcore-lib-dash');
var Block = bitcore.BlockHeader;
var Transaction = bitcore.Transaction;

var fromTransaction = (tx) => {
  var output = Object.assign({}, tx)
  output.outs = output.outs.map((out) => {
    if (out.value && out.valueBuffer) {
      throw new Error('Transaction output has both "value" and "valueBuffer"')
    }
    var value = out.value || out.valueBuffer
    if (!value || !(BN.isBN(value) || Buffer.isBuffer(value))) {
      throw new Error('Transaction output values must be a BN.js number or ' +
        'a Buffer')
    }
    out = Object.assign({}, out)
    if (out.value) {
      out.valueBuffer = out.value.toBuffer()
      delete out.value
    }
    return out
  })
  return output
}
var fromHeader = function fromHeader(header) {
  var blockHeader = new Block(header);
  return {
    numTransactions: header.numTransactions || 0,
    header: blockHeader
  };
};
var toTransaction = (raw) => {
  var tx = Object.assign(new Transaction(), raw)
  for (var output of tx.outs) {
    output.value = new BN(reverse(output.valueBuffer).toString('hex'), 'hex')
  }
  return tx
}
var toHeader = function toHeader(header) {
  var blockHeader = new Block(header);
  return blockHeader;
}

var encodeTransforms = {
  'tx': fromTransaction,
  'block': (block) => {
    var output = { header: fromHeader(block) }
    output.transactions = block.transactions.map(fromTransaction)
    return output
  },
  'headers': (headers) => headers.map(fromHeader),
  'merkleblock': (block) => {
    var output = fromHeader(block.header)
    output.hashes = block.hashes
    output.flags = block.flags
    return output
  }
}

var decodeTransforms = {
  'tx': toTransaction,
  'block': (block) => ({
    header: toHeader(block.header),
    transactions: block.transactions.map(toTransaction)
  }),
  'headers': (headers) => headers.map((header) => {
    var output = toHeader(header.header)
    output.numTransactions = header.numTransactions
    return output
  }),
  'merkleblock': (block) => ({
    header: toHeader(block.header),
    numTransactions: block.numTransactions,
    hashes: block.hashes,
    flags: block.flags
  })
}

function createTransformStream (transforms) {
  return through(function (message, enc, cb) {
    if (transforms[message.command]) {
      message = Object.assign({}, message)
      message.payload = transforms[message.command](message.payload)
    }
    this.push(message)
    cb(null)
  })
}

function encode () {
  return createTransformStream(encodeTransforms)
}

function decode () {
  return createTransformStream(decodeTransforms)
}

module.exports = { encode, decode }
