const https = require('https');
const fs = require('fs');

// Parse command line arguments
const args = process.argv.slice(2);
let offset = 0;
let limit = Infinity;

for (let i = 0; i < args.length; i++) {
  if ((args[i] === '--offset' || args[i] === '-o') && args[i + 1]) {
    offset = parseInt(args[i + 1], 10);
    i++;
  } else if ((args[i] === '--limit' || args[i] === '-l') && args[i + 1]) {
    limit = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`Usage: node fetch_extension_names.js [options]
Options:
  -o, --offset <n>  Skip first n extensions (default: 0)
  -l, --limit <n>   Process only n extensions (default: all)
  -h, --help        Show this help

Examples:
  node fetch_extension_names.js                    # Process all
  node fetch_extension_names.js -o 100 -l 50       # Skip 100, process next 50
  node fetch_extension_names.js --offset 500       # Start from extension 500
`);
    process.exit(0);
  }
}

// Read the extension IDs from the file
const allExtensionIds = fs.readFileSync('chrome_extension_ids.txt', 'utf-8')
  .split('\n')
  .filter(id => id.trim().length === 32);

const extensionIds = allExtensionIds.slice(offset, offset + limit);

console.log(`Total extensions: ${allExtensionIds.length}`);
console.log(`Processing: ${extensionIds.length} (offset: ${offset}, limit: ${limit === Infinity ? 'none' : limit})`);

const results = [];
let processed = 0;
let errors = 0;

// Function to fetch extension info from Extpose (fallback)
async function fetchFromExtpose(extensionId) {
  return new Promise((resolve) => {
    const url = `https://extpose.com/ext/${extensionId}/en`;

    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, (res) => {
      if (res.statusCode === 404) {
        resolve(null);
        return;
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const titleMatch = data.match(/<title>([^<]+)<\/title>/i);
          if (titleMatch && titleMatch[1]) {
            let name = titleMatch[1]
              .replace(/\s*[-–|]\s*Extpose.*$/i, '')
              .replace(/\s*Chrome Extension.*$/i, '')
              .replace(/\s*[-–]\s*[a-z]{32}$/i, '')
              .trim();

            if (name && name.length > 0 && !name.includes('404') && !name.includes('Not Found')) {
              resolve({ name, url });
              return;
            }
          }
          resolve(null);
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => {
      resolve(null);
    });
  });
}

// Function to fetch extension info from Chrome Web Store
async function fetchExtensionInfo(extensionId) {
  return new Promise((resolve) => {
    const url = `https://chromewebstore.google.com/detail/${extensionId}`;
    
    let redirectCount = 0;
    const maxRedirects = 5;
    const visitedUrls = new Set();

    // Normalize URL for comparison (handle encoding differences)
    const normalizeUrl = (url) => {
      try {
        const parsed = new URL(url);
        // Decode and re-encode to normalize
        parsed.pathname = encodeURI(decodeURI(parsed.pathname));
        return parsed.toString();
      } catch {
        return url;
      }
    };

    const makeRequest = (requestUrl) => {
      const normalizedUrl = normalizeUrl(requestUrl);

      // Detect redirect loops
      if (visitedUrls.has(normalizedUrl)) {
        resolve({
          id: extensionId,
          name: '[REDIRECT LOOP]',
          url: `https://chromewebstore.google.com/detail/${extensionId}`,
          status: 'error',
          error: 'Redirect loop detected'
        });
        return;
      }

      // Check redirect limit
      if (redirectCount >= maxRedirects) {
        resolve({
          id: extensionId,
          name: '[TOO MANY REDIRECTS]',
          url: `https://chromewebstore.google.com/detail/${extensionId}`,
          status: 'error',
          error: 'Too many redirects'
        });
        return;
      }

      visitedUrls.add(normalizedUrl);
      
      https.get(requestUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }, (res) => {
        // Handle redirects
        if (res.statusCode === 301 || res.statusCode === 302) {
          if (res.headers.location) {
            redirectCount++;
            makeRequest(res.headers.location);
            return;
          }
        }
        
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            // Extract the title from the HTML
            const titleMatch = data.match(/<title>([^<]+)<\/title>/i);
            let name = 'Unknown';
            
            if (titleMatch && titleMatch[1]) {
              // Remove " - Chrome Web Store" suffix if present
              name = titleMatch[1].replace(/\s*-\s*Chrome (?:Web Store|웹 스토어|ウェブストア).*$/i, '').trim();

              // If the title was just "Chrome Web Store" with no extension name,
              // try extracting from og:title or h1 instead
              if (!name || name.length === 0 || /^Chrome\s*(Web Store|웹 스토어|ウェブストア)?$/i.test(name)) {
                const ogMatch = data.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
                const h1Match = data.match(/<h1[^>]*>([^<]+)<\/h1>/i);
                if (ogMatch && ogMatch[1]) {
                  name = ogMatch[1].replace(/\s*-\s*Chrome (?:Web Store|웹 스토어|ウェブストア).*$/i, '').trim();
                } else if (h1Match && h1Match[1]) {
                  name = h1Match[1].trim();
                } else {
                  name = 'Unknown';
                }
              }
            }
            
            // Check if extension was removed/not found
            const isNotFound = data.includes('Item not found') || 
                             data.includes('This item is not available') ||
                             res.statusCode === 404;
            
            resolve({
              id: extensionId,
              name: isNotFound ? '[REMOVED/NOT FOUND]' : name,
              url: `https://chromewebstore.google.com/detail/${extensionId}`,
              status: isNotFound ? 'not_found' : 'found'
            });
          } catch (err) {
            resolve({
              id: extensionId,
              name: '[ERROR]',
              url: `https://chromewebstore.google.com/detail/${extensionId}`,
              status: 'error',
              error: err.message
            });
          }
        });
      }).on('error', (err) => {
        resolve({
          id: extensionId,
          name: '[ERROR]',
          url: `https://chromewebstore.google.com/detail/${extensionId}`,
          status: 'error',
          error: err.message
        });
      });
    };
    
    makeRequest(url);
  });
}

// Process extensions with rate limiting
async function processExtensions() {
  const batchSize = 10; // Process 10 at a time
  const delayBetweenBatches = 1000; // 1 second delay between batches
  
  for (let i = 0; i < extensionIds.length; i += batchSize) {
    const batch = extensionIds.slice(i, i + batchSize);
    const promises = batch.map(id => fetchExtensionInfo(id));

    let batchResults = await Promise.all(promises);

    // Try Extpose fallback for failed results
    const fallbackPromises = batchResults.map(async (result) => {
      const needsFallback = result.status === 'error' ||
                            result.status === 'not_found' ||
                            result.name === 'Unknown' ||
                            /^Chrome\s*(Web Store)?$/i.test(result.name);

      if (needsFallback) {
        const extposeResult = await fetchFromExtpose(result.id);
        if (extposeResult) {
          result.name = extposeResult.name;
          result.url = extposeResult.url;
          result.status = 'found_extpose';
        }
      }
      return result;
    });

    batchResults = await Promise.all(fallbackPromises);
    results.push(...batchResults);
    
    processed += batch.length;
    errors += batchResults.filter(r => r.status === 'error' || r.status === 'not_found').length;
    
    console.log(`Progress: ${processed}/${extensionIds.length} (${errors} errors/not found)`);
    
    // Save intermediate results every 100 extensions
    if (processed % 100 === 0) {
      saveResults();
    }
    
    // Rate limiting delay
    if (i + batchSize < extensionIds.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
  
  saveResults();
  const suffix = (offset > 0 || limit !== Infinity)
    ? `_${offset}-${offset + results.length}`
    : '';
  console.log(`\nDone! Results saved to chrome_extensions_with_names${suffix}.json and chrome_extensions_with_names${suffix}.csv`);
}

function saveResults() {
  // Generate filename suffix for subset runs
  const suffix = (offset > 0 || limit !== Infinity)
    ? `_${offset}-${offset + results.length}`
    : '';

  // Save as JSON
  fs.writeFileSync(`chrome_extensions_with_names${suffix}.json`, JSON.stringify(results, null, 2));

  // Save as CSV
  const csv = 'Extension ID,Name,URL\n' +
    results.map(r => `"${r.id}","${r.name.replace(/"/g, '""')}","${r.url}"`).join('\n');
  fs.writeFileSync(`chrome_extensions_with_names${suffix}.csv`, csv);
}

// Start processing
processExtensions()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
