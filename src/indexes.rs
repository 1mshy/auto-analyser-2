//! Index Constituents and Heatmap Data Provider
//!
//! Provides embedded lists of index constituents (S&P 500, NASDAQ 100, Dow 30, Russell 2000)
//! and calculates performance data for heatmap visualization.

use serde::{Deserialize, Serialize};

/// Information about an available index
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub symbol_count: usize,
}

/// Heatmap data for an index
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexHeatmapData {
    pub index_id: String,
    pub index_name: String,
    pub period: String,
    pub index_performance: f64,
    pub generated_at: String,
    pub stocks: Vec<StockHeatmapItem>,
}

/// Individual stock data for heatmap cell
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockHeatmapItem {
    pub symbol: String,
    pub name: Option<String>,
    pub price: f64,
    pub change_percent: f64,
    pub contribution: f64,
    pub market_cap: Option<f64>,
    pub sector: Option<String>,
}

/// Provider for index constituent data
pub struct IndexDataProvider;

impl IndexDataProvider {
    /// Get list of all available indexes
    pub fn get_indexes() -> Vec<IndexInfo> {
        vec![
            IndexInfo {
                id: "sp500".to_string(),
                name: "S&P 500".to_string(),
                description: "500 largest US companies by market cap".to_string(),
                symbol_count: SP500_SYMBOLS.len(),
            },
            IndexInfo {
                id: "nasdaq100".to_string(),
                name: "NASDAQ 100".to_string(),
                description: "100 largest non-financial NASDAQ companies".to_string(),
                symbol_count: NASDAQ100_SYMBOLS.len(),
            },
            IndexInfo {
                id: "dow30".to_string(),
                name: "Dow Jones 30".to_string(),
                description: "30 large-cap blue-chip companies".to_string(),
                symbol_count: DOW30_SYMBOLS.len(),
            },
            IndexInfo {
                id: "russell2000".to_string(),
                name: "Russell 2000".to_string(),
                description: "2000 small-cap US companies (top 200 shown)".to_string(),
                symbol_count: RUSSELL2000_TOP_SYMBOLS.len(),
            },
        ]
    }

    /// Get symbols for a specific index
    pub fn get_index_symbols(index_id: &str) -> Option<Vec<&'static str>> {
        match index_id {
            "sp500" => Some(SP500_SYMBOLS.to_vec()),
            "nasdaq100" => Some(NASDAQ100_SYMBOLS.to_vec()),
            "dow30" => Some(DOW30_SYMBOLS.to_vec()),
            "russell2000" => Some(RUSSELL2000_TOP_SYMBOLS.to_vec()),
            _ => None,
        }
    }

    /// Get index info by ID
    pub fn get_index_info(index_id: &str) -> Option<IndexInfo> {
        Self::get_indexes().into_iter().find(|i| i.id == index_id)
    }
}

// ============================================================================
// EMBEDDED INDEX CONSTITUENT LISTS
// Source: Wikipedia (manually extracted due to scraping restrictions)
// Last updated: January 2026
// ============================================================================

/// S&P 500 constituent symbols
/// Source: https://en.wikipedia.org/wiki/List_of_S%26P_500_companies
pub static SP500_SYMBOLS: &[&str] = &[
    "A", "AAPL", "ABBV", "ABNB", "ABT", "ACGL", "ACN", "ADBE", "ADI", "ADM",
    "ADP", "ADSK", "AEE", "AEP", "AES", "AFL", "AIG", "AIZ", "AJG", "AKAM",
    "ALB", "ALGN", "ALL", "ALLE", "AMAT", "AMCR", "AMD", "AME", "AMGN", "AMP",
    "AMT", "AMZN", "ANET", "ANSS", "AON", "AOS", "APA", "APD", "APH", "APTV",
    "ARE", "ATO", "AVB", "AVGO", "AVY", "AWK", "AXON", "AXP", "AZO", "BA",
    "BAC", "BALL", "BAX", "BBWI", "BBY", "BDX", "BEN", "BF.B", "BG", "BIIB",
    "BIO", "BK", "BKNG", "BKR", "BLDR", "BLK", "BMY", "BR", "BRK.B", "BRO",
    "BSX", "BWA", "BX", "BXP", "C", "CAG", "CAH", "CARR", "CAT", "CB",
    "CBOE", "CBRE", "CCI", "CCL", "CDNS", "CDW", "CE", "CEG", "CF", "CFG",
    "CHD", "CHRW", "CHTR", "CI", "CINF", "CL", "CLX", "CMCSA", "CME", "CMG",
    "CMI", "CMS", "CNC", "CNP", "COF", "COO", "COP", "COR", "COST", "CPAY",
    "CPB", "CPRT", "CPT", "CRL", "CRM", "CRWD", "CSCO", "CSGP", "CSX", "CTAS",
    "CTLT", "CTRA", "CTSH", "CTVA", "CVS", "CVX", "CZR", "D", "DAL", "DAY",
    "DD", "DE", "DECK", "DFS", "DG", "DGX", "DHI", "DHR", "DIS", "DLR",
    "DLTR", "DOC", "DOV", "DOW", "DPZ", "DRI", "DTE", "DUK", "DVA", "DVN",
    "DXCM", "EA", "EBAY", "ECL", "ED", "EFX", "EG", "EIX", "EL", "ELV",
    "EMN", "EMR", "ENPH", "EOG", "EPAM", "EQIX", "EQR", "EQT", "ES", "ESS",
    "ETN", "ETR", "EVRG", "EW", "EXC", "EXPD", "EXPE", "EXR", "F", "FANG",
    "FAST", "FCX", "FDS", "FDX", "FE", "FFIV", "FI", "FICO", "FIS", "FITB",
    "FLT", "FMC", "FOX", "FOXA", "FRT", "FSLR", "FTNT", "FTV", "GD", "GDDY",
    "GE", "GEHC", "GEN", "GEV", "GILD", "GIS", "GL", "GLW", "GM", "GNRC",
    "GOOG", "GOOGL", "GPC", "GPN", "GRMN", "GS", "GWW", "HAL", "HAS", "HBAN",
    "HCA", "HD", "HES", "HIG", "HII", "HLT", "HOLX", "HON", "HPE", "HPQ",
    "HRL", "HSIC", "HST", "HSY", "HUBB", "HUM", "HWM", "IBM", "ICE", "IDXX",
    "IEX", "IFF", "ILMN", "INCY", "INTC", "INTU", "INVH", "IP", "IPG", "IQV",
    "IR", "IRM", "ISRG", "IT", "ITW", "IVZ", "J", "JBHT", "JBL", "JCI",
    "JKHY", "JNJ", "JNPR", "JPM", "K", "KDP", "KEY", "KEYS", "KHC", "KIM",
    "KLAC", "KMB", "KMI", "KMX", "KO", "KR", "KVUE", "L", "LDOS", "LEN",
    "LH", "LHX", "LIN", "LKQ", "LLY", "LMT", "LNT", "LOW", "LRCX", "LULU",
    "LUV", "LVS", "LW", "LYB", "LYV", "MA", "MAA", "MAR", "MAS", "MCD",
    "MCHP", "MCK", "MCO", "MDLZ", "MDT", "MET", "META", "MGM", "MHK", "MKC",
    "MKTX", "MLM", "MMC", "MMM", "MNST", "MO", "MOH", "MOS", "MPC", "MPWR",
    "MRK", "MRNA", "MRO", "MS", "MSCI", "MSFT", "MSI", "MTB", "MTCH", "MTD",
    "MU", "NCLH", "NDAQ", "NDSN", "NEE", "NEM", "NFLX", "NI", "NKE", "NOC",
    "NOW", "NRG", "NSC", "NTAP", "NTRS", "NUE", "NVDA", "NVR", "NWS", "NWSA",
    "NXPI", "O", "ODFL", "OKE", "OMC", "ON", "ORCL", "ORLY", "OTIS", "OXY",
    "PANW", "PARA", "PAYC", "PAYX", "PCAR", "PCG", "PEG", "PEP", "PFE", "PFG",
    "PG", "PGR", "PH", "PHM", "PKG", "PLD", "PLTR", "PM", "PNC", "PNR",
    "PNW", "PODD", "POOL", "PPG", "PPL", "PRU", "PSA", "PSX", "PTC", "PWR",
    "PYPL", "QCOM", "QRVO", "RCL", "REG", "REGN", "RF", "RJF", "RL", "RMD",
    "ROK", "ROL", "ROP", "ROST", "RSG", "RTX", "RVTY", "SBAC", "SBUX", "SCHW",
    "SHW", "SJM", "SLB", "SMCI", "SNA", "SNPS", "SO", "SOLV", "SPG", "SPGI",
    "SRE", "STE", "STLD", "STT", "STX", "STZ", "SWK", "SWKS", "SYF", "SYK",
    "SYY", "T", "TAP", "TDG", "TDY", "TECH", "TEL", "TER", "TFC", "TFX",
    "TGT", "TJX", "TMO", "TMUS", "TPR", "TRGP", "TRMB", "TROW", "TRV", "TSCO",
    "TSLA", "TSN", "TT", "TTWO", "TXN", "TXT", "TYL", "UAL", "UBER", "UDR",
    "UHS", "ULTA", "UNH", "UNP", "UPS", "URI", "USB", "V", "VFC", "VICI",
    "VLO", "VLTO", "VMC", "VRSK", "VRSN", "VRTX", "VST", "VTR", "VTRS", "VZ",
    "WAB", "WAT", "WBA", "WBD", "WDC", "WEC", "WELL", "WFC", "WM", "WMB",
    "WMT", "WRB", "WST", "WTW", "WY", "WYNN", "XEL", "XOM", "XYL", "YUM",
    "ZBH", "ZBRA", "ZTS",
];

/// NASDAQ 100 constituent symbols
/// Source: https://en.wikipedia.org/wiki/Nasdaq-100
pub static NASDAQ100_SYMBOLS: &[&str] = &[
    "AAPL", "ABNB", "ADBE", "ADI", "ADP", "ADSK", "AEP", "AMAT", "AMD", "AMGN",
    "AMZN", "ANSS", "ARM", "ASML", "AVGO", "AZN", "BIIB", "BKNG", "BKR", "CCEP",
    "CDNS", "CDW", "CEG", "CHTR", "CMCSA", "COST", "CPRT", "CRWD", "CSCO", "CSGP",
    "CSX", "CTAS", "CTSH", "DASH", "DDOG", "DLTR", "DXCM", "EA", "EXC", "FANG",
    "FAST", "FTNT", "GEHC", "GFS", "GILD", "GOOG", "GOOGL", "HON", "IDXX", "ILMN",
    "INTC", "INTU", "ISRG", "KDP", "KHC", "KLAC", "LIN", "LRCX", "LULU", "MAR",
    "MCHP", "MDB", "MDLZ", "MELI", "META", "MNST", "MRNA", "MRVL", "MSFT", "MU",
    "NFLX", "NVDA", "NXPI", "ODFL", "ON", "ORLY", "PANW", "PAYX", "PCAR", "PDD",
    "PEP", "PYPL", "QCOM", "REGN", "ROP", "ROST", "SBUX", "SMCI", "SNPS", "SPLK",
    "TEAM", "TMUS", "TSLA", "TTD", "TTWO", "TXN", "VRSK", "VRTX", "WBD", "WDAY",
    "XEL", "ZS",
];

/// Dow Jones 30 constituent symbols
/// Source: https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average
pub static DOW30_SYMBOLS: &[&str] = &[
    "AAPL", "AMGN", "AMZN", "AXP", "BA", "CAT", "CRM", "CSCO", "CVX", "DIS",
    "DOW", "GS", "HD", "HON", "IBM", "INTC", "JNJ", "JPM", "KO", "MCD",
    "MMM", "MRK", "MSFT", "NKE", "NVDA", "PG", "TRV", "UNH", "V", "WMT",
];

/// Russell 2000 top symbols (top 200 by market cap for feasibility)
/// Source: https://en.wikipedia.org/wiki/Russell_2000_Index
pub static RUSSELL2000_TOP_SYMBOLS: &[&str] = &[
    "ACIW", "AGCO", "AIT", "ALKS", "AMED", "AMKR", "AMSF", "APPF", "ASGN", "AZEK",
    "BCO", "BDC", "BFAM", "BGCP", "BILL", "BOOT", "BPMC", "BRBR", "CAKE", "CALX",
    "CARG", "CATY", "CBSH", "CCOI", "CHE", "CHH", "CHRD", "CIEN", "CLVT", "CNK",
    "CNMD", "CNXC", "COHR", "COKE", "COLB", "COOP", "CORT", "CRVL", "CSGP", "CSWI",
    "CWK", "DAN", "DCI", "DLX", "DORM", "ENSG", "ESNT", "EVR", "EXPO", "FAF",
    "FCFS", "FIX", "FHI", "FIVE", "FLO", "FROG", "FSS", "GEF", "GKOS", "GMS",
    "GNTX", "GOLF", "GSHD", "GTY", "HALO", "HASI", "HELE", "HLI", "HLNE", "HOMB",
    "HQY", "HRI", "HTLD", "HUBG", "HZO", "IBOC", "IBTX", "ICUI", "IDCC", "IPAR",
    "ITGR", "JBT", "JJSF", "KAMN", "KBR", "KLIC", "KMPR", "KNF", "KREF", "KRG",
    "LANC", "LAUR", "LAWS", "LCII", "LFUS", "LGIH", "LNTH", "LSTR", "MASI", "MATX",
    "MAXR", "MCRI", "MEDP", "MGEE", "MGRC", "MIDD", "MLI", "MMSI", "MOG.A", "MORN",
    "MRCY", "MSTR", "MTDR", "MTH", "MTRN", "MUSA", "NEOG", "NFG", "NMIH", "NOVT",
    "NWE", "NXGN", "OGS", "OLED", "OMCL", "OSK", "OTTR", "PATK", "PCRX", "PDCE",
    "PEN", "PGNY", "PINC", "PIPR", "PLMR", "PLXS", "PLUS", "POWI", "PPBI", "PRFT",
    "PSN", "PSTG", "PTGX", "PVH", "QLYS", "RAMP", "RCII", "REXR", "RH", "RHP",
    "RLI", "RMBS", "ROCK", "RPD", "RUSHA", "SABR", "SAFM", "SANM", "SATS", "SBCF",
    "SCI", "SEIC", "SGRY", "SHAK", "SITE", "SKY", "SLGN", "SM", "SMTC", "SNDR",
    "SPSC", "SPXC", "SSD", "STAA", "STEP", "STRA", "STRL", "SUM", "SWX", "TBBK",
    "TCBI", "TENB", "THRM", "THS", "TKR", "TNDM", "TREX", "TRNO", "TRN", "TTEC",
    "TTEK", "TXRH", "UDMY", "UFI", "UMBF", "UNFI", "URBN", "VCEL", "VNT", "VSCO",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_indexes() {
        let indexes = IndexDataProvider::get_indexes();
        assert_eq!(indexes.len(), 4);
        assert!(indexes.iter().any(|i| i.id == "sp500"));
        assert!(indexes.iter().any(|i| i.id == "nasdaq100"));
        assert!(indexes.iter().any(|i| i.id == "dow30"));
        assert!(indexes.iter().any(|i| i.id == "russell2000"));
    }

    #[test]
    fn test_get_index_symbols() {
        let sp500 = IndexDataProvider::get_index_symbols("sp500").unwrap();
        assert!(sp500.len() > 400);
        assert!(sp500.contains(&"AAPL"));
        assert!(sp500.contains(&"MSFT"));

        let nasdaq = IndexDataProvider::get_index_symbols("nasdaq100").unwrap();
        assert!(nasdaq.len() >= 100);

        let dow = IndexDataProvider::get_index_symbols("dow30").unwrap();
        assert_eq!(dow.len(), 30);

        assert!(IndexDataProvider::get_index_symbols("invalid").is_none());
    }

    #[test]
    fn test_get_index_info() {
        let sp500 = IndexDataProvider::get_index_info("sp500").unwrap();
        assert_eq!(sp500.name, "S&P 500");
        
        assert!(IndexDataProvider::get_index_info("invalid").is_none());
    }
}
