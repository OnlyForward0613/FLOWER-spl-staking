import * as anchor from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';

export interface GlobalPool {
    admin: PublicKey,
    count: anchor.BN,
    stakedAmount: anchor.BN,
}

export interface StakedFlowers {
    amount: anchor.BN,
    stakeTime: anchor.BN,
    lockTime: anchor.BN,
}

export interface UserPool {
    // 8 + 1240
    owner: PublicKey,          // 32
    itemCount: anchor.BN,      // 8
    items: StakedFlowers[],    // 28 * 50
}