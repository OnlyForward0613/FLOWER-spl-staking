use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::*;

#[account]
#[derive(Default)]
pub struct GlobalPool {
    pub admin: Pubkey,
    pub count: u64,
    pub staked_amount: u64,
}

#[zero_copy]
#[derive(Default, PartialEq)]
pub struct StakedFlowers {
    pub amount: u64,     // 8
    pub stake_time: i64, // 8
    pub lock_time: i64,  // 8
}

#[account(zero_copy)]
pub struct UserPool {
    // 1248
    pub owner: Pubkey,                                   // 32
    pub item_count: u64,                                 // 8
    pub items: [StakedFlowers; FLOWERS_STAKE_MAX_COUNT], // 24 * 50 = 1200
}

impl Default for UserPool {
    #[inline]
    fn default() -> UserPool {
        UserPool {
            owner: Pubkey::default(),
            item_count: 0,
            items: [StakedFlowers {
                ..Default::default()
            }; FLOWERS_STAKE_MAX_COUNT],
        }
    }
}

impl UserPool {
    pub fn add_data(&mut self, item: StakedFlowers) {
        self.items[self.item_count as usize] = item;
        self.item_count += 1;   
    }

    pub fn unstake(&mut self, owner: Pubkey, now: i64) -> Result<u64> {
        require!(self.owner.eq(&owner), StakingError::InvalidOwner);
        let mut reward: u64 = 0;

        for i in 0..self.item_count {
            let index = i as usize;
            let amount = self.items[index].amount;
            let lock_time = self.items[index].lock_time;
            let mut rate: u64 = 100;

            if (now - self.items[index].stake_time) >= lock_time {
                match lock_time {
                    FOUR => rate = 103,
                    SIX => rate = 106,
                    YEAR => rate = 110,
                    _ => rate = 100,
                }
            } else {
                match lock_time {
                    FOUR => rate = 94,
                    SIX => rate = 88,
                    YEAR => rate = 76,
                    _ => rate = 100,
                }
            }
            reward += amount * rate / 100;
        }
        self.item_count = 0;
        Ok(reward)
    }
}
