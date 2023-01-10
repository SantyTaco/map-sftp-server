const { readFileSync } = require('fs');
const { uploadFile, getDirectoryList } = require('./controllers/s3Controller');
const { checkValue, normalizePath, setFileNames, setFolderNames, getStatAttributes, execOperationByFlag, checkFlagRequest } = require('./utils/sftpUtils');
const userConfig = require('./config/userConfig');
const ssh2 = require('ssh2');
const { SFTPStream } = require('ssh2-streams');
const PATH = require('path');
const fs = require('fs');

const {utils: {sftp: { OPEN_NODE, STATUS_CODE }}} = ssh2;

const users = Object.keys(userConfig);
let folderRootName = '';
const bufferSize = 4;

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
      folderRootName = userConfig[`${ctx.username}`]?.folderRootName;
      if (!checkValue(Buffer.from(ctx.username), allowedUser)) allowed = false;

      switch (ctx.method) {
        case 'none':
          if (allowedUser.length !== 0 || allowedPassword.length !== 0 || allowedPubKey !== null) {
              return ctx.reject(['password', 'publickey'], true);
          }
          return ctx.accept();
        case 'password':
          if (!checkValue(Buffer.from(ctx.password), allowedPassword)) return ctx.reject();
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
          if (handleBuffer.length !== bufferSize) {
              console.log("ERROR: Buffer wrong size for 32bit BE integer");
              return null;
          }

          const handle = handleBuffer.readUInt32BE(0);

          if (!openFiles.has(handle)) {
            console.log(`Unable to find file with handle ${handle}`);
            return null;
          }

          const fileRecord = openFiles.get(handle);
          return fileRecord;
        }

        async function commonStat(reqId, path) {
          const attrs = await getStatAttributes(path);
          if (attrs === null) {
              return sftp.status(reqId, STATUS_CODE.NO_SUCH_FILE);
          }
          sftp.attrs(reqId, attrs);
        }

        sftp.on('OPEN', async (reqid, filename, flags, attrs) => {
          console.log('OPEN', filename);
          const stringflags = SFTPStream.flagsToString(flags);

          const fileRecord = checkFlagRequest(stringflags, handleCount, filename);
          openFiles.set(handleCount, fileRecord);
          const handleBuffer = Buffer.alloc(bufferSize);
          handleBuffer.writeUInt32BE(handleCount++, 0);
          sftp.handle(reqid, handleBuffer);
        });

        sftp.on('WRITE', async (reqid, handle, offset, data) => {
          console.log('Write');
          try {
            const fileRecord = getFileRecord(handle);
            console.log('Write fileRecord', fileRecord);
            fileRecord.chunks.push(data);
            if (handle.length !== bufferSize || !openFiles.has(handle.readUInt32BE(0))) return sftp.status(reqid, STATUS_CODE.FAILURE);
            fileRecord.readComplete = true;
            sftp.status(reqid, STATUS_CODE.OK);
          } catch(error) {
            console.log('Error', error);
            return sftp.status(reqid, STATUS_CODE.FAILURE);
          }
        });

        sftp.on('OPENDIR', async (reqId, path) => {
          console.log('OPENDIR');
          path = normalizePath(path.replaceAll('\\', '/'));
          if (path !== "") {
            try {
                const directoryList = await getDirectoryList(path);

                if (directoryList?.CommonPrefixes.length == 0) {
                    console.log(`No files/directories found: "${path}"`);
                    return sftp.status(reqId, STATUS_CODE.NO_SUCH_FILE);
                }
            } catch (ex) {
                console.log(`Exception:`, ex);
                return sftp.status(reqId, STATUS_CODE.FAILURE);
            }
          }

          const fileRecord = {
            handle: handleCount,
            path: path,
            readComplete: false
          };

          openFiles.set(handleCount, fileRecord);
          const handleBuffer = Buffer.alloc(bufferSize);
          handleBuffer.writeUInt32BE(handleCount++, 0);
          sftp.handle(reqId, handleBuffer);
        });

        sftp.on('READDIR', async (reqid, handle) => {
          console.log('READDIR');
          try {
            const fileRecord = getFileRecord(handle);
            const dirPath = fileRecord.path + "/";

            if (fileRecord === null) return sftpStream.status(reqid, STATUS_CODE.FAILURE);
            if (fileRecord.readComplete) return sftp.status(reqid, STATUS_CODE.EOF);

            //fileRecord.readComplete = true;
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
          console.log('REALPATH', path);
          path = PATH.normalize(path);
          if (path === '..' || path === '.') path = folderRootName;
                   
          return sftp.name(reqid, [{ filename: path }]);
        });

        sftp.on('STAT', async (reqId, path) => {
          console.log('STAT', path) ;
          commonStat(reqId, path.replaceAll('\\', '/'));
        });

        sftp.on('CLOSE', async (reqid, handle) => {
          try {
            console.log('Close');
            const fileRecord = getFileRecord(handle);
            let fnum;
  
            if (handle.length !== 4 || !openFiles.has(fnum = handle.readUInt32BE(0))) return sftp.status(reqid, STATUS_CODE.FAILURE);
            await execOperationByFlag(fileRecord);
            console.log('Closing file');
            openFiles.delete(fnum);
            sftp.status(reqid, STATUS_CODE.OK);
          } catch (err) {
            console.log('Error:', err);
            sftp.status(reqid, STATUS_CODE.FAILURE);
          }
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
