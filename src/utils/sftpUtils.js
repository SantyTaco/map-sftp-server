const { timingSafeEqual } = require('crypto');
const { getDirectoryList, uploadFile } = require('../controllers/s3Controller');
const PATH = require('path');
const Directory = require('../models/directoryModel');
const fs = require('fs');
const { format } = require('path');

const MODE_FILE = fs.constants.S_IFREG | fs.constants.S_IRWXU | fs.constants.S_IRWXG | fs.constants.S_IRWXO;
const MODE_DIR = fs.constants.S_IFDIR | fs.constants.S_IRWXU | fs.constants.S_IRWXG | fs.constants.S_IRWXO;

const checkValue = (input, allowed) => {
    const autoReject = (input.length !== allowed.length);
    if (autoReject) {
      allowed = input;
    }
    const isMatch = timingSafeEqual(input, allowed);
    return (!autoReject && isMatch);
}

const  normalizePath = (path) => {
    if (path.startsWith('/')) {
        path = path.substring(1);
    }
    if (path.endsWith('.')) {
        path = path.substring(0, path.length - 1);
    }

    path = PATH.normalize(path);

    if (path === '.') {
        path = '';
    }
    if (path === '..') {
        path = '';
    }
    return path;
}

const getStatAttributes = async (path) =>  {
    let attrs = null;
    let dirPath = path + "/";

    if (dirPath === "/") {
        attrs = {
            "mode": MODE_DIR
        };
        return attrs;
    }
    dirPath = normalizePath(dirPath);
    try {
        const directoryList = await getDirectoryList(dirPath);
        let existFolder = false;

        if (directoryList.Contents.length != 0) {
            if(directoryList?.Contents[0].Key.toUpperCase() === dirPath.toUpperCase()) {
                existFolder = true;
            }
        }

        if (!existFolder && directoryList.CommonPrefixes.length != 0) {
            for(const directory of directoryList?.CommonPrefixes) {
                const folderNames = directory?.Prefix?.split('/');
                const lastFolderName = folderNames[folderNames?.length - 2];
                if(lastFolderName.toUpperCase() == dirPath.toUpperCase()) {
                    existFolder = true;
                    break;
                }
            }
        }

        if(!existFolder) {
            console.log(`Could not find ${dirPath}`);
            return null;
        }

        console.log(`"${dirPath}" is a directory!`)
         attrs = {
            "mode": MODE_DIR
        };
        return attrs;
    }
    catch (exc) {
        console.log(`STAT Error: ${exc}`);
        return null;
    }
}

const setFileNames = (directoryList, dirPath) => {
    const fileNames = [];
    const newDirPath = dirPath != '/' ? `${dirPath}` : '';

    directoryList?.Contents?.forEach(file => {
      const name = file.Key.trim();
      const newName = name.replace(`${newDirPath}`, '');

      if (newName) {
        const directory = new Directory(newName, newName, MODE_FILE, file.Size, file.LastModified);
        fileNames.push(directory);
      };
    });

    return fileNames;
  }

  const setFolderNames = (directoryList, dirPath) => {
    const folderNames = [];
    const newDirPath = dirPath != '/' ? `${dirPath}` : '';

    directoryList?.CommonPrefixes?.forEach(folder => {
        const name = folder.Prefix;
        const newName = name.replace(`${newDirPath}`,'');

        if(newName) {
          const folderName = newName.replace('/', '');
          const directory = new Directory(folderName, folderName, MODE_DIR, 0, '');
          folderNames.push(directory);
        }; 
      })

    return folderNames;
  }

  const execOperationByFlag = async (fileRecord) => {
    try {
        if (fileRecord?.flag === 'w' && fileRecord.readComplete) {
            const buffer = Buffer.concat(fileRecord.chunks);
            const uploadResponse = await uploadFile(fileRecord.path, buffer);
          }
    } catch (err) {
        throw err;
    }
  }
  
  const checkFlagRequest = (stringflags, handleCount, filename) => {
    const fileRecord =   {
      handle: handleCount,
      path: filename.replaceAll('\\', '/'),
    };
  
    if (stringflags === 'w') {
      fileRecord.chunks = [];
      fileRecord.readComplete = false;
      fileRecord.flag = stringflags;
    } 
    return fileRecord;
  }

  module.exports = { checkValue, normalizePath, setFileNames, setFolderNames, getStatAttributes, execOperationByFlag, checkFlagRequest };