use anchor_lang::{accounts::cpi_account::CpiAccount, prelude::*};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Token, TokenAccount, Transfer},
};

pub mod account;
pub mod constants;
pub mod error;

use account::*;
use constants::*;
use error::*;

declare_id!("A1EGu7N7gYReZNd4Q5EXKvCLdm1QsVwkfRguvY7VQhqa");

#[program]
pub mod staking {
    use super::*;
    pub fn initialize(ctx: Context<Initialize>, global_bump: u8) -> ProgramResult {
        let global_authority = &mut ctx.accounts.global_authority;
        global_authority.admin = ctx.accounts.admin.key();
        Ok(())
    }

    pub fn initialize_user_pool(ctx: Context<InitializeUserPool>) -> ProgramResult {
        let mut user_pool = ctx.accounts.user_pool.load_init()?;
        user_pool.owner = ctx.accounts.owner.key();
        Ok(())
    }

    pub fn stake_flwr(
        ctx: Context<StakeFlwr>,
        global_bump: u8,
        amount: u64,
        period: u8,
    ) -> ProgramResult {
        let timestamp = Clock::get()?.unix_timestamp;

        let mut lock_time: i64 = 0;
        match period {
            4 => lock_time = FOUR,
            6 => lock_time = SIX,
            12 => lock_time = YEAR,
            _ => lock_time = FOUR,
        }

        let global_authority = &mut ctx.accounts.global_authority;

        let stake_data = StakedFlowers {
            amount: amount,
            stake_time: timestamp,
            lock_time: lock_time,
        };

        let mut user_pool = ctx.accounts.user_pool.load_mut()?;
        user_pool.add_data(stake_data);

        let src_account_info = &mut &ctx.accounts.user_token_account;
        let dest_account_info = &mut &ctx.accounts.reward_vault;
        let token_program = &mut &ctx.accounts.token_program;

        let cpi_accounts = Transfer {
            from: src_account_info.to_account_info().clone(),
            to: dest_account_info.to_account_info().clone(),
            authority: ctx.accounts.owner.to_account_info().clone(),
        };
        token::transfer(
            CpiContext::new(token_program.clone().to_account_info(), cpi_accounts),
            amount,
        )?;

        global_authority.staked_amount += amount;
        if user_pool.item_count == 1 {
            global_authority.count += 1;
        }

        Ok(())
    }

    pub fn unstake_flwr(ctx: Context<UnstakeFlwr>, global_bump: u8) -> ProgramResult {
        let timestamp = Clock::get()?.unix_timestamp;
        let mut user_pool = ctx.accounts.user_pool.load_mut()?;
        let reward: u64 = user_pool.unstake(ctx.accounts.owner.key(), timestamp)? as u64;

        msg!("Reward: {}", reward);
        if ctx.accounts.reward_vault.amount < 1000 + reward {
            return Err(StakingError::LackLamports.into());
        }
        let global_authority = &mut ctx.accounts.global_authority;

        let seeds = &[GLOBAL_AUTHORITY_SEED.as_bytes(), &[global_bump]];
        let signer = &[&seeds[..]];
        let token_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = Transfer {
            from: ctx.accounts.reward_vault.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: global_authority.to_account_info().clone(),
        };
        token::transfer(
            CpiContext::new_with_signer(token_program.clone(), cpi_accounts, signer),
            reward,
        )?;

        global_authority.count -= 1;
        global_authority.staked_amount -= reward;

        Ok(())
    }

    #[access_control(user(&ctx.accounts.global_authority, &ctx.accounts.owner))]
    pub fn withdraw(ctx: Context<Withdraw>, global_bump: u8, amount: u64) -> ProgramResult {
        let seeds = &[GLOBAL_AUTHORITY_SEED.as_bytes(), &[global_bump]];
        let signer = &[&seeds[..]];
        let token_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = Transfer {
            from: ctx.accounts.reward_vault.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.global_authority.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(token_program.clone(), cpi_accounts, signer),
            amount,
        )?;
        Ok(())

    }
}

#[derive(Accounts)]
#[instruction(global_bump: u8)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init_if_needed,
        seeds = [GLOBAL_AUTHORITY_SEED.as_ref()],
        bump = global_bump,
        payer = admin,
    )]
    pub global_authority: Account<'info, GlobalPool>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct InitializeUserPool<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(zero)]
    pub user_pool: AccountLoader<'info, UserPool>,
}

#[derive(Accounts)]
#[instruction(global_bump: u8)]
pub struct StakeFlwr<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_AUTHORITY_SEED.as_ref()],
        bump = global_bump,
    )]
    pub global_authority: Account<'info, GlobalPool>,

    #[account(mut)]
    pub user_pool: AccountLoader<'info, UserPool>,

    #[account(
        mut,
        constraint = reward_vault.mint == REWARD_TOKEN_MINT_PUBKEY.parse::<Pubkey>().unwrap(),
        constraint = reward_vault.owner == global_authority.key(),
        constraint = reward_vault.amount >= MIN_REWARD_DEPOSIT_AMOUNT,
    )]
    pub reward_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token_account.mint == REWARD_TOKEN_MINT_PUBKEY.parse::<Pubkey>().unwrap(),
        constraint = user_token_account.owner == *owner.key,
    )]
    pub user_token_account: CpiAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(global_bump: u8)]
pub struct UnstakeFlwr<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [GLOBAL_AUTHORITY_SEED.as_ref()],
        bump = global_bump,
    )]
    pub global_authority: Account<'info, GlobalPool>,

    #[account(mut)]
    pub user_pool: AccountLoader<'info, UserPool>,

    #[account(
        mut,
        constraint = reward_vault.mint == REWARD_TOKEN_MINT_PUBKEY.parse::<Pubkey>().unwrap(),
        constraint = reward_vault.owner == global_authority.key(),
        constraint = reward_vault.amount >= MIN_REWARD_DEPOSIT_AMOUNT,
    )]
    pub reward_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token_account.mint == REWARD_TOKEN_MINT_PUBKEY.parse::<Pubkey>().unwrap(),
        constraint = user_token_account.owner == *owner.key,
    )]
    pub user_token_account: CpiAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(global_bump: u8)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(
        mut,
        seeds = [GLOBAL_AUTHORITY_SEED.as_ref()],
        bump = global_bump,
    )]
    pub global_authority: Account<'info, GlobalPool>,

    #[account(
        mut,
        constraint = reward_vault.mint == REWARD_TOKEN_MINT_PUBKEY.parse::<Pubkey>().unwrap(),
        constraint = reward_vault.owner == global_authority.key(),
        constraint = reward_vault.amount >= MIN_REWARD_DEPOSIT_AMOUNT,
    )]
    pub reward_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token_account.mint == REWARD_TOKEN_MINT_PUBKEY.parse::<Pubkey>().unwrap(),
        constraint = user_token_account.owner == *owner.key,
    )]
    pub user_token_account: CpiAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// Access control modifiers
fn user(pool_loader: &Account<GlobalPool>, user: &AccountInfo) -> Result<()> {
    require!(pool_loader.admin == *user.key, StakingError::InvalidGlobalPool);
    Ok(())
}