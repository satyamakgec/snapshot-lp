require('dotenv').config();
const Web3 = require("web3");
const ObjectToCsv = require("objects-to-csv");
const path = require('path');
const timestamp = require('unix-timestamp');
const fs = require("fs");
const _ = require("lodash");
const ethers = require("ethers");
const BigNumber = require('bignumber.js');
const { ChainId, WETH, Token, Price, Route, Fetcher } = require("@uniswap/sdk");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ABI_PATH = "./artifacts/UniswapV2Pair.json";
const web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.MAINNET_CONNECTOR));
const provider = new ethers.providers.InfuraProvider("homestead", process.env.INFURA_PROJECT_ID);
let abi;

// Read the ABI for UniswapV2Pair contract.
// If successful read then process ahead otherwise exit.
try {
    if (fs.existsSync(ABI_PATH)) {
        abi = JSON.parse(fs.readFileSync(ABI_PATH, "utf8"));
        //abi = output.abi;
    }
}catch(e) {
    console.log(`Error in reading the ABI of contract: ${e.error}`);
    process.exit(1); // Forcefully exit.
}

async function emulateSnapshot(pairAddress) {
    // Create the instance of the UniswapV2Pair contract.
    let pairInstance = new web3.eth.Contract(abi, pairAddress);
    let tokenHoldersFromTransferEvent = await readInvestors(pairInstance, "Transfer");
    let tokenHolders = _.uniq(tokenHoldersFromTransferEvent);
    let valueInUSD = await calculateTotalLiquidationValue(pairInstance);
    let filteredHolders = new Array();
    let counter = 0;
    console.log(`No. of unique token investor in ${pairAddress}: ${tokenHolders.length}`);
    tokenHolders.forEach(async (holder) => {
        let value = parseInt(await getLPTokenValue(holder, pairInstance, valueInUSD));
        if (value >= process.env.MINIMUM_DOLLAR_HOLDING) {
            console.log(value);
            filteredHolders.push({
                "liquidityProvider": holder,
                "liquidityTokens": await balanceOfInvestor(holder, pairInstance)
            });
            console.log(`${holder},${await balanceOfInvestor(holder, pairInstance)},${parseInt(timestamp.now())}, ${await web3.eth.getBlockNumber()}`);
        }
    });
}

async function createSnapshot(pairAddress) {
    await emulateSnapshot(pairAddress);
}

// Read all investors of the given contract address.
async function readInvestors(pairInstance, eventType) {
    let tokenHolders = new Array();
    
    // Read all the Transfer event and Mint event to know the token holders.
    let events = await pairInstance.getPastEvents(eventType, {
        fromBlock: process.env.FROM_BLOCK,
        toBlock: 'latest'
    });
    if (events.length > 0 ) {
        events.forEach(element => {
            let temp = element.returnValues;
            if (eventType == "Mint") {
                tokenHolders.push(temp["sender"]);
            } else {
                temp["from"] != ZERO_ADDRESS ? tokenHolders.push(temp["from"]) : null ;
                temp["to"] != ZERO_ADDRESS ? tokenHolders.push(temp["to"]) : null ;
            }
        });
    }
    return tokenHolders;
}

async function balanceOfInvestor(target, pairInstance) {
    return await pairInstance.methods.balanceOf(target).call();
}

async function totalSupply(pairInstance) {
    return await pairInstance.methods.totalSupply().call()
}

async function getLPTokenValue(target, pairInstance, totalPoolValue) {
    let currentHolding = await balanceOfInvestor(target, pairInstance);
    let _totalSupply = await totalSupply(pairInstance);
    if (currentHolding.toString() != "0") {
        let percentageOwnership =
            ((
                (new BigNumber(currentHolding.toString()))
                .div(new BigNumber(_totalSupply.toString())))
                .times(new BigNumber("100")));
        return parseFloat((percentageOwnership.times(new BigNumber(totalPoolValue))).div(new BigNumber("100")));
    } else {
        return 0;
    }
}

async function calculateTotalLiquidationValue(pairInstance) {
    let r = await pairInstance.methods.getReserves().call();
    let token0Address = await pairInstance.methods.token0().call();
    let token1Address = await pairInstance.methods.token1().call()
    let token0 = new web3.eth.Contract(abi, token0Address);
    let token1 = new web3.eth.Contract(abi, token1Address);
    let token0Decimal = await token0.methods.decimals().call();
    let token1Decimal = await token1.methods.decimals().call();
    let token0Symbol = await token0.methods.symbol().call();
    let token1Symbol = await token1.methods.symbol().call();
    let priceDenominated;
    let denominatedCurrency;
    let wwgrReserve;
    let denominatedCurrencyReserve;
    if (token0Symbol == "WWGR") {
        wwgrReserve = parseFloat((new BigNumber(r._reserve0).div(new BigNumber(10).pow(new BigNumber(token0Decimal)))).toPrecision(4));
        denominatedCurrencyReserve = parseFloat((new BigNumber(r._reserve1).div(new BigNumber(10).pow(new BigNumber(token1Decimal)))).toPrecision(4));
        priceDenominated = parseFloat(await getPrice(r._reserve0, r._reserve1, token0Address, token0Decimal, "WWGR", token1Symbol));
        denominatedCurrency = token1Symbol;
    } else {
        wwgrReserve = parseFloat((new BigNumber(r._reserve1).div(new BigNumber(10).pow(new BigNumber(token1Decimal)))).toPrecision(4));
        denominatedCurrencyReserve = parseFloat((new BigNumber(r._reserve0).div(new BigNumber(10).pow(new BigNumber(token0Decimal)))).toPrecision(4));
        priceDenominated = parseFloat(await getPrice(r._reserve1, r._reserve0, token1Address, token1Decimal, "WWGR", token0Symbol));
        denominatedCurrency = token0Symbol;
    }
    let currencyPrice = parseFloat(await getCurrencyPrice(denominatedCurrency));
    return currencyPrice * denominatedCurrencyReserve + parseFloat(parseFloat(wwgrReserve / priceDenominated) * currencyPrice);
}

async function getPrice(numerator, denominator, tokenAddress, decimal, ticker, denomination) {
    const DEN = await getDenominationInstance(denomination);
    const PRICE_FOR = new Token(ChainId.MAINNET, tokenAddress, decimal, ticker)
    const price = new Price(DEN, PRICE_FOR, denominator, numerator);
    return price.toSignificant(4);
}

async function getDenominationInstance(denomination) {
    if (denomination == "WETH") {
        return WETH[ChainId.MAINNET]
    } else if (denomination == "USDT") {
        return new Token(ChainId.MAINNET, web3.utils.toChecksumAddress("0xdac17f958d2ee523a2206206994597c13d831ec7"), 6, "USDT")
    } else if (denomination == "USDC") {
        return new Token(ChainId.MAINNET, web3.utils.toChecksumAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"), 6, "USDC")
    }
}

async function getETHPrice() {
    const DAI = new Token(ChainId.MAINNET, process.env.DAI, 18);
    const pair = await Fetcher.fetchPairData(DAI, WETH[DAI.chainId]);
    const route = new Route([pair], WETH[DAI.chainId]);
    return route.midPrice.toSignificant(6);
}

async function getCurrencyPrice(currency) {
    if (currency == "WETH") {
        return await getETHPrice();
    } else if (currency == "USDT") {
        return 1; // Assuming it will be 1$ always.
    } else if (currency == "USDC") {
        return 1; // Assuming it will be 1$ always.
    }
}

createSnapshot(process.env.PAIR_ETH);