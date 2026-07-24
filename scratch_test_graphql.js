const https = require('https');

const apiKey = '83e4dd01-9556-403f-a466-04ddc59f7e13';
const region = 'eu';
const orgId = 'df2788f8-ca81-4b96-a757-d3fbd3319951';

const graphqlQuery = {
  query: `
    query($orgId: String!) {
      organization(id: $orgId) {
        assets(first: 5) {
          edges {
            node {
              id
              platform
              publicIpAddress
              agent {
                id
                agentStatus
                agentSemanticVersion
                collector {
                  name
                }
                agentLastUpdateTime
              }
              host {
                id
                hostNames {
                  name
                }
                primaryAddress {
                  ip
                  mac
                }
                type
                vendor
                version
              }
            }
          }
        }
      }
    }
  `,
  variables: { orgId }
};

const req = https.request({
  hostname: `${region}.api.insight.rapid7.com`,
  port: 443,
  path: '/graphql',
  method: 'POST',
  headers: {
    'X-Api-Key': apiKey,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      console.log(JSON.stringify(JSON.parse(data), null, 2));
    } catch {
      console.log(data);
    }
  });
});

req.write(JSON.stringify(graphqlQuery));
req.end();
