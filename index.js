const Web3 = require("web3");
const ObjectToCsv = require("objects-to-csv");
const path = require('path');
const timestamp = require('unix-timestamp');
const fs = require("fs");
const _ = require("lodash");
require('dotenv').config();
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ABI_PATH = "./artifacts/UniswapV2Pair.json";

let web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.MAINNET_CONNECTOR));
let abi;

// Read the ABI for UniswapV2Pair contract.
// If successful read then process ahead otherwise exit.
try {
    if (fs.existsSync(ABI_PATH)) {
        let { output } = JSON.parse(fs.readFileSync(ABI_PATH, "utf8"));
        abi = output.abi;
    }
}catch(e) {
    console.log(`Error in reading the ABI of contract: ${e.error}`);
    process.exit(1); // Forcefully exit.
}

async function createSnapshot(pairAddress) {
    // Create the instance of the UniswapV2Pair contract.
    let ethPair = new web3.eth.Contract(abi, pairAddress);
    let tokenHoldersFromTransferEvent = await readInvestors(ethPair, "Transfer");
    let tokenHoldersFromMintEvent = await readInvestors(ethPair, "Mint");
    let tokenHolders = _.uniq(tokenHoldersFromTransferEvent);
    console.log(tokenHolders.length);
    console.log(tokenHolders);
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

createSnapshot(process.env.PAIR_ETH);