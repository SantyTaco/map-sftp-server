const { timingSafeEqual } = require('crypto');
const { getDirectoryList } = require('../controllers/s3Controller');
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

const checkAuthnticationMethod = (authenticationMethod, password, allowedPassword) => {
switch (authenticationMethod) {
    case 'password':
    if (!checkValue(Buffer.from(password), allowedPassword))
        return false;
        break;
    default:
    return false;
}

return true;
}

const  normalizePath = (path) => {
    const start = path;
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

const getStatData = async (path) =>  {
    if (path === "/") { // The root is a directory ... simple base/special case.
        const attrs = {
            "mode": MODE_DIR
        };
        return attrs;
    }
    path = normalizePath(path);
    try {
        const directoryList = await getDirectoryList(path);
        if (directoryList.CommonPrefixes.length != 0) {
            let existFolder = false;

            for(const directory of directoryList?.CommonPrefixes) {
                const folderNames = directory?.Prefix?.split('/');
                const lastFolderName = folderNames[folderNames?.length - 2];
                if(lastFolderName == path) {
                    existFolder = true;
                    break;
                }
            }
            if(!existFolder) {
                console.log(`Could not find ${path}`);
                return null;
            }
        }
        console.log(`"${path}" is a directory!`)
        const attrs = {
            "mode": MODE_DIR
        };
        return attrs;
    }
    catch (exc) {
        console.log(`STAT Error: ${exc}`);
        return null;
    }
    return null;
} // getStatData

const setFileNames = (directoryList, dirPath) => {
    const fileNames = [];
    const newDirPath = dirPath != '/' ? `${dirPath}` : '';

    console.log('newDirPath', newDirPath);

    directoryList?.Contents?.forEach(file => {
      const name = file.Key.trim();
      console.log('Name', name);
      const newName = name.replace(`TestFolder/${newDirPath}`, '');
      console.log('newName', newName);

      if (newName) {
        const directory = new Directory(newName, newName, MODE_FILE, file.Size);
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
        const newName = name.replace(`TestFolder/${newDirPath}`,'');

        if(newName) {
          const folderName = newName.replace('/', '');
          const directory = new Directory(folderName, folderName, MODE_DIR, 0);
          folderNames.push(directory);
        }; 
      })

    return folderNames;
  }

  module.exports = { checkValue, checkAuthnticationMethod, normalizePath, setFileNames, setFolderNames, getStatData };