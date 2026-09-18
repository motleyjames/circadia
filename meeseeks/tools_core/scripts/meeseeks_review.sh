#!/bin/bash

# Run Meeseeks code review on the target codebase

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔵 I'M MR. MEESEEKS, LOOK AT ME!${NC}"
echo -e "${GREEN}Starting comprehensive code review...${NC}"
echo ""

# Set up output directory
RUN_ID=$(date +"%Y%m%d_%H%M%S")
OUTPUT_DIR="meeseeks/logs/agent_runs/${RUN_ID}"
mkdir -p "$OUTPUT_DIR/traces"

echo "RUN_ID: $RUN_ID"
echo "Output: $OUTPUT_DIR"
echo ""

# Export trace colocation
export MEESEEKS_TRACES_DIR="$OUTPUT_DIR/traces"

# Option 1: Review specific directories
echo -e "${YELLOW}Option 1: Review specific directories${NC}"
echo "python meeseeks/tools_core/probes/meeseeks_code_reviewer.py \\"
echo "  --directory apps/api/src \\"
echo "  --output $OUTPUT_DIR/api_review.md"
echo ""
echo "python meeseeks/tools_core/probes/meeseeks_code_reviewer.py \\"
echo "  --directory apps/web/src \\"
echo "  --output $OUTPUT_DIR/web_review.md"
echo ""

# Option 2: Review entire project (recommended)
echo -e "${YELLOW}Option 2: Full project review (recommended)${NC}"
echo "python meeseeks/tools_core/scripts/meeseeks_loop.py \\"
echo "  \"Review the target codebase in the project directories. Focus on:
  1. The 99 issues from the previous review (see meeseeks/logs/agent_runs/20260129_025941/91_final_review.md)
  2. Security: tenant isolation, SQL injection defense, auth boundary checks
  3. Reliability: race conditions, workflow idempotency, error handling
  4. Performance: missing indexes, N+1 queries, pagination gaps
  5. Maintainability: code duplication, magic numbers, missing validation
  
  Produce a prioritized list of issues to fix with severity ratings.\" \\"
echo "  --loops 3 \\"
echo "  --output $OUTPUT_DIR/sessions"
echo ""

# Option 3: Use the council for a sanity check
echo -e "${YELLOW}Option 3: Council review (multi-model)${NC}"
echo "python meeseeks/tools_core/council/meeseeks_council_vote.py \\"
echo "  --question \"What are the top 5 highest-priority issues to fix in the target codebase before production deployment?\" \\"
echo "  --context \"\$(cat meeseeks/logs/agent_runs/20260129_025941/91_final_review.md | head -500)\" \\"
echo "  --output $OUTPUT_DIR/council_priorities.md"
echo ""

# Option 4: Directory-level review with all files
echo -e "${YELLOW}Option 4: Batch review multiple directories${NC}"
cat << 'EOF' > "$OUTPUT_DIR/review_all.sh"
#!/bin/bash
# Review all key directories

python meeseeks/tools_core/probes/meeseeks_code_reviewer.py \
  --directory apps/api/src/routes \
  --output meeseeks/logs/agent_runs/${RUN_ID}/routes_review.md

python meeseeks/tools_core/probes/meeseeks_code_reviewer.py \
  --directory apps/api/src/services \
  --output meeseeks/logs/agent_runs/${RUN_ID}/services_review.md

python meeseeks/tools_core/probes/meeseeks_code_reviewer.py \
  --directory apps/api/src/workflows \
  --output meeseeks/logs/agent_runs/${RUN_ID}/workflows_review.md

python meeseeks/tools_core/probes/meeseeks_code_reviewer.py \
  --directory apps/web/src/routes \
  --output meeseeks/logs/agent_runs/${RUN_ID}/web_routes_review.md

python meeseeks/tools_core/probes/meeseeks_code_reviewer.py \
  --directory packages/shared/src \
  --output meeseeks/logs/agent_runs/${RUN_ID}/shared_review.md
EOF

chmod +x "$OUTPUT_DIR/review_all.sh"
echo "Batch review script created: $OUTPUT_DIR/review_all.sh"
echo ""

# Recommended approach
echo -e "${GREEN}=== RECOMMENDED: Run Option 2 (Full RSI loop review) ===${NC}"
echo ""
echo "This will:"
echo "  1. Generate 3 hypotheses about the codebase quality"
echo "  2. Test those hypotheses through code analysis"
echo "  3. Produce a prioritized fix list with reasoning"
echo ""
echo -e "${BLUE}Execute with:${NC}"
echo "bash $OUTPUT_DIR/review_all.sh"
echo ""
echo "OR for a quick targeted review of the 99 issues:"
echo "python meeseeks/tools_core/probes/meeseeks_code_reviewer.py \\"
echo "  --file apps/api/src/routes/registration.ts \\"
echo "  --output $OUTPUT_DIR/registration_review.md"
