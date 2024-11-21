// manifest.json
{
  "manifest_version": 3,
  "name": "GraphQL Network Inspector",
  "version": "1.0",
  "description": "Adds GraphQL query information to Chrome DevTools Network panel",
  "permissions": ["webRequest"],
  "devtools_page": "devtools.html",
  "host_permissions": ["<all_urls>"]
}

// devtools.html
<!DOCTYPE html>
<html>
  <head>
    <script src="devtools.js"></script>
  </head>
</html>

// devtools.js
chrome.devtools.panels.network.createView(
  'GraphQL',
  'panel.html'
);

chrome.devtools.network.onRequestFinished.addListener(request => {
  if (request.request.url.includes('/graphql')) {
    try {
      const postData = request.request.postData;
      if (postData) {
        const requestBody = JSON.parse(postData.text);
        const queryName = extractQueryName(requestBody.query);
        
        // Add custom data to the request
        request.response.customColumns = {
          queryName: queryName
        };
      }
    } catch (error) {
      console.error('Error parsing GraphQL request:', error);
    }
  }
});

function extractQueryName(query) {
  // Basic regex to extract the query/mutation name
  const match = query.match(/(?:query|mutation)\s+(\w+)/);
  return match ? match[1] : 'Anonymous Operation';
}

// panel.html
<!DOCTYPE html>
<html>
<head>
  <style>
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 8px;
      border: 1px solid #ddd;
      text-align: left;
    }
  </style>
</head>
<body>
  <table id="requests-table">
    <thead>
      <tr>
        <th>URL</th>
        <th>Query Name</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>
  <script src="panel.js"></script>
</body>
</html>

// panel.js
chrome.devtools.network.onRequestFinished.addListener(request => {
  if (request.request.url.includes('/graphql')) {
    const table = document.querySelector('#requests-table tbody');
    const row = document.createElement('tr');
    
    const urlCell = document.createElement('td');
    urlCell.textContent = request.request.url;
    
    const queryNameCell = document.createElement('td');
    queryNameCell.textContent = request.response.customColumns?.queryName || 'N/A';
    
    const statusCell = document.createElement('td');
    statusCell.textContent = request.response.status;
    
    row.appendChild(urlCell);
    row.appendChild(queryNameCell);
    row.appendChild(statusCell);
    table.appendChild(row);
  }
});