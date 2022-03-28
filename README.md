# FLOWERS-staking
This is the staking program for the FLOWERS utility tokens.

## Install Dependencies
- Install `node` and `yarn`
- Install `ts-node` as global command
- Confirm the solana wallet preparation: `/home/fury/.config/solana/id.json` in test case

## Usage
- Main script source for all functionality is here: `/cli/script.ts`
- Program account types are declared here: `/cli/types.ts`
- Idl to make the JS binding easy is here: `/cli/staking.json`

Able to test the script functions working in this way.
- Change commands properly in the main functions of the `script.ts` file to call the other functions
- Confirm the `ANCHOR_WALLET` environment variable of the `ts-node` script in `package.json`
- Run `yarn ts-node`

## Features

### As a Smart Contract Owner
For the first time use, the Smart Contract Owner should `initialize` the Smart Contract for global account allocation.
- `initProject`
 
Recall `initialize` function for update the Threshold values after change the constants properly
- `initProject` 

Maintain the Reward token($PRMS) vault's balance
- `REWARD_TOKEN_MINT` is the reward token mint (for test).
- `rewardVault` is the reward token account for owner. The owner should have the token's `Mint Authority` or should `Fund` regularly.

This is current test value. Should be revised properly.

Main Logic:

You can stake $FLWRs
- For 4 months: receive reward- 103%, Before the staking period, penalty- 6%
- For 6 months: receive reward- 106%, Before the staking period, penalty- 12%
- For 12 months: receive reward- 110%, Before the staking period, penalty- 24%

All users can stake by calling the function `stake_flwr` and unstake by calling the function `unstake`.
