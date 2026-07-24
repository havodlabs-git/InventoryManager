const https = require('https');

const apiKey = '83e4dd01-9556-403f-a466-04ddc59f7e13';
const region = 'eu';

function requestEndpoint(method, path, body = null) {
  return new Promise((resolve) => {
    const options = {
      hostname: `${region}.api.insight.rapid7.com`,
      port: 443,
      path: path,
      method: method,
      headers: {
        'X-Api-Key': apiKey,
        'Accept': 'application/json'
      }
    };

    if (body) {
      options.headers['Content-Type'] = 'application/json';
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          path,
          method,
          statusCode: res.statusCode,
          body: data
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        path,
        method,
        error: err.message
      });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  const tests = [
    { method: 'GET', path: '/api/v1/agents' },
    { method: 'GET', path: '/agents' },
    { method: 'GET', path: '/agent/v1/agents' },
    { method: 'GET', path: '/agent-management/v1/agents' },
    { method: 'POST', path: '/agent/v1/agents/_search', body: {} },
    { method: 'POST', path: '/agent-management/v1/agents/_search', body: {} },
    { method: 'GET', path: '/idr/v1/agents' },
    { method: 'GET', path: '/idr/v1/endpoints' }
  ];

  for (const t of tests) {
    const res = await requestEndpoint(t.method, t.path, t.body);
    console.log(`${t.method} ${t.path} -> Status: ${res.statusCode}`, res.body ? `Body: ${res.body.substring(0, 150)}` : '');
  }
}

run();
