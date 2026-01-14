//! Auto Analyser 2 - Stock Analysis Library
//!
//! This library provides modules for stock analysis, including:
//! - Yahoo Finance data fetching
//! - Technical indicators calculation
//! - Async batch fetching with rate limiting
//! - NASDAQ data integration

pub mod analysis;
pub mod api;
pub mod cache;
pub mod config;
pub mod db;
pub mod indicators;
pub mod models;
pub mod nasdaq;
pub mod openrouter;
pub mod yahoo;
pub mod async_fetcher;
