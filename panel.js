// panel.js

let activeFilters = new Set(['all']);

// Add this function to check if a request should be visible
function shouldShowRequest(request, row) {
  // Always show slow requests (duration > 300ms)
  if (row.querySelector('.duration-warning') || row.querySelector('.duration-critical')) {
    return true;
  }
  
  // If 'all' filter is active, show everything
  if (activeFilters.has('all')) {
    return true;
  }
  
  // Check if request matches any active filters
  if (activeFilters.has('graphql') && isGraphQLRequest(request)) {
    return true;
  }
  
  return false;
}

function positionPopup(element, popup) {
  const rect = element.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  
  // Initial position below the element
  let top = rect.bottom + 5;
  let left = rect.left;
  
  // Check if popup would go off the bottom of the viewport
  if (top + popupRect.height > window.innerHeight) {
    top = rect.top - popupRect.height - 5;
  }
  
  // Check if popup would go off the right of the viewport
  if (left + popupRect.width > window.innerWidth) {
    left = window.innerWidth - popupRect.width - 5;
  }
  
  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;
}


function getDatadogTraceId(request) {
  const traceparent = request.request.headers.find(
    h => h.name.toLowerCase() === 'traceparent'
  )?.value;
  
  if (!traceparent) return null;
  
  // Extract trace ID from traceparent format: version-traceId-parentId-flags
  const [, traceId] = traceparent.split('-');
  return traceId;
}

function formatDuration(duration) {
  return duration >= 1000 
    ? `${(duration / 1000).toFixed(3)} s`
    : `${duration.toFixed(0)} ms`;
}

function truncatePath(path, maxLength = 100) {
  if (path.length <= maxLength) return path;
  return path.substring(0, maxLength) + '...';
}

function parseUrl(url) {
  if (url.startsWith('data:')) {
    return {
      domain: 'data:',
      path: url.split(';')[0].substring(5)
    };
  }

  try {
    const urlObj = new URL(url);
    return {
      domain: urlObj.host,
      path: urlObj.pathname
    };
  } catch (e) {
    console.error('Error parsing URL:', e);
    return { domain: '', path: url };
  }
}

function isGraphQLRequest(request) {
  return request.request.url.includes('/graphql') || 
          (request.request.postData?.mimeType === 'application/json' && 
          request.request.postData?.text?.includes('query') &&
          request.request.postData?.text?.includes('variables'));
}

function getGraphQLPayload(request) {
  try {
    if (request.request.postData?.text) {
      const data = JSON.parse(request.request.postData.text);
      return JSON.stringify({
        query: data.query,
        variables: data.variables
      }, null, 2);
    }
  } catch (e) {
    console.error('Error parsing GraphQL payload:', e);
  }
  return 'Unable to parse GraphQL payload';
}

function getGraphQLInfo(request) {
  if (!request.request.postData?.text) {
    return null;
  }
  
  try {
    const data = JSON.parse(request.request.postData.text);
    
    // Get operation name from query
    let operationName = null;
    if (data.query) {
      // Look for 'query OperationName' or 'mutation OperationName'
      const match = data.query.match(/(?:query|mutation)\s+(\w+)/);
      if (match) {
        operationName = match[1];
      }
    }
    
    // If no operation name found in query, check operationName field
    if (!operationName && data.operationName) {
      operationName = data.operationName;
    }
    
    return {
      operationName,
      payload: JSON.stringify({
        query: data.query,
        variables: data.variables
      }, null, 2)
    };
  } catch (e) {
    console.error('Error parsing GraphQL payload:', e);
    return null;
  }
}

    // Stats tracking
let paused = false;
const startTime = Date.now();
let stats = {
  graphql: { count: 0, totalTime: 0 },
  token: { count: 0, totalTime: 0 },
  access: { count: 0, totalTime: 0 },
  slow: { yellow: 0, red: 0, yellowTime: 0, redTime: 0 }  // Add tracking for slow requests
};

function updateStats(request) {
  const duration = request.time;
  
  // Existing stats updates
  if (isGraphQLRequest(request)) {
    stats.graphql.count++;
    stats.graphql.totalTime += duration;
  } else if (request.request.url.endsWith('/token')) {
    stats.token.count++;
    stats.token.totalTime += duration;
  } else if (request.request.url.endsWith('/access')) {
    stats.access.count++;
    stats.access.totalTime += duration;
  }

  // Update slow request stats
  if (duration > 700) {
    stats.slow.red++;
    stats.slow.redTime += duration;
  } else if (duration > 300) {
    stats.slow.yellow++;
    stats.slow.yellowTime += duration;
  }

  // Update status bar
  document.getElementById('page-time').textContent = 
    `${Math.floor((Date.now() - startTime) / 1000)}s`;
  
  document.getElementById('graphql-stats').textContent = 
    `${stats.graphql.count} reqs, ${formatDuration(stats.graphql.totalTime)} total`;
  
  document.getElementById('token-stats').textContent = 
    `Token: ${stats.token.count} reqs, ${formatDuration(stats.token.totalTime)} total`;
  
  document.getElementById('access-stats').textContent = 
    `Access: ${stats.access.count} reqs, ${formatDuration(stats.access.totalTime)} total`;
  
  // Add slow requests stats
  document.getElementById('slow-stats').textContent = 
    `Slow: ${stats.slow.yellow} warning (${formatDuration(stats.slow.yellowTime)}), ${stats.slow.red} critical (${formatDuration(stats.slow.redTime)})`;
}

let activeCell = null;

// Modify the existing chrome.devtools.network.onRequestFinished listener
chrome.devtools.network.onRequestFinished.addListener((request) => {
  if (paused) return;
  if (request.request.method === 'OPTIONS') return;
  if (request.request.url.includes('api.otelcol.eu')) return;
  
  updateStats(request);
  
  const table = document.querySelector('#requests-table tbody');
  const row = document.createElement('tr');
  row.requestData = request;
  
  // Add appropriate class for request type
  if (isGraphQLRequest(request)) {
    row.classList.add('graphql-row');
  } else if (request.request.url.endsWith('/token')) {
    row.classList.add('token-row');
  } else if (request.request.url.endsWith('/access')) {
    row.classList.add('access-row');
  }

  // Rest of the existing row creation code...
  const { domain, path } = parseUrl(request.request.url);
  
  const domainCell = document.createElement('td');
  domainCell.textContent = domain;
  domainCell.className = 'domain';
  row.appendChild(domainCell);
  
  const pathCell = document.createElement('td');
  const truncatedPath = truncatePath(path);
  pathCell.className = 'path';
  
  let popupContent = '';
  if (isGraphQLRequest(request)) {
    const graphqlInfo = getGraphQLInfo(request);
    if (graphqlInfo) {
      // Display path with operation name
      pathCell.textContent = `${truncatedPath} ${graphqlInfo.operationName ? `(${graphqlInfo.operationName})` : '(unnamed)'}`;
      popupContent = graphqlInfo.payload;
    } else {
      pathCell.textContent = truncatedPath;
      popupContent = 'Unable to parse GraphQL payload';
    }
    pathCell.classList.add('has-popup');
  } else {
    pathCell.textContent = truncatedPath;
    if (path.length > 100) {
      popupContent = path;
      pathCell.classList.add('has-popup');
    }
  }

  if (popupContent) {
    pathCell.addEventListener('click', (e) => {
      const popup = document.getElementById('popup');
      const popupText = document.getElementById('popup-text');      
      popupText.textContent = popupContent;      
      popup.style.display = 'block';
      positionPopup(pathCell, popup);
      activeCell = pathCell;
      
      e.stopPropagation();
    });
  }  

  row.appendChild(pathCell);
  
  const methodCell = document.createElement('td');
  methodCell.textContent = request.request.method;
  row.appendChild(methodCell);
  
  const durationCell = document.createElement('td');
  durationCell.textContent = formatDuration(request.time);
  
  // Add duration-based highlighting
  if (request.time > 700) {
    durationCell.classList.add('duration-critical');
  } else if (request.time > 300) {
    durationCell.classList.add('duration-warning');
  }
  row.appendChild(durationCell);
  
  const timeCell = document.createElement('td');
  timeCell.textContent = new Date().toLocaleTimeString();
  row.appendChild(timeCell);

  const traceCell = document.createElement('td');
  const traceId = getDatadogTraceId(request);
  if (traceId) {
    const traceLink = document.createElement('button');
    traceLink.className = 'datadog-link';
    traceLink.textContent = '🔍 Trace';
    traceLink.onclick = () => {
      const url = `https://app.datadoghq.eu/apm/trace/${traceId}`;
      window.open(url, '_blank');
    };
    traceCell.appendChild(traceLink);
  }
  row.appendChild(traceCell);      
  
  row.style.display = shouldShowRequest(request, row) ? '' : 'none';
  table.appendChild(row);
});

// Update page time every second
setInterval(() => {
  if (paused) return;
  document.getElementById('page-time').textContent = 
    `${Math.floor((Date.now() - startTime) / 1000)}s`;
}, 1000);

// Rest of the event listener setup
document.addEventListener('DOMContentLoaded', () => {
  const clearButton = document.getElementById('clear-button');
  const pauseButton = document.getElementById('pause-button');
  const preserveLogCheckbox = document.getElementById('preserve-log');
  const table = document.querySelector('#requests-table tbody');

  // Modify the clear button handler to reset slow request stats
  clearButton.addEventListener('click', () => {
    table.innerHTML = '';
    stats = {
      graphql: { count: 0, totalTime: 0 },
      token: { count: 0, totalTime: 0 },
      access: { count: 0, totalTime: 0 },
      slow: { yellow: 0, red: 0, yellowTime: 0, redTime: 0 }
    };
    updateStats({ time: 0, request: { url: '' } });
  });

  pauseButton.addEventListener('click', () => {
    paused = !paused;
    pauseButton.textContent = paused ? 'Resume' : 'Pause';

  });

  preserveLogCheckbox.addEventListener('change', (e) => {
    preserveLog = e.checked;
    if (!preserveLog) {
      table.innerHTML = '';
    }
  });

  chrome.devtools.network.onNavigated.addListener(() => {
    if (!preserveLog) {
      const table = document.querySelector('#requests-table tbody');
      table.innerHTML = '';
      stats = {
        graphql: { count: 0, totalTime: 0 },
        token: { count: 0, totalTime: 0 },
        access: { count: 0, totalTime: 0 }
      };
    }
    // Reset page time regardless of preserve log setting
    startTime = Date.now();
    updateStats({ time: 0, request: { url: '' } });
  });

  const popup = document.getElementById('popup');
  const popupText = document.getElementById('popup-text');
  const popupCopy = document.getElementById('popup-copy');

  // Handle popup copy button
  popupCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(popupText.textContent)
      .then(() => {
        // Visual feedback
        popupCopy.textContent = 'Copied!';
        setTimeout(() => {
          popupCopy.textContent = 'Copy';
        }, 1000);
      })
      .catch(err => console.error('Failed to copy:', err));
  });

  // Close popup when clicking outside
  document.addEventListener('click', (e) => {
    if (!popup.contains(e.target) && 
        (!activeCell || !activeCell.contains(e.target))) {
      popup.style.display = 'none';
      if (activeCell) {
        activeCell = null;
      }
    }
  });

  // Prevent popup from closing when clicking inside it
  popup.addEventListener('click', (e) => {
    e.stopPropagation();
  });  

  const filterButtons = document.querySelectorAll('.filter-button');
  
  filterButtons.forEach(button => {
    button.addEventListener('click', () => {
      const filter = button.dataset.filter;
      
      if (filter === 'all') {
        // Clear all other filters when 'all' is clicked
        filterButtons.forEach(btn => {
          btn.classList.remove('active');
          if (btn.dataset.filter === 'all') {
            btn.classList.add('active');
          }
        });
        activeFilters.clear();
        activeFilters.add('all');
      } else {
        // Remove 'all' filter when any other filter is clicked
        const allButton = document.querySelector('[data-filter="all"]');
        allButton.classList.remove('active');
        activeFilters.delete('all');
        
        // Toggle this filter
        button.classList.toggle('active');
        if (button.classList.contains('active')) {
          activeFilters.add(filter);
        } else {
          activeFilters.delete(filter);
        }
        
        // If no filters are active, activate 'all'
        if (activeFilters.size === 0) {
          allButton.classList.add('active');
          activeFilters.add('all');
        }
      }
      
      // Update visibility of all rows
      const table = document.querySelector('#requests-table tbody');
      table.querySelectorAll('tr').forEach(row => {
        const requestData = row.requestData; // We'll store this when creating the row
        row.style.display = shouldShowRequest(requestData, row) ? '' : 'none';
      });
    });
  });  
});