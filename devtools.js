console.log('DevTools extension loaded');
console.log('Network panel object:', chrome.devtools.panels.network);
console.dir(chrome.devtools.panels);
console.dir(chrome.devtools.network);

chrome.devtools.panels.create(
  "My Panel", // Panel name
  "icon.png", // Icon path
  "panel.html", // HTML file for the panel
  function (panel) {
    console.log("Custom panel created!");
  }
);

function extractQueryName(query) {
  if (!query) return 'N/A';
  // Match both named and anonymous operations
  const match = query.match(/(?:query|mutation)\s+(\w+)|{/);
  if (!match) return 'Unknown';
  // If we matched '{', it's an anonymous operation
  if (match[0] === '{') return 'Anonymous Query';
  // Otherwise return the named operation
  return match[1] || 'Anonymous Operation';
}