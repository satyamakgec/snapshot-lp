require('dotenv').config();
const Web3 = require("web3");
const ObjectToCsv = require("objects-to-csv");
const timestamp = require('unix-timestamp');
const csvParse = require('csv-parse/lib/sync');
const fs = require("fs");

const SECONDS_IN_A_DAY = 86400;
const web3 = new Web3(new Web3.providers.WebsocketProvider(process.env.MAINNET_CONNECTOR));
let validHolders = new Array();

async function validateSnapshot(path, pairAddress) {
    let inputContent;
    try {
        if (fs.existsSync(path)) {
            inputContent = fs.readFileSync(path, "utf8");
        }
    }catch(e) {
        console.log(`Error in reading the ABI of contract: ${e.error}`);
        process.exit(1); // Forcefully exit.
    }
    let data = csvParse(inputContent, {
        columns: true,
        skip_empty_lines: true
    });
    let currentTime = parseInt(timestamp.now());
    if (!(currentTime - parseInt(data[0].timestamp) >= process.env.VALIDATION_PERIOD_IN_DAYS * SECONDS_IN_A_DAY)) {
        console.log("Reward period is still left");
        process.exit(1);
    } else {
        let currentBlockNumber = await web3.eth.getBlockNumber();
        let periodInterval = parseInt(process.env.VALIDATE_BLOCK_INTERVAL);
        let startBlockNumber = parseInt(data[0].blockNumber);
        let noOfPeriods = (currentBlockNumber - startBlockNumber)/ periodInterval;
        for(let i = 0; i < data.length; i++) {
            let nextBlockNumber = startBlockNumber;
            let counter = 0;
            for(let j = 0; j < noOfPeriods; j++) {
                nextBlockNumber += periodInterval;
                if (await balanceOfInvestor(pairAddress, data[0].holder, nextBlockNumber) < data[i].amount) {
                    break;
                }
                counter++;
            }
            if (counter == noOfPeriods) {
                validHolders.push(data[i]);
            }
        }
    }
    let csv = new ObjectToCsv(validHolders);
    await csv.toDisk(path);
    process.exit(0);
}

function encodeUint(data) {
    return web3.eth.abi.encodeParameter('uint256', data);
}

async function balanceOfInvestor(contractAddress, target, blockNumber) {
    let index = encodeUint(1);
    let key = web3.eth.abi.encodeParameter('address', target);
    var tempKey = key + index.substring(2);
    let slot = encodeUint(web3.utils.sha3(tempKey, {"encoding": "hex"}));
    return parseInt((web3.utils.toBN(await web3.eth.getStorageAt(contractAddress, slot, blockNumber))).toString());
}

validateSnapshot("./dataset/test.csv", process.env.PAIR_ETH);