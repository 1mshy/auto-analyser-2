/// Normalize user/display symbols to the key format stored in MongoDB.
///
/// Yahoo uses dash-separated US share classes (`BRK-B`) but dot-suffixed
/// Canadian listings (`SHOP.TO`, `XIC.TO`). Keep known Canadian suffixes and
/// normalize US class separators.
pub fn normalize_symbol_key(input: &str) -> String {
    let symbol = input.trim().to_ascii_uppercase().replace('/', "-");
    if let Some((base, suffix)) = symbol.rsplit_once('.') {
        if is_canadian_suffix(suffix) {
            return format!("{}.{}", base, suffix);
        }
        return format!("{}-{}", base, suffix);
    }
    symbol
}

pub fn yahoo_symbol(input: &str) -> String {
    normalize_symbol_key(input)
}

pub fn parse_symbol_list(input: &str) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for raw in input.split(',') {
        let symbol = normalize_symbol_key(raw);
        if !symbol.is_empty() && seen.insert(symbol.clone()) {
            out.push(symbol);
        }
    }
    out
}

fn is_canadian_suffix(suffix: &str) -> bool {
    matches!(suffix, "TO" | "V" | "NE" | "CN")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_us_share_classes_to_yahoo_keys() {
        assert_eq!(normalize_symbol_key("brk.b"), "BRK-B");
        assert_eq!(normalize_symbol_key("BF/B"), "BF-B");
    }

    #[test]
    fn preserves_canadian_listing_suffixes() {
        assert_eq!(normalize_symbol_key("shop.to"), "SHOP.TO");
        assert_eq!(normalize_symbol_key("cnq.to"), "CNQ.TO");
        assert_eq!(normalize_symbol_key("foo.v"), "FOO.V");
    }

    #[test]
    fn parses_and_dedupes_symbol_lists() {
        let symbols = parse_symbol_list("shop.to, SHOP.TO, brk.b,");
        assert_eq!(symbols, vec!["SHOP.TO", "BRK-B"]);
    }
}
