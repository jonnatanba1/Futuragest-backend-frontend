const Minio = require('minio');
const client = new Minio.Client({
  endPoint: 'futuragest-minio-l3duin-871a82-5-252-52-113.sslip.io',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin'
});
client.listBuckets().then(console.log).catch(console.log);
