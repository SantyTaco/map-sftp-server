class Directory {
    constructor(fileName, longName, mode, size) {
        this.filename = fileName;
        this.longname = longName;
        this.attrs = {
            mode: mode,
            size: size,
            uid: '',
            gid: '',
            atime: '',
            mtime: ''
        }
    }
}

module.exports = Directory;