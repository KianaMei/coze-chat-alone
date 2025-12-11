const https = require('https');

https.get('https://www.coze.cn/open/docs/developer_guides/list_message', {
  headers: {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
}).on('error', (e) => console.error(e));
