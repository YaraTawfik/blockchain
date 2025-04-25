"use strict";

const blindSignatures = require('blind-signatures');
const { Coin, COIN_RIS_LENGTH, IDENT_STR, BANK_STR } = require('./coin.js');
const utils = require('./utils.js');

// Bank key
const BANK_KEY = blindSignatures.keyGeneration({ b: 2048 });
const N = BANK_KEY.keyPair.n;
const E = BANK_KEY.keyPair.e;

/**
 * Signs a blinded coin.
 */
function signCoin(blindedCoinHash) {
  return blindSignatures.sign({
    blinded: blindedCoinHash,
    key: BANK_KEY,
  });
}

/**
 * Parses coin string and returns left/right identity hash arrays.
 */
function parseCoin(s) {
  let [cnst, amt, guid, leftHashes, rightHashes] = s.split('-');
  if (cnst !== BANK_STR) {
    throw new Error(`Invalid identity string: ${cnst} received, but ${BANK_STR} expected`);
  }
  let lh = leftHashes.split(',');
  let rh = rightHashes.split(',');
  return [lh, rh];
}

/**
 * Verifies and accepts a coin.
 */
function acceptCoin(coin) {
  const isValid = blindSignatures.verify({
    unblinded: coin.signature,
    N: coin.n,
    E: coin.e,
    message: coin.toString()
  });

  if (!isValid) {
    throw new Error("Invalid coin signature.");
  }

  let [leftHashes, rightHashes] = parseCoin(coin.toString());
  let ris = [];
  for (let i = 0; i < COIN_RIS_LENGTH; i++) {
    let isLeft = utils.randInt(2) === 0;
    let chosen = coin.getRis(isLeft, i);
    let expectedHash = isLeft ? leftHashes[i] : rightHashes[i];
    if (utils.hash(chosen) !== expectedHash) {
      throw new Error("RIS hash verification failed.");
    }
    ris.push(chosen);
  }
  return ris;
}

/**
 * Identifies the cheater in a double-spending case.
 */
function determineCheater(guid, ris1, ris2) {
  for (let i = 0; i < COIN_RIS_LENGTH; i++) {
    let xorResult = Buffer.from(ris1[i], 'hex').map((b, index) => b ^ Buffer.from(ris2[i], 'hex')[index]);
    let xorString = xorResult.toString();
    if (xorString.startsWith(IDENT_STR)) {
      console.log(`The cheater is the original coin owner: ${xorString.split(':')[1]}`);
      return;
    }
  }
  console.log("The merchant is the cheater!");
}

// ---------------------------
// Coin generation and signing
// ---------------------------
let coin = new Coin('alice', 20, N.toString(), E.toString());

// Blind the coin message
const { blinded, r } = blindSignatures.blind({
  message: coin.toString(),
  N: N,
  E: E
});

// Bank signs the blinded message
const blindSig = signCoin(blinded);

// Unblind the signature
const unblinded = blindSignatures.unblind({
  signed: blindSig,
  N: N,
  r: r
});

// Attach signature to the coin
coin.signature = unblinded;

// Merchant 1 accepts the coin
let ris1 = acceptCoin(coin);

// Merchant 2 accepts the same coin
let ris2 = acceptCoin(coin);

// Bank detects double-spending
determineCheater(coin.guid, ris1, ris2);

// If RIS are same, merchant is the cheater
console.log();
determineCheater(coin.guid, ris1, ris1);
