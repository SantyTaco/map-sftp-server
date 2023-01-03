const { readFileSync } = require('fs');
const { uploadFile, getDirectoryList } = require('./controllers/s3Controller');
const { checkValue, normalizePath, setFileNames, setFolderNames, getStatData } = require('./utils/sftpUtils');
const userConfig = require('./config/userConfig');
const fs = require('fs');
const Directory = require('./models/directoryModel');
const ssh2 = require('ssh2');
const PATH = require('path');

const {utils: {sftp: {OPEN_MODE, STATUS_CODE}}} = ssh2;

const users = Object.keys(userConfig);
const bucketName = 'santytest';
let folderRootName = '';

new ssh2.Server({
  hostKeys: [{key:readFileSync('id_rsa'), passphrase:'welcome1'}]
}, (client) => {
  console.log('Client connected!');

  client.on('authentication', (ctx) => {
    try {
      let allowed = true;
     
      const allowedUser = users?.includes(ctx.username) ? Buffer.from(ctx.username) : Buffer.from('');
      const password = userConfig[`${ctx.username}`]?.password || '';
      const allowedPassword = Buffer.from(password);
      folderRootName = userConfig[`${ctx.username}`]?.folderName;
      if (!checkValue(Buffer.from(ctx.username), allowedUser)) allowed = false;

      switch (ctx.method) {
        case 'password':
          if (!checkValue(Buffer.from(ctx.password), allowedPassword))
            return ctx.reject();
          break;
        default:
          return ctx.reject();
      }

      allowed ? ctx.accept() : ctx.reject();
    } catch(err) {
      console.log("Error", err);
    }
    
  }).on('ready', () => {
    console.log('Client authenticated!');
    client.on('session', (accept, reject) => {
      const session = accept();

      session.on('sftp', (accept, reject) => {
        console.log('Client SFTP session');
        const openFiles = new Map();
        let handleCount = 0;
        const sftp = accept();

        function getFileRecord(handleBuffer) {
          if (handleBuffer.length !== 4) {
              console.log("ERROR: Buffer wrong size for 32bit BE integer");
              return null;
          }

          const handle = handleBuffer.readUInt32BE(0); // Get the handle of the file from the SFTP client.

          if (!openFiles.has(handle)) {
            console.log(`Unable to find file with handle ${handle}`);
            return null;
          }

          const fileRecord = openFiles.get(handle);
          return fileRecord;
        }

        async function commonStat(reqId, path) {
          const attrs = await getStatData(path);
          if (attrs === null) {
              return sftp.status(reqId, STATUS_CODE.NO_SUCH_FILE);
          }
          sftp.attrs(reqId, attrs);
        }

        sftp.on('OPEN', (reqid, filename, flags, attrs) => {
          const handle = Buffer.alloc(4);
          const fileRecord = {
            "handle": handleCount,
            "path": filename,
            "readComplete": true // Have we completed our reading of data.
          };

          openFiles.set(handleCount, fileRecord);
          handle.writeUInt32BE(handleCount++, 0);
          sftp.handle(reqid, handle);
        });

        sftp.on('WRITE', async (reqid, handle, offset, data) => {
          try {
            const fileRecord = getFileRecord(handle);

            if (handle.length !== 4 || !openFiles.has(handle.readUInt32BE(0))) return sftp.status(reqid, STATUS_CODE.FAILURE);
          
            await uploadFile(bucketName, fileRecord.path, data);
            sftp.status(reqid, STATUS_CODE.OK);
          } catch(error) {
            console.log('Error', error);
            return sftp.status(reqid, STATUS_CODE.FAILURE);
          }
        });

        sftp.on('OPENDIR', async (reqId, path) => {
          console.log('path', path)
          path = normalizePath(path);
          if (path !== "") {
            try {
                const directoryList = await getDirectoryList(path);

                if (directoryList?.CommonPrefixes.length == 0) {
                    console.log(`We did not find files/directories with directory: "${path}"`);
                    return sftp.status(reqId, STATUS_CODE.NO_SUCH_FILE);
                }
            } catch (ex) {
                console.log(`Exception:`, ex);
                return sftp.status(reqId, STATUS_CODE.FAILURE);
            }
          }

          const handle = handleCount;
          handleCount = handleCount + 1;

          const fileRecord = {
            "handle": handle,
            "path": path,
            "readComplete": false
          };

          openFiles.set(handle, fileRecord);
          const handleBuffer = Buffer.alloc(4);
          
          handleBuffer.writeUInt32BE(handle, 0);
          sftp.handle(reqId, handleBuffer);
        });

        sftp.on('READDIR', async (reqid, handle) => {
          try {
            const fileRecord = getFileRecord(handle);
            const dirPath = fileRecord.path + "/";

            if (fileRecord === null) return sftpStream.status(reqid, STATUS_CODE.FAILURE);
            if (fileRecord.readComplete) return sftp.status(reqid, STATUS_CODE.EOF);

            fileRecord.readComplete = true;
            const directoryList = await getDirectoryList(dirPath);
            const fileNames = setFileNames(directoryList, dirPath) || [];
            const folderNames = setFolderNames(directoryList, dirPath) || [];
            
            fileRecord.readComplete = true;
            return sftp.name(reqid, fileNames.concat(folderNames));
          } catch(error) {
            console.log('Error', error);
            return sftp.status(reqid, STATUS_CODE.FAILURE);
          }
        });

        sftp.on('REALPATH', (reqid, path) => {
          console.log('Returning', path);
          path = PATH.normalize(path);
                    if (path === '..') {
                        path = folderRootName;
                    }
                    if (path === '.') {
                        path = folderRootName;
                    }
          return sftp.name(reqid, [{ filename: path }]);
          
        });

        sftp.on('STAT', async (reqId, path) => {
          commonStat(reqId, path);
        });

        sftp.on('CLOSE', (reqid, handle) => {
          console.log('Close');
          let fnum;

          if (handle.length !== 4
              || !openFiles.has(fnum = handle.readUInt32BE(0))) {
            return sftp.status(reqid, STATUS_CODE.FAILURE);
          }
          console.log('Closing file');
          openFiles.delete(fnum);
          sftp.status(reqid, STATUS_CODE.OK);
        });
      }).on('end', () =>{
        console.log('Client end');
        client.end();
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