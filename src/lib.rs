//! Auto Analyser 2 - Stock Analysis Library
//!
//! This library provides modules for stock analysis, including:
//! - Yahoo Finance data fetching
//! - Technical indicators calculation
//! - Async batch fetching with rate limiting
//! - NASDAQ data integration

pub mod analysis;
pub mod api;
pub mod async_fetcher;
pub mod cache;
pub mod config;
pub mod db;
pub mod indexes;
pub mod indicators;
pub mod models;
pub mod nasdaq;
pub mod notifications;
pub mod openrouter;
pub mod symbols;
pub mod yahoo;
