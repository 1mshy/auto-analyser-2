#!/bin/bash

# API Test Script
# Run this after starting the server: cargo run --release

echo "🧪 Testing Auto Stock Analyser API"
echo "=================================="
echo ""

# Base URL
BASE_URL="http://localhost:3030"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Test function
test_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local expected_status=$5
    
    echo -n "Testing $name... "
    
    if [ "$method" == "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "$BASE_URL$endpoint")
    fi
    
    status_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$status_code" == "$expected_status" ]; then
        echo -e "${GREEN}✓ PASSED${NC} (Status: $status_code)"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC} (Expected: $expected_status, Got: $status_code)"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# Wait for server to be ready
echo "Waiting for server to start..."
timeout=30
while [ $timeout -gt 0 ]; do
    if curl -s "$BASE_URL/" > /dev/null 2>&1; then
        echo -e "${GREEN}Server is ready!${NC}"
        echo ""
        break
    fi
    sleep 1
    timeout=$((timeout - 1))
done

if [ $timeout -eq 0 ]; then
    echo -e "${RED}Server failed to start!${NC}"
    exit 1
fi

# Run tests
echo "Running API Tests:"
echo "------------------"

# Test 1: Root endpoint
test_endpoint "Root endpoint" "GET" "/" "" "200"

# Test 2: Health check
test_endpoint "Health check" "GET" "/health" "" "200"

# Test 3: Progress endpoint
test_endpoint "Progress endpoint" "GET" "/api/progress" "" "200"

# Test 4: Get all stocks
test_endpoint "Get all stocks" "GET" "/api/stocks" "" "200"

# Test 5: Filter stocks (empty filter)
test_endpoint "Filter stocks (empty)" "POST" "/api/stocks/filter" '{}' "200"

# Test 6: Filter stocks (price range)
test_endpoint "Filter stocks (price)" "POST" "/api/stocks/filter" '{"min_price": 100, "max_price": 200}' "200"

# Test 7: Filter stocks (RSI filter)
test_endpoint "Filter stocks (RSI)" "POST" "/api/stocks/filter" '{"min_rsi": 30, "max_rsi": 70}' "200"

# Test 8: Filter stocks (oversold)
test_endpoint "Filter stocks (oversold)" "POST" "/api/stocks/filter" '{"only_oversold": true}' "200"

# Test 9: Filter stocks (overbought)
test_endpoint "Filter stocks (overbought)" "POST" "/api/stocks/filter" '{"only_overbought": true}' "200"

# Test 10: Invalid endpoint
test_endpoint "Invalid endpoint" "GET" "/invalid" "" "404"

echo ""
echo "=================================="
echo "Test Results:"
echo -e "  ${GREEN}Passed: $PASSED${NC}"
echo -e "  ${RED}Failed: $FAILED${NC}"
echo "=================================="

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC} ✨"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
