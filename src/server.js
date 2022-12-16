const { readFileSync } = require('fs');
const { uploadFile, getDirectoryList } = require('./controllers/s3Controller');
const { checkValue, checkAuthnticationMethod } = require('./utils/sftpUtils');
const Directory = require('./models/directoryModel');
const path = require('path');
const ssh2 = require('ssh2');

const {utils: {sftp: {OPEN_MODE, STATUS_CODE}}} = ssh2;
const allowedUser = Buffer.from('foo');
const allowedPassword = Buffer.from('bar');
const bucketName = 'santytest';
let fileName = '';
let readDirPath = '/';


new ssh2.Server({
  hostKeys: [{key:readFileSync('id_rsa'), passphrase:'welcome1'}]
}, (client) => {
  console.log('Client connected!');

  client.on('authentication', (ctx) => {
    let allowed = true;

    if (!checkValue(Buffer.from(ctx.username), allowedUser)) allowed = false;
    allowed = checkAuthnticationMethod(ctx.method, ctx.password, allowedPassword);
    allowed ? ctx.accept() : ctx.reject();
  }).on('ready', () => {
    console.log('Client authenticated!');
    client.on('session', (accept, reject) => {
      const session = accept();

      session.on('sftp', (accept, reject) => {
        console.log('Client SFTP session');
        const openFiles = new Map();
        let handleCount = 0;
        const sftp = accept();

        sftp.on('OPEN', (reqid, filename, flags, attrs) => {
          console.log('OPEN')
          fileName = path.basename(filename);
          const handle = Buffer.alloc(4);

          openFiles.set(handleCount, true);
          handle.writeUInt32BE(handleCount++, 0);
          sftp.handle(reqid, handle);
        }).on('WRITE', async (reqid, handle, offset, data) => {
          if (handle.length !== 4
              || !openFiles.has(handle.readUInt32BE(0))) {
            return sftp.status(reqid, STATUS_CODE.FAILURE);
          }
          await uploadFile(bucketName, fileName, data);
          sftp.status(reqid, STATUS_CODE.OK);
          
        }).on('OPENDIR', (reqID, path) => { 
          console.info('OPENDIR', path);
          readDirPath = path;
          const handle = Buffer.alloc(4);

          openFiles.set(handleCount, true);
          handle.writeUInt32BE(handleCount++, 0);
          sftp.handle(reqID, handle);
        }).on('READDIR', async (reqID, handle) => {
          if (handle.length !== 4 ) {
            return sftp.status(reqid, STATUS_CODE.FAILURE);
          }
          const directory = await getDirectoryList(readDirPath);
          console.log('DIREVTORY', directory);
          const directoryNames = directory?.Contents?.map((item) => {
            const directory = new Directory(item.Key, item.Key, item.Size);
            return directory;
          });


          console.log('directoryNames', directoryNames);
          sftp.name(reqID, directoryNames);
        }).on('CLOSE', (reqid, handle) => {
          let fnum;

          if (handle.length !== 4
              || !openFiles.has(fnum = handle.readUInt32BE(0))) {
            return sftp.status(reqid, STATUS_CODE.FAILURE);
          }
          console.log('Closing file');
          openFiles.delete(fnum);
          sftp.status(reqid, STATUS_CODE.OK);
        });
      });
    });
  }).on('close', () => {
    console.log('Client disconnected');
  }).on('error', (err) => {
    console.error(`A client error occurred from ${err}`);
});
}).listen(8070, function() {
  console.log('Listening on port ' + this.address().port);
});