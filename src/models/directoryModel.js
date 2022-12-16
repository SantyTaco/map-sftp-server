class Directory {
    constructor(fileName, longName, size) {
        this.filename = fileName;
        this.longname = longName;
        this.attrs = {
            mode: 0,
            size: size,
            uid: '',
            gid: '',
            atime: '',
            mtime: ''
        }
    }
}

module.exports = Directory;