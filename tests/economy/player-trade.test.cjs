'use strict';

const assert = require('node:assert/strict');
const path = require('path');
const { loadStandaloneTypeScriptModule } = require('../ts-module-loader.cjs');

const root = path.resolve(__dirname, '../..');
const tradeModule = loadStandaloneTypeScriptModule(
  root,
  'src/systems/economy/player-trade-service.ts'
);

function fakeMarkets(initialStock = 20, initialPrice = 100) {
  const entry = {
    resourceId: 'steel',
    stock: initialStock,
    demand: 0.5,
    production: 0.2,
    price: initialPrice,
  };
  let recalculations = 0;

  return {
    entry,
    getEntry(locationId, resourceId) {
      return locationId === 'haven' && resourceId === 'steel' ? entry : null;
    },
    recalculate(locationId, resourceId) {
      if (locationId !== 'haven' || resourceId !== 'steel') return null;
      recalculations += 1;
      entry.price = Math.max(1, Math.round(entry.price + (entry.demand - 0.5) * 10));
      return entry.price;
    },
    get recalculations() {
      return recalculations;
    },
  };
}

{
  const markets = fakeMarkets();
  const trade = tradeModule.createPlayerTradeService(markets, 1000);
  const beforePhysical = markets.entry.stock + tradeModule.playerCargoUsed(trade.player);
  const result = trade.buy('haven', 'steel', 4, 10);

  assert(result);
  assert.equal(result.quantity, 4);
  assert.equal(trade.player.credits, 600);
  assert.equal(trade.player.cargo.steel.qty, 4);
  assert.equal(trade.player.cargo.steel.totalCost, 400);
  assert.equal(trade.player.cargo.steel.lastOriginId, 'haven');
  assert.equal(markets.entry.stock, 16);
  assert(markets.entry.demand > 0.5);
  assert.equal(
    markets.entry.stock + tradeModule.playerCargoUsed(trade.player),
    beforePhysical,
    'buying must transfer physical cargo from market to player'
  );
  assert.equal(markets.recalculations, 1);
}

{
  const markets = fakeMarkets(20, 100);
  const trade = tradeModule.createPlayerTradeService(markets, 1000);
  trade.buy('haven', 'steel', 10, 3);

  assert.equal(trade.player.cargo.steel.qty, 3, 'cargo capacity must cap purchases');
  assert.equal(markets.entry.stock, 17);
}

{
  const markets = fakeMarkets(20, 600);
  const trade = tradeModule.createPlayerTradeService(markets, 1000);
  trade.buy('haven', 'steel', 5, 10);

  assert.equal(trade.player.cargo.steel.qty, 1, 'available credits must cap purchases');
  assert.equal(trade.player.credits, 400);
}

{
  const markets = fakeMarkets(20, 100);
  const trade = tradeModule.createPlayerTradeService(markets, 1000);
  trade.buy('haven', 'steel', 5, 10);
  const afterBuyStock = markets.entry.stock;
  const cargoBeforeSell = trade.player.cargo.steel.qty;
  markets.entry.price = 150;
  const result = trade.sell('haven', 'steel', 2);

  assert(result);
  assert.equal(result.quantity, 2);
  assert.equal(markets.entry.stock, afterBuyStock + 2);
  assert.equal(trade.player.cargo.steel.qty, cargoBeforeSell - 2);
  assert(result.realizedProfit > 0, 'selling above weighted cost must realize profit');
  assert.equal(result.creditsDelta, 2 * Math.round(150 * 0.75));
}

{
  const markets = fakeMarkets();
  const trade = tradeModule.createPlayerTradeService(markets, 1000);

  assert.equal(trade.buy('haven', 'steel', Number.NaN, 10), null);
  assert.equal(trade.buy('haven', 'steel', -5, 10), null);
  assert.equal(trade.sell('haven', 'steel', 1), null);
  assert.equal(trade.player.credits, 1000);
}

{
  const markets = fakeMarkets(20, 100);
  const trade = tradeModule.createPlayerTradeService(markets, 1000);
  trade.buy('haven', 'steel', 2, 10);
  markets.entry.price = 200;
  const result = trade.sell('haven', 'steel', 1, 0.25);

  assert(result);
  assert.equal(result.unitPrice, 150, 'logistics fee must affect actual sale payout');
  assert.equal(result.creditsDelta, 150);
}

{
  const markets = fakeMarkets(20, 100);
  const trade = tradeModule.createPlayerTradeService(markets, 1000);
  const purchase = trade.buy('haven', 'steel', 2, 10);
  assert.equal(purchase.unitPrice, 100, 'buying must not charge a sale commission');
  assert.equal(trade.player.credits, 800);
  markets.entry.price = 200;

  const fullFee = trade.sell('haven', 'steel', 1, 0.25);
  assert.equal(fullFee.unitPrice, 150, 'zero logistics must retain 25 percent on sales');
  const noFee = trade.sell('haven', 'steel', 1, 0);
  assert.equal(noFee.unitPrice, 200, 'max logistics must eliminate the sales fee');
  assert.equal(trade.player.credits, 1150, 'no fee may be charged on purchases');
  assert.equal(tradeModule.playerSaleUnitPrice(200), 150, 'default commission is 25 percent');
}

console.log('PASS player trade transactions, cargo limits, cost basis and logistics fees');

{
  const trade = tradeModule.createPlayerTradeService(fakeMarkets(), 1000);
  trade.player.cargo.steel = { qty: 8, hiddenQty: 5, totalCost: 80 };
  trade.player.reservedCargoTons = 2;
  trade.player.smugglingNormalPenalty = 3;
  assert.equal(tradeModule.playerCargoUsed(trade.player), 5);
  assert.equal(trade.grantCargo('steel', 3, 10), false);
  assert.equal(trade.grantCargo('steel', 2, 10), true);
  assert.equal(trade.player.cargo.steel.hiddenQty, 5);
  assert.equal(trade.receiveCargo('steel', 1, 10), 0);
  assert.equal(trade.removeCargo('steel', 7), true);
  assert.equal(trade.player.cargo.steel.qty, 3);
  assert.equal(trade.player.cargo.steel.hiddenQty, 3);
  assert.equal(trade.sell('haven', 'steel', 1).quantity, 1);
  assert.equal(trade.player.cargo.steel.hiddenQty, 2);
}
