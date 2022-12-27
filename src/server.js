const { readFileSync } = require('fs');
const { uploadFile, getDirectoryList } = require('./controllers/s3Controller');
const { checkValue, checkAuthnticationMethod, normalizePath, setFileNames, setFolderNames, getStatData } = require('./utils/sftpUtils');
const fs = require('fs');
const Directory = require('./models/directoryModel');
const path = require('path');
const ssh2 = require('ssh2');
const PATH = require('path');


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
    } // End of 
        sftp.on('OPEN', (reqid, filename, flags, attrs) => {
          console.log('OPEN')
          console.log('filename', filename);
          fileName = path.basename(filename);
          const handle = Buffer.alloc(4);
          
          const fileRecord = {
            "handle": handleCount,
            "path": filename,
            "readComplete": true // Have we completed our reading of data.
          };
          openFiles.set(handleCount, fileRecord);
          handle.writeUInt32BE(handleCount++, 0);
          sftp.handle(reqid, handle);
        }).on('WRITE', async (reqid, handle, offset, data) => {
          const fileRecord = getFileRecord(handle);
          console.log('fileRecord', fileRecord);
          const dirPath = fileRecord.path + "/";
          console.log('handle', handle);
          try {
            if (handle.length !== 4 || !openFiles.has(handle.readUInt32BE(0))) {
            return sftp.status(reqid, STATUS_CODE.FAILURE);
          }
          await uploadFile(bucketName, fileRecord.path, data);
          sftp.status(reqid, STATUS_CODE.OK);
          } catch(error) {
            return sftp.status(reqid, STATUS_CODE.FAILURE, error);
          }
        }).on('OPENDIR', async (reqId, path) => { 
          console.info('OPENDIR', path);
          path = normalizePath(path);
          console.log('path', path);

          if (path !== "") {
            try {
                const directoryList = await getDirectoryList(path);
                console.log('Content', directoryList);
                if (directoryList?.CommonPrefixes.length == 0) {
                    console.log(`we found no files/directories with directory: "${path}"`);
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
            "readComplete": false // Have we completed our reading of data.
          };

          openFiles.set(handle, fileRecord);
          const handleBuffer = Buffer.alloc(4);
          
          handleBuffer.writeUInt32BE(handle, 0);
          sftp.handle(reqId, handleBuffer);
        })
        .on('READDIR', async (reqid, handle) => {
          try {
            const fileRecord = getFileRecord(handle);
            const dirPath = fileRecord.path + "/";

            console.log('dirPath', dirPath);

            if (fileRecord === null) return sftpStream.status(reqid, STATUS_CODE.FAILURE);
            if (fileRecord.readComplete) return sftp.status(reqid, STATUS_CODE.EOF);
            fileRecord.readComplete = true;
            const directoryList = await getDirectoryList(dirPath);
            console.log('directoryList', directoryList);

            const fileNames = setFileNames(directoryList, dirPath) || [];
            const folderNames = setFolderNames(directoryList, dirPath) || [];

            console.log('fileNames', fileNames);
            console.log('folderNames', folderNames);
            
            fileRecord.readComplete = true;
            return sftp.name(reqid, fileNames.concat(folderNames));
          } catch(error) {
            console.log('Error', error);
            return sftp.status(reqid, STATUS_CODE.FAILURE);
          }
        })
        .on('REALPATH', (reqid, path) => {
          console.log('Returning', path);
          path = PATH.normalize(path);
                    if (path === '..') {
                        path = '/';
                    }
                    if (path === '.') {
                        path = '/';
                    }
          return sftp.name(reqid, [{ filename: path }]);
          
        }).on('STAT', async (reqId, path) => {
          console.log('Stat', path);
          commonStat(reqId, path);
      })
        
        .on('READLINK', (reqID, path) => {
          console.info('READLINK');
      }).on('SETSTAT', (reqID, path, attrs) => {
          console.info('SETSTAT');
      }).on('MKDIR', (reqID, path, attrs) => {
          console.info('MKDIR');
      }).on('RENAME', (reqID, oldPath, newPath) => {
          console.info('RENAME');
      }).on('SYMLINK', (reqID, linkpath, tagetpath) => {
          console.info('SYMLINK');
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