#!/bin/bash
# create_starter_kit.sh - Creates a starter kit for new Family Office installations
#
# Usage:
#   ./scripts/create_starter_kit.sh [destination_path]
#
# If no destination is provided, creates FO_Analyst_Starter_Kit.zip in the current directory

set -e

# Get the directory where this script lives
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Family Office Analyst Starter Kit Generator ===${NC}"
echo ""

# Determine destination
if [ -n "$1" ]; then
    DEST_DIR="$1"
    CREATE_ZIP=false
else
    TEMP_DIR=$(mktemp -d)
    DEST_DIR="$TEMP_DIR/FO_Analyst_Starter_Kit"
    CREATE_ZIP=true
fi

# Create destination directory
mkdir -p "$DEST_DIR"

echo -e "${YELLOW}Source:${NC} $REPO_ROOT"
echo -e "${YELLOW}Destination:${NC} $DEST_DIR"
echo ""

# Function to copy with directory creation (excludes dev/cache/state files)
copy_item() {
    local src="$1"
    local dest="$2"

    if [ -e "$REPO_ROOT/$src" ]; then
        mkdir -p "$(dirname "$dest")"
        # Use rsync to exclude unwanted directories and files
        rsync -a \
              --exclude='.venv' \
              --exclude='__pycache__' \
              --exclude='.pytest_cache' \
              --exclude='*.pyc' \
              --exclude='.DS_Store' \
              --exclude='browser_state' \
              --exclude='browser_profile' \
              --exclude='data/' \
              --exclude='node_modules' \
              --exclude='*.log' \
              --exclude='images/' \
              "$REPO_ROOT/$src" "$(dirname "$dest")/"
        echo -e "  ${GREEN}✓${NC} $src"
    else
        echo -e "  ${YELLOW}⚠${NC} $src (not found, skipping)"
    fi
}

# =============================================================================
# ESSENTIAL FILES - Required for starter kit
# =============================================================================

echo -e "${GREEN}Copying essential files...${NC}"

# Templates (source of truth)
echo "  Templates:"
copy_item ".claude/templates" "$DEST_DIR/.claude/templates"

# Generator scripts
echo "  Generator:"
copy_item ".claude/generator/generate.py" "$DEST_DIR/.claude/generator/generate.py"
copy_item ".claude/generator/helpers.py" "$DEST_DIR/.claude/generator/helpers.py"
copy_item ".claude/generator/validate_config.py" "$DEST_DIR/.claude/generator/validate_config.py"
copy_item ".claude/generator/requirements.txt" "$DEST_DIR/.claude/generator/requirements.txt"

# Config schema and defaults
echo "  Config:"
copy_item ".claude/config/fo-config.schema.json" "$DEST_DIR/.claude/config/fo-config.schema.json"
copy_item ".claude/config/defaults" "$DEST_DIR/.claude/config/defaults"

# Setup command (non-templated)
echo "  Setup command:"
copy_item ".claude/commands/setup.md" "$DEST_DIR/.claude/commands/setup.md"

# Default output style (gets overwritten by generator after /setup)
echo "  Output style:"
copy_item ".claude/output-styles/fo-analyst.md" "$DEST_DIR/.claude/output-styles/fo-analyst.md"

# Project settings (sets FO Analyst as default output style)
echo "  Project settings:"
cat > "$DEST_DIR/.claude/settings.local.json" << 'EOF'
{
  "outputStyle": "FO Analyst"
}
EOF
echo -e "  ${GREEN}✓${NC} .claude/settings.local.json"

# Skills (including scripts and references)
echo "  Skills:"
for skill_dir in "$REPO_ROOT/.claude/skills/"*/; do
    if [ -d "$skill_dir" ]; then
        skill_name=$(basename "$skill_dir")
        # Copy the entire skill directory
        copy_item ".claude/skills/$skill_name" "$DEST_DIR/.claude/skills/$skill_name"
    fi
done

# Workflow diagrams
echo "  Workflow diagrams:"
copy_item "Workflow/Diagrams" "$DEST_DIR/Workflow/Diagrams"

# Documentation
echo "  Documentation:"
copy_item "STARTER_KIT.md" "$DEST_DIR/STARTER_KIT.md"

# This script itself
echo "  Scripts:"
mkdir -p "$DEST_DIR/scripts"
cp "$SCRIPT_DIR/create_starter_kit.sh" "$DEST_DIR/scripts/"

# Create a minimal .gitignore for the new repo
echo "  Creating .gitignore..."
cat > "$DEST_DIR/.gitignore" << 'EOF'
# Generated config (recreated by /setup)
.claude/config/fo-config.json

# Python
__pycache__/
*.py[cod]
*$py.class
.venv/
venv/
*.egg-info/

# Deal folders (contain confidential data)
# Uncomment specific companies as needed:
# CompanyName/

# Never commit sensitive files
*.env
*.pem
*.key
credentials.json
secrets.yaml

# OS files
.DS_Store
Thumbs.db

# IDE
.idea/
.vscode/
*.swp
*.swo

# Logs
*.log
Audit_Logs/

# Temporary files
*.tmp
*.temp
EOF

echo -e "  ${GREEN}✓${NC} .gitignore"

# =============================================================================
# CREATE ZIP IF NO DESTINATION PROVIDED
# =============================================================================

if [ "$CREATE_ZIP" = true ]; then
    ZIP_NAME="FO_Analyst_Starter_Kit.zip"
    ZIP_PATH="$REPO_ROOT/$ZIP_NAME"

    echo ""
    echo -e "${GREEN}Creating zip archive...${NC}"

    # Remove old zip if exists
    rm -f "$ZIP_PATH"

    # Create zip (excluding dev/cache files)
    cd "$TEMP_DIR"
    zip -r "$ZIP_PATH" "FO_Analyst_Starter_Kit" \
        -x "*.DS_Store" \
        -x "*__pycache__*" \
        -x "*.venv*" \
        -x "*.pytest_cache*" \
        -x "*.pyc" \
        -x "*browser_state*" \
        -x "*browser_profile*" \
        -x "*/data/*" \
        -x "*node_modules*" \
        -x "*.log"

    # Cleanup temp directory
    rm -rf "$TEMP_DIR"

    echo ""
    echo -e "${GREEN}=== Starter Kit Created ===${NC}"
    echo -e "  ${GREEN}✓${NC} $ZIP_PATH"
    echo ""
    echo "To use:"
    echo "  1. unzip $ZIP_NAME -d MyFamilyOffice"
    echo "  2. cd MyFamilyOffice/FO_Analyst_Starter_Kit"
    echo "  3. git init"
    echo "  4. pip install jinja2 pyyaml jsonschema"
    echo "  5. claude"
    echo "  6. /setup"
else
    echo ""
    echo -e "${GREEN}=== Starter Kit Created ===${NC}"
    echo -e "  ${GREEN}✓${NC} $DEST_DIR"
    echo ""
    echo "To use:"
    echo "  1. cd $DEST_DIR"
    echo "  2. git init"
    echo "  3. pip install jinja2 pyyaml jsonschema"
    echo "  4. claude"
    echo "  5. /setup"
fi

echo ""
echo -e "${YELLOW}Note:${NC} Run /setup in Claude Code to configure your Family Office."
