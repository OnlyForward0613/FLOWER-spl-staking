import { Program, web3 } from '@project-serum/anchor';
import * as anchor from '@project-serum/anchor';
import {
    Keypair,
    PublicKey,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    Transaction,
    TransactionInstruction,
    sendAndConfirmTransaction
} from '@solana/web3.js';
import { Token, TOKEN_PROGRAM_ID, AccountLayout, MintLayout, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

import fs from 'fs';
import { GlobalPool, UserPool } from './types';

const USER_POOL_SIZE = 1248;
const DECIMAL = 100;
const GLOBAL_AUTHORITY_SEED = "global-authority";

const ADMIN_PUBKEY = new PublicKey("Fs8R7R6dP3B7mAJ6QmWZbomBRuTbiJyiR4QYjoxhLdPu");
const FLWR_TOKEN_MINT = new PublicKey("RRDQEkUVF2rfWUxn2PLKxktLvvF28dgvU1guW6D6yGm");
const PROGRAM_ID = "A1EGu7N7gYReZNd4Q5EXKvCLdm1QsVwkfRguvY7VQhqa";

anchor.setProvider(anchor.Provider.local(web3.clusterApiUrl("devnet")));
const solConnection = anchor.getProvider().connection;
const payer = anchor.getProvider().wallet;

let rewardVault: PublicKey = null;
let program: Program = null;
const idl = JSON.parse(
    fs.readFileSync(__dirname + "/staking.json", "utf8")
);

// Address of the deployed program.
const programId = new anchor.web3.PublicKey(PROGRAM_ID);

// Generate the program client from IDL.
program = new anchor.Program(idl, programId);
console.log('ProgramId: ', program.programId.toBase58());

const main = async () => {
    const [globalAuthority, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        program.programId
    );
    console.log('GlobalAuthority: ', globalAuthority.toBase58());

    rewardVault = await getAssociatedTokenAccount(globalAuthority, FLWR_TOKEN_MINT);
    console.log('RewardVault: ', rewardVault.toBase58());
    // console.log('RewardVaultBalance:', (await solConnection.getTokenAccountBalance(rewardVault)).value.uiAmount);


    await initProject();

    // await initUserPool(payer.publicKey);
    // await stakeFlwr(payer.publicKey, 10 * DECIMAL, 4);
    // let pool = await getUserPoolState(payer.publicKey);
    // await unstakeFlwr(payer.publicKey);
    // await withdraw(payer.publicKey, 10 * DECIMAL);


};

/**
 * @dev Initialize the project before all start
 * @returns 
 */
export const initProject = async (
) => {
    const [globalAuthority, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        program.programId
    );

    let rewardVault = await getAssociatedTokenAccount(globalAuthority, FLWR_TOKEN_MINT);
    console.log('RewardVault: ', rewardVault.toBase58());

    const tx = await program.rpc.initialize(
        bump, {
        accounts: {
            admin: payer.publicKey,
            globalAuthority,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
        },
        signers: [],
    });
    await solConnection.confirmTransaction(tx, "confirmed");

    console.log("txHash =", tx);
    return false;
}

/**
 * @dev Initialize the userPool which contains the details of staked amount
 * @param userAddress The caller's publickey
 */
export const initUserPool = async (
    userAddress: PublicKey,
) => {
    let userPoolKey = await PublicKey.createWithSeed(
        userAddress,
        "user-pool",
        program.programId,
    );

    console.log(USER_POOL_SIZE);
    let ix = SystemProgram.createAccountWithSeed({
        fromPubkey: userAddress,
        basePubkey: userAddress,
        seed: "user-pool",
        newAccountPubkey: userPoolKey,
        lamports: await solConnection.getMinimumBalanceForRentExemption(USER_POOL_SIZE),
        space: USER_POOL_SIZE,
        programId: program.programId,
    });

    const tx = await program.rpc.initializeUserPool(
        {
            accounts: {
                owner: userAddress,
                userPool: userPoolKey
            },
            instructions: [
                ix
            ],
            signers: []
        }
    );
    await solConnection.confirmTransaction(tx, "confirmed");

    console.log("Your transaction signature", tx);
    let poolAccount = await program.account.userPool.fetch(userPoolKey);
    console.log('Owner of initialized pool = ', poolAccount.owner.toBase58());
}

/**
 * @dev The main staking function to stake FLWRs
 * @param userAddress The caller's publickey
 * @param amount The amount of FLWR to stake
 * @param period The period of staking with the number of months
 */
export const stakeFlwr = async (
    userAddress: PublicKey,
    amount: number,
    period: number
) => {

    const [globalAuthority, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        program.programId
    );
    let rewardVault = await getAssociatedTokenAccount(globalAuthority, FLWR_TOKEN_MINT);

    let userTokenAccount = await getAssociatedTokenAccount(userAddress, FLWR_TOKEN_MINT);

    let userPoolKey = await PublicKey.createWithSeed(
        userAddress,
        "user-pool",
        program.programId,
    );

    let poolAccount = await solConnection.getAccountInfo(userPoolKey);
    console.log(poolAccount);
    if (poolAccount === null || poolAccount.data === null) {
        console.log("1-------------------1");
        await initUserPool(userAddress);
    }
    console.log("----------------------");

    const tx = await program.rpc.stakeFlwr(
        bump, new anchor.BN(amount), new anchor.BN(period), {
        accounts: {
            owner: userAddress,
            globalAuthority,
            userPool: userPoolKey,
            rewardVault,
            userTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
        },
        instructions: [],
        signers: [],
    }
    );
    await solConnection.confirmTransaction(tx, "singleGossip");

}

/**
 * @dev Unstaking functions to unstake FLWRs and receive the interest or reduce penalty
 * @param userAddress The caller's publickey - the staker's publickey
 */
export const unstakeFlwr = async (userAddress: PublicKey) => {
    const [globalAuthority, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        program.programId
    );
    let rewardVault = await getAssociatedTokenAccount(globalAuthority, FLWR_TOKEN_MINT);

    let userTokenAccount = await getAssociatedTokenAccount(userAddress, FLWR_TOKEN_MINT);

    let userPoolKey = await PublicKey.createWithSeed(
        userAddress,
        "user-pool",
        program.programId,
    );

    const tx = await program.rpc.unstakeFlwr(
        bump, {
        accounts: {
            owner: userAddress,
            globalAuthority,
            userPool: userPoolKey,
            rewardVault,
            userTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
        },
        instructions: [],
        signers: [],
    }
    );
    await solConnection.confirmTransaction(tx, "singleGossip");
    console.log("txHash = ", tx);
}

/**
 * @dev Withdraw FLWRs from the PDA
 * @param userAddress The caller's publickey - only the admin of this PDA
 * @param amount The amount of FLWRs to withdraw
 */
export const withdraw = async (userAddress: PublicKey, amount: number) => {
    const [globalAuthority, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        program.programId
    );
    let rewardVault = await getAssociatedTokenAccount(globalAuthority, FLWR_TOKEN_MINT);

    let userTokenAccount = await getAssociatedTokenAccount(userAddress, FLWR_TOKEN_MINT);

    const tx = await program.rpc.withdraw(
        bump, new anchor.BN(amount), {
        accounts: {
            owner: userAddress,
            globalAuthority,
            rewardVault,
            userTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
        },
        instructions: [],
        signers: [],
    }
    );
    await solConnection.confirmTransaction(tx, "singleGossip");
    console.log("txHash = ", tx);
}

export const getGlobalState = async (
): Promise<GlobalPool | null> => {
    const [globalAuthority, bump] = await PublicKey.findProgramAddress(
        [Buffer.from(GLOBAL_AUTHORITY_SEED)],
        program.programId
    );
    try {
        let globalState = await program.account.globalPool.fetch(globalAuthority);
        return globalState as GlobalPool;
    } catch {
        return null;
    }
}

export const getUserPoolState = async (
    userAddress: PublicKey
): Promise<UserPool | null> => {
    if (!userAddress) return null;

    let userPoolKey = await PublicKey.createWithSeed(
        userAddress,
        "user-pool",
        program.programId,
    );
    console.log('User Pool: ', userPoolKey.toBase58());
    try {
        let poolState = await program.account.userPool.fetch(userPoolKey);
        return poolState as UserPool;
    } catch {
        return null;
    }
}

const getAssociatedTokenAccount = async (ownerPubkey: PublicKey, mintPk: PublicKey): Promise<PublicKey> => {
    let associatedTokenAccountPubkey = (await PublicKey.findProgramAddress(
        [
            ownerPubkey.toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            mintPk.toBuffer(), // mint address
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
    ))[0];
    return associatedTokenAccountPubkey;
}

export const getATokenAccountsNeedCreate = async (
    connection: anchor.web3.Connection,
    walletAddress: anchor.web3.PublicKey,
    owner: anchor.web3.PublicKey,
    nfts: anchor.web3.PublicKey[],
) => {
    let instructions = [], destinationAccounts = [];
    for (const mint of nfts) {
        const destinationPubkey = await getAssociatedTokenAccount(owner, mint);
        let response = await connection.getAccountInfo(destinationPubkey);
        if (!response) {
            const createATAIx = createAssociatedTokenAccountInstruction(
                destinationPubkey,
                walletAddress,
                owner,
                mint,
            );
            instructions.push(createATAIx);
        }
        destinationAccounts.push(destinationPubkey);
        if (walletAddress != owner) {
            const userAccount = await getAssociatedTokenAccount(walletAddress, mint);
            response = await connection.getAccountInfo(userAccount);
            if (!response) {
                const createATAIx = createAssociatedTokenAccountInstruction(
                    userAccount,
                    walletAddress,
                    walletAddress,
                    mint,
                );
                instructions.push(createATAIx);
            }
        }
    }
    return {
        instructions,
        destinationAccounts,
    };
}

export const createAssociatedTokenAccountInstruction = (
    associatedTokenAddress: anchor.web3.PublicKey,
    payer: anchor.web3.PublicKey,
    walletAddress: anchor.web3.PublicKey,
    splTokenMintAddress: anchor.web3.PublicKey
) => {
    const keys = [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
        { pubkey: walletAddress, isSigner: false, isWritable: false },
        { pubkey: splTokenMintAddress, isSigner: false, isWritable: false },
        {
            pubkey: anchor.web3.SystemProgram.programId,
            isSigner: false,
            isWritable: false,
        },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        {
            pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
            isSigner: false,
            isWritable: false,
        },
    ];
    return new anchor.web3.TransactionInstruction({
        keys,
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
        data: Buffer.from([]),
    });
}

main();