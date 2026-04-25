#!/usr/bin/env python3
"""
Extract NVIDIA NIM models from build.nvidia.com and organize by category.

Usage:
    python extract_models_by_category.py           # Fetch and display
    python extract_models_by_category.py --save     # Save to files
    python extract_models_by_category.py --reuse    # Reuse existing nvidia_scrape_raw.txt
"""

import re
import sys
import subprocess
import os
from collections import defaultdict

TAVILY_SCRIPT = "/c/Users/StriderTibe/.pi/agent/skills/tavily-extract/scripts/extract.sh"

def fetch_nvidia_models():
    """Fetch model pages from NVIDIA NIM using Tavily."""
    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        print("Error: TAVILY_API_KEY not set")
        print("Set it with: export TAVILY_API_KEY=tvly-your-key")
        sys.exit(1)
    
    urls = [
        "https://build.nvidia.com/models?pageSize=96&page=1",
        "https://build.nvidia.com/models?pageSize=96&page=2"
    ]
    
    urls_json = '["' + '","'.join(urls) + '"]'
    payload = '{"urls": ' + urls_json + ', "extract_depth": "advanced", "timeout": 60}'
    
    # Escape for bash
    payload_escaped = payload.replace("'", "'\\''")
    cmd = f"bash '{TAVILY_SCRIPT}' '{payload_escaped}'"
    
    env = os.environ.copy()
    env["TAVILY_API_KEY"] = api_key
    
    result = subprocess.run(
        cmd,
        shell=True,
        capture_output=True,
        text=True,
        env=env
    )
    
    if result.stderr:
        print(result.stderr, file=sys.stderr)
    
    return result.stdout

def extract_models_with_categories(content):
    """Extract models and their categories from the scraped content."""
    sections = re.split(r'-{3,}\nURL: https://build\.nvidia\.com', content)
    
    category_map = defaultdict(list)
    
    for section in sections[1:]:
        lines = section.split('\n')
        
        for i, line in enumerate(lines):
            # Check for model entry
            model_match = re.search(
                r'### \[([^\]]+)\]\(https://build\.nvidia\.com/([a-zA-Z0-9_-]+)/([^\)]+)\)',
                line
            )
            if model_match:
                model_name = model_match.group(1)
                publisher = model_match.group(2)
                full_model = f"{publisher}/{model_name}"
                
                # Look ahead for categories (next 20 lines or until next model)
                categories = []
                for j in range(i + 1, min(i + 25, len(lines))):
                    cat_line = lines[j]
                    if cat_line.startswith('### ') or cat_line.startswith('---'):
                        break
                    cat_match = re.search(
                        r'\[([^\]]+)\]\(https://build\.nvidia\.com/models\?pageSize=96&label=([^\)]+)\)',
                        cat_line
                    )
                    if cat_match:
                        cat_name = cat_match.group(2).replace('+', ' ').replace('%20', ' ')
                        categories.append(cat_name)
                
                if not categories:
                    categories = ['Uncategorized']
                
                for cat in categories:
                    category_map[cat].append(full_model)
    
    return category_map

def print_report(category_map):
    """Print the model report."""
    print("=" * 60)
    print("NVIDIA NIM MODELS BY CATEGORY")
    print("=" * 60)
    
    all_models = set()
    for cat in sorted(category_map.keys(), key=str.lower):
        models = sorted(set(category_map[cat]))
        all_models.update(models)
        print(f"\n## {cat.upper()}")
        print(f"   ({len(models)} models)")
        for model in models:
            print(f"   - {model}")
    
    print("\n" + "=" * 60)
    print(f"Total categories: {len(category_map)}")
    print(f"Total unique models: {len(all_models)}")
    print("=" * 60)

def save_outputs(category_map):
    """Save outputs to files."""
    # Save categorized list
    with open("nvidia_nim_models_by_category.txt", "w") as f:
        f.write("=" * 60 + "\n")
        f.write("NVIDIA NIM MODELS BY CATEGORY\n")
        f.write("=" * 60 + "\n")
        
        all_models = set()
        for cat in sorted(category_map.keys(), key=str.lower):
            models = sorted(set(category_map[cat]))
            all_models.update(models)
            f.write(f"\n## {cat.upper()}\n")
            f.write(f"   ({len(models)} models)\n")
            for model in models:
                f.write(f"   - {model}\n")
        
        f.write("\n" + "=" * 60 + "\n")
        f.write(f"Total categories: {len(category_map)}\n")
        f.write(f"Total unique models: {len(all_models)}\n")
        f.write("=" * 60 + "\n")
    
    print("Saved: nvidia_nim_models_by_category.txt")
    
    # Save flat list (sorted A-Z)
    with open("nvidia_nim_models.txt", "w") as f:
        for model in sorted(all_models):
            f.write(model + "\n")
    
    print("Saved: nvidia_nim_models.txt")

def main():
    reuse = "--reuse" in sys.argv
    save = "--save" in sys.argv
    
    if reuse and os.path.exists("nvidia_scrape_raw.txt"):
        print("Reusing existing nvidia_scrape_raw.txt...")
        with open("nvidia_scrape_raw.txt", "r") as f:
            content = f.read()
    else:
        print("Fetching NVIDIA NIM models...")
        content = fetch_nvidia_models()
        
        # Save raw scrape
        with open("nvidia_scrape_raw.txt", "w") as f:
            f.write(content)
        print("Saved: nvidia_scrape_raw.txt")
    
    # Extract models and categories
    category_map = extract_models_with_categories(content)
    
    # Print report
    print_report(category_map)
    
    # Save outputs if requested
    if save:
        save_outputs(category_map)

if __name__ == "__main__":
    main()