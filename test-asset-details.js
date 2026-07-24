const https = require('https');

const apiKey = '83e4dd01-9556-403f-a466-04ddc59f7e13';
const region = 'eu';
const rrn = 'rrn:uba:eu:df2788f8-ca81-4b96-a757-d3fbd3319951:asset:00BPUBM2XCBV';

const options = {
  hostname: `${region}.api.insight.rapid7.com`,
  port: 443,
  path: `/idr/v1/assets/${encodeURIComponent(rrn)}`,
  method: 'GET',
  headers: {
    'X-Api-Key': apiKey,
    'Accept': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log("STATUS:", res.statusCode);
    try {
      console.log(JSON.stringify(JSON.parse(data), null, 2));
    } catch {
      console.log(data);
    }
  });
});

req.on('error', (err) => {
  console.error("Error:", err.message);
});

req.end();
