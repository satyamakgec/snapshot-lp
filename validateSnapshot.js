require('dotenv').config();
const Web3 = require("web3");
const ObjectToCsv = require("objects-to-csv");
const timestamp = require('unix-timestamp');
const csvParse = require('csv-parse/lib/sync');
const fs = require("fs");
const path = require('path');

const SECONDS_IN_A_DAY = 86400;
const ABI_PATH = "./artifacts/UniswapV2Pair.json";
const web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.MAINNET_CONNECTOR));
let validHolders = new Array();

let abi;

// Read the ABI for UniswapV2Pair contract.
// If successful read then process ahead otherwise exit.
try {
    if (fs.existsSync(ABI_PATH)) {
        abi = JSON.parse(fs.readFileSync(ABI_PATH, "utf8"));
    }
}catch(e) {
    console.log(`Error in reading the ABI of contract: ${e.error}`);
    process.exit(1); // Forcefully exit.
}

async function validateSnapshot(pathOfDataFile, pairAddress) {
    let inputContent;
    try {
        if (fs.existsSync(pathOfDataFile)) {
            inputContent = fs.readFileSync(pathOfDataFile, "utf8");
        }
    } catch(e) {
        console.log(`Error in reading the ABI of contract: ${e.error}`);
        process.exit(1); // Forcefully exit.
    }
    let data = csvParse(inputContent, {
        columns: true,
        skip_empty_lines: true
    });

    // Create the instance of the UniswapV2Pair contract.
    let pairInstance = new web3.eth.Contract(abi, pairAddress);

    let currentTime = parseInt(timestamp.now());
    if (!(currentTime - parseInt(data[0].timestamp) >= process.env.VALIDATION_PERIOD_IN_DAYS * SECONDS_IN_A_DAY)) {
        console.log("Reward period is still left");
        process.exit(1);
    } else {
        for(let i = 0; i < data.length; i++) {
            if (await isHolderStillValid(pairInstance, "Transfer", data[i].blockNumber, data[i].liquidityProvider, data[i].liquidityTokens)) {
                validHolders.push({
                    "liquidityProvider": data[i].liquidityProvider,
                    "liquidityTokens": data[i].liquidityTokens,
                });
            }
        }
    }
    let csv = new ObjectToCsv(validHolders);
    await csv.toDisk(`./dataset/valid_${path.basename(pathOfDataFile)}`);
    process.exit(0);
}

async function isHolderStillValid(pairInstance, eventType, fromBlock, holder, snappedHolding) {
    let currentHolding = await pairInstance.methods.balanceOf(holder).call();
    if (currentHolding < snappedHolding) {
        return false;
    }
    // Read all the Transfer event and Mint event to know the token holders.
    let events = await pairInstance.getPastEvents(eventType, {
        fromBlock: fromBlock,
        toBlock: 'latest'
    });
    if (events.length > 0 ) {
        let newBalance = parseInt(snappedHolding);
        let valid = true;
        for(let i = 0; i < events.length; i++) {
            let temp = events[i].returnValues;
            if (temp["to"] == holder) {
                newBalance += parseInt(temp["value"]);
            } else if (temp["from"] == holder) {
                newBalance -= temp["value"];
                if (newBalance < snappedHolding) {
                    valid = false;
                    break;
                }
            }
        }
        return valid;
    }
    return true;
}

validateSnapshot("./dataset/0x1964cf3d1d95965eeceaee11debed99223524f48_1606412075.csv", process.env.PAIR_ETH);