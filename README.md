# LinkedIn Chrome Extension Fingerprinting

LinkedIn silently probes for 2,953 Chrome extensions on every page load.

# Background

This repository documents every extension LinkedIn checks for and provides tools to identify them.

## Data

The complete list of extensions with names and Chrome Web Store links:

**[chrome_extensions_with_names_all.csv](https://github.com/mdp/linkedin-extension-fingerprinting/blob/main/chrome_extensions_with_names_all.csv)**

| Column | Description |
|--------|-------------|
| Extension ID | 32-character Chrome extension identifier |
| Name | Extension name |
| URL | Link to Chrome Web Store or Extpose |

## Scripts

### fetch_extension_names.js

Fetches extension names from Chrome Web Store with Extpose fallback for removed/unavailable extensions.

```bash
# Fetch all extensions
node fetch_extension_names.js

# Fetch a subset (useful if rate limited)
node fetch_extension_names.js --offset 0 --limit 500
node fetch_extension_names.js -o 500 -l 500

# Show help
node fetch_extension_names.js --help
```

### test_fetch.js

Test script that processes the first 3 extensions with verbose output.

```bash
node test_fetch.js
```

## Stats

- **2,953** total extensions in LinkedIn's fingerprint list
- **~78%** found on Chrome Web Store
- **~22%** found via Extpose fallback (removed or unavailable on Chrome Web Store)

## Source Files

- `chrome_extension_ids.txt` - Raw list of extension IDs extracted from LinkedIn's fingerprint.js
- `fingerprint.js` - LinkedIn's page script with the extensions (minified)
