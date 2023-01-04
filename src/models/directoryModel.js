class Directory {
    constructor(fileName, longName, mode, size, lastModified) {
        this.filename = fileName;
        this.longname = longName;
        this.attrs = {
            mode: mode,
            size: size,
            uid: '',
            gid: '',
            atime: '',
            mtime: lastModified ? new Date(lastModified).getTime() / 1000 : ''
        }
    }
}

module.exports = Directory;