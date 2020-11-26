# snapshot-lp

## Pre-requisite
- Node >= v10.13.0
- NPM >= v6.4.1
- Yarn >= 1.10.1

To run the scripts user have to create an `.env` file which should have `.env.sample` variables, Please make sure `.env` always live locally or at server , Never push at github.

## SnapShot Creation
To create snapshot user has to run `node createSnapShot.js` or `npm run snapshot`. It will create a CSV file in the `dataset` directory with the name `<address of the uniswap pair>_<current_timestamp>.csv`. If you wish to run the snapshot to other pair then simply change the pair address at line 193 in the `createSnapshot.js` file.

## Validate SnapShot
To validate snapshot user has to run `node validateSnapShot.js` or `npm run validate`. It will create a CSV file in the `dataset` directory with the name `valid_<address of the uniswap pair>_<current_timestamp>.csv`. 

Note - User has to provide the valid snapshot csv file path to validate the data set in it.

It will not allow to validate before the validation period.